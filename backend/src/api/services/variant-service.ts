import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { StatsOperations } from '@operations/client/StatsOperations'
import { findStockChanges, recordManualStockMovements, stockDirtyFields } from '@operations/stock/markStockDirty'
import { stripEngineOwnedVariantFields } from './product-service'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'

/**
 * [DB-07 / DBR-09] Bu servisin TÜM varyant okuma/yazmaları kanonik `Variants` koleksiyonuna (getVariantModel) gider.
 * Eski gömülü `Product.variants` dizisi şemada yoktur (client/models/Product.ts) ve yedekte hiç yazılmamıştır; o yola
 * yazan kod kaldırıldı. Yazma kuralları ProductService ile aynıdır: motor-sahipli alanlar (reserved/allocations/
 * stockVersion/stockDirty) gövdeden atılır, stok değişince stockDirty işaretlenir (X2), variantHash yeniden hesaplanır.
 */
const toObjectId = (v: any) => (v instanceof ObjectId ? v : new ObjectId(String(v)))
const hashChoices = (maincode: any, choices: any) => {
    const normalized = maincode + '|' + (choices || []).slice().sort((a: any, b: any) => String(a.choiceId).localeCompare(String(b.choiceId))).map((c: any) => `${c.choiceId}:${c.choiceValueId}`).join('|')
    return crypto.createHash('sha256').update(normalized).digest('hex')
}

export default class VariantService extends BaseApi implements IService {
    choices: any = undefined

    async get(): Promise<any> {
    }

    async getVariants(): Promise<any> {
        try {
            // FE sözleşmesi: girdi `_id` = ürün id; yanıt varyant dizisi.
            if (!this.request._id) return undefined
            return await this.clientDB.getVariantModel().find({ productId: toObjectId(this.request._id) }).lean()
        } catch (error) {
            throw error
        }
    }

    /** FE (5 bileşen) `VariantService/getVariantsList` çağırır: `{ variants: [{ _id, title }] }` bekler (açılır liste). */
    async getVariantsList(): Promise<any> {
        if (!this.request._id) return { variants: [] }
        const rows: any[] = await this.clientDB.getVariantModel()
            .find({ productId: toObjectId(this.request._id) }, { _id: 1, title: 1, stockcode: 1, barcode: 1, choices: 1 }).lean()
        return {
            variants: (rows || []).map((v: any) => ({
                _id: v._id,
                title: v.title || v.stockcode || String(v._id),
                stockcode: v.stockcode,
                barcode: v.barcode,
                choices: v.choices,
            })),
        }
    }

    /** Varyant eklenirken variantHash için ürünün maincode'u gerekir. */
    private async getProductMaincode(productId: any): Promise<string | undefined> {
        const p: any = await this.clientDB.getProductModel().findOne({ _id: productId }).select('maincode').lean()
        return p?.maincode
    }

    private async afterVariantWrite(productId: any): Promise<void> {
        await this.updateProductStock(productId)
        await this.updateProductPrices(productId)
        const statsOperations = new StatsOperations(this.clientDB)
        await statsOperations.markStatsAsDirty()
    }

    //TODO BASKA BIR YOL DUSUNULECEK
    async getIntegrations(): Promise<any> {
        try {
            const filterQuery = {}
            const projection = { settings: 0 }
            // [BULGU DÜZELTMESİ, 2026-09-29, ADR-0016 B-R-T1] `.populate('type')` eksikti (ProductService.getIntegrations'ın
            // aksine) -> `item.type.code` erişimi hep undefined dönüyordu; `find(filterQuery, projection)` ikinci argümanı
            // DOĞRUDAN alan-seçim nesnesidir (bkz. tests/mongo-semantics/integrationProjectionShape.mongoSemantics.test.ts).
            return await this.applicationDB.getIntegrationModel().find(filterQuery, projection).populate('type')
        } catch (error) {
            throw error
        }
    }

    async getChoices(): Promise<any> {
        try {
            if (this.choices == undefined) {
                const filterQuery = {}
                const choices = await this.clientDB.getChoiceModel().find(filterQuery, {})
                this.choices = choices
            }
        } catch (error) {
            throw error
        }
        return this.choices
    }

    /** Toplu güncelleme `$set` gövdesi (Variants belgesi üzerinde nokta yolları; tanımsız alanlar ATLANIR). `scope` yol biçimini etkilemez. */
    async constructUpdateQuery(_scope: any, batchProcessForm: any) {
        const updateQuery: any = {}
        if (batchProcessForm == undefined) return updateQuery

        if (batchProcessForm.stock != undefined) updateQuery['stock'] = batchProcessForm.stock
        if (batchProcessForm.shelf != undefined) updateQuery['shelf'] = batchProcessForm.shelf

        const prices = batchProcessForm.prices
        if (prices) {
            if (prices.marketPrice != undefined) updateQuery['prices.marketPrice'] = prices.marketPrice
            if (prices.salePrice != undefined) updateQuery['prices.salePrice'] = prices.salePrice
            if (prices.isPlatformBasedPrice != undefined) updateQuery['prices.isPlatformBasedPrice'] = prices.isPlatformBasedPrice

            const integrations = await this.getIntegrations()
            for (const integration of integrations.filter((item: any) => item.type.code == 'marketplace' || item.type.code == 'ecommerce')) {
                const ip = prices[integration.code]
                if (ip == undefined) continue
                // Kanal fiyatı Variants'ta platforms.<kod>.prices altında tutulur
                if (ip.marketPrice != undefined) updateQuery[`platforms.${integration.code}.prices.marketPrice`] = ip.marketPrice
                if (ip.salePrice != undefined) updateQuery[`platforms.${integration.code}.prices.salePrice`] = ip.salePrice
            }
        }
        return updateQuery
    }

    private variantScopeFilter(): any {
        const filter: any = { productId: toObjectId(this.request.productId) }
        if (this.request.scope == 0 || this.request.scope == 1) {
            filter._id = { $in: (this.request.selectedVariants || []).map(toObjectId) }
        }
        return filter
    }

    async batchProcessUpdate(): Promise<any> {
        try {
            const set: any = await this.constructUpdateQuery(this.request.scope, this.request.batchProcessForm)
            if (Object.keys(set).length === 0) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 }
            // stok değişiyorsa yayın için işaretle (X2 tek kapı)
            let stockChanges: any[] = []
            if (set.stock !== undefined) {
                Object.assign(set, stockDirtyFields())
                // [ADR-0021 D14] hareket defteri için önce değer (kapsam ≤ tek ürünün varyantları; 5000 üst sınır)
                const nextStock = Number(set.stock)
                if (Number.isFinite(nextStock)) {
                    try { // best-effort: defter okuması başarısızsa toplu güncelleme ETKİLENMEZ (hareket yazılmaz)
                        const prior: any[] = await this.clientDB.getVariantModel().find(this.variantScopeFilter(), { stock: 1, reserved: 1, stockcode: 1, barcode: 1 }).limit(5000).lean()
                        stockChanges = (prior || []).filter((p) => Number(p.stock ?? 0) !== nextStock)
                            .map((p) => ({ variantId: String(p._id), before: Number(p.stock ?? 0), after: nextStock, reserved: Number(p.reserved ?? 0), sku: p.stockcode || p.barcode }))
                    } catch { stockChanges = [] }
                }
            }
            const result = await this.clientDB.getVariantModel().updateMany(this.variantScopeFilter(), { $set: set })
            if (stockChanges.length > 0) recordManualStockMovements(this.clientDB, stockChanges, this.request)
            await this.afterVariantWrite(this.request.productId)
            return result
        } catch (error) {
            throw error
        }
    }

    async batchProcessDelete(): Promise<any> {
        try {
            const result: any = await this.clientDB.getVariantModel().deleteMany(this.variantScopeFilter())
            await this.afterVariantWrite(this.request.productId)
            // FE `modifiedCount > 0` bekler
            return { ...result, modifiedCount: result?.deletedCount ?? 0 }
        } catch (error) {
            throw error
        }
    }

    async addVariant(): Promise<any> {
        try {
            const productId = toObjectId(this.request.productId)
            const maincode = await this.getProductMaincode(productId)
            if (maincode === undefined) return { acknowledged: false, modifiedCount: 0 }

            const doc = stripEngineOwnedVariantFields(this.request.variant)
            delete doc._id
            doc.productId = productId
            doc.variantHash = hashChoices(maincode, doc.choices)

            let resp: any
            try {
                const created = await this.clientDB.getVariantModel().create(doc)
                resp = { acknowledged: true, insertedId: (created as any)?._id, modifiedCount: 1 }
            } catch (error: any) {
                if (error?.code === 11000) return { acknowledged: false, modifiedCount: 0, error: 'DUPLICATE_VARIANT' }
                throw error
            }
            await this.afterVariantWrite(productId)
            return resp
        } catch (error) {
            throw error
        }
    }

    async updateProductStock(productId: any): Promise<any> {
        try {
            const stockAgg = await this.clientDB.getVariantModel().aggregate([
                { $match: { productId: toObjectId(productId) } },
                {
                    $group: {
                        _id: null,
                        totalStock: { $sum: '$stock' }
                    }
                }
            ]);

            const totalStock = stockAgg[0]?.totalStock ?? 0;

            // 2. Product belgesini güncelle
            await this.clientDB.getProductModel().updateOne(
                { _id: productId },
                { $set: { stock: totalStock } }
            );
            return true
        } catch (error) {
            throw error
        }
    }

    async updateProductPrices(productId: any): Promise<any> {
        try {
            const findMinimumSalePrice = (platforms: any) => {
                const res = Object.values(platforms).reduce((min: any, platform: any) =>
                    platform.prices && platform.prices.salePrice && platform.prices.salePrice < min ? platform.prices.salePrice : min, Infinity);
                if (res == Infinity) return 0
                return Number(res)
            }
            const findMaximumSalePrice = (platforms: any) => {
                return Number(Object.values(platforms).reduce((max: any, platform: any) =>
                    platform.prices && platform.prices.salePrice && platform.prices.salePrice > max ? platform.prices.salePrice : max, 0))
            }


            const getOverallMinMaxPrices = (variants: any) => {
                let minSalePrice = Infinity
                let maxSalePrice = 0
                if (variants.length == 0) {
                    return { minSalePrice: 0, maxSalePrice: 0 }
                }

                for (const variant of variants) {
                    var saleMin = 0
                    var saleMax = 0

                    const platforms = variant.platforms

                    if (variant.prices?.isPlatformBasedPrice == false) {
                        saleMin = variant.prices.salePrice
                        saleMax = variant.prices.salePrice
                    } else {
                        saleMin = findMinimumSalePrice(platforms)
                        saleMax = findMaximumSalePrice(platforms)
                    }

                    if (saleMin < minSalePrice) minSalePrice = saleMin
                    if (saleMax > maxSalePrice) maxSalePrice = saleMax
                }
                minSalePrice === Infinity ? 0 : minSalePrice
                return {
                    minSalePrice,
                    maxSalePrice
                }
            }

            const variants = await this.clientDB.getVariantModel().find(
                { productId: toObjectId(productId) }
            ).lean()

            const prices = getOverallMinMaxPrices(variants)

            // 2. Product belgesini güncelle
            await this.clientDB.getProductModel().updateOne(
                { _id: productId },
                { $set: { prices: prices } }
            );
            return true

        } catch (error) {
            throw error
        }
    }

    async updateVariants(): Promise<any> {
        try {
            const productId = toObjectId(this.request.productId)
            const maincode = await this.getProductMaincode(productId)
            const incoming: any[] = this.request.variants || []
            const stockChanges = await findStockChanges(this.clientDB.getVariantModel(), incoming)
            const stockChanged = { has: (id: string) => stockChanges.has(id) }
            const dirtyNow = stockDirtyFields()
            const bulkOperations = incoming.map((original: any) => {
                const v = stripEngineOwnedVariantFields(original)
                const id = v._id
                delete v._id
                delete v.productId
                if (maincode !== undefined && Array.isArray(v.choices)) v.variantHash = hashChoices(maincode, v.choices)
                if (stockChanged.has(String(id))) Object.assign(v, dirtyNow)
                return { updateOne: { filter: { _id: toObjectId(id), productId }, update: { $set: v } } }
            })

            const result = await this.clientDB.getVariantModel().bulkWrite(bulkOperations)
            recordManualStockMovements(this.clientDB, stockChanges.values(), this.request) // [ADR-0021 D14] hareket defteri (asenkron)
            await this.afterVariantWrite(productId)
            return result
        } catch (error) {
            throw error
        }
    }


    generateCombinations1 = (variantChoices: any) => {
        const keys = Object.keys(variantChoices);
        const combinations: any = [];

        const generate = (currentCombination: any, index: any) => {
            if (index === keys.length) {
                combinations.push(currentCombination);
                return;
            }
            const key = keys[index];
            const array = variantChoices[key];
            for (let item of array) {
                generate({ ...currentCombination, [key]: item }, index + 1);
            }
        }
        generate({}, 0);
        return combinations;
    }


    async prepareCandidateArray(productId: string): Promise<any> {
        try {

            var match: any = { $and: [{ productId: productId }] }
            let variantChoicesOr: any = { $or: [] }
            for (let variantChoiceArray of this.request.variantChoices) {
                let variantChoiceAnd: any = { $and: [] }
                for (let variantChoice of variantChoiceArray) {
                    variantChoiceAnd.$and.push({ choices: { $elemMatch: { choiceId: variantChoice.choiceId, choiceValueId: variantChoice.choiceValueId } } })
                }
                variantChoicesOr.$or.push(variantChoiceAnd)
            }
            match.$and.push(variantChoicesOr)
            const candidateArray = []
            for (const variantChoice of this.request.variantChoices) {
                let flag = false
                if (!flag) candidateArray.push(variantChoice)
            }
            return candidateArray
        } catch (error) {
            throw error
        }
    }


    async addVariants(): Promise<any> {
        try {
            let variantsChoiceCombinations = await this.prepareCandidateArray(this.request.productId) //this.generateCombinations(this.request.variantChoices)
            let singleVariant = this.request.singleVariant

            let candidateVariants: any = []
            delete singleVariant.choices

            if (!singleVariant.prices.isPlatformBasedPrice) singleVariant.prices.isPlatformBasedPrice = false
            for (let variantChoiceCombination of variantsChoiceCombinations) {
                candidateVariants.push({
                    stockcode: '', stock: 0, order: 0, choices: variantChoiceCombination, ...singleVariant
                })
            }

            const productId = toObjectId(this.request.productId)
            const maincode = await this.getProductMaincode(productId)
            if (maincode === undefined) return { acknowledged: false, modifiedCount: 0 }

            const docs = candidateVariants.map((cv: any) => {
                const d = stripEngineOwnedVariantFields(cv)
                d.productId = productId
                d.variantHash = hashChoices(maincode, d.choices)
                return d
            })

            let resp: any
            try {
                const inserted: any[] = await this.clientDB.getVariantModel().insertMany(docs)
                // FE `modifiedCount == 1` bekler (eski tek-$push sözleşmesi): en az bir ekleme = 1; gerçek adet insertedCount'ta
                resp = { acknowledged: true, insertedCount: inserted.length, modifiedCount: inserted.length > 0 ? 1 : 0 }
            } catch (error: any) {
                if (error?.code === 11000) return { acknowledged: false, modifiedCount: 0, error: 'DUPLICATE_VARIANT' }
                throw error
            }
            await this.afterVariantWrite(productId)
            return resp
        } catch (error) {
            throw error
        }
    }


    async deleteVariant(): Promise<any> {
        try {
            const resp = await this.clientDB.getVariantModel().deleteOne(
                { _id: this.request.variantId }
            );

            // 🔥 VARYANT SİLİNDİ: İstatistikleri (Total Count, Stock ve Platform Statuses) kirlet
            if (resp.deletedCount > 0) {
                const statsOperations = new StatsOperations(this.clientDB);
                statsOperations.markStatsAsDirty();
            }

            return resp;
        } catch (error) {
            throw error;
        }
    }

}

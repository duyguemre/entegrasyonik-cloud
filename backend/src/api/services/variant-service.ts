import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { StatsOperations } from '@operations/client/StatsOperations'

export default class VariantService extends BaseApi implements IService {
    choices: any = undefined


    currentClientId: any

    constructor(clientId: number, protected request: any) {
        super(clientId, request)
        this.currentClientId = clientId
    }


    async get(): Promise<any> {
    }


    async getVariants(): Promise<any> {
        try {
            const filterQuery = { _id: this.request._id }
            const response = await this.clientDB.getProductModel().findOne(filterQuery).select("_id variants").lean()

            if (response) return response.variants
            return undefined
        } catch (error) {
            throw error
        }
    }



    //TODO BASKA BIR YOL DUSUNULECEK
    async getIntegrations(): Promise<any> {
        try {
            const filterQuery = {}
            const projection = { settings: 0 }
            // [BULGU DÜZELTMESİ, 2026-09-29, ADR-0016 B-R-T1] `.populate('type')` eksikti (ProductService.getIntegrations'ın
            // aksine, bkz. product-service.ts aynı metot) -> aşağıdaki constructMatchQuery/constructUpdateQuery'nin
            // `item.type.code` erişimi hep undefined dönüyor, marketplace/ecommerce filtresi HER ZAMAN boş kalıyor,
            // min/max fiyat aramasında {$or:[]} üretilip gerçek Mongo'da "must be a nonempty array" hatasıyla patlıyordu.
            return await this.applicationDB.getIntegrationModel().find(filterQuery, { projection }).populate('type')
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

    async constructMatchQuery(searchVariantForm: any) {
        var searchMatch: any = []
        if (searchVariantForm == undefined) return searchMatch
        if (searchVariantForm.shelf) {
            searchMatch.push({ 'shelf': searchVariantForm.shelf })
        }
        if (searchVariantForm.isPlatformBasedPrice == undefined || searchVariantForm.isPlatformBasedPrice == 0) {
        } else if (searchVariantForm.isPlatformBasedPrice == 2) {
            searchMatch.push({ 'isPlatformBasedPrice': true })
        } else {
            searchMatch.push({ 'isPlatformBasedPrice': false })
        }
        if (searchVariantForm.stockcode) {
            searchMatch.push({ 'stockcode': searchVariantForm.stockcode })
        }
        if (searchVariantForm.stock) {
            searchMatch.push({ 'stock': searchVariantForm.stock })
        }
        if (searchVariantForm.barcode) {
            searchMatch.push({ 'barcode': searchVariantForm.barcode })
        }

        if (searchVariantForm.choices) {
            for (let choice of searchVariantForm.choices) {
                if (choice.choiceValueIds.length > 0)
                    searchMatch.push({ choices: { $elemMatch: { choiceId: choice.choiceId, choiceValueId: { $in: choice.choiceValueIds } } } })

                /*                     searchMatch.push({ ['choices.' + choice.choiceId]: { $in: choice.choiceValueIds } }) */
            }
        }

        let integrations = await this.getIntegrations()
        let priceArray: any = []
        if (searchVariantForm.min != undefined) {
            for (let integration of integrations.filter((item: any) => item.type.code == 'marketplace' || item.type.code == 'ecommerce')) {
                priceArray.push({ [integration.code + '.marketPrice']: { $gte: searchVariantForm.min } })
                priceArray.push({ [integration.code + '.costPrice']: { $gte: searchVariantForm.min } })
            }
        }
        if (searchVariantForm.max != undefined) {
            for (let integration of integrations.filter((item: any) => item.type.code == 'marketplace' || item.type.code == 'ecommerce')) {
                priceArray.push({ [integration.code + '.marketPrice']: { $lte: searchVariantForm.max } })
                priceArray.push({ [integration.code + '.costPrice']: { $lte: searchVariantForm.max } })
            }
        }
        if (searchVariantForm.min || searchVariantForm.max)
            searchMatch.push({ $or: priceArray })

        return searchMatch
    }





    async constructUpdateQuery(scope: any, batchProcessForm: any) {
        var updateQuery: any = {}
        if (batchProcessForm == undefined) return updateQuery

        if (batchProcessForm.stock != undefined) {
            if (scope == 2)
                updateQuery['variants.$[].stock'] = batchProcessForm.stock
            else
                updateQuery['variants.$[elem].stock'] = batchProcessForm.stock
        }
        if (batchProcessForm.shelf != undefined) {
            if (scope == 2)
                updateQuery['variants.$[].shelf'] = batchProcessForm.shelf
            else
                updateQuery['variants.$[elem].shelf'] = batchProcessForm.shelf
        }

        let integrations = await this.getIntegrations()
        let priceObject: any = { prices: {} }
        priceObject.prices.marketPrice = batchProcessForm.prices.marketPrice
        priceObject.prices.salePrice = batchProcessForm.prices.salePrice
        priceObject.prices.isPlatformBasedPrice = batchProcessForm.prices.isPlatformBasedPrice
        for (let integration of integrations.filter((item: any) => item.type.code == 'marketplace' || item.type.code == 'ecommerce')) {
            if (batchProcessForm.prices[integration.code] != undefined) {
                if (batchProcessForm.prices[integration.code].marketPrice != undefined) {
                    priceObject.prices[integration.code] = {}
                    priceObject.prices[integration.code].marketPrice = batchProcessForm.prices[integration.code].marketPrice
                }
                if (batchProcessForm.prices[integration.code].salePrice != undefined) {
                    if (priceObject.prices[integration.code] == undefined) priceObject.prices[integration.code] = {}
                    priceObject.prices[integration.code].salePrice = batchProcessForm.prices[integration.code].salePrice
                }
            }
        }

        if (scope == 2) {
            priceObject['variants.$[].prices'] = priceObject.prices
            delete priceObject.prices
        }
        else {
            priceObject['variants.$[elem].prices'] = priceObject.prices
            delete priceObject.prices
        }

        return { ...updateQuery, ...priceObject }
    }

    async batchProcessUpdate(): Promise<any> {
        try {
            const filterQuery: any = { $and: [{ _id: this.request.productId }] }
            var arrayFilter: any = {}
            let updateQuery: any = await this.constructUpdateQuery(this.request.scope, this.request.batchProcessForm)
            switch (this.request.scope) {
                case 0:
                case 1:
                    filterQuery.$and.push({ 'variants._id': { $in: this.request.selectedVariants } })
                    arrayFilter = { arrayFilters: [{ "elem._id": { $in: this.request.selectedVariants } }] } // Belirli variantId'lere sahip olanları filtrele
                    return await this.clientDB.getProductModel().updateOne(
                        filterQuery,
                        { $set: updateQuery },
                        arrayFilter
                    )
                case 2:
                    return await this.clientDB.getProductModel().updateOne(
                        filterQuery,
                        { $set: updateQuery }
                    )
            }
        } catch (error) {
            throw error
        }
    }


    async batchProcessDelete(): Promise<any> {
        try {

            const filterQuery: any = { $and: [{ _id: this.request.productId }] }
            switch (this.request.scope) {
                case 0:
                case 1:
                    return await this.clientDB.getProductModel().updateOne(
                        filterQuery,
                        { $pull: { variants: { _id: { $in: this.request.selectedVariants } } } }
                    )
                case 2:
                    return await this.clientDB.getProductModel().updateOne(
                        filterQuery,
                        { $set: { variants: [] } }
                    )
            }

        } catch (error) {
            throw error
        }
    }


    async generateVariantId(productId: any, choices: any) {
        let variantId = productId
        for (let choice of await this.getChoices()) {
            if (choices[choice.title])
                variantId += '__' + choice._id + '_' + choices[choice.title]
            /*             else variantId += '|' + choice.title + '_' + 0  */
        }
        return variantId
    }

    async addVariant(): Promise<any> {
        try {
            /*             this.request.variant.order = await this.getMaxVariantOrder(this.request.variant.productId) + 1 */
            //this.request.variant._id = await this.getNextSequence()

            var resp = {}
            try {
                delete this.request.variant._id
                resp = await this.clientDB.getProductModel().updateOne(
                    { _id: this.request.productId }, // Filter
                    { $push: { variants: this.request.variant } } // create
                )

                // 🔥 YENİ VARYANT EKLENDİ: İstatistikleri (Total Count & Stock) kirlet
                // İşlem başarılıysa tetikleyelim
                if ((resp as any).modifiedCount > 0) {
                    const statsOperations = new StatsOperations(this.clientDB);
                    await statsOperations.markStatsAsDirty();
                }


            } catch (error: any) {
                resp = error.result
            }

            this.updateProductStock(this.request.productId)
            this.updateProductPrices(this.request.productId)

            return resp
        } catch (error) {
            throw error
        }
    }


    async updateProductStock(productId: any): Promise<any> {
        try {
            const stockAgg = await this.clientDB.getVariantModel().aggregate([
                { $match: { productId: productId } },
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
                { productId: productId }
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

            const updateVariantArray = []
            for (const variant of this.request.variants) {
                updateVariantArray.push(variant)
            }
            const bulkOperations = updateVariantArray.map(variant => {
                return {
                    updateOne: {
                        filter: { _id: this.request.productId, 'variants._id': variant._id }, // Product'ın ID'si ve variants içinde ilgili variant ID'si
                        update: { $set: { 'variants.$': variant } } // Var olan variant'ı yeni değerlerle güncelle
                    }
                };
            });

            const result = await this.clientDB.getProductModel().bulkWrite(bulkOperations)
            this.updateProductStock(this.request.productId)
            this.updateProductPrices(this.request.productId)
            const statsOperations = new StatsOperations(this.clientDB);
            statsOperations.markStatsAsDirty();

            return result
        } catch (error) {
            throw error
        }
    }


    async updateVariant(): Promise<any> {
        try {
            var resp: any = {}
            this.request.variant._id = new ObjectId(this.request.variant._id as string)
            try {
                resp = await this.clientDB.getProductModel().updateOne(
                    { _id: this.request.productId, 'variants._id': this.request.variant._id }, // Filter
                    { $set: { 'variants.$': this.request.variant } } // Update
                )
            } catch (error: any) {
                resp = error.result
            }
            this.updateProductStock(this.request.productId)
            this.updateProductPrices(this.request.productId)
            const statsOperations = new StatsOperations(this.clientDB);
            statsOperations.markStatsAsDirty();
            return resp
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


            var resp = {}
            try {
                resp = await this.clientDB.getProductModel().updateOne(
                    { _id: this.request.productId }, // Filter
                    { $push: { variants: candidateVariants } } // create
                )
            } catch (error: any) {
                resp = error.result
            }

            this.updateProductStock(this.request.productId)
            this.updateProductPrices(this.request.productId)


            // 🔥 YENİ VARYANT EKLENDİ: İstatistikleri (Total Count & Stock) kirlet
            // İşlem başarılıysa tetikleyelim
            const statsOperations = new StatsOperations(this.clientDB);
            statsOperations.markStatsAsDirty();

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
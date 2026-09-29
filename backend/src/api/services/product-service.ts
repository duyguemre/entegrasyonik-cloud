import { IService } from '@interfaces/index'
import { BASE_IMAGE_URL } from 'src/Constants'
import { ImageOperations, storageService } from '@services/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { containsRegex, normalizePagination } from '@utils/search'
import * as XLSX from 'xlsx'
import crypto from 'crypto';
import { StatsOperations } from '@operations/client/StatsOperations';

/**
 * [N6 / ADR-0004 Karar 1] `Variants` üzerindeki zero-oversell alanları YALNIZCA StockAllocator'ın atomik geçişleriyle yazılır
 * (`reserved`, `allocations`, `stockVersion`, `stockDirty`). `retrieveProduct` bunları döndürür ve FE formu varyantı geri gönderir;
 * bu alanlar gövdeden gelirse bayat değer arada olan bir rezervasyonu ezerdi. Girdi değiştirilmez; temizlenmiş sığ kopya döner.
 */
export const ENGINE_OWNED_VARIANT_FIELDS: ReadonlyArray<string> = ['reserved', 'allocations', 'stockVersion', 'stockDirty'];
export function stripEngineOwnedVariantFields(variant: any): any {
    const copy: any = { ...(variant || {}) };
    for (const f of ENGINE_OWNED_VARIANT_FIELDS) delete copy[f];
    return copy;
}

export default class ProductService extends BaseApi implements IService {

    // --- TEMEL GET METOTLARI ---

    currentClientId: any
    constructor(clientId: number, protected request: any) {
        super(clientId, request)
        this.currentClientId = clientId
    }


    async get(): Promise<any> {
        try {
            const filterQuery = {}
            return await this.clientDB.getProductModel().find(filterQuery).sort({ order: 1 })
        } catch (error) {
            throw error
        }
    }

    async getIntegrations(): Promise<any> {
        try {
            const filterQuery = {}
            const projection = { settings: 0 }
            // [BULGU DÜZELTMESİ, 2026-09-29] `find(filterQuery, { projection })` YANLIŞ sarmalanmıştı — mongoose'un
            // ikinci argümanı DOĞRUDAN alan-seçim nesnesi bekler. Gerçek Mongo'da (mongodb-memory-server ile
            // doğrulandı, bkz. tests/mongo-semantics/integrationProjectionShape.mongoSemantics.test.ts) bu HATA
            // FIRLATMIYORDU, sessizce TÜM alanları (settings dahil) döndürüyordu — B4 gereksiz alan sızıntısı.
            return await this.applicationDB.getIntegrationModel().find(filterQuery, projection).populate('type')
        } catch (error) {
            throw error
        }
    }

    // --- İSTATİSTİK VE DASHBOARD ---

    async getProductStatistics(): Promise<any> {
        let stats = await this.clientDB.getStatisticsModel().findOne({ _id: "variant_stats" }).lean();
        const statsOperations = new StatsOperations(this.clientDB);

        if (!stats || stats.isDirty) {
            stats = await statsOperations.reconcileStatistics();
        }
        return {
            totalProducts: stats.totalProducts,
            variantPlatformTransferStatistics: {
                counts: stats.counts,
                totalVariants: stats.totalVariants,
                totalStock: stats.totalStock
            }
        };
    }

    // --- ÜRÜN LİSTELEME VE AGGREGATE SORGULARI ---

    async getProducts(): Promise<any> {
        try {
            const searchProductForm = this.request.searchProductForm;
            const sort = searchProductForm?.sort;
            const pagination = normalizePagination(searchProductForm?.pagination, 10); // [GV-01/MM-08] limit üst sınırı, page>=1

            let filterQuery = await this.getProductFilterQuery(searchProductForm?.data);

            let direction = sort?.direction === 'asc' ? 1 : -1;
            const sortBy: any = {};
            if (sort) {
                if (sort.field === 'price') {
                    sortBy['prices.minSalePrice'] = direction;
                } else {
                    sortBy[sort.field] = direction;
                }
            }
            sortBy._id = direction;

            const response: any = {};
            let matchingProductIds: ObjectId[] = [];

            const variantFilterQuery = await this.getProductVariantFilterQuery(searchProductForm?.data);

            if (Object.keys(variantFilterQuery).length > 0) {
                const matchingProductIdObjects = await this.clientDB.getVariantModel().aggregate([
                    { $match: variantFilterQuery },
                    { $group: { _id: '$productId' } }
                ]);
                matchingProductIds = matchingProductIdObjects.map((p: any) => p._id);

                filterQuery = {
                    [searchProductForm?.data?.searchText == undefined ? '$and' : '$or']: [
                        filterQuery,
                        { _id: { $in: matchingProductIds } }
                    ]
                };
            }

            const skipCount = (pagination.page - 1) * pagination.limit;

            const result = await this.clientDB.getProductModel().aggregate([
                { $match: filterQuery },
                {
                    $facet: {
                        totalNumberOfRecords: [{ $count: 'count' }],
                        products: [
                            { $sort: sortBy },
                            { $skip: skipCount },
                            { $limit: pagination.limit },
                            {
                                $lookup: {
                                    from: 'Variants',
                                    localField: '_id',
                                    foreignField: 'productId',
                                    as: 'variants',
                                    pipeline: [
                                        {
                                            $project: {
                                                stock: 1, prices: 1, barcode: 1, stockcode: 1,
                                                choices: 1, shelf: 1, choiceValueTitle: 1, _id: 1,
                                                images: { $slice: ["$images", 1] },
                                                platforms: {
                                                    $arrayToObject: {
                                                        $map: {
                                                            input: { $objectToArray: "$platforms" },
                                                            as: "p",
                                                            in: {
                                                                k: "$$p.k",
                                                                v: {
                                                                    $arrayToObject: {
                                                                        $filter: {
                                                                            input: { $objectToArray: "$$p.v" },
                                                                            as: "field",
                                                                            cond: { $ne: ["$$field.k", "attributes"] }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]);

            response.totalNumberOfRecords = result[0]?.totalNumberOfRecords[0]?.count || 0;
            response.products = result[0].products || [];

            if (response.products.length > 0) {
                response.fromTo = { from: skipCount + 1, to: skipCount + response.products.length };
            }
            return response;
        } catch (error) { throw error; }
    }

    // --- FİLTRE OLUŞTURUCULAR ---

    async getProductVariantFilterQuery(searchProductForm: any) {
        let filterQuery: any = {};
        const searchMatch: any = [];

        if (searchProductForm?.searchText) {
            const searchText = searchProductForm.searchText;
            searchMatch.push({
                $or: [
                    { stockcode: containsRegex(searchText) }, // [GV-01]
                    { barcode: containsRegex(searchText) }
                ]
            });
        }

        if (searchProductForm?.stockcode) searchMatch.push({ 'stockcode': searchProductForm.stockcode });
        if (searchProductForm?.barcode) searchMatch.push({ 'barcode': searchProductForm.barcode });

        if (searchProductForm?.transferStatuses?.length > 0) {
            const transferStatusOr: any[] = [];
            for (const transferStatus of searchProductForm.transferStatuses) {
                const [status, integrationCode] = transferStatus.split('|');
                const statusPath = `platforms.${integrationCode}.upload.TRANSFER.status`;
                const onSalePath = `platforms.${integrationCode}.upload.onSale`;

                let statusQuery: any = {};
                if (status === 'PENDING') {
                    statusQuery = { $or: [{ [statusPath]: 'PENDING' }, { [statusPath]: { $exists: false } }] };
                } else {
                    statusQuery = { [statusPath]: status };
                }

                if (searchProductForm.onSale !== undefined && searchProductForm.onSale !== -1) {
                    statusQuery[onSalePath] = searchProductForm.onSale === 1;
                }
                transferStatusOr.push(statusQuery);
            }
            searchMatch.push({ $or: transferStatusOr });
        }

        if (searchMatch.length > 0) filterQuery = { $and: searchMatch };
        return filterQuery;
    }

    async getProductFilterQuery(searchProductForm: any): Promise<any> {
        let filterQuery: any = {};
        if (searchProductForm?.searchText) {
            const searchText = searchProductForm.searchText;
            const orArray: any[] = [{ title: containsRegex(searchText) }]; // [GV-01]
            if (ObjectId.isValid(searchText)) orArray.push({ _id: new ObjectId(searchText) });
            filterQuery = { $or: orArray };
        } else {
            const searchMatch: any = await this.constructMatchQuery(searchProductForm);
            if (searchMatch.length > 0) filterQuery = { $and: searchMatch };
        }
        return filterQuery;
    }

    async constructMatchQuery(searchProductForm: any) {
        const searchMatch: any = [];
        if (!searchProductForm) return searchMatch;
        if (searchProductForm.title) searchMatch.push({ 'title': containsRegex(searchProductForm.title) }); // [GV-01]
        if (searchProductForm.category && searchProductForm.category !== -1) searchMatch.push({ 'category': new ObjectId(searchProductForm.category) });
        if (searchProductForm.brand && searchProductForm.brand !== -1) searchMatch.push({ 'brand': new ObjectId(searchProductForm.brand) });
        if (searchProductForm.prices?.minSalePrice) searchMatch.push({ 'prices.minSalePrice': { $gte: searchProductForm.prices.minSalePrice } });
        if (searchProductForm.prices?.maxSalePrice > 0) searchMatch.push({ 'prices.maxSalePrice': { $lte: searchProductForm.prices.maxSalePrice } });
        return searchMatch;
    }

    // --- YAZMA VE GÜNCELLEME İŞLEMLERİ ---

    async saveProduct(): Promise<any> {
        try {
            const { productInfo } = this.request;
            const tempId = productInfo.tempId;
            const variants = productInfo.variants;
            delete productInfo.variants;

            if (productInfo.hasVariant == false) {
                productInfo.stockcode = variants[0]?.stockcode;
                productInfo.barcode = variants[0]?.barcode;
            }

            const resp = await this.clientDB.getProductModel().findOneAndUpdate(
                { tempId: new ObjectId(tempId as string) },
                { $set: productInfo },
                { upsert: true, returnDocument: 'after' }
            );

            // [N6 / ADR-0004] motora ait alanlar (reserved/allocations/stockVersion/stockDirty) FE gövdesinden ASLA yazılmaz
            const newVariants = variants.map((variant: any) => {
                const clean = stripEngineOwnedVariantFields(variant);
                clean.productId = resp._id;
                clean.variantHash = this.hashChoices(resp.maincode, clean.choices);
                return clean;
            });
            await this.clientDB.getVariantModel().insertMany(newVariants);

            await this.updateProductStockAndPrices(resp._id);
            this.markStatsAsDirty();
            return true;
        } catch (error) { throw error; }
    }

    private markStatsAsDirty() {
        const statsOperations = new StatsOperations(this.clientDB);
        statsOperations.markStatsAsDirty();
    }

    async updateProduct(): Promise<any> {
        try {
            const { productInfo } = this.request;
            const productId = productInfo._id;
            const variants = productInfo.variants;
            delete productInfo.variants;

            if (productInfo.hasVariant == true) {
                productInfo.stockcode = undefined;
                productInfo.barcode = undefined;
            } else {
                productInfo.stockcode = variants[0]?.stockcode;
                productInfo.barcode = variants[0]?.barcode;
            }

            const resp = await this.clientDB.getProductModel().findOneAndUpdate(
                { _id: new ObjectId(productId as string) },
                { $set: productInfo },
                { upsert: true, returnDocument: 'after' }
            );

            const bulkOperations = variants.map((original: any) => {
                // [N6 / ADR-0004] FE'nin bayat okuması rezervasyon alanlarını ezemez (bkz. stripEngineOwnedVariantFields)
                const v = stripEngineOwnedVariantFields(original);
                v.productId = resp._id;
                v.variantHash = this.hashChoices(resp.maincode, v.choices);
                if (v._id) {
                    return { updateOne: { filter: { _id: new ObjectId(v._id) }, update: { $set: v } } };
                }
                return { insertOne: { document: v } };
            });

            await this.clientDB.getVariantModel().bulkWrite(bulkOperations);

            const res = await this.copyTempImages(resp._id, productInfo.tempId);
            if (res) await this.updateTempImageDocuments(resp._id, productInfo.tempId);

            await this.updateProductStockAndPrices(productId);
            this.markStatsAsDirty();

            return await this.getProduct(productId);
        } catch (error) { throw error; }
    }

    async updateOnsale(): Promise<any> {
        try {
            const resp = await this.clientDB.getProductModel().updateOne(
                { _id: new ObjectId(this.request._id as string) },
                { $set: { onsale: this.request.onsale } }
            );
            if (resp.modifiedCount === 1) {
                this.markStatsAsDirty();
                return { result: true };
            }
            return { result: false };
        } catch (error) { throw error; }
    }

    async deleteProduct(): Promise<any> {
        try {
            const _id = new ObjectId(this.request._id as string);
            await this.clientDB.getVariantModel().deleteMany({ productId: _id });
            const resp = await this.clientDB.getProductModel().deleteOne({ _id });
            this.markStatsAsDirty();
            return resp;
        } catch (error) { throw error; }
    }

    // --- RESİM VE DOSYA İŞLEMLERİ ---

    async copyTempImages(_id: ObjectId, tempId: string): Promise<any> {
        try {
            const tempImagesResp = await this.clientDB.getImageModel().find({ productId: tempId });
            // [ADR-0013 B3, 2026-09-27] Kaynak: taslağın GERÇEKTE yazıldığı tenant'lı dizin
            // (products/<clientId>/<tempId>, bkz. ImageOperations.imageTempFilesPath); hedef: yeni ürünün
            // kalıcı tenant'lı dizini (products/<clientId>/<yeniÜrünId>). Önceki kod clientId'yi hiç eklemiyordu
            // VE kaynak/hedefi ters kurmuştu (BACKLOG "R2 isimlendirme incelemesi", 2026-09-27) — kopyalama
            // sessizce hiçbir zaman gerçek bir nesneyi eşlemiyordu.
            const sourceDirectory = ImageOperations.imageTempFilesPath(this.currentClientId, tempId);
            const destinationDirectory = ImageOperations.imageFilesPath + this.currentClientId + '/' + _id;
            for (var tempImage of tempImagesResp) {
                await storageService.copyFile(this.currentClientId, tempImage._id, tempImage.extension, sourceDirectory, destinationDirectory)
                await storageService.copyFile(this.currentClientId, tempImage._id + '_t', tempImage.extension, sourceDirectory, destinationDirectory)
            }
            return true;
        } catch (error) { throw error; }
    }

    async updateTempImageDocuments(productId: ObjectId, tempId: string): Promise<any> {
        try {
            const images = await this.clientDB.getImageModel().find({ productId: tempId });
            const operations = images.map((image: any) => {
                const imageId = image._id.toString();
                const extension = image.extension || 'jpg';
                return {
                    updateOne: {
                        filter: { _id: image._id },
                        update: {
                            $set: {
                                productId: productId,
                                isTempImage: false,
                                // [ADR-0013 B3, 2026-09-27] clientId eklendi — yükleme yolu (image-service.ts
                                // addImages) ve `copyTempImages` hedef diziniyle tutarlı.
                                url: `${BASE_IMAGE_URL}${this.currentClientId}/${productId}/${imageId}.${extension}`
                            }
                        }
                    }
                };
            });
            if (operations.length > 0) await this.clientDB.getImageModel().bulkWrite(operations);
            return true;
        } catch (error) { throw error; }
    }

    // --- YARDIMCI HESAPLAMA VE EXPORT ---

    async updateProductStockAndPrices(productId: any): Promise<any> {
        const stockAgg = await this.clientDB.getVariantModel().aggregate([
            { $match: { productId: new ObjectId(productId) } },
            { $group: { _id: null, totalStock: { $sum: '$stock' } } }
        ]);
        const totalStock = stockAgg[0]?.totalStock ?? 0;

        const variants = await this.clientDB.getVariantModel().find({ productId }).lean();
        let minPrice = Infinity, maxPrice = 0;
        variants.forEach((v: any) => {
            const p = v.prices || {};
            const sale = p.isPlatformBasedPrice ? Math.min(...Object.values(v.platforms || {}).map((pl: any) => pl.prices?.salePrice || Infinity)) : p.salePrice;
            if (sale < minPrice) minPrice = sale;
            if (sale > maxPrice) maxPrice = sale;
        });

        await this.clientDB.getProductModel().updateOne(
            { _id: productId },
            { $set: { stock: totalStock, prices: { minSalePrice: minPrice === Infinity ? 0 : minPrice, maxSalePrice: maxPrice } } }
        );
    }


    async retrieveProduct(): Promise<any> {
        try {
            return await this.getProduct(this.request._id)
        } catch (error) {
            throw error
        }
    }


    async getProduct(_id: number): Promise<any> {
        const result = await this.clientDB.getProductModel().aggregate([
            { $match: { _id: new ObjectId(_id.toString()) } },
            { $lookup: { from: 'Variants', localField: '_id', foreignField: 'productId', as: 'variants' } }
        ]);
        return result.length > 0 ? { product: result[0] } : undefined;
    }


    hashChoices(maincode: string, choices: any) {
        const normalized = maincode + '|' + (choices || []).slice().sort((a: any, b: any) => String(a.choiceId).localeCompare(String(b.choiceId))).map((c: any) => `${c.choiceId}:${c.choiceValueId}`).join('|');
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    async exportExcel(): Promise<any> {
        try {
            const { scope, selectedProducts, searchProductForm, selectedIntegrations } = this.request;
            const filterQuery: any = {};
            if (scope === 0) filterQuery._id = { $in: selectedProducts.map((id: string) => new ObjectId(id)) };
            else if (scope === 1) Object.assign(filterQuery, await this.getProductFilterQuery(searchProductForm?.data || searchProductForm));

            const productsToProcess = await this.clientDB.getProductModel().find(filterQuery).lean();
            if (!productsToProcess || productsToProcess.length === 0) return { result: true, count: 0 };

            const productIds = productsToProcess.map((p: any) => p._id);
            const allVariants = await this.clientDB.getVariantModel().find({ productId: { $in: productIds } }).lean() || [];
            const data: any[] = [];

            for (const product of productsToProcess) {
                const productVariants = allVariants.filter((variant: any) => variant.productId.toString() === product._id.toString());
                for (const variant of productVariants) {
                    const row: any = { 'Ürün': product.title, 'Barkod': variant.barcode, 'Stok': variant.stock, 'Fiyat': variant.prices?.salePrice };
                    if (selectedIntegrations) {
                        for (const code of selectedIntegrations) {
                            row[code.toUpperCase()] = variant.platforms?.[code]?.upload?.TRANSFER?.status || 'PENDING';
                        }
                    }
                    data.push(row);
                }
            }
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Ürünler');
            return { result: true, excelData: XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }), fileName: `urun_listesi.xlsx` };
        } catch (error) { throw error; }
    }
}


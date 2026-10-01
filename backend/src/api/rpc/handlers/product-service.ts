import { IService } from '@interfaces/index'
import { storageService } from '@services/index'
import { imageOperations as ImageOperations } from '@operations/catalog/images/image-operations'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { ApplicationError } from '@platform/core/security/Security'
import { normalizePagination } from '@utils/search'
import { buildMatchQuery, buildProductFilterQuery, buildVariantFilterQuery } from '@operations/catalog/productFilters'
import { buildProductExcelBase64 } from '@operations/catalog/productExcel'
import crypto from 'crypto';
import { StatsOperations } from '@operations/reports/StatsOperations';
import { config } from '@config';
import { ProductRepository } from '@database/repositories/tenant/ProductRepository';
import { VariantRepository } from '@database/repositories/tenant/VariantRepository';
import { ImageRepository } from '@database/repositories/tenant/ImageRepository';
import { StatisticsRepository } from '@database/repositories/tenant/StatisticsRepository';
import { findStockChanges, recordManualStockMovements, stockDirtyFields } from '@operations/stock/markStockDirty';

/** exportExcel: varyantların tek seferde çekildiği ürün grubu boyutu (bellek üst sınırı = grup × ürün başına varyant). */
const EXPORT_BATCH_PRODUCTS = 500;

/**
 * [MM-08 / ADR-0021 aynı desen] getProducts sıralama alanı izin listesi. `ProductSchema` (Product.ts) alanlarından
 * ve FE ürün listesinin (ProductListView.vue) tıklanabilir/sıralanabilir başlıklarından türetildi: title, stockcode,
 * barcode, stock, ve özel eşleme `price` -> `prices.minSalePrice` (MEVCUT davranış KORUNDU). `brand`/`category`
 * başlıkları FE'de sıralama tetiklemiyor (yalnızca hover, @click YOK) — allowlist'e alınmadı. `OrderService.getOrders`
 * ile AYNI keyfi-alan-adı-enjeksiyonu riskini kapatır.
 */
const PRODUCT_SORT_FIELD_ALIASES: Record<string, string> = { price: 'prices.minSalePrice' };
const PRODUCT_SORT_FIELDS: readonly string[] = [
    'title', 'stockcode', 'barcode', 'stock', 'prices.minSalePrice', '_id',
];

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

    // getter'lar: test, servisi kurduktan SONRA svc.clientDB atıyor
    private get products() { return new ProductRepository(this.clientDB) }
    private get variants() { return new VariantRepository(this.clientDB) }
    private get images() { return new ImageRepository(this.clientDB) }
    private get statistics() { return new StatisticsRepository(this.clientDB) }

    // --- TEMEL GET METOTLARI ---



    async get(): Promise<any> {
        return await this.products.listOrdered()
    }

    // --- İSTATİSTİK VE DASHBOARD ---

    async getProductStatistics(): Promise<any> {
        let stats = await this.statistics.findVariantStats();
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
        const searchProductForm = this.request.searchProductForm;
        const sort = searchProductForm?.sort;
        const pagination = normalizePagination(searchProductForm?.pagination, 10); // [GV-01/MM-08] limit üst sınırı, page>=1

        let filterQuery = await this.getProductFilterQuery(searchProductForm?.data);

        let direction = sort?.direction === 'asc' ? 1 : -1;
        const sortBy: any = {};
        if (sort && sort.field) {
            const field = PRODUCT_SORT_FIELD_ALIASES[sort.field] ?? sort.field;
            if (typeof field !== 'string' || !PRODUCT_SORT_FIELDS.includes(field)) {
                throw new ApplicationError('sort.field geçersiz: ' + PRODUCT_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
            }
            sortBy[field] = direction;
        }
        sortBy._id = direction;

        const response: any = {};
        let matchingProductIds: ObjectId[] = [];

        const variantFilterQuery = await this.getProductVariantFilterQuery(searchProductForm?.data);

        if (Object.keys(variantFilterQuery).length > 0) {
            const matchingProductIdObjects = await this.variants.distinctProductIds(variantFilterQuery);
            matchingProductIds = matchingProductIdObjects.map((p: any) => p._id);

            filterQuery = {
                [searchProductForm?.data?.searchText == undefined ? '$and' : '$or']: [
                    filterQuery,
                    { _id: { $in: matchingProductIds } }
                ]
            };
        }

        const skipCount = (pagination.page - 1) * pagination.limit;

        const result = await this.products.searchPageWithVariants(filterQuery, sortBy, skipCount, pagination.limit);

        response.totalNumberOfRecords = result[0]?.totalNumberOfRecords[0]?.count || 0;
        response.products = result[0].products || [];

        if (response.products.length > 0) {
            response.fromTo = { from: skipCount + 1, to: skipCount + response.products.length };
        }
        return response;
    }

    // --- FİLTRE OLUŞTURUCULAR ---

    async getProductVariantFilterQuery(searchProductForm: any) { return buildVariantFilterQuery(searchProductForm); }

    async getProductFilterQuery(searchProductForm: any): Promise<any> { return buildProductFilterQuery(searchProductForm); }

    async constructMatchQuery(searchProductForm: any) { return buildMatchQuery(searchProductForm); }

    // --- YAZMA VE GÜNCELLEME İŞLEMLERİ ---

    async saveProduct(): Promise<any> {
        const { productInfo } = this.request;
        const tempId = productInfo.tempId;
        const variants = productInfo.variants;
        delete productInfo.variants;

        if (productInfo.hasVariant == false) {
            productInfo.stockcode = variants[0]?.stockcode;
            productInfo.barcode = variants[0]?.barcode;
        }

        const resp = await this.products.upsertByTempId(tempId, productInfo);

        // [N6 / ADR-0004] motora ait alanlar (reserved/allocations/stockVersion/stockDirty) FE gövdesinden ASLA yazılmaz
        const newVariants = variants.map((variant: any) => {
            const clean = stripEngineOwnedVariantFields(variant);
            clean.productId = resp._id;
            clean.variantHash = this.hashChoices(resp.maincode, clean.choices);
            return clean;
        });
        await this.variants.insertMany(newVariants);

        await this.updateProductStockAndPrices(resp._id);
        this.markStatsAsDirty();
        return true;
    }

    private markStatsAsDirty() {
        const statsOperations = new StatsOperations(this.clientDB);
        statsOperations.markStatsAsDirty();
    }

    async updateProduct(): Promise<any> {
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

        const resp = await this.products.upsertById(productId, productInfo);

        // [X2] stoğu DEĞİŞEN mevcut varyantlar yayın için işaretlenir (tek kapı: operations/stock/markStockDirty.ts)
        const stockChanges = await findStockChanges(this.variants.queryModel(), variants);
        const stockChanged = { has: (id: string) => stockChanges.has(id) };
        const dirtyNow = stockDirtyFields();
        const bulkOperations = variants.map((original: any) => {
            // [N6 / ADR-0004] FE'nin bayat okuması rezervasyon alanlarını ezemez (bkz. stripEngineOwnedVariantFields)
            const v = stripEngineOwnedVariantFields(original);
            v.productId = resp._id;
            v.variantHash = this.hashChoices(resp.maincode, v.choices);
            if (v._id) {
                if (stockChanged.has(String(v._id))) Object.assign(v, dirtyNow);
                return { updateOne: { filter: { _id: new ObjectId(v._id) }, update: { $set: v } } };
            }
            return { insertOne: { document: v } };
        });

        await this.variants.bulkWrite(bulkOperations);
        recordManualStockMovements(this.clientDB, stockChanges.values(), this.request); // [ADR-0021 D14] hareket defteri (asenkron)

        const res = await this.copyTempImages(resp._id, productInfo.tempId);
        if (res) await this.updateTempImageDocuments(resp._id, productInfo.tempId);

        await this.updateProductStockAndPrices(productId);
        this.markStatsAsDirty();

        return await this.getProduct(productId);
    }

    async updateOnsale(): Promise<any> {
        const resp = await this.products.setOnsale(this.request._id, this.request.onsale);
        if (resp.modifiedCount === 1) {
            this.markStatsAsDirty();
            return { result: true };
        }
        return { result: false };
    }

    async deleteProduct(): Promise<any> {
        const _id = new ObjectId(this.request._id as string);
        await this.variants.deleteMany({ productId: _id });
        const resp = await this.products.delete(_id);
        this.markStatsAsDirty();
        return resp;
    }

    // --- RESİM VE DOSYA İŞLEMLERİ ---

    async copyTempImages(_id: ObjectId, tempId: string): Promise<any> {
        const tempImagesResp = await this.images.findByProductId(tempId);
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
    }

    async updateTempImageDocuments(productId: ObjectId, tempId: string): Promise<any> {
        const images = await this.images.findByProductId(tempId);
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
                            url: `${config.images.productBaseUrl}${this.currentClientId}/${productId}/${imageId}.${extension}`
                        }
                    }
                }
            };
        });
        if (operations.length > 0) await this.images.bulkWrite(operations);
        return true;
    }

    // --- YARDIMCI HESAPLAMA VE EXPORT ---

    async updateProductStockAndPrices(productId: any): Promise<any> {
        const stockAgg = await this.variants.sumStockByProduct(new ObjectId(productId));
        const totalStock = stockAgg[0]?.totalStock ?? 0;

        const variants = await this.variants.listByProduct(productId);
        let minPrice = Infinity, maxPrice = 0;
        variants.forEach((v: any) => {
            const p = v.prices || {};
            const sale = p.isPlatformBasedPrice ? Math.min(...Object.values(v.platforms || {}).map((pl: any) => pl.prices?.salePrice || Infinity)) : p.salePrice;
            if (sale < minPrice) minPrice = sale;
            if (sale > maxPrice) maxPrice = sale;
        });

        await this.products.setStockAndPrices(productId, totalStock, { minSalePrice: minPrice === Infinity ? 0 : minPrice, maxSalePrice: maxPrice });
    }


    async retrieveProduct(): Promise<any> {
        return await this.getProduct(this.request._id)
    }


    async getProduct(_id: number): Promise<any> {
        const result = await this.products.findWithVariants(_id);
        return result.length > 0 ? { product: result[0] } : undefined;
    }


    hashChoices(maincode: string, choices: any) {
        const normalized = maincode + '|' + (choices || []).slice().sort((a: any, b: any) => String(a.choiceId).localeCompare(String(b.choiceId))).map((c: any) => `${c.choiceId}:${c.choiceValueId}`).join('|');
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    /**
     * [F-12 / WP8] Bellek dostu Excel dışa aktarma. ESKİ: tüm ürünler + tüm varyantlar (tam belge) belleğe, satır tavanı yok.
     * ŞİMDİ: (1) ürünler `cursor` ile akıtılır (yalnız `title` projeksiyonu), (2) varyantlar ürün gruplarıyla (EXPORT_BATCH_PRODUCTS)
     * ve YALNIZ gereken alanlarla (`barcode/stock/prices.salePrice` + seçili entegrasyonların TRANSFER.status) çekilir,
     * (3) satır (varyant) sayısı `EXPORT_EXCEL_MAX_ROWS` (varsayılan 20000, env) ile SINIRLI: aşılırsa üretim durur ve
     * `{ result: false, code: 'EXPORT_ROW_LIMIT', message, limit }` döner (FE `response.message`'ı hata olarak gösterir).
     * Yanıt sözleşmesi DEĞİŞMEZ: `{ result, excelData (base64 xlsx), fileName }` / hiç ürün yoksa `{ result: true, count: 0 }`.
     */
    async exportExcel(): Promise<any> {
        const { scope, selectedProducts, searchProductForm, selectedIntegrations } = this.request;
        const maxRows: number = config.exports.excelMaxRows;
        const codes: string[] = Array.isArray(selectedIntegrations) ? selectedIntegrations : [];
        // `platforms.<kod>...` projeksiyon yoluna gömülür: yalnız güvenli kodlar (yol enjeksiyonu yok)
        if (codes.some((c) => typeof c !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c))) throw new ApplicationError('Geçersiz entegrasyon kodu.', 400, 'VALIDATION');

        const filterQuery: any = {};
        if (scope === 0) filterQuery._id = { $in: selectedProducts.map((id: string) => new ObjectId(id)) };
        else if (scope === 1) Object.assign(filterQuery, await this.getProductFilterQuery(searchProductForm?.data || searchProductForm));

        const variantProjection: any = { productId: 1, barcode: 1, stock: 1, 'prices.salePrice': 1 };
        for (const code of codes) variantProjection[`platforms.${code}.upload.TRANSFER.status`] = 1;

        const data: any[] = [];
        let productCount = 0;
        let overLimit = false;

        const flush = async (batch: any[]): Promise<void> => {
            const variants = await this.variants.listForExport(batch.map((p) => p._id), variantProjection) || [];
            const byProduct = new Map<string, any[]>();
            for (const v of variants as any[]) {
                const key = v.productId.toString();
                const list = byProduct.get(key);
                if (list) list.push(v); else byProduct.set(key, [v]);
            }
            for (const product of batch) {
                for (const variant of byProduct.get(product._id.toString()) ?? []) {
                    if (data.length >= maxRows) { overLimit = true; return; }
                    const row: any = { 'Ürün': product.title, 'Barkod': variant.barcode, 'Stok': variant.stock, 'Fiyat': variant.prices?.salePrice };
                    for (const code of codes) row[code.toUpperCase()] = variant.platforms?.[code]?.upload?.TRANSFER?.status || 'PENDING';
                    data.push(row);
                }
            }
        };

        const cursor = this.products.exportCursor(filterQuery, EXPORT_BATCH_PRODUCTS);
        let batch: any[] = [];
        for await (const product of cursor as AsyncIterable<any>) {
            productCount++;
            batch.push(product);
            if (batch.length >= EXPORT_BATCH_PRODUCTS) { await flush(batch); batch = []; }
            if (overLimit) break;
        }
        if (!overLimit && batch.length > 0) await flush(batch);

        if (overLimit) {
            return {
                result: false, code: 'EXPORT_ROW_LIMIT', limit: maxRows,
                message: `Dışa aktarma satır sınırını (${maxRows}) aşıyor. Lütfen filtreyi daraltın veya daha az ürün seçin.`,
            };
        }
        if (productCount === 0) return { result: true, count: 0 };

        return { result: true, excelData: await buildProductExcelBase64(data), fileName: `urun_listesi.xlsx` };
    }
}


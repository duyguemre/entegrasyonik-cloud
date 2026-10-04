import {
    IBatchCheckPayload, IBatchProcessResult, IExportStagedProduct,
    IFetchProductsResult, IInternalConversionResult, IInternalResult,
    IPlatformProductSummary, IValidationResult, IVariant, PLATFORM_PROCESS
} from '@interfaces/index';
import { integrationCode as CODE } from '../constants';
import { integrationCode, hbMerchantId } from '../constants';
import { ProductConnector } from '../api/ProductConnector';
import { ProductMapper } from '../transformers/ProductTransformer';
import { Service } from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { labelAttribute, missingRequiredAttributes } from '@integration/catalog/attributePayload';
import type { ICategoryAttribute } from '@interfaces/index';
import { compactCatalogProduct, toImportRecord, type HbCatalogCompact } from '../transformers/importRecord';
import { eventLog } from '@platform/core/logger';
import { channelPricePair } from '@platform/core/pricing/effectivePrice';

const log = eventLog('adapter-hepsiburada', 'ProductService');

// [INT-05 / F-02] Listing tarama/akış tavanları (aşılırsa sessiz kesilmez: uyarı + incomplete/FAILED).
const STATUS_SCAN_MAX_PAGES = 20;        // updateProductStatuses: sayfa başına 500 => 10.000 listing
const STATUS_SCAN_MAX_RECORDS = 10_000;
const STREAM_MAX_PAGES = 1000;           // streamProducts: sayfa başına 100 => 100.000 listing
const STREAM_MAX_RECORDS = 100_000;

export class ProductService {
    private connector: ProductConnector;
    private mapper: ProductMapper;

    /** `categoryService` (opsiyonel): verilirse gönderimde kategori özellikleri okunur ve ZORUNLU özellik denetimi yapılır (K-5). */
    constructor(private params: any, private service: Service, private categoryService?: { fetchCategoryAttributes(id: string): Promise<ICategoryAttribute[]> }) {
        this.connector = new ProductConnector(this.service, this.params);
        this.mapper = new ProductMapper();
    }

    /**
     * [eslesme-fiyat WP3, D-HB-2 / K-4 / K-5] Kategori kimliği TEK KAYNAK `AttributeMappings` (mappingProvider; TY/PZ kalıbı), yoksa içe
     * aktarılmış üründeki HB kimliği (`mapping.categoryId`). Marka = yerel `Brands.title` (HB ad ister), yoksa içe aktarılan HB metni.
     * Kategori özellikleri okunur; kategoriye özgü ZORUNLU özellik eksikse ürün gönderilmez (alan bazlı mesaj → errorMap MAP_ATTR_MISSING).
     * Eskiden kimlik yalnız import'ta dolan `mapping.categoryId`'den okunuyordu → yerel ürün `categoryId: NaN`, `Marka: "undefined"`.
     */
    private async resolveCategoryAndBrand(variant: any): Promise<{ catId: string; brandName: string }> {
        const mp = this.params.mappingProvider;
        const vMap = variant.platforms?.[integrationCode]?.mapping || {};
        const localCat = variant.product?.category;
        let catId: any = mp && localCat ? await mp.getPlatformCategoryId(String(localCat)) : undefined;
        if (catId === undefined || catId === null || catId === '' || catId == -1) catId = vMap.categoryId;
        if (catId === undefined || catId === null || catId === '' || catId == -1) throw new Error('Hepsiburada kategori eşlemesi bulunamadı.');

        let brandName: string | undefined;
        const localBrand = variant.product?.brand;
        if (mp && localBrand && typeof mp.getLocalBrandTitle === 'function') {
            const t = await mp.getLocalBrandTitle(String(localBrand));
            if (t && t !== 'Bilinmeyen Marka') brandName = String(t);
        }
        brandName ??= vMap.brandName || (vMap.brandId !== undefined && vMap.brandId !== null && vMap.brandId !== '' ? String(vMap.brandId) : undefined);
        if (!brandName) throw new Error('Hepsiburada marka adı bulunamadı (ürünün markasını seçin).');
        return { catId: String(catId), brandName };
    }

    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        const items: any[] = [];
        const variantList: any[] = [];
        const failedVariants: any[] = [];
        const attrCache = new Map<string, Promise<ICategoryAttribute[]>>();
        const attrsOf = (catId: string) => {
            if (!this.categoryService) return Promise.resolve([] as ICategoryAttribute[]);
            let p = attrCache.get(catId);
            if (!p) { p = this.categoryService.fetchCategoryAttributes(catId); attrCache.set(catId, p); }
            return p;
        };

        for (const sp of stagedProducts) {
            const variant = sp.payload;
            if (!variant) continue;
            try {
                const { catId, brandName } = await this.resolveCategoryAndBrand(variant);
                const catAttrs = await attrsOf(catId);
                const item = this.mapper.toPlatformBatch(sp, PLATFORM_PROCESS.TRANSFER, catAttrs, [], {
                    catId,
                    brandId: brandName,
                    brandName,
                    settings: this.params.integrationSettings?.settings
                });
                if (!item) throw new Error('Ürün dönüştürülemedi.');
                const missing = missingRequiredAttributes(catAttrs, new Set(Object.keys(item.attributes || {})), (c) => !!c.base);
                if (missing.length) throw new Error(`Hepsiburada zorunlu özellik eksik: ${missing.map((c) => labelAttribute(String(c._id), c.title)).join(', ')}`);
                items.push(item);
                variantList.push({ variantId: variant._id, barcode: variant.barcode });
            } catch (e: any) {
                failedVariants.push({ variantId: variant._id, barcode: variant.barcode, reason: e.message });
            }
        }

        if (items.length === 0) {
            return { trackingId: null, result: false, variantList: [], failedVariants };
        }

        try {
            const response = await this.connector.importProducts(items);

            if (response?.success !== true) {
                throw new Error(response?.message || "Transfer failed");
            }

            return {
                trackingId: response?.data?.trackingId || null,
                result: true,
                variantList,
                failedVariants
            };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaProductService:transferProducts] ${error.message}`);
        }
    }

    // Fiyat güncelleme — HB asenkron: job ID alır, Sentinel poll eder
    public async updateProductPrice(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        const variantList: any[] = [];
        const items: any[] = [];

        for (const sp of stagedProducts) {
            const variant = sp.payload;
            if (!variant) continue;
            const salePrice = parseFloat(sp.price?.toString() || '0');
            items.push({
                merchantSku: sp.stockcode || sp.productId,
                barcode: variant.barcode,
                price: Math.round(salePrice * 100) / 100
            });
            variantList.push({ variantId: variant._id, barcode: variant.barcode });
        }

        if (items.length === 0) return { trackingId: null, result: false, variantList: [], failedVariants: [] };

        try {
            const response = await this.connector.updatePrice({ items });
            return { trackingId: response?.id || null, result: true, variantList, failedVariants: [] };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaProductService:updateProductPrice] ${error.message}`);
        }
    }

    // Stok güncelleme — HB asenkron: job ID alır, Sentinel poll eder
    public async updateProductStock(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        const variantList: any[] = [];
        const items: any[] = [];

        for (const sp of stagedProducts) {
            const variant = sp.payload;
            if (!variant) continue;
            items.push({
                merchantSku: sp.stockcode || sp.productId,
                barcode: variant.barcode,
                availableStock: parseInt(sp.stock?.toString() || '0')
            });
            variantList.push({ variantId: variant._id, barcode: variant.barcode });
        }

        if (items.length === 0) return { trackingId: null, result: false, variantList: [], failedVariants: [] };

        try {
            const response = await this.connector.updateStock({ items });
            return { trackingId: response?.id || null, result: true, variantList, failedVariants: [] };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaProductService:updateProductStock] ${error.message}`);
        }
    }

    // Ürün güncelleme — HB asenkron: job ID alır, Sentinel poll eder
    public async updateProduct(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        const variantList: any[] = [];
        const items: any[] = [];

        for (const sp of stagedProducts) {
            const variant = sp.payload;
            if (!variant) continue;
            const vMapping = variant.platforms?.[CODE]?.mapping;

            const variantImages: Record<string, any> = {};
            (variant.images || []).forEach((img: any, index: number) => {
                variantImages[`image${index + 1}`] = typeof img === 'string' ? img : img.url;
            });

            items.push({
                hbSku: sp.productId,
                barcode: variant.barcode,
                productName: vMapping?.title || variant.product?.title || "",
                productDescription: vMapping?.description || variant.product?.description || "",
                ...variantImages,
                attributes: variant.platforms?.[CODE]?.attributes || {}
            });
            variantList.push({ variantId: variant._id, barcode: variant.barcode });
        }

        if (items.length === 0) return { trackingId: null, result: false, variantList: [], failedVariants: [] };

        try {
            const payload = {
                merchantId: hbMerchantId(this.params.integrationSettings?.settings), // [K-13] tek kaynak
                items
            };
            const response = await this.connector.updateProduct(payload);
            return { trackingId: response?.trackingId || null, result: true, variantList, failedVariants: [] };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaProductService:updateProduct] ${error.message}`);
        }
    }

    // Batch/job sorgulama — Sentinel tarafından mode'a göre doğru endpoint'e gider
    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        try {
            const { trackingId, mode } = payload;

            if (mode === PLATFORM_PROCESS.UPDATE_PRICE) {
                return this.checkUploadJob('price', trackingId);
            }
            if (mode === PLATFORM_PROCESS.UPDATE_STOCK) {
                return this.checkUploadJob('stock', trackingId);
            }
            if (mode === PLATFORM_PROCESS.UPDATE) {
                return this.checkUploadJob('update', trackingId);
            }

            // TRANSFER modu: batch ürün aktarım durumu
            const data = await this.connector.fetchBatchResults(trackingId);
            if (data?.status === 'Processing') return undefined;
            return this.mapper.toInternalBatchResult(data);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaProductService:checkBatchProduct] ${error.message}`);
        }
    }

    private async checkUploadJob(type: 'price' | 'stock' | 'update', jobId: string): Promise<IInternalResult[] | undefined> {
        const data = await this.connector.checkUploadJobStatus(type, jobId);
        if (!data || data.status === 'IN_PROGRESS') return undefined;

        const items: any[] = Array.isArray(data.items) ? data.items : [];
        return items.map((item: any) => ({
            matchValue: item.barcode || item.merchantSku || '',
            barcode: item.barcode,
            status: item.status === 'FAILED' ? 'FAILED' as const : 'COMPLETED' as const,
            messages: [item.message || 'İşlem tamamlandı.']
        } as IInternalResult));
    }

    // Sync worker'ın WAITING ürünleri için listing durumu sorgulama
    public async updateProductStatuses(payload: { barcodes: string[], matchValues?: string[] }): Promise<IInternalResult[]> {
        try {
            // [INT-05 / F-02] Listing'in TÜM sayfaları taranır (önceden yalnız ilk 500 kayıt; sonrası sonsuza dek "henüz bulunamadı" kalırdı).
            const { items: products } = await this.connector.fetchListingPages({}, { limit: 500, maxPages: STATUS_SCAN_MAX_PAGES, maxRecords: STATUS_SCAN_MAX_RECORDS });
            const scanIncomplete = !!getIncomplete(products);

            const identifiers = payload.matchValues || payload.barcodes || [];
            return identifiers.map((barcode: string) => {
                const product = products.find((p: any) =>
                    p.barcode === barcode || p.merchantSku === barcode
                );

                if (!product) {
                    return {
                        matchValue: barcode,
                        barcode,
                        status: 'WAITING' as const,
                        messages: [scanIncomplete
                            ? 'Ürün HB listingde bulunamadı (listing taraması tavana ulaştı; sonuç eksik olabilir).'
                            : 'Ürün HB listingde henüz bulunamadı.']
                    };
                }

                const isActive = product.status === 'Active' || product.productStatus === 'Satışa Hazır';
                return {
                    matchValue: barcode,
                    barcode,
                    status: isActive ? 'COMPLETED' as const : 'WAITING' as const,
                    messages: [isActive ? 'Ürün aktif olarak listelendi.' : 'Ürün onay bekliyor.'],
                    mapping: {
                        id: product.hbSku || product._id?.toString(),
                        stockcode: product.merchantSku
                    }
                };
            });
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaProductService:updateProductStatuses] ${error.message}`);
        }
    }

    // Import: HB'deki ürünleri çekip callback ile ilet
    public async getProductsAndPersist(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> {
        try {
            // [INT-05 / F-02] Ortak sayfalama (akış kipi: kayıt bellekte toplanmaz). Önceden toplam alanı (`totalCount`) yoksa ilk sayfadan
            // sonra DURUYORDU (sessiz eksik import); artık `dönen < limit` ile durur, tekrar eden sayfa/tavan FAILED olarak bildirilir.
            const limit = 100;
            let totalProcessed = 0;
            // [eslesme-fiyat WP3, D-HB-1] 1) Katalog (ürün bilgisi) merchantSku → sıkıştırılmış kayıt; 2) listing akışı (fiyat/stok) sürücüdür,
            // her kayıt katalogla birleştirilip Stager'a HAM düz kayıt olarak verilir (eskiden iç model veriliyordu). Katalog okunamazsa
            // hata fırlar (sessiz ürün bilgisiz içe aktarım yok); katalogda bulunmayan listing kaydı yine akar (`catalogMatched:false`).
            const catalog = await this.loadCatalogIndex();
            const { items: rest, total } = await this.connector.fetchListingPages(query, {
                limit, maxPages: STREAM_MAX_PAGES, maxRecords: STREAM_MAX_RECORDS,
                onPage: async (products: any[]) => {
                    const records = products.map((p: any) => toImportRecord(p, catalog.get(String(p?.merchantSku ?? ''))));
                    await callback(records);
                    totalProcessed += products.length;
                },
            });
            const totalElements = total ?? totalProcessed;
            const incomplete = getIncomplete(rest);
            if (incomplete) {
                return {
                    totalElements, totalProcessed, totalPages: Math.ceil(totalProcessed / limit) || 1, status: 'FAILED',
                    error: `Hepsiburada listing akışı tamamlanamadı (${incomplete.reason}); ${totalProcessed} kayıt işlendi.`,
                };
            }

            return {
                totalElements,
                totalProcessed,
                totalPages: Math.ceil(totalElements / limit) || 1,
                status: 'COMPLETED'
            };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaProductService:getProductsAndPersist] ${error.message}`);
        }
    }

    /** Katalog: merchantSku → sıkıştırılmış ürün bilgisi (bellekte yalnız gereken alanlar; tavan STREAM_MAX_RECORDS). */
    private async loadCatalogIndex(): Promise<Map<string, HbCatalogCompact>> {
        const index = new Map<string, HbCatalogCompact>();
        const rest = await this.connector.fetchCatalogPages({
            size: 100, maxPages: STREAM_MAX_PAGES, maxRecords: STREAM_MAX_RECORDS,
            onPage: async (items: any[]) => { for (const raw of items) { const c = compactCatalogProduct(raw); if (c) index.set(c.merchantSku, c); } },
        });
        const incomplete = getIncomplete(rest);
        if (incomplete) log.warn('HB_CATALOG_INCOMPLETE', `Hepsiburada katalog listesi tamamlanamadı (${incomplete.reason}); ${index.size} ürün bilgisi okundu.`, { tenantId: this.params.clientId });
        return index;
    }

    /**
     * [WP3, D-HB-1] Stager'ın ham kaydı (`toImportRecord`) → iç model. Yerel kategori AttributeMappings'ten (platform kategori → yerel);
     * marka HB'de metin olduğundan yerel marka kimliği çözülmez (null; Validator "marka seçin" der — Ek A P1-7, marka adı varyant mapping'inde).
     */
    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> {
        const variant = this.mapper.toInternalVariant(stagedProduct, { choices: [] });
        const mp = this.params.mappingProvider;
        const category = mp && stagedProduct?.categoryId ? (await mp.getLocalCategoryId(stagedProduct.categoryId)) ?? null : null;
        return {
            product: {
                title: variant.title,
                brand: null,
                category,
                maincode: variant.maincode,
                hasVariant: false
            },
            variant
        };
    }

    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> {
        return {
            category: rawData.categoryId || 0,
            salePrice: rawData.price || 0,
            marketPrice: rawData.listPrice || rawData.price || 0,
            quantity: rawData.stockCount || 0,
            images: Array.isArray(rawData.images) ? rawData.images : [],
            barcode: rawData.barcode || '',
            stockcode: rawData.merchantSku || '',
            maincode: rawData.variantGroupId || rawData.merchantSku || '',
            productId: rawData.hbSku || rawData.id || '',
            platformCategoryId: rawData.categoryId || 0,
            requiredAttributes: []
        };
    }

    // Temel validasyon — TRANSFER status check yok (Dispatcher mode routing'i zaten halleder)
    public async validate(variant: IVariant): Promise<IValidationResult> {
        if (!variant.barcode || String(variant.barcode).trim() === "") {
            return { result: false, reason: "Barkod eksik.", errors: ["Barkod eksik."] };
        }
        const vPrice = channelPricePair(variant, integrationCode);
        if (!vPrice?.salePrice || vPrice.salePrice <= 0) {
            return { result: false, reason: "Fiyat geçersiz.", errors: ["Fiyat geçersiz."] };
        }
        return { result: true, reason: "", errors: [] };
    }
}

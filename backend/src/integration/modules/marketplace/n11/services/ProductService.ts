import { IBatchProcessResult, IBatchCheckPayload, IInternalResult, IFetchProductsResult, IInternalConversionResult, IPlatformProductSummary, IVariant, IValidationResult, IExportStagedProduct, PLATFORM_PROCESS } from '@interfaces/index';
import { ProductConnector } from '../api/ProductConnector';
import { paginatePage, readTotal, N11_STREAM_MAX_PAGES, N11_STREAM_MAX_RECORDS } from '../api/paginatePage';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { ProductMapper, N11_MAX_SKUS_PER_TASK } from '../transformers/Mappers';
import { integrationCode } from '../constants';
import type { ICategoryAttribute } from '@interfaces/index';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class ProductService {
    private connector: ProductConnector;
    private mapper: ProductMapper;
    private clientId: string;

    /** `categoryService` (opsiyonel): verilirse gönderimde kategori özellikleri okunur, değerler doğrulanır ve ZORUNLU denetim yapılır (C-1). */
    constructor(private params: any, private service: Service, private categoryService?: { fetchCategoryAttributes(id: string): Promise<ICategoryAttribute[]> }) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ProductConnector(this.service, this.params);
        this.mapper = new ProductMapper();
    }

    /**
     * [INT-05 / F-02] Ürün akışı TÜM sayfaları dolaşır (ortak `paginate`, akış kipi: sayfa başına callback, bellekte toplanmaz). ÖNCEKİ DAVRANIŞ
     * yalnız ilk 100 ürünü alıp COMPLETED dönerdi (sessiz kesme). Durma: toplam (`pagingData.totalCount`) | dönen < 100 | boş sayfa. Tavan
     * (1000 sayfa / 100.000 kayıt) ya da tekrar eden sayfa (sunucu sayfa parametresini yok saydı) => FAILED (+ yapılandırılmış uyarı), COMPLETED DEĞİL.
     */
    public async streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> {
        let processed = 0;
        let pages = 0;
        let platformTotal: number | undefined;
        try {
            const collected = await paginatePage(async (page, limit) => {
                const response = await this.connector.fetchProductListRest({ pageSize: limit, currentPage: page });
                platformTotal = readTotal(response.pagingData?.totalCount) ?? platformTotal;
                return { items: response.products || [], total: readTotal(response.pagingData?.totalCount) };
            }, {
                operation: 'streamProducts', clientId: this.clientId,
                maxPages: N11_STREAM_MAX_PAGES, maxRecords: N11_STREAM_MAX_RECORDS,
                onPage: async (items) => { await callback(items); processed += items.length; pages++; },
            });
            const incomplete = getIncomplete(collected);
            if (incomplete) {
                return {
                    status: 'FAILED', totalElements: platformTotal || processed, totalProcessed: processed, totalPages: pages,
                    error: `N11 ürün akışı tamamlanamadı (${incomplete.reason}); ${processed} kayıt işlendi.`,
                };
            }
            return { status: 'COMPLETED', totalElements: platformTotal || processed, totalProcessed: processed, totalPages: pages || 1 };
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ProductService:streamProducts] ${error.message}`);
        }
    }

    /**
     * [eslesme-fiyat WP4, D-N11-1 / D-N11-4] Kategori kimliği TEK KAYNAK `AttributeMappings` (mappingProvider), yoksa içe aktarılmış
     * üründeki N11 kimliği (`mapping.categoryId`). Marka = yerel `Brands.title` (N11'de "Marka" özelliği, serbest metin kabul eder).
     */
    private async resolveCategoryAndBrand(variant: any, sp: IExportStagedProduct): Promise<{ catId: string; brandName?: string }> {
        const mp = this.params.mappingProvider;
        const vMap = variant.platforms?.[integrationCode]?.mapping || {};
        const empty = (v: any) => v === undefined || v === null || v === '' || v == -1;
        const localCat = variant.product?.category;
        let catId: any = mp && localCat ? await mp.getPlatformCategoryId(String(localCat)) : undefined;
        if (empty(catId)) catId = vMap.categoryId;
        if (empty(catId)) catId = sp.category?.id;
        if (empty(catId)) throw new Error('N11 kategori eşlemesi bulunamadı.');

        let brandName: string | undefined;
        const localBrand = variant.product?.brand;
        if (mp && localBrand && typeof mp.getLocalBrandTitle === 'function') {
            const t = await mp.getLocalBrandTitle(String(localBrand));
            if (t && t !== 'Bilinmeyen Marka') brandName = String(t);
        }
        brandName ??= vMap.brandName || (typeof sp.brand?.title === 'string' ? sp.brand.title : undefined);
        return { catId: String(catId), brandName };
    }

    /**
     * [eslesme-fiyat WP4, 02-ekler/n11 C-1 (P0)] Tam `product-create` gövdesi (`toRestCreateSku`): attributes (Marka dahil),
     * shipmentTemplate, vatRate, productMainId, preparingDay, maxPurchaseQuantity. Eksik/geçersiz alanlı varyant GÖNDERİLMEZ
     * (`failedVariants`, alan bazlı mesaj). 1000 SKU/istek sınırında bölünür; her varyant kendi görevinin kimliğini taşır.
     */
    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        const integrator = `Entegrasyonik_${this.clientId}`;
        const settings = this.params.integrationSettings?.settings || {};
        const skus: any[] = [];
        const ok: { sp: IExportStagedProduct; variantId: any }[] = [];
        const failedVariants: any[] = [];
        const attrCache = new Map<string, Promise<ICategoryAttribute[]>>();
        const attrsOf = (catId: string) => {
            if (!this.categoryService) return Promise.resolve([] as ICategoryAttribute[]);
            let p = attrCache.get(catId);
            if (!p) { p = this.categoryService.fetchCategoryAttributes(catId); attrCache.set(catId, p); }
            return p;
        };

        for (const sp of stagedProducts) {
            const variant: any = sp.payload || {};
            const variantId = sp.productId ?? variant._id; // eski N11 davranışı: productId
            try {
                const { catId, brandName } = await this.resolveCategoryAndBrand(variant, sp);
                const catAttrs = await attrsOf(catId);
                const { sku, errors } = this.mapper.toRestCreateSku(sp, { categoryId: catId, brandName, catAttrs, settings });
                if (errors.length) throw new Error(`N11 gönderim verisi eksik: ${errors.join('; ')}`);
                skus.push(sku);
                ok.push({ sp, variantId });
            } catch (e: any) {
                if (IntegrationError.isIntegrationError(e)) throw e;
                failedVariants.push({ variantId, barcode: sp.barcode, reason: e.message });
            }
        }

        if (skus.length === 0) return { trackingId: null, result: false, variantList: [], failedVariants };

        try {
            const variantList: any[] = [];
            let firstId: string | undefined;
            let allOk = true;
            for (let i = 0; i < skus.length; i += N11_MAX_SKUS_PER_TASK) {
                const response = await this.connector.transferProductsRest({ payload: { integrator, skus: skus.slice(i, i + N11_MAX_SKUS_PER_TASK) } });
                const taskId = response?.id;
                if (!taskId) allOk = false;
                firstId ??= taskId !== undefined && taskId !== null ? String(taskId) : undefined;
                for (const { sp, variantId } of ok.slice(i, i + N11_MAX_SKUS_PER_TASK)) {
                    variantList.push({ variantId, barcode: sp.barcode, stockCode: sp.stockcode, taskId });
                }
            }
            return {
                trackingId: firstId || 'N11_REST_' + Date.now(),
                result: allOk,
                variantList,
                failedVariants
            };
        } catch (error: any) {
            // [ADR-0006 adım 3] TERS ÇEVRİLDİ: ÖNCEKİ DAVRANIŞ bağlayıcı (transferProductsRest) çağrısı
            // BAŞARISIZ olduğunda (AUTH/UNAVAILABLE/RATE_LIMITED dahil) sessizce { result:false } dönerdi
            // ("tüm ürünler doğrulama hatasıyla reddedildi" ile "API çağrısı hiç yapılamadı" ayırt
            // edilemiyordu; yasaklanmış "sahte normal başarısızlık" deseni). Artık IntegrationError fırlatılır.
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ProductService:transferProducts] ${error.message}`);
        }
    }

    public async updateProductPrice(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        try {
            const integrator = `Entegrasyonik_${this.clientId}`;
            const payload = this.mapper.mapToRestBulkUpdate(stagedProducts, integrator);
            const response = await this.connector.updatePriceRest(payload);
            
            const variantList = stagedProducts.map(sp => ({
                variantId: sp.productId,
                barcode: sp.barcode,
                stockCode: sp.stockcode,
                taskId: response.id
            }));

            return { trackingId: response.id?.toString(), result: !!response.id, variantList, failedVariants: [] };
        } catch (error: any) {
            // [ADR-0006 adım 3] TERS ÇEVRİLDİ: bkz. transferProducts üzerindeki not.
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ProductService:updateProductPrice] ${error.message}`);
        }
    }

    public async updateProductStock(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        try {
            const integrator = `Entegrasyonik_${this.clientId}`;
            const payload = this.mapper.mapToRestBulkUpdate(stagedProducts, integrator);
            const response = await this.connector.updateStockRest(payload);
            
            const variantList = stagedProducts.map(sp => ({
                variantId: sp.productId,
                barcode: sp.barcode,
                stockCode: sp.stockcode,
                taskId: response.id
            }));

            return { trackingId: response.id?.toString(), result: !!response.id, variantList, failedVariants: [] };
        } catch (error: any) {
            // [ADR-0006 adım 3] TERS ÇEVRİLDİ: bkz. transferProducts üzerindeki not.
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ProductService:updateProductStock] ${error.message}`);
        }
    }

    public async updateProduct(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        try {
            const integrator = `Entegrasyonik_${this.clientId}`;
            const payload = this.mapper.mapToRestBulkCreate(stagedProducts, integrator);
            const response = await this.connector.updateProductRest(payload);
            
            const variantList = stagedProducts.map(sp => ({
                variantId: sp.productId,
                barcode: sp.barcode,
                stockCode: sp.stockcode,
                taskId: response.id
            }));

            return { trackingId: response.id?.toString(), result: !!response.id, variantList, failedVariants: [] };
        } catch (error: any) {
            // [ADR-0006 adım 3] TERS ÇEVRİLDİ: bkz. transferProducts üzerindeki not.
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ProductService:updateProduct] ${error.message}`);
        }
    }

    public async updateProductVariant(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        return this.updateProduct(stagedProducts);
    }

    public async updateProductDelivery(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        return this.updateProduct(stagedProducts);
    }

    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        try {
            if (payload.trackingId) {
                const response = await this.connector.checkBatchProductRest(payload.trackingId);
                
                const items = response.items || [];
                if (items.length === 0) return undefined;

                const terminalStatuses = ['COMPLETED', 'FAILED', 'REJECTED', '0', '2', 'SUCCESS', 'SUCCESSFUL', 'FAILURE', 'ERROR'];
                const isTerminal = items.every((item: any) => terminalStatuses.includes(String(item.status).toUpperCase()));

                if (!isTerminal) return undefined;

                return items.map((item: any) => {
                    const status = String(item.status).toUpperCase();
                    let internalStatus: 'COMPLETED' | 'FAILED' | 'WAITING' = 'WAITING';
                    if (['COMPLETED', '0', 'SUCCESS', 'SUCCESSFUL'].includes(status)) {
                        internalStatus = (payload.mode === PLATFORM_PROCESS.TRANSFER) ? 'WAITING' : 'COMPLETED';
                    } else if (['FAILED', 'REJECTED', 'FAILURE', 'ERROR', '2'].includes(status)) {
                        internalStatus = 'FAILED';
                    }
                    
                    const matchIdentifier = item.stockCode || item.barcode || item.productSellerCode;
                    return {
                        matchValue: matchIdentifier,
                        barcode: item.barcode,
                        status: internalStatus,
                        messages: item.reasons || [(internalStatus === 'FAILED' ? 'İşlem başarısız' : 'İşlem tamamlandı')],
                        mapping: { taskId: item.id, stockCode: item.stockCode, barcode: item.barcode }
                    };
                });
            }
            return [];
        } catch (error: any) {
            // [ADR-0006 adım 3] TERS ÇEVRİLDİ: ÖNCEKİ DAVRANIŞ hatayı yakalayıp sessizce `[]` dönerdi
            // ("henüz sonuç yok" ile "sorgu başarısız" ayırt edilemiyordu, yasaklanmış "catch->[]" deseni).
            // Artık IntegrationError fırlatılır.
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ProductService:checkBatchProduct] ${error.message}`);
        }
    }

    public async updateProductStatuses(payload: { barcodes: string[], matchValues: string[] }): Promise<IInternalResult[]> {
        try {
            const identifiers = payload.matchValues || payload.barcodes || [];
            if (identifiers.length === 0) return [];

            const response = await this.connector.fetchProductListRest({ page: 0, size: 250 });
            const products = response.products || [];

            return identifiers.map(id => {
                const product = products.find((p: any) => 
                    p.productSellerCode === id || p.barcode === id || p.sellerStockCode === id
                );

                if (!product) return { matchValue: id, status: 'WAITING', messages: ['Ürün N11 listesinde henüz bulunamadı.'] } as IInternalResult;

                const isApproved = product.approvalStatus === 'Approved';
                return {
                    matchValue: id,
                    barcode: product.barcode,
                    status: isApproved ? 'COMPLETED' : 'WAITING',
                    messages: [isApproved ? 'Ürün yayında.' : 'Ürün onay bekliyor.'],
                    mapping: { id: product.productSellerCode, stockcode: product.productSellerCode }
                } as IInternalResult;
            });
        } catch (error: any) {
            // [ADR-0006 adım 3] TERS ÇEVRİLDİ: bkz. checkBatchProduct üzerindeki not.
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11ProductService:updateProductStatuses] ${error.message}`);
        }
    }

    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> {
        return { product: { title: '', brand: null, category: null, maincode: '', hasVariant: false }, variant: {} as any };
    }

    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> {
        return { category: '', salePrice: 0, marketPrice: 0, quantity: 0, images: [], barcode: '', stockcode: '', maincode: '', productId: '', platformCategoryId: '', requiredAttributes: [] };
    }

    public async validate(variant: IVariant): Promise<IValidationResult> {
        return { result: true, errors: [] };
    }
}

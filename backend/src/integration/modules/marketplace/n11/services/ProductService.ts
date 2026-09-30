import { IBatchProcessResult, IBatchCheckPayload, IInternalResult, IFetchProductsResult, IInternalConversionResult, IPlatformProductSummary, IVariant, IValidationResult, IExportStagedProduct, PLATFORM_PROCESS } from '@interfaces/index';
import { ProductConnector } from '../api/ProductConnector';
import { paginatePage, readTotal, N11_STREAM_MAX_PAGES, N11_STREAM_MAX_RECORDS } from '../api/paginatePage';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { ProductMapper } from '../transformers/Mappers';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class ProductService {
    private connector: ProductConnector;
    private mapper: ProductMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
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

    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        try {
            const integrator = `Entegrasyonik_${this.clientId}`;
            const payload = this.mapper.mapToRestBulkCreate(stagedProducts, integrator);
            
            const response = await this.connector.transferProductsRest(payload);
            
            const variantList = stagedProducts.map(sp => ({
                variantId: sp.productId,
                barcode: sp.barcode,
                stockCode: sp.stockcode,
                taskId: response.id // Tüm kalemler aynı batch ID altında
            }));

            return {
                trackingId: response.id?.toString() || 'N11_REST_' + Date.now(),
                result: !!response.id,
                variantList,
                failedVariants: []
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

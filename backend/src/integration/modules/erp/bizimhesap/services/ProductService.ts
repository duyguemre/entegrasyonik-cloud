import { IBatchProcessResult, IFetchProductsResult, IInternalConversionResult, IInternalResult, IPlatformProductSummary, IValidationResult, IVariant, IBatchCheckPayload } from '@interfaces/index';
import { integrationCode } from '../constants';
import { ProductTransformer } from '../transformers/ProductTransformer';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class ProductService {
    private transformer: ProductTransformer;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
        this.transformer = new ProductTransformer();
    }

    private async fetchAllProducts(): Promise<any[]> {
        const urls = this.params.integrationSettings?.urls || {};
        const settings = this.params.integrationSettings?.settings || {};
        const productListUrl = (urls.productListUrl || 'products')
            .replace('<SELLERID>', settings.sellerId || '');

        const response = await this.service.get(productListUrl);
        return response?.data?.data?.products || response?.data?.products || response?.data || [];
    }

    public async streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> {
        try {
            const platformProducts = await this.fetchAllProducts();

            if (query?.init === true) {
                const catalog = this.transformer.extractCatalog(platformProducts);
                await this.saveCatalog(catalog);
                return { totalElements: 0, totalProcessed: 0, totalPages: 1, status: 'COMPLETED' };
            }

            const converted = await this.transformer.convertProducts(platformProducts, this.params.mappingProvider);
            if (converted.length > 0) await callback(converted);

            return { totalElements: converted.length, totalProcessed: converted.length, totalPages: 1, status: 'COMPLETED' };
        } catch (error: any) {
            return { totalElements: 0, totalProcessed: 0, totalPages: 0, status: 'FAILED', error: error.message };
        }
    }

    private async saveCatalog(catalog: any): Promise<void> {
        const clientDB = this.params.clientDB;
        if (!clientDB) return;
        await clientDB.getClientIntegrationModel().findOneAndUpdate(
            { 'erp.code': integrationCode },
            { $set: { 'erp.$.settings.catalog': catalog } }
        );
    }

    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> {
        const raw = stagedProduct.rawData || stagedProduct;
        const [brandId, categoryId] = await Promise.all([
            this.params.mappingProvider?.getLocalBrandId?.(raw.brand) ?? raw.brand,
            this.params.mappingProvider?.getLocalCategoryId?.(raw.category) ?? stagedProduct.localCategoryId
        ]);

        return {
            product: {
                title: raw.title,
                brand: brandId || null,
                category: categoryId || null,
                maincode: raw.code || raw.barcode || raw.id,
                hasVariant: !!(raw.variantName && raw.variantName.trim())
            },
            variant: {
                code: integrationCode,
                maincode: raw.code || raw.barcode,
                title: raw.title,
                barcode: String(raw.barcode || ''),
                stockcode: String(raw.code || ''),
                stock: Number(raw.quantity || 0),
                prices: {
                    isPlatformBasedPrice: false,
                    price: Number(raw.price || 0),
                    salePrice: Number(raw.price || 0),
                    marketPrice: Number(raw.price || 0)
                },
                images: [],
                choices: [],
                platforms: { [integrationCode]: { prices: {}, infos: {}, upload: {}, mappings: {}, attributes: {} } },
                onSale: raw.isActive === 1,
                tempId: String(raw.id || '')
            } as any
        };
    }

    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> {
        return {
            category: rawData.category || '',
            salePrice: Number(rawData.price || 0),
            marketPrice: Number(rawData.price || 0),
            quantity: Number(rawData.quantity || 0),
            images: [],
            barcode: String(rawData.barcode || ''),
            stockcode: String(rawData.code || ''),
            maincode: String(rawData.code || rawData.barcode || ''),
            productId: String(rawData.id || ''),
            platformCategoryId: rawData.category || '',
            requiredAttributes: []
        };
    }

    public async validate(variant: IVariant): Promise<IValidationResult> {
        return { result: true };
    }

    /**
     * [ADR-0006 Karar 2] TERS ÇEVRİLDİ: ÖNCEKİ DAVRANIŞ hata durumunda sessizce `[]` dönerdi (madde a:
     * "hata yakalayıp [] ... dönmek" yasak — Sync.syncTaskStatuses bunu "sonuç yok, WAITING'de bekle"
     * ile karıştırıp gerçek hatayı gizliyordu). Artık hata YUTULMAZ, IntegrationError olarak (veya
     * korunarak) fırlatılır; çağıran (Sync) bunu görür.
     */
    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> {
        const platformProducts = await this.fetchAllProducts();
        return this.transformer.toInternalStatusResult(platformProducts);
    }

    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        return undefined;
    }

    /**
     * [ADR-0006 Karar 2] TERS ÇEVRİLDİ: ÖNCEKİ DAVRANIŞ generic `Error` fırlatıyordu (sahte başarı
     * DEĞİL, ama ADR'nin bağlayıcı tek hata tipi -- IntegrationError -- sözleşmesine uymuyordu).
     * Artık `IntegrationError('NOT_SUPPORTED', ...)` fırlatılır; Publisher/OrderErrorHandler bunu
     * `retryable:false` olarak doğru sınıflandırır (davranışsal sonuç aynı: kalıcı FAILED).
     */
    public notSupported(op: string): IBatchProcessResult {
        throw new IntegrationError('NOT_SUPPORTED', `${op} bu entegrasyon için desteklenmiyor`, {
            integrationCode, operation: op, clientId: this.clientId,
        });
    }
}

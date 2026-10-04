import { IBatchProcessResult, IFetchProductsResult, IInternalConversionResult, IInternalResult, IPlatformProductSummary, IValidationResult, IVariant, IBatchCheckPayload } from '@interfaces/index';
import { integrationCode } from '../constants';
import { ProductTransformer } from '../transformers/ProductTransformer';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { BIZIMHESAP_PRODUCTS_LIST } from '../contracts';

/** ADR-0032 H1: kanal dış ürün kimliği. Yeni yazım `mapping`; okuma eski `mappings` kayıtlarını da tanır (göç yok). */
export const platformProductId = (channelState: any): string | undefined =>
    channelState?.mapping?.productId ?? channelState?.mappings?.productId;

/**
 * [eslesme-fiyat WP4, 02-ekler/bizimhesap C-4 / D-BH-1] Zarf `{resultCode, errorText, data:{products}}`; iş hatası HTTP 200 + `resultCode:0`.
 * Eskiden hata zarfı (nesne) "ürün listesi" diye dönüyordu (sahte başarı / TypeError). Dizi değilse VALIDATION fırlatılır.
 */
export function readProductsEnvelope(body: any, clientId: string): any[] {
    if (Array.isArray(body)) return body;
    if (body && typeof body === 'object') {
        if (body.resultCode !== undefined && Number(body.resultCode) === 0) {
            throw new IntegrationError('VALIDATION', `Bizimhesap hata döndürdü: ${String(body.errorText || 'resultCode=0').slice(0, 200)}`, {
                integrationCode, operation: 'fetchProducts', clientId, platformCode: 'BIZIMHESAP_RESULT_ERROR',
            });
        }
        const list = body.data?.products ?? body.products ?? body.data;
        if (Array.isArray(list)) return list;
        if (list === undefined || list === null) return [];
    }
    if (body === undefined || body === null || body === '') return [];
    throw new IntegrationError('VALIDATION', 'Bizimhesap ürün yanıtı beklenen zarfta değil (data.products dizi değil).', {
        integrationCode, operation: 'fetchProducts', clientId, platformCode: 'BIZIMHESAP_ENVELOPE',
    });
}

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
        observeResponseSchema(BIZIMHESAP_PRODUCTS_LIST, response?.data, { clientId: this.params.clientId }); // F-09: yalnız gözlem (C7a)
        return readProductsEnvelope(response?.data, this.clientId);
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
                platforms: { [integrationCode]: { infos: {}, upload: {}, mapping: {}, attributes: {} } }, // [WP5] boş `prices: {}` kalktı (Ek B P2-6)
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

    /** [faz4-conf-fix C8b, playbook §4.3] Batch kavramı yok (yazmalar senkron/yok): `undefined` yalnız "sonuçlanmadı" içindir => NOT_SUPPORTED. */
    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        throw new IntegrationError('NOT_SUPPORTED', 'checkBatchProduct bu entegrasyon için desteklenmiyor (batch kavramı yok)', {
            integrationCode, operation: 'checkBatchProduct', clientId: this.clientId,
        });
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

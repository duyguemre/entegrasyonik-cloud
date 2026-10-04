import {
    IExportStagedProduct, IBatchProcessResult, IFetchProductsResult,
    IInternalConversionResult, IInternalResult, IPlatformProductSummary,
    IValidationResult, IVariant, IBatchCheckPayload, PLATFORM_PROCESS
} from '@interfaces/index';
import { integrationCode } from '../constants';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { ProductTransformer } from '../transformers/ProductTransformer';
import { CategoryService } from './CategoryService';
import Service from './Service';
import { paginate } from '@integration/modules/common/adapter/paginate';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { maxPages } from './paging';
import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { IDEASOFT_PRODUCTS_LIST } from '../contracts';
import { channelPricePair } from '@platform/core/pricing/effectivePrice';

/**
 * [DB-09 / ADR-0032 H1] Kanal dış kimliği tek anahtar `mapping` altında YAZILIR. Okuma geriye dönük olarak eski
 * `mappings` adını da tanır (eski kayıtlar için; göç/rename yok, yeni yazımda `mapping` kazanır).
 */
export const platformProductId = (channelState: any): string | undefined =>
    channelState?.mapping?.productId ?? channelState?.mappings?.productId;


export class ProductService {
    private transformer: ProductTransformer;
    private categoryService: CategoryService;

    constructor(private params: any, private service: Service) {
        this.transformer = new ProductTransformer();
        this.categoryService = new CategoryService(params, service);
    }

    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        return this.processBatch(stagedProducts, PLATFORM_PROCESS.TRANSFER);
    }
    public async updateProductPrice(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE_PRICE);
    }
    public async updateProductStock(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE_STOCK);
    }
    public async updateProduct(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE);
    }
    public async updateProductVariant(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE);
    }
    public async updateProductDelivery(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE);
    }

    private async processBatch(stagedProducts: IExportStagedProduct[], mode: PLATFORM_PROCESS): Promise<IBatchProcessResult> {
        const variantList: any[] = [];
        const failedVariants: any[] = [];
        const settings = this.params.integrationSettings?.settings || {};
        const urls = this.params.integrationSettings?.urls || {};

        for (const staged of stagedProducts) {
            const variant = staged.payload;
            if (!variant) continue;

            try {
                if (mode === PLATFORM_PROCESS.TRANSFER) {
                    await this.doTransfer(variant, settings, urls);
                } else if (mode === PLATFORM_PROCESS.UPDATE_STOCK) {
                    await this.doUpdateStock(variant, urls);
                } else if (mode === PLATFORM_PROCESS.UPDATE_PRICE) {
                    await this.doUpdatePrice(variant, urls);
                } else if (mode === PLATFORM_PROCESS.UPDATE) {
                    await this.doUpdate(variant, settings, urls);
                }
                variantList.push({ variantId: (variant as any)._id, barcode: (variant as any).barcode });
            } catch (e: any) {
                failedVariants.push({ variantId: (variant as any)._id, barcode: (variant as any).barcode, reason: e.message });
            }
        }

        return { trackingId: null, result: variantList.length > 0, variantList, failedVariants, type: mode };
    }

    private async doTransfer(variant: IVariant, settings: any, urls: any): Promise<void> {
        const [catId, brandId] = await Promise.all([
            this.params.mappingProvider.getPlatformCategoryId((variant as any).product?.category),
            this.params.mappingProvider.getPlatformBrandId((variant as any).product?.brand)
        ]);
        if (!catId || catId === -1 || !brandId) throw new Error('Eşleşme bulunamadı');

        const categoryAttributes = await this.categoryService.fetchCategoryAttributes(String(catId));
        const ideasoftVariant = this.transformer.buildIdeasoftVariant(
            variant, (variant as any).product || {}, brandId, catId, categoryAttributes, settings
        );

        const product = (variant as any).product;
        const hasVariant = product?.hasVariant === true;
        const transferUrl = urls.transferUrl || 'products';

        if (hasVariant) {
            let parentProductId = platformProductId(product?.platforms?.[integrationCode]);
            if (!parentProductId) {
                const productPayload = this.transformer.buildIdeasoftProduct({
                    ...product,
                    platformCategoryId: catId,
                    platformBrandId: brandId,
                    totalStock: (variant as any).stock || 0,
                    minPrice: (variant as any).prices?.salePrice || 0
                }, settings);
                const productResp = await this.service.post(transferUrl, productPayload);
                parentProductId = productResp?.data?.id;
                if (!parentProductId) throw new Error('Ana ürün oluşturulamadı');
                await this.updateProductPlatformId((variant as any).product?._id, parentProductId);
            }

            ideasoftVariant.parent = { id: parentProductId };
            const variantResp = await this.service.post(transferUrl, ideasoftVariant);
            const variantPlatformId = variantResp?.data?.id;
            if (variantPlatformId) {
                await this.updateVariantPlatformId((variant as any)._id, variantPlatformId);
            }
        } else {
            const resp = await this.service.post(transferUrl, ideasoftVariant);
            const platformId = resp?.data?.id;
            if (platformId) {
                await this.updateVariantPlatformId((variant as any)._id, platformId);
            }
        }
    }

    private async doUpdateStock(variant: IVariant, urls: any): Promise<void> {
        const productId = platformProductId((variant as any).platforms?.[integrationCode]);
        if (!productId) throw new Error('Ürün ID bulunamadı');
        const updateUrl = (urls.updateUrl || 'products/<PRODUCTID>').replace('<PRODUCTID>', productId);
        await this.service.put(updateUrl, { stockAmount: Number((variant as any).stock || 0) });
    }

    private async doUpdatePrice(variant: IVariant, urls: any): Promise<void> {
        const productId = platformProductId((variant as any).platforms?.[integrationCode]);
        if (!productId) throw new Error('Ürün ID bulunamadı');
        const salePrice = channelPricePair(variant, integrationCode).salePrice || 0;
        const updateUrl = (urls.updateUrl || 'products/<PRODUCTID>').replace('<PRODUCTID>', productId);
        await this.service.put(updateUrl, { price1: Math.round(Number(salePrice) * 100) / 100 });
    }

    private async doUpdate(variant: IVariant, settings: any, urls: any): Promise<void> {
        const productId = platformProductId((variant as any).platforms?.[integrationCode]);
        if (!productId) throw new Error('Ürün ID bulunamadı');
        const [catId, brandId] = await Promise.all([
            this.params.mappingProvider.getPlatformCategoryId((variant as any).product?.category),
            this.params.mappingProvider.getPlatformBrandId((variant as any).product?.brand)
        ]);
        const categoryAttributes = await this.categoryService.fetchCategoryAttributes(String(catId));
        const payload = this.transformer.buildIdeasoftVariant(variant, (variant as any).product || {}, brandId, catId, categoryAttributes, settings);
        const updateUrl = (urls.updateUrl || 'products/<PRODUCTID>').replace('<PRODUCTID>', productId);
        await this.service.put(updateUrl, payload);
    }

    private async updateVariantPlatformId(variantId: any, platformId: any): Promise<void> {
        const clientDB = this.params.clientDB;
        if (!clientDB || !variantId) return;
        await clientDB.getVariantModel().updateOne(
            { _id: variantId },
            { $set: { [`platforms.${integrationCode}.mapping.productId`]: platformId } }
        );
    }

    private async updateProductPlatformId(productId: any, platformId: any): Promise<void> {
        const clientDB = this.params.clientDB;
        if (!clientDB || !productId) return;
        await clientDB.getProductModel().updateOne(
            { _id: productId },
            { $set: { [`platforms.${integrationCode}.mapping.productId`]: platformId } }
        );
    }

    public async validate(variant: IVariant): Promise<IValidationResult> {
        return { result: true, reason: 'Urun gonderilmeye uygun.' };
    }

    public async streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> {
        const pageLimit = 100;
        const maxConcurrent = 5;
        let currentPage = 1;
        let totalProcessed = 0;
        let round = 0;

        const urls = this.params.integrationSettings?.urls || {};
        const productListUrl = urls.productListUrl || 'products';

        try {
            // [INT-05] Ortak paginate, akış kipi: 5 sayfalık TUR = bir "sayfa" (cursor kipi: tüm tur boşalana dek sürer; sayfa boyutu
            // varsayımı yok). Callback eskisi gibi SAYFA BAŞINA, tur içinde sırayla çağrılır; kayıtlar bellekte toplanmaz (collect:false).
            const rest = await paginate<any>(async () => {
                if (round++ > 0) await new Promise(r => setTimeout(r, 1000)); // turlar arası 1 sn (hız sınırı koruması)
                const batchRequests = Array.from({ length: maxConcurrent }, () => {
                    const url = `${productListUrl}?limit=${pageLimit}&page=${currentPage++}`;
                    return this.service.get(url).then((r: any) => { observeResponseSchema(IDEASOFT_PRODUCTS_LIST, r?.data, { clientId: this.params.clientId }); return r?.data || []; }); // F-09 (C7a): yalnız gözlem
                });
                const results = await Promise.all(batchRequests);
                const filled = results.filter((items: any) => Array.isArray(items) && items.length > 0);
                for (const items of filled) {
                    await callback(items);
                    totalProcessed += items.length;
                }
                return { items: filled.flat(), next: round };
            }, {
                kind: 'cursor', maxPages: maxPages(), operation: 'streamProducts', integrationCode,
                clientId: this.params.clientId || 'UnknownClient', collect: false,
            });

            // Tavan/tekrar eden sayfa: eski davranışta tekrar COMPLETED, tavan FAILED idi; artık İKİSİ de eksik veri olduğundan FAILED (sessiz kesme yok).
            const incomplete = getIncomplete(rest);
            if (incomplete) {
                return {
                    totalElements: totalProcessed, totalProcessed, totalPages: currentPage - 1, status: 'FAILED',
                    error: `Ideasoft ürün akışı tamamlanamadı (${incomplete.reason}); ${totalProcessed} kayıt işlendi.`,
                };
            }

            return { totalElements: totalProcessed, totalProcessed, totalPages: currentPage - 1, status: 'COMPLETED' };
        } catch (error: any) {
            return { totalElements: 0, totalProcessed, totalPages: currentPage, status: 'FAILED', error: error.message };
        }
    }

    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> {
        const platformProduct = stagedProduct.rawData;
        const parent = platformProduct.parent;

        const [brandId, categoryId] = await Promise.all([
            this.params.mappingProvider.getLocalBrandId(parent?.brand?.id),
            this.params.mappingProvider.getLocalCategoryId(
                parent?.productToCategories?.[parent.productToCategories.length - 1]?.category?.id
            )
        ]);

        const variant = this.transformer.toInternalVariant(platformProduct, parent);

        return {
            product: {
                title: parent?.name || platformProduct.name,
                brand: brandId || null,
                category: categoryId || stagedProduct.localCategoryId || null,
                maincode: this.transformer.mainCodeOf(platformProduct, parent), // [D-IS-2] parent yoksa kendi kimliği
                hasVariant: parent?.hasOption === 1
            },
            variant: variant as IVariant
        };
    }

    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> {
        const platformCatId = rawData.categories?.[0]?.id || rawData.categoryId;
        const pr = this.transformer.pricesOf(rawData); // [D-IS-3] taxIncluded/discount
        return {
            category: platformCatId,
            salePrice: pr.salePrice || Number(rawData.salePrice || 0),
            marketPrice: pr.marketPrice || Number(rawData.marketPrice || 0),
            quantity: Number(rawData.stockAmount || 0),
            images: (rawData.images || []).map((img: any) => typeof img === 'string' ? img : img.originalUrl || img.url || ''),
            barcode: rawData.barcode,
            stockcode: rawData.sku,
            maincode: rawData.sku,
            productId: rawData.id,
            platformCategoryId: platformCatId,
            requiredAttributes: []
        };
    }

    /** [faz4-conf-fix C8b, playbook §4.3] Batch kavramı yok (yazmalar senkron/yok): `undefined` yalnız "sonuçlanmadı" içindir => NOT_SUPPORTED. */
    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        throw new IntegrationError('NOT_SUPPORTED', 'checkBatchProduct bu entegrasyon için desteklenmiyor (batch kavramı yok)', {
            integrationCode, operation: 'checkBatchProduct', clientId: this.params?.clientId || 'UnknownClient',
        });
    }

    /**
     * Not: `this.service.get` artık ResilientHttpClient üzerinden geçer ve hata durumunda
     * IntegrationError fırlatır (bkz. Service.ts); burada YAKALAMIYORUZ (yutmuyoruz) — çağıran
     * (Sync.syncTaskStatuses) hatayı doğrudan görür (ADR-0006 Karar 2, madde a: "hata yakalayıp []
     * dönmek" yasak).
     */
    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> {
        const urls = this.params.integrationSettings?.urls || {};
        const productListUrl = urls.productListUrl || 'products';
        const response = await this.service.get(productListUrl, { limit: 100, page: 1 });
        observeResponseSchema(IDEASOFT_PRODUCTS_LIST, response.data, { clientId: this.params.clientId }); // F-09 (C7a)
        const items = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        return this.transformer.toInternalStatusResult(items);
    }
}

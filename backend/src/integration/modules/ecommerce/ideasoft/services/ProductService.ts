import {
    IExportStagedProduct, IBatchProcessResult, IFetchProductsResult,
    IInternalConversionResult, IInternalResult, IPlatformProductSummary,
    IValidationResult, IVariant, IBatchCheckPayload, PLATFORM_PROCESS
} from '@interfaces/index';
import { integrationCode } from '../constants';
import { ProductTransformer } from '../transformers/ProductTransformer';
import { CategoryService } from './CategoryService';
import Service from './Service';

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
            let parentProductId = product?.platforms?.[integrationCode]?.mappings?.productId;
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
        const productId = (variant as any).platforms?.[integrationCode]?.mappings?.productId;
        if (!productId) throw new Error('Ürün ID bulunamadı');
        const updateUrl = (urls.updateUrl || 'products/<PRODUCTID>').replace('<PRODUCTID>', productId);
        await this.service.put(updateUrl, { stockAmount: Number((variant as any).stock || 0) });
    }

    private async doUpdatePrice(variant: IVariant, urls: any): Promise<void> {
        const productId = (variant as any).platforms?.[integrationCode]?.mappings?.productId;
        if (!productId) throw new Error('Ürün ID bulunamadı');
        const salePrice = (variant as any).platforms?.[integrationCode]?.prices?.salePrice
            || (variant as any).prices?.salePrice || 0;
        const updateUrl = (urls.updateUrl || 'products/<PRODUCTID>').replace('<PRODUCTID>', productId);
        await this.service.put(updateUrl, { price1: Math.round(Number(salePrice) * 100) / 100 });
    }

    private async doUpdate(variant: IVariant, settings: any, urls: any): Promise<void> {
        const productId = (variant as any).platforms?.[integrationCode]?.mappings?.productId;
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
            { $set: { [`platforms.${integrationCode}.mappings.productId`]: platformId } }
        );
    }

    private async updateProductPlatformId(productId: any, platformId: any): Promise<void> {
        const clientDB = this.params.clientDB;
        if (!clientDB || !productId) return;
        await clientDB.getProductModel().updateOne(
            { _id: productId },
            { $set: { [`platforms.${integrationCode}.mappings.productId`]: platformId } }
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

        const urls = this.params.integrationSettings?.urls || {};
        const productListUrl = urls.productListUrl || 'products';

        try {
            while (true) {
                const batchRequests = Array.from({ length: maxConcurrent }, () => {
                    const url = `${productListUrl}?limit=${pageLimit}&page=${currentPage++}`;
                    return this.service.get(url).then((r: any) => r?.data || []);
                });

                const results = await Promise.all(batchRequests);
                let anyData = false;

                for (const items of results) {
                    if (Array.isArray(items) && items.length > 0) {
                        anyData = true;
                        await callback(items);
                        totalProcessed += items.length;
                    }
                }

                if (!anyData) break;
                await new Promise(r => setTimeout(r, 1000));
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
                maincode: `${integrationCode}_${parent?.id}`,
                hasVariant: parent?.hasOption === 1
            },
            variant: variant as IVariant
        };
    }

    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> {
        const platformCatId = rawData.categories?.[0]?.id || rawData.categoryId;
        return {
            category: platformCatId,
            salePrice: Number(rawData.price1 || rawData.salePrice || 0),
            marketPrice: Number(rawData.price1 || rawData.marketPrice || 0),
            quantity: Number(rawData.stockAmount || 0),
            images: (rawData.images || []).map((img: any) => typeof img === 'string' ? img : img.url || ''),
            barcode: rawData.barcode,
            stockcode: rawData.sku,
            maincode: rawData.sku,
            productId: rawData.id,
            platformCategoryId: platformCatId,
            requiredAttributes: []
        };
    }

    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        return undefined;
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
        const items = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        return this.transformer.toInternalStatusResult(items);
    }
}

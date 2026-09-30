import { PLATFORM_PROCESS, IVariant, IInternalAddress, IExportStagedProduct } from '@interfaces/index';
import { ProductConnector } from '../api/ProductConnector';
import { normalizeAttrValue, matchMappingValue } from '@integration/catalog/attributePayload';
import { ProductMapper } from '../transformers/ProductTransformer';
import { CategoryService } from './CategoryService';
import Service from './Service';
import { integrationCode } from '../constants';
import { IBatchCheckPayload, IBatchProcessResult, IFetchProductsResult, IInternalConversionResult, IInternalResult, IPlatformProductSummary, IValidationResult } from '@interfaces/index';
import { ShipmentService } from './ShipmentService';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { paginatePage, PZ_PAGE_LIMIT, PZ_STREAM_MAX_PAGES, PZ_STREAM_MAX_RECORDS } from '../api/paginatePage';

export class ProductService {
    private connector: ProductConnector;
    private transformer: ProductMapper;
    private categoryService: CategoryService;
    private shipmentService: ShipmentService;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new ProductConnector(this.service, this.params);
        this.transformer = new ProductMapper();
        this.categoryService = new CategoryService(this.params, this.service);
        this.shipmentService = new ShipmentService(this.params, this.service);
    }

    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.TRANSFER); }
    public async updateProductPrice(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE_PRICE); }
    public async updateProductStock(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE_STOCK); }
    public async updateProduct(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE); }
    public async updateProductVariant(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE); }
    public async updateProductDelivery(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.processBatch(stagedProducts, PLATFORM_PROCESS.UPDATE); }

    private async processBatch(stagedProducts: IExportStagedProduct[], mode: PLATFORM_PROCESS): Promise<IBatchProcessResult> {
        const batchItems: any[] = [];
        const variantList: any[] = [];
        const failedVariants: any[] = [];

        for (const stagedProduct of stagedProducts) {
            const variant = stagedProduct.payload;
            if (!variant) continue;
            const validationResult = this.transformer.validate(variant, mode);
            if (!validationResult.result) {
                failedVariants.push({ variantId: variant._id, barcode: variant.barcode, reason: validationResult.reason });
                continue;
            }

            try {
                const [catId, brandId] = await Promise.all([
                    this.params.mappingProvider.getPlatformCategoryId(variant.product?.category),
                    this.params.mappingProvider.getPlatformBrandId(variant.product?.brand)
                ]);

                if (!catId || catId == -1 || !brandId) throw new Error("Eşleşme bulunamadı.");

                const catAttrs = (mode === PLATFORM_PROCESS.TRANSFER || mode === PLATFORM_PROCESS.UPDATE)
                    ? await this.categoryService.fetchCategoryAttributes(String(catId))
                    : [];

                let addresses: IInternalAddress[] = [];
                // Pazarama'da adres yönetimi farklı olabilir ama Trendyol yapısını koruyoruz
                const item = this.transformer.toPlatformBatch(stagedProduct, mode, catAttrs, addresses, {
                    catId, brandId, settings: this.params.integrationSettings?.settings
                });

                batchItems.push(item);
                variantList.push({ variantId: variant._id, barcode: variant.barcode });
            } catch (e: any) {
                failedVariants.push({ variantId: variant._id, barcode: variant.barcode, reason: e.message });
            }
        }

        if (batchItems.length === 0) return { trackingId: null, result: false, failedVariants, variantList: [] };

        const url = this.getEndpointUrl(mode);
        let response;
        if (mode === PLATFORM_PROCESS.TRANSFER || mode === PLATFORM_PROCESS.UPDATE) {
            response = await this.connector.postBatch(url, batchItems);
        } else {
            response = await this.connector.putBatch(url, batchItems);
        }

        const body = response;

        // Handle both creation (nested object) and update (direct string UUID)
        let trackingId = typeof body?.data === 'string' ? body.data : (body?.data?.batchRequestId || body?.id);

        // Pazarama special note: Single product creation returns Zero GUID.
        // We set it to null to avoid polling a non-existent batch.
        if (trackingId === '00000000-0000-0000-0000-000000000000') {
            trackingId = null;
        }

        return {
            trackingId,
            result: true,
            variantList,
            failedVariants,
            type: mode,
            nextStatus: (trackingId === null && (mode === PLATFORM_PROCESS.TRANSFER || mode === PLATFORM_PROCESS.UPDATE)) ? 'WAITING' : undefined
        };
    }

    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> {
        const platformCatId = rawData.categoryId || rawData.pimCategoryId;
        const categoryAttributes: any = await this.categoryService.fetchCategoryAttributes(String(platformCatId));

        const criticalAttributeIds = new Set(
            categoryAttributes
                .filter((attr: any) => !!attr.varianter || !!attr.slicer)
                .map((attr: any) => String(attr._id))
        );

        const requiredAttributes = (rawData.attributes || [])
            .filter((attr: any) => criticalAttributeIds.has(String(attr.attributeId)))
            .map((attr: any) => {
                const categoryAttribute = categoryAttributes.find((catAttr: any) => String(catAttr._id) === String(attr.attributeId))
                return {
                    attributeId: String(attr.attributeId),
                    attributeName: attr.attributeName || attr.name,
                    attributeValue: String(attr.attributeValue || attr.value),
                    attributeValueId: attr.attributeValueId || attr.valueId || null,
                    slicer: categoryAttribute?.slicer,
                    varianter: categoryAttribute?.varianter,
                    allowCustom: categoryAttribute?.allowCustom,
                    required: categoryAttribute?.required,
                    multiple: categoryAttribute?.multiple
                }
            });

        return {
            category: platformCatId,
            salePrice: Number(rawData.salePrice || 0),
            marketPrice: Number(rawData.listPrice || 0),
            quantity: Number(rawData.quantity || rawData.stockCount || 0),
            images: Array.isArray(rawData.images)
                ? rawData.images.map((img: any) => typeof img === 'object' ? img.url : img)
                : [],
            barcode: rawData.barcode,
            stockcode: rawData.stockCode || rawData.code,
            maincode: rawData.productMainId || rawData.groupCode,
            productId: rawData.id || rawData.productId,
            platformCategoryId: platformCatId,
            requiredAttributes: requiredAttributes
        };
    }

    public async validate(variant: IVariant): Promise<IValidationResult> {
        return { result: true, reason: 'Urun gonderilmeye uygun.' }
    }

    public async getProductsAndPersist(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> {
        const size = PZ_PAGE_LIMIT;
        let totalProcessedAcrossPages = 0;
        let pagesSeen = 0;

        const settings = this.params.integrationSettings;
        const baseUrl = settings.urls.productListUrl;

        try {
            // [INT-05 / F-02] Ortak sayfalama (akış kipi: kayıt bellekte toplanmaz). Önceden tavan YOKTU (her sayfa dolu dönerse sonsuz);
            // artık tekrar eden sayfa/tavan FAILED olarak bildirilir.
            const rest = await paginatePage(async (page, limit) => {
                pagesSeen = page;
                const response = await this.connector.fetchProductsFromPlatform(baseUrl, { ...query, page, size: limit });
                const items = response?.data || []; // List API returns items in .data directly based on your mock
                return Array.isArray(items) ? items : [];
            }, {
                operation: 'streamProducts', clientId: this.clientId, limit: size,
                maxPages: PZ_STREAM_MAX_PAGES, maxRecords: PZ_STREAM_MAX_RECORDS,
                onPage: async (items) => {
                    // Enrich each product with full details for import
                    const detailedItems = await Promise.all(
                        items.map(async (item: any) => {
                            try {
                                return await this.connector.fetchProductDetail(item.code || item.barcode);
                            } catch (e) {
                                return item; // Fallback to list data if detail fails
                            }
                        })
                    );

                    await callback(detailedItems);
                    totalProcessedAcrossPages += items.length;
                },
            });

            const incomplete = getIncomplete(rest);
            if (incomplete) {
                return {
                    totalElements: totalProcessedAcrossPages, totalProcessed: totalProcessedAcrossPages, totalPages: pagesSeen, status: 'FAILED',
                    error: `Pazarama ürün akışı tamamlanamadı (${incomplete.reason}); ${totalProcessedAcrossPages} kayıt işlendi.`,
                };
            }
            // totalPages: bugünkü anlam = işlenen sayfa sayısı (son sayfa boş dönerse o sayılmaz)
            return { totalElements: totalProcessedAcrossPages, totalProcessed: totalProcessedAcrossPages, totalPages: Math.ceil(totalProcessedAcrossPages / size), status: 'COMPLETED' };
        } catch (error: any) {
            return { totalElements: 0, totalProcessed: totalProcessedAcrossPages, totalPages: pagesSeen, status: 'FAILED', error: error.message };
        }
    }

    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        try {
            const isUpdate = payload.mode === PLATFORM_PROCESS.UPDATE_PRICE || payload.mode === PLATFORM_PROCESS.UPDATE_STOCK;
            const batchId = payload.trackingId;

            const body = isUpdate
                ? await this.connector.fetchUpdateBatchResults(batchId)
                : await this.connector.fetchBatchResults(batchId);

            if (!body) return undefined;

            if (isUpdate) {
                // Parse Lake Projections format (body.data.data)
                const items = body.data?.data || [];
                return items.map((item: any) => {
                    const isSuccess = item.price?.status === 0 || item.operationStatusText === 'Başarılı';
                    return {
                        matchValue: item.code,
                        barcode: item.barcode || item.code,
                        status: isSuccess ? 'COMPLETED' : 'FAILED',
                        messages: [item.price?.operationDetail || item.operationStatusText || (isSuccess ? 'Başarılı' : 'Hata oluştu')]
                    };
                });
            } else {
                // Parse Product Batch format (body.data)
                const data = body.data;
                const results: IInternalResult[] = (data.batchResult || []).map((r: any) => ({
                    matchValue: r.productCode || r.code,
                    barcode: r.barcode || r.productCode || r.code,
                    status: 'COMPLETED',
                    messages: ['Başarılı']
                }));

                if (data.failedProducts && Array.isArray(data.failedProducts)) {
                    data.failedProducts.forEach((f: any) => {
                        results.push({
                            matchValue: f.productCode || f.barcode,
                            barcode: f.barcode || f.productCode,
                            status: 'FAILED',
                            messages: [f.errorReason || 'Hata oluştu']
                        });
                    });
                }
                return results;
            }
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaProductService:checkBatchProduct] ${error.message}`);
        }
    }

    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> {
        const platformProduct = stagedProduct.rawData;
        const categoryId = stagedProduct.localCategoryId;
        const platformCatId = platformProduct.categoryId || platformProduct.pimCategoryId;

        const brandId = await this.params.mappingProvider.getLocalBrandId(platformProduct.brandId);

        const choicesResult = await this.resolveVariantChoices(platformCatId, platformProduct.attributes, categoryId);
        const variant = this.transformer.toInternalVariant(platformProduct, choicesResult);

        return {
            product: {
                title: platformProduct.title || platformProduct.productName,
                brand: brandId,
                category: categoryId,
                maincode: platformProduct.productMainId || platformProduct.groupCode,
                hasVariant: !!(platformProduct.productMainId || platformProduct.groupCode)
            },
            variant
        };
    }

    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> {
        const settings = this.params.integrationSettings;
        const url = settings.urls.productListUrl;

        // Status updates only need the basic list data (state/status)
        // We can query by Code if barcode is provided in payload, or fetch a chunk
        const params: any = {};
        const identifier = (payload?.matchValues || payload?.barcodes || [])[0];
        if (identifier) {
            params.Code = identifier;
        }

        const data = await this.connector.fetchProductsFromPlatform(url, params);
        const items = Array.isArray(data) ? data : (data?.data || []);
        
        return items.map((p: any) => {
            const res = this.transformer.toInternalStatusResult([p])[0];
            return res;
        });
    }

    private async resolveVariantChoices(platformCatId: any, platformAttrs: any[], localCategoryId: string) {
        const allMappings = await this.params.mappingProvider.getAllAttributeMappings();
        const localChoices = await this.params.mappingProvider.getLocalChoices();
        const localChoiceMap = new Map(localChoices.map((c: any) => [String(c._id), c]));

        const results: any[] = [];
        const pAttrMap = new Map<string, { valueId?: string; text?: string }>();
        platformAttrs?.forEach(a => {
            const norm = normalizeAttrValue(a);
            if (norm) pAttrMap.set(String(a.attributeId), norm);
        });

        const categorySpecificMappings = allMappings.filter((m: any) =>
            m.integrationCode === integrationCode &&
            String(m.platformCategoryId) === String(platformCatId) &&
            String(m.localCategoryId) === String(localCategoryId) &&
            m.isCategoryMapping === false
        );

        for (const mapping of categorySpecificMappings) {
            const pAttrId = String(mapping.platformAttributeId);
            const pValueFromProduct = pAttrMap.get(pAttrId);

            if (!pValueFromProduct) continue;

            const matchedValue: any = matchMappingValue(mapping.values, pValueFromProduct);

            if (matchedValue) {
                const choiceDoc: any = localChoiceMap.get(String(mapping.localChoiceId));
                const localValueDoc = choiceDoc?.values?.find((v: any) => String(v._id) === String(matchedValue.localValueId));

                if (mapping.isVarianter || mapping.isSlicer) {
                    results.push({
                        choiceId: mapping.localChoiceId,
                        choiceTitle: choiceDoc?.title || mapping.platformAttributeName,
                        choiceValueId: matchedValue.localValueId,
                        choiceValueTitle: localValueDoc?.title || matchedValue.platformValueName,
                        varianter: !!mapping.isVarianter,
                        slicer: !!mapping.isSlicer
                    });
                }
            }
        }
        return {
            choices: results,
            slicer: results.find(r => r.slicer) || results[0] || {},
            unmappedVarianters: []
        };
    }

    private getEndpointUrl(mode: PLATFORM_PROCESS): string {
        const s = this.params.integrationSettings;
        const targets: any = {
            [PLATFORM_PROCESS.TRANSFER]: s.urls.transferUrl || 'product/create',
            [PLATFORM_PROCESS.UPDATE_PRICE]: s.urls.updatePriceUrl || 'product/updatePrice-v2',
            [PLATFORM_PROCESS.UPDATE_STOCK]: s.urls.updateStockUrl || 'product/updatePrice-v2',
            [PLATFORM_PROCESS.UPDATE]: s.urls.updateContentUrl || s.urls.transferUrl || 'product/create'
        };
        return targets[mode];
    }
}

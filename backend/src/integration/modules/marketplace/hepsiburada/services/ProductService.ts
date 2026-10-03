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

// [INT-05 / F-02] Listing tarama/akış tavanları (aşılırsa sessiz kesilmez: uyarı + incomplete/FAILED).
const STATUS_SCAN_MAX_PAGES = 20;        // updateProductStatuses: sayfa başına 500 => 10.000 listing
const STATUS_SCAN_MAX_RECORDS = 10_000;
const STREAM_MAX_PAGES = 1000;           // streamProducts: sayfa başına 100 => 100.000 listing
const STREAM_MAX_RECORDS = 100_000;

export class ProductService {
    private connector: ProductConnector;
    private mapper: ProductMapper;

    constructor(private params: any, private service: Service) {
        this.connector = new ProductConnector(this.service, this.params);
        this.mapper = new ProductMapper();
    }

    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        const items: any[] = [];
        const variantList: any[] = [];
        const failedVariants: any[] = [];

        for (const sp of stagedProducts) {
            const variant = sp.payload;
            if (!variant) continue;
            try {
                const mapping = variant.platforms?.[integrationCode]?.mapping;
                const item = this.mapper.toPlatformBatch(sp, PLATFORM_PROCESS.TRANSFER, [], [], {
                    catId: mapping?.categoryId,
                    brandId: mapping?.brandId,
                    settings: this.params.integrationSettings?.settings
                });
                if (!item) throw new Error('Ürün dönüştürülemedi.');
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
            const { items: rest, total } = await this.connector.fetchListingPages(query, {
                limit, maxPages: STREAM_MAX_PAGES, maxRecords: STREAM_MAX_RECORDS,
                onPage: async (products: any[]) => {
                    const normalized = products.map((p: any) => this.mapper.toInternalVariant(p, { choices: [] }));
                    await callback(normalized);
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

    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> {
        const variant = this.mapper.toInternalVariant(stagedProduct, { choices: [] });
        return {
            product: {
                title: variant.title,
                brand: null,
                category: null,
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
            marketPrice: rawData.price || 0,
            quantity: rawData.stockCount || 0,
            images: [],
            barcode: rawData.barcode || '',
            stockcode: rawData.merchantSku || '',
            maincode: rawData.merchantSku || '',
            productId: rawData.id || '',
            platformCategoryId: rawData.categoryId || 0,
            requiredAttributes: []
        };
    }

    // Temel validasyon — TRANSFER status check yok (Dispatcher mode routing'i zaten halleder)
    public async validate(variant: IVariant): Promise<IValidationResult> {
        if (!variant.barcode || String(variant.barcode).trim() === "") {
            return { result: false, reason: "Barkod eksik.", errors: ["Barkod eksik."] };
        }
        const vPrice = variant.platforms?.[integrationCode]?.prices || variant.prices;
        if (!vPrice?.salePrice || vPrice.salePrice <= 0) {
            return { result: false, reason: "Fiyat geçersiz.", errors: ["Fiyat geçersiz."] };
        }
        return { result: true, reason: "", errors: [] };
    }
}

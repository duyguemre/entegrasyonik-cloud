import {
    IPlatform, IBrand, ICategory, ICategoryAttribute, ICategoryAttributeValue,
    ICategoryComission, IOrderPackage, IBatchProcessResult,
    IExportStagedProduct, IMessage, IFetchProductsResult, IInternalConversionResult,
    IInternalResult, IPlatformProductSummary, IValidationResult, IVariant,
    IBatchCheckPayload, IPlatformResponse, ISendInvoicePayload,
    ISendTrackingPayload, IClaimRejectionReason, MappingKey
} from '@interfaces/index';
import { IOrderRejectParams, IClaimRejectParams, IFinancialTransaction, ICargoInvoice } from '@interfaces/platforms';
import Service from './services/Service';
import { runConnectionProbe, type TestConnectionResult } from '@integration/modules/common/adapter/testConnection';
import { integrationCode } from './constants';
import { CategoryService } from './services/CategoryService';
import { BrandService } from './services/BrandService';
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';

export default class Bizimhesap implements IPlatform {
    public requiredSettings = ['key', 'secret'];

    private service: Service;
    private categoryService: CategoryService;
    private brandService: BrandService;
    private productService: ProductService;
    private orderService: OrderService;

    constructor(private params: any) {
        this.service = new Service(params);
        this.categoryService = new CategoryService(params, this.service);
        this.brandService = new BrandService(params, this.service);
        this.productService = new ProductService(params, this.service);
        this.orderService = new OrderService(params, this.service);
    }

    public async init(): Promise<boolean> {
        try {
            const s = this.params.integrationSettings?.settings || {};
            if (!s.key || !s.secret) return false;
            return true;
        } catch {
            return false;
        }
    }

    /**
     * [INT-01 testConnection] Yan etkisiz tek okuma: sipariş listesinin TEK kaydı (`size=1`; orderListUrl yoksa ürün listesi).
     * Kimlik doğrulaması zorunlu (key/token başlıkları); gövde atılır (PII saklanmaz/loglanmaz). Asla fırlatmaz.
     */
    public async testConnection(): Promise<TestConnectionResult> {
        return runConnectionProbe(integrationCode, async () => {
            const urls = this.params.integrationSettings?.urls || {};
            const sellerId = this.params.integrationSettings?.settings?.sellerId || '';
            const orderUrl: string | undefined = urls.orderListUrl;
            if (orderUrl) await this.service.get(`${orderUrl.replace('<SELLERID>', sellerId)}?page=0&size=1`, undefined, { operation: 'testConnection' });
            else await this.service.get(urls.productListUrl || 'products', undefined, { operation: 'testConnection' });
        });
    }

    public getMatchKey(): MappingKey {
        return (this.params.integrationSettings?.settings?.MATCHKEY || 'barcode') as MappingKey;
    }

    // Categories & Brands — derived from product catalog stored in DB
    public async retrieveCategories(): Promise<ICategory[]> { return this.categoryService.fetchCategories(); }
    public async retrieveCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> { return this.categoryService.fetchCategoryAttributes(categoryId); }
    public async retrieveCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> { return this.categoryService.fetchCategoryAttributeValues(categoryId, attributeId); }
    public async retrieveCategoryCommision(categoryId: string): Promise<ICategoryComission | undefined> { return this.categoryService.fetchCategoryCommission(categoryId); }
    public async retrieveBrands(query: Record<string, any>): Promise<IBrand[]> { return this.brandService.fetchBrands(query); }

    // Products — ERP is source, not destination; push ops are not supported
    public async streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> { return this.productService.streamProducts(callback, query); }
    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> { return this.productService.convertToInternalModel(stagedProduct); }
    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> { return this.productService.getSummaryFromRaw(rawData); }
    public async validate(variant: IVariant): Promise<IValidationResult> { return this.productService.validate(variant); }
    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> { return this.productService.updateProductStatuses(payload); }
    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> { return this.productService.checkBatchProduct(payload); }

    public async transferProducts(_: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.notSupported('transferProducts'); }
    public async updateProductPrice(_: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.notSupported('updateProductPrice'); }
    public async updateProductStock(_: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.notSupported('updateProductStock'); }
    public async updateProduct(_: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.notSupported('updateProduct'); }
    public async updateProductVariant(_: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.notSupported('updateProductVariant'); }
    public async updateProductDelivery(_: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.notSupported('updateProductDelivery'); }

    // Orders
    public async retrieveOrders(query?: Record<string, any>): Promise<IOrderPackage[]> { return this.orderService.fetchOrders(query); }
    public async approveOrder(externalOrderId: string, params?: { meta?: any }): Promise<boolean | IPlatformResponse> { return { success: false, message: 'Not supported' }; }
    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> { return false; }
    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> { return { success: false, message: 'Not supported' }; }
    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> { return { success: false, message: 'Not supported' }; }
    public async retrieveOrderRejectionReasons(): Promise<IClaimRejectionReason[]> { return this.orderService.retrieveOrderRejectionReasons(); }

    // Claims / Messages / Financials — not available for ERP
    public async retrieveClaims(query?: Record<string, any>): Promise<any[]> { return []; }
    public async approveClaim(externalClaimId: string, params?: { meta?: any }): Promise<IPlatformResponse> { return { success: false, message: 'Not supported' }; }
    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> { return { success: false, message: 'Not supported' }; }
    public async retrieveMessages(query?: any): Promise<IMessage[]> { return []; }
    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> { return false; }
    public async retrieveFinancials(query: any): Promise<IFinancialTransaction[]> { return []; }
    public async retrieveCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> { return []; }
    public async retrieveSettlementsByPaymentId(paymentOrderId: string): Promise<IFinancialTransaction[]> { return []; }

    public async retrievePlatformInfos(): Promise<any> { return { shipments: [], addresses: [] }; }
    public async retrieveToken(data: any): Promise<string | undefined> { return undefined; }
}

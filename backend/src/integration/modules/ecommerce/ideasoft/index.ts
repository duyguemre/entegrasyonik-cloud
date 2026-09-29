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
import { SecurityService } from './services/SecurityService';
import { CategoryService } from './services/CategoryService';
import { BrandService } from './services/BrandService';
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';

export default class Ideasoft implements IPlatform {
    public requiredSettings = ['storeName', 'key', 'secret'];

    private service: Service;
    private securityService: SecurityService;
    private categoryService: CategoryService;
    private brandService: BrandService;
    private productService: ProductService;
    private orderService: OrderService;

    constructor(private params: any) {
        this.service = new Service(params);
        this.securityService = new SecurityService(params, this.service);
        this.categoryService = new CategoryService(params, this.service);
        this.brandService = new BrandService(params, this.service);
        this.productService = new ProductService(params, this.service);
        this.orderService = new OrderService(params, this.service);
    }

    public async init(): Promise<boolean> {
        try {
            const token = await this.securityService.refreshToken();
            this.service.setCurrentToken(token);
            return true;
        } catch {
            return false;
        }
    }

    public getMatchKey(): MappingKey {
        return (this.params.integrationSettings?.settings?.MATCHKEY || 'barcode') as MappingKey;
    }

    // Categories & Brands
    public async retrieveCategories(): Promise<ICategory[]> { return this.categoryService.fetchCategories(); }
    public async retrieveCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> { return this.categoryService.fetchCategoryAttributes(categoryId); }
    public async retrieveCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> { return this.categoryService.fetchCategoryAttributeValues(categoryId, attributeId); }
    public async retrieveCategoryCommision(categoryId: string): Promise<ICategoryComission | undefined> { return this.categoryService.fetchCategoryCommission(categoryId); }
    public async retrieveBrands(query: Record<string, any>): Promise<IBrand[]> { return this.brandService.fetchBrands(query); }

    // Products
    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.transferProducts(stagedProducts); }
    public async updateProductPrice(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductPrice(stagedProducts); }
    public async updateProductStock(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductStock(stagedProducts); }
    public async updateProduct(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProduct(stagedProducts); }
    public async updateProductVariant(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductVariant(stagedProducts); }
    public async updateProductDelivery(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductDelivery(stagedProducts); }
    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> { return this.productService.checkBatchProduct(payload); }
    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> { return this.productService.updateProductStatuses(payload); }
    public async streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> { return this.productService.streamProducts(callback, query); }
    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> { return this.productService.convertToInternalModel(stagedProduct); }
    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> { return this.productService.getSummaryFromRaw(rawData); }
    public async validate(variant: IVariant): Promise<IValidationResult> { return this.productService.validate(variant); }

    // Orders
    public async retrieveOrders(query?: Record<string, any>): Promise<IOrderPackage[]> { return this.orderService.fetchOrders(query); }
    public async approveOrder(externalOrderId: string, params?: { meta?: any }): Promise<boolean | IPlatformResponse> { return this.orderService.approveOrder(externalOrderId, params); }
    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> { return this.orderService.rejectOrder(externalOrderId, params); }
    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> { return this.orderService.sendOrderShipping(payload); }
    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> { return this.orderService.sendOrderInvoice(payload); }

    // Claims — IdeaSoft does not have a dedicated claims API
    public async retrieveClaims(query?: Record<string, any>): Promise<any[]> { return []; }
    public async approveClaim(externalClaimId: string, params?: { meta?: any }): Promise<IPlatformResponse> { return { success: false, message: 'Not supported' }; }
    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> { return { success: false, message: 'Not supported' }; }
    public async retrieveOrderRejectionReasons(): Promise<IClaimRejectionReason[]> { return this.orderService.retrieveOrderRejectionReasons(); }

    // Messages — IdeaSoft does not have a messages API
    public async retrieveMessages(query?: any): Promise<IMessage[]> { return []; }
    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> { return false; }

    // Financials — not available
    public async retrieveFinancials(query: any): Promise<IFinancialTransaction[]> { return []; }
    public async retrieveCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> { return []; }
    public async retrieveSettlementsByPaymentId(paymentOrderId: string): Promise<IFinancialTransaction[]> { return []; }

    public async retrievePlatformInfos(): Promise<any> { return { shipments: [], addresses: [] }; }

    public async retrieveToken(data: any): Promise<string | undefined> {
        return this.securityService.retrieveToken(data);
    }
}

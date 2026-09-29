import { IPlatform, IBrand, ICategory, ICategoryAttribute, ICategoryAttributeValue, ICategoryComission, IOrderPackage, IBatchProcessResult, IExportStagedProduct, IMessage, IFetchProductsResult, IInternalConversionResult, IInternalResult, IPlatformProductSummary, IValidationResult, IVariant, IBatchCheckPayload, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload, IOrderRejectionReason, IOrderRejectParams, IClaimRejectParams, IFinancialTransaction, ICargoInvoice } from '@interfaces/index';
import { integrationCode } from './constants';
import {
    Service,
    CategoryService,
    ProductService,
    OrderService,
    ClaimService,
    FinancialService,
    QuestionService
} from './services';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export default class Hepsiburada implements IPlatform {
    private service: Service;
    private categoryService: CategoryService;
    private productService: ProductService;
    private orderService: OrderService;
    private claimService: ClaimService;
    private financialService: FinancialService;
    private questionService: QuestionService;

    public requiredSettings = ['APISECRET', 'APIKEY', 'SELLERID'];

    constructor(private params: any) {
        this.service = new Service(this.params);
        this.categoryService = new CategoryService(this.params, this.service);
        this.productService = new ProductService(this.params, this.service);
        this.orderService = new OrderService(this.params, this.service);
        this.claimService = new ClaimService(this.params, this.service);
        this.financialService = new FinancialService(this.params, this.service);
        this.questionService = new QuestionService(this.params, this.service);
    }

    public async init(): Promise<boolean> {
        return true;
    }

    public getMatchKey() {
        return (this.params.integrationSettings?.settings?.MATCHKEY || 'barcode') as any;
    }

    public async retrieveBrands(query: Record<string, any>): Promise<IBrand[]> { return []; }
    public async retrieveCategories(): Promise<ICategory[]> { return this.categoryService.fetchCategories(); }
    public async retrieveCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> { return this.categoryService.fetchCategoryAttributes(categoryId); }
    public async retrieveCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> { return await this.categoryService.fetchCategoryAttributeValues(categoryId, attributeId); }
    public async retrieveCategoryCommision(categoryId: string): Promise<ICategoryComission | undefined> { return undefined; }

    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.transferProducts(stagedProducts); }
    public async updateProductPrice(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductPrice(stagedProducts); }
    public async updateProductStock(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductStock(stagedProducts); }
    public async updateProduct(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProduct(stagedProducts); }

    /**
     * [ADR-0006 adım 4] TERS ÇEVRİLDİ (BACKLOG C9 sahte başarı): ÖNCEKİ DAVRANIŞ hiçbir HTTP çağrısı
     * yapmadan `result:true` dönüyordu (Publisher bunu COMPLETED sayıyordu; pazaryerinde hiçbir şey
     * değişmiyordu ama "başarılı" görünüyordu). Bkz. tests/characterization/stubs/Hepsiburada.variantDelivery.stub.test.ts.
     * Gerçek Hepsiburada varyant/teslimat güncelleme uç noktası uygulanana kadar NOT_SUPPORTED fırlatılır.
     */
    public async updateProductVariant(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        throw new IntegrationError('NOT_SUPPORTED', 'Hepsiburada varyant güncelleme henüz gerçek olarak uygulanmadı.', {
            integrationCode, operation: 'updateProductVariant', clientId: this.params.clientId,
        });
    }

    public async updateProductDelivery(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> {
        throw new IntegrationError('NOT_SUPPORTED', 'Hepsiburada teslimat güncelleme henüz gerçek olarak uygulanmadı.', {
            integrationCode, operation: 'updateProductDelivery', clientId: this.params.clientId,
        });
    }

    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> { return this.productService.checkBatchProduct(payload); }
    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> { return this.productService.updateProductStatuses(payload); }
    public async streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> { return this.productService.getProductsAndPersist(callback, query); }
    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> { return this.productService.convertToInternalModel(stagedProduct); }
    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> { return this.productService.getSummaryFromRaw(rawData); }
    public async validate(variant: IVariant): Promise<IValidationResult> { return this.productService.validate(variant); }

    public async retrieveOrders(query?: Record<string, any>): Promise<IOrderPackage[]> { return this.orderService.fetchOrders(query); }
    public async approveOrder(externalOrderId: string, params?: { meta?: any }): Promise<boolean | IPlatformResponse> { return this.orderService.approveOrder(externalOrderId); }
    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> { return this.orderService.rejectOrder(externalOrderId, params); }
    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> { return this.orderService.sendOrderShipping(payload); }
    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> { return this.orderService.sendOrderInvoice(payload); }

    public async retrieveClaims(query?: Record<string, any>): Promise<any[]> { return this.claimService.fetchClaims(query); }
    public async approveClaim(externalClaimId: string, params?: { meta?: any }): Promise<IPlatformResponse> { return this.claimService.approveClaim(externalClaimId, params); }
    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> { return this.claimService.rejectClaim(externalClaimId, params); }
    public async retrieveOrderRejectionReasons(): Promise<IOrderRejectionReason[]> { return this.claimService.retrieveOrderRejectionReasons(); }

    public async retrieveMessages(query?: any): Promise<IMessage[]> { return this.questionService.fetchQuestions(query); }
    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> { return this.questionService.answerMessage(externalMessageId, answerText); }

    public async retrieveFinancials(query: { startDate: Date; endDate: Date; transactionTypes?: string[] }): Promise<IFinancialTransaction[]> { return this.financialService.fetchFinancials(query); }
    public async retrieveCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> { return []; }
    public async retrieveSettlementsByPaymentId(paymentOrderId: string): Promise<IFinancialTransaction[]> { return []; }

    public async retrievePlatformInfos(): Promise<any> {
        return { shipments: [], addresses: [] };
    }

    public async retrieveToken(data: any): Promise<string | undefined> {
        return "BasicAuth";
    }
}

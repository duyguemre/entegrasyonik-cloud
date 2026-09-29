import { IPlatform, IBrand, ICategory, ICategoryAttribute, ICategoryAttributeValue, ICategoryComission, IOrderPackage, IBatchProcessResult, IExportStagedProduct, IMessage, IFetchProductsResult, IInternalConversionResult, IInternalResult, IPlatformProductSummary, IValidationResult, IVariant, IBatchCheckPayload, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload, IClaimRejectionReason, OrderInternalStatusEnum } from '@interfaces/index';
import Service from './services/Service';
import { BrandService } from './services/BrandService';
import { CategoryService } from './services/CategoryService';
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';
import { ClaimService } from './services/ClaimService';
import { MessageService } from './services/MessageService';
import { FinancialService } from './services/FinancialService';
import { ShipmentService } from './services/ShipmentService';
import { IOrderRejectParams, IClaimRejectParams } from '@interfaces/platforms';
import { IFinancialTransaction, ICargoInvoice } from '@interfaces/platforms';

export default class Pazarama implements IPlatform {
    private service: Service;
    private brandService: BrandService;
    private categoryService: CategoryService;
    private productService: ProductService;
    private orderService: OrderService;
    private claimService: ClaimService;
    private messageService: MessageService;
    private financialService: FinancialService;
    private shipmentService: ShipmentService;

    public requiredSettings = ['APIKEY', 'APISECRET'];

    constructor(private params: any) {
        this.service = new Service(this.params);
        this.brandService = new BrandService(this.params, this.service);
        this.categoryService = new CategoryService(this.params, this.service);
        this.productService = new ProductService(this.params, this.service);
        this.orderService = new OrderService(this.params, this.service);
        this.claimService = new ClaimService(this.params, this.service);
        this.messageService = new MessageService(this.params, this.service);
        this.financialService = new FinancialService(this.params, this.service);
        this.shipmentService = new ShipmentService(this.params, this.service);
    }

    public async init(): Promise<boolean> {
        return true; // Auth is handled automatically in Service.ts
    }

    public getMatchKey() {
        return (this.params.integrationSettings?.settings?.MATCHKEY || 'barcode') as any;
    }

    public async retrieveBrands(query: Record<string, any>): Promise<IBrand[]> { return this.brandService.fetchBrands(query); }
    public async retrieveCategories(): Promise<ICategory[]> { return this.categoryService.fetchCategories(); }
    public async retrieveCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> { return this.categoryService.fetchCategoryAttributes(categoryId); }
    public async retrieveCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> { return this.categoryService.fetchCategoryAttributeValues(categoryId, attributeId); }
    public async retrieveCategoryCommision(categoryId: string): Promise<ICategoryComission | undefined> { return this.categoryService.fetchCategoryCommission(categoryId); }

    public async transferProducts(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.transferProducts(stagedProducts); }
    public async updateProductPrice(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductPrice(stagedProducts); }
    public async updateProductStock(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductStock(stagedProducts); }
    public async updateProduct(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProduct(stagedProducts); }
    public async updateProductVariant(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductVariant(stagedProducts); }
    public async updateProductDelivery(stagedProducts: IExportStagedProduct[]): Promise<IBatchProcessResult> { return this.productService.updateProductDelivery(stagedProducts); }
    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> { return this.productService.checkBatchProduct(payload); }
    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> { return this.productService.updateProductStatuses(payload); }
    public async streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> { return this.productService.getProductsAndPersist(callback, query); }
    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> { return this.productService.convertToInternalModel(stagedProduct); }
    public async getSummaryFromRaw(rawData: any): Promise<IPlatformProductSummary> { return this.productService.getSummaryFromRaw(rawData); }
    public async validate(variant: IVariant): Promise<IValidationResult> { return this.productService.validate(variant); }

    public async retrieveOrders(query?: Record<string, any>): Promise<IOrderPackage[]> { return this.orderService.fetchOrders(query); }
    public async approveOrder(externalOrderId: string, params?: { meta?: any }): Promise<boolean | IPlatformResponse> {
        // Pazarama'da onaylama işlemi hazırlanıyor (12) statüsüne geçmektir.
        // LineItemID meta içinde gelmeli. Eğer modelden (externalLineItemId) gelmiyorsa, meta içindeki ham veriden (items[0].orderItemId) bulmaya çalışıyoruz.
        let lineItemId = params?.meta?.externalLineItemId;

        if (!lineItemId && params?.meta?.items?.[0]?.orderItemId) {
            lineItemId = params.meta.items[0].orderItemId;
        }

        // Son çare externalOrderId (genelde yanlıştır ama akışı bozmamak için)
        lineItemId = lineItemId || externalOrderId;

        return this.orderService.updateOrderPackageStatus(externalOrderId, lineItemId, OrderInternalStatusEnum.APPROVED);
    }
    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> { return this.orderService.rejectOrder(externalOrderId, params); }
    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> { return this.orderService.sendOrderShipping(payload); }
    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> { return this.orderService.sendOrderInvoice(payload); }

    public async retrieveClaims(query?: Record<string, any>): Promise<any[]> { return this.claimService.fetchClaims(query); }
    public async approveClaim(externalClaimId: string, params?: { meta?: any }): Promise<IPlatformResponse> { return this.claimService.approveClaim(externalClaimId, params); }
    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> { return this.claimService.rejectClaim(externalClaimId, params); }
    public async retrieveOrderRejectionReasons(): Promise<IClaimRejectionReason[]> { return this.orderService.retrieveOrderRejectionReasons(); }

    public async retrieveMessages(query?: any): Promise<IMessage[]> { return this.messageService.retrieveMessages(query); }
    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> { return this.messageService.answerMessage(externalMessageId, answerText); }

    public async retrieveFinancials(query: { startDate: Date; endDate: Date; transactionTypes?: string[] }): Promise<IFinancialTransaction[]> { return this.financialService.fetchFinancials(query); }
    public async retrieveCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> { return this.financialService.fetchCargoInvoices(invoiceSerialNumber); }
    public async retrieveSettlementsByPaymentId(paymentOrderId: string): Promise<IFinancialTransaction[]> { return []; }

    public async retrievePlatformInfos(): Promise<any> {
        const shipments = await this.shipmentService.fetchShipments();
        const addresses = await this.shipmentService.fetchAddresses();
        return { shipments, addresses };
    }

    public async retrieveToken(data: any): Promise<string | undefined> {
        return this.service.getAccessToken();
    }
}

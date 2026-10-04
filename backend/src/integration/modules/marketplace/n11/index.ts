import { IPlatform, IBrand, ICategory, ICategoryAttribute, ICategoryAttributeValue, ICategoryComission, IOrderPackage, IBatchProcessResult, IExportStagedProduct, IMessage, IFetchProductsResult, IInternalConversionResult, IInternalResult, IPlatformProductSummary, IValidationResult, IVariant, IBatchCheckPayload, IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload, IClaimRejectionReason, MappingKey, OrderInternalStatusEnum } from '@interfaces/index';
import { IOrderRejectParams, IClaimRejectParams } from '@interfaces/platforms';
import { IFinancialTransaction, ICargoInvoice } from '@interfaces/platforms';

import Service, { N11_DEFAULT_URLS } from './services/Service';
import { runConnectionProbe, type TestConnectionResult } from '@integration/modules/common/adapter/testConnection';
import { OrderService } from './services/OrderService';
import { ProductService } from './services/ProductService';
import { CategoryService } from './services/CategoryService';
import { ClaimService } from './services/ClaimService';
import { MessageService } from './services/MessageService';
import { BrandService, FinancialService, ShipmentService } from './services/AuxiliaryServices';

export default class N11 implements IPlatform {
    public requiredSettings = ['APIKEY', 'APISECRET'];

    private service: Service;
    private orderService: OrderService;
    private productService: ProductService;
    private categoryService: CategoryService;
    private claimService: ClaimService;
    private messageService: MessageService;
    private brandService: BrandService;
    private financialService: FinancialService;
    private shipmentService: ShipmentService;

    constructor(private params: any) {
        this.service = new Service(this.params);
        this.orderService = new OrderService(this.params, this.service);
        this.categoryService = new CategoryService(this.params, this.service);
        this.productService = new ProductService(this.params, this.service, this.categoryService);
        this.claimService = new ClaimService(this.params, this.service);
        this.messageService = new MessageService(this.params, this.service);
        this.brandService = new BrandService(this.params, this.service);
        this.financialService = new FinancialService(this.params, this.service);
        this.shipmentService = new ShipmentService(this.params, this.service);
    }

    public async init(): Promise<boolean> { return true; }

    /**
     * [INT-01 testConnection] Yan etkisiz tek okuma: REST ürün sorgusunun (`ms/product-query`) TEK kaydı (`size=1`);
     * `appkey`/`appsecret` başlıkları zorunlu. Kategori CDN'i kimlik doğrulamasızdır (kanıt vermez), SOAP ağırdır. Asla fırlatmaz.
     */
    public async testConnection(): Promise<TestConnectionResult> {
        return runConnectionProbe('n11', async () => {
            const url = this.params.integrationSettings?.urls?.productListUrl || N11_DEFAULT_URLS.productListUrl;
            await this.service.rest.get(url, { page: 0, size: 1 }, { operation: 'testConnection' });
        });
    }
    public getMatchKey(): MappingKey { return 'stockcode'; }

    // Categories & Brands
    public async retrieveBrands(query: Record<string, any>): Promise<IBrand[]> { return this.brandService.fetchBrands(query); }
    public async retrieveCategories(): Promise<ICategory[]> { return this.categoryService.fetchCategories(); }
    public async retrieveCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> { return this.categoryService.fetchCategoryAttributes(categoryId); }
    public async retrieveCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> { return this.categoryService.fetchCategoryAttributeValues(categoryId, attributeId); }
    public async retrieveCategoryCommision(categoryId: string): Promise<ICategoryComission | undefined> { return this.categoryService.fetchCategoryCommission(categoryId); }

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
    public async approveOrder(externalOrderId: string, params?: { meta?: any }): Promise<boolean | IPlatformResponse> { return this.orderService.updateOrderPackageStatus(externalOrderId, String(params?.meta?.externalLineItemId ?? ''), OrderInternalStatusEnum.APPROVED, params?.meta); }
    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> { return this.orderService.rejectOrder(externalOrderId, params); }
    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> { return this.orderService.sendOrderShipping(payload); }
    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> { return this.orderService.sendOrderInvoice(payload); }

    // Claims
    public async retrieveClaims(query?: Record<string, any>): Promise<any[]> { return this.claimService.fetchClaims(query); }
    public async approveClaim(externalClaimId: string, params?: { meta?: any }): Promise<IPlatformResponse> { return this.claimService.approveClaim(externalClaimId, params); }
    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> { return this.claimService.rejectClaim(externalClaimId, params); }
    public async retrieveOrderRejectionReasons(): Promise<IClaimRejectionReason[]> { return this.orderService.retrieveOrderRejectionReasons(); }
    // [eslesme-fiyat WP6, K-G] N11 sipariş reddi NOT_SUPPORTED → iptal kataloğu boş; iade reddinde `claimRejectReasonId` serbest
    // metin (resmî katalog yok) → boş liste, UI "Diğer" ile açıklama ister.
    public async retrieveOrderCancelReasons(): Promise<IClaimRejectionReason[]> { return []; }
    public async retrieveClaimRejectReasons(): Promise<IClaimRejectionReason[]> { return []; }

    // Messages / QnA
    public async retrieveMessages(query?: any): Promise<IMessage[]> { return this.messageService.retrieveMessages(query); }
    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> { return this.messageService.answerMessage(externalMessageId, answerText); }

    // Financials
    public async retrieveFinancials(query: { startDate: Date; endDate: Date; transactionTypes?: string[] }): Promise<IFinancialTransaction[]> { return this.financialService.fetchFinancials(query); }
    public async retrieveCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> { return this.financialService.fetchCargoInvoices(invoiceSerialNumber); }
    public async retrieveSettlementsByPaymentId(paymentOrderId: string): Promise<IFinancialTransaction[]> { return []; }

    // Other
    public async retrievePlatformInfos(): Promise<any> { return { shipments: await this.shipmentService.fetchShipments(), addresses: await this.shipmentService.fetchAddresses() }; }
    public async retrieveToken(data: any): Promise<string | undefined> { return 'N11_MOCK_TOKEN'; }
}

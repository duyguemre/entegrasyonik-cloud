import { ICategoryAttributeValue, ICategory, ICategoryAttribute, IVariant, ICategoryComission, IBrand, IPlatform, IPlatformProductSummary, MappingKey, IValidationResult, IFetchProductsResult, IInternalConversionResult, IBatchProcessResult, IInternalResult, IBatchCheckPayload, IInternalPlatformInfos, IExportStagedProduct, IOrderPackage, IOrderRejectionReason, IPlatformResponse, ISendTrackingPayload, ISendInvoicePayload, IClaimRejectParams, IOrderRejectParams, IMessage, IFinancialTransaction, ICargoInvoice, IBuyboxObservation } from '@interfaces/index';

// Temel Servis (HTTP/Client)
import Service from './services/Service';
import { runConnectionProbe, type TestConnectionResult } from '@integration/modules/common/adapter/testConnection';

// Alt Servisler (İş mantığı koordinatörleri)
import { ProductService } from './services/ProductService';
import { OrderService } from './services/OrderService';
import { CategoryService } from './services/CategoryService';
import { BrandService } from './services/BrandService';
import { ShipmentService } from './services/ShipmentService';
import { ClaimService } from './services/ClaimService';
import { MessageService } from './services/MessageService';
import { FinancialService } from './services/FinancialService';
import { BuyboxConnector } from './api/BuyboxConnector';
/**
 * Trendyol Entegrasyon Ana Sınıfı.
 * IPlatform arayüzünü implement ederek, Trendyol'a özel tüm iş mantığını
 * alt servislere (Product, Order, vb.) delege eder (Facade Pattern).
 */
export default class Trendyol implements IPlatform {
    /** * Entegrasyonun çalışması için gereken zorunlu konfigürasyon anahtarları.
     * Factory seviyesinde kontrol için kullanılır.
     */
    public readonly requiredSettings = ['SELLERID', 'APIKEY', 'APISECRET'];

    private _service!: Service;
    private _productService!: ProductService;
    private _orderService!: OrderService;
    private _categoryService!: CategoryService;
    private _brandService!: BrandService;
    private _shipmentService!: ShipmentService;
    private _claimService!: ClaimService;
    private _messageService!: MessageService;
    private _financialService!: FinancialService;
    private _buybox!: BuyboxConnector;

    constructor(private integrationParameters: any) {
        this.initializeModules();
    }

    /**
     * Tüm alt birimleri ve HTTP istemcisini (Service) hiyerarşiye göre ayağa kaldırır.
     * Merkezi 'Service' instance'ı tüm alt modüllere enjekte edilir.
     */
    private initializeModules(): void {
        // Singleton veya Instance bazlı HTTP istemcisi
        this._service = Service.getInstance(this.integrationParameters);

        // İş mantığı birimlerinin (modüllerin) başlatılması
        this._productService = new ProductService(this.integrationParameters, this._service);
        this._orderService = new OrderService(this.integrationParameters, this._service);
        this._categoryService = new CategoryService(this.integrationParameters, this._service);
        this._brandService = new BrandService(this.integrationParameters, this._service);
        this._shipmentService = new ShipmentService(this.integrationParameters, this._service);
        this._claimService = new ClaimService(this.integrationParameters, this._service);
        this._messageService = new MessageService(this.integrationParameters, this._service);
        this._financialService = new FinancialService(this.integrationParameters, this._service);
        this._buybox = new BuyboxConnector(this._service, this.integrationParameters);
    }

    /**
     * Modül başlatıldıktan sonra yapılması gereken asenkron hazırlıklar (Token alma vb.).
     */
    public async init(): Promise<boolean> {
        return true;
    }

    /**
     * [INT-01 testConnection] Yan etkisiz tek okuma: onaylı ürün listesinin TEK kaydı (`size=1`), servis grubu `product_read`.
     * Sipariş listesi seçilmedi (30/dk pacer'ı ve PII'li gövde); kategori/marka uçları kimlik doğrulamasız olduğundan kanıt vermez.
     * Basic auth (APIKEY/APISECRET) + `{SELLERID} - Entegrasyonik` User-Agent zorunlu; gövde atılır. Asla fırlatmaz.
     */
    public async testConnection(): Promise<TestConnectionResult> {
        return runConnectionProbe('trendyol', async () => {
            const sellerId = this.integrationParameters?.integrationSettings?.settings?.SELLERID;
            await this._service.get(`product/sellers/${encodeURIComponent(String(sellerId ?? ''))}/products/approved`, { page: 0, size: 1 },
                { group: 'product_read', operation: 'testConnection', timeoutMs: Number(process.env.TY_HTTP_TIMEOUT_MS) || 10000 });
        });
    }

    // --- KATEGORİ & MARKA İŞLEMLERİ ---

    /** Platformdaki tüm kategori ağacını çeker. */
    public async retrieveCategories(): Promise<ICategory[]> {
        return this._categoryService.fetchCategories();
    }

    /** Belirli bir kategoriye ait zorunlu ve opsiyonel nitelikleri çeker. */
    public async retrieveCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> {
        return this._categoryService.fetchCategoryAttributes(String(categoryId));
    }

    /** Niteliklerin alabileceği değer listesini (Örn: Renk listesi) çeker. */
    public retrieveCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> {
        return this._categoryService.fetchCategoryAttributeValues(String(categoryId), String(attributeId));
    }

    /** Kategori bazlı komisyon oranlarını çeker. */
    public async retrieveCategoryCommision(categoryId: string): Promise<ICategoryComission | undefined> {
        return this._categoryService.fetchCategoryCommission(String(categoryId));
    }

    /** Platformdaki marka listesini filtreleyerek çeker. */
    public async retrieveBrands(query: Record<string, any>): Promise<IBrand[]> {
        return this._brandService.fetchBrands(query);
    }

    /** * Sistemin platformla hangi alan üzerinden eşleşeceğini döner.
     * Default: 'barcode'
     */
    public getMatchKey(): MappingKey {
        return this.integrationParameters?.integrationSettings?.matchKey || 'barcode';
    }

    /** Ham platform verisini sistem özet modeline (IPlatformProductSummary) çevirir. */
    public getSummaryFromRaw(platformProductData: any): Promise<IPlatformProductSummary> {
        return this._productService.getSummaryFromRaw(platformProductData);
    }

    /** Varyantın platform kurallarına (fiyat, stok, zorunlu alan) uygunluğunu denetler. */
    public async validate(variant: IVariant): Promise<IValidationResult> {
        return await this._productService.validate(variant);
    }


    // --- ÜRÜN İŞLEMLERİ ---

    /** * Platformdaki ürünleri sayfa sayfa (chunk) çekerek callback fonksiyonuna iletir.
     * Büyük veri setleri için bellek dostu akış sağlar.
     */
    public async streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult> {
        return this._productService.getProductsAndPersist(callback, query);
    }

    /** Platform ürün verisini dahili Product/Variant modeline dönüştürür. */
    public async convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult> {
        return this._productService.convertToInternalModel(stagedProduct);
    }

    /** Yeni ürünleri platforma ilk kez gönderir (Transfer/Publish). */
    public async transferProducts(stagedProducts: Array<IExportStagedProduct>): Promise<IBatchProcessResult> {
        return this._productService.transferProducts(stagedProducts);
    }

    /** Sadece fiyat bilgilerini günceller. */
    /** [PRC-R1] SALT OKUMA: buybox sırası/fiyatı/çok-satıcı (≤10 barkod/istek). Alan eşlemesi `api/BuyboxConnector.ts`'te (doğrulanmadı). */
    public async readBuybox(barcodes: string[]): Promise<IBuyboxObservation[]> {
        return this._buybox.readBuybox(barcodes);
    }

    public async updateProductPrice(stagedProducts: Array<IExportStagedProduct>): Promise<IBatchProcessResult> {
        return this._productService.updateProductPrice(stagedProducts);
    }

    /** Sadece stok miktarlarını günceller. */
    public async updateProductStock(stagedProducts: Array<IExportStagedProduct>): Promise<IBatchProcessResult> {
        return this._productService.updateProductStock(stagedProducts);
    }

    /** Ürün içerik bilgilerini (başlık, açıklama vb.) günceller. */
    public async updateProduct(stagedProducts: Array<IExportStagedProduct>): Promise<IBatchProcessResult> {
        return this._productService.updateProduct(stagedProducts);
    }

    /** Ürün varyant bilgilerini günceller. */
    public async updateProductVariant(stagedProducts: Array<IExportStagedProduct>): Promise<IBatchProcessResult> {
        return this._productService.updateProductVariantV2(stagedProducts);
    }

    /** Ürün teslimat bilgilerini günceller. */
    public async updateProductDelivery(stagedProducts: Array<IExportStagedProduct>): Promise<IBatchProcessResult> {
        return this._productService.updateProductDeliveryV2(stagedProducts);
    }

    /** Ürünlerin platformdaki güncel onay/red statülerini toplu sorgular. */
    public async updateProductStatuses(payload: any): Promise<IInternalResult[]> {
        return this._productService.updateProductStatuses(payload);
    }

    /** Gönderilen toplu işlemin (batch) sonucunu platformdan sorgular. */
    public async checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined> {
        return this._productService.checkBatchProduct(payload);
    }

    // --- SİPARİŞ & SEVKİYAT İŞLEMLERİ ---

    /** Platformdaki yeni veya güncellenmiş siparişleri çeker. */
    public async retrieveOrders(query?: Record<string, any>): Promise<IOrderPackage[]> {
        return await this._orderService.fetchOrders(query);
    }

    /** 5. SİPARİŞ ONAYLAMA: Trendyol'da platform onayı esastır, satıcı onayı no-op döner. */
    public async approveOrder(externalOrderId: string, params?: { meta?: any }): Promise<boolean | IPlatformResponse> {
        return true;
    }


    /** 3. İPTAL BİLDİRİMİ: Siparişi belirli bir sebeple iptal eder */
    public async rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean> {
        return await this._orderService.rejectOrder(externalOrderId, params);
    }

    /** İade Talepleri Çekme (Sync) */
    public async retrieveClaims(query?: Record<string, any>): Promise<any[]> {
        return await this._claimService.fetchClaims(query);
    }

    /** İade Talebi Onaylama */
    public async approveClaim(externalClaimId: string, params?: { meta?: any; claimItemIdList?: string[] }): Promise<IPlatformResponse> {
        return await this._claimService.approveClaim(externalClaimId, params);
    }

    /** İade Talebi Reddetme */
    public async rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse> {
        return await this._claimService.rejectClaim(externalClaimId, params);
    }

    /** 4. İPTAL SEBEPLERİ: Pazaryerinin güncel kabul ettiği iptal nedenlerini çeker */
    /** 4. İPTAL SEBEPLERİ: Trendyol'un kabul ettiği güncel iptal nedenlerini döner */
    public async retrieveOrderRejectionReasons(): Promise<IOrderRejectionReason[]> {
        return await this._claimService.retrieveOrderRejectionReasons();
    }


    /** Platformun desteklediği kargo firmalarını listeler. */
    public async retrievePlatformInfos(): Promise<IInternalPlatformInfos> {
        const shipments = await this._shipmentService.fetchShipments();
        const addresses = await this._shipmentService.fetchAddresses();
        return {
            shipments,
            addresses
        }
    }



    // --- SİPARİŞ & SEVKİYAT İŞLEMLERİ ---

    /** * 1. FATURA BİLDİRİMİ: Pazaryerine fatura bilgilerini iletir.
     * Artık sadece link değil, yasal tüm detayları (ISendInvoicePayload benzeri) alıyor.
     */

    public async sendOrderShipping(payload: ISendTrackingPayload): Promise<IPlatformResponse> {
        return await this._orderService.sendOrderShipping(payload);
    }

    /** * 2. KARGO BİLDİRİMİ: Takip numarası ve kargo firmasını pazaryerine bildirir.
     * Platformun beklediği carrierCode ve trackingCode'u içerir.
     */
    public async sendOrderInvoice(payload: ISendInvoicePayload): Promise<IPlatformResponse> {
        return await this._orderService.sendOrderInvoice(payload);

    }

    /** MÜŞTERİ SORULARI (MESAJLARI): Pazar yerindeki müşteri mesajlarını çeker */
    public async retrieveMessages(query?: any): Promise<IMessage[]> {
        return await this._messageService.retrieveMessages(query);
    }

    /** MÜŞTERİ SORULARINI CEVAPLAMA: Pazar yerine satıcı adına cevap gönderir */
    public async answerMessage(externalMessageId: string, answerText: string): Promise<boolean> {
        return await this._messageService.answerMessage(externalMessageId, answerText);
    }

    /** * Finansal Ekstre Çekme: 
     * Trendyol'daki settlements ve otherFinancials verilerini 
     * bizim evrensel IFinancialTransaction modelimize çevirerek döner.
     */
    public async retrieveFinancials(query: { startDate: Date, endDate: Date, transactionTypes?: string[] }): Promise<IFinancialTransaction[]> {
        return await this._financialService.fetchFinancials(query);
    }

    /** * Kargo Faturası Detaylarını Çekme: 
     * Verilen fatura numarasına ait kalemleri ICargoInvoice modelinde döner.
     */
    public async retrieveCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]> {
        return await this._financialService.fetchCargoInvoices(invoiceSerialNumber);
    }

    /**
     * Ödeme Emri Sorgulama:
     * Belirli bir ödeme (paymentOrderId) altındaki tüm finansal satırları döner.
     */
    public async retrieveSettlementsByPaymentId(paymentOrderId: string): Promise<IFinancialTransaction[]> {
        return await this._financialService.fetchSettlementsByPaymentId(paymentOrderId);
    }


    /** OAuth veya benzeri yapılar için erişim anahtarı sağlar. */
    public async retrieveToken(data: any): Promise<string | undefined> {
        return data;
    }
}
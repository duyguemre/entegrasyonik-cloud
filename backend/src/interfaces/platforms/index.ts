import { IBrand, ICargoInvoice, ICategory, ICategoryAttribute, ICategoryAttributeValue, IFinancialTransaction, IOrderPackage, PLATFORM_PROCESS } from '@interfaces/index';
import { IPlatformResponse, ISendInvoicePayload, ISendTrackingPayload } from '@interfaces/order';
import { IVariant } from '@interfaces/product';
import { IMessage } from '@interfaces/message';

/**
 * Entegrasyon katmanındaki alt modülleri (Marketplace, ERP vb.) dışarı açar.
 * Bu sayede 'import { ... } from "@interfaces/integration"' kullanımı mümkün olur.
 */
export * from './marketplace';
export * from './erp';
export * from './ecommerce';







// Tip güvenliği için Enum/Union yapıları
export type ExportStageStatus = 'QUEUED' | 'PREPARING' | 'PENDING' | 'SENT' | 'COMPLETED' | 'FAILED' | 'WAITING';

// Alt döküman (Subdocument) interface'i
export interface IExportStagedProductLog {
    status?: string;
    worker?: string;
    message?: string;
    timestamp: Date;
}

// Ana şema interface'i
export interface IExportStagedProduct {
    batchId: string;
    barcode: string;
    productId: string;
    integrationCode: string;
    requestId: string;
    mode: PLATFORM_PROCESS;

    // Opsiyonel Alanlar
    title?: string;
    price?: number;
    /** [eslesme-fiyat WP5] kanala gidecek liste fiyatı (Validator, `effectiveListPrice`). */
    listPrice?: number;
    stock?: number;
    image?: string;
    category?: Record<string, any>; // Veya daha spesifik bir interface
    brand?: Record<string, any>;
    choices?: any[];
    stockcode?: string;
    payload?: IVariant;
    /** ADR-0004 Karar 6 (Aşama C) — bkz. `database/client/models/Export.ts` alan yorumu. */
    targetPublishQty?: number | null;

    // Arşivleme Alanları
    isArchived: boolean;
    archiveKey?: string | null;
    archivedAt?: Date | null;

    // Durum ve Takip Alanları
    status: ExportStageStatus;
    trackingId?: string | null;
    priorityScore: number;

    // Loglar ve Zaman Damgaları
    logs: IExportStagedProductLog[];
    completedAt?: Date | null;
    nextRunAt: Date;

    // Mongoose { timestamps: true } tarafından otomatik eklenen alanlar
    createdAt: Date;
    updatedAt: Date;
}


/**
 * Pazaryeri kategorisine ait zorunlu veya varyant oluşturan niteliklerin özeti.
 */
export interface IPlatformAttributeSummary {
    attributeId: string;
    attributeName: string;
    attributeValue: string;
    attributeValueId: string | null;
    slicer: boolean;    // Ürünün gruplanacağı ana özellik mi? (Örn: Renk)
    varianter: boolean; // Seçenek oluşturacak özellik mi? (Örn: Beden)
    allowCustom: boolean; // Kullanıcı elle değer girebilir mi?
    required: boolean;    // Pazaryeri tarafında zorunlu mu?
    multiple: boolean;    // Birden fazla değer seçilebilir mi?
}

/**
 * Pazaryerinden çekilen ham verinin, sistemin anlayacağı normalize edilmiş özeti.
 */
export interface IPlatformProductSummary {
    category: string | number;
    salePrice: number;
    marketPrice: number;
    quantity: number;
    images: string[];
    barcode: string;
    stockcode: string;
    maincode: string;
    productId: string | number;
    platformCategoryId: string | number;
    requiredAttributes: IPlatformAttributeSummary[];
}

/**
 * Sistemin pazaryeriyle hangi anahtar üzerinden eşleşeceğini belirleyen tip.
 */
export type MappingKey = 'barcode' | 'stockcode';

/**
 * Ürün gönderilmeden önce yapılan ön doğrulama işleminin sonucu.
 */
export interface IValidationResult {
    result: boolean;         // Gönderime uygun mu?
    reason?: string;        // Başarısızlık durumunda kullanıcıya gösterilecek mesaj.
    errors?: string[];      // Detaylı hata listesi (Eksik alanlar vb.).
}

/**
 * Toplu ürün çekme (Fetch/Import) operasyonunun istatistiksel sonucu.
 */
export interface IFetchProductsResult {
    totalElements: number;      // Platformdaki toplam ürün sayısı.
    totalProcessed: number;     // Başarıyla çekilip işlenen ürün sayısı.
    totalPages: number;         // İşlem boyunca gezilen sayfa sayısı.
    status: 'COMPLETED' | 'FAILED';
    error?: string;             // Kritik bir hata oluştuysa hata mesajı.
}

/**
 * Pazaryeri ürününün dahili sisteme (Product/Variant) dönüştürülme sonucu.
 */
export interface IInternalConversionResult {
    product: {
        title: string;
        brand: string | null;
        category: string | null;
        maincode: string;
        hasVariant: boolean;
    };
    variant: IVariant;
}

/**
 * Pazaryerine gönderilen toplu (Batch) isteğin ilk yanıt özeti.
 */
export interface IBatchProcessResult {
    trackingId: string | null;         // Pazaryeri tarafındaki takip ID'si.
    result: boolean;                  // En az bir ürün başarıyla kuyruğa girdi mi?
    variantList: IBatchVariantInfo[]; // Kuyruğa giren varyantlar.
    failedVariants: IFailedVariant[]; // Daha gönderilmeden hata alan varyantlar.
    type?: PLATFORM_PROCESS;          // Yapılan işlem türü (Fiyat, Stok vb.).
    nextStatus?: string;              // Opsiyonel: Modülün önerdiği bir sonraki statü (örn: 'WAITING').
}

export interface IBatchVariantInfo {
    variantId: any;
    barcode: string;
    /** [C22] Opsiyonel: bu varyantın takip ID'si (bir işlem birden çok pazaryeri isteğine bölündüyse). Yoksa `IBatchProcessResult.trackingId` geçerlidir. */
    trackingId?: string | null;
}

/**
 * İşlem sırasında hata alan varyantın detaylı hata bilgisi.
 */
export interface IFailedVariant extends IBatchVariantInfo {
    reason: string;
}

/**
 * Pazaryerinden gelen karmaşık statülerin sistemin anlayacağı 3 ana statüye indirgenmiş hali.
 */
export interface IInternalResult {
    matchValue: string; // Eşleşme için kullanılan değer (barcode, stockcode vb.)
    barcode?: string;   // Geriye dönük uyumluluk için (opsiyonel)
    mapping?: Record<string, any>;
    status: 'FAILED' | 'COMPLETED' | 'WAITING';
    messages: string[];
}

/**
 * Pazaryerine gönderilen bir batch paketinin sonucunu sorgulamak için gereken veri yapısı.
 */
export interface IBatchCheckPayload {
    trackingId: string;           // Sorgulanacak asıl ID.
    batchProcessId?: string;     // Alternatif takip numarası.
    mode: PLATFORM_PROCESS;      // Sorgulanan işlemin türü.
}

/**
 * Pazaryerinin desteklediği kargo firmalarının normalize edilmiş hali.
 */
export interface IInternalShipment {
    id: string;
    name: string;
    code: string;
}

export interface IInternalAddress {
    id: string;          // String'e zorlanmış ID (Eşleşme sorunlarını çözer)
    title: string;       // Örn: "Sevkiyat Adresi (İstanbul)"
    subtitle: string;    // Örn: "Kadıköy / İstanbul - Atatürk Mah..."
    type: string;        // 'Shipment' | 'Returning' | 'Invoice'
    city: string;
    district: string;
    fullAddress: string;
}

export interface IInternalPlatformInfos {
    shipments: IInternalShipment[];
    addresses: IInternalAddress[]
}

/**
 * TÜM PAZARYERİ ENTEGRASYONLARININ UYMASI GEREKEN ANA SÖZLEŞME (INTERFACE).
 * Sisteme eklenecek her yeni pazaryeri bu metodları implement etmek zorundadır.
 */
/** [PRC-R1] Tek barkodun buybox gözlemi (kanal-bağımsız; eşleme adaptörde). `found:false` = pazaryeri bu barkod için bilgi dönmedi. */
export interface IBuyboxObservation {
    barcode: string;
    found: boolean;
    /** Buybox sırası (1 = buybox bizde). */
    buyboxOrder: number | null;
    /** Buybox'taki fiyat (KDV dahil, TL). */
    buyboxPrice: number | null;
    hasMultipleSeller: boolean | null;
}

export interface IPlatform {
    /** Gerekli ayar anahtarları listesi (Örn: SELLERID, APIKEY) */
    requiredSettings: string[];

    /** Entegrasyonu hazır hale getirir (Token alma, bağlantı testi vb.) */
    init(): Promise<boolean>

    /** [ADR-0033] Opsiyonel: yan etkisiz bağlantı/kimlik doğrulama denemesi (yeni adaptörlerde zorunlu, playbook §2). Asla fırlatmaz. */
    testConnection?(): Promise<{ ok: boolean; code?: string; detail?: string }>

    /** [PRC-R1] Opsiyonel, SALT OKUMA: barkod başına buybox bilgisi (manifesto `pricing.buybox.read`). Yalnız destekleyen adaptör uygular. */
    readBuybox?(barcodes: string[]): Promise<IBuyboxObservation[]>

    /** Tanım Verileri: Kategori, Nitelik, Marka ve Komisyon çekme işlemleri */
    retrieveCategories(): Promise<ICategory[]>
    retrieveCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]>,
    retrieveCategoryAttributeValues?(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]>,
    retrieveCategoryCommision(categoryId: string): Promise<any>
    retrieveBrands(query: Record<string, any>): Promise<IBrand[]>

    /** Eşleştirme anahtarını döner (Barkod mu Stok Kodu mu?) */
    getMatchKey(): MappingKey

    /** Ham veriden (JSON) sistemin anlayacağı özeti çıkarır */
    getSummaryFromRaw(platformProductData: any): Promise<IPlatformProductSummary>

    /** Ürünü pazaryeri kurallarına göre doğrular */
    validate(variant: IVariant): Promise<IValidationResult>

    /** Ürünleri parça parça (chunk) çekerek bir callback üzerinden sisteme aktarır */
    streamProducts(callback: (chunk: any[]) => Promise<void>, query?: Record<string, any>): Promise<IFetchProductsResult>

    /** Platform ürününü sistemin dahili modeline (Product/Variant) çevirir */
    convertToInternalModel(stagedProduct: any): Promise<IInternalConversionResult>

    /** Toplu İşlemler: Ürün gönderimi, fiyat/stok güncelleme vb. */
    transferProducts(variants: Array<IExportStagedProduct>): Promise<IBatchProcessResult>
    updateProductPrice(variants: Array<IExportStagedProduct>): Promise<IBatchProcessResult>
    updateProductStock(variants: Array<IExportStagedProduct>): Promise<IBatchProcessResult>
    updateProduct(variants: Array<IExportStagedProduct>): Promise<IBatchProcessResult>
    updateProductVariant(variants: Array<IExportStagedProduct>): Promise<IBatchProcessResult>
    updateProductDelivery(variants: Array<IExportStagedProduct>): Promise<IBatchProcessResult>

    /** Statü Takibi: Mevcut onay durumlarını veya toplu işlem sonuçlarını sorgular */
    updateProductStatuses(payload: any): Promise<IInternalResult[]>
    checkBatchProduct(payload: IBatchCheckPayload): Promise<IInternalResult[] | undefined>

    /** Sipariş ve Lojistik: Sipariş çekme ve kargo firması listeleme */
    retrieveOrders(query?: Record<string, any>): Promise<IOrderPackage[]>

    /** İade Talepleri Çekme (Sync) */
    retrieveClaims(query?: Record<string, any>): Promise<any[]>;

    /** İade Talebi Onaylama */
    approveClaim(externalClaimId: string, params?: { meta?: any; claimItemIdList?: string[] }): Promise<IPlatformResponse>;

    /** İade Talebi Reddetme */
    rejectClaim(externalClaimId: string, params: IClaimRejectParams): Promise<IPlatformResponse>;

    /** 3. İPTAL BİLDİRİMİ: Siparişi belirli bir sebeple iptal eder */
    rejectOrder(externalOrderId: string, params: IOrderRejectParams): Promise<boolean>;

    /** 5. SİPARİŞ ONAYLAMA: Siparişi onaylayarak 'Hazırlanıyor' aşamasına geçirir */
    approveOrder(externalOrderId: string, params?: { meta?: any }): Promise<boolean | IPlatformResponse>;

    /** 4. İPTAL SEBEPLERİ: Pazaryerinin güncel kabul ettiği iptal nedenlerini çeker */
    retrieveOrderRejectionReasons(): Promise<IOrderRejectionReason[]>;
    /**
     * [eslesme-fiyat WP6, K-G / D-ORD-5] İki AYRI katalog: sipariş iptali (tedarik edememe) ve iade reddi. ESKİDEN tek metot
     * (`retrieveOrderRejectionReasons`) iki anlamda kullanılıyordu (TY iptalde iade-sebep kataloğu, PZ iade reddinde sipariş
     * sebepleri). `retrieveOrderRejectionReasons` geriye uyum için İPTAL kataloğunun eş adıdır.
     */
    retrieveOrderCancelReasons?(): Promise<IOrderRejectionReason[]>;
    retrieveClaimRejectReasons?(): Promise<IClaimRejectionReason[]>;

    retrievePlatformInfos(): Promise<IInternalPlatformInfos>

    /** Gerekli durumlarda (Örn: OAuth) platformdan token alır */
    retrieveToken(data: any): Promise<string | undefined>

    /** 2. KARGO BİLDİRİMİ: Takip numarası ve kargo firmasını pazaryerine bildirir */
    sendOrderShipping(data: ISendTrackingPayload): Promise<IPlatformResponse>;

    /** 1. FATURA BİLDİRİMİ: Pazaryerine fatura linkini/bilgisini iletir */
    sendOrderInvoice(data: ISendInvoicePayload): Promise<IPlatformResponse>;

    /** MÜŞTERİ SORULARI (MESAJLARI): Pazar yerindeki müşteri mesajlarını çeker */
    retrieveMessages(query?: any): Promise<IMessage[]>;

    /** MÜŞTERİ SORULARINI CEVAPLAMA: Pazar yerine satıcı adına cevap gönderir */
    answerMessage(externalMessageId: string, answerText: string): Promise<boolean>;




    /** * Finansal Ekstre Çekme: 
     * Trendyol'daki settlements ve otherFinancials verilerini 
     * bizim evrensel IFinancialTransaction modelimize çevirerek döner.
     */
    retrieveFinancials(query: { startDate: Date, endDate: Date, transactionTypes?: string[] }): Promise<IFinancialTransaction[]>;

    /** * Kargo Faturası Detaylarını Çekme: 
     * Verilen fatura numarasına ait kalemleri ICargoInvoice modelinde döner.
     */
    retrieveCargoInvoices(invoiceSerialNumber: string): Promise<ICargoInvoice[]>;

    /**
     * Ödeme Emri Sorgulama:
     * Belirli bir ödeme (paymentOrderId) altındaki tüm finansal satırları döner.
     */
    retrieveSettlementsByPaymentId(paymentOrderId: string): Promise<IFinancialTransaction[]>;
}


export interface IOrderRejectionReason {
    id: string;      // Pazaryerinin anladığı kod (Örn: "25")
    title: string;   // Kullanıcının göreceği metin (Örn: "Stok Yetersizliği")
    /** [eslesme-fiyat WP6, K-G] false: kod listesi resmî/canlı kaynakla DOĞRULANMADI (ikincil kaynak) — UI uyarı gösterir. */
    verified?: boolean;
}

export interface IOrderRejectParams {
    reasonId: string;           // Pazaryeri sistemindeki red kodu (Örn: "OUT_OF_STOCK")
    description?: string;       // Bazı platformlarda zorunlu olan açıklama metni

    // Satır bazlı işlem yapan (Trendyol, Amazon) platformlar için:
    lineItems?: {
        externalLineId: string; // Pazaryerindeki satır ID'si (Trendyol lineId)
        quantity: number;       // Kaç adet iptal ediliyor?
    }[];

    // İptalin kimden kaynaklandığını belirten bayrak
    source?: 'SELLER' | 'CUSTOMER' | 'PLATFORM';

    /**
     * PAZARYERİ ÖZEL VERİLERİ (Payload veya URL için)
     * Örn: Trendyol için meta.packageId
     */
    meta?: Record<string, any>;
}

export interface IClaimRejectParams {
    reasonId: string;
    description?: string;
    claimItemIdList: string[]; // Trendyol'un beklediği o kritik liste
    documents?: any[];
}

export interface IClaimRejectionReason {
    id: string;
    title: string;
}

export * from './financial'
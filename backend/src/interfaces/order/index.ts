import { Types, Document } from "mongoose";
import { IClaim } from "../claim";
import { ICustomer } from "../customer";

// ============================================================================
// 1. ENUMLAR VE İŞ AKIŞI
// ============================================================================

export enum OrderInternalStatusEnum {
    UNAPPROVED = 'UNAPPROVED', // Onay Bekliyor
    AWAITING_APPROVAL = 'AWAITING_APPROVAL', // Satıcı Onayı Bekliyor
    APPROVED = 'APPROVED',     // Onaylandı
    SHIPPED = 'SHIPPED',       // Kargolandı
    DELIVERED = 'DELIVERED',   // Teslim Edildi
    CANCELLED = 'CANCELLED',   // İptal Edildi
    RETURNED = 'RETURNED'      // İade Edildi (Tümü)
}

// ============================================================================
// 2. WORKER VE ORKESTRASYON YAPILARI
// ============================================================================

export interface IOrderPackage {
    order: IOrder;
    customer: ICustomer;
    claims?: IClaim[]; // Siparişle birlikte gelen anlık iadeler
    invoices?: any[];  // Siparişle beraber pazaryerinden (veya entegratörden) çekilen faturalar (IInvoice formatında)
}

/**
 * [ADR-0005 Karar 7] Kaynak başına ayrı imleç + gating: iade/finans/mesaj her sipariş turunda (60 sn)
 * değil, kendi aralıklarında (15 dk / 6 sa / 5 dk) çekilir. `OrderQueueProducer.scheduleJobs()` bu
 * turda hangi kaynağın "sırası geldiğini" hesaplar ve yalnızca o alanı jobData'ya ekler; alan YOKSA
 * `OrderWorker` o kaynağı bu turda ATLAR (dış çağrı yapılmaz -- kota tasarrufu, ADR gerekçesi).
 */
export interface ISourceSyncWindow {
    /** Bu turda bu kaynak çekilecek mi (varsa zaten true; alan tamamen yoksa OrderWorker atlar). */
    due: true;
    startDate: Date;
    /** Mesaj kaynağı (`retrieveMessages`) yalnızca `startDate` kabul eder; iade/finans için doludur. */
    endDate?: Date;
    /** Günlük tam pencere süpürmesi mi (32/30 gün), yoksa delta imleç mi (1 sa / 24 sa örtüşme). */
    isFullSweep: boolean;
}

export interface IOrderJobData {
    clientId: number;
    integrationCode: string;
    lastSyncTimestamp: Date | string;
    priority?: number;
    isManualTrigger?: boolean;
    /** [ADR-0005 Karar 7] Yalnızca bu turda "sırası gelen" kaynaklar için dolu; yoksa o kaynak ATLANIR. */
    claimSync?: ISourceSyncWindow;
    financeSync?: ISourceSyncWindow;
    messageSync?: ISourceSyncWindow;
    /** [F-06] Kuyruğa eklenirken üretilen/taşınan correlation id (HTTP webhook'ta istek id'si); worker aynı id ile devam eder. */
    correlationId?: string;
}

/**
 * REVIZE: Worker sonuçlarını 'Yeni' ve 'Güncellenen' olarak ayırıyoruz.
 * Bu ayrım CRM metriklerini (LTV) doğru hesaplamak için kritiktir.
 */
export interface IOrchestratorResult {
    clientId: number;
    integrationCode: string;
    processedOrderCount: number;
    insertedIds: string[]; // İlk kez kaydedilenler
    updatedIds: string[];  // Sadece statü/veri güncellemesi alanlar
    warnings?: string[];
    completedAt?: Date;
}

export interface IDeadLetterQueue {
    originalJobId: string;
    queueName: string;
    clientId: number;
    integrationCode: string;
    jobData: any;
    failedReason: string;
    dlqType: 'FATAL_ERROR' | 'MAX_RETRIES_EXCEEDED';
    status: 'PENDING_MANUAL_REVIEW' | 'RETRYING' | 'RESOLVED' | 'IGNORED';
    failedAt: Date;
    retriedAt?: Date;
    resolvedAt?: Date;
}

// ============================================================================
// 3. ALT BİLEŞENLER (ADRES, FİNANS, ÜRÜN)
// ============================================================================

export interface IAddress {
    firstName: string;
    lastName?: string;
    companyName?: string;
    isCorporate?: boolean;
    taxNumber?: string;
    taxOffice?: string;
    email?: string;
    phone?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode?: string;
    countryCode?: string;
}

export interface IFinancials {
    currencyCode?: string;
    subTotal: number;
    totalDiscount?: number;
    totalTax?: number;
    shippingFee?: number;
    grandTotal: number;
    integrationCommission?: number;
}

export interface IOrderItem {
    /** * KRİTİK: İade (Claim) eşleşmesi için pazar yerindeki satır ID'si */
    externalLineItemId: string;
    externalItemId: string;
    internalProductId?: string | Types.ObjectId;
    internalVariantId?: string | Types.ObjectId;
    productName: string;
    sku: string;
    barcode?: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number;
    taxRate: number;
    taxAmount?: number;
    totalPrice: number;
    itemStatus?: 'ACTIVE' | 'CANCELLED' | 'RETURNED';
    /**
     * ADR-0004 Karar 1/3 — AYNA alanı (yalnızca UI/rapor): doğruluk kaynağı DEĞİL, gerçek durum
     * `Variants.allocations` içindedir. `PostOrderOperations`/`StockAllocator` (Aşama B) bu alanı,
     * uyguladığı geçişten SONRA yazar. `UNMAPPED`: satır varyant eşleşmedi (internalVariantId/barkod/sku yok), stok etkisi yok.
     */
    allocationState?: 'RESERVED' | 'COMMITTED' | 'RELEASED' | 'OVERSOLD' | 'RESTOCKED' | 'UNMAPPED';
    /**
     * ADR-0004 Aşama B — YENİ alan (ADR metninde yok, uygulayıcı kararı): bayat veri koruması için, bu
     * satıra EN SON tahsis geçişinin uygulandığı andaki `order.dates.externalUpdatedAt` değeri (yoksa
     * işlem anı). `PostOrderOperations` bir sonraki çalıştırmada gelen `externalUpdatedAt` bundan ESKİ/EŞİT
     * ise geçişi ATLAR (sıra dışı/tekrarlı pollingde eski durumun yeni durumu geçersiz kılmasını önler).
     * Gerekçe: ADR Karar 3 "siparişin externalUpdatedAt değeri satırda son uygulanandan eskiyse geçiş
     * yapılmaz" der ama "son uygulanan" değerinin NEREDE tutulacağını belirtmez; StockAllocator'ın
     * kendisi (Aşama A, DEĞİŞTİRİLMEDİ) yalnızca `Variants` dokümanına bakar, sipariş tarihini bilmez —
     * bu yüzden aynayla AYNI yerde (`Orders.items[]`) tutulması en doğal seçenektir.
     */
    lastAllocationAppliedAt?: Date;
    /** ADR-0004 Karar 7 (Aşama C) — bkz. `database/client/models/Order.ts` alan yorumu (bildirim spam koruması). */
    oversoldEscalatedAt?: Date;
    /** [GV-08] Pazaryeri iptali için satır bazında atomik talep (lease) -- bkz. `database/client/models/Order.ts`. */
    cancelClaimedBy?: string;
    cancelClaimedAt?: Date;
    cancelClaimUntil?: Date;
    /** [GV-08] İptal çağrısı sonucu belirsiz (UNKNOWN_OUTCOME); otomatik tekrar YOK, mutabakat/manuel. */
    cancelUnknownAt?: Date;
}

// ============================================================================
// 4. OPERASYONEL YAPILAR (FATURA, LOJİSTİK, LOG)
// ============================================================================

export interface IOrderInvoiceSummary {
    invoiceMethod?: 'MARKETPLACE' | 'INTEGRATOR' | 'MANUAL';
    status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'MANUAL_COMPLETED';
    invoiceProvider?: string;
    invoiceNumber?: string;
    ettn?: string;
    invoiceLink?: string;
    invoicedAt?: Date;
    errorCode?: string;
}

export interface IFulfillment {
    shipmentMethod?: 'MARKETPLACE' | 'API' | 'MANUAL';
    status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'MANUAL_COMPLETED';
    carrierCode?: string;
    carrierName?: string;
    trackingCode?: string;
    trackingUrl?: string;
    campaignCode?: string;
    desi?: number;
    labelUrl?: string;
    barcodeData?: string;
    errorCode?: string;
}

export interface IPlatformAction {
    actionType: 'UPDATE_TRACKING' | 'INVOICE_SEND' | 'STOCK_UPDATE' | 'PRICE_UPDATE' | string;
    platform: string;
    requestPayload: any;
    responsePayload: any;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    requestId?: string;
    createdAt?: Date;
}

// ============================================================================
// 5. ENTEGRASYON PAYLOADLARI (FACTORY & MODULES)
// ============================================================================

export interface ISendInvoicePayload {
    orderId: string;
    invoiceNumber: string;
    invoiceDate: Date | string;
    invoiceAmount: number;
    pdfUrl: string;
    fileContent?: string;
    documentType: 'E_ARSIV' | 'E_FATURA';
    currency: string;
    meta?: Record<string, any>;
}

export interface ISendTrackingPayload {
    orderId: string;
    remoteOrderId?: string;
    carrierCode: string;
    carrierName: string;
    trackingCode: string;
    shipmentDate?: Date;
    trackingUrl?: string;
    lineItems?: Array<{
        externalLineItemId?: string;
        merchantSku?: string;
        quantity: number;
    }>;
    meta?: Record<string, any>;
}

export interface IPlatformResponse {
    success: boolean;
    message?: string;
    rawResponse?: any;
    platformId?: string;
}

// ============================================================================
// 6. ANA SİPARİŞ YAPISI (IOrder)
// ============================================================================

export interface IOrder {
    _id?: string | Types.ObjectId;
    integrationCode: string;
    externalOrderId: string; // Pazar yerindeki ID
    orderNumber: string;    // Pazar yerindeki Sipariş No
    customerFirstName?: string;
    customerLastName?: string;

    customerId?: string | Types.ObjectId;
    cancelReason?: string;
    cancelSource?: string;
    externalStatus: string;
    internalStatus: OrderInternalStatusEnum;

    /** * Fatura kesildikten sonra gelen pazar yeri fiyat farklarını takip eder. */
    platformDiscrepancy?: {
        hasDiscrepancy: boolean;
        detectedAt: Date;
        reason: string;
        differenceAmount: Number,
        message: string;
        platformItems: Array<any>;
    };

    platformActions?: IPlatformAction[];

    dates: {
        orderDate: Date;
        approvedDate?: Date;
        invoiceDate?: Date;
        estimatedDeliveryDate?: Date;
        shippedDate?: Date;
        deliveredDate?: Date;
        cancelledDate?: Date;
        externalUpdatedAt?: Date;
    };

    billingAddress: IAddress;
    shippingAddress: IAddress;
    financials: IFinancials;
    items: IOrderItem[];

    invoice?: IOrderInvoiceSummary;
    fulfillment: IFulfillment[]; // Dizi olarak kalması parçalı gönderim için şart

    flags?: {
        isAllocated?: boolean;
        isInvoiceGenerated?: boolean;
        isNotificationSent?: boolean;
        /** * CRM Metrikleri (LTV) bu sipariş için işlendi mi? (Double counting koruması) */
        isMetricsProcessed?: boolean;
    };

    meta?: Record<string, any>;
    platformOperation?: {
        status: 'PENDING' | 'COMPLETED' | 'FAILED';
        message: string;
        lockedUntil: Date;
    };
}

// ============================================================================
// 7. MONGOOSE DOCUMENT
// ============================================================================

export interface IOrderDocument extends IOrder, Document {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
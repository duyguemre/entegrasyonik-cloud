import { Schema } from 'mongoose';
import { IAddress, IFinancials, IFulfillment, IOrderDocument, IOrderInvoiceSummary, IOrderItem, OrderInternalStatusEnum } from '@interfaces/order';

// ============================================================================
// 1. ADRES & İLETİŞİM (Evrensel Format - CRM Uyumlu)
// ============================================================================
export const AddressSchema = new Schema<IAddress>({
    firstName: { type: String, required: true },
    lastName: { type: String },
    companyName: { type: String },
    isCorporate: { type: Boolean, default: false },
    taxNumber: { type: String },
    taxOffice: { type: String },
    email: { type: String },
    phone: { type: String },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String },
    countryCode: { type: String, default: 'TR' },
}, { _id: false });

// ============================================================================
// 2. FİNANSAL VERİLER (Evrensel Muhasebe Formatı)
// ============================================================================
export const FinancialsSchema = new Schema<IFinancials>({
    currencyCode: { type: String, default: 'TRY', required: true },
    subTotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    integrationCommission: { type: Number, default: 0 },
}, { _id: false });

// ============================================================================
// 3. SİPARİŞ KALEMLERİ (Evrensel Ürün Formatı - Stok Uyumlu)
// ============================================================================
export const OrderItemSchema = new Schema<IOrderItem>({
    externalLineItemId: { type: String, required: true },
    externalItemId: { type: String, required: true },
    internalProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
    internalVariantId: { type: Schema.Types.ObjectId, ref: 'Variant' },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    barcode: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    taxRate: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true },
    itemStatus: {
        type: String,
        enum: ['ACTIVE', 'CANCELLED', 'RETURNED'],
        default: 'ACTIVE'
    },
    // ADR-0004 Karar 1/3 — AYNA (yalnızca UI/rapor); doğruluk kaynağı Variants.allocations'tır. `Orders.flags.isAllocated`
    // bu aynadan türetilir. Aşama B (PostOrderOperations/StockAllocator) tarafından geçiş sonrası yazılır.
    allocationState: {
        type: String,
        enum: ['RESERVED', 'COMMITTED', 'RELEASED', 'OVERSOLD', 'RESTOCKED', 'UNMAPPED'],
        required: false
    },
    // ADR-0004 Aşama B — bayat veri koruması için "en son uygulanan externalUpdatedAt" izi (bkz. IOrderItem).
    lastAllocationAppliedAt: { type: Date, required: false },
    // ADR-0004 Karar 7 (Aşama C) — YENİ alan (ADR metninde yok, uygulayıcı kararı): grace penceresi dolup
    // otomatik iptal desteklenmediğinde/başarısız olduğunda tenant'a "manuel görev" bildirimi gönderildiği an.
    // Yalnızca bildirim SPAM'ini önlemek için (OversellCompensationJob her turda aynı satırı tekrar bulur).
    oversoldEscalatedAt: { type: Date, required: false },
    // [GV-08, 2026-09-28] OversellCompensationJob -- pazaryerine `rejectOrder` çağrısından ÖNCE satır bazında atomik
    // talep (claim/lease): çok-pod / üst üste binen turda ÇİFT iptali önler. `cancelClaimedBy`=pod kimliği,
    // `cancelClaimedAt`=talep anı (bırakma belirteci), `cancelClaimUntil`=kısa lease bitişi (süresi dolunca yeniden alınabilir).
    cancelClaimedBy: { type: String, required: false },
    cancelClaimedAt: { type: Date, required: false },
    cancelClaimUntil: { type: Date, required: false },
    // [GV-08] Pazaryeri iptal çağrısının SONUCU BELİRSİZ (UNKNOWN_OUTCOME, ADR-0006: yazmada körlemesine retry YOK):
    // dolu ise job bu satırda tekrar iptal ATMAZ; mutabakat (AllocationSweepJob/pazaryeri durumu) veya manuel çözer.
    cancelUnknownAt: { type: Date, required: false }
}, { _id: false });

// ============================================================================
// 4. FATURA VERİLERİ (GÜNCELLENDİ)
// ============================================================================
export const OrderInvoiceSummarySchema = new Schema<IOrderInvoiceSummary>({
    invoiceMethod: {
        type: String,
        enum: ['MARKETPLACE', 'INTEGRATOR', 'MANUAL'],
        default: 'MANUAL'
    },
    status: {
        type: String,
        enum: ['PENDING', 'SUCCESS', 'FAILED', 'MANUAL_COMPLETED'],
        default: 'PENDING'
    },
    invoiceProvider: { type: String },
    invoiceNumber: { type: String },
    ettn: { type: String },
    invoiceLink: { type: String },
    invoicedAt: { type: Date },
    errorCode: { type: String } // Hata durumunda mesajı saklamak için
}, { _id: false });

// ============================================================================
// 5. LOJİSTİK VE TESLİMAT (GÜNCELLENDİ)
// ============================================================================
export const FulfillmentSchema = new Schema<IFulfillment>({
    shipmentMethod: {
        type: String,
        enum: ['MARKETPLACE', 'API', 'MANUAL'],
        default: 'MANUAL'
    },
    status: {
        type: String,
        enum: ['PENDING', 'SUCCESS', 'FAILED', 'MANUAL_COMPLETED'],
        default: 'PENDING'
    },
    carrierCode: { type: String },
    carrierName: { type: String },
    trackingCode: { type: String },
    trackingUrl: { type: String },
    campaignCode: { type: String },
    desi: { type: Number },
    labelUrl: { type: String },
    barcodeData: { type: String },
    errorCode: { type: String } // Kargo API hataları için
}, { _id: false });

// ============================================================================
// 6. ANA SİPARİŞ KÖK ŞEMASI (Order Root)
// ============================================================================
export const OrderSchema = new Schema<IOrderDocument>({
    integrationCode: { type: String, required: true, index: true },
    externalOrderId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerFirstName: { type: String },
    customerLastName: { type: String },

    cancelReason: { type: String },
    cancelSource: { type: String },
    externalStatus: { type: String, required: true },
    platformDiscrepancy: {
        hasDiscrepancy: { type: Boolean, default: false },
        detectedAt: { type: Date },
        reason: { type: String },
        differenceAmount: { type: Number },
        message: { type: String },
        platformItems: { type: Array, default: [] }
    },
    internalStatus: {
        type: String,
        enum: Object.values(OrderInternalStatusEnum),
        default: OrderInternalStatusEnum.UNAPPROVED,
        index: true,
        required: true
    },

    platformActions: [{
        actionType: { type: String }, // "UPDATE_TRACKING", "INVOICE_SEND" vb.
        platform: { type: String },   // "TRENDYOL", "HEPSIBURADA"
        requestPayload: { type: Object }, // Senin gönderdiğin veri
        responsePayload: { type: Object }, // Platformdan dönen ham yanıt
        status: { type: String }, // "SUCCESS", "FAILED", "PENDING"
        requestId: { type: String }, // Platformun verdiği takip ID'si
        createdAt: { type: Date, default: Date.now }
    }],


    dates: {
        orderDate: { type: Date, required: true, index: true },
        approvedDate: { type: Date },
        invoiceDate: { type: Date, index: true, required: false }, // <--- Yeni eklendi
        estimatedDeliveryDate: { type: Date },
        shippedDate: { type: Date },
        deliveredDate: { type: Date },
        cancelledDate: { type: Date },
        externalUpdatedAt: { type: Date, index: true }
    },

    billingAddress: { type: AddressSchema, required: true },
    shippingAddress: { type: AddressSchema, required: true },
    financials: { type: FinancialsSchema, required: true },
    items: { type: [OrderItemSchema], required: true },

    // FATURA ALANI
    invoice: { type: OrderInvoiceSummarySchema },

    // KARGO ALANI (Diziye Çevrildi - Parçalı Kargo Desteği)
    fulfillment: { type: [FulfillmentSchema], default: [] },

    flags: {
        isAllocated: { type: Boolean, default: false },
        isInvoiceGenerated: { type: Boolean, default: false },
        isNotificationSent: { type: Boolean, default: false }
    },

    meta: { type: Schema.Types.Mixed },
    platformOperation: {
        status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'] },
        message: { type: String },
        lockedUntil: { type: Date }
    }
}, {
    collection: 'Orders',
    timestamps: true,
    strict: true
});

OrderSchema.index({ integrationCode: 1, externalOrderId: 1 }, { unique: true });
// ADR-0021 Karar 3 D9 / DATA_MODEL_CONVENTIONS.md §12 "Sipariş listesi `Orders {internalStatus?, integrationCode?}`
// sort `dates.orderDate`" -- getOrders/unifiedSearch liste+filtre+sıralama sorguları (order-service.ts, smart-service.ts).
// Uygulama: backend/migrations/0002-d9-indexes-tenant.js.
OrderSchema.index({ internalStatus: 1, 'dates.orderDate': -1 }, { name: 'internalStatus_1_dates.orderDate_-1' });
OrderSchema.index({ integrationCode: 1, 'dates.orderDate': -1 }, { name: 'integrationCode_1_dates.orderDate_-1' });
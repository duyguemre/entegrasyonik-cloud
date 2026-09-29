import { Schema } from 'mongoose';
import { ClaimInternalStatusEnum, ClaimTypeEnum, IClaimDocument } from '@interfaces/claim';

// ============================================================================
// 1. İADE EDİLEN ÜRÜN KALEMLERİ ŞEMASI (GÜNCELLENDİ)
// ============================================================================
const ClaimItemSchema = new Schema({
    // ORDER-CLAIM KÖPRÜSÜ: Sipariş satırındaki 'externalLineItemId' ile birebir eşleşme
    externalLineItemId: { type: String, required: true },
    externalItemId: { type: String, required: true },

    sku: { type: String, default: "" },
    productName: { type: String, required: true },
    barcode: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, default: 0 },

    reason: { type: String },
    description: { type: String }
}, { _id: false });

// ============================================================================
// 2. GEÇMİŞ (HISTORY) YAPISI (GÜNCELLENDİ)
// ============================================================================
const ClaimHistorySchema = new Schema({
    status: {
        type: String,
        enum: Object.values(ClaimInternalStatusEnum),
        required: true
    },
    changedAt: { type: Date, default: Date.now },
    description: { type: String },
    actionBy: { type: String, default: 'SYSTEM' }, // 'SYSTEM', 'USER_ID', 'MARKETPLACE'
    meta: { type: Schema.Types.Mixed }
}, { _id: false });

// ============================================================================
// 3. ANA İADE / TALEP ŞEMASI
// ============================================================================
export const ClaimSchema = new Schema<IClaimDocument>({
    integrationCode: { type: String, required: true, index: true },
    externalClaimId: { type: String, required: true, index: true },
    externalOrderId: { type: String, required: true, index: true },

    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },

    type: {
        type: String,
        enum: Object.values(ClaimTypeEnum),
        default: ClaimTypeEnum.UNKNOWN,
        required: true
    },
    externalStatus: { type: String, required: true },
    internalStatus: {
        type: String,
        enum: Object.values(ClaimInternalStatusEnum),
        default: ClaimInternalStatusEnum.WAITING,
        index: true,
        required: true
    },

    // FİNANSAL VERİ (CRM Analizi için altın değerinde)
    totalRefundAmount: { type: Number, required: true, default: 0 },
    currencyCode: { type: String, default: 'TRY' },

    // ALT ŞEMALAR
    items: { type: [ClaimItemSchema], required: true },
    fulfillment: {
        carrierCode: { type: String },
        carrierName: { type: String },
        trackingCode: { type: String },
        trackingUrl: { type: String }
    },
    history: { type: [ClaimHistorySchema], default: [] },

    // --- YENİ: METRİK VE OPERASYONEL BAYRAKLAR ---
    flags: {
        // CRM metrikleri (totalReturnAmount vb.) bu iade için işlendi mi?
        isMetricsProcessed: { type: Boolean, default: false, index: true },
        // Stok iade alındı mı?
        isInventoryUpdated: { type: Boolean, default: false }
    },

    claimedAt: { type: Date, required: true, index: true },
    resolvedAt: { type: Date },
    externalUpdatedAt: { type: Date },

    meta: { type: Schema.Types.Mixed }

}, {
    collection: 'Claims',
    timestamps: true,
    strict: true
});

// ============================================================================
// İNDEKSLER
// ============================================================================

ClaimSchema.index({ integrationCode: 1, externalClaimId: 1 }, { unique: true });
ClaimSchema.index({ integrationCode: 1, externalOrderId: 1 });
// Müşteri bazlı iade analizi için hızlı erişim
ClaimSchema.index({ customerId: 1, internalStatus: 1 });
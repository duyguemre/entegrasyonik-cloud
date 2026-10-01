import { Schema } from "mongoose";

/**
 * PRC-R2: kural motorunun KURU çalışma çıktısı (tenant DB). Motor yalnız ÖNERİ yazar; fiyatı yalnız insan onayı (`pricing.suggestions.apply`)
 * değiştirir. Öneri; önce/sonra fiyat, kâr, gerekçe kodları, uyarılar, kural sürümü ve gözlenen buybox değerini taşır (K15, K18).
 * Rakip kimliği YOK (K16). (kural, varyant) başına tek GÜNCEL kayıt (`ruleId_variantId_current`). Saklama: `createdAt` + 90 gün (TTL).
 */
export const PRICE_SUGGESTION_STATUSES = ['open', 'applied', 'dismissed', 'expired', 'blocked'] as const;
export const PRICE_SUGGESTION_TTL_SECONDS = 90 * 24 * 3600;

export const PriceSuggestionSchema = new Schema({
    ruleId: { type: Schema.Types.ObjectId, required: true },
    ruleVersion: { type: Number, required: true },
    integrationCode: { type: String, required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    productId: { type: Schema.Types.ObjectId, required: false },
    barcode: { type: String, required: true },
    sku: { type: String, required: false },
    status: { type: String, enum: PRICE_SUGGESTION_STATUSES, required: true },
    /** (kural, varyant) başına GÜNCEL kayıt işareti (`open`/`blocked`); kapanınca kaldırılır. */
    current: { type: Boolean, required: false },
    beforePrice: { type: Number, required: true },
    afterPrice: { type: Number, required: false },
    listPrice: { type: Number, required: false },
    floor: { type: Number, required: false },
    ceiling: { type: Number, required: false },
    profitBefore: { type: Number, required: false },
    profitAfter: { type: Number, required: false },
    buyboxPrice: { type: Number, required: false },
    buyboxOrder: { type: Number, required: false },
    buyboxObservedAt: { type: Date, required: false },
    reasons: { type: [String], default: [] },
    warnings: { type: [String], default: [] },
    blockedReason: { type: String, required: false },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    appliedAt: { type: Date, required: false },
    appliedBy: { type: String, required: false },
    closedReason: { type: String, required: false },
}, { collection: 'PriceSuggestions', versionKey: false, autoIndex: false, strict: true });

PriceSuggestionSchema.index({ ruleId: 1, variantId: 1 }, { name: 'ruleId_variantId_current', unique: true, partialFilterExpression: { current: true } });
PriceSuggestionSchema.index({ status: 1, updatedAt: -1 }, { name: 'status_updatedAt' });
PriceSuggestionSchema.index({ createdAt: 1 }, { name: 'ttl_createdAt_90d', expireAfterSeconds: PRICE_SUGGESTION_TTL_SECONDS });

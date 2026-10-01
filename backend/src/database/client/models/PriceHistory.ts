import { Schema } from "mongoose";

/**
 * PRC-R2 (K10, K12, K17, K18): kanal bazında gerçekleşen SATIŞ fiyatı geçmişi (tenant DB). Kaynaklar: `suggestion` (insan onaylı öneri
 * uygulandı), `external` (Entegrasyonik dışında değiştiği gözlendi). Yasal pencere 10 gün; ≥30 gün tutulur (TTL 90 gün). Liste/üstü çizili
 * fiyat da kayda geçer (K9 kanıtı). Sıklık/soğuma/salınım (K12) ve artış sınırı (K8) bu kayıttan hesaplanır. Rakip kimliği YOK.
 */
export const PRICE_HISTORY_SOURCES = ['suggestion', 'external'] as const;
export const PRICE_HISTORY_TTL_SECONDS = 90 * 24 * 3600;

export const PriceHistorySchema = new Schema({
    integrationCode: { type: String, required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    barcode: { type: String, required: false },
    at: { type: Date, required: true },
    salePrice: { type: Number, required: true },
    previousPrice: { type: Number, required: false },
    listPrice: { type: Number, required: false },
    source: { type: String, enum: PRICE_HISTORY_SOURCES, required: true },
    ruleId: { type: Schema.Types.ObjectId, required: false },
    ruleVersion: { type: Number, required: false },
    suggestionId: { type: Schema.Types.ObjectId, required: false },
    buyboxPrice: { type: Number, required: false },
    buyboxObservedAt: { type: Date, required: false },
    actor: { type: String, required: false },
}, { collection: 'PriceHistory', versionKey: false, autoIndex: false, strict: true });

PriceHistorySchema.index({ integrationCode: 1, variantId: 1, at: -1 }, { name: 'integ_variant_at' });
PriceHistorySchema.index({ at: 1 }, { name: 'ttl_at_90d', expireAfterSeconds: PRICE_HISTORY_TTL_SECONDS });

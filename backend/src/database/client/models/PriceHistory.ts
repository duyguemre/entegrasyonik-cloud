import { Schema } from "mongoose";

/**
 * PRC-R2 (K10, K12, K17, K18): kanal bazında gerçekleşen SATIŞ fiyatı geçmişi (tenant DB). Kaynaklar: `suggestion` (insan onaylı öneri
 * uygulandı), `external` (Entegrasyonik dışında değiştiği gözlendi). Yasal pencere 10 gün; ≥30 gün tutulur (TTL 90 gün). Liste/üstü çizili
 * fiyat da kayda geçer (K9 kanıtı). Sıklık/soğuma/salınım (K12) ve artış sınırı (K8) bu kayıttan hesaplanır. Rakip kimliği YOK.
 */
// [eslesme-fiyat WP5, PLAN §3.4, Ek B P1-4] kaynaklar genişledi: manual (form), bulk (toplu), import, rule_channel (kanal fiyat kuralı);
// tüm kanallar (yalnız Trendyol değil). TTL 90 g → 400 g (K10 "son 30 gün en düşük" + yıllık kanıt); indeks değişikliği göç 0031 ile.
export const PRICE_HISTORY_SOURCES = ['manual', 'bulk', 'import', 'rule_channel', 'suggestion', 'external'] as const;
export const PRICE_HISTORY_TTL_SECONDS = 400 * 24 * 3600;
/** Göç 0031 öncesi indeks adı korunur (`collMod` adı değiştiremez); ad tarihsel, süre 400 gündür. */
export const PRICE_HISTORY_TTL_INDEX = 'ttl_at_90d';

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
PriceHistorySchema.index({ at: 1 }, { name: PRICE_HISTORY_TTL_INDEX, expireAfterSeconds: PRICE_HISTORY_TTL_SECONDS });

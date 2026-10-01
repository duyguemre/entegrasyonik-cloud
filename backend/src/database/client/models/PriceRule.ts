import { Schema } from "mongoose";

/**
 * PRC-R2: fiyat kuralları (tenant DB) — B-10 kanal fiyat kuralının TİP alanlı tek koleksiyonu. Bugün yalnız `type:'competition'`
 * (buybox'a göre "altında/üstünde kal"); B-10 `channel` tipi aynı koleksiyona eklenir (ayrı servis/koleksiyon YOK).
 * Hukuk (AUTO_PRICING_LEGAL §c): K1 eşitleme yok (fark > 0, sunucuda doğrulanır), K4 değerleri satıcı girer (şemada varsayılan YOK),
 * K6 rakip/mağaza alanı YOK (şema + strict giriş), K20 kapsam tenant'ın kendisidir (tenant DB). Kural değişince `version` artar;
 * öneri ve denetim kaydı kural sürümünü taşır (K18). `autoIndex:false` — indeksler yalnız göçle (0022, ÇALIŞTIRILMADI).
 */
export const PRICE_RULE_TYPES = ['competition'] as const;
export const PRICE_RULE_PAUSE_REASONS = ['external_change', 'oscillation', 'manual'] as const;

export const PriceRuleSchema = new Schema({
    type: { type: String, enum: PRICE_RULE_TYPES, required: true },
    name: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: false },
    version: { type: Number, required: true, default: 1 },
    integrationCode: { type: String, required: true },
    /** Kapsam: boş = kanalda yayındaki tüm uygun varyantlar; doluysa yalnız bu ürünler/barkodlar. */
    scope: {
        productIds: { type: [Schema.Types.ObjectId], required: false, default: undefined },
        barcodes: { type: [String], required: false, default: undefined },
    },
    competition: {
        mode: { type: String, enum: ['below', 'above'], required: true },
        deltaAmount: { type: Number, required: false },
        deltaPercent: { type: Number, required: false },
        /** Taban = başa baş (maliyet+komisyon+kargo+KDV) + hedef marj (% brüt). */
        floorMarginPercent: { type: Number, required: true },
        ceiling: { type: Number, required: true },
        step: { type: Number, required: true },
        maxChangesPerDay: { type: Number, required: true },
        cooldownMin: { type: Number, required: true },
        maxIncreasePercentPerDay: { type: Number, required: true },
        excludeIfOutOfStock: { type: Boolean, required: true },
    },
    pausedReason: { type: String, enum: PRICE_RULE_PAUSE_REASONS, required: false },
    pausedAt: { type: Date, required: false },
    createdBy: { type: String, required: false },
    updatedBy: { type: String, required: false },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
}, { collection: 'PriceRules', versionKey: false, autoIndex: false, strict: true });

PriceRuleSchema.index({ type: 1, integrationCode: 1, enabled: 1 }, { name: 'type_integ_enabled' });

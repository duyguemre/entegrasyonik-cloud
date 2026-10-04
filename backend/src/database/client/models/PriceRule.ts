import { Schema } from "mongoose";

/**
 * PRC-R2: fiyat kuralları (tenant DB) — B-10 kanal fiyat kuralının TİP alanlı tek koleksiyonu. Bugün yalnız `type:'competition'`
 * (buybox'a göre "altında/üstünde kal"); B-10 `channel` tipi aynı koleksiyona eklenir (ayrı servis/koleksiyon YOK).
 * Hukuk (AUTO_PRICING_LEGAL §c): K1 eşitleme yok (fark > 0, sunucuda doğrulanır), K4 değerleri satıcı girer (şemada varsayılan YOK),
 * K6 rakip/mağaza alanı YOK (şema + strict giriş), K20 kapsam tenant'ın kendisidir (tenant DB). Kural değişince `version` artar;
 * öneri ve denetim kaydı kural sürümünü taşır (K18). `autoIndex:false` — indeksler yalnız göçle (0022, ÇALIŞTIRILMADI).
 */
// [eslesme-fiyat WP5, K-A] `channel`: maliyet/komisyon/kargo/KDV/marj → kanal fiyatı (rakibe bakmaz); parametreler `channel` alt belgesinde
// (zod: operations/pricing/channelRule.ts `channelParams`). `competition` alt alanları yalnız rekabet tipinde zorunludur.
export const PRICE_RULE_TYPES = ['competition', 'channel'] as const;
export const PRICE_RULE_PAUSE_REASONS = ['external_change', 'oscillation', 'manual'] as const;

function isCompetition(this: any) { return this?.type === 'competition'; }
function isChannel(this: any) { return this?.type === 'channel'; }

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
        mode: { type: String, enum: ['below', 'above'], required: isCompetition },
        deltaAmount: { type: Number, required: false },
        deltaPercent: { type: Number, required: false },
        /** Taban = başa baş (maliyet+komisyon+kargo+KDV) + hedef marj (% brüt). */
        floorMarginPercent: { type: Number, required: isCompetition },
        ceiling: { type: Number, required: isCompetition },
        step: { type: Number, required: isCompetition },
        maxChangesPerDay: { type: Number, required: isCompetition },
        cooldownMin: { type: Number, required: isCompetition },
        maxIncreasePercentPerDay: { type: Number, required: isCompetition },
        excludeIfOutOfStock: { type: Boolean, required: isCompetition },
    },
    channel: { type: Schema.Types.Mixed, required: isChannel },
    pausedReason: { type: String, enum: PRICE_RULE_PAUSE_REASONS, required: false },
    pausedAt: { type: Date, required: false },
    createdBy: { type: String, required: false },
    updatedBy: { type: String, required: false },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
}, { collection: 'PriceRules', versionKey: false, autoIndex: false, strict: true });

PriceRuleSchema.index({ type: 1, integrationCode: 1, enabled: 1 }, { name: 'type_integ_enabled' });

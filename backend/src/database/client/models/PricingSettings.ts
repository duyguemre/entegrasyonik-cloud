import { Schema } from "mongoose";

/**
 * PRC-R2 (K3, K19): tenant düzeyinde kural/öneri anahtarı + satıcı sorumluluk metni kabulü (tenant DB, tek belge `_id:'pricing'`).
 * Varsayılan KAPALI: belge yoksa kurallar çalışmaz. Açmak için sürümlü metin kabul edilir; kabul zamanı/kişisi saklanır ve denetime yazılır.
 * Metin sürümü değişince yeniden kabul gerekir.
 */
export const PricingSettingsSchema = new Schema({
    _id: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: false },
    consent: {
        version: { type: String, required: false },
        acceptedAt: { type: Date, required: false },
        acceptedBy: { type: String, required: false },
    },
    /** Platformdaki pazaryeri otomatik fiyat aracının kapatıldığını satıcı beyan etti (K17 uyarısı okundu). */
    dualEngineAcknowledgedAt: { type: Date, required: false },
    /**
     * [eslesme-fiyat WP5, K-A2] Kanal fiyat kuralının (yalnız `type:'channel'`) İNSAN ONAYSIZ uygulanması için tenant anahtarı (kill-switch).
     * Kapalıyken `autoApply:true` kurallar da yalnız önizleme/elle onayla çalışır. Açılırken ayrı bildirim metni kabul edilir.
     */
    channelAutoApply: { type: Boolean, required: false },
    channelAutoApplyAcknowledgedAt: { type: Date, required: false },
    updatedAt: { type: Date, required: true },
    updatedBy: { type: String, required: false },
}, { collection: 'PricingSettings', versionKey: false, autoIndex: false, strict: true });

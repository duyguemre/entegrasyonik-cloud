import mongoose from 'mongoose';

// ADR-0018 Karar 2c (Aşama B) — haftalık kaynak izleyicinin (`SourceMonitor`) URL başına TEK doküman durumu.
// İçerik ASLA saklanmaz (yalnız SHA-256 hash'i + koşullu-GET meta verisi + ≤2KB diff, `IntegrationFinding.evidence.docDiff`
// ile AYNI kırpma sınırı). Bu model salt "değişti mi" karşılaştırması için gerekli en az veriyi tutar.

export const SourceSnapshotSchema = new mongoose.Schema({
    /** Birincil anahtar: doğrudan URL (adaptör başına birden çok URL olabilir; bkz. descriptor.api.docs[]). */
    url: { type: String, required: true, unique: true },
    integrationCode: { type: String, required: true },
    category: { type: String, required: true },
    /** Normalize edilmiş metnin SHA-256'sı (ham HTML/İÇERİK asla saklanmaz). */
    contentHash: { type: String, required: false },
    /** Satır başına kısaltılmış (12 hex) hash listesi (ham metin DEĞİL) -- bir SONRAKİ değişiklikte "kaç satır
     *  değişti" özetini üretebilmek için tutulur; tek başına orijinal metne geri döndürülemez. Sınırlı (≤2000). */
    lineHashes: { type: [String], required: false, default: undefined },
    /** Koşullu GET için (ADR-0018 Karar 2c). */
    etag: { type: String, required: false },
    lastModified: { type: String, required: false },
    lastCheckedAt: { type: Date, required: false },
    lastChangedAt: { type: Date, required: false },
    /** Son karşılaştırmada üretilen kısa satır diff özeti (≤2KB); yalnız iç kullanım/triage. */
    lastDiff: { type: String, required: false },
    /** ADR-0018 Karar 2c "30 günde >4 kez değişti ve hepsi false_positive": ham sayaç, azaltma mantığı Aşama C+'da. */
    changeCount: { type: Number, required: true, default: 0 },
}, {
    collection: 'SourceSnapshots',
    versionKey: false,
    timestamps: false,
});

SourceSnapshotSchema.index({ integrationCode: 1 });

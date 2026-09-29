import mongoose from "mongoose";

// ADR-0008 §2: plan/kota tanımı. ApplicationDB'de tutulur (tenant DB'de DEĞİL) -- planlar tüm tenant'lar için ortaktır.
// Fiyat/limit DEĞERLERİ bu şemanın parçası değil; ADR'deki tablo yalnızca ÖNERİDİR, nihai değerler insan kararıyla
// (Protokol 12) seed edilir. Bu dosya yalnızca ALAN sözleşmesini tanımlar.

export type BillingInterval = 'month' | 'year';

// ADR-0008 §2 "features[]" örnekleri: einvoice, erp, shipping, mcp, desktopApp. Kapalı bir enum DEĞİL (yeni
// entegrasyon türleri eklenebilir); serbest string olarak tutulur, geçerlilik uygulama katmanında denetlenir.
export type PlanFeature = 'einvoice' | 'erp' | 'shipping' | 'mcp' | 'desktopApp' | string;

const PlanLimitsSchema = new mongoose.Schema({
    channels: { type: Number, required: true },       // pazaryeri + e-ticaret kanal sayısı üst sınırı
    skus: { type: Number, required: true },            // varyant (SKU) üst sınırı
    users: { type: Number, required: true },           // tenant kullanıcı sayısı üst sınırı
    mcpCallsPerDay: { type: Number, required: true },   // ADR-0009 kota
}, { _id: false });

export const PlanSchema = new mongoose.Schema({
    code: { type: String, required: true },              // ör. "starter", "growth", "enterprise", "legacy"
    name: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
    interval: { type: String, enum: ['month', 'year'], required: true },
    priceMinor: { type: Number, required: true },         // kuruş, tamsayı (₺2.490 => 249000)
    currency: { type: String, required: true, default: 'TRY' },
    vatIncluded: { type: Boolean, required: true, default: false },
    // Sağlayıcı tarafındaki karşılık gelen plan referansı (ör. iyzico plan/paket kodu); provider adı anahtar.
    providerRefs: { type: mongoose.Schema.Types.Mixed, required: false, default: {} },
    limits: { type: PlanLimitsSchema, required: true },
    features: { type: [String], required: true, default: [] },
    active: { type: Boolean, required: true, default: true },   // satışa açık mı (yeni abonelik başlatılabilir mi)
    public: { type: Boolean, required: true, default: false },  // tanıtım sitesinde görünür mü
}, {
    collection: 'Plans',
    timestamps: true,
});

// ADR-0008 §2: "Plans.code (unique)" -- tek doküman = tek plan kodu (birden fazla sürüm için ayrı belge YOK).
// `version` alanı, plan şartları (fiyat/limit) değiştiğinde artırılan bir SAYAÇtır; `Subscriptions.planVersion`
// abone olunduğu andaki değeri KOPYALAR (geriye dönük görüntüleme/audit içindir). Bu, mevcut abonelerin limitlerini
// GERİYE DÖNÜK OLARAK değiştirmeyi engellemez -- geriye dönük koruma (grandfathering) gerekiyorsa `limitOverrides`
// kullanılır; ayrı sürüm-başına-belge modeli ADR'nin "code unique" kararıyla ÇELİŞİR, bu yüzden uygulanmadı.
PlanSchema.index({ code: 1 }, { unique: true, name: 'uniq_code' });

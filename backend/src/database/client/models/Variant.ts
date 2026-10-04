import mongoose from "mongoose";
import crypto from 'crypto';

const normalizeChoices = (choices: any) => {
    if (choices?.length == 0) return "single"
    return choices
        .slice()
        .sort((a: any, b: any) => String(a.choiceId).localeCompare(String(b.choiceId)))
        .map((c: any) => `${c.choiceId}:${c.choiceValueId}`)
        .join('|');
}

const hashChoices = (maincode: any, choices: any) => {
    const normalized = maincode + '|' + normalizeChoices(choices);
    return crypto.createHash('sha256').update(normalized).digest('hex');
}


// ADR-0004 Karar 1: allocations[].state — sipariş satırı bazlı idempotency/sıra koruması bu dizide,
// AYNI dokümanda tutulur (ayrı ledger koleksiyonu YOK). Terminal state'ler (COMMITTED/RELEASED/RESTOCKED)
// geri dönmez; guard StockAllocator'da uygulanır (şema seviyesinde zorlanmaz, Mongo enum'u yalnızca
// GEÇERLİ değerleri kısıtlar, geçiş kurallarını değil).
const ALLOCATION_STATES = ['RESERVED', 'COMMITTED', 'RELEASED', 'OVERSOLD', 'RESTOCKED'] as const;

export const AllocationEntrySchema = new mongoose.Schema({
    // "<integrationCode>:<externalOrderId>:<externalLineItemId>" ya da iade için "return:<integrationCode>:<claimId>:<lineId>"
    key: { type: String, required: true },
    qty: { type: Number, required: true },
    state: { type: String, required: true, enum: ALLOCATION_STATES },
    at: { type: Date, required: true, default: Date.now },
}, { _id: false });

export const VariantSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    tempId: { type: String, required: false, unique: true },
    code: { type: String, required: false },
    // "Eldeki fiziksel stok" (rezerve edilenler DAHİL). Kullanıcının manuel "stok = X" işlemi bu alanı
    // set eder; `reserved`'a dokunmaz (ADR-0004 Karar 1).
    stock: { type: Number, required: false, default: 0 },
    barcode: { type: String, required: false, unique: true, sparse: true },
    stockcode: { type: String, required: true, unique: true, sparse: true },
    // MEVCUT yapı korunur (integrationCode -> { prices, upload, attributes, mapping, ... }); ADR-0004
    // ile buna ayrıca `stockSync: { lastPublishedQty, lastPublishedAt, lastBatchId, dirty }` eklenir
    // (bkz. IPlatformInfo, @interfaces/product). Şema seviyesinde Object/Mixed olduğundan (strict:false)
    // yeni alt alanlar için migration GEREKMEZ.
    platforms: { type: Object, required: false, default: {} },
    variantHash: {
        type: String,
        unique: true, // 🔐 benzersizlik burada garanti
        index: true
    },
    // ADR-0004 Karar 1 (zero-oversell): sevk edilmemiş aktif rezervasyon toplamı. `available = stock - reserved`
    // TÜRETİLİR, burada saklanmaz (bkz. StockAllocator.available).
    reserved: { type: Number, required: false, default: 0 },
    // Idempotency + sıra koruması; her satır bağımsız anahtarla (key) izlenir.
    allocations: { type: [AllocationEntrySchema], required: false, default: [] },
    // Her stok etkileyen işlemde $inc:1; yalnızca mutabakat (onarım) yolunda optimistic guard olarak kullanılır.
    stockVersion: { type: Number, required: false, default: 0 },
    // Kanal sayısı kadar indeks açmamak için TEK bayrak (ADR-0004 Karar 1); kanal bazlı detay platforms.<code>.stockSync.dirty'de.
    stockDirty: { type: Boolean, required: false, default: false },
    // [eslesme-fiyat WP5, K-B] otomatik fiyat yayını: TEK bayrak (indeks 0028 `priceDirty_true`) + kanal başına ayrıntı
    // `pricePending.<kod> = { since, reason }`. Yalnız operations/pricing/pricePending.ts işaretler, PricePublishTrigger temizler.
    // Kanal alt alanları (şemasız `platforms`): `rulePrice` (channel kuralı sonucu), `priceSync` (son kuyruğa alınan gövde özeti),
    // `observed` (kanalda gözlenen fiyat, dış değişiklik uyarısı). Göç gerekmez (strict:false / Mixed).
    priceDirty: { type: Boolean, required: false },
    pricePending: { type: Object, required: false },
    choices: [{                         // Array içinde alt nesneler
        choiceId: { type: String, required: true }, // Özellik adı (Örn: 'Color', 'Size')
        choiceValueId: { type: String, required: true } // Özellik değeri (Örn: 'Red', 'L')
    }],
    maincode: { type: String, required: true },
    prices: {
        type: {
            isPlatformBasedPrice: { type: Boolean, required: true, default: false },
            salePrice: { type: Number, required: true, default: 0 },
            marketPrice: { type: Number, required: true, default: 0 }
        }, required: true
    },
    images: { type: [{ type: mongoose.Schema.Types.Mixed, required: false }], required: false },
    // PRC-R0 (K57-S4): birim maliyet (TL, KDV HARİÇ alış). Yoksa kâr hesaplanmaz, rekabet kuralı/önerisi kapalıdır. Yalnız
    // `PricingService/setVariantCosts` yazar (genel varyant kaydı bu alanları süzer). Göç: 0021 (kapsam indeksi; veri dönüşümü yok).
    costPrice: { type: Number, required: false },
    costUpdatedAt: { type: Date, required: false },
    // PRC-R1: kanal başına güncel buybox durumu (`competition.trendyol`), yalnız buybox okuma işi yazar. Geçmiş `BuyboxSnapshots`'ta.
    competition: { type: Object, required: false },
    transferFromPlatformId: { type: mongoose.Schema.Types.ObjectId, required: false },

}, {
    collection: 'Variants',
    strict: false
});

// ADR-0004 Karar 1: allocations.key üzerinde multikey indeks (idempotency lookup + $ne guard hızlı olsun).
VariantSchema.index({ 'allocations.key': 1 });

// DB-11 / DBR-04: StockPublishTrigger `Variants.find({stockDirty:true})` (30 sn x tenant) icin kismi indeks (yalniz kirli belgeler).
// Uygulama: backend/migrations/0008-variants-stockdirty-partial-tenant.js (onayli goc). Ad ve tanim goc ile BIREBIR.
VariantSchema.index({ stockDirty: 1 }, { name: 'stockDirty_true', partialFilterExpression: { stockDirty: true } });
// [eslesme-fiyat WP5] PricePublishTrigger taraması. Uygulama: backend/migrations/0028-variants-price-dirty-tenant.js (ÇALIŞTIRILMADI).
VariantSchema.index({ priceDirty: 1 }, { name: 'priceDirty_true', partialFilterExpression: { priceDirty: true } });

VariantSchema.pre('insertMany', function (next, docs) {
    for (const doc of docs) {
        // choices veya maincode eksik gelirse hatayı önlemek için kontrol
        if (doc.maincode && doc.choices) {
            doc.variantHash = hashChoices(doc.maincode, doc.choices);
        }
    }
    next();
});


VariantSchema.pre('save', function (next) {
    // Sadece yeni kayıt veya ilgili alanlar değiştiğinde çalışması için isModified kontrolü iyidir
    if (this.isModified('maincode') || this.isModified('choices')) {
        if (this.maincode && this.choices) {
            this.variantHash = hashChoices(this.maincode, this.choices);
        }
    }
    next();
});

// PRC-R0: maliyet kapsamı sayımı (`costPrice` sayı olan varyantlar) için kısmi indeks. PRC-R1: ürün listesi buybox filtresi.
// Uygulama: backend/migrations/0021-pricing-competition-tenant.js (onaylı göç, ÇALIŞTIRILMADI). Ad ve tanım göçle BİREBİR.
VariantSchema.index({ costPrice: 1 }, { name: 'costPrice_number', partialFilterExpression: { costPrice: { $type: 'number' } } });
VariantSchema.index({ 'competition.trendyol.status': 1 }, { name: 'competition_trendyol_status', partialFilterExpression: { 'competition.trendyol.status': { $exists: true } } });

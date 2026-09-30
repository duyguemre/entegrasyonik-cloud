import { PLATFORM_PROCESS } from "@interfaces/index";
import { Schema } from "mongoose";

export const ExportSignalSchema = new Schema({
    // --- KİMLİK BİLGİLERİ ---
    clientId: { type: Number, required: true },
    integrationCode: { type: String, required: true }, // trendyol, hepsiburada, amazon vb.
    mode: {
        type: String,
        required: true,
        enum: Object.values(PLATFORM_PROCESS)
    },

    // --- DURUM YÖNETİMİ ---
    status: {
        type: String,
        required: true,
        enum: ['QUEUED', 'PREPARING', 'PENDING', 'SENT', 'WAITING', 'COMPLETED', 'FAILED'],
        default: 'QUEUED'
    },

    // --- PAKETLEME (BATCHING) MANTIĞI ---
    groupId: { type: String, required: true },
    batchId: { type: String, required: true, unique: true },
    sequence: { type: Number, required: true },
    totalBatches: { type: Number, required: true },
    itemCount: { type: Number, default: 0 },

    // --- ORCHESTRATION & LOCKING (EN KRİTİK ALANLAR) ---
    lockedBy: { type: String, default: null }, // POD_NAME buraya yazılır
    lockExpiry: { type: Date, default: null }, // Zombi kilit koruması için
    nextRunAt: { type: Date, default: Date.now }, // Cooldown veya geciktirme için

    // --- HATA VE TAKİP ---
    errorMessage: { type: String, default: null },
    completedAt: { type: Date, default: null },

}, {
    timestamps: true, // createdAt ve updatedAt otomatik eklenir
    collection: 'ExportSignals'
});

// --- İNDEX STRATEJİSİ (PERFORMANS İÇİN) ---

// 1. KRİTİK: Orchestrator'ın "Meşgul olmayan müşteriyi bul" sorgusu için
// Hem aktif işleri ($ne: null) hem de bekleyenleri bulmak için en verimli index budur.
ExportSignalSchema.index({ lockedBy: 1, status: 1, clientId: 1, integrationCode: 1, nextRunAt: 1 });

// 2. Global Sıralama ve FIFO Garantisi için
// Orchestrator iş ararken createdAt ve sequence'e göre sort yapacak.
ExportSignalSchema.index({ status: 1, lockedBy: 1, createdAt: 1, sequence: 1 });

// 3. Group bazlı (10.000'lik ana işin) takibi ve temizliği için
ExportSignalSchema.index({ groupId: 1 });

// 4. Zaman aşımına uğrayan kilitleri (Zombie Cleanup) hızlıca bulmak için
ExportSignalSchema.index({ lockedBy: 1, updatedAt: 1 });

// 5. TTL (Arşivleme): Tamamlanan kayıtları 15 gün sonra otomatik siler (Veritabanını ferah tutar)
ExportSignalSchema.index({ completedAt: 1 }, { expireAfterSeconds: 1296000 });

ExportSignalSchema.index({ lockedBy: 1, status: 1, nextRunAt: 1, createdAt: 1 });




export const ExportFlagSchema = new Schema({
    // DB-14 / ADR-0021 D12: tenant anahtari Number (Clients.order ile ayni). Eski String tipi goc 0013 ile Number'a cevrilir;
    // sorgulardaki String(order) degerleri Mongoose sema tipiyle Number'a cast edilir. `index:true` KALDIRILDI:
    // {clientId,integrationCode} unique bileşiginin oneki oldugu icin clientId_1 gereksiz (goc 0013 dusurur).
    clientId: {
        type: Number,
        required: true
    },
    integrationCode: {
        type: String,
        required: true
    },
    // REVİZE: Boolean yerine Number (Sayaç)
    // 0: İşlenecek kayıt yok, >0: İşlenmeyi bekleyen QUEUED kayıt sayısı
    queuedCount: {
        type: Number,
        default: 0,
        index: true
    },
    priority: {
        type: Number,
        default: 0
    },
    lastUpdatedAt: {
        type: Date,
        default: Date.now
    },
    // [ADR-0006 Karar 4] Çok instance güvenliği: Dispatcher bir bayrağı işlemeye başlamadan önce bu alanlar
    // üzerinden atomik `findOneAndUpdate` ile lease talep eder (bkz. `@utils/mongoLease`). `leaseUntil` null/yoksa/geçmişse
    // (`{leaseUntil: null}` VE `$lt` birlikte verilir -- `$lt` tek başına null/yok değeri eşlemez, BSON tip kısıtlaması) veya `leaseOwner` zaten talep edeni gösteriyorsa lease alınır; aksi halde bayrak bu turda ATLANIR (hata değil).
    leaseOwner: {
        type: String,
        default: null
    },
    leaseUntil: {
        type: Date,
        default: null
    }
}, {
    collection: 'ExportFlag',
    timestamps: true
});

// Compound Index Güncellemesi: hasQueuedItems yerine queuedCount geldi
// Orchestrator sorgusu: { queuedCount: { $gt: 0 } }
ExportFlagSchema.index({ integrationCode: 1, queuedCount: 1, priority: -1, lastUpdatedAt: 1 });

// Tekil Kayıt Garantisi (Aynı kalıyor)
ExportFlagSchema.index({ clientId: 1, integrationCode: 1 }, { unique: true });

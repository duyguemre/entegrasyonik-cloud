import mongoose from "mongoose";

export const StatisticsSchema = new mongoose.Schema({
    // Tek bir dükkan için tek bir doküman: "variant_stats"
    _id: { type: String, required: true },

    // 🔥 KRİTİK ALAN: Veri güncel mi? 
    // Worker'lar statü değiştirdiğinde bunu true yapar. 
    // Dashboard açıldığında true ise reconcile çalışır.
    isDirty: { type: Boolean, default: true },

    // Genel Sayaçlar
    totalProducts: { type: Number, default: 0 },
    totalVariants: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 },

    /**
     * Dinamik Sayaç Yapısı
     * Örnek:
     * counts: {
     * "trendyol": {
     * "TRANSFER": { "SENT": 10, "WAITING": 2, "COMPLETED": 100, "FAILED": 5, "PENDING": 383, "ONSALECOUNT": 95 },
     * "STOCK": { "SENT": 0, "COMPLETED": 500, "FAILED": 0, "PENDING": 0 },
     * "PRICE": { "SENT": 0, "COMPLETED": 500, "FAILED": 0, "PENDING": 0 }
     * },
     * "hepsiburada": { ... }
     * }
     */
    counts: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // En son ne zaman tam hesaplama (reconcile) yapıldı?
    updatedAt: { type: Date, default: Date.now }
}, {
    collection: 'Statistics',
    versionKey: false,
    minimize: false // Boş objeleri ( {} ) DB'ye yazmaya zorlar, hata almanı engeller.
});

// Hızlı erişim için index
StatisticsSchema.index({ isDirty: 1 });
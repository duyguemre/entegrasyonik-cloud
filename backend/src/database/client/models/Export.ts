import { PLATFORM_PROCESS } from "@interfaces/index";
import { Schema } from "mongoose";

export const ExportStagedProductSchema = new Schema({
    batchId: { type: String, required: true, index: true },
    barcode: { type: String, required: true, index: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    integrationCode: { type: String, required: true, index: true },


    requestId: { type: String, required: true, index: true },
    // YENİ: Hızlı kontrol ve raporlama için mode ekledik
    mode: {
        type: String,
        required: true,
        enum: Object.values(PLATFORM_PROCESS),
        index: true
    },


    title: { type: String, required: false },
    price: { type: Number, required: false },
    stock: { type: Number, required: false },
    image: { type: String, required: false },
    category: { type: Object, required: false },
    brand: { type: Object, required: false },
    choices: { type: Array, required: false },
    stockcode: { type: String, required: false },

    payload: { type: Object, required: false },
    // [eslesme-fiyat WP1, ADR-0038 taslağı] Yapılandırılmış sorunlar (IntegrationIssue[]); errorMessage düz metni bundan türetilir.
    issues: { type: [Schema.Types.Mixed], required: false, default: undefined },
    // ARŞİVLEME ALANLARI
    isArchived: {
        type: Boolean,
        default: false,
        index: true // Sorgularda hız kazandırır
    },
    archiveKey: {
        type: String,
        default: null
    },

    // Opsiyonel: Arşivlenme tarihini tutmak istersen
    archivedAt: {
        type: Date,
        default: null
    },

    status: {
        type: String,
        required: true,
        enum: ['QUEUED', 'PREPARING', 'PENDING', 'SENT', 'COMPLETED', 'FAILED', 'WAITING'],
        default: 'QUEUED'
    },

    trackingId: { type: String, default: null },
    priorityScore: { type: Number, default: 100 },

    // ADR-0004 Karar 6 (Aşama C) — sistem tetiklemeli UPDATE_STOCK kayıtları için StockPublishTrigger'ın
    // önceden hesapladığı yayın adedi (`available - buffer`, kanal sınırına clamp'lenmiş). Validator, bu
    // alan doluyken (yalnızca mode=UPDATE_STOCK) mutlak `variant.stock` yerine bunu payload'a yazar; alan
    // yoksa (kullanıcı tetiklemeli/diğer modlar) davranış AYNI kalır (mevcut mutlak-stok yolu değişmedi).
    targetPublishQty: { type: Number, required: false, default: null },

    logs: [
        {
            status: { type: String },
            worker: { type: String },
            message: { type: String },
            timestamp: { type: Date, default: Date.now }
        }
    ],

    completedAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: Date.now, index: true }

}, {
    timestamps: true,
    collection: 'ExportStagedProducts'
});

// --- GÜNCELLENMİŞ İNDEX STRATEJİSİ ---

// 1. Worker'ın işleyeceği chunk'ları en hızlı şekilde bulması için (nextRunAt eklendi)
ExportStagedProductSchema.index({ batchId: 1, status: 1, nextRunAt: 1 });

// 2. Sentinel ve Sync için takip numarası sorgusu (sparse: true önemli)
ExportStagedProductSchema.index({ trackingId: 1 }, { sparse: true });

// 3. Mükerrer işlem kontrolü için (BatchCreator'ın attığı sorgu)
ExportStagedProductSchema.index({ barcode: 1, status: 1, mode: 1 });

// 4. Variant bazlı geçmiş sorguları
ExportStagedProductSchema.index({ barcode: 1, createdAt: -1 });

// 5. ADR-0021 Karar 3 D9 / DATA_MODEL_CONVENTIONS.md §12 "Dispatcher `ExportStagedProducts {integrationCode,
// status, mode}` sort `{priorityScore:-1, createdAt:1}`" (Dispatcher chunk seçim sorgusu). Uygulama:
// backend/migrations/0002-d9-indexes-tenant.js.
ExportStagedProductSchema.index(
    { integrationCode: 1, status: 1, mode: 1, priorityScore: -1, createdAt: 1 },
    { name: 'integrationCode_1_status_1_mode_1_priorityScore_-1_createdAt_1' },
);

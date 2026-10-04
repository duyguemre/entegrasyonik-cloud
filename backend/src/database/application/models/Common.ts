import mongoose from "mongoose";
import { IDeadLetterQueue } from "../../../interfaces/order";


export const CounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    sequence_value: { type: Number, default: 0 }
}, {
    collection: 'Counters',
    strict: false
});


export const CachedIntegrationDataSchema = new mongoose.Schema({
    integrationCode: { type: String, required: true },
    type: { type: String, required: true },
    updatedAt: { type: String, required: true },
}, {
    collection: 'CachedIntegrationDatas',
    strict: false
}
);




export const DeadLetterQueueSchema = new mongoose.Schema<IDeadLetterQueue>({
    originalJobId: { type: String, required: true },
    queueName: { type: String, required: true, index: true },
    clientId: { type: Number, required: true, index: true },
    integrationCode: { type: String, required: true, index: true },
    jobData: { type: mongoose.Schema.Types.Mixed, required: true },
    failedReason: { type: String, required: true },
    dlqType: {
        type: String,
        enum: ['FATAL_ERROR', 'MAX_RETRIES_EXCEEDED'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['PENDING_MANUAL_REVIEW', 'RETRYING', 'RESOLVED', 'IGNORED'],
        default: 'PENDING_MANUAL_REVIEW',
        index: true
    },
    failedAt: { type: Date, default: Date.now, index: true },
    retriedAt: { type: Date },
    resolvedAt: { type: Date }
}, {
    timestamps: true, // createdAt ve updatedAt otomatik eklenir
    collection: 'DeadLetterQueue'
});

// Performans için Compound Index: Belirli bir client'ın hatalarını hızlıca bulmak için
DeadLetterQueueSchema.index({ clientId: 1, status: 1 });
// [eslesme-fiyat WP7a, F-04 / göç 0029] Aynı iş DLQ'ya bir kez (yarış/çok pod); kayıtlar 30 gün sonra düşer (TTL `createdAt`;
// `failedAt_1` zaten var — aynı anahtara TTL seçeneği çakışırdı). Göç: migrations/0029-dlq-unique-ttl-app.js (ÇALIŞTIRILMADI).
DeadLetterQueueSchema.index({ originalJobId: 1 }, { unique: true, name: 'uniq_originalJobId' });
DeadLetterQueueSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600, name: 'ttl_createdAt' });
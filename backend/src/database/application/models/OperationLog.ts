import mongoose from "mongoose";

export type OperationType =
    | 'ORDER_SYNC'
    | 'CLAIM_SYNC'
    | 'MESSAGE_SYNC'
    | 'FINANCIAL_SYNC'
    | 'EXPORT'
    | 'IMPORT_FETCH'
    | 'IMPORT_SYNC';

export type OperationStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL';

export const OperationLogSchema = new mongoose.Schema({
    clientId:        { type: Number, required: true, index: true },
    integrationCode: { type: String, required: true, index: true },
    operationType: {
        type: String,
        enum: ['ORDER_SYNC', 'CLAIM_SYNC', 'MESSAGE_SYNC', 'FINANCIAL_SYNC', 'EXPORT', 'IMPORT_FETCH', 'IMPORT_SYNC'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'PARTIAL'],
        required: true,
        index: true
    },
    // Sayaçlar
    fetched:  { type: Number, default: 0 },  // Platformdan çekilen kayıt sayısı
    inserted: { type: Number, default: 0 },  // Yeni eklenen kayıt sayısı
    updated:  { type: Number, default: 0 },  // Güncellenen kayıt sayısı
    failed:   { type: Number, default: 0 },  // Başarısız kayıt sayısı
    skipped:  { type: Number, default: 0 },  // Atlanan/duplicate kayıt sayısı
    // Performans
    durationMs: { type: Number, default: 0 },
    // Hata detayı
    errorMessage: { type: String },
    // Bağlam
    operationMode: { type: String }, // EXPORT için: TRANSFER, UPDATE_STOCK, vb.
    workerType:    { type: String }, // EXPORT için: Validator, Publisher, Sentinel, Sync
    triggeredBy:   { type: String, default: 'SCHEDULER' },
    podName:       { type: String },
    startedAt:     { type: Date, required: true, index: true },
}, {
    timestamps: true,
    collection: 'IntegrationOperationLogs'
});

// TTL — 90 gün sonra otomatik sil
OperationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 });

// Compound index — client/platform/işlem bazlı sorgular
OperationLogSchema.index({ clientId: 1, integrationCode: 1, operationType: 1, startedAt: -1 });
OperationLogSchema.index({ clientId: 1, startedAt: -1 });

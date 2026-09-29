import mongoose from "mongoose";

// ADR-0001 Karar 11: asgari denetim kaydı. PII olarak YALNIZCA sub / tid / ip tutulur
// (e-posta, parola, token, istek gövdesi YOK). Kayıt best-effort'tur (bkz. services/audit/AuditLogger).

export type AuditResult = 'ok' | 'fail' | 'error';

export const AUDIT_LOG_TTL_SECONDS = 365 * 24 * 60 * 60; // 365 gün

export const AuditLogSchema = new mongoose.Schema({
    at:     { type: Date, required: true, default: Date.now },
    event:  { type: String, required: true },   // ör. login, selectStore, user.password_change, admin.write
    sub:    { type: String },                    // merkezi Users._id (başarısız girişte YOK)
    tid:    { type: Number },                    // tenant order
    ip:     { type: String },
    result: { type: String, enum: ['ok', 'fail', 'error'], required: true },
    meta:   { type: mongoose.Schema.Types.Mixed } // küçük, PII içermeyen düz nesne
}, {
    collection: 'AuditLogs',
    versionKey: false
});

// TTL — 365 gün sonra otomatik sil
AuditLogSchema.index({ at: 1 }, { expireAfterSeconds: AUDIT_LOG_TTL_SECONDS });
// Sorgu indeksleri
AuditLogSchema.index({ event: 1, at: -1 });
AuditLogSchema.index({ sub: 1, at: -1 });

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
    // ADR-0026 Karar 4.8 / ADR-0028 §10 (geriye uyumlu, hepsi istege bagli): kim (actorType), kimin adina (onBehalfOf = hedef tenant),
    // hangi yuzey (surface), impersonation oturumu (imp), istek korelasyonu (reqId). Mevcut kayitlarda YOK.
    actorType: { type: String, enum: ['user', 'platform', 'impersonator', 'system'] },
    onBehalfOf: { type: Number },
    surface: { type: String, enum: ['app', 'backoffice', 'chat', 'backoffice_chat', 'mcp'] },
    imp: { type: Boolean },
    reqId: { type: String },
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
// ADR-0021 Karar 3 D9 / DATA_MODEL_CONVENTIONS.md §12 "Denetim `AuditLogs {tid}` + `at` aralığı"
// (audit-service.ts:30-34 -- tenant denetim kaydı listesi, tid filtresi + at aralık sıralaması).
// Uygulama: backend/migrations/0001-d9-indexes-app.js.
AuditLogSchema.index({ tid: 1, at: -1 }, { name: 'tid_1_at_-1' });

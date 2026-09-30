import mongoose from "mongoose";

// ADR-0026 WP-LOG L1 (BACKOFFICE_PLAN §2.9): kalici log deposu. Yalniz warn+error (varsayilan) kalici; info orneklemeli.
// Yazim yolu `platform/runtime/logs` (toplu, sinirli kuyruk, arka planda insertMany). Maskeleme yazicida IKINCI kez uygulanir.
//
// ADR-0021 deseni: indeks TANIMLARI kodda ama `autoIndex:false` -- indeksler (TTL dahil) YALNIZ onayli goc ile kurulur
// (`migrations/0005-log-events-app.js`); model kaydi hicbir DB'ye sessizce indeks yazmaz.

export const LOG_LEVELS_PERSISTED = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
/** Saklama: warn/error/fatal 14 gun, info/debug 3 gun (`expAt` TTL, expireAfterSeconds:0). */
export const LOG_TTL_DAYS = 14;
export const LOG_TTL_DAYS_LOW = 3;
/** `ctx` (serbest ek alanlar) en fazla bu kadar bayt (JSON). */
export const LOG_CTX_MAX_BYTES = 2048;

export const LogEventSchema = new mongoose.Schema({
    ts:              { type: Date, required: true },
    level:           { type: String, enum: LOG_LEVELS_PERSISTED, required: true },
    source:          { type: String },                 // api | engine | worker | webhook | auth | adapter-{platform} | legacy-console
    module:          { type: String },
    code:            { type: String },
    errorClass:      { type: String },
    tenantId:        { type: Number },
    integrationCode: { type: String },
    operation:       { type: String },
    correlationId:   { type: String },
    durationMs:      { type: Number },
    msg:             { type: String },                 // maskeli, <=1000 karakter
    fingerprint:     { type: String },
    ctx:             { type: mongoose.Schema.Types.Mixed }, // maskeli, <=2 KB
    expAt:           { type: Date, required: true },
}, {
    collection: 'LogEvents',
    versionKey: false,
    strict: true,
    autoIndex: false,
});

LogEventSchema.index({ expAt: 1 }, { expireAfterSeconds: 0 });
LogEventSchema.index({ ts: -1 });
LogEventSchema.index({ fingerprint: 1, ts: -1 });
LogEventSchema.index({ source: 1, level: 1, ts: -1 });
LogEventSchema.index({ correlationId: 1 }, { sparse: true });
LogEventSchema.index({ tenantId: 1, ts: -1 }, { sparse: true });

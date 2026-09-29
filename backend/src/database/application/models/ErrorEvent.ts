import mongoose from "mongoose";

// ADR-0017 Karar 2.4 ("mini-Sentry"): parmak izi (`fp`) başına TEK doküman. `source` sunucu (`platform/core/logger`
// hatalarından köprülenir, bkz. errorEvents.ts) ya da istemci (`POST /client-log`, bkz. clientLog.ts) olabilir.
// Saklama: `lastSeen` + 30 gün (Karar 7).

export const ERROR_EVENT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 gün

const SampleSchema = new mongoose.Schema({
    message:  { type: String, required: true }, // redakte edilmiş, <=500 karakter
    stack:    { type: String },                 // redakte edilmiş, <=30 satır
    corrId:   { type: String },
    route:    { type: String },                 // RPC "Service/op" ya da FE rota adı (parametresiz)
    appVer:   { type: String },
}, { _id: false });

export const ErrorEventSchema = new mongoose.Schema({
    fp:              { type: String, required: true, unique: true },
    source:          { type: String, enum: ['server', 'client'], required: true },
    module:          { type: String },
    code:            { type: String },
    integrationCode: { type: String },
    tenantId:        { type: Number },
    count:           { type: Number, required: true, default: 1 },
    firstSeen:       { type: Date, required: true },
    lastSeen:        { type: Date, required: true },
    sample:          { type: SampleSchema },
    status:          { type: String, enum: ['open', 'acknowledged', 'resolved', 'muted'], required: true, default: 'open' },
}, {
    collection: 'ErrorEvents',
    versionKey: false,
});

ErrorEventSchema.index({ lastSeen: 1 }, { expireAfterSeconds: ERROR_EVENT_TTL_SECONDS });
ErrorEventSchema.index({ status: 1, lastSeen: -1 });

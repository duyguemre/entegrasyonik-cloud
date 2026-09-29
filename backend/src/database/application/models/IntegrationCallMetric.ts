import mongoose from "mongoose";

// ADR-0006 Karar 1: ResilientHttpClient'ın her dış çağrı için yazdığı best-effort metrik
// (bkz. integration/modules/common/http/IntegrationCallMetrics.ts). PII yok (yalnızca clientId/kod/durum).

export const INTEGRATION_CALL_METRIC_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 gün

export const IntegrationCallMetricSchema = new mongoose.Schema({
    kind:          { type: String, required: true, default: 'http' },
    at:            { type: Date, required: true, default: Date.now },
    integrationCode: { type: String, required: true },
    operation:     { type: String, required: true },
    clientId:      { type: String, required: true },
    status:        { type: String, enum: ['ok', 'error'], required: true },
    durationMs:    { type: Number, required: true },
    retries:       { type: Number, required: true, default: 0 },
    circuitState:  { type: String, enum: ['closed', 'open', 'half_open'], required: true },
    code:          { type: String },
    httpStatus:    { type: Number },
}, {
    collection: 'IntegrationCallMetrics',
    versionKey: false
});

IntegrationCallMetricSchema.index({ at: 1 }, { expireAfterSeconds: INTEGRATION_CALL_METRIC_TTL_SECONDS });
IntegrationCallMetricSchema.index({ integrationCode: 1, clientId: 1, at: -1 });

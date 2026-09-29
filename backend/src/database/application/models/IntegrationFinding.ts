import mongoose from 'mongoose';

// ADR-0018 Karar 2 — tek bulgu modeli (pasif bekçi/probe/kaynak izleme/mock senkronu hepsi buraya akar).
// Kanıt (evidence) REDAKTE edilmiş olmalıdır (bkz. compliance/FindingService.ts) — gerçek gövde değeri,
// müşteri adı/adres/telefon vb. ASLA buraya yazılmaz (yalnız anahtar yolu, tip adı, enum kodu, HTTP durumu,
// normalize işlem yolu, başlık ADI — bkz. ADR-0018 Karar 2a "Gizlilik ve sır").

export const INTEGRATION_FINDING_KINDS = [
    'schema', 'unknown_enum', 'endpoint', 'version', 'deprecation', 'auth', 'ratelimit', 'doc',
] as const;
export type IntegrationFindingKind = typeof INTEGRATION_FINDING_KINDS[number];

export const INTEGRATION_FINDING_SOURCES = ['guard', 'probe', 'source_monitor', 'manual', 'agent'] as const;
export type IntegrationFindingSource = typeof INTEGRATION_FINDING_SOURCES[number];

export const INTEGRATION_FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type IntegrationFindingSeverity = typeof INTEGRATION_FINDING_SEVERITIES[number];

export const INTEGRATION_FINDING_STATUSES = ['new', 'triaged', 'accepted', 'fixed', 'wontfix', 'false_positive'] as const;
export type IntegrationFindingStatus = typeof INTEGRATION_FINDING_STATUSES[number];

/** Kapalı bulgu TTL'i (ADR-0018 Karar 2: "Kapalı bulgular closedAt + 365 gün TTL ile silinir"). */
export const INTEGRATION_FINDING_CLOSED_TTL_SECONDS = 365 * 24 * 60 * 60;

const EvidenceSchema = new mongoose.Schema({
    paths: { type: [String], required: false },
    types: { type: [String], required: false },
    enumValue: { type: String, required: false },
    httpStatus: { type: Number, required: false },
    headerNames: { type: [String], required: false },
    sunsetAt: { type: String, required: false },
    /** ≤2KB (ADR-0018 Karar 2c). */
    docDiff: { type: String, required: false },
    fingerprint: { type: String, required: false },
}, { _id: false, strict: true });

export const IntegrationFindingSchema = new mongoose.Schema({
    dedupKey: { type: String, required: true, unique: true },
    integrationCode: { type: String, required: true },
    category: { type: String, required: true },
    kind: { type: String, enum: INTEGRATION_FINDING_KINDS, required: true },
    source: { type: String, enum: INTEGRATION_FINDING_SOURCES, required: true },
    subjectKey: { type: String, required: true },
    severity: { type: String, enum: INTEGRATION_FINDING_SEVERITIES, required: true },
    evidence: { type: EvidenceSchema, required: false, default: undefined },
    occurrences: { type: Number, required: true, default: 1 },
    firstSeenAt: { type: Date, required: true, default: Date.now },
    lastSeenAt: { type: Date, required: true, default: Date.now },
    /** Yalnız kimlik (sayısal clientId), ≤100 (ADR-0018 Karar 2). */
    affectedTenants: { type: [Number], required: true, default: [] },
    confirmed: { type: Boolean, required: true, default: false },
    status: { type: String, enum: INTEGRATION_FINDING_STATUSES, required: true, default: 'new' },
    adapterVersionSeen: { type: String, required: false },
    fixedInAdapterVersion: { type: String, required: false },
    fixRef: { type: String, required: false },
    /** ≤1KB. */
    recommendation: { type: String, required: false },
    decidedBy: { type: String, required: false },
    decidedAt: { type: Date, required: false },
    notes: { type: String, required: false },
    closedAt: { type: Date, required: false },
}, {
    collection: 'IntegrationFindings',
    versionKey: false,
    timestamps: false,
});

IntegrationFindingSchema.index(
    { closedAt: 1 },
    {
        expireAfterSeconds: INTEGRATION_FINDING_CLOSED_TTL_SECONDS,
        partialFilterExpression: { status: { $in: ['fixed', 'wontfix', 'false_positive'] } },
    },
);
IntegrationFindingSchema.index({ integrationCode: 1, kind: 1, status: 1 });
IntegrationFindingSchema.index({ status: 1, severity: 1, lastSeenAt: -1 });

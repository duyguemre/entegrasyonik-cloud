import mongoose from "mongoose";

// ADR-0017 Karar 3 ("JobRunRegistry") + ADR-0016 §2 (Alternatif B3): zamanlayıcı görünürlüğü.
// `JobState` -- iş adı başına TEK doküman (son durum). `JobRuns` -- yalnızca ANLAMLI turların geçmişi
// (başarısız/kısmi/nedenli atlama/processed>0 + saatte en az bir), TTL 14 gün.
//
// "Genel koşu şeması" (ADR-0017 Karar 3, son madde): bu iki koleksiyon yalnız zamanlayıcıya özgü değildir;
// ADR-0018'in ileride tanımlayacağı `AgentRun`'lar da AYNI koleksiyonu, aynı stale tespitini ve aynı konsol
// listesini kullanacak şekilde `runType`/`scope`/`trigger`/`budget`/`outputSummary`/`error`/`corrId` alanları
// ŞİMDİDEN eklenmiştir (çoğu zamanlayıcı için varsayılan değerde kalır).

const ScopeSchema = new mongoose.Schema({
    level:            { type: String, enum: ['platform', 'tenant'], default: 'platform' },
    tenantId:         { type: Number },
    integrationCode:  { type: String },
}, { _id: false });

const ErrorInfoSchema = new mongoose.Schema({
    code:    { type: String },
    message: { type: String }, // redakte edilmiş, <=500 karakter (bkz. JobRunRegistry.ts writer)
}, { _id: false });

export const JOB_RUNS_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 gün (ADR-0017 Karar 7)

export const JobStateSchema = new mongoose.Schema({
    name:               { type: String, required: true, unique: true },
    runType:            { type: String, enum: ['scheduler', 'agent', 'manual'], default: 'scheduler' },
    scope:              { type: ScopeSchema, default: () => ({ level: 'platform' }) },
    lastStartedAt:      { type: Date, default: null },
    lastFinishedAt:     { type: Date, default: null },
    lastSuccessAt:      { type: Date, default: null },
    lastStatus:         { type: String, enum: ['ok', 'partial', 'failed', 'skipped'], default: null },
    lastDurationMs:     { type: Number, default: null },
    lastCounts:         { type: mongoose.Schema.Types.Mixed, default: null },
    lastError:          { type: ErrorInfoSchema, default: null },
    consecutiveFailures:{ type: Number, default: 0 },
    // Koşuyorsa doludur (overlap/hung tespiti); bitince null'a döner.
    runningSince:       { type: Date, default: null },
    heartbeatAt:        { type: Date, default: null },
    pod:                { type: String, default: null },
    expectedIntervalMs: { type: Number, default: null },
}, {
    collection: 'JobState',
    versionKey: false,
    timestamps: true,
});

export const JobRunSchema = new mongoose.Schema({
    name:      { type: String, required: true },
    runType:   { type: String, enum: ['scheduler', 'agent', 'manual'], default: 'scheduler' },
    scope:     { type: ScopeSchema, default: () => ({ level: 'platform' }) },
    trigger:   { type: String, enum: ['interval', 'startup', 'manual', 'event'], required: true },
    startedAt: { type: Date, required: true },
    finishedAt:{ type: Date, required: true },
    durationMs:{ type: Number, required: true },
    status:    { type: String, enum: ['ok', 'partial', 'failed', 'skipped'], required: true },
    counts:    { type: mongoose.Schema.Types.Mixed, default: null },
    skippedReason: { type: String, default: null },
    // <= 2 KB yapılandırılmış özet (ADR-0017 Karar 3); büyükse writer tarafında kesilir.
    outputSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    error:     { type: ErrorInfoSchema, default: null },
    corrId:    { type: String, required: true },
    pod:       { type: String, default: null },
    budget:    { type: mongoose.Schema.Types.Mixed, default: null },
}, {
    collection: 'JobRuns',
    versionKey: false,
});

JobRunSchema.index({ finishedAt: 1 }, { expireAfterSeconds: JOB_RUNS_TTL_SECONDS });
JobRunSchema.index({ name: 1, finishedAt: -1 });

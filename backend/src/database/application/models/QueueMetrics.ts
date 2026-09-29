import mongoose from "mongoose";

// ADR-0005 Karar 4: BullMQ (`order-sync-queue`) ve katalog hattı (`ExportSignals`) için ORTAK dakikalık
// ölçüm kovası. ADR-0006'daki `IntegrationCallMetric` (istek başına HTTP metriği) İLE KARIŞTIRILMAMALI --
// bu koleksiyon KUYRUK/İŞ seviyesindedir (bekleme/işleme süresi, throughput), o koleksiyon DIŞ ÇAĞRI seviyesindedir.
// Yazan: `@services/metrics/QueueMetricsCollector` (best-effort, audit-logger deseniyle aynı: hata YUTULUR,
// ana akış ASLA bloklanmaz/geciktirilmez).

export const QUEUE_METRICS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 gün

export const QueueMetricsSchema = new mongoose.Schema({
    // "order-sync-queue" | "export" (katalog hattı, ExportSignals) | "redis" (INFO örneklemesi)
    queue:            { type: String, required: true },
    // Pazaryeri/entegrasyon kodu; Redis örneklemesi gibi entegrasyona özgü olmayan kayıtlarda "_system".
    integrationCode:  { type: String, required: true },
    // Kovanın başlangıcı (dakikaya yuvarlanmış); TTL bu alan üzerinden çalışır.
    minute:           { type: Date, required: true },
    count:            { type: Number, required: true, default: 0 },
    failed:           { type: Number, required: true, default: 0 },
    retried:          { type: Number, required: true, default: 0 },
    waitMsP50:        { type: Number },
    waitMsP95:        { type: Number },
    procMsP95:        { type: Number },
    // [ADR-0005 Karar 4] Redis INFO örneklemesi (60 sn) -- yalnızca queue:"redis" kayıtlarında dolu.
    usedMemory:       { type: Number },
    maxMemory:        { type: Number },
    cpuPercent:       { type: Number },
    connectedClients: { type: Number },
    opsPerSec:        { type: Number },
}, {
    collection: 'QueueMetrics',
    versionKey: false
});

QueueMetricsSchema.index({ minute: 1 }, { expireAfterSeconds: QUEUE_METRICS_TTL_SECONDS });
// Dakikalık toplamanın idempotent upsert hedefi (aynı kova için tek doküman).
QueueMetricsSchema.index({ queue: 1, integrationCode: 1, minute: 1 }, { unique: true });

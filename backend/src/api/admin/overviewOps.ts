// B1 (BACKOFFICE_PLAN §3 "B1 kompozisyonu"): Genel bakış / sağlık panosu. Paralel alt sorgular; her biri `sectionTimeoutMs` (2 sn) içinde bitmezse ya da
// hata verirse o bölüm `{ status:'degraded', error }` olur (tüm uç düşmez). Saf: bağımlılıklar enjekte edilir; DB/Redis'e yeni bağlantı AÇMAZ.
// Tenant iş verisi dönmez: yalnız sayaçlar, pod adları, entegrasyon kodları ve op adları.
import type { ReadinessStatus, AppRole } from '../../health/HealthCheck';
import { HISTOGRAM_BUCKETS_MS } from '@platform/runtime/metrics/MetricsRegistry';
import { type QueueProvider, ENGINE_QUEUES, QUEUE_COUNT_TYPES } from './engineOps';

export const SECTION_TIMEOUT_MS = 2000;
const HOUR_MS = 3_600_000;
const POD_WINDOW_MS = 15 * 60 * 1000; // admin-service.getSystemHealth ile aynı "aktif pod" penceresi
const MAX_PODS = 50;

export interface IntakeTarget { target: string; intake: 'on' | 'drain' | 'off' }

export interface OverviewDeps {
    applicationDB: {
        getExportSignalModel(): any; getImportJobModel(): any; getJobStateModel(): any; getMetricRollupModel(): any; getErrorEventModel(): any; getDeadLetterQueueModel(): any;
    };
    readiness: () => Promise<ReadinessStatus>;
    role: AppRole;
    queues: QueueProvider;
    intake: () => IntakeTarget[];
    podName: string;
    now?: () => number;
    sectionTimeoutMs?: number;
}

type Section<T> = ({ status: 'ok' } & T) | { status: 'degraded'; error: 'timeout' | 'error' };

async function guarded<T extends object>(ms: number, fn: () => Promise<T>): Promise<Section<T>> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), ms); (timer as any).unref?.(); });
    try {
        const r = await Promise.race([fn().then((v) => ({ v })), timeout]);
        if (r === 'timeout') return { status: 'degraded', error: 'timeout' };
        return { status: 'ok', ...r.v };
    } catch {
        return { status: 'degraded', error: 'error' };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Kovaya özgü (kümülatif DEĞİL) sayımlardan yüzdelik (kova üst sınırı; +Inf -> null). */
export function histogramPercentile(buckets: ReadonlyArray<number>, bounds: readonly number[], p: number): { valueMs: number | null; overflow: boolean } {
    const total = buckets.reduce((a, b) => a + b, 0);
    if (total <= 0) return { valueMs: null, overflow: false };
    const rank = Math.max(1, Math.ceil(p * total));
    let cum = 0;
    for (let i = 0; i < buckets.length; i++) {
        cum += buckets[i];
        if (cum >= rank) return i >= bounds.length ? { valueMs: null, overflow: true } : { valueMs: bounds[i], overflow: false };
    }
    return { valueMs: null, overflow: true };
}

export class OverviewOps {
    private readonly now: () => number;
    private readonly ms: number;
    constructor(private readonly d: OverviewDeps) {
        this.now = d.now ?? (() => Date.now());
        this.ms = d.sectionTimeoutMs ?? SECTION_TIMEOUT_MS;
    }

    async getHealth(): Promise<any> {
        const nowMs = this.now();
        const [dependencies, pods, red, queues, issues] = await Promise.all([
            guarded(this.ms, () => this.dependencies()),
            guarded(this.ms, () => this.pods(nowMs)),
            guarded(this.ms, () => this.red(nowMs)),
            guarded(this.ms, () => this.queues()),
            guarded(this.ms, () => this.issues(nowMs)),
        ]);
        const intake = await guarded(this.ms, async () => {
            const restricted = this.d.intake();
            return { restricted, allOpen: restricted.length === 0, scope: 'process' as const };
        });
        const sections = { dependencies, pods, red, queues, intake, issues };
        const degradedSections = Object.entries(sections).filter(([, s]) => s.status === 'degraded').map(([k]) => k);
        const notReady = dependencies.status === 'ok' && !(dependencies as any).ready;
        return {
            generatedAt: new Date(nowMs).toISOString(),
            status: degradedSections.length > 0 || notReady ? 'degraded' : 'ok',
            degradedSections,
            ...sections,
        };
    }

    private async dependencies() {
        const r = await this.d.readiness();
        return { ready: r.ready, role: this.d.role, mongo: r.mongo, redis: r.redis };
    }

    private async pods(nowMs: number) {
        const since = new Date(nowMs - POD_WINDOW_MS);
        const db = this.d.applicationDB;
        const leaseAgg = (model: any) => model.aggregate([
            { $match: { lockedBy: { $ne: null } } },
            { $group: { _id: '$lockedBy', leases: { $sum: 1 }, lastActivityAt: { $max: '$updatedAt' } } },
            { $limit: MAX_PODS },
        ]).option({ maxTimeMS: this.ms });
        const [exp, imp, states]: [any[], any[], any[]] = await Promise.all([
            leaseAgg(db.getExportSignalModel()), leaseAgg(db.getImportJobModel()),
            db.getJobStateModel().find({ pod: { $ne: null }, $or: [{ heartbeatAt: { $gte: since } }, { lastStartedAt: { $gte: since } }] })
                .select({ pod: 1, heartbeatAt: 1, lastStartedAt: 1, runningSince: 1 }).limit(200).maxTimeMS(this.ms).lean(),
        ]);
        const map = new Map<string, { pod: string; activeLeases: number; runningJobs: number; lastSeenAt: number }>();
        const slot = (pod: string) => { let p = map.get(pod); if (!p) { p = { pod, activeLeases: 0, runningJobs: 0, lastSeenAt: 0 }; map.set(pod, p); } return p; };
        for (const r of [...exp, ...imp]) {
            if (typeof r._id !== 'string' || !r._id) continue;
            const p = slot(r._id.trim()); p.activeLeases += r.leases; p.lastSeenAt = Math.max(p.lastSeenAt, r.lastActivityAt ? new Date(r.lastActivityAt).getTime() : 0);
        }
        for (const s of states) {
            if (typeof s.pod !== 'string' || !s.pod) continue;
            const p = slot(s.pod.trim());
            if (s.runningSince) p.runningJobs += 1;
            p.lastSeenAt = Math.max(p.lastSeenAt, s.heartbeatAt ? new Date(s.heartbeatAt).getTime() : 0, s.lastStartedAt ? new Date(s.lastStartedAt).getTime() : 0);
        }
        const list = [...map.values()].sort((a, b) => a.pod.localeCompare(b.pod)).slice(0, MAX_PODS)
            .map((p) => ({ pod: p.pod, activeLeases: p.activeLeases, runningJobs: p.runningJobs, lastSeenAt: p.lastSeenAt ? new Date(p.lastSeenAt).toISOString() : null, self: p.pod === this.d.podName }));
        return { self: this.d.podName, windowMinutes: POD_WINDOW_MS / 60000, items: list };
    }

    private async red(nowMs: number) {
        const from = new Date(Math.floor((nowMs - HOUR_MS) / 300_000) * 300_000);
        const docs: any[] = await this.d.applicationDB.getMetricRollupModel()
            .find({ metric: { $in: ['http_requests', 'http_request_duration_ms'] }, resolution: '5m', bucketStart: { $gte: from } })
            .maxTimeMS(this.ms).lean();
        const byClass: Record<string, number> = {};
        const hist = new Array(HISTOGRAM_BUCKETS_MS.length + 1).fill(0);
        let durCount = 0, durSum = 0;
        for (const d of docs) {
            for (const entry of Object.values(d?.series || {}) as any[]) {
                if (d.metric === 'http_requests') {
                    const cls = String(entry?.labels?.statusClass ?? 'xxx');
                    byClass[cls] = (byClass[cls] ?? 0) + (Number(entry?.c) || 0);
                } else {
                    durCount += Number(entry?.c) || 0; durSum += Number(entry?.sum) || 0;
                    for (const [i, n] of Object.entries(entry?.h || {})) {
                        const idx = Number(i);
                        if (Number.isInteger(idx) && idx >= 0 && idx < hist.length) hist[idx] += Number(n) || 0;
                    }
                }
            }
        }
        const requests = Object.values(byClass).reduce((a, b) => a + b, 0);
        const errors5xx = byClass['5xx'] ?? 0;
        const p95 = histogramPercentile(hist, HISTOGRAM_BUCKETS_MS, 0.95);
        return {
            windowMinutes: 60, from: from.toISOString(), requests, byStatusClass: byClass, errors5xx,
            errorRate: requests > 0 ? Number((errors5xx / requests).toFixed(4)) : null,
            requestsPerMinute: Number((requests / 60).toFixed(2)),
            durationAvgMs: durCount > 0 ? Math.round(durSum / durCount) : null, durationP95Ms: p95.valueMs, durationP95Overflow: p95.overflow,
            scope: 'platform' as const, note: 'Pod flush aralığı (60 sn) kadar gecikmeli; tüm podlar toplanır.',
        };
    }

    private async queues() {
        const items = await Promise.all(ENGINE_QUEUES.map(async (name) => {
            const q = this.d.queues(name);
            let counts: Record<string, number> | null = null;
            if (q) { try { counts = await q.getJobCounts(...QUEUE_COUNT_TYPES); } catch { counts = null; } }
            const dlqPending = await this.d.applicationDB.getDeadLetterQueueModel().countDocuments({ queueName: name, status: 'PENDING_MANUAL_REVIEW' }).maxTimeMS(this.ms).catch(() => null);
            const c = (t: string) => Number(counts?.[t]) || 0;
            return { name, available: counts !== null, backlog: counts ? c('wait') + c('delayed') : null, active: counts ? c('active') : null, failed: counts ? c('failed') : null, dlqPending };
        }));
        return { items };
    }

    private async issues(nowMs: number) {
        const model = this.d.applicationDB.getErrorEventModel();
        const since = new Date(nowMs - 24 * HOUR_MS);
        const [open, newLast24h] = await Promise.all([
            model.countDocuments({ status: 'open' }).maxTimeMS(this.ms),
            model.countDocuments({ status: 'open', firstSeen: { $gte: since } }).maxTimeMS(this.ms),
        ]);
        return { open, newLast24h };
    }
}

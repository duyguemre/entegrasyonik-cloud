// B7a-d (BACKOFFICE_PLAN §2.5): Motor ve kuyruklar -- BullMQ kuyruk sayaçları + 24 sa serisi, başarısız işler (yük YOK), retry/discard,
// katalog durum makinesi (ExportSignals/ImportJobs) + takılı kiralar + kira bırakma, zamanlayıcı koşuları (JobRunRegistry).
// Saf iş mantığı: HTTP/RunOperation bilmez; BullMQ kuyruğu, Mongo modelleri ve saat ENJEKTE edilir (testler Redis/Mongo'ya bağlanmaz).
// Güvenlik: tenant iş verisi ve iş yükü (job.data / failedReason / errorMessage / outputSummary) YANITA GİRMEZ; yalnız kimlik, tenant numarası,
// entegrasyon kodu, hata KODU, sayaçlar ve zamanlar döner. Tüm sorgular maxTimeMS<=5000, sayfa<=200, imleç keyset/ofset.
import { ApplicationError } from '@platform/core/errors';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getRequestId } from '@platform/core/context';
import exportConfig from '../../integration/engine/catalog/export/export.config.json';
import importConfig from '../../integration/engine/catalog/import/import.config.json';

export const ENGINE_QUEUES = ['order-sync-queue'] as const;
export type EngineQueueName = typeof ENGINE_QUEUES[number];
export const QUEUE_COUNT_TYPES = ['wait', 'active', 'delayed', 'failed', 'completed', 'paused'] as const;
export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;
export const QUERY_MAX_TIME_MS = 5000;
export const STUCK_LIST_MAX = 100;
const HOUR_MS = 3_600_000;

export interface BullJobLike {
    id?: string | undefined;
    name: string;
    data?: any;
    attemptsMade: number;
    failedReason?: string;
    finishedOn?: number;
    timestamp?: number;
    opts?: { attempts?: number };
    getState(): Promise<string>;
    retry(state?: string): Promise<void>;
    remove(): Promise<void>;
}
export interface BullQueueLike {
    getJobCounts(...types: string[]): Promise<Record<string, number>>;
    getJobs(types: string[], start: number, end: number, asc?: boolean): Promise<BullJobLike[]>;
    getJob(id: string): Promise<BullJobLike | undefined | null>;
}
/** Kuyruk yoksa (Redis hazır değil / rol `web`) null. */
export type QueueProvider = (name: EngineQueueName) => BullQueueLike | null;

export interface EngineActor { sub?: string; ip?: string }

export interface EngineDeps {
    applicationDB: {
        getQueueMetricsModel(): any; getDeadLetterQueueModel(): any; getExportSignalModel(): any; getImportJobModel(): any;
        getJobStateModel(): any; getJobRunModel(): any;
    };
    queues: QueueProvider;
    now?: () => number;
    exportLockTimeoutMs?: number;
    importLockTimeoutMs?: number;
}

const bad = (m: string): never => { throw new ApplicationError(m, 400, 'VALIDATION'); };
const unavailable = (): never => { throw new ApplicationError('Kuyruk şu an kullanılamıyor (Redis hazır değil).', 503, 'QUEUE_UNAVAILABLE'); };

export const clampLimit = (v: unknown): number => Math.min(MAX_LIMIT, Math.max(1, Number.isInteger(v) ? (v as number) : DEFAULT_LIMIT));

const encode = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
const decode = (c: string): string => Buffer.from(c, 'base64url').toString('utf8');
export function encodeOffsetCursor(n: number): string { return encode(`o:${n}`); }
export function decodeOffsetCursor(c: string): number {
    const m = /^o:(\d{1,9})$/.exec(decode(c));
    return m ? Number(m[1]) : bad('cursor: imleç geçersiz');
}
export function encodeTimeCursor(at: Date, id: unknown): string { return encode(`${at.getTime()}:${String(id)}`); }
export function decodeTimeCursor(c: string): { at: Date; id: string } {
    const m = /^(\d{1,15}):([a-f0-9]{24})$/.exec(decode(c));
    return m ? { at: new Date(Number(m[1])), id: m[2] } : bad('cursor: imleç geçersiz');
}

/** `[CODE] ...` önekinden IntegrationError kodu (bkz. OrderErrorHandler); yoksa UNKNOWN. Mesajın KENDİSİ dönmez. */
export function errorCodeOf(reason: unknown): string {
    const m = typeof reason === 'string' ? /^\[([A-Z_]{2,32})\]/.exec(reason) : null;
    return m ? m[1] : 'UNKNOWN';
}

const numericCounts = (v: any): Record<string, number> | null => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v).slice(0, 20)) if (typeof n === 'number' && Number.isFinite(n)) out[k.slice(0, 40)] = n;
    return out;
};

const tenantNo = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== undefined && v !== '' ? n : null; };

export class EngineOps {
    private readonly now: () => number;
    private readonly exportTimeout: number;
    private readonly importTimeout: number;
    constructor(private readonly d: EngineDeps) {
        this.now = d.now ?? (() => Date.now());
        this.exportTimeout = d.exportLockTimeoutMs ?? ((exportConfig as any).exportOrchestrator?.lockTimeout || 1_800_000);
        this.importTimeout = d.importLockTimeoutMs ?? ((importConfig as any).importOrchestrator?.lockTimeout || 1_800_000);
    }

    private audit(event: string, actor: EngineActor | undefined, result: 'ok' | 'fail', meta: Record<string, string | number | boolean>): void {
        void AuditLogger.log({ event, result, sub: actor?.sub, ip: actor?.ip, surface: 'backoffice', actorType: 'platform', reqId: getRequestId(), meta });
    }

    private queue(name: EngineQueueName): BullQueueLike {
        if (!(ENGINE_QUEUES as readonly string[]).includes(name)) bad('queue: bilinmeyen kuyruk');
        return this.d.queues(name) ?? unavailable();
    }

    // ---------------------------------------------------------------- B7a
    async getQueues(): Promise<any> {
        const nowMs = this.now();
        const fromHour = Math.floor((nowMs - 24 * HOUR_MS) / HOUR_MS) * HOUR_MS;
        const toHour = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
        const series = await this.hourlySeries(fromHour);
        const queues = await Promise.all(ENGINE_QUEUES.map(async (name) => {
            const q = this.d.queues(name);
            let counts: Record<string, number> | null = null;
            let available = false;
            if (q) {
                try { counts = await q.getJobCounts(...QUEUE_COUNT_TYPES); available = true; } catch { counts = null; }
            }
            const dlqPending = await this.d.applicationDB.getDeadLetterQueueModel()
                .countDocuments({ queueName: name, status: 'PENDING_MANUAL_REVIEW' }).maxTimeMS(QUERY_MAX_TIME_MS).catch(() => null);
            const byHour = new Map<number, any>((series.get(name) ?? []).map((p: any) => [p.t, p]));
            const points: any[] = [];
            for (let t = fromHour; t <= toHour; t += HOUR_MS) {
                const p = byHour.get(t);
                points.push({ t: new Date(t).toISOString(), count: p?.count ?? 0, failed: p?.failed ?? 0, retried: p?.retried ?? 0, waitMsP95Max: p?.waitMsP95 ?? null, procMsP95Max: p?.procMsP95 ?? null });
            }
            return {
                name, available,
                counts: counts ? Object.fromEntries(QUEUE_COUNT_TYPES.map((t) => [t, Number(counts![t]) || 0])) : null,
                dlq: { pendingReview: dlqPending },
                metrics: { resolution: '1h', from: new Date(fromHour).toISOString(), to: new Date(toHour + HOUR_MS).toISOString(), series: points },
            };
        }));
        return { generatedAt: new Date(nowMs).toISOString(), queues };
    }

    private async hourlySeries(fromHour: number): Promise<Map<string, any[]>> {
        const out = new Map<string, any[]>();
        try {
            const agg = this.d.applicationDB.getQueueMetricsModel().aggregate([
                { $match: { queue: { $in: [...ENGINE_QUEUES] }, minute: { $gte: new Date(fromHour) } } },
                { $group: {
                    _id: { queue: '$queue', t: { $subtract: [{ $toLong: '$minute' }, { $mod: [{ $toLong: '$minute' }, HOUR_MS] }] } },
                    count: { $sum: '$count' }, failed: { $sum: '$failed' }, retried: { $sum: '$retried' },
                    waitMsP95: { $max: '$waitMsP95' }, procMsP95: { $max: '$procMsP95' },
                } },
                { $sort: { '_id.t': 1 } },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            const rows: any[] = await agg;
            for (const r of rows) {
                const list = out.get(r._id.queue) ?? [];
                list.push({ t: Number(r._id.t), count: r.count, failed: r.failed, retried: r.retried, waitMsP95: r.waitMsP95 ?? null, procMsP95: r.procMsP95 ?? null });
                out.set(r._id.queue, list);
            }
        } catch { /* ölçüm okunamadı: seri boş (sayaçlar yine döner) */ }
        return out;
    }

    // ---------------------------------------------------------------- B7b
    async listFailedJobs(input: { queue: EngineQueueName; source?: 'bullmq' | 'dlq'; cursor?: string; limit?: number }): Promise<any> {
        const limit = clampLimit(input.limit);
        if ((input.source ?? 'bullmq') === 'dlq') return this.listDlq(input.queue, input.cursor, limit);
        const q = this.queue(input.queue);
        const start = input.cursor !== undefined ? decodeOffsetCursor(input.cursor) : 0;
        const jobs = await q.getJobs(['failed'], start, start + limit, false); // en yeni önce; limit+1 okunur
        const hasMore = jobs.length > limit;
        const page = hasMore ? jobs.slice(0, limit) : jobs;
        return {
            source: 'bullmq', queue: input.queue,
            items: page.map((j) => ({
                id: String(j.id), operation: String(j.name).slice(0, 100), tenantId: tenantNo(j.data?.clientId), integrationCode: typeof j.data?.integrationCode === 'string' ? j.data.integrationCode.slice(0, 64) : null,
                errorCode: errorCodeOf(j.failedReason), attemptsMade: j.attemptsMade, maxAttempts: j.opts?.attempts ?? null,
                failedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null, enqueuedAt: j.timestamp ? new Date(j.timestamp).toISOString() : null,
            })),
            nextCursor: hasMore ? encodeOffsetCursor(start + limit) : null,
        };
    }

    private async listDlq(queue: string, cursor: string | undefined, limit: number): Promise<any> {
        const match: Record<string, any> = { queueName: queue };
        let query: Record<string, any> = match;
        if (cursor !== undefined) {
            const c = decodeTimeCursor(cursor);
            query = { $and: [match, { $or: [{ failedAt: { $lt: c.at } }, { failedAt: c.at, _id: { $lt: c.id } }] }] };
        }
        const rows: any[] = await this.d.applicationDB.getDeadLetterQueueModel().find(query)
            .select({ originalJobId: 1, clientId: 1, integrationCode: 1, failedReason: 1, dlqType: 1, status: 1, failedAt: 1 })
            .sort({ failedAt: -1, _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const last = page[page.length - 1];
        return {
            source: 'dlq', queue,
            items: page.map((r) => ({
                id: String(r._id), originalJobId: r.originalJobId ?? null, tenantId: tenantNo(r.clientId), integrationCode: r.integrationCode ?? null,
                errorCode: errorCodeOf(r.failedReason), dlqType: r.dlqType ?? null, status: r.status ?? null, failedAt: r.failedAt ? new Date(r.failedAt).toISOString() : null,
            })),
            nextCursor: hasMore && last ? encodeTimeCursor(new Date(last.failedAt), last._id) : null,
        };
    }

    private async failedJob(queue: EngineQueueName, jobId: string): Promise<BullJobLike> {
        const q = this.queue(queue);
        const job = await q.getJob(jobId);
        if (!job) throw new ApplicationError('İş bulunamadı.', 404, 'JOB_NOT_FOUND');
        const state = await job.getState();
        if (state !== 'failed') throw new ApplicationError(`İş başarısız durumda değil (durum: ${state}).`, 409, 'JOB_NOT_FAILED');
        return job;
    }

    async retryJob(actor: EngineActor | undefined, input: { queue: EngineQueueName; jobId: string; reason: string }): Promise<any> {
        const job = await this.failedJob(input.queue, input.jobId);
        await job.retry('failed');
        this.audit('backoffice.engine.retry_job', actor, 'ok', { queue: input.queue, jobId: input.jobId, tenantId: tenantNo(job.data?.clientId) ?? -1, reason: input.reason });
        return { queue: input.queue, jobId: input.jobId, retried: true };
    }

    async discardJob(actor: EngineActor | undefined, input: { queue: EngineQueueName; jobId: string; reason: string }): Promise<any> {
        const job = await this.failedJob(input.queue, input.jobId);
        await job.remove();
        this.audit('backoffice.engine.discard_job', actor, 'ok', { queue: input.queue, jobId: input.jobId, tenantId: tenantNo(job.data?.clientId) ?? -1, reason: input.reason });
        return { queue: input.queue, jobId: input.jobId, discarded: true };
    }

    // ---------------------------------------------------------------- B7c
    private stuckFilter(kind: 'export' | 'import', nowMs: number): Record<string, any> {
        if (kind === 'export') {
            const before = new Date(nowMs - this.exportTimeout);
            return { lockedBy: { $ne: null }, $or: [{ lockExpiry: { $lt: new Date(nowMs) } }, { updatedAt: { $lte: before } }] };
        }
        return { lockedBy: { $ne: null }, lastCheckedAt: { $lte: new Date(nowMs - this.importTimeout) } };
    }

    async getStateMachineJobs(): Promise<any> {
        const nowMs = this.now();
        const db = this.d.applicationDB;
        const dist = async (model: any) => {
            const rows: any[] = await model.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
        };
        const stuckList = async (kind: 'export' | 'import') => {
            const model = kind === 'export' ? db.getExportSignalModel() : db.getImportJobModel();
            const rows: any[] = await model.find(this.stuckFilter(kind, nowMs)).sort({ updatedAt: 1, _id: 1 }).limit(STUCK_LIST_MAX).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            return rows.map((r) => {
                const since = kind === 'export' ? (r.updatedAt ?? r.lockExpiry) : r.lastCheckedAt;
                return {
                    kind, id: String(r._id), tenantId: tenantNo(r.clientId), integrationCode: r.integrationCode ?? null, status: r.status ?? null,
                    lockedBy: r.lockedBy ?? null, leaseExpiredAt: kind === 'export' && r.lockExpiry ? new Date(r.lockExpiry).toISOString() : null,
                    lastActivityAt: since ? new Date(since).toISOString() : null, staleForMs: since ? Math.max(0, nowMs - new Date(since).getTime()) : null,
                };
            });
        };
        const lockedCount = (model: any) => model.countDocuments({ lockedBy: { $ne: null } }).maxTimeMS(QUERY_MAX_TIME_MS);
        const [expDist, impDist, expLocked, impLocked, expStuck, impStuck] = await Promise.all([
            dist(db.getExportSignalModel()), dist(db.getImportJobModel()), lockedCount(db.getExportSignalModel()), lockedCount(db.getImportJobModel()),
            stuckList('export'), stuckList('import'),
        ]);
        const stuck = [...expStuck, ...impStuck];
        return {
            generatedAt: new Date(nowMs).toISOString(),
            leaseTimeoutMs: { export: this.exportTimeout, import: this.importTimeout },
            exportSignals: { byStatus: expDist, locked: expLocked },
            importJobs: { byStatus: impDist, locked: impLocked },
            stuckLeases: stuck,
            stuckLeaseCount: stuck.length,
            stuckListTruncated: expStuck.length >= STUCK_LIST_MAX || impStuck.length >= STUCK_LIST_MAX,
        };
    }

    async releaseStuckLease(actor: EngineActor | undefined, input: { kind: 'export' | 'import'; id: string; reason: string }): Promise<any> {
        const nowMs = this.now();
        const model = input.kind === 'export' ? this.d.applicationDB.getExportSignalModel() : this.d.applicationDB.getImportJobModel();
        const existing: any = await model.findOne({ _id: input.id }).select({ lockedBy: 1, status: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        if (!existing) throw new ApplicationError('Kayıt bulunamadı.', 404, 'JOB_NOT_FOUND');
        const previousOwner: string | null = existing.lockedBy ?? null;
        const previousStatus = existing.status;
        // Koşul güncellemenin İÇİNDE yeniden uygulanır: arada sağlıklı bir pod kirayı yenilediyse dokunulmaz (yarış güvenli).
        const set: Record<string, any> = { lockedBy: null, updatedAt: new Date(nowMs) };
        if (input.kind === 'import' && (previousStatus === 'FETCHING' || previousStatus === 'PROCESSING')) set.status = 'FAILED'; // ImportOrchestrator.clearZombies ile aynı
        const res: any = await model.updateOne({ _id: input.id, ...this.stuckFilter(input.kind, nowMs) }, { $set: set }).maxTimeMS(QUERY_MAX_TIME_MS);
        if ((res?.modifiedCount ?? res?.nModified ?? 0) === 0) {
            this.audit('backoffice.engine.release_lease', actor, 'fail', { kind: input.kind, id: input.id, why: 'not_stuck', reason: input.reason });
            throw new ApplicationError('Kira takılı değil (süresi dolmamış ya da zaten bırakılmış).', 409, 'LEASE_NOT_STUCK');
        }
        this.audit('backoffice.engine.release_lease', actor, 'ok', { kind: input.kind, id: input.id, previousOwner: String(previousOwner ?? '').slice(0, 100), reason: input.reason });
        return { kind: input.kind, id: input.id, released: true, previousOwner };
    }

    // ---------------------------------------------------------------- B7d
    async listJobRuns(input: { job?: string; status?: 'ok' | 'partial' | 'failed' | 'skipped'; cursor?: string; limit?: number }): Promise<any> {
        const limit = clampLimit(input.limit);
        const nowMs = this.now();
        const match: Record<string, any> = {};
        if (input.job !== undefined) match.name = input.job;
        if (input.status !== undefined) match.status = input.status;
        let query: Record<string, any> = match;
        if (input.cursor !== undefined) {
            const c = decodeTimeCursor(input.cursor);
            query = { $and: [match, { $or: [{ finishedAt: { $lt: c.at } }, { finishedAt: c.at, _id: { $lt: c.id } }] }] };
        }
        const rows: any[] = await this.d.applicationDB.getJobRunModel().find(query)
            .select({ name: 1, runType: 1, scope: 1, trigger: 1, startedAt: 1, finishedAt: 1, durationMs: 1, status: 1, counts: 1, skippedReason: 1, error: 1, corrId: 1, pod: 1 })
            .sort({ finishedAt: -1, _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const last = page[page.length - 1];
        const out: any = {
            items: page.map((r) => ({
                id: String(r._id), job: r.name, runType: r.runType ?? 'scheduler', trigger: r.trigger, status: r.status,
                startedAt: r.startedAt, finishedAt: r.finishedAt, durationMs: r.durationMs, counts: numericCounts(r.counts), skippedReason: r.skippedReason ? String(r.skippedReason).slice(0, 200) : null,
                error: r.error ? { code: r.error.code ?? null, message: typeof r.error.message === 'string' ? r.error.message.slice(0, 500) : null } : null,
                scope: r.scope?.level === 'tenant' ? { level: 'tenant', tenantId: r.scope.tenantId ?? null, integrationCode: r.scope.integrationCode ?? null } : { level: 'platform' },
                corrId: r.corrId, pod: r.pod ?? null,
            })),
            nextCursor: hasMore && last ? encodeTimeCursor(new Date(last.finishedAt), last._id) : null,
            retentionDays: 14,
        };
        if (input.cursor === undefined) { // ilk sayfa: iş başına son durum özeti (JobState)
            const states: any[] = await this.d.applicationDB.getJobStateModel().find(input.job ? { name: input.job } : {}).sort({ name: 1 }).limit(MAX_LIMIT).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            out.states = states.map((s) => {
                const expected = typeof s.expectedIntervalMs === 'number' ? s.expectedIntervalMs : null;
                const ref = s.lastFinishedAt ?? s.lastStartedAt;
                return {
                    job: s.name, lastStatus: s.lastStatus ?? null, lastStartedAt: s.lastStartedAt ?? null, lastFinishedAt: s.lastFinishedAt ?? null, lastSuccessAt: s.lastSuccessAt ?? null,
                    lastDurationMs: s.lastDurationMs ?? null, consecutiveFailures: s.consecutiveFailures ?? 0, runningSince: s.runningSince ?? null, heartbeatAt: s.heartbeatAt ?? null,
                    pod: s.pod ?? null, expectedIntervalMs: expected, overdue: !!(expected && (!ref || nowMs - new Date(ref).getTime() > 3 * expected)),
                };
            });
        }
        return out;
    }
}

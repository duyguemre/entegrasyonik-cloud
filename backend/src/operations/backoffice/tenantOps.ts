// BE-01/BE-02 (K51): müşteri listesi operasyon özeti + müşteri sağlık özeti. SAF: modeller/kuyruk enjekte edilir; DB/Redis'e yeni bağlantı AÇMAZ.
// Tenant iş verisi dönmez: yalnız tid + başlık + sayaçlar + kodlar. tid = `Clients.clientId` (abonelik, kuyruk işi, çağrı metriği, uyarı ve hata-kovası kimliği; yoksa `order`).
// Açık sorun sayısı YAKLAŞIKTIR: ErrorEvents tenant kimliği saklamaz, 256 kovalı küme tutar (`tenantBucketOf`); çakışmada fazla sayar, eksik saymaz.
import { ApplicationError } from '@platform/core/errors';
import { tenantBucketOf } from '@platform/runtime/metrics/errorEvents';
import { guard, SECTION_TIMEOUT_MS, type SectionError } from './guarded';

export const SCAN_MAX_TENANTS = 1000;
export const QUERY_MAX_TIME_MS = 5000;
const DAY_MS = 86_400_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const OPEN_ISSUES_SCAN = 1000;

/** BullMQ `failed` kümesinden (son 500) yalnız (tid, bitiş zamanı); Redis yoksa null. */
export type FailedBullJobs = () => Promise<Array<{ tid: number | null; finishedOn?: number }> | null>;

export interface TenantOpsDeps {
    clientModel: any; subscriptionModel: any; errorEventModel: any; dlqModel: any; callMetricModel: any; alertModel: any;
    failedBullJobs: FailedBullJobs;
    now?: () => number;
    sectionTimeoutMs?: number;
}

export interface ListTenantsInput {
    hasIssues?: boolean; subscriptionStatus?: string[]; status?: string[]; q?: string;
    sortBy?: 'tid' | 'name' | 'openIssues' | 'lastErrorAt' | 'failedJobs24h'; sortDir?: 'asc' | 'desc'; cursor?: string; limit?: number;
}

const encodeCursor = (n: number): string => Buffer.from(`o:${n}`, 'utf8').toString('base64url');
function decodeCursor(c: string): number {
    const m = /^o:(\d{1,9})$/.exec(Buffer.from(c, 'base64url').toString('utf8'));
    if (!m) throw new ApplicationError('cursor: imleç geçersiz', 400, 'VALIDATION');
    return Number(m[1]);
}
const iso = (v: unknown): string | null => { if (v === null || v === undefined) return null; const d = new Date(v as any); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
export const tidOfClient = (c: any): number | null => { const n = Number(c?.clientId ?? c?.order); return Number.isInteger(n) && n > 0 ? n : null; };

export async function listTenants(d: TenantOpsDeps, input: ListTenantsInput): Promise<any> {
    const nowMs = (d.now ?? Date.now)();
    const ms = d.sectionTimeoutMs ?? SECTION_TIMEOUT_MS;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isInteger(input.limit) ? input.limit! : DEFAULT_LIMIT));
    const start = input.cursor !== undefined ? decodeCursor(input.cursor) : 0;

    const filter: Record<string, any> = input.status?.length ? { status: { $in: input.status } } : { status: { $ne: 'PURGED' } };
    const rows: any[] = await d.clientModel.find(filter).select({ clientId: 1, order: 1, title: 1, status: 1 }).sort({ order: 1 }).limit(SCAN_MAX_TENANTS + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
    const scanTruncated = rows.length > SCAN_MAX_TENANTS;
    const clients = (scanTruncated ? rows.slice(0, SCAN_MAX_TENANTS) : rows).map((c) => ({ tid: tidOfClient(c), name: typeof c.title === 'string' ? c.title : null, status: String(c.status ?? '') })).filter((c): c is { tid: number; name: string | null; status: string } => c.tid !== null);
    const tids = clients.map((c) => c.tid);
    const since24h = new Date(nowMs - DAY_MS);
    const since7d = new Date(nowMs - 7 * DAY_MS);

    const [subs, issues, dlq, bull, lastErr] = await Promise.all([
        guard(ms, async () => {
            const r: any[] = await d.subscriptionModel.find({ clientId: { $in: tids } }).select({ clientId: 1, planCode: 1, status: 1 }).limit(SCAN_MAX_TENANTS + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            return new Map<number, { planCode: string | null; status: string | null }>(r.map((s) => [Number(s.clientId), { planCode: s.planCode ?? null, status: s.status ?? null }]));
        }),
        guard(ms, async () => {
            const r: any[] = await d.errorEventModel.find({ status: 'open' }).select({ tenantBuckets: 1 }).limit(OPEN_ISSUES_SCAN).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            const perBucket = new Map<number, number>();
            for (const g of r) for (const b of new Set<number>(Array.isArray(g.tenantBuckets) ? g.tenantBuckets : [])) perBucket.set(b, (perBucket.get(b) ?? 0) + 1);
            return perBucket;
        }),
        guard(ms, async () => {
            const r: any[] = await d.dlqModel.aggregate([
                { $match: { failedAt: { $gte: since24h }, clientId: { $in: tids } } }, { $group: { _id: '$clientId', n: { $sum: 1 } } },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            return new Map<number, number>(r.map((x) => [Number(x._id), x.n]));
        }),
        guard(ms, async () => {
            const jobs = await d.failedBullJobs();
            if (jobs === null) return null;
            const m = new Map<number, number>();
            for (const j of jobs) if (j.tid !== null && (j.finishedOn ?? 0) >= since24h.getTime()) m.set(j.tid, (m.get(j.tid) ?? 0) + 1);
            return m;
        }),
        guard(ms, async () => {
            const r: any[] = await d.callMetricModel.aggregate([
                { $match: { status: 'error', at: { $gte: since7d }, clientId: { $in: tids.map(String) } } }, { $group: { _id: '$clientId', at: { $max: '$at' } } },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            return new Map<number, Date>(r.map((x) => [Number(x._id), new Date(x.at)]));
        }),
    ]);
    const opsDegraded: string[] = [];
    if (!subs.ok) opsDegraded.push('subscriptions');
    if (!issues.ok) opsDegraded.push('openIssues');
    if (!dlq.ok) opsDegraded.push('failedJobs');
    if (!lastErr.ok) opsDegraded.push('lastErrorAt');
    // BullMQ okunamadı (Redis yok/zaman aşımı): yalnız DLQ sayılır, yine de `failedJobs` kısmi diye işaretlenir.
    if (!bull.ok || bull.value === null) { if (!opsDegraded.includes('failedJobs')) opsDegraded.push('failedJobs'); }

    const items = clients.map((c) => {
        const sub = subs.ok ? subs.value.get(c.tid) : undefined;
        const openIssues = issues.ok ? (issues.value.get(tenantBucketOf(c.tid)) ?? 0) : 0;
        const failedJobs24h = (dlq.ok ? dlq.value.get(c.tid) ?? 0 : 0) + (bull.ok && bull.value ? bull.value.get(c.tid) ?? 0 : 0);
        const lastErrorAt = lastErr.ok ? lastErr.value.get(c.tid) ?? null : null;
        return {
            tid: c.tid, name: c.name, status: c.status,
            ops: { planCode: sub?.planCode ?? null, subscriptionStatus: sub?.status ?? null, openIssues, openIssuesApprox: true, failedJobs24h, lastErrorAt: iso(lastErr.ok ? lastErrorAt : null) },
            _lastErrMs: lastErrorAt ? lastErrorAt.getTime() : null,
        };
    });

    const q = input.q?.toLocaleLowerCase('tr');
    const filtered = items.filter((it) => {
        if (q !== undefined && !(it.name ?? '').toLocaleLowerCase('tr').includes(q)) return false;
        if (input.subscriptionStatus?.length && !(it.ops.subscriptionStatus && input.subscriptionStatus.includes(it.ops.subscriptionStatus))) return false;
        if (input.hasIssues !== undefined) {
            const has = it.ops.openIssues > 0 || it.ops.failedJobs24h > 0 || (it._lastErrMs !== null && it._lastErrMs >= since24h.getTime());
            if (has !== input.hasIssues) return false;
        }
        return true;
    });

    const by = input.sortBy ?? 'tid';
    const dir = (input.sortDir ?? (by === 'tid' || by === 'name' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
    const keyOf = (it: typeof items[number]): number | string | null =>
        by === 'name' ? (it.name ?? '').toLocaleLowerCase('tr') : by === 'openIssues' ? it.ops.openIssues : by === 'failedJobs24h' ? it.ops.failedJobs24h : by === 'lastErrorAt' ? it._lastErrMs : it.tid;
    filtered.sort((a, b) => {
        const x = keyOf(a), y = keyOf(b);
        if (x === null && y === null) return a.tid - b.tid;
        if (x === null) return 1; // boş değerler daima sonda
        if (y === null) return -1;
        const c = x < y ? -1 : x > y ? 1 : 0;
        return c !== 0 ? c * dir : a.tid - b.tid;
    });

    const page = filtered.slice(start, start + limit).map(({ _lastErrMs, ...rest }) => rest);
    return { items: page, nextCursor: start + limit < filtered.length ? encodeCursor(start + limit) : null, scanned: clients.length, scanTruncated, opsDegraded };
}

// ------------------------------------------------------------------------------------------------------------ BE-02
export async function getHealthSummary(d: TenantOpsDeps, tidInput: number): Promise<any> {
    if (!Number.isInteger(tidInput) || tidInput <= 0) throw new ApplicationError('tid: pozitif tam sayı olmalı', 400, 'VALIDATION');
    const nowMs = (d.now ?? Date.now)();
    const ms = d.sectionTimeoutMs ?? SECTION_TIMEOUT_MS;
    const client: any = (await d.clientModel.findOne({ clientId: tidInput }).select({ clientId: 1, order: 1, lastSuccessfulOrderSync: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean())
        ?? (await d.clientModel.findOne({ order: tidInput }).select({ clientId: 1, order: 1, lastSuccessfulOrderSync: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean());
    if (!client) throw new ApplicationError('Mağaza bulunamadı.', 404, 'NOT_FOUND');
    const tid = tidOfClient(client) ?? tidInput;

    const [issues, failed, sync, alerts] = await Promise.all([
        guard(ms, async () => {
            const r: any[] = await d.errorEventModel.find({ status: 'open', tenantBuckets: tenantBucketOf(tid) })
                .select({ fp: 1, module: 1, code: 1, integrationCode: 1, lastSeen: 1, count: 1, status: 1 }).sort({ lastSeen: -1 }).limit(20).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            return r.map((g) => ({ fp: String(g.fp), module: g.module ?? null, code: g.code ?? null, integrationCode: g.integrationCode ?? null, lastSeen: iso(g.lastSeen), count: g.count ?? 0, status: g.status }));
        }),
        guard(ms, async () => {
            const dlq: number = await d.dlqModel.countDocuments({ clientId: tid, status: 'PENDING_MANUAL_REVIEW' }).maxTimeMS(QUERY_MAX_TIME_MS);
            const jobs = await d.failedBullJobs();
            return { bullmq: jobs === null ? null : jobs.filter((j) => j.tid === tid).length, dlq, bullmqAvailable: jobs !== null };
        }),
        guard(ms, async () => {
            const r: any[] = await d.callMetricModel.aggregate([
                { $match: { clientId: String(tid) } },
                { $group: { _id: '$integrationCode', lastOk: { $max: { $cond: [{ $eq: ['$status', 'ok'] }, '$at', null] } } } },
                { $limit: 50 },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            return Object.fromEntries(r.map((x) => [String(x._id), iso(x.lastOk)]));
        }),
        guard(ms, async () => {
            const r: any[] = await d.alertModel.find({ status: 'firing', 'detail.tid': tid }).sort({ lastSeenAt: -1 }).limit(20).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            return r.map((a) => ({ ruleId: a.ruleId, scopeKey: a.scopeKey, level: a.level, status: a.status, firstFiredAt: iso(a.firstFiredAt), lastSeenAt: iso(a.lastSeenAt), mutedUntil: iso(a.mutedUntil) }));
        }),
    ]);
    const degradedSections: Array<{ section: string; error: SectionError }> = [];
    const mark = (section: string, g: { ok: boolean; error?: SectionError }) => { if (!g.ok) degradedSections.push({ section, error: (g as any).error }); };
    mark('openIssues', issues); mark('failedJobs', failed); mark('lastSyncAt', sync); mark('alerts', alerts);
    return {
        tid, generatedAt: new Date(nowMs).toISOString(),
        openIssues: { approx: true, items: issues.ok ? issues.value : [] },
        failedJobs: failed.ok ? failed.value : { bullmq: null, dlq: null, bullmqAvailable: false },
        lastSyncAt: sync.ok ? sync.value : {},
        lastOrderSyncAt: iso(client.lastSuccessfulOrderSync),
        alerts: alerts.ok ? alerts.value : [],
        degradedSections,
    };
}

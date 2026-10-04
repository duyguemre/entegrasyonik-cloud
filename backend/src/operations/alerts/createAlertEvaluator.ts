// ADR-0017 Asama C / NB8: uretim baglantisi. Modeller/Redis tembel cozulur; `ALERT_EVALUATOR_ENABLED=false` iken (runOnce erken doner) hicbir DB/Redis cagrisi yok.
import { Queue } from 'bullmq';
import { LEGACY_ORDER_QUEUE, ORDER_QUEUE_NAMES } from '@integration/contracts/orderQueues';
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { RedisService } from '@services/redis/RedisService';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { allowNewWork } from '@integration/config/intakeGate';
import { EntitlementService } from '@services/billing/EntitlementService';
import { deriveJobHealth, listStartedJobDefs } from '@platform/runtime/scheduler';
import { getPublishLagSummary } from '../stock/publishLag';
import { AlertEvaluator, type AlertEvaluatorDeps } from './AlertEvaluator';
import type { OrderSyncRow, RuleSources } from './alertRules';
import { readAlertThresholds } from './alertThresholds';
import { readResilienceState } from '../backoffice/resilienceState';
import { tidOfClient } from '../backoffice/tenantOps';
import { createNotifier } from '../notifications/createNotifier';
import { createPlatformNotifier } from '../notifications/createPlatformNotifier';

const QUERY_MAX_TIME_MS = 5000;
const DATA_ERROR_CODES = ['VALIDATION', 'NOT_SUPPORTED'];
/** R8 tenant DB taramasi pahali (tenant basina bir sorgu): sonuc bu sure onbellekte tutulur; degerlendirici her dakika calisir. */
export const OVERSOLD_SCAN_TTL_MS = 10 * 60_000;
const MAX_TENANTS_SCANNED = 500;
const ORDER_INTEGRATION_TYPES = new Set(['marketplace', 'ecommerce']); // OrderQueueProducer ile ayni kume
const app = () => DatabaseManagerInstance.getApplicationDB();

export function parseShadowUntil(raw: string | undefined): Date | undefined {
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

let queues: Queue[] | undefined;
/** R9: bu surecte hazirlik hatasinin ilk gorulme ani (iyilesince sifirlanir). */
let notReadySince: number | null = null;
const HOUR_MS = 3_600_000;

export function createRuleSources(): RuleSources {
    return {
        async integrationCalls(sinceMs) {
            const rows: any[] = await (await app()).getIntegrationCallMetricModel().aggregate([
                { $match: { at: { $gte: new Date(sinceMs) } } },
                { $group: {
                    _id: { clientId: '$clientId', integrationCode: '$integrationCode' }, total: { $sum: 1 },
                    errors: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                    authErrors: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'error'] }, { $eq: ['$code', 'AUTH'] }] }, 1, 0] } },
                    dataErrors: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'error'] }, { $in: ['$code', DATA_ERROR_CODES] }] }, 1, 0] } },
                } },
                { $limit: 5000 },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            return rows.map((r) => ({ clientId: String(r._id.clientId), integrationCode: String(r._id.integrationCode), total: r.total, errors: r.errors, authErrors: r.authErrors, dataErrors: r.dataErrors }));
        },
        async openCircuits() {
            if (!RedisService.isReady()) return [];
            const state = await readResilienceState(RedisService.getInstance() as any);
            return state.items.map((i) => {
                const open = i.pods.filter((p) => p.circuits.open > 0);
                // muhafazakar: tum acik podlar esigi gectiyse (en yeni acilis zamani)
                const opened = open.map((p) => (p.lastOpenedAt ? Date.parse(p.lastOpenedAt) : NaN)).filter((n) => !Number.isNaN(n));
                return { integrationCode: i.integrationCode, open: open.reduce((n, p) => n + p.circuits.open, 0), lastOpenedAt: opened.length === open.length && opened.length ? Math.max(...opened) : null };
            });
        },
        async queueBacklog() {
            if (!RedisService.isReady()) return null;
            // [eslesme-fiyat WP7a] Tüm sipariş kuyrukları: bekleyen toplamı + en eski bekleyen iş.
            queues ??= [LEGACY_ORDER_QUEUE, ...ORDER_QUEUE_NAMES].map((n) => new Queue(n, { connection: RedisService.getConnectionConfig() }));
            let wait = 0;
            let oldestTs: number | undefined;
            for (const q of queues) {
                const counts = await q.getJobCounts('wait');
                wait += counts.wait ?? 0;
                const oldest = (await q.getJobs(['wait'], 0, 0, true))[0];
                if (oldest?.timestamp && (oldestTs === undefined || oldest.timestamp < oldestTs)) oldestTs = oldest.timestamp;
            }
            return { wait, oldestWaitSec: oldestTs ? Math.max(0, Math.floor((Date.now() - oldestTs) / 1000)) : null };
        },
        async deadDeliveries(sinceMs) {
            return (await app()).getNotificationDeliveryModel().countDocuments({ status: 'dead', createdAt: { $gte: new Date(sinceMs) } }).maxTimeMS(QUERY_MAX_TIME_MS);
        },
        async tenantCircuits(sinceMs) {
            const rows: any[] = await (await app()).getIntegrationCallMetricModel().aggregate([
                { $match: { at: { $gte: new Date(sinceMs) } } },
                { $group: {
                    _id: { clientId: '$clientId', integrationCode: '$integrationCode' }, calls: { $sum: 1 },
                    open: { $sum: { $cond: [{ $eq: ['$circuitState', 'open'] }, 1, 0] } },
                    closed: { $sum: { $cond: [{ $eq: ['$circuitState', 'closed'] }, 1, 0] } },
                } },
                { $match: { open: { $gt: 0 }, closed: 0 } },
                { $limit: 5000 },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            return rows.map((r) => ({ clientId: String(r._id.clientId), integrationCode: String(r._id.integrationCode), calls: r.calls, open: r.open, closed: r.closed }));
        },
        async orderSyncLagging(staleBeforeMs) {
            const clients: any[] = await (await app()).getClientModel()
                .find({ status: 'ACTIVE' }, { clientId: 1, order: 1, integrations: 1, _id: 0 }).limit(MAX_TENANTS_SCANNED).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            return lagging(clients, staleBeforeMs, async (tid) => !config.flags.entitlementGuardEnabled || (await EntitlementService.checkAccess(tid, 'engine')).allowed);
        },
        oversoldUnresolved: memoize(OVERSOLD_SCAN_TTL_MS, async (escalatedBeforeMs: number) => {
            const clients: any[] = await (await app()).getClientModel()
                .find({ status: 'ACTIVE' }, { clientId: 1, order: 1, _id: 0 }).limit(MAX_TENANTS_SCANNED).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            const out: Array<{ tid: number; count: number }> = [];
            for (const c of clients) {
                const tid = tidOfClient(c);
                if (tid === null) continue;
                try {
                    const db = await DatabaseManagerInstance.getClientDB(tid);
                    if (!db) continue;
                    const count = await db.getOrderModel().countDocuments({
                        items: { $elemMatch: { allocationState: 'OVERSOLD', oversoldEscalatedAt: { $lte: new Date(escalatedBeforeMs) } } },
                    }).maxTimeMS(QUERY_MAX_TIME_MS);
                    if (count > 0) out.push({ tid, count });
                } catch { /* tek tenant hatasi turu bozmaz; sonraki taramada yeniden denenir */ }
            }
            return out;
        }),
        async catalogBacklog() {
            const filter = { status: 'PENDING', nextRunAt: { $lte: new Date() } }; // ertelenmis (nextRunAt ileride) sinyaller haric
            const model = (await app()).getExportSignalModel();
            const oldest: any = await model.findOne(filter).select({ createdAt: 1 }).sort({ createdAt: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            if (!oldest?.createdAt) return null;
            const count = await model.countDocuments(filter).maxTimeMS(QUERY_MAX_TIME_MS);
            return { oldestAt: new Date(oldest.createdAt).getTime(), count };
        },
        async jobHealth() {
            // JobState kritiklik/sure saklamaz: tanimi bu surecte bilinen isler (worker rolundeki degerlendirici worker islerini gorur).
            const defs = listStartedJobDefs();
            if (defs.length === 0) return [];
            const docs: any[] = await (await app()).getJobStateModel().find({ name: { $in: defs.map((d) => d.name) } }).limit(500).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            const byName = new Map((docs ?? []).map((d) => [d.name, d]));
            const now = new Date();
            const processUptimeMs = Math.floor(process.uptime() * 1000);
            return defs.map((d) => {
                const st = byName.get(d.name) ?? null;
                return {
                    name: d.name, critical: d.critical, consecutiveFailures: Number(st?.consecutiveFailures ?? 0),
                    health: deriveJobHealth(st, { now, expectedIntervalMs: d.everyMs, maxDurationMs: d.maxDurationMs, isDaily: d.everyMs >= 24 * HOUR_MS, processUptimeMs }),
                };
            });
        },
        async processHealth() {
            const docs: any[] = await (await app()).getMetricRollupModel()
                .find({ metric: 'unhandled_rejections', resolution: '5m', bucketStart: { $gte: new Date(Date.now() - HOUR_MS) } }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            let unhandled = 0;
            for (const d of docs ?? []) for (const sr of Object.values(d?.series ?? {}) as any[]) unhandled += Number(sr?.c ?? 0);
            // Mongo: bu sorgu calistiysa hazir. Redis: worker rolunde zorunlu (siparis kuyrugu).
            const failing = RedisService.isReady() ? [] : ['redis'];
            notReadySince = failing.length === 0 ? null : (notReadySince ?? Date.now());
            return { unhandledLastHour: unhandled, notReadySince, failing };
        },
        async publishLag() {
            const s = await getPublishLagSummary((await app()).getMetricRollupModel(), '1h');
            if (!s.total.count) return null;
            return { p95Ms: s.total.p95Overflow ? Number.POSITIVE_INFINITY : s.total.p95Ms, count: s.total.count };
        },
        async newErrors(sinceMs, minCount) {
            const rows: any[] = await (await app()).getErrorEventModel().find({ status: 'open', firstSeen: { $gte: new Date(sinceMs) }, count: { $gte: minCount } })
                .select({ _id: 1, source: 1, code: 1, count: 1 }).sort({ count: -1 }).limit(20).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            return (rows ?? []).map((r) => ({ id: String(r._id), source: String(r.source ?? ''), code: typeof r.code === 'string' ? r.code : null, count: Number(r.count ?? 0) }));
        },
    };
}

/** R3 saf secim: etkin (status true) siparis entegrasyonu, senkron kesici (ADR-0030 X6) acik, imleci `staleBeforeMs`'den eski. Imleci olmayan atlanir. */
export async function lagging(clients: any[], staleBeforeMs: number, entitled: (tid: number) => Promise<boolean>): Promise<OrderSyncRow[]> {
    const out: OrderSyncRow[] = [];
    for (const c of clients) {
        const tid = tidOfClient(c);
        if (tid === null) continue;
        const rows: OrderSyncRow[] = [];
        for (const i of Array.isArray(c.integrations) ? c.integrations : []) {
            if (!i || i.status !== true || !ORDER_INTEGRATION_TYPES.has(i.type) || typeof i.integrationCode !== 'string') continue;
            const at = i.lastSuccessfulOrderSync ? new Date(i.lastSuccessfulOrderSync).getTime() : NaN;
            if (!Number.isFinite(at) || at >= staleBeforeMs || !allowNewWork(i.integrationCode)) continue;
            rows.push({ tid, integrationCode: i.integrationCode, lastSuccessAt: at });
        }
        if (rows.length && await entitled(tid).catch(() => true)) out.push(...rows);
    }
    return out;
}

/** Tek argumanli kaynak icin TTL onbellegi (argumandan bagimsiz: esik degisirse en gec TTL sonunda yansir). */
function memoize<A, R>(ttlMs: number, fn: (a: A) => Promise<R>): (a: A) => Promise<R> {
    let cached: { at: number; value: R } | undefined;
    return async (a: A) => {
        const now = Date.now();
        if (cached && now - cached.at < ttlMs) return cached.value;
        const value = await fn(a);
        cached = { at: now, value };
        return value;
    };
}

export function createAlertEvaluatorDeps(): AlertEvaluatorDeps {
    const tenantNotifier = createNotifier();
    const platformNotifier = createPlatformNotifier();
    return {
        model: lazyAlertModel(),
        sources: createRuleSources(),
        platformNotify: (code, params, opts) => platformNotifier.notify(code, params, opts),
        tenantNotify: (code, tid, params, opts) => tenantNotifier.notify(code, tid, params, opts),
        flags: () => ({ enabled: config.notify.alertEvaluatorEnabled, shadowUntil: parseShadowUntil(config.notify.alertShadowUntil) }),
        isMaintenance: () => getPlatformSetting<boolean>('maintenance.enabled') === true,
        thresholds: () => readAlertThresholds((k) => getPlatformSetting(k)),
    };
}

export function createAlertEvaluator(): AlertEvaluator { return new AlertEvaluator(createAlertEvaluatorDeps()); }

/** Model tembel cozulur; find/findOne zincirleri (sort/limit/maxTimeMS/lean) cagri aninda cozulur. */
function lazyAlertModel() {
    const chain = (method: 'find' | 'findOne', filter: any) => {
        const st: { ops: Array<[string, any[]]> } = { ops: [] };
        const c: any = new Proxy({}, { get: (_t, p: string) => (p === 'lean'
            ? async () => { let q = (await app()).getAlertModel()[method](filter); for (const [n, a] of st.ops) q = q[n](...a); return q.lean(); }
            : (...a: any[]) => { st.ops.push([p, a]); return c; }) });
        return c;
    };
    return {
        find: (f: any) => chain('find', f), findOne: (f: any) => chain('findOne', f),
        create: async (d: any) => (await app()).getAlertModel().create(d),
        updateOne: async (f: any, u: any) => (await app()).getAlertModel().updateOne(f, u),
    };
}

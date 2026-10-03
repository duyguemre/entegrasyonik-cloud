// ADR-0017 Asama C / NB8: uretim baglantisi. Modeller/Redis tembel cozulur; `ALERT_EVALUATOR_ENABLED=false` iken (runOnce erken doner) hicbir DB/Redis cagrisi yok.
import { Queue } from 'bullmq';
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { RedisService } from '@services/redis/RedisService';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { AlertEvaluator, type AlertEvaluatorDeps } from './AlertEvaluator';
import type { RuleSources } from './alertRules';
import { readResilienceState } from '../backoffice/resilienceState';
import { createNotifier } from '../notifications/createNotifier';
import { createPlatformNotifier } from '../notifications/createPlatformNotifier';

const QUERY_MAX_TIME_MS = 5000;
const DATA_ERROR_CODES = ['VALIDATION', 'NOT_SUPPORTED'];
const app = () => DatabaseManagerInstance.getApplicationDB();

export function parseShadowUntil(raw: string | undefined): Date | undefined {
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

let queue: Queue | undefined;

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
            queue ??= new Queue('order-sync-queue', { connection: RedisService.getConnectionConfig() });
            const counts = await queue.getJobCounts('wait');
            const oldest = (await queue.getJobs(['wait'], 0, 0, true))[0];
            return { wait: counts.wait ?? 0, oldestWaitSec: oldest?.timestamp ? Math.max(0, Math.floor((Date.now() - oldest.timestamp) / 1000)) : null };
        },
        async deadDeliveries(sinceMs) {
            return (await app()).getNotificationDeliveryModel().countDocuments({ status: 'dead', createdAt: { $gte: new Date(sinceMs) } }).maxTimeMS(QUERY_MAX_TIME_MS);
        },
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

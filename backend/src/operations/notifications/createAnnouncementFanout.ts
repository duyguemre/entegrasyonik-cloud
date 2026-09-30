// ADR-0029 NB7: duyuru fan-out isi uretim baglantisi. Hedef cozumu ApplicationDB `Clients` (ACTIVE) ve `Subscriptions` (ADR-0008 planCode) uzerinden.
// `NOTIFY_V2_ENABLED=false` iken is DB'ye DOKUNMADAN doner (bant gorunurlugu zaman penceresinden hesaplanir; durum gecisleri ve fan-out yalniz bayrak aciksa).
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import type { FanoutDeps, TargetPorts } from './announcements';
import { createNotifier } from './createNotifier';

const app = () => DatabaseManagerInstance.getApplicationDB();
const MAX_TIME_MS = 5000;
const LIVE_SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due'];

export function createTargetPorts(): TargetPorts {
    return {
        async listActiveTenantIds(afterTid, limit) {
            const rows: any[] = await (await app()).getClientModel().find({ status: 'ACTIVE', clientId: { $gt: afterTid } }, { clientId: 1 }).sort({ clientId: 1 }).limit(limit).maxTimeMS(MAX_TIME_MS).lean();
            return rows.map((r) => r.clientId).filter((n) => Number.isInteger(n));
        },
        async listTenantIdsByPlans(planCodes, afterTid, limit) {
            const rows: any[] = await (await app()).getSubscriptionModel()
                .find({ planCode: { $in: planCodes }, status: { $in: LIVE_SUBSCRIPTION_STATUSES }, clientId: { $gt: afterTid } }, { clientId: 1 }).sort({ clientId: 1 }).limit(limit).maxTimeMS(MAX_TIME_MS).lean();
            return rows.map((r) => r.clientId).filter((n) => Number.isInteger(n));
        },
    };
}

function lazyModel() {
    const call = (m: string) => async (...a: any[]) => ((await app()).getAnnouncementModel() as any)[m](...a);
    const chain = (m: 'find' | 'findOneAndUpdate', args: any[]) => ({ lean: async () => ((await app()).getAnnouncementModel() as any)[m](...args).lean() });
    return {
        find: (f: any) => chain('find', [f]),
        findOneAndUpdate: (f: any, u: any, o?: any) => chain('findOneAndUpdate', [f, u, o]),
        updateMany: call('updateMany'), updateOne: call('updateOne'),
    };
}

export function createAnnouncementFanoutDeps(): FanoutDeps {
    const notifier = createNotifier();
    return {
        model: lazyModel(), ports: createTargetPorts(),
        notify: (code, tid, params, opts) => notifier.notify(code, tid, params, opts),
        flags: () => ({ v2Enabled: config.notify.v2Enabled }),
    };
}

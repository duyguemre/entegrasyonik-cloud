// PRC-R1: `BuyboxRefreshJob` üretim bağlantısı (bootstrap/schedules.ts kullanır). Tenant verisi yalnız kendi ClientDB'sinde kalır
// (rakip/buybox verisi tenant'lar arasında birleştirilmez). Pazaryeri çağrısı adaptörün `readBuybox`'ı (ResilientHttpClient,
// `product_read` grubu) üzerinden gider.
import { ObjectId } from 'mongodb';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { allowNewWork } from '@integration/config/intakeGate';
import { isFeatureEnabled } from '@integration/config/featureFlags';
import { createNotifier } from '@operations/notifications/createNotifier';
import { CLIENT_INTEGRATION_HOT_PROJECTION } from '@database/projections';
import { logger } from '@platform/core/logger';
import { BuyboxRefreshJob, BUYBOX_CHANNEL, ELIGIBLE_FILTER, type BuyboxJobDeps, type TenantCandidateRow } from './BuyboxRefreshJob';
import { channelBudgetPerMin, notifyCooldownMs, notifyShadow, settingsFromSubscription, SUBSCRIPTION_COMPETITION_PROJECTION } from './competitionSettings';
import { ownChannelPrice } from './buyboxState';

const log = logger.child({ module: 'pricing.buyboxRefresh' });
/** Tenant başına aday tarama üst sınırı (tavanın en büyüğüyle aynı ölçek). */
const CANDIDATE_SCAN_LIMIT = 50_000;
const QUERY_MAX_TIME_MS = 10_000;

export function createBuyboxRefreshDeps(): BuyboxJobDeps {
    const factories = new Map<number, IntegrationFactory>();
    const factory = (tid: number) => { let f = factories.get(tid); if (!f) { f = new IntegrationFactory(tid); factories.set(tid, f); } return f; };
    const notifier = createNotifier();
    const clientDB = async (tid: number) => {
        const db = await DatabaseManagerInstance.getClientDB(tid);
        if (!db) throw new Error('tenant_db_unavailable');
        return db as any;
    };
    return {
        now: () => new Date(),
        enabled: (tid) => isFeatureEnabled('competition', tid === undefined ? {} : { tenantId: tid }),
        intakeOpen: (channel) => allowNewWork(channel),
        budgetPerMin: (channel) => channelBudgetPerMin(channel),
        shadow: () => notifyShadow(),
        cooldownMs: () => notifyCooldownMs(),
        async listTenants() {
            const app = await DatabaseManagerInstance.getApplicationDB();
            const clients: any[] = await app.getClientModel().find({ status: 'ACTIVE' }, { order: 1 }).lean();
            const tids = clients.map((c) => Number(c.order)).filter((n) => Number.isInteger(n) && n > 0);
            const subs: any[] = tids.length ? await app.getSubscriptionModel().find({ clientId: { $in: tids } }, SUBSCRIPTION_COMPETITION_PROJECTION).lean() : [];
            const byTid = new Map(subs.map((s) => [Number(s.clientId), s]));
            const out: Array<{ tid: number; settings: any }> = [];
            for (const tid of tids) {
                try {
                    const db = await clientDB(tid);
                    const integ: any = await db.getClientIntegrationModel().findOne({}, CLIENT_INTEGRATION_HOT_PROJECTION).lean();
                    const active = (integ?.marketplace || []).some((m: any) => m?.code === BUYBOX_CHANNEL && m.status !== false);
                    if (active) out.push({ tid, settings: settingsFromSubscription(byTid.get(tid)) });
                } catch (err) {
                    log.warn({ err, tid }, 'tenant buybox uygunluğu okunamadı; bu tur atlandı');
                }
            }
            return out;
        },
        async loadCandidates(tid) {
            const db = await clientDB(tid);
            const rows: any[] = await db.getVariantModel()
                .find(ELIGIBLE_FILTER, { barcode: 1, stock: 1, prices: 1, [`platforms.${BUYBOX_CHANNEL}.prices`]: 1, [`competition.${BUYBOX_CHANNEL}`]: 1 })
                .limit(CANDIDATE_SCAN_LIMIT).maxTimeMS(QUERY_MAX_TIME_MS).lean();
            return rows.map((v): TenantCandidateRow => {
                const prev = v.competition?.[BUYBOX_CHANNEL] ?? null;
                return {
                    variantId: String(v._id), barcode: String(v.barcode), stock: Number(v.stock) || 0,
                    checkedAt: prev?.checkedAt ? new Date(prev.checkedAt) : null,
                    changedAt: prev?.changedAt ? new Date(prev.changedAt) : null,
                    ownPrice: ownChannelPrice(v, BUYBOX_CHANNEL), prev,
                };
            });
        },
        async read(tid, barcodes) {
            const instance: any = await factory(tid).getInstance(BUYBOX_CHANNEL);
            if (typeof instance.readBuybox !== 'function') throw new Error('buybox_not_supported');
            return instance.readBuybox(barcodes);
        },
        async apply(tid, items) {
            if (!items.length) return;
            const db = await clientDB(tid);
            await db.getVariantModel().bulkWrite(items.map((i) => ({
                updateOne: { filter: { _id: new ObjectId(i.variantId) }, update: { $set: { [`competition.${BUYBOX_CHANNEL}`]: i.state } } },
            })), { ordered: false });
            const snaps = items.filter((i) => i.snapshot).map((i) => ({
                integrationCode: BUYBOX_CHANNEL, barcode: i.barcode, variantId: new ObjectId(i.variantId), observedAt: i.state.checkedAt,
                status: i.state.status, buyboxOrder: i.state.buyboxOrder ?? undefined, buyboxPrice: i.state.buyboxPrice ?? undefined,
                hasMultipleSeller: i.state.hasMultipleSeller ?? undefined, ownPrice: i.state.ownPrice ?? undefined, schemaVersion: 1,
            }));
            if (snaps.length) await db.getBuyboxSnapshotModel().insertMany(snaps, { ordered: false });
        },
        async notifyLost(tid, params, opts) {
            await notifier.notify('BUYBOX_LOST', tid, params, { shadow: opts.shadow, idempotencyKey: opts.idempotencyKey, module: 'pricing.buyboxRefresh' });
        },
        async markNotified(tid, variantIds, at) {
            const db = await clientDB(tid);
            await db.getVariantModel().updateMany({ _id: { $in: variantIds.map((id) => new ObjectId(id)) } }, { $set: { [`competition.${BUYBOX_CHANNEL}.lostNotifiedAt`]: at } });
        },
    };
}

export function createBuyboxRefreshJob(): BuyboxRefreshJob {
    return new BuyboxRefreshJob(createBuyboxRefreshDeps());
}

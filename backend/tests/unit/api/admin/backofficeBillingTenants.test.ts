// Backoffice B2/B4: abonelik yonetimi, gelir metrikleri, tenant yasam dongusu. DB/ag YOK (sahte modeller + MockPaymentProvider).
import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import { BACKOFFICE_BILLING_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice-billing';
import { getRequiredTier } from '../../../../src/api/rpc/operationPolicy';
import { requiresStepUp } from '../../../../src/api/admin/stepUp';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { extendTrial, cancelSubscription, changePlan } from '../../../../src/operations/backoffice/subscriptionAdmin';
import { computeRevenueMetrics } from '../../../../src/operations/backoffice/revenueMetrics';
import { getTenantLifecycle, provisioningSteps } from '../../../../src/operations/backoffice/tenantLifecycle';
import { MockPaymentProvider } from '../../../../src/services/billing/MockPaymentProvider';

const DAY = 86400000;
const NOW = new Date('2026-09-30T12:00:00Z');
const lean = (v: any) => ({ lean: async () => v, maxTimeMS() { return this; } });

const RPCS = [
    'BackofficeBillingService/listSubscriptions', 'BackofficeBillingService/getSubscription', 'BackofficeBillingService/extendTrial',
    'BackofficeBillingService/cancelSubscription', 'BackofficeBillingService/changePlan', 'BackofficeBillingService/getRevenueMetrics',
    'BackofficeTenantService/getLifecycle', 'BackofficeTenantService/cancelDeletion',
];

describe('yetenek kaydi + sema + step-up', () => {
    it('hepsi platformAdmin kademeli ve semali; yazmalar step-up ister, okumalar istemez', () => {
        for (const rpc of RPCS) {
            const [s, o] = rpc.split('/');
            expect(getRequiredTier(s, o)).toBe('platformAdmin');
            expect(BACKOFFICE_BILLING_RPC_INPUT[rpc as any]).toBeDefined();
        }
        for (const w of ['extendTrial', 'cancelSubscription', 'changePlan']) expect(requiresStepUp('BackofficeBillingService/' + w)).toBe(true);
        expect(requiresStepUp('BackofficeTenantService/cancelDeletion')).toBe(true);
        expect(requiresStepUp('TenantDataService/cancelDeletion')).toBe(true);
        for (const r of ['listSubscriptions', 'getSubscription', 'getRevenueMetrics']) expect(requiresStepUp('BackofficeBillingService/' + r)).toBe(false);
    });
    it('saglayiciya giden uclar external:true (LIVE_READONLY reddeder), deneme uzatma degil', () => {
        expect(CAPABILITY_BY_RPC.get('BackofficeBillingService/cancelSubscription')!.external).toBe(true);
        expect(CAPABILITY_BY_RPC.get('BackofficeBillingService/changePlan')!.external).toBe(true);
        expect(CAPABILITY_BY_RPC.get('BackofficeBillingService/extendTrial')!.external).toBe(false);
    });
    it('girdi sinirlari: days<=30, limit<=200, bilinmeyen alan/operator reddedilir', () => {
        const S = BACKOFFICE_BILLING_RPC_INPUT;
        expect(S['BackofficeBillingService/extendTrial']!.safeParse({ tid: 5, days: 30, reason: 'musteri talebi uzatma' }).success).toBe(true);
        expect(S['BackofficeBillingService/extendTrial']!.safeParse({ tid: 5, days: 31, reason: 'x' }).success).toBe(false);
        expect(S['BackofficeBillingService/extendTrial']!.safeParse({ tid: 5, days: 0, reason: 'x' }).success).toBe(false);
        expect(S['BackofficeBillingService/listSubscriptions']!.safeParse({ limit: 201 }).success).toBe(false);
        expect(S['BackofficeBillingService/listSubscriptions']!.safeParse({ status: 'nope' }).success).toBe(false);
        expect(S['BackofficeBillingService/listSubscriptions']!.safeParse({ planCode: { $ne: 1 } }).success).toBe(false);
        expect(S['BackofficeBillingService/listSubscriptions']!.safeParse({ status: 'active', evil: 1 }).success).toBe(false);
        expect(S['BackofficeBillingService/cancelSubscription']!.safeParse({ tid: 5, atPeriodEnd: 'yes', reason: 'x' }).success).toBe(false);
        expect(S['BackofficeBillingService/getRevenueMetrics']!.safeParse({ range: '1y' }).success).toBe(false);
        expect(S['BackofficeTenantService/getLifecycle']!.safeParse({ tid: -1 }).success).toBe(false);
    });
});

function mkDeps(sub: any, extra: Partial<any> = {}) {
    const events: any[] = [];
    const updates: any[] = [];
    const invalidated: number[] = [];
    const provider = extra.provider ?? new MockPaymentProvider();
    return {
        events, updates, invalidated, provider,
        deps: {
            subscriptionModel: { findOne: () => lean(sub), updateOne: jest.fn(async (f: any, u: any) => { updates.push({ f, u }); return { matchedCount: extra.matched ?? 1, modifiedCount: extra.matched ?? 1 }; }) },
            planModel: { findOne: jest.fn((q: any) => lean(extra.plans?.[q.code] ?? null)) },
            billingEventModel: { create: jest.fn(async (e: any) => { events.push(e); }) },
            provider: () => provider, invalidateEntitlement: (id: number) => { invalidated.push(id); }, now: () => NOW,
        } as any,
    };
}
const ctx = { sub: 'adm', reason: 'destek talebi #42 uzatma', reqId: 'r1' };

describe('extendTrial', () => {
    const sub = (o: any = {}) => ({ clientId: 7, status: 'trialing', trialEndsAt: new Date(NOW.getTime() + 2 * DAY), billingExempt: false, ...o });
    it('bitis gelecekteyse bitise ekler; iyimser kilitli yazim + audit + onbellek temizligi', async () => {
        const m = mkDeps(sub());
        const out = await extendTrial(m.deps, { tid: 7, days: 10 }, ctx);
        expect(out.trialEndsAt.getTime()).toBe(NOW.getTime() + 12 * DAY);
        expect(m.updates[0].f).toMatchObject({ clientId: 7, status: 'trialing', trialEndsAt: sub().trialEndsAt });
        expect(m.invalidated).toEqual([7]);
        expect(m.events[0]).toMatchObject({ provider: 'system', type: 'subscription.trial_extended', clientId: 7, payloadRedacted: { days: 10, actor: 'adm' } });
    });
    it('bitis gecmisteyse (hala trialing) simdiden sayar', async () => {
        const m = mkDeps(sub({ trialEndsAt: new Date(NOW.getTime() - DAY) }));
        const out = await extendTrial(m.deps, { tid: 7, days: 5 }, ctx);
        expect(out.trialEndsAt.getTime()).toBe(NOW.getTime() + 5 * DAY);
    });
    it('trialing disi / muaf / yok / yaris -> 409/404, yazim yok', async () => {
        await expect(extendTrial(mkDeps(sub({ status: 'suspended', providerSubscriptionRef: 'sub_x' })).deps, { tid: 7, days: 5 }, ctx)).rejects.toMatchObject({ statusCode: 409, code: 'TRIAL_NOT_ACTIVE' });
        await expect(extendTrial(mkDeps(sub({ status: 'active' })).deps, { tid: 7, days: 5 }, ctx)).rejects.toMatchObject({ code: 'TRIAL_NOT_ACTIVE' });
        await expect(extendTrial(mkDeps(sub({ billingExempt: true })).deps, { tid: 7, days: 5 }, ctx)).rejects.toMatchObject({ code: 'SUBSCRIPTION_EXEMPT' });
        await expect(extendTrial(mkDeps(null).deps, { tid: 7, days: 5 }, ctx)).rejects.toMatchObject({ statusCode: 404, code: 'SUBSCRIPTION_NOT_FOUND' });
        await expect(extendTrial(mkDeps(sub(), { matched: 0 }).deps, { tid: 7, days: 5 }, ctx)).rejects.toMatchObject({ code: 'SUBSCRIPTION_CHANGED' });
        await expect(extendTrial(mkDeps(sub()).deps, { tid: 7, days: 31 }, ctx)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });
});

describe('K40 extendTrial: askidan donus + toplam 60 gun', () => {
    const susp = (o: any = {}) => ({ clientId: 7, status: 'suspended', trialEndsAt: new Date(NOW.getTime() - 3 * DAY), billingExempt: false, ...o });
    it('denemesi bitip askiya alinmis kartsiz abonelik uzatmayla trialing olur (simdiden sayar), sayac artar, onbellek temizlenir', async () => {
        const m = mkDeps(susp());
        const out = await extendTrial(m.deps, { tid: 7, days: 7 }, ctx);
        expect(out).toMatchObject({ status: 'trialing', reopened: true, totalExtensionDays: 7, remainingExtensionDays: 53 });
        expect(out.trialEndsAt.getTime()).toBe(NOW.getTime() + 7 * DAY);
        expect(m.updates[0].f).toMatchObject({ clientId: 7, status: 'suspended' });
        expect(m.updates[0].u).toMatchObject({ $set: { status: 'trialing' }, $inc: { trialExtensionDays: 7 } });
        expect(m.invalidated).toEqual([7]);
        expect(m.events[0].payloadRedacted).toMatchObject({ reopened: true, fromStatus: 'suspended', totalExtensionDays: 7 });
    });
    it('toplam 60 gunu asan uzatma 409 TRIAL_EXTENSION_LIMIT + kalan gun; yazim yok', async () => {
        const m = mkDeps(susp({ trialExtensionDays: 45 }));
        await expect(extendTrial(m.deps, { tid: 7, days: 16 }, ctx)).rejects.toMatchObject({ statusCode: 409, code: 'TRIAL_EXTENSION_LIMIT', details: { remainingDays: 15, usedDays: 45, maxTotalDays: 60 } });
        expect(m.updates).toHaveLength(0);
        const ok = await extendTrial(mkDeps(susp({ trialExtensionDays: 45 })).deps, { tid: 7, days: 15 }, ctx);
        expect(ok).toMatchObject({ totalExtensionDays: 60, remainingExtensionDays: 0 });
    });
    it('trialing aboneligin de sayaci islenir; atomik filtre toplam sinirini korur', async () => {
        const m = mkDeps({ clientId: 7, status: 'trialing', trialEndsAt: new Date(NOW.getTime() + DAY), billingExempt: false, trialExtensionDays: 20 });
        await extendTrial(m.deps, { tid: 7, days: 10 }, ctx);
        expect(m.updates[0].f.trialExtensionDays).toEqual({ $not: { $gt: 50 } });
    });
});

describe('K40 cancelSubscription: kartsiz abonelikte yerel iptal', () => {
    const base = { clientId: 9, status: 'trialing', planCode: 'starter', provider: 'mock', billingExempt: false };
    it('saglayici kaydi yok -> dogrudan yerel canceled, saglayici cagrisi yok, external=false, LIVE_READONLY 423 vermez', async () => {
        const provider = { name: 'mock', cancel: jest.fn() };
        for (const st of ['trialing', 'suspended']) {
            const m = mkDeps({ ...base, status: st }, { provider });
            m.deps.liveReadonly = () => true;
            const out = await cancelSubscription(m.deps, { tid: 9, atPeriodEnd: true }, ctx);
            expect(out).toMatchObject({ status: 'canceled', cancelAtPeriodEnd: false, external: false });
            expect(m.updates[0].u.$set).toMatchObject({ status: 'canceled' });
            expect(m.invalidated).toEqual([9]);
            expect(m.events[0].payloadRedacted).toMatchObject({ local: true, from: st });
        }
        expect(provider.cancel).not.toHaveBeenCalled();
    });
    it('saglayici cagrisi olan yolda canli salt-okuma kipi 423 LIVE_READONLY (yazim/saglayici cagrisi yok)', async () => {
        const provider = { name: 'mock', cancel: jest.fn() };
        const m = mkDeps({ ...base, status: 'active', providerSubscriptionRef: 'sub_1' }, { provider });
        m.deps.liveReadonly = () => true;
        await expect(cancelSubscription(m.deps, { tid: 9, atPeriodEnd: false }, ctx)).rejects.toMatchObject({ statusCode: 423, code: 'LIVE_READONLY' });
        expect(provider.cancel).not.toHaveBeenCalled();
        expect(m.updates).toHaveLength(0);
    });
});

describe('cancelSubscription / changePlan (MockPaymentProvider uzerinden)', () => {
    async function activeWithProvider(planCode = 'starter') {
        const provider = new MockPaymentProvider();
        const co = await provider.createCheckout(9, planCode, 'month');
        const evt = provider.simulateEvent('card_success' as any, co.providerRef); void evt;
        const sub = { clientId: 9, status: 'active', planCode, planVersion: 1, provider: 'mock', providerSubscriptionRef: co.providerRef, billingExempt: false };
        return { provider, sub };
    }
    beforeAll(() => { process.env.BILLING_MOCK_HMAC_SECRET = process.env.BILLING_MOCK_HMAC_SECRET || 'unit-test-secret-unit-test-secret-000'; });

    it('atPeriodEnd: sagliyici cancelAtPeriodEnd isaretler, durum active kalir; kanonik alanlar yazilir', async () => {
        const { provider, sub } = await activeWithProvider();
        const m = mkDeps(sub, { provider });
        const out = await cancelSubscription(m.deps, { tid: 9, atPeriodEnd: true }, ctx);
        expect(out).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
        expect(m.updates[0].u.$set).toMatchObject({ cancelAtPeriodEnd: true, status: 'active' });
        expect(m.updates[0].f).toMatchObject({ clientId: 9, status: 'active' });
        expect(m.events[0]).toMatchObject({ type: 'subscription.admin_canceled', payloadRedacted: { atPeriodEnd: true, reason: ctx.reason } });
        expect(m.invalidated).toEqual([9]);
    });
    it('hemen iptal -> canceled', async () => {
        const { provider, sub } = await activeWithProvider();
        const out = await cancelSubscription(mkDeps(sub, { provider }).deps, { tid: 9, atPeriodEnd: false }, ctx);
        expect(out.status).toBe('canceled');
    });
    it('saglayici kaydi olmayan (kartsiz deneme; yalniz changePlan) / muaf / terminal / saglayici bilinmeyen -> 409, yazim yok', async () => {
        const base = { clientId: 9, status: 'trialing', planCode: 'starter', provider: 'mock', billingExempt: false };
        const m1 = mkDeps(base);
        await expect(changePlan(m1.deps, { tid: 9, planCode: 'growth' }, ctx)).rejects.toMatchObject({ code: expect.stringMatching(/NO_PROVIDER_SUBSCRIPTION|PLAN_NOT_FOUND/) });
        expect(m1.updates).toHaveLength(0);
        await expect(cancelSubscription(mkDeps({ ...base, status: 'canceled' }).deps, { tid: 9, atPeriodEnd: true }, ctx)).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_CANCELABLE' });
        await expect(cancelSubscription(mkDeps({ ...base, billingExempt: true }).deps, { tid: 9, atPeriodEnd: true }, ctx)).rejects.toMatchObject({ code: 'SUBSCRIPTION_EXEMPT' });
        await expect(cancelSubscription(mkDeps({ ...base, providerSubscriptionRef: 'mock_sub_unknown' }).deps, { tid: 9, atPeriodEnd: true }, ctx)).rejects.toMatchObject({ code: 'PROVIDER_SUBSCRIPTION_MISSING' });
        await expect(cancelSubscription(mkDeps({ ...base, provider: 'iyzico', providerSubscriptionRef: 'x' }).deps, { tid: 9, atPeriodEnd: true }, ctx)).rejects.toMatchObject({ code: 'PROVIDER_MISMATCH' });
    });
    it('changePlan: saglayici + planVersion yazilir; ayni plan/yok plan/ozel teklif reddedilir', async () => {
        const { provider, sub } = await activeWithProvider('starter');
        const plans = { growth: { code: 'growth', version: 3, priceMinor: 249000 }, free: { code: 'free', version: 1, priceMinor: 0 }, starter: { code: 'starter', version: 1, priceMinor: 99000 } };
        const m = mkDeps(sub, { provider, plans });
        const out = await changePlan(m.deps, { tid: 9, planCode: 'growth' }, ctx);
        expect(out).toMatchObject({ planCode: 'growth', planVersion: 3 });
        expect(m.updates[0].u.$set).toMatchObject({ planCode: 'growth', planVersion: 3 });
        expect(m.events[0]).toMatchObject({ type: 'subscription.admin_plan_changed', payloadRedacted: { fromPlan: 'starter', toPlan: 'growth' } });
        await expect(changePlan(mkDeps(sub, { provider, plans }).deps, { tid: 9, planCode: 'starter' }, ctx)).rejects.toMatchObject({ code: 'SAME_PLAN' });
        await expect(changePlan(mkDeps(sub, { provider, plans }).deps, { tid: 9, planCode: 'ghost' }, ctx)).rejects.toMatchObject({ statusCode: 404, code: 'PLAN_NOT_FOUND' });
        await expect(changePlan(mkDeps(sub, { provider, plans }).deps, { tid: 9, planCode: 'free' }, ctx)).rejects.toMatchObject({ code: 'PLAN_REQUIRES_QUOTE' });
        await expect(changePlan(mkDeps({ ...sub, status: 'suspended' }, { provider, plans }).deps, { tid: 9, planCode: 'growth' }, ctx)).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_CHANGEABLE' });
    });
});

describe('getRevenueMetrics', () => {
    const agg = (rows: any[]) => ({ option: async () => rows });
    function deps(opts: { dist: any[]; billed: any[]; lost: any[]; cohort: any[]; ev: any[]; plans: any[] }) {
        let call = 0;
        const order = [opts.dist, opts.billed, opts.lost, opts.cohort];
        return {
            subscriptionModel: { aggregate: () => agg(order[call++]) },
            planModel: { find: () => ({ maxTimeMS: () => ({ lean: async () => opts.plans }) }) },
            billingEventModel: { aggregate: () => agg(opts.ev) },
            now: () => NOW,
        } as any;
    }
    it('MRR (yillik /12, ozel teklif ve muaf haric), dagilim, donusum, kayip', async () => {
        const out = await computeRevenueMetrics(deps({
            dist: [{ _id: { s: 'active', e: false }, n: 3 }, { _id: { s: 'trialing', e: false }, n: 4 }, { _id: { s: 'active', e: true }, n: 10 }, { _id: { s: 'canceled', e: false }, n: 1 }],
            billed: [{ _id: 'growth', n: 2 }, { _id: 'yearly', n: 1 }, { _id: 'custom', n: 1 }],
            lost: [{ _id: 'growth', n: 1 }],
            cohort: [{ total: 8, converted: 2 }],
            ev: [{ _id: 'payment.succeeded', n: 5 }, { _id: 'payment.failed', n: 1 }, { _id: 'payment.threeds_failed', n: 1 }],
            plans: [{ code: 'growth', priceMinor: 100000, interval: 'month', currency: 'TRY' }, { code: 'yearly', priceMinor: 1200000, interval: 'year', currency: 'TRY' }, { code: 'custom', priceMinor: 0, interval: 'month', currency: 'TRY' }],
        }), '30d');
        expect(out.mrr.byCurrency).toEqual({ TRY: 2 * 100000 + 100000 });
        expect(out.mrr).toMatchObject({ billedSubscriptions: 4, quoteBasedSubscriptions: 1 });
        expect(out.statusDistribution).toMatchObject({ active: 3, trialing: 4, canceled: 1, past_due: 0 });
        expect(out.exemptSubscriptions).toBe(10);
        expect(out.trialConversion).toEqual({ cohort: 8, converted: 2, rate: 0.25 });
        expect(out.churn).toMatchObject({ count: 1, mrrLostByCurrency: { TRY: 100000 }, rate: 0.2 });
        expect(out.paymentEvents).toEqual({ succeeded: 5, failed: 2 });
        expect(out.to).toEqual(NOW);
        expect(out.from.getTime()).toBe(NOW.getTime() - 30 * DAY);
    });
    it('bos veri: oranlar null, gecersiz aralik 400', async () => {
        const out = await computeRevenueMetrics(deps({ dist: [], billed: [], lost: [], cohort: [], ev: [], plans: [] }), '7d');
        expect(out.mrr.byCurrency).toEqual({});
        expect(out.trialConversion.rate).toBeNull();
        expect(out.churn.rate).toBeNull();
        await expect(computeRevenueMetrics(deps({ dist: [], billed: [], lost: [], cohort: [], ev: [], plans: [] }), '1y' as any)).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('getTenantLifecycle', () => {
    const mk = (client: any, sub: any, events: any[] = []) => ({
        clientModel: { findOne: () => lean(client) },
        subscriptionModel: { findOne: () => lean(sub) },
        auditModel: { find: () => ({ sort: () => ({ limit: () => lean(events) }) }) },
        now: () => NOW,
    } as any);
    it('silme bekleyen tenant: bekleme sonu, kalan gun, geri alinabilir; olaylarda meta yok', async () => {
        const out = await getTenantLifecycle(mk(
            { order: 5, clientId: 5, title: 'Magaza', status: 'DELETION_PENDING', deletionRequestedAt: new Date(NOW.getTime() - 25 * DAY), deletionScheduledAt: new Date(NOW.getTime() + 5 * DAY), deletionRequestedBy: 'u1' },
            { status: 'trialing', planCode: 'starter', trialEndsAt: new Date(NOW.getTime() + 3 * DAY) },
            [{ at: NOW, event: 'tenant.deletion.requested', result: 'ok', meta: { secret: 'x' }, sub: 'u1' }],
        ), 5);
        expect(out.deletion).toMatchObject({ daysUntilPurge: 5, canCancel: true });
        expect(out.trial).toMatchObject({ daysLeft: 3, subscriptionStatus: 'trialing' });
        expect(out.recentEvents[0]).toEqual({ at: NOW, event: 'tenant.deletion.requested', result: 'ok', actorType: null, surface: null, imp: false });
        expect(JSON.stringify(out)).not.toContain('secret');
        expect(out.provisioning.steps.every((s: any) => s.state === 'done')).toBe(true);
    });
    it('PROVISIONING_FAILED: adim durumlari; ACTIVE: silme null; yok -> 404', async () => {
        const steps = provisioningSteps({ status: 'PROVISIONING_FAILED', provisioning: { failedStep: 'tenant-seed' } });
        expect(steps.map(s => s.state)).toEqual(['done', 'done', 'done', 'failed', 'pending', 'pending', 'pending']);
        const out = await getTenantLifecycle(mk({ order: 6, clientId: 6, status: 'ACTIVE' }, null), 6);
        expect(out.deletion).toBeNull();
        expect(out.trial).toBeNull();
        await expect(getTenantLifecycle(mk(null, null), 99)).rejects.toMatchObject({ statusCode: 404 });
        await expect(getTenantLifecycle(mk(null, null), 0)).rejects.toMatchObject({ statusCode: 400 });
    });
});

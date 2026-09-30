// Backoffice B4c (plan §2.3): gelir metrikleri. Mevcut koleksiyonlardan (Subscriptions/Plans/BillingEvents) HESAPLANIR; yeni koleksiyon/indeks YOK.
// SAF: modeller enjekte edilir. Tüm sorgular maxTimeMS<=5000. Para birimi: Plans.priceMinor (kuruş), para birimi bazında ayrı toplanır.
// Sınırlar (sözleşmede belgeli): tutarlar plan LİSTE fiyatıdır (indirim/limitOverrides yok); yıllık plan MRR'a /12 ile girer; `priceMinor===0`
// (özel teklif) ve `billingExempt` (legacy) MRR'a girmez; kayıp = aralıkta `canceled|expired` durumuna en son dokunulan abonelikler (updatedAt).
import { ApplicationError } from '@platform/core/errors';

export const REVENUE_RANGES = ['7d', '30d', '90d'] as const;
export type RevenueRange = typeof REVENUE_RANGES[number];
const DAY_MS = 24 * 60 * 60 * 1000;
export const QUERY_MAX_TIME_MS = 5000;
export const STATUS_KEYS = ['trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired'] as const;
/** MRR'a giren durumlar: ödeme yapan (active) ve grace'teki (past_due). */
const BILLED: ReadonlyArray<string> = ['active', 'past_due'];

export interface RevenueDeps { subscriptionModel: any; planModel: any; billingEventModel: any; now?: () => Date }

type Money = Record<string, number>;

function monthlyMinor(plan: any): number {
    const p = Number(plan?.priceMinor);
    if (!Number.isFinite(p) || p <= 0) return 0;
    return plan.interval === 'year' ? Math.round(p / 12) : p;
}

export async function computeRevenueMetrics(d: RevenueDeps, range: RevenueRange): Promise<any> {
    if (!(REVENUE_RANGES as ReadonlyArray<string>).includes(range)) throw new ApplicationError('range: 7d|30d|90d olmalı', 400, 'VALIDATION');
    const to = (d.now ?? (() => new Date()))();
    const from = new Date(to.getTime() - Number(range.slice(0, -1)) * DAY_MS);
    const sm = d.subscriptionModel;

    // 1) Durum dağılımı (muaf abonelikler ayrı sayılır)
    const dist: any[] = await sm.aggregate([{ $group: { _id: { s: '$status', e: { $eq: ['$billingExempt', true] } }, n: { $sum: 1 } } }]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
    const statusDistribution: Record<string, number> = Object.fromEntries(STATUS_KEYS.map(k => [k, 0]));
    let exempt = 0;
    for (const r of dist) {
        if (r._id?.e) { exempt += r.n; continue; }
        if (r._id?.s in statusDistribution) statusDistribution[r._id.s] += r.n;
    }

    // 2) MRR: ödeme yapan, muaf olmayan abonelikler x plan liste fiyatı
    const byPlan: any[] = await sm.aggregate([
        { $match: { status: { $in: BILLED }, billingExempt: { $ne: true } } },
        { $group: { _id: '$planCode', n: { $sum: 1 } } },
    ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
    const lostByPlan: any[] = await sm.aggregate([
        { $match: { status: { $in: ['canceled', 'expired'] }, billingExempt: { $ne: true }, updatedAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$planCode', n: { $sum: 1 } } },
    ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
    const codes = Array.from(new Set([...byPlan, ...lostByPlan].map(r => r._id).filter((c: any) => typeof c === 'string'))).slice(0, 200);
    const plans: any[] = codes.length ? await d.planModel.find({ code: { $in: codes } }).maxTimeMS(QUERY_MAX_TIME_MS).lean() : [];
    const planByCode = new Map(plans.map(p => [p.code, p]));

    const mrr: Money = {};
    const mrrByPlan: any[] = [];
    let quoteBasedCount = 0;
    let unpricedCount = 0;
    for (const r of byPlan) {
        const plan = planByCode.get(r._id);
        if (!plan) { unpricedCount += r.n; continue; }
        const m = monthlyMinor(plan);
        if (m === 0) { quoteBasedCount += r.n; continue; }
        const cur = plan.currency || 'TRY';
        mrr[cur] = (mrr[cur] ?? 0) + m * r.n;
        mrrByPlan.push({ planCode: r._id, subscriptions: r.n, monthlyMinor: m, currency: cur, mrrMinor: m * r.n });
    }
    const mrrLost: Money = {};
    let lostCount = 0;
    for (const r of lostByPlan) {
        lostCount += r.n;
        const plan = planByCode.get(r._id);
        const m = plan ? monthlyMinor(plan) : 0;
        if (m > 0) { const cur = plan.currency || 'TRY'; mrrLost[cur] = (mrrLost[cur] ?? 0) + m * r.n; }
    }
    const billedCount = byPlan.reduce((a, r) => a + r.n, 0);

    // 3) Deneme -> ücretli dönüşüm: aralıkta açılan (muaf olmayan) abonelik kohortu; sağlayıcı kaydı olup ödeme durumlarında olanlar dönüşmüş sayılır.
    const cohort: any[] = await sm.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to }, billingExempt: { $ne: true } } },
        { $group: { _id: null, total: { $sum: 1 }, converted: { $sum: { $cond: [{ $and: [{ $in: ['$status', ['active', 'past_due', 'canceled']] }, { $ne: [{ $ifNull: ['$providerSubscriptionRef', null] }, null] }] }, 1, 0] } } } },
    ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
    const total = cohort[0]?.total ?? 0;
    const converted = cohort[0]?.converted ?? 0;

    // 4) Ödeme olayları (tutar içermez -> yalnız sayı)
    const ev: any[] = await d.billingEventModel.aggregate([
        { $match: { receivedAt: { $gte: from, $lte: to }, type: { $in: ['payment.succeeded', 'payment.failed', 'payment.threeds_failed'] } } },
        { $group: { _id: '$type', n: { $sum: 1 } } },
    ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
    const evN = (t: string): number => ev.find(r => r._id === t)?.n ?? 0;

    const churnBase = billedCount + lostCount;
    return {
        range, from, to,
        mrr: { byCurrency: mrr, byPlan: mrrByPlan, billedSubscriptions: billedCount, quoteBasedSubscriptions: quoteBasedCount, unpricedSubscriptions: unpricedCount },
        statusDistribution, exemptSubscriptions: exempt,
        trialConversion: { cohort: total, converted, rate: total > 0 ? Math.round((converted / total) * 10000) / 10000 : null },
        churn: { count: lostCount, mrrLostByCurrency: mrrLost, rate: churnBase > 0 ? Math.round((lostCount / churnBase) * 10000) / 10000 : null },
        paymentEvents: { succeeded: evN('payment.succeeded'), failed: evN('payment.failed') + evN('payment.threeds_failed') },
    };
}

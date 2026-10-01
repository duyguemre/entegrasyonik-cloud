// K51 (BO1): büyük resim kullanım özeti ("pulse"). Mevcut metrik/rollup'lardan; veri yoksa uydurma 0 YOK: `computable:false` + `note:'hesaplanamadı'`.
// SAF: modeller enjekte edilir. Her blok 2 sn zaman aşımıyla; okunamayan blok `{ status:'degraded', error }`. Tenant iş verisi dönmez (yalnız sayaç).
import { guard, SECTION_TIMEOUT_MS } from '../../operations/backoffice/guarded';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const QUERY_MAX_TIME_MS = 2500;
export const NOT_COMPUTABLE = 'hesaplanamadı';

export interface PulseDeps {
    clientModel: any; metricRollupModel: any; callMetricModel: any;
    revenue: () => Promise<any>;   // computeRevenueMetrics(..., '30d') sonucu
    now?: () => number; sectionTimeoutMs?: number;
}

type Block<T> = ({ status: 'ok' } & T) | { status: 'degraded'; error: 'timeout' | 'error' };

export class PulseOps {
    private readonly now: () => number;
    private readonly ms: number;
    constructor(private readonly d: PulseDeps) { this.now = d.now ?? Date.now; this.ms = d.sectionTimeoutMs ?? SECTION_TIMEOUT_MS; }

    private async block<T extends object>(fn: () => Promise<T>): Promise<Block<T>> {
        const g = await guard(this.ms, fn);
        return g.ok ? { status: 'ok', ...g.value } : { status: 'degraded', error: g.error };
    }

    async getPulse(): Promise<any> {
        const nowMs = this.now();
        const buckets = this.httpBuckets(nowMs); buckets.catch(() => undefined); // tek okuma; iki blok paylaşır (reddedilirse her blok kendi degraded'ını üretir)
        const [tenants, calls, errorRate, mrr] = await Promise.all([
            this.block(() => this.tenants()), this.block(() => this.calls(nowMs, buckets)), this.block(() => this.errorRate(nowMs, buckets)), this.block(() => this.mrr()),
        ]);
        return { generatedAt: new Date(nowMs).toISOString(), tenants, orders: this.orders(), calls, errorRate, mrr };
    }

    private async tenants() {
        const rows: any[] = await this.d.clientModel.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[String(r._id ?? 'UNKNOWN')] = r.n;
        const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
        return { active: byStatus.ACTIVE ?? 0, total, byStatus };
    }

    /** Platform seviyesinde sipariş sayacı/rollup'ı YOK (siparişler tenant DB'lerinde; kuyruk iş sayısı sipariş sayısı değildir) -> hesaplanamadı (BULGU). */
    private orders() {
        return { status: 'ok' as const, computable: false, last24h: null, last7d: null, previous24h: null, hourly: [] as Array<{ t: string; count: number }>, note: NOT_COMPUTABLE };
    }

    /** `http_requests` 1 sa kovaları (90 gün): son 7 gün; saatlik seri son 24 sa. Kova yoksa hesaplanamadı. */
    private async httpBuckets(nowMs: number): Promise<Array<{ t: number; requests: number; errors5xx: number }>> {
        const since = new Date(Math.floor((nowMs - 7 * DAY_MS) / HOUR_MS) * HOUR_MS);
        const docs: any[] = await this.d.metricRollupModel.find({ metric: 'http_requests', resolution: '1h', bucketStart: { $gte: since } }, { series: 1, bucketStart: 1, _id: 0 })
            .limit(24 * 7 + 5).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        return docs.map((doc) => {
            let requests = 0, errors5xx = 0;
            for (const e of Object.values(doc?.series || {}) as any[]) { const c = Number(e?.c) || 0; requests += c; if (String(e?.labels?.statusClass) === '5xx') errors5xx += c; }
            return { t: new Date(doc.bucketStart).getTime(), requests, errors5xx };
        });
    }

    private async calls(nowMs: number, bucketsP: Promise<Array<{ t: number; requests: number; errors5xx: number }>>) {
        const [buckets, integ] = await Promise.all([
            bucketsP,
            (async () => {
                const since24h = new Date(nowMs - DAY_MS), since7d = new Date(nowMs - 7 * DAY_MS);
                const r: any[] = await this.d.callMetricModel.aggregate([
                    { $match: { at: { $gte: since7d } } },
                    { $group: { _id: null, c7: { $sum: 1 }, c24: { $sum: { $cond: [{ $gte: ['$at', since24h] }, 1, 0] } } } },
                ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
                return r[0] ? { computable: true, last24h: r[0].c24 as number, last7d: r[0].c7 as number } : { computable: false, last24h: null, last7d: null, note: NOT_COMPUTABLE };
            })(),
        ]);
        const cut24 = nowMs - DAY_MS;
        const http = buckets.length === 0
            ? { computable: false, last24h: null, last7d: null, hourly: [] as Array<{ t: string; count: number }>, note: NOT_COMPUTABLE }
            : {
                computable: true, last24h: buckets.filter((b) => b.t >= cut24).reduce((a, b) => a + b.requests, 0), last7d: buckets.reduce((a, b) => a + b.requests, 0),
                hourly: buckets.filter((b) => b.t >= cut24).sort((a, b) => a.t - b.t).map((b) => ({ t: new Date(b.t).toISOString(), count: b.requests })),
            };
        return { http, integration: integ };
    }

    private async errorRate(nowMs: number, bucketsP: Promise<Array<{ t: number; requests: number; errors5xx: number }>>) {
        const [buckets, integ] = await Promise.all([
            bucketsP,
            (async () => {
                const since24h = new Date(nowMs - DAY_MS), since7d = new Date(nowMs - 7 * DAY_MS);
                const r: any[] = await this.d.callMetricModel.aggregate([
                    { $match: { at: { $gte: since7d } } },
                    { $group: { _id: null, c7: { $sum: 1 }, e7: { $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] } },
                        c24: { $sum: { $cond: [{ $gte: ['$at', since24h] }, 1, 0] } }, e24: { $sum: { $cond: [{ $and: [{ $gte: ['$at', since24h] }, { $eq: ['$status', 'error'] }] }, 1, 0] } } } },
                ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
                const x = r[0];
                const rate = (e: number, c: number) => (c > 0 ? Math.round((e / c) * 10000) / 10000 : null);
                return x ? { computable: true, last24h: rate(x.e24, x.c24), last7d: rate(x.e7, x.c7) } : { computable: false, last24h: null, last7d: null, note: NOT_COMPUTABLE };
            })(),
        ]);
        const cut24 = nowMs - DAY_MS;
        const hourly = buckets.filter((b) => b.t >= cut24).sort((a, b) => a.t - b.t)
            .map((b) => ({ t: new Date(b.t).toISOString(), requests: b.requests, errors5xx: b.errors5xx, rate: b.requests > 0 ? Math.round((b.errors5xx / b.requests) * 10000) / 10000 : null }));
        return { http: buckets.length === 0 ? { computable: false, hourly: [] as typeof hourly, note: NOT_COMPUTABLE } : { computable: true, hourly }, integration: integ };
    }

    private async mrr() {
        const r = await this.d.revenue();
        const st = r?.statusDistribution ?? {};
        return {
            computable: true, unit: 'minor' as const, currency: r?.mrr?.byCurrency ?? {}, activeSubscriptions: r?.mrr?.billedSubscriptions ?? 0,
            trialing: st.trialing ?? 0, lostLast30d: r?.churn?.count ?? 0,
        };
    }
}

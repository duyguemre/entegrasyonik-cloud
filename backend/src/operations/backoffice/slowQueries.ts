// [BO B8d] Yavaş sorgu özeti: `MetricRollups` (`db_slow_query_ms{db,collection,op}`, eşik >200 ms; bkz. platform/runtime/metrics/slowQueryPlugin.ts).
// Yalnız sayı + yaklaşık p95 (histogram kova üst sınırı); sorgu değeri/filtre hiçbir yerde yoktur.
import { HISTOGRAM_BUCKETS_MS } from '@platform/runtime/metrics/MetricsRegistry';
import { SLOW_QUERY_METRIC, SLOW_QUERY_THRESHOLD_MS } from '@platform/runtime/metrics/slowQueryPlugin';

/** Aralık -> (çözünürlük, geriye bakış). 24 saate kadar 5 dk kovası, ötesi 1 sa kovası. */
export const SLOW_QUERY_RANGES = {
    '1h': { resolution: '5m', ms: 3600_000 }, '24h': { resolution: '5m', ms: 86_400_000 },
    '7d': { resolution: '1h', ms: 7 * 86_400_000 }, '30d': { resolution: '1h', ms: 30 * 86_400_000 },
} as const;
export type SlowQueryRange = keyof typeof SLOW_QUERY_RANGES;
const MAX_ROWS = 200;
const MAX_DOCS = 1000;

export function p95OfHistogram(h: number[], total: number): number | null {
    if (total <= 0) return null;
    const target = Math.ceil(total * 0.95);
    let cum = 0;
    for (let i = 0; i < h.length; i++) {
        cum += h[i] ?? 0;
        if (cum >= target) return i < HISTOGRAM_BUCKETS_MS.length ? HISTOGRAM_BUCKETS_MS[i] : null;
    }
    return null;
}

export async function buildSlowQueries(deps: { applicationDB: any; range: SlowQueryRange; now?: () => Date }) {
    const until = (deps.now ?? (() => new Date()))();
    const r = SLOW_QUERY_RANGES[deps.range];
    const since = new Date(until.getTime() - r.ms);
    const docs: any[] = await deps.applicationDB.getMetricRollupModel()
        .find({ metric: SLOW_QUERY_METRIC, resolution: r.resolution, bucketStart: { $gte: since, $lte: until } }, { series: 1, _id: 0 })
        .limit(MAX_DOCS).maxTimeMS(5000).lean();

    const merged = new Map<string, { db: string; collection: string; op: string; count: number; h: number[] }>();
    for (const d of docs) {
        for (const s of Object.values<any>(d.series ?? {})) {
            const l = s?.labels; if (!l) continue;
            const key = `${l.db}|${l.collection}|${l.op}`;
            let m = merged.get(key);
            if (!m) { m = { db: String(l.db), collection: String(l.collection), op: String(l.op), count: 0, h: new Array(HISTOGRAM_BUCKETS_MS.length + 1).fill(0) }; merged.set(key, m); }
            m.count += Number(s.c) || 0;
            if (s.h && typeof s.h === 'object') for (const [i, v] of Object.entries<any>(s.h)) m.h[Number(i)] = (m.h[Number(i)] ?? 0) + (Number(v) || 0);
        }
    }
    const items = [...merged.values()].sort((a, b) => b.count - a.count).slice(0, MAX_ROWS)
        .map((m) => ({ db: m.db, collection: m.collection, op: m.op, count: m.count, p95Ms: p95OfHistogram(m.h, m.count) }));
    return { range: deps.range, thresholdMs: SLOW_QUERY_THRESHOLD_MS, since: since.toISOString(), until: until.toISOString(), items };
}

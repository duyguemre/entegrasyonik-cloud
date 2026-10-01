import { HISTOGRAM_BUCKETS_MS, HISTOGRAM_BUCKET_SETS, truncateToBucket } from '@platform/runtime/metrics';

/**
 * Faz-3: `stock_publish_lag_ms` (düzenleme/rezervasyon -> pazaryeri onayı, X2) histogramından p50/p95 özeti.
 * Kaynak: `MetricRollups` (ADR-0017; pod'lar 60 sn'de bir flush eder — bellekteki henüz flush edilmemiş gözlemler görünmez).
 *
 * KAPSAM UYARISI: metrik etiketi yalnız `integration` taşır, tenant etiketi YOK (kardinalite, ADR-0017 Karar 2.3) -> özet
 * PLATFORM geneli (tüm tenant'lar), kanal başına. Tenant'a özgü gecikme bu metrikle verilemez.
 *
 * X12: bu metrik `long` kova setiyle (HISTOGRAM_BUCKET_SETS.long: ...60s, 120s, 300s, 900s, 30dk, 1sa, +Inf) `h_long` alanına yazılır;
 * SLO "p95 <= 2 dk" doğrulanabilir. `overflow:true` yalnız EN ÜST kovayı (1 sa) da aşarsa. ESKİ rollup satırları (60 sn kovalı `h`,
 * 11 eleman) okunurken long ölçeğe çevrilir: indeks 0-9 aynı sınırlar, eski `+Inf` (>60 sn, gerçek değer bilinmiyor) -> long `+Inf`
 * (uydurma değer yok; eski satırlardaki >60 sn gözlemler overflow sayılır, 7g/90g TTL ile kendiliğinden kaybolur).
 */
/** Tembel okunur (modül yüklenirken metrik modülüne dokunmaz; alarm değerlendiricisi bileşim kökünden içe aktarır). */
const long = (): ReadonlyArray<number> => HISTOGRAM_BUCKET_SETS.long;
export const PUBLISH_LAG_METRIC = 'stock_publish_lag_ms';
export const PUBLISH_LAG_WINDOWS = ['1h', '24h'] as const;
export type PublishLagWindow = typeof PUBLISH_LAG_WINDOWS[number];

export interface LagPercentile { valueMs: number | null; overflow: boolean }
export interface LagSummary {
    count: number;
    avgMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    /** p50/p95 en büyük kovanın (maxBucketMs) üstüne düştüyse true: değer bilinmiyor, ">maxBucketMs". */
    p50Overflow: boolean;
    p95Overflow: boolean;
    /** Son sonlu kova üst sınırı (ms). */
    maxBucketMs: number;
    /** Son sonlu kovanın ÜSTÜNDEKİ (+Inf) gözlem sayısı. */
    overflowCount: number;
}

/** Kovaya özgü (kümülatif DEĞİL) sayımlardan yüzdelik: kova içinde doğrusal interpolasyon; `+Inf` kovası -> overflow. */
export function percentileFromBuckets(buckets: ReadonlyArray<number>, p: number): LagPercentile {
    const total = buckets.reduce((a, b) => a + b, 0);
    if (total <= 0) return { valueMs: null, overflow: false };
    const rank = Math.max(1, Math.ceil(p * total));
    let cum = 0;
    for (let i = 0; i < buckets.length; i++) {
        const n = buckets[i];
        if (n <= 0) continue;
        if (cum + n >= rank) {
            if (i >= long().length) return { valueMs: null, overflow: true };
            const lower = i === 0 ? 0 : long()[i - 1];
            const upper = long()[i];
            return { valueMs: Math.round(lower + ((rank - cum) / n) * (upper - lower)), overflow: false };
        }
        cum += n;
    }
    return { valueMs: null, overflow: true };
}

export function summarizeBuckets(buckets: ReadonlyArray<number>, count: number, sum: number): LagSummary {
    const p50 = percentileFromBuckets(buckets, 0.5);
    const p95 = percentileFromBuckets(buckets, 0.95);
    return {
        count,
        avgMs: count > 0 ? Math.round(sum / count) : null,
        p50Ms: p50.valueMs, p95Ms: p95.valueMs,
        p50Overflow: p50.overflow, p95Overflow: p95.overflow,
        maxBucketMs: long()[long().length - 1],
        overflowCount: buckets[long().length] ?? 0,
    };
}

const WINDOW_SPEC: Record<PublishLagWindow, { ms: number; resolution: '5m' | '1h' }> = {
    '1h': { ms: 60 * 60 * 1000, resolution: '5m' },
    '24h': { ms: 24 * 60 * 60 * 1000, resolution: '1h' },
};

/** `MetricRollups` kovalarından kanal başına + toplam özet. `model`: `find(filter).lean()` destekleyen (mock'lanabilir). */
export async function getPublishLagSummary(model: any, window: PublishLagWindow, now: Date = new Date()) {
    const spec = WINDOW_SPEC[window];
    const from = truncateToBucket(new Date(now.getTime() - spec.ms), spec.resolution);
    const docs: any[] = await model
        .find({ metric: PUBLISH_LAG_METRIC, resolution: spec.resolution, bucketStart: { $gte: from } })
        .maxTimeMS(10000)
        .lean();

    const width = long().length + 1;
    const legacyInf = HISTOGRAM_BUCKETS_MS.length;
    const acc = new Map<string, { count: number; sum: number; buckets: number[] }>();
    const add = (key: string, c: number, sum: number, hLong: Record<string, number>, hLegacy: Record<string, number>) => {
        let a = acc.get(key);
        if (!a) { a = { count: 0, sum: 0, buckets: new Array(width).fill(0) }; acc.set(key, a); }
        a.count += c; a.sum += sum;
        for (const [i, n] of Object.entries(hLong || {})) {
            const idx = Number(i);
            if (Number.isInteger(idx) && idx >= 0 && idx < width) a.buckets[idx] += Number(n) || 0;
        }
        for (const [i, n] of Object.entries(hLegacy || {})) {
            const idx = Number(i);
            if (!Number.isInteger(idx) || idx < 0 || idx > legacyInf) continue;
            a.buckets[idx === legacyInf ? width - 1 : idx] += Number(n) || 0;
        }
    };
    for (const d of docs || []) {
        for (const entry of Object.values(d?.series || {}) as any[]) {
            const integration = String(entry?.labels?.integration ?? 'unknown');
            const c = Number(entry?.c) || 0, sum = Number(entry?.sum) || 0, hl = entry?.h_long || {}, h = entry?.h || {};
            add(`i:${integration}`, c, sum, hl, h);
            add('total', c, sum, hl, h);
        }
    }
    const byIntegration = [...acc.entries()]
        .filter(([k]) => k.startsWith('i:'))
        .map(([k, a]) => ({ integration: k.slice(2), ...summarizeBuckets(a.buckets, a.count, a.sum) }))
        .sort((x, y) => x.integration.localeCompare(y.integration));
    const t = acc.get('total');
    return {
        window, resolution: spec.resolution, from, to: now,
        scope: 'platform' as const,
        total: t ? summarizeBuckets(t.buckets, t.count, t.sum) : summarizeBuckets(new Array(width).fill(0), 0, 0),
        byIntegration,
    };
}

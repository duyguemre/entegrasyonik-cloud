// X12: metrik başına kova seti (stock_publish_lag_ms -> long), rollup alanı `h_long`, eski 60 sn kovalı `h` satırı uyumu.
import { describe, it, expect } from '@jest/globals';
import { MetricsRegistry, HISTOGRAM_BUCKETS_MS, HISTOGRAM_BUCKET_SETS } from '@platform/runtime/metrics/MetricsRegistry';
import { buildBulkWriteOps } from '@platform/runtime/metrics/metricsFlush';
import { getPublishLagSummary, PUBLISH_LAG_METRIC } from '../../../../src/operations/stock/publishLag';

const LONG = HISTOGRAM_BUCKET_SETS.long;
const fakeModel = (docs: any[]) => ({ find: () => ({ maxTimeMS: () => ({ lean: async () => docs }) }) });
const now = new Date('2026-09-30T12:00:00Z');

describe('X12 kova setleri', () => {
    it('varsayılan set aynen kalır; long set onun üstüne 120s..1sa ekler', () => {
        expect(HISTOGRAM_BUCKETS_MS).toEqual([50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000]);
        expect(LONG.slice(0, 10)).toEqual([...HISTOGRAM_BUCKETS_MS]);
        expect(LONG.slice(10)).toEqual([120000, 300000, 900000, 1800000, 3600000]);
    });

    it('stock_publish_lag_ms long kovaya yazar; diğer metrik varsayılan', () => {
        const reg = new MetricsRegistry();
        reg.observeHistogram(PUBLISH_LAG_METRIC, { integration: 'n11' }, 100000); // (60s,120s] -> idx 10
        reg.observeHistogram(PUBLISH_LAG_METRIC, { integration: 'n11' }, 7200000); // +Inf
        reg.observeHistogram('http_request_duration_ms', {}, 100000); // default +Inf
        const snap = reg.drain();
        const lag = snap.find((s) => s.metric === PUBLISH_LAG_METRIC)!;
        expect(lag.bucketSet).toBe('long');
        expect(lag.buckets).toHaveLength(LONG.length + 1);
        expect(lag.buckets[10]).toBe(1);
        expect(lag.buckets[LONG.length]).toBe(1);
        const http = snap.find((s) => s.metric === 'http_request_duration_ms')!;
        expect(http.buckets).toHaveLength(HISTOGRAM_BUCKETS_MS.length + 1);
        expect(http.buckets[HISTOGRAM_BUCKETS_MS.length]).toBe(1);
    });

    it('rollup: long set `h_long`, varsayılan `h` alanına yazılır', () => {
        const reg = new MetricsRegistry();
        reg.observeHistogram(PUBLISH_LAG_METRIC, {}, 100000);
        reg.observeHistogram('other_ms', {}, 10);
        const ops = buildBulkWriteOps(reg.drain(), now);
        const inc = (m: string) => ops.find((o) => o.updateOne.filter.metric === m)!.updateOne.update.$inc;
        expect(inc(PUBLISH_LAG_METRIC)).toHaveProperty(['series._.h_long.10'], 1);
        expect(inc('other_ms')).toHaveProperty(['series._.h.0'], 1);
    });
});

describe('getPublishLagSummary: long kovalar + eski satır uyumu', () => {
    const entry = (extra: any) => ({ labels: { integration: 'trendyol' }, c: 0, sum: 0, ...extra });

    it('120 sn civarı değerler: p95 ~ 120 sn, overflow yok (SLO doğrulanabilir)', async () => {
        // 95 gözlem (60s,120s] idx10, 5 gözlem (120s,300s] idx11
        const docs = [{ series: { a: entry({ c: 100, sum: 100 * 100000, h_long: { 10: 95, 11: 5 } }) } }];
        const r = await getPublishLagSummary(fakeModel(docs), '1h', now);
        expect(r.total.p95Overflow).toBe(false);
        expect(r.total.p95Ms).toBe(120000);
        expect(r.total.p50Ms).toBe(Math.round(60000 + (50 / 95) * 60000));
        expect(r.total.maxBucketMs).toBe(3600000);
    });

    it('p95Overflow yalnız en üst kovayı da aşarsa', async () => {
        const over = await getPublishLagSummary(fakeModel([{ series: { a: entry({ c: 10, h_long: { 15: 10 } }) } }]), '1h', now);
        expect(over.total).toMatchObject({ p95Ms: null, p95Overflow: true, overflowCount: 10 });
        const ok = await getPublishLagSummary(fakeModel([{ series: { a: entry({ c: 10, h_long: { 14: 10 } }) } }]), '1h', now);
        expect(ok.total.p95Overflow).toBe(false);
    });

    it('eski satır (60 sn kovalı `h`, 11 eleman): idx<10 aynı, eski +Inf -> overflow; yeni satırla toplanır', async () => {
        const docs = [
            { series: { a: entry({ c: 12, h: { 2: 10, 10: 2 } }) } },               // eski: 10 x (100,250]ms, 2 x >60s
            { series: { a: entry({ c: 88, h_long: { 2: 88 } }) } },                 // yeni
        ];
        const r = await getPublishLagSummary(fakeModel(docs), '1h', now);
        expect(r.total.count).toBe(100);
        expect(r.total.overflowCount).toBe(2); // eski +Inf, 11. kovaya (120 sn) KAYMADI
        expect(r.total.p50Ms).toBe(177);
        expect(r.total.p95Overflow).toBe(false);
        // yalnız eski satır: >60 sn gözlemler overflow (uydurma değer yok)
        const old = await getPublishLagSummary(fakeModel([{ series: { a: entry({ c: 10, h: { 10: 10 } }) } }]), '1h', now);
        expect(old.total).toMatchObject({ p95Ms: null, p95Overflow: true });
    });
});

/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 2.1): `buildBulkWriteOps` (saf) + `flushMetricsOnce` (ince IO sarmalayıcı,
 * sahte `bulkWrite` modeli -- DB YOK). Aynı anlık görüntü İKİ çözünürlüğe (5dk+1sa) yazılır.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { buildBulkWriteOps, encodeSeriesKey, truncateToBucket, flushMetricsOnce } from '@platform/runtime/metrics/metricsFlush';
import type { MetricSeriesSnapshot } from '@platform/runtime/metrics/MetricsRegistry';

describe('metricsFlush', () => {
    describe('truncateToBucket', () => {
        it('5dk kovasına aşağı yuvarlar', () => {
            const at = new Date('2026-09-28T10:07:31.500Z');
            expect(truncateToBucket(at, '5m').toISOString()).toBe('2026-09-28T10:05:00.000Z');
        });
        it('1sa kovasına aşağı yuvarlar', () => {
            const at = new Date('2026-09-28T10:47:00.000Z');
            expect(truncateToBucket(at, '1h').toISOString()).toBe('2026-09-28T10:00:00.000Z');
        });
    });

    describe('encodeSeriesKey', () => {
        it('etiketsiz seri: "_"', () => { expect(encodeSeriesKey({})).toBe('_'); });
        it('anahtar sıralı, deterministik', () => {
            expect(encodeSeriesKey({ b: '2', a: '1' })).toBe(encodeSeriesKey({ a: '1', b: '2' }));
        });
        it('değerdeki nokta Mongo-güvenli karaktere kaçışlanır (alan adında "." YASAK)', () => {
            const key = encodeSeriesKey({ op: 'a.b' });
            expect(key).not.toContain('.');
        });
    });

    describe('buildBulkWriteOps', () => {
        const snap: MetricSeriesSnapshot[] = [
            { metric: 'http_requests', labels: { op: 'X', statusClass: '2xx' }, count: 3, sum: 0, buckets: [] },
            { metric: 'http_request_duration_ms', labels: { op: 'X', statusClass: '2xx' }, count: 3, sum: 300, buckets: [1, 2, 0] },
        ];
        const flushedAt = new Date('2026-09-28T10:07:00Z');

        it('her seri İÇİN İKİ operasyon üretir (5dk + 1sa)', () => {
            const ops = buildBulkWriteOps(snap, flushedAt);
            expect(ops).toHaveLength(4);
            expect(ops.filter((o) => o.updateOne.filter.resolution === '5m')).toHaveLength(2);
            expect(ops.filter((o) => o.updateOne.filter.resolution === '1h')).toHaveLength(2);
        });

        it('$inc alanları seri anahtarına göre kurulur (c/sum/h.i); sum=0 ise ALAN YOK', () => {
            const ops = buildBulkWriteOps(snap, flushedAt);
            const counterOp = ops.find((o) => o.updateOne.filter.metric === 'http_requests' && o.updateOne.filter.resolution === '5m')!;
            const key = encodeSeriesKey({ op: 'X', statusClass: '2xx' });
            expect(counterOp.updateOne.update.$inc).toEqual({ [`series.${key}.c`]: 3 });
            const histOp = ops.find((o) => o.updateOne.filter.metric === 'http_request_duration_ms' && o.updateOne.filter.resolution === '5m')!;
            expect(histOp.updateOne.update.$inc).toEqual({
                [`series.${key}.c`]: 3,
                [`series.${key}.sum`]: 300,
                [`series.${key}.h.0`]: 1,
                [`series.${key}.h.1`]: 2,
            });
        });

        it('boş anlık görüntü -> boş dizi', () => {
            expect(buildBulkWriteOps([], flushedAt)).toEqual([]);
        });

        it('upsert:true VE $setOnInsert labels içerir (ilk yazımda okunabilirlik için)', () => {
            const ops = buildBulkWriteOps(snap, flushedAt);
            expect(ops[0].updateOne.upsert).toBe(true);
            const key = encodeSeriesKey({ op: 'X', statusClass: '2xx' });
            expect(ops[0].updateOne.update.$setOnInsert).toEqual({ [`series.${key}.labels`]: { op: 'X', statusClass: '2xx' } });
        });
    });

    describe('ADR-0017 Karar 2.1: "2 pod x 2 flush = tek sonuç" birleştirme simülasyonu', () => {
        /** Gerçek Mongo `$inc` nokta-yol semantiğini taklit eden minimal saf uygulayıcı (upsert). */
        function applyIncOps(store: Map<string, any>, ops: ReturnType<typeof buildBulkWriteOps>): void {
            for (const op of ops) {
                const key = JSON.stringify(op.updateOne.filter);
                const doc = store.get(key) ?? {};
                for (const [path, delta] of Object.entries(op.updateOne.update.$inc)) {
                    const parts = path.split('.');
                    let node = doc;
                    for (let i = 0; i < parts.length - 1; i++) node = (node[parts[i]] ??= {});
                    const last = parts[parts.length - 1];
                    node[last] = (node[last] ?? 0) + (delta as number);
                }
                store.set(key, doc);
            }
        }

        it('2 "pod"un AYNI 5dk kovasına, İKİ AYRI flush turunda yazdığı seri TEK doğru toplamda birleşir', () => {
            const store = new Map<string, any>();
            const flushedAt = new Date('2026-09-28T10:03:00Z'); // her iki pod da AYNI 5dk kovasına düşer

            // pod-A: 3 çağrı
            applyIncOps(store, buildBulkWriteOps([{ metric: 'http_requests', labels: { op: 'X', statusClass: '2xx' }, count: 3, sum: 0, buckets: [] }], flushedAt));
            // pod-B: 5 çağrı (AYRI flush turu, aynı kova/aynı seri)
            applyIncOps(store, buildBulkWriteOps([{ metric: 'http_requests', labels: { op: 'X', statusClass: '2xx' }, count: 5, sum: 0, buckets: [] }], flushedAt));

            const key5m = JSON.stringify({ metric: 'http_requests', resolution: '5m', bucketStart: truncateToBucket(flushedAt, '5m') });
            const seriesField = encodeSeriesKey({ op: 'X', statusClass: '2xx' });
            expect(store.get(key5m).series[seriesField].c).toBe(8); // 3+5 -- pod/tur SAYISINDAN bağımsız doğru toplam
        });
    });

    describe('flushMetricsOnce', () => {
        it('drain() boşsa bulkWrite HİÇ ÇAĞRILMAZ', async () => {
            const bulkWrite = jest.fn(async () => ({}));
            const r = await flushMetricsOnce({ model: { bulkWrite }, drain: () => [] });
            expect(bulkWrite).not.toHaveBeenCalled();
            expect(r).toEqual({ seriesFlushed: 0, opsWritten: 0 });
        });

        it('drain() doluysa bulkWrite tek seferde TÜM operasyonlarla çağrılır', async () => {
            const bulkWrite = jest.fn(async () => ({}));
            const r = await flushMetricsOnce({
                model: { bulkWrite },
                drain: () => [{ metric: 'm', labels: {}, count: 1, sum: 0, buckets: [] }],
                now: () => new Date('2026-09-28T10:00:00Z'),
            });
            expect(bulkWrite).toHaveBeenCalledTimes(1);
            expect(r).toEqual({ seriesFlushed: 1, opsWritten: 2 });
        });
    });
});

// ADR-0017 Karar 2.1: `MetricsRegistry.drain()`'in anlık görüntüsünü `MetricRollups`e (5dk VE 1sa çözünürlük,
// AYNI flush turunda) `$inc` upsert ile yazar. Saf fonksiyonlar (`buildBulkWriteOps`) DB'siz test edilir;
// `flushMetricsOnce` yalnız ince bir IO sarmalayıcıdır (Protokol: mock model, gerçek Mongo YOK).
import { MetricSeriesSnapshot } from './MetricsRegistry';

export type Resolution = '5m' | '1h';

const RESOLUTION_MS: Record<Resolution, number> = { '5m': 5 * 60 * 1000, '1h': 60 * 60 * 1000 };

/** Verilen anı çözünürlük sınırına (aşağı) yuvarlar (UTC epoch tabanlı, TZ'den bağımsız). */
export function truncateToBucket(at: Date, resolution: Resolution): Date {
    const ms = RESOLUTION_MS[resolution];
    return new Date(Math.floor(at.getTime() / ms) * ms);
}

/** Mongo alan adı kısıtları (nokta yasak, `$` ile başlayamaz) için etiket segmentini kaçışlar. */
function sanitizeFieldSegment(s: string): string {
    return String(s).replace(/\./g, '·').replace(/^\$/, '_');
}

/** Etiket kümesinden DETERMİNİSTİK (anahtar sıralı), Mongo-güvenli bir alan adı üretir. Etiketsiz seri: `_`. */
export function encodeSeriesKey(labels: Readonly<Record<string, string>>): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return '_';
    return keys.map((k) => `${sanitizeFieldSegment(k)}=${sanitizeFieldSegment(labels[k])}`).join('|');
}

export interface BulkWriteOp {
    updateOne: {
        filter: { metric: string; resolution: Resolution; bucketStart: Date };
        update: { $inc: Record<string, number>; $setOnInsert: Record<string, unknown> };
        upsert: true;
    };
}

/**
 * Her anlık görüntü serisi İÇİN İKİ operasyon üretir (5dk kovası + 1sa kovası, Karar 2.1: "Aynı flush'ta iki
 * çözünürlüğe yazılır"). Boş anlık görüntü -> boş dizi (gereksiz Mongo tur atlanır).
 */
export function buildBulkWriteOps(snapshots: MetricSeriesSnapshot[], flushedAt: Date): BulkWriteOp[] {
    const ops: BulkWriteOp[] = [];
    for (const s of snapshots) {
        const seriesField = encodeSeriesKey(s.labels);
        for (const resolution of ['5m', '1h'] as const) {
            const bucketStart = truncateToBucket(flushedAt, resolution);
            const inc: Record<string, number> = { [`series.${seriesField}.c`]: s.count };
            if (s.sum !== 0) inc[`series.${seriesField}.sum`] = s.sum;
            for (let i = 0; i < s.buckets.length; i++) {
                if (s.buckets[i] > 0) inc[`series.${seriesField}.h.${i}`] = s.buckets[i];
            }
            ops.push({
                updateOne: {
                    filter: { metric: s.metric, resolution, bucketStart },
                    update: { $inc: inc, $setOnInsert: { [`series.${seriesField}.labels`]: s.labels } },
                    upsert: true,
                },
            });
        }
    }
    return ops;
}

export interface MetricRollupBulkWriteModel {
    bulkWrite(ops: BulkWriteOp[]): Promise<unknown>;
}

export interface FlushMetricsDeps {
    model: MetricRollupBulkWriteModel;
    /** Testte deterministik zaman için; varsayılan `() => new Date()`. */
    now?: () => Date;
    /** Testte enjekte edilebilir kayıt defteri; varsayılan süreç genelindeki `metricsRegistry`. */
    drain?: () => MetricSeriesSnapshot[];
}

/** Bir flush turu: kayıt defterini boşaltır, iki çözünürlüğe `bulkWrite` ile yazar. Hata YUTULUR (best-effort, ADR Karar 2.1). */
export async function flushMetricsOnce(deps: FlushMetricsDeps): Promise<{ seriesFlushed: number; opsWritten: number }> {
    const drain = deps.drain ?? (() => require('./MetricsRegistry').metricsRegistry.drain());
    const snapshots = drain();
    if (snapshots.length === 0) return { seriesFlushed: 0, opsWritten: 0 };
    const now = (deps.now ?? (() => new Date()))();
    const ops = buildBulkWriteOps(snapshots, now);
    if (ops.length > 0) await deps.model.bulkWrite(ops);
    return { seriesFlushed: snapshots.length, opsWritten: ops.length };
}

// ADR-0017 Karar 2.1/2.3 (metrikler): süreç-içi (in-process) kayıt defteri. `counter`/`histogram` biriktirir,
// `drain()` ile ANLIK GÖRÜNTÜ alınır ve İÇ DURUM SIFIRLANIR (bir sonraki flush turu aynı olayı tekrar saymaz;
// Mongo tarafında `$inc` upsert ile pod/tur arası TOPLAMA yapılır -- ADR Karar 2.1 "çoklu pod ve çoklu flush
// doğal olarak toplanır"). Bu dosya YALNIZ bellek içi muhasebe tutar; Mongo'ya yazma `metricsFlush.ts`'tedir
// (katman kuralı: `platform/runtime` DB'yi BİLMEZ, ADR-0016 §1.2 Sv5).
//
// Kardinalite koruması (Karar 2.3): kayıt defteri genelinde (TÜM metrikler toplamda) en fazla `MAX_SERIES`
// farklı seri tutulur; aşan YENİ seri REDDEDİLİR ve `metrics_series_dropped` sayacı artar (bu sayaç kendisi
// sınırdan MUAFTIR -- her zaman tek, etiketsiz bir seridir).

export const HISTOGRAM_BUCKETS_MS: readonly number[] = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000];
/** Son "taşma" kovası: `Number.POSITIVE_INFINITY` (Prometheus `+Inf` eşdeğeri). */

/**
 * X12: isimli kova setleri. `default` = `HISTOGRAM_BUCKETS_MS` (mevcut metrikler, anlam DEĞİŞMEZ). `long` = uzun gecikmeli
 * metrikler (stok yayın gecikmesi; SLO p95 <= 2 dk doğrulanabilsin). Rollup'ta `default` -> `h`, diğerleri -> `h_<ad>` alanına
 * yazılır (eski 60 sn kovalı `h` satırlarıyla KARIŞMAZ; bkz. metricsFlush / publishLag).
 */
export const HISTOGRAM_BUCKET_SETS: Readonly<Record<string, readonly number[]>> = {
    default: HISTOGRAM_BUCKETS_MS,
    long: [...HISTOGRAM_BUCKETS_MS, 120000, 300000, 900000, 1800000, 3600000],
};
/** Metrik adı -> kova seti adı (listede olmayan metrik `default`). */
const METRIC_BUCKET_SET: Readonly<Record<string, string>> = { stock_publish_lag_ms: 'long', agent_confirm_wait_ms: 'long' };

function bucketSetNameFor(metric: string): string {
    const n = METRIC_BUCKET_SET[metric];
    return n && HISTOGRAM_BUCKET_SETS[n] ? n : 'default';
}

export const MAX_SERIES = 5000;
const SERIES_DROPPED_METRIC = 'metrics_series_dropped';

export type MetricLabels = Readonly<Record<string, string>>;

export interface MetricSeriesSnapshot {
    metric: string;
    labels: MetricLabels;
    /** Sayaç: toplam artış; histogram: gözlem sayısı. */
    count: number;
    /** Yalnız histogram: gözlemlenen değerlerin toplamı (ortalama hesaplamak için). */
    sum: number;
    /** Yalnız histogram: `HISTOGRAM_BUCKETS_MS` ile aynı uzunluk + 1 (+Inf); KÜMÜLATİF DEĞİL, kovaya ÖZGÜ sayım. */
    buckets: number[];
    /** Kova seti adı (`HISTOGRAM_BUCKET_SETS`); sayaçlarda `default`. `buckets` uzunluğu = set uzunluğu + 1. */
    bucketSet?: string;
}

interface SeriesAccumulator {
    metric: string;
    labels: MetricLabels;
    count: number;
    sum: number;
    buckets: number[] | undefined;
    bounds: readonly number[];
}

function canonicalLabelKey(labels: MetricLabels): string {
    const keys = Object.keys(labels).sort();
    return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function bucketIndexFor(valueMs: number, bounds: readonly number[]): number {
    for (let i = 0; i < bounds.length; i++) {
        if (valueMs <= bounds[i]) return i;
    }
    return bounds.length; // +Inf
}

export class MetricsRegistry {
    private series = new Map<string, SeriesAccumulator>();
    private droppedCount = 0;

    private seriesKey(metric: string, labels: MetricLabels): string {
        return `${metric}\u0000${canonicalLabelKey(labels)}`;
    }

    /** Yeni seri kabul edilebilir mi (sınır dahilinde) veya zaten var mı. `metrics_series_dropped`in kendisi her zaman kabul edilir. */
    private getOrCreate(metric: string, labels: MetricLabels, withHistogram: boolean): SeriesAccumulator | undefined {
        const key = this.seriesKey(metric, labels);
        let acc = this.series.get(key);
        if (acc) return acc;

        if (metric !== SERIES_DROPPED_METRIC && this.series.size >= MAX_SERIES) {
            this.droppedCount++;
            return undefined;
        }
        const bounds = HISTOGRAM_BUCKET_SETS[bucketSetNameFor(metric)];
        acc = { metric, labels, count: 0, sum: 0, bounds, buckets: withHistogram ? new Array(bounds.length + 1).fill(0) : undefined };
        this.series.set(key, acc);
        return acc;
    }

    /** Basit sayaç: `count` alanına `delta` eklenir (varsayılan 1). Asla fırlatmaz. */
    incCounter(metric: string, labels: MetricLabels = {}, delta = 1): void {
        try {
            const acc = this.getOrCreate(metric, labels, false);
            if (acc) acc.count += delta;
        } catch { /* metrik kaydı ANA AKIŞI asla etkilemez */ }
    }

    /** Histogram gözlemi: `count`+1, `sum`+değer, ilgili kovaya +1. Asla fırlatmaz. */
    observeHistogram(metric: string, labels: MetricLabels = {}, valueMs: number): void {
        try {
            const acc = this.getOrCreate(metric, labels, true);
            if (!acc) return;
            acc.count += 1;
            acc.sum += Math.max(0, valueMs);
            if (!acc.buckets) acc.buckets = new Array(acc.bounds.length + 1).fill(0);
            acc.buckets[bucketIndexFor(valueMs, acc.bounds)] += 1;
        } catch { /* metrik kaydı ANA AKIŞI asla etkilemez */ }
    }

    /**
     * Anlık görüntü alır ve İÇ DURUMU SIFIRLAR (bir sonraki flush turu için). `metrics_series_dropped` bu
     * turda biriken düşüş sayısını (varsa) anlık görüntüye TEK seri olarak ekler.
     */
    drain(): MetricSeriesSnapshot[] {
        const out: MetricSeriesSnapshot[] = [];
        for (const acc of this.series.values()) {
            out.push({ metric: acc.metric, labels: acc.labels, count: acc.count, sum: acc.sum, buckets: acc.buckets ? [...acc.buckets] : [], bucketSet: bucketSetNameFor(acc.metric) });
        }
        if (this.droppedCount > 0) {
            out.push({ metric: SERIES_DROPPED_METRIC, labels: {}, count: this.droppedCount, sum: 0, buckets: [], bucketSet: 'default' });
        }
        this.series.clear();
        this.droppedCount = 0;
        return out;
    }

    /** Yalnız gözlem/test: mevcut seri sayısı (drop sınırına ne kadar yakın olduğunu görmek için). */
    seriesCountForTests(): number {
        return this.series.size;
    }

    /** Yalnız testler için: durumu tamamen sıfırlar (drain çağırmadan). */
    resetForTests(): void {
        this.series.clear();
        this.droppedCount = 0;
    }
}

/** Süreç genelinde TEK kayıt defteri (Karar 2.1: "süreç-içi metrik kayıt defteri"). */
export const metricsRegistry = new MetricsRegistry();

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
const BUCKET_COUNT = HISTOGRAM_BUCKETS_MS.length + 1;

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
}

interface SeriesAccumulator {
    metric: string;
    labels: MetricLabels;
    count: number;
    sum: number;
    buckets: number[] | undefined;
}

function canonicalLabelKey(labels: MetricLabels): string {
    const keys = Object.keys(labels).sort();
    return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function bucketIndexFor(valueMs: number): number {
    for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
        if (valueMs <= HISTOGRAM_BUCKETS_MS[i]) return i;
    }
    return BUCKET_COUNT - 1; // +Inf
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
        acc = { metric, labels, count: 0, sum: 0, buckets: withHistogram ? new Array(BUCKET_COUNT).fill(0) : undefined };
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
            if (!acc.buckets) acc.buckets = new Array(BUCKET_COUNT).fill(0);
            acc.buckets[bucketIndexFor(valueMs)] += 1;
        } catch { /* metrik kaydı ANA AKIŞI asla etkilemez */ }
    }

    /**
     * Anlık görüntü alır ve İÇ DURUMU SIFIRLAR (bir sonraki flush turu için). `metrics_series_dropped` bu
     * turda biriken düşüş sayısını (varsa) anlık görüntüye TEK seri olarak ekler.
     */
    drain(): MetricSeriesSnapshot[] {
        const out: MetricSeriesSnapshot[] = [];
        for (const acc of this.series.values()) {
            out.push({ metric: acc.metric, labels: acc.labels, count: acc.count, sum: acc.sum, buckets: acc.buckets ? [...acc.buckets] : [] });
        }
        if (this.droppedCount > 0) {
            out.push({ metric: SERIES_DROPPED_METRIC, labels: {}, count: this.droppedCount, sum: 0, buckets: [] });
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

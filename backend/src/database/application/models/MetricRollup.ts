import mongoose from "mongoose";

// ADR-0017 Karar 2.1/2.7: birleştirilebilir (mergeable) metrik kovası. Metrik adı × çözünürlük (5dk/1sa) ×
// kova başlangıcı başına TEK doküman; seri kümeleri doküman içinde harita (`series.<anahtar>.{c,sum,h}`),
// `$inc` upsert ile YAZILIR -- çoklu pod ve çoklu flush turu doğal olarak toplanır (bkz. `metricsFlush.ts`).
// Saklama: 5dk kova 7 gün, 1sa kova 90 gün (Karar 7) -- AYNI alan (`bucketStart`) üzerinde, `resolution`'a göre
// PARÇALI (partial) iki farklı TTL indeksi (Mongo bunu destekler: partialFilterExpression farklıysa aynı alanda
// birden fazla TTL indeksi kurulabilir).

export const METRIC_ROLLUP_5M_TTL_SECONDS = 7 * 24 * 60 * 60;   // 7 gün
export const METRIC_ROLLUP_1H_TTL_SECONDS = 90 * 24 * 60 * 60;  // 90 gün

const SeriesEntrySchema = new mongoose.Schema({
    // Okunabilirlik/hata ayıklama için etiketler AYNEN de tutulur (seri anahtarını Mongo'da tekrar parse etmeye gerek kalmaz).
    labels: { type: mongoose.Schema.Types.Mixed, default: {} },
    c:      { type: Number, default: 0 }, // count (sayaç artışı ya da histogram gözlem sayısı)
    sum:    { type: Number, default: 0 }, // yalnız histogram: gözlemlenen değerlerin toplamı
    h:      { type: [Number], default: undefined }, // yalnız histogram: HISTOGRAM_BUCKETS_MS + 1 (+Inf) uzunluğunda, kovaya özgü sayım
}, { _id: false, strict: false });

export const MetricRollupSchema = new mongoose.Schema({
    metric:      { type: String, required: true },
    resolution:  { type: String, enum: ['5m', '1h'], required: true },
    bucketStart: { type: Date, required: true },
    // Anahtar = `encodeSeriesKey(labels)` (bkz. metricsFlush.ts) -- Mongo alan adı kısıtları (nokta/`$` yasak) nedeniyle
    // etiket değerleri kodlanır. `Mixed` map: her alt-alan bir `SeriesEntrySchema`.
    series:      { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
    collection: 'MetricRollups',
    versionKey: false,
});

MetricRollupSchema.index({ metric: 1, resolution: 1, bucketStart: 1 }, { unique: true });
MetricRollupSchema.index({ bucketStart: 1 }, { expireAfterSeconds: METRIC_ROLLUP_5M_TTL_SECONDS, partialFilterExpression: { resolution: '5m' } });
MetricRollupSchema.index({ bucketStart: 1 }, { expireAfterSeconds: METRIC_ROLLUP_1H_TTL_SECONDS, partialFilterExpression: { resolution: '1h' } });

// yalnızca dokümantasyon amaçlı: SeriesEntrySchema doğrudan kullanılmıyor (Mixed + $inc ile yazılıyor) ama şekli sabitler.
export const __SeriesEntryShape = SeriesEntrySchema;

import mongoose from "mongoose";

// ADR-0017 Karar 2.1/2.7: birleştirilebilir (mergeable) metrik kovası. Metrik adı × çözünürlük (5dk/1sa) ×
// kova başlangıcı başına TEK doküman; seri kümeleri doküman içinde harita (`series.<anahtar>.{c,sum,h}`),
// `$inc` upsert ile YAZILIR -- çoklu pod ve çoklu flush turu doğal olarak toplanır (bkz. `metricsFlush.ts`).
// Saklama: 5dk kova 7 gün, 1sa kova 90 gün (Karar 7) -- AYNI alan (`bucketStart`) üzerinde, `resolution`'a göre
// PARÇALI (partial) iki farklı TTL indeksi (Mongo bunu destekler: partialFilterExpression farklıysa aynı alanda
// birden fazla TTL indeksi kurulabilir).

export const METRIC_ROLLUP_5M_TTL_SECONDS = 7 * 24 * 60 * 60;   // 7 gün
export const METRIC_ROLLUP_1H_TTL_SECONDS = 90 * 24 * 60 * 60;  // 90 gün

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

// DB-05/DB-10 (DBR-02): iki TTL indeksi AYNI anahtarda; acik ad olmadan ikisi de varsayilan 'bucketStart_1' adini alir ve ikincisi
// IndexOptionsConflict ile SESSIZCE kurulamaz (1sa kovalari hic silinmezdi). Adlar sabit; goc: migrations/0009-notifications-metricrollups-indexes-app.js.
const METRIC_ROLLUP_INDEX_NAMES = { unique: 'metric_1_resolution_1_bucketStart_1', ttl5m: 'ttl_bucket_5m', ttl1h: 'ttl_bucket_1h' } as const;
MetricRollupSchema.index({ metric: 1, resolution: 1, bucketStart: 1 }, { unique: true, name: METRIC_ROLLUP_INDEX_NAMES.unique });
MetricRollupSchema.index({ bucketStart: 1 }, { name: METRIC_ROLLUP_INDEX_NAMES.ttl5m, expireAfterSeconds: METRIC_ROLLUP_5M_TTL_SECONDS, partialFilterExpression: { resolution: '5m' } });
MetricRollupSchema.index({ bucketStart: 1 }, { name: METRIC_ROLLUP_INDEX_NAMES.ttl1h, expireAfterSeconds: METRIC_ROLLUP_1H_TTL_SECONDS, partialFilterExpression: { resolution: '1h' } });

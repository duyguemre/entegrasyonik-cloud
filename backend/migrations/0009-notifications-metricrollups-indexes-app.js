'use strict';
/**
 * DB-10 / DBR-02 + DBR-03 (App, expand + tek legacy indeks dusurme): 
 *  (1) ADR-0029 bildirim defteri: `NotificationEvents` (uniq_idem_key UNIQUE + tid/code + ttl_exp_at), `NotificationDeliveries` (4),
 *      `NotificationPreferences` (uniq_tid_userId). Bu semalar `autoIndex:false`; tekillestirme E11000'e dayanir (operations/notifications/
 *      ledger.ts) -> `NOTIFY_V2_ENABLED=true` acilmadan ONCE bu goc `done` olmali.
 *  (2) `MetricRollups` iki TTL indeksi AYNI anahtarda ({bucketStart:1}); acik ad olmadigindan ikisi de `bucketStart_1` adini aliyordu ve ikincisi
 *      kurulamiyordu (bir cozunurluk hic silinmiyordu). Yeni adlar: `ttl_bucket_5m` (7 gun), `ttl_bucket_1h` (90 gun). Eski `bucketStart_1`
 *      (TTL'li) varsa once dusurulur (ayni tanim baska adla olusamaz), sonra iki adli TTL kurulur; unique (metric,resolution,bucketStart) yoksa kurulur.
 * Kanonik beyan: `src/database/application/models/{NotificationEvent,NotificationDelivery,NotificationPreferences,MetricRollup}.ts`
 * (tests/static/indexManifest.static.test.ts + tests/unit/migrateFaz4DbBatch.test.ts eslesmeyi korur). YALNIZ onayli gocte calisir
 * (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: bildirim indekslerini ve iki adli TTL'i dusurur; legacy `bucketStart_1` (5m TTL, autoIndex'in biraktigi durum) geri kurulur;
 * unique indeks pre-existing olabilecegi icin DUSURULMEZ. Koleksiyon/veri silinmez.
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed, collectionFor, listIndexes, ensureIndex, dropIndexIfExists, classify,
} = require('../dev-tools/_migrationIndexes');

const DAY = 24 * 60 * 60;
const TARGETS = [
    {
        key: 'notificationEvents', defaultCollection: 'NotificationEvents',
        indexes: [
            { fields: { idemKey: 1 }, options: { unique: true, name: 'uniq_idem_key' } },
            { fields: { tid: 1, createdAt: -1 }, options: { name: 'tid_1_createdAt_-1' } },
            { fields: { code: 1, createdAt: -1 }, options: { name: 'code_1_createdAt_-1' } },
            { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_exp_at' } },
        ],
    },
    {
        key: 'notificationDeliveries', defaultCollection: 'NotificationDeliveries',
        indexes: [
            { fields: { status: 1, nextAttemptAt: 1 }, options: { name: 'status_1_nextAttemptAt_1' } },
            { fields: { tid: 1, createdAt: -1 }, options: { name: 'tid_1_createdAt_-1' } },
            { fields: { eventId: 1 }, options: { name: 'eventId_1' } },
            { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_exp_at' } },
        ],
    },
    {
        key: 'notificationPreferences', defaultCollection: 'NotificationPreferences',
        indexes: [{ fields: { tid: 1, userId: 1 }, options: { unique: true, name: 'uniq_tid_userId' } }],
    },
];
const METRIC_KEY = 'metricRollups';
const METRIC_COLLECTION = 'MetricRollups';
const METRIC_UNIQUE = { fields: { metric: 1, resolution: 1, bucketStart: 1 }, options: { unique: true, name: 'metric_1_resolution_1_bucketStart_1' } };
const METRIC_TTLS = [
    { fields: { bucketStart: 1 }, options: { name: 'ttl_bucket_5m', expireAfterSeconds: 7 * DAY, partialFilterExpression: { resolution: '5m' } } },
    { fields: { bucketStart: 1 }, options: { name: 'ttl_bucket_1h', expireAfterSeconds: 90 * DAY, partialFilterExpression: { resolution: '1h' } } },
];
const LEGACY_NAME = 'bucketStart_1';
const LEGACY_5M = { bucketStart: 1 };
const LEGACY_5M_OPTS = { name: LEGACY_NAME, expireAfterSeconds: 7 * DAY, partialFilterExpression: { resolution: '5m' } };

const isLegacy = (i) => i.name === LEGACY_NAME && JSON.stringify(i.key) === JSON.stringify({ bucketStart: 1 }) && i.expireAfterSeconds !== undefined;

const METRIC_TARGET = { key: METRIC_KEY, defaultCollection: METRIC_COLLECTION, indexes: [METRIC_UNIQUE, ...METRIC_TTLS] };

module.exports = {
    id: '0009-notifications-metricrollups-indexes-app',
    scope: 'app',
    kind: 'index',
    description: 'DB-10 (App): bildirim defteri indeksleri (uniq_idem_key + TTL) + MetricRollups iki TTL acik adlarla (ttl_bucket_5m/1h; eski bucketStart_1 dusurulur).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeksleri listeler; koleksiyon/indeks yaratmaz. */
    async plan(ctx) {
        const base = await planTargets(ctx, TARGETS);
        const { name, c } = collectionFor(ctx, METRIC_KEY, METRIC_COLLECTION);
        const list = await listIndexes(c);
        const legacy = list.find(isLegacy);
        const metricIndexes = [
            { name: LEGACY_NAME, action: legacy ? 'drop-legacy' : 'absent' },
            ...[METRIC_UNIQUE, ...METRIC_TTLS].map((w) => {
                const cls = classify(list.filter((i) => i !== legacy), w);
                return { name: w.options.name, ...cls };
            }),
        ];
        base.collections.push({ collection: name, indexes: metricIndexes });
        return base;
    },

    async up(ctx) {
        const res = await upTargets(ctx, TARGETS);
        assertCtxDbAllowed(ctx);
        const { name, c, db } = collectionFor(ctx, METRIC_KEY, METRIC_COLLECTION);
        const indexes = [];
        const legacy = (await listIndexes(c)).find(isLegacy);
        if (legacy) indexes.push(await dropIndexIfExists(c, LEGACY_NAME)); // ayni tanim baska adla olusamaz; kisa TTL bosluğu zararsiz
        for (const w of [METRIC_UNIQUE, ...METRIC_TTLS]) indexes.push(await ensureIndex(c, db, w));
        res.collections.push({ collection: name, indexes });
        return res;
    },

    async down(ctx) {
        const res = await downTargets(ctx, TARGETS);
        assertCtxDbAllowed(ctx);
        const { name, c } = collectionFor(ctx, METRIC_KEY, METRIC_COLLECTION);
        const indexes = [];
        for (const w of METRIC_TTLS) indexes.push(await dropIndexIfExists(c, w.options.name));
        const list = await listIndexes(c);
        if (!list.some((i) => i.name === LEGACY_NAME)) {
            await c.createIndex(LEGACY_5M, LEGACY_5M_OPTS); // autoIndex'in biraktigi onceki durum (yalniz 5m TTL)
            indexes.push({ name: LEGACY_NAME, action: 'restored' });
        }
        res.collections.push({ collection: name, indexes });
        return res;
    },
};
module.exports.TARGETS = [...TARGETS, METRIC_TARGET];

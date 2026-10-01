'use strict';
/**
 * MOB-08 / K55 (App, expand): gunluk aktif kullanim koleksiyonu ve indeksleri.
 *  - `UsageDaily`: UNIQUE uniq_day_tid_platform {day, tid, platform} (kayit = $addToSet upsert, E11000 yarisina karsi),
 *    tid_1_day_-1 (musteri detayi kullanim araligi), expAt_ttl (180 gun saklama, expireAfterSeconds:0).
 * Kanonik beyan: `src/database/application/models/UsageDaily.ts` (tests/static/indexManifest.static.test.ts eslesmeyi korur; sema `autoIndex:false`,
 * bu dosya UYGULAMAdir). Yeni koleksiyon oldugundan unique indeks icin mukerrer on kontrolu GEREKMEZ (bos).
 * Kayit yolu (operations/usage/usageRecorder.ts) bu goc `done` olmadan da calisir (upsert koleksiyonu yaratir) ama tekillik ve TTL
 * korumasiz kalir: ilk dagitimdan ONCE bu goc uygulanmali.
 * AuditLogs.platform alani yeni ve istege bagli: indeks GEREKMEZ (tid_1_at_-1 + event filtresi yeterli; geriye donuk doldurma yok).
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalniz bu gocun indekslerini dusurur (koleksiyon/veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'usageDaily', defaultCollection: 'UsageDaily',
        indexes: [
            { fields: { day: 1, tid: 1, platform: 1 }, options: { unique: true, name: 'uniq_day_tid_platform' } },
            { fields: { tid: 1, day: -1 }, options: { name: 'tid_1_day_-1' } },
            { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'expAt_ttl' } },
        ],
    },
];

module.exports = {
    id: '0021-usage-daily-app',
    scope: 'app',
    kind: 'index',
    description: 'MOB-08 (App): UsageDaily koleksiyonu (uniq_day_tid_platform, tid+day, expAt TTL).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

'use strict';
/**
 * MOB-04 (App, expand): web push abonelikleri koleksiyonu ve indeksleri (ADR-0029 Karar 4 web push kanali).
 *  - `PushSubscriptions`: UNIQUE uniq_endpointHash {endpointHash} (ayni tarayici = tek kayit; abone ol = upsert, E11000 yarisina karsi),
 *    tid_1_userId_1_createdAt_-1 (kullanicinin cihazlari + dagitici hedef sorgusu).
 * Kanonik beyan: `src/database/application/models/PushSubscription.ts` (tests/static/indexManifest.static.test.ts eslesmeyi korur;
 * sema `autoIndex:false`, bu dosya UYGULAMAdir). Yeni koleksiyon oldugundan unique indeks icin mukerrer on kontrolu GEREKMEZ (bos).
 * `WEBPUSH_VAPID_*` acilmadan ONCE bu goc `done` olmali (yoksa subscribePush koleksiyonu dolayli olusturur ve tekillik korumasiz kalir).
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalniz bu gocun indekslerini dusurur (koleksiyon/veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'pushSubscriptions', defaultCollection: 'PushSubscriptions',
        indexes: [
            { fields: { endpointHash: 1 }, options: { unique: true, name: 'uniq_endpointHash' } },
            { fields: { tid: 1, userId: 1, createdAt: -1 }, options: { name: 'tid_1_userId_1_createdAt_-1' } },
        ],
    },
];

module.exports = {
    id: '0020-push-subscriptions-app',
    scope: 'app',
    kind: 'index',
    description: 'MOB-04 (App): PushSubscriptions koleksiyonu (uniq_endpointHash, tid+userId+createdAt).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

'use strict';
/**
 * Google ile giris (App, expand): `Users.googleSub` icin seyrek (kismi) TEKIL indeks `uniq_googleSub`.
 * Kismi filtre `{ googleSub: { $type: 'string' } }`: alani olmayan (tum mevcut) kullanicilar indekse GIRMEZ, mukerrer on kontrolu GEREKMEZ.
 * Kanonik beyan: `src/database/application/models/User.ts` (tests/static/indexManifest.static.test.ts eslesmeyi korur).
 * Google ile giris/kayit kodu bu indeks OLMADAN da calisir (baglama sirasinda E11000 yakalanir) ama sub tekilligi yalniz bu goc ile saglanir.
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalniz bu gocun indeksini dusurur (veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'users', defaultCollection: 'Users',
        indexes: [
            { fields: { googleSub: 1 }, options: { unique: true, name: 'uniq_googleSub', partialFilterExpression: { googleSub: { $type: 'string' } } } },
        ],
    },
];

module.exports = {
    id: '0025-users-google-sub-app',
    scope: 'app',
    kind: 'index',
    description: 'Google ile giris (App): Users.googleSub kismi tekil indeksi (uniq_googleSub).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

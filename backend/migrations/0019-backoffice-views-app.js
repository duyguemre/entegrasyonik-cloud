'use strict';
/**
 * BE-05 / K51 (App, expand): backoffice kayitli gorunumler koleksiyonu ve indeksleri.
 *  - `BackofficeViews`: UNIQUE uniq_sub_screen_name {sub, screen, name} (kaydet = upsert, E11000 yarisa karsi), sub_1_updatedAt_-1 (yonetici listesi).
 * Kanonik beyan: `src/database/application/models/BackofficeView.ts` (tests/static/indexManifest.static.test.ts eslesmeyi korur; sema `autoIndex:false`,
 * bu dosya UYGULAMAdir). Yeni koleksiyon oldugundan unique indeks icin mukerrer on kontrolu GEREKMEZ (bos).
 * `BackofficePrefsService` kullanilmadan ONCE bu goc `done` olmali (yoksa saveView koleksiyonu/indeksi dolayli olusturabilir ve tekillik korumasiz kalir).
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalniz bu gocun indekslerini dusurur (koleksiyon/veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'backofficeViews', defaultCollection: 'BackofficeViews',
        indexes: [
            { fields: { sub: 1, screen: 1, name: 1 }, options: { unique: true, name: 'uniq_sub_screen_name' } },
            { fields: { sub: 1, updatedAt: -1 }, options: { name: 'sub_1_updatedAt_-1' } },
        ],
    },
];

module.exports = {
    id: '0019-backoffice-views-app',
    scope: 'app',
    kind: 'index',
    description: 'BE-05 (App): BackofficeViews koleksiyonu (uniq_sub_screen_name, sub+updatedAt).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

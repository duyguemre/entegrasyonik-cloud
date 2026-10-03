'use strict';
/**
 * [eslesme-fiyat WP2, PLAN §3.1] (App, expand): `PlatformCatalog` koleksiyonu + indeksler:
 *  - `uniq_integration_kind_cat_attr` : UNIQUE `{integrationCode, kind, platformCategoryId, platformAttributeId}` (liste basina tek belge).
 *  - `ttl_fetchedAt` : TTL 7 gun (`fetchedAt`); yenilenmeyen katalog kendiliginden duser (onbellek; kaynak pazaryeri).
 * Kanonik beyan: `src/database/application/models/PlatformCatalog.ts` (`autoIndex:false`; bu dosya UYGULAMAdir). Yeni koleksiyon -> mukerrer
 * on kontrolu GEREKMEZ. YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent.
 * down: yalniz bu gocun indekslerini dusurur (veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'platformCatalog', defaultCollection: 'PlatformCatalog',
        indexes: [
            { fields: { integrationCode: 1, kind: 1, platformCategoryId: 1, platformAttributeId: 1 }, options: { unique: true, name: 'uniq_integration_kind_cat_attr' } },
            { fields: { fetchedAt: 1 }, options: { expireAfterSeconds: 7 * 24 * 3600, name: 'ttl_fetchedAt' } },
        ],
    },
];

module.exports = {
    id: '0030-platform-catalog-app',
    scope: 'app',
    kind: 'index',
    description: 'eslesme-fiyat WP2 (App): PlatformCatalog uniq_integration_kind_cat_attr + ttl_fetchedAt (7 gun).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

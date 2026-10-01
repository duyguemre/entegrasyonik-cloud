'use strict';
/**
 * COM-04 (Tenant, expand): `CommissionOverrides` koleksiyonu + tekil indeks:
 *  - `uniq_integration_scope_category` : UNIQUE `{integrationCode, scope, platformCategoryId}` (kanal basina 1 varsayilan; kategori basina 1 override).
 * Kanonik beyan: `src/database/client/models/CommissionOverride.ts` (tests/static/indexManifest.static.test.ts eslesmeyi korur; sema
 * `autoIndex:false`, bu dosya UYGULAMAdir). Yeni koleksiyon oldugundan unique indeks icin mukerrer on kontrolu GEREKMEZ (bos).
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalniz bu gocun indeksini dusurur (koleksiyon/veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'commissionOverrides', defaultCollection: 'CommissionOverrides',
        indexes: [
            { fields: { integrationCode: 1, scope: 1, platformCategoryId: 1 }, options: { unique: true, name: 'uniq_integration_scope_category' } },
        ],
    },
];

module.exports = {
    id: '0016-commission-overrides-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'COM-04 (Tenant): CommissionOverrides koleksiyonu + uniq_integration_scope_category (tekil {integrationCode, scope, platformCategoryId}).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};

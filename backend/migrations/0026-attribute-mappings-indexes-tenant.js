'use strict';
/**
 * [eslesme-fiyat WP2, Ek A P2-13] (Tenant, expand): `AttributeMappings` icin `(integrationCode, platformCategoryId)` indeksi
 * `integration_platformCategory` + bayat kayitlar icin kismi `integration_staleDetectedAt`. Tekil DEGIL (bir platform kategorisi N yerel kategoriye eslenebilir) -> mukerrer on kontrolu GEREKMEZ.
 * Yeni alanlar (allowCustom, isMultiple, updatedBy, source, stale) icin veri gocu GEREKMEZ: eski kayitta alan yok = varsayilan.
 * Kanonik beyan: `src/database/client/models/AttributeMapping.ts` (tests/static/indexManifest.static.test.ts eslesmeyi korur).
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalniz bu gocun indeksini dusurur (veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'attributeMappings', defaultCollection: 'AttributeMappings',
        indexes: [
            { fields: { integrationCode: 1, platformCategoryId: 1 }, options: { name: 'integration_platformCategory' } },
            { fields: { integrationCode: 1, 'stale.detectedAt': 1 }, options: { name: 'integration_staleDetectedAt', partialFilterExpression: { 'stale.detectedAt': { $exists: true } } } },
        ],
    },
];

module.exports = {
    id: '0026-attribute-mappings-indexes-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'eslesme-fiyat WP2 (Tenant): AttributeMappings integration_platformCategory + kismi integration_staleDetectedAt indeksleri.',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

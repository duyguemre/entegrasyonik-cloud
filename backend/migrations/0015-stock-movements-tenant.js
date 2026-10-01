'use strict';
/**
 * Faz-3 / ADR-0021 D14 (Tenant, expand): `StockMovements` (ekleme-yalnız stok hareket defteri) koleksiyonu + indeksler:
 *  - `variantId_1_at_-1`      : stok hareket raporu `{variantId}` sort `at` (DATA_MODEL_CONVENTIONS §12)
 *  - `uniq_refkey_reason`     : UNIQUE `{ref.key, reason}` (idempotency; yalnız `ref.key` dizgesi olan satırlar, partial)
 *  - `ttl_purge_at`           : TTL `purgeAt` (expireAfterSeconds:0; saklama 730 g yazıcıdan `purgeAt` ile hesaplanır, §10)
 * Kanonik beyan: `src/database/client/models/StockMovement.ts` (tests/static/indexManifest.static.test.ts eşleşmeyi korur; şema
 * `autoIndex:false`, bu dosya UYGULAMAdır). Yeni koleksiyon olduğundan unique indeks için mükerrer ön kontrolü GEREKMEZ (boş).
 * YALNIZ onaylı göçte çalışır (CLAUDE.md kural 3 yedek; önce yerel, Atlas ayrı onay). ÇALIŞTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalnız bu göçün üç indeksini düşürür (koleksiyon/veri silinmez).
 * Not: düşük stok sorgusu (`stock - reserved <= eşik`) hesaplanan alan üzerindedir; `{stock:1}` indeksi ona yardım etmez, bu yüzden
 * Variants için ek indeks göçü YAZILMADI.
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'stockMovements', defaultCollection: 'StockMovements',
        indexes: [
            { fields: { variantId: 1, at: -1 }, options: { name: 'variantId_1_at_-1' } },
            { fields: { 'ref.key': 1, reason: 1 }, options: { unique: true, name: 'uniq_refkey_reason', partialFilterExpression: { 'ref.key': { $type: 'string' } } } },
            { fields: { purgeAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_purge_at' } },
        ],
    },
];

module.exports = {
    id: '0015-stock-movements-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'Faz-3 (Tenant): StockMovements koleksiyonu + variantId_1_at_-1, uniq_refkey_reason (partial unique), ttl_purge_at (730 g purgeAt).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu sınıflandırır; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};

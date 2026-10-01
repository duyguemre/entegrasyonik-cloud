'use strict';
/**
 * PRC-R0 + PRC-R1 (Tenant, expand) — rekabet/maliyet indeksleri. VERİ DÖNÜŞTÜRMEZ (yalnız indeks):
 *  - Variants.`costPrice_number`             : kısmi `{costPrice:1}` (yalnız sayı) — maliyet kapsamı sayımı (PRC-R0). Yeni alan isteğe
 *                                              bağlıdır; mevcut belgelerin `costPrice`'ı yoktur (= "maliyet girilmemiş"), geriye uyumludur.
 *  - Variants.`competition_trendyol_status`  : kısmi `{'competition.trendyol.status':1}` — ürün listesi buybox filtresi (PRC-R1).
 *  - BuyboxSnapshots.`integ_barcode_observedAt` : 30 günlük geçmiş grafiği.
 *  - BuyboxSnapshots.`ttl_observedAt_90d`    : TTL 90 gün (saklama; COMPETITION_PRICING E18/E13).
 * Kanonik beyan: `src/database/client/models/Variant.ts` + `models/BuyboxSnapshot.ts` (tests/static/indexManifest.static.test.ts eşleşmeyi korur).
 * YALNIZ onaylı göçte çalışır (CLAUDE.md kural 3: önce doğrulanmış yedek; önce yerel, Atlas ayrı onay). BULUTTA ÇALIŞTIRILMADI.
 * Idempotent (ikinci up no-op). down: yalnız bu göçün indekslerini düşürür (koleksiyon/veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'variants', defaultCollection: 'Variants',
        indexes: [
            { fields: { costPrice: 1 }, options: { name: 'costPrice_number', partialFilterExpression: { costPrice: { $type: 'number' } } } },
            { fields: { 'competition.trendyol.status': 1 }, options: { name: 'competition_trendyol_status', partialFilterExpression: { 'competition.trendyol.status': { $exists: true } } } },
        ],
    },
    {
        key: 'buyboxSnapshots', defaultCollection: 'BuyboxSnapshots',
        indexes: [
            { fields: { integrationCode: 1, barcode: 1, observedAt: -1 }, options: { name: 'integ_barcode_observedAt' } },
            { fields: { observedAt: 1 }, options: { name: 'ttl_observedAt_90d', expireAfterSeconds: 90 * 24 * 3600 } },
        ],
    },
];

module.exports = {
    id: '0021-pricing-competition-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'PRC-R0/R1 (Tenant): Variants costPrice_number + competition_trendyol_status (kısmi), BuyboxSnapshots geçmiş + TTL 90 g.',
    batchSize: 500,
    throttleMs: 50,
    TARGETS,

    /** SALT-OKUMA: indeks durumunu sınıflandırır; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};

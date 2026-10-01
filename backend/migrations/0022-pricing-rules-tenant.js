'use strict';
/**
 * PRC-R2 (Tenant, expand) — rekabet fiyat kuralı / öneri / fiyat geçmişi indeksleri. VERİ DÖNÜŞTÜRMEZ (yalnız indeks; koleksiyonlar yeni):
 *  - PriceRules.`type_integ_enabled`              : etkin kuralların okunması (öneri üretimi).
 *  - PriceSuggestions.`ruleId_variantId_current`  : (kural, varyant) başına TEK güncel kayıt (unique, kısmi `current:true`).
 *  - PriceSuggestions.`status_updatedAt`          : öneri listesi (durum + yenilik).
 *  - PriceSuggestions.`ttl_createdAt_90d`         : TTL 90 gün.
 *  - PriceHistory.`integ_variant_at`              : sıklık/soğuma/salınım (K12), artış sınırı (K8), son 10 gün en düşük (K10).
 *  - PriceHistory.`ttl_at_90d`                    : TTL 90 gün (yasal pencere 10 gün; ≥30 gün tutulur, K10).
 * PricingSettings tek belgedir (`_id`), ek indeks yok.
 * Kanonik beyan: `src/database/client/models/PriceRule.ts`, `PriceSuggestion.ts`, `PriceHistory.ts` (tests/static/indexManifest.static.test.ts eşleşmeyi korur).
 * YALNIZ onaylı göçte çalışır (CLAUDE.md kural 3: önce doğrulanmış yedek; önce yerel, Atlas ayrı onay). BULUTTA ÇALIŞTIRILMADI.
 * Idempotent (ikinci up no-op). down: yalnız bu göçün indekslerini düşürür (koleksiyon/veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'priceRules', defaultCollection: 'PriceRules',
        indexes: [
            { fields: { type: 1, integrationCode: 1, enabled: 1 }, options: { name: 'type_integ_enabled' } },
        ],
    },
    {
        key: 'priceSuggestions', defaultCollection: 'PriceSuggestions',
        indexes: [
            { fields: { ruleId: 1, variantId: 1 }, options: { name: 'ruleId_variantId_current', unique: true, partialFilterExpression: { current: true } } },
            { fields: { status: 1, updatedAt: -1 }, options: { name: 'status_updatedAt' } },
            { fields: { createdAt: 1 }, options: { name: 'ttl_createdAt_90d', expireAfterSeconds: 90 * 24 * 3600 } },
        ],
    },
    {
        key: 'priceHistory', defaultCollection: 'PriceHistory',
        indexes: [
            { fields: { integrationCode: 1, variantId: 1, at: -1 }, options: { name: 'integ_variant_at' } },
            { fields: { at: 1 }, options: { name: 'ttl_at_90d', expireAfterSeconds: 90 * 24 * 3600 } },
        ],
    },
];

module.exports = {
    id: '0022-pricing-rules-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'PRC-R2 (Tenant): PriceRules etkin kural, PriceSuggestions güncel kayıt (unique kısmi) + liste + TTL 90 g, PriceHistory varyant/zaman + TTL 90 g.',
    batchSize: 500,
    throttleMs: 50,
    TARGETS,

    /** SALT-OKUMA: indeks durumunu sınıflandırır; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};

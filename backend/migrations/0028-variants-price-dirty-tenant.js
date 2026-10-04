'use strict';
/**
 * [eslesme-fiyat WP5, PLAN §3.4/§4] (Tenant, expand) — otomatik fiyat yayını (K-B) tarama indeksi. VERİ DÖNÜŞTÜRMEZ (yalnız indeks):
 *  - Variants.`priceDirty_true` : `{priceDirty:1}` kısmi `{priceDirty:true}` — `PricePublishTrigger` (60 sn × tenant) yalnız kirli
 *    belgeleri tarar (stoktaki 0008 `stockDirty_true` ile AYNI desen). Kanal başına ayrıntı `pricePending.<kod>`'da (indekssiz).
 *    PLAN taslağındaki `pricePending $exists` yerine tek bayrak: kanal kodu temizlendiğinde boş `{}` nesnesi `$exists`'i bozuyordu.
 *  - `platforms.*.observed.at` için indeks YOK (sorgu nadir; PLAN §4).
 * Kanonik beyan: `src/database/client/models/Variant.ts` (tests/static/indexManifest.static.test.ts eşleşmeyi korur).
 * YALNIZ onaylı göçte çalışır (CLAUDE.md kural 3: önce doğrulanmış yedek; önce yerel, Atlas ayrı onay). BULUTTA ÇALIŞTIRILMADI.
 * Idempotent (ikinci up no-op). down: yalnız bu indeksi düşürür.
 */
const { planTargets, upTargets, downTargets, assertCtxDbAllowed } = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'variants', defaultCollection: 'Variants',
        indexes: [
            { fields: { priceDirty: 1 }, options: { name: 'priceDirty_true', partialFilterExpression: { priceDirty: true } } },
        ],
    },
];

module.exports = {
    id: '0028-variants-price-dirty-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'eslesme-fiyat WP5 (Tenant): Variants priceDirty_true kısmi indeksi (otomatik fiyat yayını taraması).',
    batchSize: 500,
    throttleMs: 50,
    TARGETS,

    /** SALT-OKUMA: indeks durumunu sınıflandırır; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};

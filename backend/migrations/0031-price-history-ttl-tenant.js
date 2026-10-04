'use strict';
/**
 * [eslesme-fiyat WP5, PLAN §3.4/§4] (Tenant) — PriceHistory saklama süresi 90 g → 400 g. VERİ DÖNÜŞTÜRMEZ:
 *  - PriceHistory.`ttl_at_90d` : `{at:1}` TTL süresi `collMod` ile 34.560.000 sn (400 gün). Ad TARİHSELDİR (collMod adı değiştiremez;
 *    yeniden kurmak tüm koleksiyonu yeniden indeksler). Gerekçe: K10 "son 30 gün en düşük fiyat" + yıllık indirim kanıtı; kaynak
 *    genişledi (manual/bulk/import/rule_channel; Ek B P1-4).
 * Boyut tahmini (plan raporu): tenant başına günlük kayıt × 400. Örnek: 5.000 varyant × 3 kanal × günde 0,2 değişiklik ≈ 3.000 kayıt/gün
 *   → ≈1,2 M belge × ~200 B ≈ 240 MB/tenant üst sınır (çoğu tenant için çok daha az). `plan` mevcut belge sayısını ve son 30 günü raporlar.
 * Önkoşul: 0022 (indeks var olmalı). İndeks yoksa `up` onu 400 g ile KURAR (0022 koşulmamış ortam).
 * Kanonik beyan: `src/database/client/models/PriceHistory.ts` (PRICE_HISTORY_TTL_SECONDS).
 * YALNIZ onaylı göçte çalışır (CLAUDE.md kural 3). BULUTTA ÇALIŞTIRILMADI. Idempotent. down: süreyi 90 güne döndürür (indeks düşürülmez;
 * 90 günden eski kayıtlar down sonrası ~60 sn içinde SİLİNİR — veri etkisi, yedek şart).
 */
const { assertCtxDbAllowed, collectionFor, listIndexes, classify, ensureIndex } = require('../dev-tools/_migrationIndexes');

const KEY = 'priceHistory';
const COLL = 'PriceHistory';
const NAME = 'ttl_at_90d';
const DAY_S = 24 * 60 * 60;
const TARGET_DAYS = 400;
const PREVIOUS_DAYS = 90;
const wanted = (days) => ({ fields: { at: 1 }, options: { name: NAME, expireAfterSeconds: days * DAY_S } });

module.exports = {
    id: '0031-price-history-ttl-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'eslesme-fiyat WP5 (Tenant): PriceHistory ttl_at_90d süresi 90 g → 400 g (collMod; ad tarihsel).',
    batchSize: 500,
    throttleMs: 50,
    TARGET_DAYS,

    /** SALT-OKUMA: eylem (collMod/create/noop) + belge sayıları. */
    async plan(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c } = collectionFor(ctx, KEY, COLL);
        const list = await listIndexes(c);
        let total = 0; let last30 = 0;
        if (list.length) {
            const since = new Date((ctx.now ? ctx.now() : new Date()).getTime() - 30 * DAY_S * 1000);
            total = await c.countDocuments({}, { maxTimeMS: 30000 });
            last30 = await c.countDocuments({ at: { $gte: since } }, { maxTimeMS: 30000 });
        }
        return { collections: [{ collection: name, retentionDays: TARGET_DAYS, indexes: [{ name: NAME, ...classify(list, wanted(TARGET_DAYS)) }], total, last30 }] };
    },

    async up(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c, db } = collectionFor(ctx, KEY, COLL);
        return { collections: [{ collection: name, retentionDays: TARGET_DAYS, indexes: [await ensureIndex(c, db, wanted(TARGET_DAYS))] }] };
    },

    async down(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c, db } = collectionFor(ctx, KEY, COLL);
        return { collections: [{ collection: name, retentionDays: PREVIOUS_DAYS, indexes: [await ensureIndex(c, db, wanted(PREVIOUS_DAYS))] }] };
    },
};

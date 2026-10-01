'use strict';
/**
 * DB-11 / DBR-04 (Tenant, expand): `Variants` kismi indeksi `stockDirty_true` = `{stockDirty:1}` +
 * `partialFilterExpression:{stockDirty:true}`. StockPublishTrigger her 30 sn `Variants.find({stockDirty:true})` calistirir
 * (indeks yokken tam koleksiyon taramasi); kismi indeks yalniz kirli belgeleri kapsar (boyut ~0, yazma maliyeti ihmal edilebilir).
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; Atlas icin Protokol 12). CALISTIRILMADI.
 * Indeksin kanonik beyani `src/database/client/models/Variant.ts` (ayni ad/tanim). Idempotent (ikinci up no-op); down = dropIndex.
 * Uyari: sorgu `stockDirty:true` esitligini icermelidir (kismi indeks yalniz o sorguya hizmet eder; StockPublishTrigger boyledir).
 */
const { planTargets, upTargets, downTargets } = require('../dev-tools/_migrationIndexes');

const TARGETS = [{
    key: 'variants',
    defaultCollection: 'Variants',
    indexes: [{ fields: { stockDirty: 1 }, options: { name: 'stockDirty_true', partialFilterExpression: { stockDirty: true } } }],
}];

module.exports = {
    id: '0008-variants-stockdirty-partial-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'DB-11 (Tenant): Variants kismi indeks stockDirty_true (partial {stockDirty:true}); salt ekleme, geri alinabilir.',
    batchSize: 500,
    throttleMs: 50,
    /** SALT-OKUMA: mevcut indeksleri listeler, koleksiyon/indeks yaratmaz. */
    async plan(ctx) { return planTargets(ctx, TARGETS); },
    async up(ctx) { return upTargets(ctx, TARGETS); },
    async down(ctx) { return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

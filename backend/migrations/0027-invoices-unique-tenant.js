'use strict';
/**
 * [eslesme-fiyat WP6, D-ORD-1 / Ek E F-P1-2(b)] (Tenant, expand): `Invoices` satis faturasi tekilligi
 * `uniq_integration_externalOrder_sales` UNIQUE `{integrationCode, externalOrderId, type}` -- KISMI: yalniz `type:'SALES'` ve
 * dolu `externalOrderId` (siparise bagli olmayan manuel faturalar ve kismi iadelerin birden cok RETURN faturasi kapsam disi).
 * Bugune dek tekillik yalniz `ettn` uzerindeydi; ayni siparis icin ikinci satis faturasi (farkli/uretilmis ETTN) yazilabiliyordu.
 * Kanonik beyan: `src/database/client/models/Invoice.ts` (tests/static/indexManifest.static.test.ts eslesmeyi korur).
 * plan(): indeks durumu + kapsamdaki MUKERRER grup sayisi (deger yok). up(): mukerrer varsa REDDEDER (insan karari: hangi
 * fatura kalir -- otomatik silme YOK). YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay).
 * CALISTIRILMADI. Idempotent (ikinci up no-op). down: yalniz bu gocun indeksini dusurur (veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed, collectionFor,
} = require('../dev-tools/_migrationIndexes');

const KEY = 'invoices';
const COLL = 'Invoices';
const PARTIAL = { type: 'SALES', externalOrderId: { $gt: '' } };
const TARGETS = [
    {
        key: KEY, defaultCollection: COLL,
        indexes: [
            { fields: { integrationCode: 1, externalOrderId: 1, type: 1 }, options: { unique: true, name: 'uniq_integration_externalOrder_sales', partialFilterExpression: PARTIAL } },
        ],
    },
];

async function countDuplicateGroups(ctx) {
    const { c } = collectionFor(ctx, KEY, COLL);
    const rows = await c.aggregate([
        { $match: PARTIAL },
        { $group: { _id: { i: '$integrationCode', o: '$externalOrderId', t: '$type' }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $count: 'groups' },
    ]).toArray();
    return rows.length ? rows[0].groups : 0;
}

module.exports = {
    id: '0027-invoices-unique-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'eslesme-fiyat WP6 (Tenant): Invoices uniq_integration_externalOrder_sales (kismi tekil {integrationCode, externalOrderId, type:SALES}); mukerrer varsa up reddeder.',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumu + mukerrer satis faturasi grup SAYISI (deger yok). */
    async plan(ctx) {
        assertCtxDbAllowed(ctx);
        const res = await planTargets(ctx, TARGETS);
        res.collections[0].duplicateSalesInvoiceGroups = await countDuplicateGroups(ctx);
        return res;
    },
    async up(ctx) {
        assertCtxDbAllowed(ctx);
        const dups = await countDuplicateGroups(ctx);
        if (dups > 0) {
            throw new Error(`[0027] Invoices: ${dups} mukerrer satis faturasi grubu var; once elle giderilmeli (hangi kaydin kalacagi insan karari). Indeks KURULMADI.`);
        }
        return upTargets(ctx, TARGETS);
    },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

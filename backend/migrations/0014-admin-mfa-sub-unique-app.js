'use strict';
/**
 * ADR-0026 (Asama 2-BE uygulama notu) / BACKOFFICE B12 (App, expand): `AdminMfa` koleksiyonu + `uniq_sub` UNIQUE {sub:1} indeksi.
 * `AdminMfa` (backoffice TOTP kaydi) `autoIndex:false`; `sub` tekilligi o zamana dek yalniz uygulama kosullariyla korunuyordu
 * (`setPending`/`activate`). Bu goc, esZamanli ilk kayit yarisini veritabani duzeyinde kapatir (ikinci `upsert` E11000 verir).
 * Kanonik beyan: `src/database/application/models/AdminMfa.ts` (`ADMIN_MFA_INDEXES`; tests/static/indexManifest.static.test.ts eslesmeyi korur).
 * Koleksiyon bugun fiilen bos/cok kucuk; yine de plan() mevcut yinelenen `sub` gruplarini SAYAR (deger yok) -- yinelenme varsa up basarisiz olur
 * ve once elle giderilmelidir. YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI.
 * Idempotent (ikinci up no-op). down: yalniz `uniq_sub` indeksini dusurur (koleksiyon/veri silinmez).
 */
const { planTargets, upTargets, downTargets, assertCtxDbAllowed, collectionFor, listIndexes } = require('../dev-tools/_migrationIndexes');

const KEY = 'adminMfa';
const COLL = 'AdminMfa';
const TARGETS = [
    { key: KEY, defaultCollection: COLL, indexes: [{ fields: { sub: 1 }, options: { unique: true, name: 'uniq_sub' } }] },
];

module.exports = {
    id: '0014-admin-mfa-sub-unique-app',
    scope: 'app',
    kind: 'index',
    description: 'ADR-0026 / B12 (App): AdminMfa koleksiyonu + uniq_sub UNIQUE {sub:1} indeksi (expand, geri alinabilir).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumu + yinelenen `sub` grubu SAYISI (deger yok). */
    async plan(ctx) {
        const res = await planTargets(ctx, TARGETS);
        assertCtxDbAllowed(ctx);
        const { c } = collectionFor(ctx, KEY, COLL);
        const exists = (await listIndexes(c)).length > 0;
        const dups = exists
            ? await c.aggregate([{ $group: { _id: '$sub', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: 'groups' }]).toArray()
            : [];
        res.collections[0].duplicateSubGroups = dups.length ? dups[0].groups : 0;
        return res;
    },
    async up(ctx) { return upTargets(ctx, TARGETS); },
    async down(ctx) { return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

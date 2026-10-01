'use strict';
/**
 * DB-15 / ADR-0021 D10 (App, expand, ikinci sira): ADR-0003 asama 3a UNIQUE indeksleri canlida yok (yedekte `Clients` ve `Users` yalniz `_id_`).
 *  Clients: uniq_order {order}, uniq_clientId {clientId}, uniq_dbConfig_dbname {dbConfig.dbname} (kismi: yalniz string).
 *  Users:   uniq_email {email} (kismi: yalniz string).
 * Mukerrer veri varken UNIQUE kurulamaz: `plan` her anahtar icin mukerrer GRUP SAYISINI raporlar (deger yazdirmaz); `up` sayi > 0 ise
 * HICBIR indeks kurmadan reddeder (ayni kontrol `dev-tools/precheck-tenant-duplicates.js`). Kanonik beyan: `application/models/{Client,User}.ts`.
 * YALNIZ onayli gocte calisir (kural 3; once yerel, Atlas ayri onay -- D10 canli partide ILK). CALISTIRILMADI. Idempotent. down = dropIndex.
 * NOT: `Users {clientId:1}` (D9) ayri goc 0001'dedir; bu goc onu ELLEMEZ.
 */
const {
    assertCtxDbAllowed, collectionFor, listIndexes, classify, ensureIndex, dropIndexIfExists,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'clients', defaultCollection: 'Clients',
        indexes: [
            { fields: { order: 1 }, options: { unique: true, name: 'uniq_order' } },
            { fields: { clientId: 1 }, options: { unique: true, name: 'uniq_clientId' } },
            { fields: { 'dbConfig.dbname': 1 }, options: { unique: true, name: 'uniq_dbConfig_dbname', partialFilterExpression: { 'dbConfig.dbname': { $type: 'string' } } } },
        ],
    },
    {
        key: 'users', defaultCollection: 'Users',
        indexes: [{ fields: { email: 1 }, options: { unique: true, name: 'uniq_email', partialFilterExpression: { email: { $type: 'string' } } } }],
    },
];

/** Mukerrer grup sayisi (yalniz SAYI). Kismi indeksler icin yalniz string degerler; digerlerinde eksik/null da mukerrer sayilir (unique null'i esler). */
async function duplicateGroups(c, field, partialString) {
    const pipeline = [
        ...(partialString ? [{ $match: { [field]: { $type: 'string' } } }] : []),
        { $group: { _id: '$' + field, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $count: 'groups' },
    ];
    const r = await c.aggregate(pipeline, { allowDiskUse: true, maxTimeMS: 30000 }).toArray();
    return r.length ? r[0].groups : 0;
}

async function precheck(ctx) {
    const out = {};
    for (const t of TARGETS) {
        const { c } = collectionFor(ctx, t.key, t.defaultCollection);
        for (const w of t.indexes) {
            const field = Object.keys(w.fields)[0];
            out[t.defaultCollection + '.' + field] = await duplicateGroups(c, field, !!w.options.partialFilterExpression);
        }
    }
    return out;
}

module.exports = {
    id: '0011-d10-clients-users-unique-app',
    scope: 'app',
    kind: 'index',
    description: 'DB-15 / D10 (App): Clients uniq_order/uniq_clientId/uniq_dbConfig_dbname + Users uniq_email UNIQUE indeksleri (precheck temizse; geri alinabilir).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks eylemleri + mukerrer grup sayilari (`duplicateGroups`; deger yok). */
    async plan(ctx) {
        assertCtxDbAllowed(ctx);
        const dup = await precheck(ctx);
        const collections = [];
        for (const t of TARGETS) {
            const { name, c } = collectionFor(ctx, t.key, t.defaultCollection);
            const list = await listIndexes(c);
            collections.push({ collection: name, indexes: t.indexes.map((w) => ({ name: w.options.name, ...classify(list, w) })) });
        }
        return { collections, duplicateGroups: dup, precheckClean: Object.values(dup).every((n) => n === 0) };
    },

    async up(ctx) {
        assertCtxDbAllowed(ctx);
        const dup = await precheck(ctx);
        const dirty = Object.entries(dup).filter(([, n]) => n > 0);
        if (dirty.length) {
            throw new Error('[migration] precheck TEMIZ DEGIL, hicbir indeks kurulmadi: ' + dirty.map(([k, n]) => k + '=' + n).join(', ') + ' mukerrer grup.');
        }
        const collections = [];
        for (const t of TARGETS) {
            const { name, c, db } = collectionFor(ctx, t.key, t.defaultCollection);
            const indexes = [];
            for (const w of t.indexes) indexes.push(await ensureIndex(c, db, w));
            collections.push({ collection: name, indexes });
        }
        return { collections };
    },

    async down(ctx) {
        assertCtxDbAllowed(ctx);
        const collections = [];
        for (const t of TARGETS) {
            const { name, c } = collectionFor(ctx, t.key, t.defaultCollection);
            const indexes = [];
            for (const w of t.indexes) indexes.push(await dropIndexIfExists(c, w.options.name));
            collections.push({ collection: name, indexes });
        }
        return { collections };
    },
};
module.exports.TARGETS = TARGETS;

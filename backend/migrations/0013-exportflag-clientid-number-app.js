'use strict';
/**
 * DB-14 / ADR-0021 D12 (App, kucuk tip donusumu): `ExportFlag.clientId` String -> Number (tenant anahtari `Clients.order` ile ayni tip).
 * Sema (`application/models/Export.ts`) Number'a cevrildi ve `index:true` (gereksiz `clientId_1`, {clientId,integrationCode} unique'inin oneki) kaldirildi;
 * sorgulardaki `String(order)` degerleri Mongoose ile Number'a cast edilir. Bu goc MEVCUT string belgeleri (yedekte 4) Number'a cevirir ve `clientId_1`'i dusurur.
 *  - up: yalniz `/^\d+$/` string degerler cevrilir; ayni {clientId, integrationCode} icin Number ikiz ZATEN varsa o belge ATLANIR ve raporlanir
 *    (unique cakismasi; bayraklar turetilmis durumdur -- Dispatcher sayaci yeniden esitler; elle karar); sayisal olmayan string ATLANIR ve raporlanir.
 *    Sonra `clientId_1` dusurulur. Idempotent (ikinci up: cevrilecek belge yok, indeks yok).
 *  - down: Number belgeleri String'e geri cevirir (ikiz String varsa atlanir) ve `clientId_1` indeksini geri kurar.
 * Kod ve goc BIRLIKTE yayinlanmali: goc sonrasi eski (String yazan) kod calisirsa Mongoose olmayan tipte yazim yapmaz; goc oncesi yeni kod
 * String belgeleri Number'a cast eden sorgularla ESLEMEZ. Sira: goc, sonra yeni kod (ya da ayni pencere; Dispatcher kisa sure duraklatilir).
 * YALNIZ onayli gocte calisir (kural 3; once yerel, Atlas ayri onay). CALISTIRILMADI. Belge yalniz `clientId` alani degisir.
 */
const {
    assertCtxDbAllowed, collectionFor, listIndexes, ensureIndex, dropIndexIfExists,
} = require('../dev-tools/_migrationIndexes');

const KEY = 'exportFlag';
const COLL = 'ExportFlag';
const LEGACY_INDEX = { fields: { clientId: 1 }, options: { name: 'clientId_1' } };
const NUMERIC = /^\d+$/;

async function scan(c, fromType) {
    const docs = await c.find({ clientId: { $type: fromType } }, { projection: { clientId: 1, integrationCode: 1 } }).toArray();
    const out = { convertible: [], nonNumeric: 0, collisions: 0 };
    const seen = new Set(); // ayni hedefe cevrilecek iki belge (ornek '5' ve '05') de cakisma sayilir
    for (const d of docs) {
        let to;
        if (fromType === 'string') {
            if (!NUMERIC.test(d.clientId)) { out.nonNumeric++; continue; }
            to = Number(d.clientId);
        } else {
            to = String(d.clientId);
        }
        const twin = await c.countDocuments({ clientId: to, integrationCode: d.integrationCode, _id: { $ne: d._id } }, { limit: 1 });
        const sig = JSON.stringify([to, d.integrationCode]);
        if (twin > 0 || seen.has(sig)) { out.collisions++; continue; }
        seen.add(sig);
        out.convertible.push({ _id: d._id, from: d.clientId, to });
    }
    return out;
}

async function convert(c, fromType) {
    const s = await scan(c, fromType);
    let converted = 0;
    for (const d of s.convertible) {
        const r = await c.updateOne({ _id: d._id, clientId: d.from }, { $set: { clientId: d.to } });
        converted += r.modifiedCount;
    }
    return { converted, skippedNonNumeric: s.nonNumeric, skippedCollisions: s.collisions };
}

module.exports = {
    id: '0013-exportflag-clientid-number-app',
    scope: 'app',
    kind: 'migrate',
    description: 'DB-14 / D12 (App): ExportFlag.clientId String -> Number (kosullu updateOne) + gereksiz clientId_1 indeksi dusurulur; down tam geri alir.',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: donusturulecek/atlanacak belge SAYILARI (deger yok). */
    async plan(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c } = collectionFor(ctx, KEY, COLL);
        const list = await listIndexes(c);
        if (!list.length) return { collections: [{ collection: name, stringDocs: 0, toConvert: 0, skippedNonNumeric: 0, skippedCollisions: 0, indexClientId_1: 'absent' }] };
        const s = await scan(c, 'string');
        const stringDocs = await c.countDocuments({ clientId: { $type: 'string' } });
        const numberDocs = await c.countDocuments({ clientId: { $type: 'number' } });
        return {
            collections: [{
                collection: name,
                stringDocs, numberDocs, toConvert: s.convertible.length, skippedNonNumeric: s.nonNumeric, skippedCollisions: s.collisions,
                indexClientId_1: list.some((i) => i.name === LEGACY_INDEX.options.name) ? 'drop' : 'absent',
            }],
        };
    },

    async up(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c } = collectionFor(ctx, KEY, COLL);
        const list = await listIndexes(c);
        if (!list.length) return { collections: [{ collection: name, converted: 0, skippedNonNumeric: 0, skippedCollisions: 0, indexClientId_1: 'absent' }] };
        const res = await convert(c, 'string');
        const idx = await dropIndexIfExists(c, LEGACY_INDEX.options.name);
        return { collections: [{ collection: name, ...res, indexClientId_1: idx.action }] };
    },

    async down(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c, db } = collectionFor(ctx, KEY, COLL);
        const list = await listIndexes(c);
        if (!list.length) return { collections: [{ collection: name, converted: 0, skippedNonNumeric: 0, skippedCollisions: 0, indexClientId_1: 'absent' }] };
        const res = await convert(c, 'number');
        const idx = await ensureIndex(c, db, LEGACY_INDEX);
        return { collections: [{ collection: name, ...res, indexClientId_1: idx.action }] };
    },
};

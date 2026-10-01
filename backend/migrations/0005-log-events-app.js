'use strict';
/**
 * ADR-0026 WP-LOG L1 (App, expand): `LogEvents` koleksiyonu + TTL ve sorgu indeksleri. YALNIZ onaylı göçte çalışır
 * (kural 3 yedek; `dev-tools/migrate.js` çerçevesi; Atlas için Protokol 12). ÇALIŞTIRILMADI. Şema dosyası
 * (`models/LogEvent.ts`) indeks BEYANIdır ve `autoIndex:false`'dur; bu dosya UYGULAMAdır (0003 ile aynı self-contained desen;
 * autoIndex:false ZORUNLU -- plan() bile üretim koleksiyonuna sessizce indeks yazmasın).
 * Saklama: `expAt` TTL (expireAfterSeconds:0); yazıcı warn+ için ts+14 gün, info/debug için ts+3 gün yazar.
 * down: yalnız bu göçün indekslerini düşürür (koleksiyon/veri silinmez).
 */
const mongoose = require('mongoose');

const TARGETS = {
    logEvents: {
        defaultCollection: 'LogEvents',
        indexes: [
            { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'expAt_1' } },
            { fields: { ts: -1 }, options: { name: 'ts_-1' } },
            { fields: { fingerprint: 1, ts: -1 }, options: { name: 'fingerprint_1_ts_-1' } },
            { fields: { source: 1, level: 1, ts: -1 }, options: { name: 'source_1_level_1_ts_-1' } },
            { fields: { correlationId: 1 }, options: { sparse: true, name: 'correlationId_1' } },
            { fields: { tenantId: 1, ts: -1 }, options: { sparse: true, name: 'tenantId_1_ts_-1' } },
        ],
    },
};

function resolveModel(ctx, key) {
    const target = TARGETS[key];
    const collectionName = (ctx.collectionOverrides && ctx.collectionOverrides[key]) || target.defaultCollection;
    const modelName = `LogEv__${key}__${collectionName}`;
    if (ctx.connection.models[modelName]) return { model: ctx.connection.models[modelName], collectionName, indexes: target.indexes };
    const schema = new mongoose.Schema({}, { collection: collectionName, versionKey: false, strict: false, autoIndex: false });
    for (const i of target.indexes) schema.index(i.fields, i.options);
    return { model: ctx.connection.model(modelName, schema, collectionName), collectionName, indexes: target.indexes };
}

async function planOne(ctx, key) {
    const { model, collectionName } = resolveModel(ctx, key);
    await model.createCollection().catch(() => undefined);
    const diff = await model.diffIndexes({ indexOptionsToCreate: true });
    return { collection: collectionName, toCreate: diff.toCreate.map(([, o]) => (o && o.name) || 'ad-yok'), toDrop: diff.toDrop };
}

async function upOne(ctx, key) {
    const { model, collectionName, indexes } = resolveModel(ctx, key);
    await model.createCollection().catch(() => undefined);
    const created = [];
    for (const i of indexes) { await model.collection.createIndex(i.fields, i.options); created.push(i.options.name); }
    return { collection: collectionName, created };
}

async function downOne(ctx, key) {
    const { model, collectionName, indexes } = resolveModel(ctx, key);
    const dropped = [];
    for (const i of indexes) { await model.collection.dropIndex(i.options.name).catch(() => undefined); dropped.push(i.options.name); }
    return { collection: collectionName, dropped };
}

module.exports = {
    id: '0005-log-events-app',
    scope: 'app',
    kind: 'index',
    description: 'ADR-0026 WP-LOG L1 (App): LogEvents koleksiyonu + TTL(expAt) ve sorgu indeksleri (expand, geri alınabilir).',
    batchSize: 500,
    throttleMs: 50,
    async plan(ctx) { return { collections: [await planOne(ctx, 'logEvents')] }; },
    async up(ctx) { return { collections: [await upOne(ctx, 'logEvents')] }; },
    async down(ctx) { return { collections: [await downOne(ctx, 'logEvents')] }; },
};

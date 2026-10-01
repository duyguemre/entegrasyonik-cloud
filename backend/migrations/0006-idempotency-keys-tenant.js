'use strict';
/**
 * ADR-0030 X3 (Tenant, expand): `IdempotencyKeys` koleksiyonu + benzersiz {userId,operation,key} ve TTL(expAt, 24 sa yazıcıdan) indeksleri.
 * YALNIZ onaylı göçte çalışır (kural 3 yedek; Atlas için Protokol 12). ÇALIŞTIRILMADI. Şema (`client/models/IdempotencyKey.ts`)
 * indeks BEYANIdır ve `autoIndex:false`'dur; bu dosya UYGULAMAdır (0005 ile aynı self-contained desen).
 * down: yalnız bu göçün indekslerini düşürür (koleksiyon/veri silinmez).
 */
const mongoose = require('mongoose');

const TARGETS = {
    idempotencyKeys: {
        defaultCollection: 'IdempotencyKeys',
        indexes: [
            { fields: { userId: 1, operation: 1, key: 1 }, options: { unique: true, name: 'userId_1_operation_1_key_1' } },
            { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'expAt_1' } },
        ],
    },
};

function resolveModel(ctx, key) {
    const target = TARGETS[key];
    const collectionName = (ctx.collectionOverrides && ctx.collectionOverrides[key]) || target.defaultCollection;
    const modelName = `Idem__${key}__${collectionName}`;
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
    id: '0006-idempotency-keys-tenant',
    scope: 'tenant',
    kind: 'index',
    description: 'ADR-0030 X3 (Tenant): IdempotencyKeys koleksiyonu + benzersiz anahtar ve TTL(expAt) indeksleri (expand, geri alınabilir).',
    batchSize: 500,
    throttleMs: 50,
    async plan(ctx) { return { collections: [await planOne(ctx, 'idempotencyKeys')] }; },
    async up(ctx) { return { collections: [await upOne(ctx, 'idempotencyKeys')] }; },
    async down(ctx) { return { collections: [await downOne(ctx, 'idempotencyKeys')] }; },
};

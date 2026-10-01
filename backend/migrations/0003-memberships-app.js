'use strict';
/**
 * ADR-0028 E1 (App, expand): `Memberships` + `Invitations` koleksiyonları ve indeksleri. YALNIZ onaylı göçte çalışır
 * (kural 3 yedek; `dev-tools/migrate.js` çerçevesi). Şema dosyaları (`models/Membership.ts`, `models/Invitation.ts`) indeks
 * BEYANIdır ve `autoIndex:false`'dur; bu dosya UYGULAMAdır. Self-contained minimal şema deseni: 0001-d9-indexes-app.js
 * (autoIndex:false ZORUNLU — plan() bile üretim koleksiyonuna sessizce indeks yazmasın).
 * down: yalnız bu göçün indekslerini düşürür (koleksiyon/veri silinmez; veriyi silen adım 0004 down'dır).
 */
const mongoose = require('mongoose');

const TTL_AFTER_EXPIRY = 30 * 24 * 3600;
const TARGETS = {
    memberships: {
        defaultCollection: 'Memberships',
        indexes: [
            { fields: { userId: 1, tid: 1 }, options: { unique: true, name: 'uniq_user_tid' } },
            { fields: { tid: 1, status: 1 }, options: { name: 'tid_1_status_1' } },
            { fields: { tid: 1, role: 1 }, options: { name: 'tid_1_role_1' } },
        ],
    },
    invitations: {
        defaultCollection: 'Invitations',
        indexes: [
            { fields: { tokenHash: 1 }, options: { unique: true, name: 'uniq_token_hash' } },
            { fields: { tid: 1, email: 1 }, options: { unique: true, name: 'uniq_pending_tid_email', partialFilterExpression: { status: 'pending' } } },
            { fields: { expiresAt: 1 }, options: { expireAfterSeconds: TTL_AFTER_EXPIRY, name: 'ttl_expires_at' } },
        ],
    },
};

function resolveModel(ctx, key) {
    const target = TARGETS[key];
    const collectionName = (ctx.collectionOverrides && ctx.collectionOverrides[key]) || target.defaultCollection;
    const modelName = `Memb__${key}__${collectionName}`;
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
    id: '0003-memberships-app',
    scope: 'app',
    kind: 'index',
    description: 'ADR-0028 E1 (App): Memberships + Invitations koleksiyonları ve indeksleri (expand, geri alınabilir).',
    batchSize: 500,
    throttleMs: 50,
    async plan(ctx) { return { collections: [await planOne(ctx, 'memberships'), await planOne(ctx, 'invitations')] }; },
    async up(ctx) { return { collections: [await upOne(ctx, 'memberships'), await upOne(ctx, 'invitations')] }; },
    async down(ctx) { return { collections: [await downOne(ctx, 'memberships'), await downOne(ctx, 'invitations')] }; },
};

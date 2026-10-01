'use strict';
/**
 * RET-01 (App, expand): `ErrorEvents.lastSeen` TTL 30 gun -> 90 gun (7776000 sn). YALNIZ onayli gocte calisir
 * (kural 3 yedek; Atlas icin Protokol 12). CALISTIRILMADI. Mevcut `lastSeen_1` TTL indeksi (30 gun) varsa `collMod` ile
 * yerinde guncellenir (ayni ad + farkli secenek `createIndex`'i IndexOptionsConflict ile reddettigi icin drop/recreate GEREKMEZ,
 * TTL penceresinde bosluk olusmaz); yoksa 90 gunluk indeks olusturulur. Sema autoIndex'i degistirilmedi (L1 notu: bilincli).
 * down: TTL'i 30 gune geri alir (indeks/veri silinmez).
 */
const DEFAULT_COLLECTION = 'ErrorEvents';
const INDEX_NAME = 'lastSeen_1';
const TTL_NEW = 90 * 24 * 60 * 60; // 7776000
const TTL_OLD = 30 * 24 * 60 * 60; // 2592000

function coll(ctx) {
    const name = (ctx.collectionOverrides && ctx.collectionOverrides.errorEvents) || DEFAULT_COLLECTION;
    return { name, c: ctx.connection.db.collection(name), db: ctx.connection.db };
}

async function currentTtl(c) {
    const idx = await c.indexes().catch(() => []);
    const found = idx.find((i) => i.name === INDEX_NAME);
    return found ? { exists: true, ttl: found.expireAfterSeconds } : { exists: false, ttl: undefined };
}

async function setTtl(ctx, seconds) {
    const { name, c, db } = coll(ctx);
    await ctx.connection.createCollection(name).catch(() => undefined);
    const cur = await currentTtl(c);
    if (!cur.exists) { await c.createIndex({ lastSeen: 1 }, { name: INDEX_NAME, expireAfterSeconds: seconds }); return { collection: name, action: 'created', ttl: seconds }; }
    if (cur.ttl === seconds) return { collection: name, action: 'noop', ttl: seconds };
    await db.command({ collMod: name, index: { name: INDEX_NAME, expireAfterSeconds: seconds } });
    return { collection: name, action: 'collMod', from: cur.ttl, ttl: seconds };
}

module.exports = {
    id: '0007-error-events-ttl-90d-app',
    scope: 'app',
    kind: 'index',
    description: 'RET-01 (App): ErrorEvents lastSeen TTL 30 -> 90 gun (collMod, geri alinabilir).',
    batchSize: 500,
    throttleMs: 50,
    async plan(ctx) {
        const { name, c } = coll(ctx);
        const cur = await currentTtl(c);
        return { collections: [{ collection: name, current: cur.exists ? cur.ttl : null, target: TTL_NEW, action: !cur.exists ? 'create' : cur.ttl === TTL_NEW ? 'noop' : 'collMod' }] };
    },
    async up(ctx) { return { collections: [await setTtl(ctx, TTL_NEW)] }; },
    async down(ctx) { return { collections: [await setTtl(ctx, TTL_OLD)] }; },
};

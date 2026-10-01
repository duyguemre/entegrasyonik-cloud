'use strict';
/**
 * Faz4 DB göç partisi (0008-0013) için ORTAK, SAF indeks yardımcıları. DB'ye kendisi bağlanmaz: çağıran göç,
 * `ctx.connection.db` (ham sürücü `Db`) verir. `plan` yardımcıları SALT-OKUMA (`indexes()` yalnız listeler).
 *
 * NOT: Bu dosya göç dosyalarının checksum'una DAHİL DEĞİLDİR; uygulanmış göçlerin davranışını değiştirecek bir
 * düzenleme yapılmaz (yalnız ekleme). Göç dosyaları yine de kendi mantığını (ad/alan/seçenek) kendisi taşır.
 */
const { isAllowedDb } = require('./_migrationCommon');

/** ctx.dbname verilmişse izinli 7 DB'den biri olmalı (CLAUDE.md kural 2; runner zaten filtreler, bu ikinci kapı). */
function assertCtxDbAllowed(ctx) {
    if (ctx && ctx.dbname !== undefined && !isAllowedDb(ctx.dbname)) {
        throw new Error('[migration] DB izinli listede değil; işlem reddedildi.');
    }
}

function collectionFor(ctx, key, defaultName) {
    const name = (ctx.collectionOverrides && ctx.collectionOverrides[key]) || defaultName;
    return { name, c: ctx.connection.db.collection(name), db: ctx.connection.db };
}

const NS_MISSING = (e) => !!e && (e.codeName === 'NamespaceNotFound' || e.code === 26);
const IDX_MISSING = (e) => !!e && (e.codeName === 'IndexNotFound' || e.code === 27 || NS_MISSING(e));

/** Koleksiyon yoksa `[]` (plan salt-okuma kalır; koleksiyon YARATILMAZ). */
async function listIndexes(c) {
    try { return await c.indexes(); } catch (e) { if (NS_MISSING(e)) return []; throw e; }
}

const keyStr = (k) => JSON.stringify(Object.entries(k || {}));
const pfeStr = (p) => JSON.stringify(p || null);

/** İki indeks tanımı aynı mı (ad HARİÇ): anahtar + unique + partialFilterExpression + expireAfterSeconds. */
function sameSpec(existing, wanted) {
    return keyStr(existing.key) === keyStr(wanted.fields)
        && !!existing.unique === !!(wanted.options && wanted.options.unique)
        && pfeStr(existing.partialFilterExpression) === pfeStr(wanted.options && wanted.options.partialFilterExpression)
        && existing.expireAfterSeconds === (wanted.options ? wanted.options.expireAfterSeconds : undefined);
}

/**
 * İstenen adlı indeks için eylem (yazmaz): 'create' | 'noop' | 'noop-other-name' (aynı tanım başka adla var) |
 * 'conflict' (aynı ad, farklı tanım) | 'collMod' (yalnız TTL süresi farklı; aynı ad+anahtar+filtre).
 */
function classify(indexList, wanted) {
    const name = wanted.options.name;
    const byName = indexList.find((i) => i.name === name);
    if (byName) {
        if (sameSpec(byName, wanted)) return { action: 'noop' };
        const ttlOnly = wanted.options.expireAfterSeconds !== undefined && byName.expireAfterSeconds !== undefined
            && sameSpec({ ...byName, expireAfterSeconds: wanted.options.expireAfterSeconds }, wanted);
        if (ttlOnly) return { action: 'collMod', from: byName.expireAfterSeconds, to: wanted.options.expireAfterSeconds };
        return { action: 'conflict' };
    }
    const other = indexList.find((i) => i.name !== '_id_' && sameSpec(i, wanted));
    if (other) return { action: 'noop-other-name', existingName: other.name };
    return { action: 'create' };
}

/** Adlı indeksi idempotent kurar. `conflict` durumunda AÇIK hata (sessiz geçmez). */
async function ensureIndex(c, db, wanted) {
    const cur = classify(await listIndexes(c), wanted);
    if (cur.action === 'conflict') {
        throw new Error(`[migration] '${wanted.options.name}' adlı indeks farklı tanımla mevcut (elle inceleyin).`);
    }
    if (cur.action === 'collMod') {
        await db.command({ collMod: c.collectionName, index: { name: wanted.options.name, expireAfterSeconds: wanted.options.expireAfterSeconds } });
        return { name: wanted.options.name, action: 'collMod', from: cur.from, to: cur.to };
    }
    if (cur.action !== 'create') return { name: wanted.options.name, action: cur.action, existingName: cur.existingName };
    await c.createIndex(wanted.fields, wanted.options);
    return { name: wanted.options.name, action: 'created' };
}

/** Adlı indeksi idempotent düşürür (yoksa 'absent'). */
async function dropIndexIfExists(c, name) {
    try { await c.dropIndex(name); return { name, action: 'dropped' }; } catch (e) {
        if (IDX_MISSING(e)) return { name, action: 'absent' };
        throw e;
    }
}

/** targets: [{ key, defaultCollection, indexes:[{fields, options:{name,...}}] }] -> SALT-OKUMA plan raporu. */
async function planTargets(ctx, targets) {
    assertCtxDbAllowed(ctx);
    const collections = [];
    for (const t of targets) {
        const { name, c } = collectionFor(ctx, t.key, t.defaultCollection);
        const list = await listIndexes(c);
        collections.push({ collection: name, indexes: t.indexes.map((w) => ({ name: w.options.name, ...classify(list, w) })) });
    }
    return { collections };
}

async function upTargets(ctx, targets) {
    assertCtxDbAllowed(ctx);
    const collections = [];
    for (const t of targets) {
        const { name, c, db } = collectionFor(ctx, t.key, t.defaultCollection);
        const indexes = [];
        for (const w of t.indexes) indexes.push(await ensureIndex(c, db, w));
        collections.push({ collection: name, indexes });
    }
    return { collections };
}

async function downTargets(ctx, targets) {
    assertCtxDbAllowed(ctx);
    const collections = [];
    for (const t of targets) {
        const { name, c } = collectionFor(ctx, t.key, t.defaultCollection);
        const indexes = [];
        for (const w of t.indexes) indexes.push(await dropIndexIfExists(c, w.options.name));
        collections.push({ collection: name, indexes });
    }
    return { collections };
}

module.exports = { planTargets, upTargets, downTargets, assertCtxDbAllowed, collectionFor, listIndexes, sameSpec, classify, ensureIndex, dropIndexIfExists };

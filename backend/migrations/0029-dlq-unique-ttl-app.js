'use strict';
/**
 * [eslesme-fiyat WP7a, Ek D F-04 / PLAN §4] (App, expand): `DeadLetterQueue`
 *  - `uniq_originalJobId` : UNIQUE `{originalJobId}` — aynı iş DLQ'ya bir kez (önceden QueueEvents 'failed' her pod'da tetiklenip
 *    aynı işi pod sayısı kadar yazabiliyordu; kod artık Worker olayında + E11000'i yutar).
 *  - `ttl_createdAt` : TTL 30 gün (`createdAt`, timestamps). `failedAt_1` zaten var; aynı anahtara TTL seçeneği çakışacağı için
 *    TTL `createdAt` üzerindedir. DİKKAT: kurulduğunda 30 günden eski DLQ kayıtları SİLİNİR (süre insan onayı — PLAN §4 0029).
 * Kanonik beyan: `src/database/application/models/Common.ts` (tests/static/indexManifest.static.test.ts eşleşmeyi korur).
 * plan(): indeks durumu + yinelenen `originalJobId` grup SAYISI + 30 günden eski kayıt SAYISI (değer yok). up(): yinelenen varsa
 * REDDEDER (hangi kaydın kalacağı insan kararı; otomatik silme YOK). YALNIZ onaylı göçte çalışır (CLAUDE.md kural 3 yedek;
 * önce yerel, Atlas ayrı onay). ÇALIŞTIRILMADI. Idempotent. down: yalnız bu göçün indekslerini düşürür (veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed, collectionFor,
} = require('../dev-tools/_migrationIndexes');

const KEY = 'deadLetterQueue';
const COLL = 'DeadLetterQueue';
const TTL_SECONDS = 30 * 24 * 3600;
const TARGETS = [
    {
        key: KEY, defaultCollection: COLL,
        indexes: [
            { fields: { originalJobId: 1 }, options: { unique: true, name: 'uniq_originalJobId' } },
            { fields: { createdAt: 1 }, options: { expireAfterSeconds: TTL_SECONDS, name: 'ttl_createdAt' } },
        ],
    },
];

async function countDuplicateGroups(ctx) {
    const { c } = collectionFor(ctx, KEY, COLL);
    const rows = await c.aggregate([
        { $group: { _id: '$originalJobId', n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $count: 'groups' },
    ]).toArray();
    return rows.length ? rows[0].groups : 0;
}

async function countExpiring(ctx) {
    const { c } = collectionFor(ctx, KEY, COLL);
    return c.countDocuments({ createdAt: { $lt: new Date(Date.now() - TTL_SECONDS * 1000) } });
}

module.exports = {
    id: '0029-dlq-unique-ttl-app',
    scope: 'app',
    kind: 'index',
    description: 'eslesme-fiyat WP7a (App): DeadLetterQueue uniq_originalJobId + ttl_createdAt (30 gun); yinelenen varsa up reddeder.',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumu + yinelenen grup ve TTL ile silinecek kayıt SAYILARI (değer yok). */
    async plan(ctx) {
        assertCtxDbAllowed(ctx);
        const res = await planTargets(ctx, TARGETS);
        res.collections[0].duplicateOriginalJobIdGroups = await countDuplicateGroups(ctx);
        res.collections[0].olderThanTtlDocs = await countExpiring(ctx);
        return res;
    },
    async up(ctx) {
        assertCtxDbAllowed(ctx);
        const dups = await countDuplicateGroups(ctx);
        if (dups > 0) {
            throw new Error(`[0029] DeadLetterQueue: ${dups} yinelenen originalJobId grubu var; once elle giderilmeli (hangi kaydin kalacagi insan karari). Indeks KURULMADI.`);
        }
        return upTargets(ctx, TARGETS);
    },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

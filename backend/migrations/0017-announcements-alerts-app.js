'use strict';
/**
 * ADR-0029 NB7/NB8 (App, expand): platform duyurulari + uyari yasam dongusu koleksiyonlari ve indeksleri.
 *  - `Announcements`: status_1_startsAt_1, createdAt_-1 (fan-out isi ve getActive okumasi bu indekslerle).
 *  - `Alerts`: UNIQUE uniq_rule_scope {ruleId, scopeKey} (tekillestirme E11000'e dayanir), status_1_lastSeenAt_-1, TTL ttl_exp_at (yalniz cozulunce expAt yazilir, 30 gun).
 * Kanonik beyan: `src/database/application/models/{Announcement,Alert}.ts` (tests/static/indexManifest.static.test.ts eslesmeyi korur; semalar `autoIndex:false`).
 * Yeni koleksiyonlar oldugundan unique indeks icin mukerrer on kontrolu GEREKMEZ (bos). `NOTIFY_V2_ENABLED` / `ALERT_EVALUATOR_ENABLED` acilmadan ONCE bu goc `done` olmali.
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalniz bu gocun indekslerini dusurur (koleksiyon/veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'announcements', defaultCollection: 'Announcements',
        indexes: [
            { fields: { status: 1, startsAt: 1 }, options: { name: 'status_1_startsAt_1' } },
            { fields: { createdAt: -1 }, options: { name: 'createdAt_-1' } },
        ],
    },
    {
        key: 'alerts', defaultCollection: 'Alerts',
        indexes: [
            { fields: { ruleId: 1, scopeKey: 1 }, options: { unique: true, name: 'uniq_rule_scope' } },
            { fields: { status: 1, lastSeenAt: -1 }, options: { name: 'status_1_lastSeenAt_-1' } },
            { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_exp_at' } },
        ],
    },
];

module.exports = {
    id: '0017-announcements-alerts-app',
    scope: 'app',
    kind: 'index',
    description: 'ADR-0029 NB7/NB8 (App): Announcements (2 indeks) + Alerts (uniq_rule_scope, durum, TTL) koleksiyonlari.',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

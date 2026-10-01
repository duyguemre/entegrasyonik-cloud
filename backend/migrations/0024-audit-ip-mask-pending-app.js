'use strict';
/**
 * RET-02 (App, expand): `AuditLogs` kismi indeksi `ret02_ip_pending` = `{at:1,_id:1}` + `partialFilterExpression:{ip:{$exists:true}}`.
 * Gunluk `retention.auditIpMask` isi 90 gunden eski kayitlarda `ip`'yi kaldirip `ipMasked` (IPv4 /24, IPv6 /48) yazar; sorgu
 * `{ip:{$exists:true}, at:{$lt:cutoff}}` + `sort {at:1,_id:1}` (keyset sayfalama). Kismi indeks yalniz maskelenmemis kayitlari tasir:
 * maskelenen kayit indeksten duser, tarama her turda yalniz bekleyenlere dokunur. Indeks yokken is yine calisir (`at_1` TTL indeksi,
 * daha cok tarama). Veri donusumu YOK (maskeleme goc degil, is). 365 gun TTL (`at_1`) degismez.
 * Kanonik beyan: `src/database/application/models/AuditLog.ts` (ayni ad/tanim; tests/static/indexManifest.static.test.ts).
 * YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. Idempotent (ikinci up no-op).
 * down: yalniz bu indeksi dusurur (maskelenmis veri geri GELMEZ; maskeleme geri alinamaz, bilerek).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'auditLogs', defaultCollection: 'AuditLogs',
        indexes: [
            { fields: { at: 1, _id: 1 }, options: { name: 'ret02_ip_pending', partialFilterExpression: { ip: { $exists: true } } } },
        ],
    },
];

module.exports = {
    id: '0024-audit-ip-mask-pending-app',
    scope: 'app',
    kind: 'index',
    description: 'RET-02 (App): AuditLogs kismi indeks ret02_ip_pending ({at,_id}, partial ip $exists); salt ekleme, geri alinabilir.',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

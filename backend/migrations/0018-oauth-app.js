'use strict';
/**
 * ADR-0035 / MCP-1 (App, expand): OAuth yetkilendirme sunucusu koleksiyonlari ve indeksleri.
 *  - `OAuthClients`       : UNIQUE uniq_client_id {clientId}, TTL ttl_unused_expire_at (yalniz hic yetki alinmamis DCR kaydinda alan vardir, 30 gun).
 *  - `OAuthAuthCodes`     : UNIQUE uniq_code_hash {codeHash} (yalniz SHA-256 ozeti), TTL ttl_purge_at (10 dk).
 *  - `OAuthRefreshTokens` : UNIQUE uniq_token_hash {tokenHash}, familyId_1, sub_1_revokedAt_1, tid_1_revokedAt_1, TTL ttl_purge_at.
 * Kanonik beyan: `src/database/application/models/{OAuthClient,OAuthAuthCode,OAuthRefreshToken}.ts` (tests/static/indexManifest.static.test.ts
 * eslesmeyi korur; semalar `autoIndex:false`, bu dosya UYGULAMAdir). Yeni koleksiyonlar oldugundan unique indeks icin mukerrer on kontrolu GEREKMEZ (bos).
 * `MCP_ENABLED=true` acilmadan ONCE bu goc `done` olmali. YALNIZ onayli gocte calisir (CLAUDE.md kural 3 yedek; once yerel, Atlas ayri onay).
 * CALISTIRILMADI. Idempotent (ikinci up no-op). down: yalniz bu gocun indekslerini dusurur (koleksiyon/veri silinmez).
 */
const {
    planTargets, upTargets, downTargets, assertCtxDbAllowed,
} = require('../dev-tools/_migrationIndexes');

const TARGETS = [
    {
        key: 'oauthClients', defaultCollection: 'OAuthClients',
        indexes: [
            { fields: { clientId: 1 }, options: { unique: true, name: 'uniq_client_id' } },
            { fields: { unusedExpireAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_unused_expire_at' } },
        ],
    },
    {
        key: 'oauthAuthCodes', defaultCollection: 'OAuthAuthCodes',
        indexes: [
            { fields: { codeHash: 1 }, options: { unique: true, name: 'uniq_code_hash' } },
            { fields: { purgeAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_purge_at' } },
        ],
    },
    {
        key: 'oauthRefreshTokens', defaultCollection: 'OAuthRefreshTokens',
        indexes: [
            { fields: { tokenHash: 1 }, options: { unique: true, name: 'uniq_token_hash' } },
            { fields: { familyId: 1 }, options: { name: 'familyId_1' } },
            { fields: { sub: 1, revokedAt: 1 }, options: { name: 'sub_1_revokedAt_1' } },
            { fields: { tid: 1, revokedAt: 1 }, options: { name: 'tid_1_revokedAt_1' } },
            { fields: { purgeAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_purge_at' } },
        ],
    },
];

module.exports = {
    id: '0018-oauth-app',
    scope: 'app',
    kind: 'index',
    description: 'ADR-0035 MCP-1 (App): OAuthClients + OAuthAuthCodes + OAuthRefreshTokens koleksiyonlari (tekil ozet indeksleri, aile/sub/tid indeksleri, TTL).',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumunu siniflandirir; koleksiyon/indeks yaratmaz. */
    async plan(ctx) { assertCtxDbAllowed(ctx); return planTargets(ctx, TARGETS); },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;

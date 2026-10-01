import mongoose from "mongoose";

// ADR-0010 madde 6-7 + ADR-0035 Karar 2: refresh token AILESI. Her rotasyon ayni `familyId` ile yeni bir belge yazar; YALNIZCA SHA-256 ozeti
// saklanir. Kullanilmis token yeniden sunulursa (ucuncu taraf icin <=10 sn ayni client grace haric) aile iptal edilir (`revokedAt` TUM uyelerde).
// "Baglanti = aile": `clientName` anlik goruntu, `tid` tek tenant'a baglidir. `idleExpiresAt` (30 gun bosta) ve `familyExpiresAt` (90 gun mutlak)
// kodda denetlenir; `purgeAt` yalniz bellek temizligi icin TTL'dir. autoIndex:false -> indeksler migrations/0018.

export const OAUTH_REFRESH_IDLE_DAYS = 30;
export const OAUTH_REFRESH_MAX_DAYS = 90;

export const OAuthRefreshTokenSchema = new mongoose.Schema({
    tokenHash: { type: String, required: true },
    familyId: { type: String, required: true },
    sub: { type: String, required: true },
    tid: { type: Number, required: true },
    clientId: { type: String, required: true },
    clientName: { type: String, required: true },
    resource: { type: String, required: true },
    scopes: { type: [String], required: true },
    tv: { type: Number, required: true },                  // ailenin olusturuldugu andaki tokenVersion
    createdAt: { type: Date, required: true },
    familyCreatedAt: { type: Date, required: true },
    familyExpiresAt: { type: Date, required: true },       // mutlak (90 gun); yenilemeyle uzamaz
    idleExpiresAt: { type: Date, required: true },         // bosta (30 gun); her kullanimda yeni belgeye tasinir
    lastUsedAt: { type: Date },
    usedAt: { type: Date },
    revokedAt: { type: Date },
    revokedBy: { type: String },                           // client | user | admin | reuse | tv | code_reuse | client_mismatch | tenant
    purgeAt: { type: Date, required: true },               // TTL: familyExpiresAt + 7 gun
}, {
    collection: 'OAuthRefreshTokens',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

export const OAUTH_REFRESH_TOKEN_INDEXES = [
    { fields: { tokenHash: 1 }, options: { unique: true, name: 'uniq_token_hash' } },
    { fields: { familyId: 1 }, options: { name: 'familyId_1' } },
    { fields: { sub: 1, revokedAt: 1 }, options: { name: 'sub_1_revokedAt_1' } },
    { fields: { tid: 1, revokedAt: 1 }, options: { name: 'tid_1_revokedAt_1' } },
    { fields: { purgeAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_purge_at' } },
] as const;

import mongoose from "mongoose";

// ADR-0010 madde 3 / ADR-0035: yetkilendirme kodu. Tek kullanimlik, 60 sn gecerli; YALNIZCA SHA-256 ozeti saklanir.
// Kullanildiktan sonra da `purgeAt`'e dek kalir: ikinci kullanim denemesi o koddan verilmis aileyi iptal eder (yeniden kullanim tespiti).
// `familyId` kod uretilirken belirlenir; aile ilk kullanimda olusur. autoIndex:false -> indeksler migrations/0018.

export const OAUTH_CODE_TTL_SECONDS = 60;
export const OAUTH_CODE_RETENTION_SECONDS = 10 * 60;

export const OAuthAuthCodeSchema = new mongoose.Schema({
    codeHash: { type: String, required: true },
    clientId: { type: String, required: true },
    redirectUri: { type: String, required: true },
    codeChallenge: { type: String, required: true },       // S256
    resource: { type: String, required: true },
    sub: { type: String, required: true },
    tid: { type: Number, required: true },
    scopes: { type: [String], required: true },
    tv: { type: Number, required: true },
    familyId: { type: String, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },             // gecerlilik (createdAt + 60 sn; kodda denetlenir)
    usedAt: { type: Date },
    purgeAt: { type: Date, required: true },               // TTL (createdAt + 10 dk)
}, {
    collection: 'OAuthAuthCodes',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

export const OAUTH_AUTH_CODE_INDEXES = [
    { fields: { codeHash: 1 }, options: { unique: true, name: 'uniq_code_hash' } },
    { fields: { purgeAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_purge_at' } },
] as const;

import mongoose from "mongoose";

// ADR-0035 Karar 2 / MCP-1: dinamik kayitli (RFC 7591) UCUNCU TARAF public client'lar. Sir YOK (token_endpoint_auth_method: none).
// Birinci taraf sabit istemciler (ADR-0010) bu koleksiyonda degil, kodda kalir. ADR-0021 deseni: `autoIndex:false`; indeksler yalniz
// onayli gocle (migrations/0018). Icerik: yalniz dogrulanmis alanlar (logo_uri/client_uri/jwks_uri gibi dis URL alanlari SAKLANMAZ).

export const OAUTH_CLIENT_UNUSED_TTL_DAYS = 30;

export const OAuthClientSchema = new mongoose.Schema({
    clientId: { type: String, required: true },
    clientName: { type: String, required: true },          // <= 60, kontrol karakteri yok
    redirectUris: { type: [String], required: true },       // 1-5, birebir eslesme
    scopes: { type: [String], required: true },
    createdAt: { type: Date, required: true },
    lastGrantAt: { type: Date },
    createdIp: { type: String },
    // TTL: yalniz HIC yetki alinmamis kayitta vardir (createdAt + 30 gun); ilk yetkide $unset edilir.
    unusedExpireAt: { type: Date },
}, {
    collection: 'OAuthClients',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

export const OAUTH_CLIENT_INDEXES = [
    { fields: { clientId: 1 }, options: { unique: true, name: 'uniq_client_id' } },
    { fields: { unusedExpireAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_unused_expire_at' } },
] as const;

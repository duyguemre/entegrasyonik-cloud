import mongoose from "mongoose";

// Kimlik hesabı yaşam döngüsü token'ları (parola sıfırlama, e-posta doğrulama). docs/API_ACCOUNT_LIFECYCLE.md
//
// GÜVENLİK: düz token ASLA saklanmaz; yalnızca SHA-256 özeti (`tokenHash`) yazılır. Token 256 bit rastgeledir
// (yüksek entropi -> yavaş/tuzlu özet gerekmez). Tek kullanımlıktır: tüketim `usedAt` alanının ATOMİK
// (findOneAndUpdate, koşul `usedAt` yok + süre dolmamış) doldurulmasıyla yapılır. Süre dolunca TTL indeksi belgeyi siler.

export type AccountTokenPurpose = 'password_reset' | 'email_verify';

export const ACCOUNT_TOKEN_PURPOSES: ReadonlyArray<AccountTokenPurpose> = ['password_reset', 'email_verify'];

export const AccountTokenSchema = new mongoose.Schema({
    sub:       { type: String, required: true },                 // merkezi Users._id (string)
    purpose:   { type: String, enum: ACCOUNT_TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true },                 // sha256(token) hex
    createdAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    usedAt:    { type: Date },
    ip:        { type: String },                                 // talebin geldiği IP (yalnızca inceleme için)
}, {
    collection: 'AccountTokens',
    versionKey: false,
});

// Özet tekil: aynı token iki belgede olamaz; arama bu indeksle yapılır
AccountTokenSchema.index({ tokenHash: 1 }, { unique: true, name: 'uniq_token_hash' });
// TTL: expiresAt geçince belge otomatik silinir (expireAfterSeconds: 0 => tam expiresAt anında)
AccountTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_expires_at' });
// Kullanıcı başına son token / önceki token'ları geçersiz kılma sorguları
AccountTokenSchema.index({ sub: 1, purpose: 1, createdAt: -1 });

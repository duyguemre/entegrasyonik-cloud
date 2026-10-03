import mongoose from "mongoose";

export const UserSchema = new mongoose.Schema({
    // ADR-0003 A.2: e-posta küçük harfe normalize edilir (sorgu filtreleri de aynı setter'dan geçer) ve merkezi olarak TEKİL
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    surname: { type: String, required: true },
    password: { type: String, required: true },
    isGlobalAdmin: { type: Boolean, required: true, default: false }, // Sistem geneli admin
    owner: { type: Boolean, required: true, default: false },       // Client sahibi
    roleCode: { type: String, required: false },                    // GlobalRole kodu
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    // ADR-0001: oturum iptali. Parola değişimi, kullanıcı silme/pasifleştirme, rol değişimi ve "tüm oturumları kapat" bu sayıyı artırır;
    // authenticate middleware her istekte token'daki tv ile karşılaştırır.
    tokenVersion: { type: Number, default: 0 },
    // Pasif hesap (false) authenticate ve login tarafından reddedilir; alanı olmayan (eski) kullanıcılar aktif sayılır.
    isActive: { type: Boolean, default: true },
    // Hesap yaşam döngüsü: e-posta doğrulama durumu. Alanı olmayan (eski) kullanıcılar DOĞRULANMAMIŞ sayılır (DTO: `=== true`).
    // Giriş doğrulanmamış hesapla ENGELLENMEZ (zorunlu kılma ayrı insan kararı; docs/API_ACCOUNT_LIFECYCLE.md).
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    passwordChangedAt: { type: Date },
    // Google ile giriş: Google hesap kimliği (ID token `sub`). Yalnız Google ile bağlanmış kullanıcıda bulunur; API yanıtlarında DÖNMEZ (profileDto beyaz listesi).
    googleSub: { type: String },
    resources: [
        { type: String, required: true }
    ]
}, {
    collection: 'Users',
    strict: false
});

// Tekil indeks: ön kontrol (precheck-tenant-duplicates.js) temiz olmadan hedef DB'de kurulmamalıdır (bkz. Client.ts notu).
UserSchema.index({ email: 1 }, { unique: true, name: 'uniq_email', partialFilterExpression: { email: { $type: 'string' } } });
// ADR-0021 Karar 3 D9 / DATA_MODEL_CONVENTIONS.md §12 "Tenant kullanıcıları `Users {clientId}` (merkezi, ADR-0021 D11)"
// -- `clientId` bu şemada henüz BEYAN EDİLMİYOR (strict:false; user-service.ts:115-122 yazıyor/sorguluyor;
// D11'de alan resmen eklenecek) ama strict:false altında beyansız alana indeks kurmak geçerlidir.
// Uygulama: backend/migrations/0001-d9-indexes-app.js.
UserSchema.index({ clientId: 1 }, { name: 'clientId_1' });
// Google ile giriş: seyrek (kısmi) tekil indeks -- googleSub'u olmayan kullanıcılar etkilenmez. Uygulama: backend/migrations/0020-users-google-sub-app.js (ÇALIŞTIRILMADI).
UserSchema.index({ googleSub: 1 }, { unique: true, name: 'uniq_googleSub', partialFilterExpression: { googleSub: { $type: 'string' } } });

export const ResourceSchema = new mongoose.Schema({
    code: { type: String, required: true },
    name: { type: String, required: true },
}, {
    collection: 'Resources',
    strict: false
});
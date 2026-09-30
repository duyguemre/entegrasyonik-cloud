import mongoose from "mongoose";

// ADR-0026 Karar 4.5: backoffice (platform yoneticisi) TOTP 2FA kaydi. Kimlik `Users`'ta kalir; sir/kurtarma ozetleri AYRI
// koleksiyondadir ki `Users` okuyan hicbir yol (authenticate, profil DTO, kimlik onbellegi) TOTP sirrina dokunmasin.
//
// - `secret` / `pendingSecret`: FIELD_ENCRYPTION_KEYS ile AES-256-GCM (`enc:v1:...`), duz metin ASLA yazilmaz.
// - `lastStep`: son kullanilan TOTP adimi (yeniden oynatma korumasi; kosullu atomik guncelleme).
// - `recoveryHashes`: 10 kurtarma kodunun bcrypt ozeti; `usedAt` doluysa tuketilmistir (tek kullanim).
//
// ADR-0021 deseni: `autoIndex:false`; koleksiyon/indeks YALNIZ onayli gocle kurulur (migrations/0014-admin-mfa-sub-unique-app.js; yedek + Protokol 12).
// `{sub:1}` tekil indeksi asagida SABIT + sema beyanidir (manifest'e girer); uygulama katmani kosullari (`setPending`/`activate`) ek savunmadir.

export const AdminMfaSchema = new mongoose.Schema({
    sub: { type: String, required: true },                 // merkezi Users._id (string)
    secret: { type: String },                              // enc:v1:... (etkin TOTP sirri)
    pendingSecret: { type: String },                       // enc:v1:... (kayit basladi, dogrulanmadi)
    enabledAt: { type: Date },
    lastStep: { type: Number },
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    recoveryHashes: {
        type: [new mongoose.Schema({ hash: { type: String, required: true }, usedAt: { type: Date } }, { _id: false })],
        default: undefined,
    },
}, {
    collection: 'AdminMfa',
    strict: true,
    timestamps: true,
    versionKey: false,
    autoIndex: false,
});

export const ADMIN_MFA_INDEXES = [
    { fields: { sub: 1 }, options: { unique: true, name: 'uniq_sub' } },
] as const;
for (const i of ADMIN_MFA_INDEXES) AdminMfaSchema.index(i.fields as any, i.options as any);

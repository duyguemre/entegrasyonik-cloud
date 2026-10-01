import mongoose from "mongoose";

// MOB-04 (ADR-0029 Karar 4 web push kanali): kullanici x cihaz push aboneligi (ApplicationDB). Tenant kapsamli: (tid, userId) sahibi.
// `sub` = {endpoint, keys} JSON'u AES-256-GCM ile SIFRELI (`enc:v1:`; FieldCrypto) -- uc URL'si yetenek belirtecidir, anahtarlar
// ileti sifrelemesi icindir. Tekillik `endpointHash` (sha256(endpoint), hex) uzerinden: ayni tarayici yeniden abone olunca
// kayit guncellenir; baska kullanici ayni tarayicida abone olursa kayit ona GECER (bir uc tek tarayiciya aittir).
// ADR-0021 deseni: `autoIndex:false`; indeksler YALNIZ onayli gocle (migrations/0020-push-subscriptions-app.js; CALISTIRILMADI).
export const PUSH_SUBSCRIPTION_INDEXES = [
    { fields: { endpointHash: 1 }, options: { unique: true, name: 'uniq_endpointHash' } },
    { fields: { tid: 1, userId: 1, createdAt: -1 }, options: { name: 'tid_1_userId_1_createdAt_-1' } },
] as const;

export const PushSubscriptionSchema = new mongoose.Schema({
    tid: { type: Number, required: true },
    userId: { type: String, required: true },               // merkezi Users._id (string)
    endpointHash: { type: String, required: true },          // sha256(endpoint) hex
    sub: { type: String, required: true },                   // enc:v1:... ({endpoint, keys:{p256dh, auth}})
    deviceLabel: { type: String, maxlength: 60 },            // kullaniciya gosterilen kisa cihaz adi (ornek "Android · Chrome"); PII degil
    createdAt: { type: Date, required: true, default: Date.now },
    lastSuccessAt: { type: Date },
}, {
    collection: 'PushSubscriptions',
    strict: true,
    versionKey: false,
    autoIndex: false,
});
for (const i of PUSH_SUBSCRIPTION_INDEXES) PushSubscriptionSchema.index(i.fields as any, i.options as any);

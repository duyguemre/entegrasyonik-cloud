import mongoose from "mongoose";

// ADR-0029 Karar 3: bildirim olay defteri (ApplicationDB). Idempotency + gruplama/kisma (sureclerarasi) + teslim ozeti.
//
// ADR-0021 deseni: indeks TANIMLARI kodda, ama `autoIndex:false` -- indeksler YALNIZ onayli gocle kurulur (S1 insan onayi;
// yedek + Protokol 12). Model kaydi hicbir DB'ye sessizce koleksiyon/indeks yazmaz. Icerik: tenant metni / e-posta / PII YOK.
//
// `kind`:
//  - 'event'  : gercek olay (ya da grup lideri). `count` grup penceresindeki toplam olay sayisi.
//  - 'dedupe' : yalniz tekillestirme isareti (dedupeKey + grup birlikte tanimliyken ikinci kayit; icerik yok).


export const NotificationEventSchema = new mongoose.Schema({
    tid: { type: Number, required: true },
    code: { type: String, required: true },
    category: { type: String, required: true },
    severity: { type: String, required: true },
    kind: { type: String, enum: ['event', 'dedupe'], required: true, default: 'event' },
    idemKey: { type: String, required: true },               // tekil: code:tid:dedupe | grp:code:tid:groupKey:bucket
    groupKey: { type: String },
    bucket: { type: Number },
    count: { type: Number, default: 1 },                     // grup penceresi sayaci
    dupCount: { type: Number, default: 0 },                  // ayni idemKey'in tekrar gelis sayisi
    lastOccurredAt: { type: Date },
    params: { type: mongoose.Schema.Types.Mixed },           // izinli, PII'siz (katalog zod strict)
    recipientCount: { type: Number, default: 0 },
    inAppCount: { type: Number, default: 0 },
    emailQueued: { type: Number, default: 0 },
    suppressedCount: { type: Number, default: 0 },
    source: { type: { module: { type: String }, corrId: { type: String } }, _id: false },
    createdAt: { type: Date, required: true, default: Date.now },
    expAt: { type: Date, required: true },                   // TTL: 30 gun
}, {
    collection: 'NotificationEvents',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

export const NOTIFICATION_EVENT_INDEXES = [
    { fields: { idemKey: 1 }, options: { unique: true, name: 'uniq_idem_key' } },
    { fields: { tid: 1, createdAt: -1 }, options: { name: 'tid_1_createdAt_-1' } },
    { fields: { code: 1, createdAt: -1 }, options: { name: 'code_1_createdAt_-1' } },
    { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_exp_at' } },
] as const;

/** Defter/teslim saklama suresi (gun); ADR-0029 S3. */
export const NOTIFICATION_LEDGER_RETENTION_DAYS = 30;

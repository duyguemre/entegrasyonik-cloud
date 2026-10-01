import mongoose from "mongoose";

// MOB-08 / K55: minimal günlük aktif kullanım toplaması -- (gün, tenant, platform) başına TEK belge.
// `u`: o gün o platformdan en az bir RPC yapan kullanıcıların TAKMA kimlikleri (sha256(sub) ilk 16 hex; ham sub/UA/IP YOK).
// Aktif kullanıcı sayısı = `u` dizisinin boyu; günler/platformlar arası tekil sayım `u` birleşimiyle yapılır (kullanıcı başına 1 kayıt,
// tenant başına üst sınır = kullanıcı sayısı → belge küçük kalır). Yalnız müşteri yüzeyi (impersonation/backoffice sayılmaz).
// Saklama 180 gün (`expAt` TTL). ADR-0021 deseni: `autoIndex:false`; indeksler YALNIZ onaylı göçle (migrations/0023-usage-daily-app.js; ÇALIŞTIRILMADI).

export const USAGE_DAILY_RETENTION_DAYS = 180;

export const UsageDailySchema = new mongoose.Schema({
    day: { type: String, required: true },        // 'YYYY-MM-DD' (Europe/Istanbul takvim günü)
    tid: { type: Number, required: true },        // tenant order
    platform: { type: String, required: true, enum: ['desktop_web', 'electron', 'mobile_web', 'pwa', 'android_app', 'unknown'] },
    u: { type: [String], default: [] },           // takma kullanıcı kimlikleri (tekil)
    expAt: { type: Date, required: true },
}, {
    collection: 'UsageDaily',
    strict: true,
    timestamps: { createdAt: false, updatedAt: true },
    versionKey: false,
    autoIndex: false,
});

export const USAGE_DAILY_INDEXES = [
    { fields: { day: 1, tid: 1, platform: 1 }, options: { unique: true, name: 'uniq_day_tid_platform' } },
    { fields: { tid: 1, day: -1 }, options: { name: 'tid_1_day_-1' } },
    { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'expAt_ttl' } },
] as const;
for (const i of USAGE_DAILY_INDEXES) UsageDailySchema.index(i.fields as any, i.options as any);

import mongoose from "mongoose";

// ADR-0017 Karar 4 (Asama C) / ADR-0029 Karar 7 (NB8): platform uyari yasam dongusu (`firing -> resolved`), `(ruleId, scopeKey)` anahtarli.
// Backoffice "Uyarilar" paneli bu koleksiyondan okur (tenant `Notifications`'tan ayri). ADR-0021 deseni: `autoIndex:false`; indeksler yalniz onayli gocle (migrations/0017).
// Icerik: yalniz kural kimligi, kapsam anahtari ve sayisal/kodlu `detail` (tenant verisi/PII/ham hata metni YOK).

export const ALERT_LEVELS = ['warning', 'critical'] as const;
export const ALERT_STATUSES = ['firing', 'resolved'] as const;

export const AlertSchema = new mongoose.Schema({
    ruleId: { type: String, required: true },
    scopeKey: { type: String, required: true },
    level: { type: String, enum: ALERT_LEVELS, required: true },
    status: { type: String, enum: ALERT_STATUSES, required: true, default: 'firing' },
    detail: { type: mongoose.Schema.Types.Mixed },           // kucuk, PII'siz (tid/integ/sayi)
    firstFiredAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    lastNotifiedAt: { type: Date },
    cleanStreak: { type: Number, default: 0 },               // ardisik temiz degerlendirme (histerezis: 2)
    resolvedAt: { type: Date },
    mutedUntil: { type: Date },
    mutedBy: { type: String },
    shadow: { type: Boolean, default: false },               // golge modda uretildi (bildirim gonderilmedi)
    expAt: { type: Date },                                   // yalniz cozulunce yazilir: TTL 30 gun
}, {
    collection: 'Alerts',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

export const ALERT_INDEXES = [
    { fields: { ruleId: 1, scopeKey: 1 }, options: { unique: true, name: 'uniq_rule_scope' } },
    { fields: { status: 1, lastSeenAt: -1 }, options: { name: 'status_1_lastSeenAt_-1' } },
    { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_exp_at' } },
] as const;

export const ALERT_RETENTION_DAYS = 30;

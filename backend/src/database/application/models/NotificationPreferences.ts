import mongoose from "mongoose";

// ADR-0029 Karar 3/5: bildirim tercihleri (ApplicationDB). `userId:null` = tenant varsayilani. ADR-0021 deseni: `autoIndex:false`;
// onerilen indeks (uniq {tid,userId}) yalniz onayli gocle kurulur (S1) -> `schema.index()` BILEREK cagrilmaz (manifest bos girdi).
export const NOTIFICATION_PREFERENCES_INDEXES = [
    { fields: { tid: 1, userId: 1 }, options: { unique: true, name: 'uniq_tid_userId' } },
] as const;

export const NotificationPreferencesSchema = new mongoose.Schema({
    tid: { type: Number, required: true },
    userId: { type: String, default: null },                 // merkezi Users._id (string) | null = tenant varsayilani
    locale: { type: String, enum: ['tr', 'en'], default: 'tr' },
    matrix: { type: mongoose.Schema.Types.Mixed, default: {} },   // <category> -> { inApp?, email? } (zod strict ile dogrulanir)
    digest: { type: mongoose.Schema.Types.Mixed },                 // { cadence:'hourly'|'daily', hourLocal:0-23 }
    quietHours: { type: mongoose.Schema.Types.Mixed },             // { start:'HH:MM', end:'HH:MM', tz }
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String },
}, {
    collection: 'NotificationPreferences',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

import mongoose from "mongoose";

// ADR-0029 Karar 7 (NB7): platform duyurulari (backoffice yazar; tenant `AnnouncementService/getActive` okur). ApplicationDB.
// ADR-0021 deseni: `autoIndex:false`, indeksler yalniz onayli gocle (migrations/0017). Icerik platformca yazilir (tenant verisi/PII YOK).
// Banner okuma yoluyla gosterilir (fan-out yok); `channels.inApp`/`channels.email` icin `notifications.announcements` isi `fanout` alanini isler.

export const ANNOUNCEMENT_KINDS = ['info', 'maintenance', 'incident', 'release'] as const;
export const ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export const ANNOUNCEMENT_STATUSES = ['draft', 'scheduled', 'active', 'ended', 'cancelled'] as const;
export const ANNOUNCEMENT_TARGET_MODES = ['all', 'plans', 'tenants'] as const;
export const ANNOUNCEMENT_AUDIENCES = ['all_members', 'owners_admins'] as const;

const Localized = { type: { tr: { type: String, required: true }, en: { type: String } }, _id: false };

export const AnnouncementSchema = new mongoose.Schema({
    kind: { type: String, enum: ANNOUNCEMENT_KINDS, required: true },
    severity: { type: String, enum: ANNOUNCEMENT_SEVERITIES, required: true },
    title: { ...Localized, required: true },
    body: { ...Localized, required: true },
    target: {
        type: {
            mode: { type: String, enum: ANNOUNCEMENT_TARGET_MODES, required: true },
            planCodes: { type: [String], default: undefined },
            tids: { type: [Number], default: undefined },
        }, required: true, _id: false,
    },
    audience: { type: String, enum: ANNOUNCEMENT_AUDIENCES, required: true, default: 'all_members' },
    channels: {
        type: { banner: { type: Boolean, required: true }, inApp: { type: Boolean, required: true }, email: { type: Boolean, required: true } },
        required: true, _id: false,
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date },
    dismissible: { type: Boolean, required: true, default: true },
    status: { type: String, enum: ANNOUNCEMENT_STATUSES, required: true, default: 'draft' },
    // Toplu e-posta: "yalniz hizmet duyurusu, pazarlama yasak" onayi (S5) planlama aninda kaydedilir.
    emailConsentAt: { type: Date },
    // notifications.announcements isi: `claimedAt` kira, `doneAt` tamamlandi; sayaclar yalniz olcu.
    fanout: {
        type: { claimedAt: { type: Date }, doneAt: { type: Date }, tenants: { type: Number, default: 0 }, notified: { type: Number, default: 0 } },
        _id: false,
    },
    createdBy: { type: String, required: true },             // AdminUser sub
    updatedBy: { type: String },
    scheduledBy: { type: String },
    cancelledBy: { type: String },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date },
}, {
    collection: 'Announcements',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

export const ANNOUNCEMENT_INDEXES = [
    { fields: { status: 1, startsAt: 1 }, options: { name: 'status_1_startsAt_1' } },
    { fields: { createdAt: -1 }, options: { name: 'createdAt_-1' } },
] as const;

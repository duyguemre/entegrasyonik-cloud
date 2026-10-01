import mongoose from "mongoose";

// ADR-0029 Karar 3/4: e-posta outbox + teslim gunlugu (ApplicationDB). Gonderici NB5'te (`notifications.email` isi, lease).
// E-posta ADRESI SAKLANMAZ (gonderim aninda Users'tan cozulur). ADR-0021 deseni: `autoIndex:false`, indeksler yalniz onayli gocle (S1).

export const DELIVERY_CHANNELS = ['email', 'push'] as const; // push: MOB-04 web push (anlik; ozet yok)
export const DELIVERY_MODES = ['instant', 'digest'] as const;
export const DELIVERY_STATUSES = ['pending', 'sending', 'sent', 'failed', 'dead', 'skipped', 'suppressed'] as const;

export const NotificationDeliverySchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tid: { type: Number, required: true },
    userId: { type: String, required: true },                // merkezi Users._id (string); platform alicisi icin 'platform'
    code: { type: String, required: true },
    channel: { type: String, enum: DELIVERY_CHANNELS, required: true },
    mode: { type: String, enum: DELIVERY_MODES, required: true },
    status: { type: String, enum: DELIVERY_STATUSES, required: true, default: 'pending' },
    digestAt: { type: Date },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, required: true, default: Date.now },
    leaseUntil: { type: Date },
    lastErrorCode: { type: String },                         // ör. 'disabled' | 'unverified' (skipped nedeni) ya da SMTP hata sinifi
    providerMessageId: { type: String },
    locale: { type: String, enum: ['tr', 'en'], default: 'tr' },
    createdAt: { type: Date, required: true, default: Date.now },
    sentAt: { type: Date },
    expAt: { type: Date, required: true },                   // TTL: 30 gun
}, {
    collection: 'NotificationDeliveries',
    strict: true,
    versionKey: false,
    autoIndex: false,
});

export const NOTIFICATION_DELIVERY_INDEXES = [
    { fields: { status: 1, nextAttemptAt: 1 }, options: { name: 'status_1_nextAttemptAt_1' } },
    { fields: { tid: 1, createdAt: -1 }, options: { name: 'tid_1_createdAt_-1' } },
    { fields: { eventId: 1 }, options: { name: 'eventId_1' } },
    { fields: { expAt: 1 }, options: { expireAfterSeconds: 0, name: 'ttl_exp_at' } },
] as const;

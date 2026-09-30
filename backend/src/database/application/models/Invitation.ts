import mongoose from "mongoose";

// ADR-0028 Karar 5: tenant daveti. Düz token ASLA saklanmaz (yalnız sha256 `tokenHash`, AccountToken deseni).
// ADR-0021: indeks tanımları kodda, `autoIndex:false` — kurulum yalnız onaylı göçle (migrations/0003-memberships-app.js).

export type InvitationStatus = 'pending' | 'accepted' | 'revoked';
export const INVITATION_STATUSES: ReadonlyArray<InvitationStatus> = ['pending', 'accepted', 'revoked'];

/** Süresi dolan davetin belgesi, expiresAt'tan bu kadar sn sonra TTL ile silinir (30 gün: kabul/iptal izi kısa süre görünür kalır). */
export const INVITATION_TTL_AFTER_EXPIRY_SECONDS = 30 * 24 * 3600;

export const InvitationSchema = new mongoose.Schema({
    tid: { type: Number, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },   // normalize
    role: { type: String, required: true },
    tokenHash: { type: String, required: true },                             // sha256(token) hex
    expiresAt: { type: Date, required: true },
    invitedBy: { type: String, required: true },                             // davet eden sub
    status: { type: String, enum: INVITATION_STATUSES, required: true, default: 'pending' },
    acceptedAt: { type: Date },
    acceptedUserId: { type: mongoose.Schema.Types.ObjectId },
}, {
    collection: 'Invitations',
    strict: true,
    timestamps: true,
    versionKey: false,
    autoIndex: false,
});

export const INVITATION_INDEXES = [
    { fields: { tokenHash: 1 }, options: { unique: true, name: 'uniq_token_hash' } },
    { fields: { tid: 1, email: 1 }, options: { unique: true, name: 'uniq_pending_tid_email', partialFilterExpression: { status: 'pending' } } },
    { fields: { expiresAt: 1 }, options: { expireAfterSeconds: INVITATION_TTL_AFTER_EXPIRY_SECONDS, name: 'ttl_expires_at' } },
] as const;
for (const i of INVITATION_INDEXES) InvitationSchema.index(i.fields as any, i.options as any);

import mongoose from "mongoose";

// ADR-0028 Karar 1: kullanıcı <-> tenant üyeliği (yetki kaynağı). Kimlik `Users`'ta, "hangi tenant'ta hangi rol" burada.
//
// ADR-0021 deseni: indeks TANIMLARI kodda, ama `autoIndex:false` — indeksler YALNIZ onaylı göçle
// (`migrations/0003-memberships-app.js`) kurulur; model kaydı hiçbir DB'ye sessizce indeks yazmaz.
//
// Not: ADR-0028 §1 durumları `active|suspended`; WP-A2 görevi ile `invited` eklendi (kabul öncesi kayıt gerekirse).
// Göç (E1) yalnızca `active|suspended` üretir.

export type MembershipRole = 'owner' | 'admin' | 'operator' | 'viewer' | 'accountant' | (string & {});
export type MembershipStatus = 'active' | 'invited' | 'suspended';

export const MEMBERSHIP_STATUSES: ReadonlyArray<MembershipStatus> = ['active', 'invited', 'suspended'];
export const SYSTEM_ROLES: ReadonlyArray<string> = ['owner', 'admin', 'operator', 'viewer', 'accountant'];

export const MembershipSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    tid: { type: Number, required: true },                       // Clients.order (kanonik tenant kimliği)
    role: { type: String, required: true },                      // sistem rolü kodu ya da (Aşama 3) özel rol kodu
    status: { type: String, enum: MEMBERSHIP_STATUSES, required: true, default: 'active' },
    scope: { type: { integrationCodes: { type: [String], default: undefined } }, required: false, _id: false },
    invitedBy: { type: String, required: false },                // davet eden sub
    createdBy: { type: String, required: false },                // ör. 'migration:E1'
    suspendedAt: { type: Date },
    suspendedBy: { type: String },
    suspendReason: { type: String },
}, {
    collection: 'Memberships',
    strict: true,
    timestamps: true,
    versionKey: false,
    autoIndex: false,
});

export const MEMBERSHIP_INDEXES = [
    { fields: { userId: 1, tid: 1 }, options: { unique: true, name: 'uniq_user_tid' } },
    { fields: { tid: 1, status: 1 }, options: { name: 'tid_1_status_1' } },
    { fields: { tid: 1, role: 1 }, options: { name: 'tid_1_role_1' } },
] as const;
for (const i of MEMBERSHIP_INDEXES) MembershipSchema.index(i.fields as any, i.options as any);

import { ObjectId } from 'mongodb';
import { config } from '@config';
import { getIdentityCache } from '@platform/core/security/identityCache';
import { ApplicationError } from '@platform/core/errors';
import { resolveTier } from '@platform/core/authz/tier';
import { roleFromTier, type Role } from '../../capabilities/roles';
import { ROLE_RANK } from './userRules';

// [ADR-0028 WP-A4] Üyelik okuma/yazma ORTAK katmanı (davet / askıya alma / sahiplik devri bunu kullanır). MEMBERSHIP_SOURCE modlarında tutarlılık TEK yerde:
//  - legacy   : karar ve yazma merkezi Users alanlarında (owner/roleCode/isActive) + tenant Users kopyası. Memberships'e YAZILMAZ (koleksiyon göçle
//               kurulur; E2 geri doldurma sonradan eşitler).
//  - dual     : legacy alanlar YETKİLİ okuma kaynağı (A3 kararı) VE yazılır; Memberships de yazılır (fallback/divergence ölçümü doğru kalsın).
//  - membership: okuma/yazma Memberships'te; merkezi Users'a yalnız tokenVersion++ ve (rol için) eski-şekilli ayna alanlar (owner/roleCode) yazılır.
// Kimlik eşlemesi: Memberships.userId = merkezi Users._id (= JWT `sub`). FE listesi (getUsers) tenant kopyasının _id'sini döndürür; ikisi de kabul edilir.

export type SourceMode = 'legacy' | 'dual' | 'membership';

export function sourceMode(): SourceMode {
    const s = config.flags.membershipSource;
    return s === 'dual' || s === 'membership' ? s : 'legacy';
}

export const ROLE_TO_LEGACY: Readonly<Record<Role, { owner: boolean; roleCode: string }>> = Object.freeze({
    owner: { owner: true, roleCode: 'ROLE_OWNER' },
    admin: { owner: false, roleCode: 'ROLE_ADMIN' },
    operator: { owner: false, roleCode: 'ROLE_OPERATOR' },
});

/** Bir merkezi Users belgesinin eski alanlardan türeyen sistem rolü. */
export function legacyRole(doc: any): Role {
    return roleFromTier(resolveTier(doc, { ga: false }).tier) as Role;
}
export const roleRankOf = (role: string): number => ROLE_RANK[role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : 'member'];

export interface MemberView {
    /** Merkezi Users belgesi (lean). */
    central: any;
    /** Tenant Users kopyası (varsa; membership modunda aranmaz). */
    tenantCopy?: any;
    userId: string;
    role: string;
    status: 'active' | 'suspended' | 'invited';
    isOwner: boolean;
    membership?: any;
}

export interface MemberStoreDeps { applicationDB: any; getClientDB: (tid: number) => Promise<any | undefined>; tid: number; mode?: SourceMode }

/** Mongoose sorgusu (lean var) ya da düz Promise (mock) — ikisini de düz nesneye çevirir. */
const plain = async (q: any): Promise<any> => (q && typeof q.lean === 'function' ? await q.lean() : await q) ?? null;
const isObjectId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

export class MemberStore {
    readonly mode: SourceMode;
    constructor(private readonly deps: MemberStoreDeps) { this.mode = deps.mode ?? sourceMode(); }

    get tid(): number { return this.deps.tid; }
    private get users() { return this.deps.applicationDB.getUserModel(); }
    private get memberships() { return this.deps.applicationDB.getMembershipModel(); }
    private tenantUsers = async () => (await this.deps.getClientDB(this.tid))?.getUserModel();

    /**
     * Hedefi çözer: önce tenant kopyasının _id'si (FE listesi), yoksa merkezi _id. Başka tenant'a ait / süper yönetici / bulunamayan -> null.
     */
    async find(id: unknown): Promise<MemberView | null> {
        if (!isObjectId(id)) return null;
        let central: any = null;
        let tenantCopy: any = null;
        const tu = await this.tenantUsers();
        if (tu && this.mode !== 'membership') {
            tenantCopy = await plain(tu.findOne({ _id: new ObjectId(id) }));
            if (tenantCopy) {
                const emailLc = String(tenantCopy.email ?? '').trim().toLowerCase();
                central = emailLc ? await plain(this.users.findOne({ email: emailLc })) : null;
            }
        }
        if (!central) central = await plain(this.users.findOne({ _id: new ObjectId(id) }));
        if (!central || central.isGlobalAdmin === true) return null;
        if (central.order === undefined || Number(central.order) !== this.tid) return null;
        if (!tenantCopy && tu && this.mode !== 'membership') tenantCopy = await plain(tu.findOne({ email: central.email }));
        const userId = String(central._id);
        let membership: any;
        if (this.mode !== 'legacy') membership = await plain(this.memberships.findOne({ userId: central._id, tid: this.tid }));
        if (this.mode === 'membership') {
            if (!membership) return null;
            return { central, tenantCopy, userId, role: String(membership.role), status: membership.status, isOwner: membership.role === 'owner', membership };
        }
        const role = legacyRole(central);
        return { central, tenantCopy, userId, role, status: central.isActive === false ? 'suspended' : 'active', isOwner: role === 'owner', membership };
    }

    /** Tenant'taki AKTİF sahip sayısı (kaynak moda göre). */
    async countActiveOwners(): Promise<number> {
        if (this.mode === 'membership') return this.memberships.countDocuments({ tid: this.tid, role: 'owner', status: 'active' });
        return this.users.countDocuments({ order: this.tid, owner: true, isActive: { $ne: false } });
    }

    /** Tenant'taki aktif üye sayısı (limits.users kullanımı; bekleyen davetler ayrıca eklenir). */
    async countActiveMembers(): Promise<number> {
        if (this.mode === 'membership') return this.memberships.countDocuments({ tid: this.tid, status: 'active' });
        return this.users.countDocuments({ order: this.tid, isGlobalAdmin: { $ne: true }, isActive: { $ne: false } });
    }

    private async writeTenantCopy(view: MemberView, set: Record<string, unknown>): Promise<void> {
        if (this.mode === 'membership') return;
        const tu = await this.tenantUsers();
        if (!tu) return;
        const filter = view.tenantCopy?._id ? { _id: view.tenantCopy._id } : { email: view.central.email };
        await tu.updateOne(filter, { $set: set });
    }

    private async upsertMembership(view: MemberView, set: Record<string, unknown>, unset?: Record<string, 1>): Promise<void> {
        if (this.mode === 'legacy') return;
        const update: any = { $set: set, $setOnInsert: { createdBy: 'user-service' } };
        if (unset) update.$unset = unset;
        await this.memberships.updateOne({ userId: view.central._id, tid: this.tid }, update, { upsert: true });
    }

    private bump(view: MemberView) { return this.users.updateOne({ _id: view.central._id }, { $inc: { tokenVersion: 1 } }); }

    /** Oturum iptali: tokenVersion++ (DB) + aynı pod'da kimlik önbelleği temizliği. */
    async revokeSessions(view: MemberView): Promise<void> {
        await this.bump(view);
        getIdentityCache().invalidateUser(view.userId);
    }

    /**
     * Rol yazımı (sahiplik devri). `expectedRole` geçilirse yalnız hâlâ o roldeyse yazar (yarış koruması); yazılamazsa 409.
     * tokenVersion++ ve önbellek temizliği çağıranın sorumluluğudur (`revokeSessions`), çünkü iki tarafın yazımı bittikten sonra yapılır.
     */
    async writeRole(view: MemberView, role: Role, opts: { expectedRole?: Role; actor?: string } = {}): Promise<void> {
        const legacy = ROLE_TO_LEGACY[role];
        if (this.mode !== 'membership') {
            const filter: any = { _id: view.central._id };
            if (opts.expectedRole) filter.owner = ROLE_TO_LEGACY[opts.expectedRole].owner;
            const res: any = await this.users.updateOne(filter, { $set: { owner: legacy.owner, roleCode: legacy.roleCode } });
            if ((res.matchedCount ?? res.n ?? 1) === 0) throw new ApplicationError('Üyelik başka bir işlemle eş zamanlı değişti. Lütfen tekrar deneyin.', 409, 'CONFLICT');
            try {
                await this.writeTenantCopy(view, { roleCode: legacy.roleCode });
                await this.upsertMembership(view, { role, status: view.status === 'suspended' ? 'suspended' : 'active' });
            } catch (e) { // sonraki adım başarısız: merkezi kaydı eski role döndür (yarım rol durumu bırakma)
                const prev = ROLE_TO_LEGACY[view.role as Role];
                if (prev) { try { await this.users.updateOne({ _id: view.central._id }, { $set: { owner: prev.owner, roleCode: prev.roleCode } }); } catch { /* en iyi çaba */ } }
                throw e;
            }
            return;
        } else {
            // Önce YETKİLİ kayıt (Membership, yarış korumalı), sonra eski-şekilli ayna alanlar (profil DTO/izin türetimi tek bakışta tutarlı kalsın).
            // Ayna yazımı başarısızsa Membership geri alınır (kendi kendini telafi eder: yarım rol durumu bırakmaz).
            const filter: any = { userId: view.central._id, tid: this.tid };
            if (opts.expectedRole) filter.role = opts.expectedRole;
            const res: any = await this.memberships.updateOne(filter, { $set: { role } });
            if ((res.matchedCount ?? res.n ?? 1) === 0) throw new ApplicationError('Üyelik başka bir işlemle eş zamanlı değişti. Lütfen tekrar deneyin.', 409, 'CONFLICT');
            try {
                await this.users.updateOne({ _id: view.central._id }, { $set: { owner: legacy.owner, roleCode: legacy.roleCode } });
            } catch (e) {
                try { await this.memberships.updateOne({ userId: view.central._id, tid: this.tid }, { $set: { role: view.role } }); } catch { /* en iyi çaba */ }
                throw e;
            }
            return;
        }
    }

    /** Durum yazımı (askıya alma / yeniden etkinleştirme). Legacy `isActive` merkezi kayıt + tenant kopyasında da yazılır (dual/legacy). */
    async writeStatus(view: MemberView, status: 'active' | 'suspended', by: string, reason?: string): Promise<void> {
        const now = new Date();
        if (this.mode !== 'membership') {
            await this.users.updateOne({ _id: view.central._id }, { $set: { isActive: status === 'active' } });
            await this.writeTenantCopy(view, { isActive: status === 'active' });
        }
        const set: Record<string, unknown> = { role: view.role, status };
        const unset: Record<string, 1> = {};
        if (status === 'suspended') { set.suspendedAt = now; set.suspendedBy = by; if (reason) set.suspendReason = reason; else unset.suspendReason = 1; }
        else { unset.suspendedAt = 1; unset.suspendedBy = 1; unset.suspendReason = 1; }
        await this.upsertMembership(view, set, unset);
    }

    /** Yeni üye (davet kabulü): merkezi kullanıcı + tenant kopyası + üyelik. Herhangi biri başarısızsa geriye alınır. */
    async createMember(input: { email: string; name: string; surname: string; passwordHash: string; role: Role; invitedBy: string }): Promise<{ userId: string }> {
        const legacy = ROLE_TO_LEGACY[input.role];
        const now = new Date();
        const central: any = await this.users.create({
            email: input.email, name: input.name, surname: input.surname, password: input.passwordHash,
            clientId: this.tid, order: this.tid, owner: false, isGlobalAdmin: false, roleCode: legacy.roleCode,
            emailVerified: true, emailVerifiedAt: now, isActive: true,
        });
        const undo: Array<() => Promise<unknown>> = [() => this.users.deleteOne({ _id: central._id })];
        try {
            if (this.mode !== 'membership') {
                const tu = await this.tenantUsers();
                if (!tu) throw new Error('Tenant veritabanı bağlantısı kurulamadı.');
                const copy: any = await tu.create({ name: input.name, surname: input.surname, email: input.email, password: input.passwordHash, roleCode: legacy.roleCode });
                undo.push(() => tu.deleteOne({ _id: copy._id }));
            }
            if (this.mode !== 'legacy') {
                await this.memberships.create({ userId: central._id, tid: this.tid, role: input.role, status: 'active', invitedBy: input.invitedBy, createdBy: 'invitation' });
                undo.push(() => this.memberships.deleteOne({ userId: central._id, tid: this.tid }));
            }
        } catch (e) {
            for (const u of undo.reverse()) { try { await u(); } catch { /* en iyi çaba */ } }
            throw e;
        }
        return { userId: String(central._id) };
    }
}

import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import Security, { ApplicationError } from '@platform/core/security/Security'
import { IService } from '@interfaces/index'
import { getIdentityCache } from '@platform/core/security/identityCache'
import { AuditLogger } from '@services/audit/AuditLogger'
import { DatabaseManagerInstance } from '@database/DatabaseManager'
import { defaultMailSender } from '@operations/account/AccountLifecycleService'
import { InvitationService } from '@operations/users/invitations'
import { SuspensionService } from '@operations/users/suspension'
import { OwnershipService } from '@operations/users/ownership'
import { assertRecentReauth } from '@operations/users/reauth'
import { MemberStore, sourceMode } from '@operations/users/memberStore'
import {
    ROLE_RANK, actorRank, roleRank, roleCodeRank, assertNotImpersonating, assertRoleCeiling, assertOwnerTargetProtection, assertAdminSuppliedPassword,
} from '../../../operations/users/userRules'

// ADR-0003 D.15: kullanıcı listesi yanıtı BEYAZ LİSTE projeksiyonudur (password, tokenVersion, failedLoginAttempts, lockUntil,
// __v ve belgede kalmış diğer alanlar ASLA dönmez). FE listesi yalnızca bu alanları kullanır (AuthorizationListView.vue).
export const USER_LIST_PROJECTION = {
    _id: 1, email: 1, name: 1, surname: 1, roleCode: 1, owner: 1, isGlobalAdmin: 1, isActive: 1,
    resources: 1, order: 1, clientId: 1, createdAt: 1, updatedAt: 1,
} as const;

const isDuplicateKeyError = (e: any) => !!e && (e.code === 11000 || e.code === 11001);
const EMAIL_TAKEN = 'Bu e-posta adresi kullanılamıyor.';

/**
 * [MM-08 / ADR-0021 aynı desen] getUsers sıralama alanı izin listesi. `USER_LIST_PROJECTION` beyaz listesinden
 * ve FE personel tablosunun (AuthorizationListView.vue) @click ile sıralanabilir başlıklarından türetildi:
 * name, email, roleCode; varsayılan `_id`. `OrderService.getOrders` ile AYNI keyfi-alan-adı-enjeksiyonu riskini
 * kapatır (`sortBy.key` DOĞRULAMASIZ bir nesneye yazılıyordu).
 * [DÜZELTME, 2026-09-29, orkestratör — BACKLOG.md "ADR-0003 aşama 3a" madde 1 KAPANDI] `sortBy` ÖNCEDEN
 * hesaplanıyor ama pipeline'a HİÇ UYGULANMIYORDU (ölü kod, sıralama isteği sessizce yok sayılıyordu) — artık
 * `users` dalına `$skip`/`$limit`'ten ÖNCE `{ $sort: sortBy }` eklendi.
 */
const USER_SORT_FIELDS: readonly string[] = ['_id', 'name', 'email', 'roleCode'];

export default class UserService extends BaseApi implements IService {

    async get(): Promise<any> {
    }


    async getUsers(): Promise<any> {
        try {
            var direction = 1
            const sortBy: any = {}
            if (this.request.sortBy != undefined && this.request.sortBy.key) {
                direction = this.request.sortBy.order == 'asc' ? 1 : -1
                if (typeof this.request.sortBy.key !== 'string' || !USER_SORT_FIELDS.includes(this.request.sortBy.key)) {
                    throw new ApplicationError('sortBy.key geçersiz: ' + USER_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
                }
                sortBy[this.request.sortBy.key] = direction
            } else {
                sortBy._id = 1
            }

            const response: any = {};
            const skipCount = (this.request.pagination.page - 1) * this.request.pagination.limit;
            const limitCount = this.request.pagination.limit;

            // Müşterinin kendi veritabanından (ClientDB) çek
            const result = await this.clientDB.getUserModel().aggregate([
                { $match: {} }, // ClientDB izoledir, ek bir filtera gerek yok (ama istenirse eklenebilir)
                { $sort: sortBy }, // [DB-02] $facet dışında: indeks kullanılabilir
                {
                    $facet: {
                        totalNumberOfRecords: [{ $count: 'count' }],
                        users: [
                            { $skip: skipCount },
                            { $limit: limitCount },
                            { $project: USER_LIST_PROJECTION }
                        ]
                    }
                },
            ]);

            const aggregationResult = result[0] || {};
            response.totalNumberOfRecords = aggregationResult.totalNumberOfRecords?.[0]?.count || 0;
            response.users = aggregationResult.users || [];

            if (response.users.length > 0) {
                response.fromTo = {
                    from: skipCount + 1,
                    to: skipCount + response.users.length
                };
            }
            return response;
        } catch (error) {
            throw error
        }
    }

    async getRoles(): Promise<any> {
        try {
            // Merkezi veritabanındaki sabit rolleri getir
            return await this.applicationDB.getGlobalRoleModel().find().lean();
        } catch (error) {
            throw error;
        }
    }

    async getResources(): Promise<any> {
        try {
            // Geriye dönük uyumluluk için, yetkileri merkezi listeden getir
            const resp = await this.applicationDB.getResourceModel().find().lean();
            return resp?.[0]?.resources || [];
        } catch (error) {
            throw error;
        }
    }



    /** [ADR-0028 Karar 8] Adım-yükseltmesi: son parola doğrulaması <= 5 dk değilse `401 REAUTH_REQUIRED`. */
    private async requireReauth(): Promise<void> {
        await assertRecentReauth(this.applicationDB.getUserModel(), String(this.request?.principal?.sub ?? ''))
    }

    async createUser(): Promise<any> {
        try {
            const user = this.request.user;
            const security = Security.getInstance();

            // [ADR-0028 WP-A0 / A-01, A-04] hedef-kullanıcı kuralları SUNUCUDA: impersonation yasak, rol tavanı, parola politikası
            assertNotImpersonating(this.request.principal);
            assertRoleCeiling(actorRank(this.request.userContext, this.request.principal), user.roleCode);
            assertAdminSuppliedPassword(user.password, { email: user.email, name: user.name, surname: user.surname });
            if (roleCodeRank(user.roleCode) >= ROLE_RANK.admin) await this.requireReauth() // admin rolü verme = step-up

            // 1. Şifreyi Hash'le!
            const hashedPassword = await security.hashPassword(user.password);
            user.password = hashedPassword;

            // 2. ClientDB'ye kaydet (Tam Profil)
            let clientUser: any;
            try {
                clientUser = await this.clientDB.getUserModel().create(user);
            } catch (e: any) {
                // Tenant içi e-posta tekil indeksi (E11000): ham Mongo mesajı istemciye sızmaz
                if (isDuplicateKeyError(e)) throw new ApplicationError(EMAIL_TAKEN, 409);
                throw e;
            }

            // 3. ApplicationDB'ye (Registry) kaydet (Login için)
            const centralUser = {
                email: user.email,
                name: user.name,
                surname: user.surname,
                password: hashedPassword,
                clientId: this.currentClientId,
                order: this.currentClientId, // Legacy support
                roleCode: user.roleCode,
                owner: false // UserService üzerinden eklenenler staff'tir
            };
            try {
                await this.applicationDB.getUserModel().create(centralUser);
            } catch (e: any) {
                // ADR-0003 A.2: merkezi Users.email tekil (küçük harfe normalize) — başka tenant'ta kayıtlı e-posta
                if (isDuplicateKeyError(e)) {
                    // Yarım kalan tenant içi kaydı geri al (best-effort)
                    try { await this.clientDB.getUserModel().deleteOne({ _id: clientUser?._id }); } catch { /* yut */ }
                    throw new ApplicationError(EMAIL_TAKEN, 409);
                }
                throw e;
            }

            // ADR-0001 Karar 11: kullanıcı ekleme audit log'a yazılır (e-posta/parola YAZILMAZ; best-effort)
            void AuditLogger.fromRequest(this.request, 'user.create', 'ok', {
                roleCode: typeof user.roleCode === 'string' ? user.roleCode : undefined,
                targetUserId: clientUser?._id ? String(clientUser._id) : undefined,
            })

            return true;
        } catch (error) {
            throw error;
        }
    }

    /**
     * [ADR-0028 WP-A0] Hedef kullanıcıyı (tenant kopyası) + merkezi kaydı okur; rolü/owner bayrağını TEK yerden türetir.
     * Bulunamazsa null. Merkezi kayıt başka tenant'a aitse hedef bu tenant'ta yok sayılır.
     */
    private async loadTarget(userId: string): Promise<{ existing: any; central: any; rank: number; isOwner: boolean; isSelf: boolean } | null> {
        const existing: any = await this.clientDB.getUserModel().findOne({ _id: new ObjectId(userId) });
        if (!existing) return null;
        const emailLc = String(existing.email ?? '').trim().toLowerCase();
        const central: any = emailLc ? await this.applicationDB.getUserModel().findOne({ email: emailLc }) : null;
        if (central && central.order !== undefined && Number(central.order) !== Number(this.currentClientId)) return null;
        // Koruyucu taraf: iki kaynaktan yüksek olan sayılır (tenant kopyasında owner bayrağı bulunmaz; merkezi kayıt yetkilidir)
        const rank = Math.max(roleRank(existing), central ? roleRank(central) : 0);
        const isOwner = central?.owner === true || existing.owner === true;
        const actorEmail = String(this.request.userContext?.email ?? '').trim().toLowerCase();
        const isSelf = !!actorEmail && actorEmail === emailLc;
        return { existing, central, rank: isOwner ? Math.max(rank, ROLE_RANK.owner) : rank, isOwner, isSelf };
    }

    /** Hedef sahipse ve tenant'ta başka aktif sahip yoksa true (son sahip koruması). */
    private async isLastActiveOwner(target: { isOwner: boolean }): Promise<boolean> {
        if (!target.isOwner) return false;
        const count = await this.applicationDB.getUserModel().countDocuments({ order: this.currentClientId, owner: true, isActive: { $ne: false } });
        return count <= 1;
    }

    private guardTarget(target: { rank: number; central: any }): void {
        const principal = this.request.principal;
        if (target.central?.isGlobalAdmin === true && principal?.ga !== true) throw new ApplicationError('Bu kullanıcı üzerinde işlem yapılamaz.', 403);
        assertOwnerTargetProtection(actorRank(this.request.userContext, principal), target.rank);
    }

    async updateUser(): Promise<any> {
        try {
            const user = this.request.user;
            const principal = this.request.principal;
            assertNotImpersonating(principal);

            const clientUserFilter = { _id: new ObjectId(user._id) };
            const target = await this.loadTarget(user._id);
            if (!target) throw new ApplicationError('Kullanıcı bulunamadı.', 404);
            const { existing } = target;
            this.guardTarget(target);
            const actor = actorRank(this.request.userContext, principal);

            // A-01/A-04: parola bu uçtan YAZILAMAZ (başkasınınki yasak; kendisi mevcut parolayı doğrulayan AccountService/changePassword
            // akışıyla, unutulmuşsa "parola sıfırlama" ile değiştirir). Boş/tanımsız parola "değişmedi" demektir.
            if (typeof user.password === 'string' && user.password.length > 0) {
                throw new ApplicationError('Parola bu işlemle değiştirilemez. Kullanıcı kendi parolasını "Hesabım" bölümünden değiştirmeli veya parola sıfırlama bağlantısı istemelidir.', 403);
            }

            // Başkasının e-postası yazılamaz (kendi e-postasını değiştirmesi bu yamada engellenmez; doğrulamalı akış ayrı iş)
            const emailChanged = String(user.email ?? '').trim().toLowerCase() !== String(existing.email ?? '').trim().toLowerCase();
            if (emailChanged && !target.isSelf) throw new ApplicationError('Başka bir kullanıcının e-posta adresi değiştirilemez.', 403);

            const roleChanged = existing.roleCode !== user.roleCode;
            if (roleChanged) {
                if (target.isSelf) throw new ApplicationError('Kendi rolünüzü değiştiremezsiniz.', 403);
                assertRoleCeiling(actor, user.roleCode);
                if (roleCodeRank(user.roleCode) >= ROLE_RANK.admin) await this.requireReauth() // admin rolü verme = step-up
                // Son sahip: sahip düşürülürken tenant'ta başka aktif sahip kalmalı
                if (await this.isLastActiveOwner(target)) throw new ApplicationError('Mağazanın son sahibinin rolü değiştirilemez.', 409);
            }

            const updateFields: any = {
                name: user.name,
                surname: user.surname,
                email: user.email,
                roleCode: user.roleCode
            };

            // 1. ClientDB Güncelle
            await this.clientDB.getUserModel().updateOne(clientUserFilter, { $set: updateFields });

            // 2. ApplicationDB (Registry) Güncelle
            // ADR-0001 Karar 4: rol değişimi merkezi Users.tokenVersion'ı artırır (eski oturumlar 401 olur)
            const centralUserFilter = { email: user.email, clientId: this.currentClientId };
            const centralUpdate: any = { $set: updateFields };
            if (roleChanged) centralUpdate.$inc = { tokenVersion: 1 };
            await this.applicationDB.getUserModel().updateOne(centralUserFilter, centralUpdate);
            // ADR-0024 P1-CORE: kimlik önbelleği (rol/ad/tokenVersion) aynı pod'da anında geçersiz kılınır
            getIdentityCache().invalidateTenant(this.currentClientId);

            // dual/membership: rol Membership'te de yazılır (yetkili kaynak; sahip hedefler burada değişmez). Yeni rol kimlik önbelleği zaten temizlendi
            // tokenVersion merkezi güncellemede artırıldı).
            if (roleChanged && !target.isOwner && sourceMode() !== 'legacy') {
                const store = new MemberStore({ applicationDB: this.applicationDB, getClientDB: async () => this.clientDB, tid: Number(this.currentClientId) })
                const view = await store.find(String(existing._id))
                if (view) {
                    await store.writeRole(view, ['ROLE_ADMIN', 'ROLE_OWNER'].includes(user.roleCode) ? 'admin' : 'operator')
                    getIdentityCache().invalidateUser(view.userId)
                }
            }

            if (roleChanged) {
                void AuditLogger.fromRequest(this.request, 'user.role_change', 'ok', {
                    roleCode: typeof user.roleCode === 'string' ? user.roleCode : undefined,
                    fromRole: typeof existing.roleCode === 'string' ? existing.roleCode : undefined,
                    toRole: typeof user.roleCode === 'string' ? user.roleCode : undefined,
                    targetUserId: String(existing._id),
                });
            }

            return true;
        } catch (error) {
            throw error;
        }
    }

    async deleteUser(): Promise<any> {
        try {
            const userId = this.request.userId;
            assertNotImpersonating(this.request.principal);
            const target = await this.loadTarget(userId);
            if (!target) return true; // mevcut davranış: bulunamayan silme sessizce başarılı

            this.guardTarget(target);
            if (target.isSelf) throw new ApplicationError('Kendi hesabınızı silemezsiniz.', 403);
            if (!target.isOwner) await this.requireReauth() // sahip olmayan birini kaldırma = step-up
            if (await this.isLastActiveOwner(target)) throw new ApplicationError('Mağazanın son sahibi silinemez.', 409);

            const user = target.existing;
            // 1. ClientDB'den sil
            await this.clientDB.getUserModel().deleteOne({ _id: user._id });
            // 2. ApplicationDB'den sil
            // ADR-0001 Karar 4: silmeden ÖNCE tokenVersion artırılır (silme yarım kalsa bile oturumlar düşer)
            await this.applicationDB.getUserModel().updateOne({ email: user.email, clientId: this.currentClientId }, { $inc: { tokenVersion: 1 } });
            await this.applicationDB.getUserModel().deleteOne({ email: user.email, clientId: this.currentClientId });
            getIdentityCache().invalidateTenant(this.currentClientId); // ADR-0024 P1-CORE: silinen kullanıcının önbellek girdisi düşer
            void AuditLogger.fromRequest(this.request, 'user.delete', 'ok', { targetUserId: String(user._id), targetRole: typeof user.roleCode === 'string' ? user.roleCode : undefined });

            return true;
        } catch (error) {
            throw error;
        }
    }


    // ---------------------------------------------------------------------------------------------------------------------
    // [ADR-0028 WP-A4] Davet / askıya alma / sahiplik devri. İş kuralları operations/users/{invitations,suspension,ownership}.ts'te.
    // ---------------------------------------------------------------------------------------------------------------------

    private memberDeps() {
        const tid = Number(this.currentClientId);
        return {
            tid,
            applicationDB: this.applicationDB,
            getClientDB: async (t: number) => (t === tid && this.clientDB ? this.clientDB : await DatabaseManagerInstance.getClientDB(t)),
            actor: {
                sub: String(this.request?.principal?.sub ?? ''),
                rank: actorRank(this.request.userContext, this.request.principal),
                imp: this.request?.principal?.imp === true,
                ip: this.request?.requestMeta?.ip as string | undefined,
            },
        };
    }

    /** `inviteUser {email, role}` -> davet DTO'su (token/özet ASLA dönmez; token yalnız e-postadadır). */
    async inviteUser(): Promise<any> {
        const d = this.memberDeps();
        return await new InvitationService({ applicationDB: d.applicationDB, getClientDB: d.getClientDB, mailSender: defaultMailSender }).invite(d.tid, d.actor, { email: this.request.email, role: this.request.role });
    }

    async resendInvitation(): Promise<any> {
        const d = this.memberDeps();
        return await new InvitationService({ applicationDB: d.applicationDB, getClientDB: d.getClientDB, mailSender: defaultMailSender }).resend(d.tid, d.actor, this.request.invitationId);
    }

    async revokeInvitation(): Promise<any> {
        const d = this.memberDeps();
        return await new InvitationService({ applicationDB: d.applicationDB, getClientDB: d.getClientDB, mailSender: defaultMailSender }).revoke(d.tid, d.actor, this.request.invitationId);
    }

    async listInvitations(): Promise<any> {
        const d = this.memberDeps();
        return await new InvitationService({ applicationDB: d.applicationDB, getClientDB: d.getClientDB, mailSender: defaultMailSender }).list(d.tid, { status: this.request.status });
    }

    /** `suspendUser {userId, reason?}`: hedefin oturumları anında düşer (tokenVersion++ + kimlik önbelleği). */
    async suspendUser(): Promise<any> {
        const d = this.memberDeps();
        return await new SuspensionService({ applicationDB: d.applicationDB, getClientDB: d.getClientDB }).suspend(d.tid, d.actor, { userId: this.request.userId, reason: this.request.reason });
    }

    async reactivateUser(): Promise<any> {
        const d = this.memberDeps();
        return await new SuspensionService({ applicationDB: d.applicationDB, getClientDB: d.getClientDB }).reactivate(d.tid, d.actor, { userId: this.request.userId });
    }

    private ownership(d: ReturnType<UserService['memberDeps']>): OwnershipService {
        return new OwnershipService({ applicationDB: d.applicationDB, getClientDB: d.getClientDB, mailSender: defaultMailSender });
    }

    /** Adım 1 (yalnız sahip + step-up: `AccountService/reauthenticate` <= 5 dk). */
    async initiateOwnershipTransfer(): Promise<any> {
        const d = this.memberDeps();
        return await this.ownership(d).initiate(d.tid, d.actor, { targetUserId: this.request.targetUserId });
    }

    async cancelOwnershipTransfer(): Promise<any> {
        const d = this.memberDeps();
        return await this.ownership(d).cancel(d.tid, d.actor);
    }

    /** Adım 2: hedef (oturum açık) e-postadaki belirteçle kabul eder; iki tarafın oturumları düşer (yeniden giriş). */
    async acceptOwnershipTransfer(): Promise<any> {
        const d = this.memberDeps();
        return await this.ownership(d).accept(d.tid, d.actor, { token: this.request.token });
    }

}

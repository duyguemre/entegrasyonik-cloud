import { IService } from '@interfaces/index'
import { getIdentityCache } from '@platform/core/security/identityCache'
import { BaseApi } from '../../BaseApi'
import Security, { ApplicationError, SessionClaimsInput } from '@platform/core/security/Security'
import { toProfileDto } from '../../profileDto'
import { resolveProfileSource } from '../../membershipAuthz'
import type { SessionResult } from '../../sessionResult'
import { AuditLogger } from '@services/audit/AuditLogger'
import { TenantProvisioningService } from '@operations/tenant/TenantProvisioningService'
import { AccountLifecycleService, runInBackground } from '@operations/account/AccountLifecycleService'
import { config } from '@config'
import { buildUserContext } from '../../authenticate'
import { defaultTicketRedis, IMPERSONATION_SESSION_SECONDS, redeemImpersonationTicket } from '../../admin/impersonationTicket'

/** ADR-0001 Karar 10: kullanıcı-yok / yanlış-parola / kilitli / pasif için AYNI mesaj (kullanıcı enumeration yok). */
export const GENERIC_LOGIN_ERROR = 'E-posta veya parola hatalı'

export default class SecurityService extends BaseApi implements IService {

    async get(): Promise<any> {
    }

    /**
     * ADR-0003 Karar A: tenant oluşturma TEK serviste (TenantProvisioningService). Bu metot yalnızca açık alan listesini
     * (ad, soyad, e-posta, parola, isteğe bağlı mağaza adı) iletir; `registerValues`'in geri kalanı YOK SAYILIR (mass-assignment yok).
     * Yanıt ADR-0001 Karar 12 gereği profil DTO'sudur (parola özeti/tokenVersion yok); oturum claim'leri ayrı kanaldan döner.
     */
    async register() {
        const values: any = this.request.registerValues;
        if (!values || typeof values !== 'object' || Array.isArray(values)) {
            throw new ApplicationError('Geçersiz istek.', 400);
        }
        const provisioning = new TenantProvisioningService({ applicationDB: this.applicationDB });
        const result = await provisioning.provision(
            {
                name: values.name,
                surname: values.surname,
                email: values.email,
                password: values.password,
                password2: values.password2,
                storeName: values.storeName,
            },
            { ip: this.request.requestMeta?.ip },
        );
        const u: any = result.user;
        const created = typeof u.toObject === 'function' ? u.toObject() : u;
        // E-posta doğrulama (docs/API_ACCOUNT_LIFECYCLE.md): kayıt BAŞARISINI etkilemez (best-effort, arka planda). Doğrulanmamış hesap
        // girişten ENGELLENMEZ (zorunlu kılma ayrı insan kararı). PUBLIC_APP_URL yoksa yalnızca uyarı loglanır.
        runInBackground(
            new AccountLifecycleService({ applicationDB: this.applicationDB })
                .issueEmailVerification({ _id: created._id, email: created.email, emailVerified: created.emailVerified }, { ip: this.request.requestMeta?.ip })
                .catch((e: any) => { console.warn('[SecurityService.register] doğrulama e-postası hazırlanamadı:', e?.message); }),
        );
        return { sessionClaims: Security.claimsFromUser(created), body: toProfileDto(created) } as SessionResult;
    }


    async login() {
        try {
            const { username, password } = this.request;
            const security = Security.getInstance();

            // ADR-0001 Karar 10: yalnızca string (NoSQL operatör enjeksiyonu: { "$ne": null } vb. reddedilir)
            if (typeof username !== 'string' || typeof password !== 'string'
                || username.length === 0 || password.length === 0 || username.length > 320 || password.length > 1024) {
                throw new ApplicationError('Geçersiz istek.', 400);
            }

            const userModel = this.applicationDB.getUserModel();

            // 1. Kullanıcıyı bul (Sadece Central DB'den, Registry mantığıyla)
            const user = await userModel.findOne({ email: username });

            // Kullanıcı yok / pasif / kilitli: parola bakılmadan reddedilir ama zamanlamayı yaklaştırmak için sahte bcrypt
            // karşılaştırması yapılır ve AYNI generik hata döner (hangi durumun olduğu istemciye sızmaz)
            const locked = !!(user && user.lockUntil && user.lockUntil > new Date());
            if (!user || user.isActive === false || locked) {
                await security.comparePassword(password, await security.getDummyHash());
                throw new ApplicationError(GENERIC_LOGIN_ERROR, 401);
            }

            // [ADR-0028 WP-A5] Sahte captcha KALDIRILDI (istemcide görünen, doğrulanmayan kod bot koruması değildi). Gerçek koruma: IP hız sınırlayıcı
            // (loginLimiter) + 5 hatalı denemede 15 dk hesap kilidi. `captcha` gövde alanı yok sayılır (eski istemciler zarar görmez).

            // 4. Şifre Doğrulama (Bcrypt)
            const isMatch = await security.comparePassword(password, typeof user.password === 'string' ? user.password : await security.getDummyHash());

            if (isMatch) {
                // Başarılı giriş: Hatalı deneme sayısını sıfırla
                await userModel.updateOne({ _id: user._id }, {
                    $set: { failedLoginAttempts: 0 },
                    $unset: { lockUntil: 1 }
                });

                const userObj = user.toObject();
                // [ADR-0026 Aşama 3, BAYRAK: ADMIN_API_ONLY; varsayılan false] platform yöneticisi girişi `/api` üzerinde kapalı; yönetim uygulamasından.
                if (userObj.isGlobalAdmin && config.admin.apiOnly) {
                    throw new ApplicationError("Yönetim girişi yönetim uygulamasından yapılır.", 403, 'ADMIN_API_ONLY');
                }
                const sessionClaims = Security.claimsFromUser(userObj);
                // ADR-0028 WP-A3: `membership` modunda profil (permissions[]) üyelik rolünden; üyelik yok/askıda -> 403. legacy/dual: aynen.
                const profile = toProfileDto(await resolveProfileSource(this.applicationDB, userObj));

                // SÜPER YÖNETİCİ: Giriş sonrası mağaza seçimi zorunlu
                if (userObj.isGlobalAdmin) {
                    const clients = await this.applicationDB.getClientModel().find({ status: 'ACTIVE' }, 'clientId title').lean();
                    return {
                        sessionClaims,
                        body: { requireStoreSelection: true, clients: clients, user: profile }
                    } as SessionResult;
                }

                return { sessionClaims, body: profile } as SessionResult;
            } else {
                // Hatalı giriş: Deneme sayısını arttır
                const attempts = user.failedLoginAttempts + 1;
                const update: any = { $set: { failedLoginAttempts: attempts } };

                // 5 denemeden sonra 15 dk kilitle
                if (attempts >= 5) {
                    update.$set.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                }

                await userModel.updateOne({ _id: user._id }, update);
                if (attempts >= 5) getIdentityCache().invalidateUser(user._id); // ADR-0024 P1-CORE: kilit, açık oturumlara anında yansır

                throw new ApplicationError(GENERIC_LOGIN_ERROR, 401);
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * ADR-0001 Karar 6: yalnızca doğrulanmış ga==true principal; hedef tenant ACTIVE olmalı. Yeni oturum claim'leri
     * (imp:true, tid, tv/auth_time korunur) `sessionClaims` olarak döner; ApiManager bunu Set-Cookie ile yazar,
     * token GÖVDEDE DÖNMEZ. Gövde: { store, user (profil DTO) }. Olay audit log'a yazılır (best-effort).
     */
    async selectStore(): Promise<SessionResult> {
        const { clientId } = this.request;
        // userContext ve principal RunOperation tarafından, doğrulanmış token + merkezi Users belgesinden kurulur
        // (istemci gövdesindeki değerler ezilir).
        const userContext: any = this.request.userContext;
        const principal: any = this.request.principal;
        const tid = Number(clientId);
        const validTid = Number.isInteger(tid) && tid > 0;

        const fail = (message: string, statusCode: number, reason: string) => {
            void AuditLogger.fromRequest(this.request, 'selectStore', 'fail', { reason }, validTid ? { tid } : {});
            return new ApplicationError(message, statusCode);
        };

        if (!userContext || !userContext.isGlobalAdmin || !principal || principal.ga !== true) {
            throw fail("Bu işlem için Süper Yönetici yetkisi gereklidir.", 403, 'not_global_admin');
        }

        if (!validTid) {
            throw fail("Geçersiz mağaza.", 400, 'invalid_store');
        }

        // Hedef tenant mevcut ve ACTIVE olmalı (authenticate de sonraki isteklerde aynı kuralı uygular)
        const client: any = await this.applicationDB.getClientModel().findOne({ order: tid }, 'order clientId title status').lean();
        if (!client || client.status !== 'ACTIVE') {
            throw fail("Geçersiz mağaza.", 400, 'store_not_active');
        }

        // Yeni oturum: yalnızca asgari claim'ler; auth_time/tv korunur (7 gün sınırı ve iptal atlatılamaz).
        // Süper yönetici tenant bağlamında `admin` kademesinde kalır (owner değil; operationPolicy.resolveTier).
        const sessionClaims: SessionClaimsInput = {
            sub: principal.sub,
            tid,
            role: userContext.roleCode,
            ga: true,
            tv: principal.tv,
            imp: true,
            auth_time: principal.auth_time,
        };

        void AuditLogger.fromRequest(this.request, 'selectStore', 'ok', undefined, { tid });

        return {
            sessionClaims,
            body: {
                store: { clientId: client.clientId ?? tid, title: client.title },
                user: toProfileDto({ ...userContext, order: tid, clientId: tid }),
            },
        };
    }

    /**
     * [ADR-0026 Karar 4.9] AÇIK operasyon: tek geçerli kimlik, backoffice'in ürettiği 60 sn'lik TEK KULLANIMLIK bilettir (`GETDEL`; Redis yoksa reddedilir).
     * Başarıda `{sub: yönetici, tid, ga:true, imp:true}` oturumu basılır; ömür 30 dk (K41) ve UZATILMAZ (`fixedTtlSeconds` -> token `fx:true`).
     * Bilet tüketildikten sonra yönetici hesabı hâlâ geçerli olmalı (aktif, `isGlobalAdmin`, tokenVersion aynı) ve hedef tenant ACTIVE olmalı.
     * Geçersiz/kullanılmış/süresi dolmuş bilet için tek genel hata (ayrım yok).
     */
    async redeemImpersonation(): Promise<SessionResult> {
        const ip = this.request.requestMeta?.ip;
        const deny = (reason: string, extra: Partial<Parameters<typeof AuditLogger.log>[0]> = {}) => {
            void AuditLogger.log({ event: 'impersonation.redeem', result: 'fail', ip, surface: 'app', meta: { reason }, ...extra });
            return new ApplicationError('Geçersiz veya süresi dolmuş bilet.', 401);
        };
        const payload = await redeemImpersonationTicket(defaultTicketRedis(), this.request.ticket);
        if (!payload) throw deny('ticket_invalid');

        const user: any = await this.applicationDB.getUserModel().findById(payload.sub).lean();
        const tvNow = Number.isInteger(user?.tokenVersion) ? user.tokenVersion : 0;
        if (!user || user.isGlobalAdmin !== true || user.isActive === false || tvNow !== payload.tv
            || (user.lockUntil && new Date(user.lockUntil) > new Date())) {
            throw deny('admin_invalid', { sub: payload.sub, tid: payload.tid });
        }
        const client: any = await this.applicationDB.getClientModel().findOne({ order: payload.tid }, 'order clientId title status').lean();
        if (!client || client.status !== 'ACTIVE') throw deny('store_not_active', { sub: payload.sub, tid: payload.tid });

        const sessionClaims: SessionClaimsInput = {
            sub: String(user._id), tid: payload.tid, role: user.roleCode, ga: true, tv: tvNow, imp: true,
            fixedTtlSeconds: IMPERSONATION_SESSION_SECONDS, impReason: payload.reason,
        };
        void AuditLogger.log({
            event: 'impersonation.redeem', result: 'ok', sub: String(user._id), tid: payload.tid, ip,
            actorType: 'impersonator', onBehalfOf: payload.tid, surface: 'app', imp: true, meta: { reason: payload.reason },
        });
        return {
            sessionClaims,
            body: {
                store: { clientId: client.clientId ?? payload.tid, title: client.title },
                user: toProfileDto(buildUserContext({ ...user, order: payload.tid, clientId: payload.tid }, { tid: payload.tid, ga: true })),
                impersonation: { expiresAt: new Date(Date.now() + IMPERSONATION_SESSION_SECONDS * 1000).toISOString() },
            },
        };
    }

    async logout() {
        try {
            return true
        } catch (error) {
            throw error
        }
    }
}

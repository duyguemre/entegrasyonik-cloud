// B12 (ADR-0026, BACKOFFICE_PLAN §2.8): platform yoneticisi yonetimi -- liste / davet / kapat-ac / MFA sifirla / davet kabulu.
// Saf is mantigi: HTTP/cerez bilmez; tum bagimliliklar (DB modelleri, e-posta, saat, backoffice taban URL'si) enjekte edilir (testler DB/SMTP'ye baglanmaz).
// GUVENLIK KARARLARI (docs/API_BACKOFFICE_ADMINS.md):
//  - "Platform yoneticisi" = `Users.isGlobalAdmin === true`. Mevcut bir kullanicinin e-postasina davet REDDEDILIR (ADMIN_INVITE_EXISTING_USER): tenant
//    kullanicisina sessizce platform yetkisi vermek yerine ayri bir e-posta ile yeni hesap acilir (guvenli varsayilan).
//  - Davet = bekleyen bir `Users` taslagi (isActive:false, adminInvitePending:true, rastgele/kullanilamaz parola ozeti) + `AccountTokens`
//    `purpose:'admin_invite'` (256 bit, yalniz sha256 saklanir, tek kullanim, 48 sa). Taslak, kabul edilene dek giris yapamaz (`isActive:false`).
//  - Hicbir yanitta/denetimde sir, TOTP tohumu, kurtarma kodu, parola ozeti, token YOKTUR (liste alanlari beyaz listeli).
//  - Kendini kapatma/MFA sifirlama yasak; son aktif yonetici kapatilamaz (kapatmadan SONRA yeniden sayilir; yarisma varsa geri alinir).
import { ApplicationError } from '@platform/core/errors';
import { getIdentityCache } from '@platform/core/security/identityCache';
import { AuditLogger } from '@services/audit/AuditLogger';
import Security from '@platform/core/security/Security';
import { getRequestId } from '@platform/core/context';
import { EMAIL_MAX_LENGTH, EMAIL_RE, NAME_MAX_LENGTH, normalizeEmail } from '../../operations/tenant/provisionInput';
import { assertPasswordStrength } from '../../operations/account/passwordPolicy';
import { ADMIN_INVITE_TTL_MS, generateToken, hashToken, isWellFormedToken, issueToken, revokeOutstanding } from '../../operations/account/accountTokens';
import { adminInvitationMail } from '../../operations/account/accountMailTemplates';
import type { AdminMfaStore } from './adminMfaStore';

export type MailSender = (to: string, subject: string, text: string, html?: string) => Promise<void>;

export interface AdminUserDeps {
    applicationDB: { getUserModel(): any; getAccountTokenModel(): any; getAdminMfaModel(): any; getAuditLogModel(): any };
    mfaStore: AdminMfaStore;
    mailSender: MailSender;
    /** Backoffice SPA taban adresi (kabul sayfasi orada). Yoksa/gecersizse null. */
    backofficeBaseUrl: () => string | null;
    now?: () => number;
}

export interface AdminActor { sub: string; ip?: string }

export type AdminStatus = 'active' | 'disabled' | 'invited';

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const DUP = (e: any) => !!e && (e.code === 11000 || e.code === 11001);
const LOGIN_EVENTS = ['backoffice.mfa_verify', 'backoffice.mfa_enroll'];
const LIST_LIMIT = 200;

export const ADMIN_INVITE_INVALID_MESSAGE = 'Davet bağlantısı geçersiz veya süresi dolmuş.';

const activeFilter = { isGlobalAdmin: true, isActive: { $ne: false }, adminInvitePending: { $ne: true } };

export class AdminUserManager {
    private readonly now: () => number;
    constructor(private readonly d: AdminUserDeps) { this.now = d.now ?? (() => Date.now()); }

    private users() { return this.d.applicationDB.getUserModel(); }

    private audit(event: string, actor: AdminActor | undefined, result: 'ok' | 'fail' | 'error', meta: Record<string, string | number | boolean>): void {
        void AuditLogger.log({ event, result, sub: actor?.sub, ip: actor?.ip, surface: 'backoffice', actorType: 'platform', reqId: getRequestId(), meta });
    }

    private assertSub(sub: unknown): string {
        if (typeof sub !== 'string' || !OBJECT_ID.test(sub)) throw new ApplicationError('Geçersiz yönetici.', 400, 'VALIDATION');
        return sub;
    }

    private async loadTarget(sub: string): Promise<any> {
        const t: any = await this.users().findOne({ _id: sub, isGlobalAdmin: true }, '_id isActive adminInvitePending').lean();
        if (!t) throw new ApplicationError('Yönetici bulunamadı.', 404, 'NOT_FOUND');
        return t;
    }

    private invalidate(sub: string): void { getIdentityCache().invalidateUser(sub); }

    // ---------------------------------------------------------------------------------------------------------------
    /** Platform yoneticileri. Beyaz liste: sir/kurtarma/parola/token ASLA. `lastLoginAt` = son basarili tam giris (audit, TOTP dogrulamasi). */
    async list(): Promise<{ items: Array<Record<string, unknown>> }> {
        const docs: any[] = await this.users().find({ isGlobalAdmin: true }, '_id email name surname isActive adminInvitePending lockUntil createdAt').sort({ createdAt: 1, _id: 1 }).limit(LIST_LIMIT).lean();
        const subs = docs.map((u) => String(u._id));
        const mfaDocs: any[] = subs.length ? await this.d.applicationDB.getAdminMfaModel().find({ sub: { $in: subs } }, 'sub enabledAt lockUntil').lean() : [];
        const mfaBySub = new Map(mfaDocs.map((m) => [String(m.sub), m]));
        const last = new Map<string, Date>();
        if (subs.length) {
            const rows: any[] = await this.d.applicationDB.getAuditLogModel().aggregate([
                { $match: { event: { $in: LOGIN_EVENTS }, result: 'ok', sub: { $in: subs } } },
                { $group: { _id: '$sub', at: { $max: '$at' } } },
            ]).option({ maxTimeMS: 5000 });
            for (const r of rows) last.set(String(r._id), r.at);
        }
        const nowMs = this.now();
        const locked = (d: any) => !!d && !!d.lockUntil && new Date(d.lockUntil).getTime() > nowMs;
        return {
            items: docs.map((u) => {
                const sub = String(u._id);
                const mfa = mfaBySub.get(sub);
                const status: AdminStatus = u.adminInvitePending === true ? 'invited' : u.isActive === false ? 'disabled' : 'active';
                return {
                    sub, email: u.email, name: u.name, surname: u.surname, status,
                    mfaEnabled: !!mfa?.enabledAt,
                    lastLoginAt: last.get(sub) ?? null,
                    locked: locked(u) || locked(mfa),
                    createdAt: u.createdAt ?? null,
                };
            }),
        };
    }

    // ---------------------------------------------------------------------------------------------------------------
    /** Davet (yeni platform yoneticisi). Bekleyen davet varsa yenilenir (eski token gecersiz). */
    async invite(actor: AdminActor, input: { email: unknown; reason?: string }): Promise<{ sub: string; status: 'invited'; expiresAt: Date; renewed: boolean }> {
        const email = typeof input.email === 'string' ? normalizeEmail(input.email) : undefined;
        if (!email || email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) throw new ApplicationError('Geçerli bir e-posta adresi giriniz.', 400, 'VALIDATION');
        const base = this.d.backofficeBaseUrl();
        // Baglanti tabani yoksa HICBIR sey yazilmadan dur
        if (!base) throw new ApplicationError('Yönetici daveti şu an gönderilemiyor.', 503, 'ADMIN_INVITE_UNAVAILABLE');

        const existing: any = await this.users().findOne({ email }, '_id isGlobalAdmin adminInvitePending').lean();
        let sub: string;
        let renewed = false;
        if (existing) {
            // Yalniz bizim olusturdugumuz BEKLEYEN taslak yenilenir; baska her mevcut kullanici (tenant/yonetici) reddedilir.
            if (!(existing.isGlobalAdmin === true && existing.adminInvitePending === true)) {
                this.audit('backoffice.admin.invite', actor, 'fail', { why: 'existing_user', ...(input.reason ? { reason: input.reason } : {}) });
                throw new ApplicationError('Bu e-posta adresi zaten bir kullanıcıya ait.', 409, 'ADMIN_INVITE_EXISTING_USER');
            }
            sub = String(existing._id);
            renewed = true;
        } else {
            const security = Security.getInstance();
            const unusable = await security.hashPassword(generateToken()); // kimsenin bilmedigi rastgele parola: taslak ile giris imkansiz
            try {
                const created: any = await this.users().create({
                    email, name: 'Davetli', surname: 'Yönetici', password: unusable, isGlobalAdmin: true, owner: false, isActive: false,
                    adminInvitePending: true, emailVerified: false, tokenVersion: 0, invitedBy: actor.sub,
                });
                sub = String(created._id ?? created.id);
            } catch (e) {
                if (DUP(e)) throw new ApplicationError('Bu e-posta adresi zaten bir kullanıcıya ait.', 409, 'ADMIN_INVITE_EXISTING_USER');
                throw e;
            }
        }
        const issued = await issueToken(this.d.applicationDB.getAccountTokenModel(), sub, 'admin_invite', { ip: actor.ip, now: this.now() });
        this.audit('backoffice.admin.invite', actor, 'ok', { targetSub: sub, renewed, ...(input.reason ? { reason: input.reason } : {}) });
        const link = `${base}/accept-invite#t=${encodeURIComponent(issued.token)}`;
        const mail = adminInvitationMail(link, Math.round(ADMIN_INVITE_TTL_MS / 3_600_000));
        try {
            await this.d.mailSender(email, mail.subject, mail.text, mail.html);
        } catch {
            // Davet kaydedildi ama e-posta gitmedi: ayni uc yeniden cagrilarak yenilenir/yeniden gonderilir. Hata ayrintisi yanit/denetime GIRMEZ.
            this.audit('backoffice.admin.invite', actor, 'error', { targetSub: sub, why: 'mail_failed' });
            throw new ApplicationError('Davet kaydedildi ancak e-posta gönderilemedi. Daveti yeniden gönderebilirsiniz.', 503, 'ADMIN_INVITE_UNAVAILABLE');
        }
        return { sub, status: 'invited', expiresAt: issued.expiresAt, renewed };
    }

    // ---------------------------------------------------------------------------------------------------------------
    /** Kapat. Bekleyen davet ise taslak + token silinir (davet iptali). Aksi: isActive=false, tokenVersion++ (tum oturumlar olur). */
    async disable(actor: AdminActor, input: { sub: unknown; reason?: string }): Promise<{ sub: string; status: AdminStatus | 'revoked' }> {
        const sub = this.assertSub(input.sub);
        if (sub === actor.sub) throw new ApplicationError('Bu işlemi kendi hesabınız üzerinde yapamazsınız.', 403, 'ADMIN_SELF_ACTION');
        const target = await this.loadTarget(sub);
        const meta = { targetSub: sub, ...(input.reason ? { reason: input.reason } : {}) };
        if (target.adminInvitePending === true) {
            await revokeOutstanding(this.d.applicationDB.getAccountTokenModel(), sub, 'admin_invite', this.now());
            await this.users().deleteOne({ _id: sub, isGlobalAdmin: true, adminInvitePending: true });
            this.invalidate(sub);
            this.audit('backoffice.admin.invite_revoke', actor, 'ok', meta);
            return { sub, status: 'revoked' };
        }
        if (target.isActive === false) return { sub, status: 'disabled' };
        // Son aktif yonetici korumasi: kendimiz haric (self yasak) en az bir BASKA aktif yonetici olmali (on kontrol)
        if ((await this.users().countDocuments({ ...activeFilter, _id: { $ne: sub } })) < 1) {
            this.audit('backoffice.admin.disable', actor, 'fail', { ...meta, why: 'last_admin' });
            throw new ApplicationError('Son aktif platform yöneticisi kapatılamaz.', 409, 'LAST_PLATFORM_ADMIN');
        }
        const r = await this.users().updateOne({ _id: sub, ...activeFilter }, { $set: { isActive: false }, $inc: { tokenVersion: 1 } });
        this.invalidate(sub);
        if ((r?.modifiedCount ?? 0) === 1) {
            // Yarisma korumasi: iki yonetici ayni anda birbirini kapatirsa ikisi de on kontrolden gecebilir -> sonrasi sayilir, sifirsa geri al.
            if ((await this.users().countDocuments(activeFilter)) < 1) {
                await this.users().updateOne({ _id: sub, isGlobalAdmin: true }, { $set: { isActive: true } });
                this.invalidate(sub);
                this.audit('backoffice.admin.disable', actor, 'fail', { ...meta, why: 'last_admin_race' });
                throw new ApplicationError('Son aktif platform yöneticisi kapatılamaz.', 409, 'LAST_PLATFORM_ADMIN');
            }
        }
        this.audit('backoffice.admin.disable', actor, 'ok', meta);
        return { sub, status: 'disabled' };
    }

    /** Yeniden ac. Bekleyen davet acilamaz (parola yok; kabul sayfasindan etkinlesir). Idempotent. */
    async enable(actor: AdminActor, input: { sub: unknown; reason?: string }): Promise<{ sub: string; status: AdminStatus }> {
        const sub = this.assertSub(input.sub);
        const target = await this.loadTarget(sub);
        if (target.adminInvitePending === true) throw new ApplicationError('Bekleyen davet doğrudan etkinleştirilemez; davet kabul edilmelidir.', 409, 'CONFLICT');
        if (target.isActive !== false) return { sub, status: 'active' };
        await this.users().updateOne({ _id: sub, isGlobalAdmin: true, adminInvitePending: { $ne: true } }, { $set: { isActive: true, failedLoginAttempts: 0 }, $unset: { lockUntil: 1 }, $inc: { tokenVersion: 1 } });
        this.invalidate(sub);
        this.audit('backoffice.admin.enable', actor, 'ok', { targetSub: sub, ...(input.reason ? { reason: input.reason } : {}) });
        return { sub, status: 'active' };
    }

    /** Hedefin AdminMfa kaydini siler (sonraki giriste yeniden kayit). Mevcut oturumlar da kapanir (tokenVersion++). Kendi MFA'si sifirlanamaz. */
    async resetMfa(actor: AdminActor, input: { sub: unknown; reason?: string }): Promise<{ sub: string; mfaEnabled: false }> {
        const sub = this.assertSub(input.sub);
        if (sub === actor.sub) throw new ApplicationError('Bu işlemi kendi hesabınız üzerinde yapamazsınız.', 403, 'ADMIN_SELF_ACTION');
        const target = await this.loadTarget(sub);
        if (target.adminInvitePending === true) throw new ApplicationError('Bekleyen davetin MFA kaydı yoktur.', 409, 'CONFLICT');
        await this.d.mfaStore.reset(sub);
        await this.users().updateOne({ _id: sub, isGlobalAdmin: true }, { $inc: { tokenVersion: 1 } });
        this.invalidate(sub);
        this.audit('backoffice.admin.mfa_reset', actor, 'ok', { targetSub: sub, ...(input.reason ? { reason: input.reason } : {}) });
        return { sub, mfaEnabled: false };
    }

    // ---------------------------------------------------------------------------------------------------------------
    /**
     * Davet kabulu (KIMLIKSIZ uc; `/admin-api/BackofficeAuthService/acceptInvite`). Sira: bicim -> parola politikasi (token YAKILMADAN) -> atomik tuketim
     * -> taslagi etkinlestir. Her token/taslak hatasi AYNI genel hata (`ADMIN_INVITE_INVALID`). Oturum ACILMAZ: kullanici giris + TOTP kaydiyla devam eder.
     */
    async acceptInvite(input: { token: unknown; name: unknown; surname: unknown; password: unknown }, ip?: string): Promise<{ accepted: true }> {
        const invalid = () => new ApplicationError(ADMIN_INVITE_INVALID_MESSAGE, 400, 'ADMIN_INVITE_INVALID');
        if (!isWellFormedToken(input.token)) throw invalid();
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        const surname = typeof input.surname === 'string' ? input.surname.trim() : '';
        if (!name || !surname || name.length > NAME_MAX_LENGTH || surname.length > NAME_MAX_LENGTH) throw new ApplicationError('Ad ve soyad gerekli.', 400, 'VALIDATION');
        const tokens = this.d.applicationDB.getAccountTokenModel();
        const nowMs = this.now();
        const rec: any = await tokens.findOne({ tokenHash: hashToken(input.token), purpose: 'admin_invite', usedAt: null, expiresAt: { $gt: new Date(nowMs) } }).lean();
        if (!rec || typeof rec.sub !== 'string') throw invalid();
        const user: any = await this.users().findOne({ _id: rec.sub, isGlobalAdmin: true, adminInvitePending: true }, '_id email').lean();
        if (!user) throw invalid();
        const password = assertPasswordStrength(input.password, { email: user.email, name, surname });
        // Atomik tek kullanim
        const consumed: any = await tokens.findOneAndUpdate(
            { tokenHash: hashToken(input.token), purpose: 'admin_invite', usedAt: null, expiresAt: { $gt: new Date(nowMs) } },
            { $set: { usedAt: new Date(nowMs) } }, { new: false },
        ).lean();
        if (!consumed) throw invalid();
        const hash = await Security.getInstance().hashPassword(password);
        const r = await this.users().updateOne(
            { _id: rec.sub, isGlobalAdmin: true, adminInvitePending: true },
            { $set: { name, surname, password: hash, isActive: true, emailVerified: true, emailVerifiedAt: new Date(nowMs), passwordChangedAt: new Date(nowMs), failedLoginAttempts: 0 }, $unset: { adminInvitePending: 1, lockUntil: 1 }, $inc: { tokenVersion: 1 } },
        );
        this.invalidate(rec.sub);
        if ((r?.modifiedCount ?? 0) !== 1) throw invalid();
        this.audit('backoffice.admin.invite_accept', { sub: rec.sub, ip }, 'ok', { targetSub: rec.sub });
        return { accepted: true };
    }
}

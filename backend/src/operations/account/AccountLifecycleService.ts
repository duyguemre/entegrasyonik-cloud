import type { IApplicationDB, IClientDB } from '@interfaces/index';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { AuditLogger } from '@services/audit/AuditLogger';
import Security, { ApplicationError, SessionClaimsInput } from '../../api/Security';
import { EMAIL_MAX_LENGTH, EMAIL_RE, normalizeEmail } from '../tenant/provisionInput';
import { PASSWORD_INPUT_MAX_LENGTH, assertPasswordStrength } from './passwordPolicy';
import {
    EMAIL_VERIFY_TTL_MS, PASSWORD_RESET_TTL_MS, consumeToken, isWellFormedToken, isWithinCooldown, issueToken, peekToken, revokeOutstanding,
} from './accountTokens';
import { emailVerificationMail, passwordChangedMail, passwordResetMail } from './accountMailTemplates';

/**
 * Kimlik hesabı yaşam döngüsü (parola değiştir / parola sıfırla / e-posta doğrula). Sözleşme: docs/API_ACCOUNT_LIFECYCLE.md.
 * ADR-0001 login desenleri: string-only girdi, bcrypt, sahte-bcrypt ile zamanlama yaklaştırma, hata yanıtında bilgi sızdırmama,
 * tokenVersion artışı ile oturum iptali, AuditLogs (PII yok: e-posta/parola/token YAZILMAZ).
 *
 * Bu sınıf HTTP/cookie bilmez; ApiManager/AccountService sarmalar. Tüm dış bağımlılıklar (DB, e-posta, saat) enjekte edilebilir.
 */

export type MailSender = (to: string, subject: string, text: string, html?: string) => Promise<void>;

/** Varsayılan gönderici: mevcut MailService (lazy import: modül yüklemek SMTP taşıyıcısını/dotenv'i tetiklemesin; testler sahte gönderici verir). */
const defaultMailSender: MailSender = async (to, subject, text, html) => {
    const { mailService } = await import('@services/mail/MailService');
    await mailService.send(to, subject, text, html);
};

export const GENERIC_RESET_MESSAGE = 'Bu e-posta adresi kayıtlıysa parola sıfırlama bağlantısı gönderildi.';
export const TOKEN_INVALID_MESSAGE = 'Bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bir bağlantı isteyin.';
export const INVALID_REQUEST_MESSAGE = 'Geçersiz istek.';
export const INVALID_CURRENT_PASSWORD_MESSAGE = 'Mevcut parola hatalı.';
export const EMAIL_NOT_CONFIGURED_MESSAGE = 'E-posta bağlantıları şu anda oluşturulamıyor. Lütfen daha sonra tekrar deneyin.';

export const CODES = {
    INVALID_REQUEST: 'INVALID_REQUEST',
    INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
    SAME_PASSWORD: 'SAME_PASSWORD',
    TOKEN_INVALID: 'TOKEN_INVALID',
    EMAIL_NOT_CONFIGURED: 'EMAIL_NOT_CONFIGURED',
    CONFLICT: 'CONFLICT',
    COOLDOWN: 'COOLDOWN',
    MAIL_FAILED: 'MAIL_FAILED',
} as const;

/** Kilit eşiği login ile AYNI (5 hatalı deneme -> 15 dk). Yanlış "mevcut parola" denemeleri de sayaca yazılır. */
const LOCK_AFTER_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

// --- Arka plan işleri (yanıt süresi kullanıcı varlığını sızdırmasın diye e-posta/DB işi yanıttan sonra yapılır) ---
const pending = new Set<Promise<unknown>>();
/** Hata YUTULUR (loglanır); çağıran akışı asla düşürmez. */
export function runInBackground(work: Promise<unknown>): void {
    const p: Promise<unknown> = work.catch((e: any) => { console.error('[AccountLifecycle] arka plan işi başarısız:', e?.message); });
    pending.add(p);
    void p.finally(() => pending.delete(p));
}
/** YALNIZCA testler için: bekleyen arka plan işlerinin bitmesini bekler. */
export async function drainBackground(): Promise<void> {
    while (pending.size > 0) await Promise.all(Array.from(pending));
}

/**
 * PUBLIC_APP_URL (bağlantı tabanı): https, ya da yalnızca localhost/127.0.0.1 için http. Yol öneki olabilir; sorgu/parça/kimlik bilgisi olamaz.
 * Tanımsız/geçersizse açık hata (503 EMAIL_NOT_CONFIGURED) + log; süreç BAŞLATMAYI engellemez (fail-fast değil).
 */
export function resolvePublicAppUrl(): string {
    const raw = (process.env.PUBLIC_APP_URL || '').trim();
    const fail = (why: string): never => {
        console.error(`[AccountLifecycle] PUBLIC_APP_URL ${why}; parola sıfırlama/e-posta doğrulama bağlantısı üretilemiyor.`);
        throw new ApplicationError(EMAIL_NOT_CONFIGURED_MESSAGE, 503, CODES.EMAIL_NOT_CONFIGURED);
    };
    if (!raw) return fail('tanımlı değil');
    let u: URL;
    try { u = new URL(raw); } catch { return fail('geçerli bir URL değil'); }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return fail('https olmalı (yalnızca localhost için http)');
    if (u.username || u.password || u.search || u.hash) return fail('kimlik bilgisi/sorgu/parça içeremez');
    return (u.origin + u.pathname).replace(/\/+$/, '');
}

const toPlain = (doc: any): any => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

export interface AccountLifecycleDeps {
    applicationDB: IApplicationDB;
    security?: Security;
    mailSender?: MailSender;
    getClientDB?: (order: number) => Promise<IClientDB | undefined>;
    now?: () => number;
}

export interface ChangePasswordInput {
    /** Doğrulanmış principal (RunOperation): sub/tid/ga/imp/auth_time. */
    principal: { sub: string; tid?: number; ga?: boolean; imp?: boolean; auth_time?: number } | undefined;
    currentPassword: unknown;
    newPassword: unknown;
    ip?: string;
}

export class AccountLifecycleService {
    private readonly db: IApplicationDB;
    private readonly security: Security;
    private readonly send: MailSender;
    private readonly getClientDB: (order: number) => Promise<IClientDB | undefined>;
    private readonly now: () => number;

    constructor(deps: AccountLifecycleDeps) {
        this.db = deps.applicationDB;
        this.security = deps.security ?? Security.getInstance();
        this.send = deps.mailSender ?? defaultMailSender;
        this.getClientDB = deps.getClientDB ?? ((order: number) => DatabaseManagerInstance.getClientDB(order));
        this.now = deps.now ?? (() => Date.now());
    }

    // ------------------------------------------------------------------------------------------------------------------
    // (1) Oturum açmış kullanıcı: parola değiştir
    // ------------------------------------------------------------------------------------------------------------------

    /**
     * Mevcut parolayı doğrular, yeni parolayı politikaya karşı denetler, `password` + `tokenVersion++` yazar (CAS: eşzamanlı ikinci
     * değişim 409). Diğer tüm oturumlar düşer (tv uyuşmazlığı); çağıran oturum için yeni claim'ler döner (çerezi ApiManager basar).
     */
    public async changePassword(input: ChangePasswordInput): Promise<{ sessionClaims: SessionClaimsInput; body: { success: true } }> {
        const { principal, currentPassword, newPassword, ip } = input;
        if (!principal || typeof principal.sub !== 'string' || !principal.sub) throw new ApplicationError('Token is undefined', 401);

        // ADR-0001 Karar 10: yalnızca string (NoSQL operatör enjeksiyonu / tip karışıklığı reddedilir) + uzunluk sınırı (bcrypt maliyeti)
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string'
            || currentPassword.length === 0 || newPassword.length === 0
            || currentPassword.length > PASSWORD_INPUT_MAX_LENGTH || newPassword.length > PASSWORD_INPUT_MAX_LENGTH) {
            throw new ApplicationError(INVALID_REQUEST_MESSAGE, 400, CODES.INVALID_REQUEST);
        }

        const userModel = this.db.getUserModel();
        let user: any;
        try {
            user = await userModel.findById(principal.sub).lean();
        } catch (e: any) {
            if (e && e.name === 'CastError') user = null; else throw e;
        }
        if (!user || user.isActive === false || typeof user.password !== 'string') {
            // Oturum sahibi artık yok/pasif: authenticate zaten reddeder; sahte bcrypt ile zamanlamayı yaklaştır, genel hata
            await this.security.comparePassword(currentPassword, await this.security.getDummyHash());
            throw new ApplicationError('Token not verified', 401);
        }

        // Yeni parola politikası (cheap; kullanıcı bağlamı: e-posta/ad/soyad içermemeli)
        try {
            assertPasswordStrength(newPassword, { email: user.email, name: user.name, surname: user.surname });
        } catch (e) {
            void AuditLogger.log({ event: 'user.password_change', result: 'fail', sub: principal.sub, tid: principal.tid, ip, meta: { reason: 'weak_password' } });
            throw e;
        }

        const currentOk = await this.security.comparePassword(currentPassword, user.password);
        if (!currentOk) {
            await this.recordFailedAttempt(user);
            void AuditLogger.log({ event: 'user.password_change', result: 'fail', sub: principal.sub, tid: principal.tid, ip, meta: { reason: 'wrong_current' } });
            // 400 (401 DEĞİL): FE'nin 401 -> giriş sayfasına yönlendirme yakalayıcısını tetiklemesin
            throw new ApplicationError(INVALID_CURRENT_PASSWORD_MESSAGE, 400, CODES.INVALID_CURRENT_PASSWORD);
        }

        if (await this.security.comparePassword(newPassword, user.password)) {
            void AuditLogger.log({ event: 'user.password_change', result: 'fail', sub: principal.sub, tid: principal.tid, ip, meta: { reason: 'same_password' } });
            throw new ApplicationError('Yeni parola mevcut parolayla aynı olamaz.', 400, CODES.SAME_PASSWORD);
        }

        const hash = await this.security.hashPassword(newPassword);
        const nowDate = new Date(this.now());
        // CAS: filtre mevcut özeti içerir; arada başka bir istek parolayı değiştirdiyse hiçbir şey yazılmaz
        const updated: any = await userModel.findOneAndUpdate(
            { _id: user._id, password: user.password },
            { $set: { password: hash, passwordChangedAt: nowDate, failedLoginAttempts: 0 }, $unset: { lockUntil: 1 }, $inc: { tokenVersion: 1 } },
            { new: true },
        ).lean();
        if (!updated) {
            throw new ApplicationError('Parola başka bir işlemle eş zamanlı değiştirildi. Lütfen tekrar deneyin.', 409, CODES.CONFLICT);
        }

        await this.syncTenantCopy(updated, hash);
        // Kalan parola sıfırlama bağlantıları artık geçersiz (parola değişti)
        await this.revokeQuietly(String(user._id), 'password_reset');
        void AuditLogger.log({ event: 'user.password_change', result: 'ok', sub: principal.sub, tid: principal.tid, ip });
        this.notifyPasswordChanged(updated.email);

        const sessionClaims: SessionClaimsInput = {
            sub: String(updated._id),
            tid: principal.tid,
            role: updated.roleCode,
            ga: principal.ga === true,
            tv: Number.isInteger(updated.tokenVersion) ? updated.tokenVersion : 0,
            imp: principal.imp === true,
            auth_time: principal.auth_time, // oturumun 7 günlük mutlak sınırı KORUNUR (parola değişimi ömrü uzatmaz)
        };
        return { sessionClaims, body: { success: true } };
    }

    // ------------------------------------------------------------------------------------------------------------------
    // (2) Parola sıfırlama (kimliksiz)
    // ------------------------------------------------------------------------------------------------------------------

    /**
     * Senkron aşama (yanıttan ÖNCE): girdi biçimi + bağlantı tabanı yapılandırması. Sonuç kullanıcının varlığına BAĞLI DEĞİLDİR
     * (aynı girdi -> aynı hata), dolayısıyla numaralandırma sızıntısı yoktur.
     */
    public prepareResetRequest(rawEmail: unknown): { email: string; baseUrl: string } {
        const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : undefined;
        if (!email || email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) throw new ApplicationError(INVALID_REQUEST_MESSAGE, 400, CODES.INVALID_REQUEST);
        return { email, baseUrl: resolvePublicAppUrl() };
    }

    /**
     * Asenkron aşama (yanıttan SONRA çalıştırılır): kullanıcı yoksa/pasifse/cooldown'daysa SESSİZCE hiçbir şey yapmaz.
     * ASLA fırlatmaz. Denetim kaydı kullanıcı varlığından bağımsız tek biçimdedir (yalnızca ip).
     */
    public async executeResetRequest(email: string, baseUrl: string, ip?: string): Promise<void> {
        try {
            const user: any = await this.db.getUserModel().findOne({ email });
            if (user && user.isActive !== false) {
                const tokens = this.db.getAccountTokenModel();
                const sub = String(user._id);
                if (!(await isWithinCooldown(tokens, sub, 'password_reset', this.now()))) {
                    const issued = await issueToken(tokens, sub, 'password_reset', { ip, now: this.now() });
                    const link = `${baseUrl}/reset-password?token=${encodeURIComponent(issued.token)}`;
                    const mail = passwordResetMail(link, Math.round(PASSWORD_RESET_TTL_MS / 60000));
                    await this.send(user.email, mail.subject, mail.text, mail.html);
                }
            }
        } catch (e: any) {
            // Ayrıntı (adres/token) loglanmaz; yalnızca hata iletisi
            console.error('[AccountLifecycle] parola sıfırlama isteği işlenemedi:', e?.message);
        }
        void AuditLogger.log({ event: 'password_reset.request', result: 'ok', ip });
    }

    /**
     * Token'ı tek kullanımla tüketip parolayı yazar. Sıra: token+parola biçimi -> token'a bakış (tüketmeden) -> politika (kullanıcı
     * bağlamlı; zayıf parola token'ı YAKMAZ) -> ATOMİK tüketim -> yazma. Geçersiz/süresi dolmuş/kullanılmış token: aynı 400 TOKEN_INVALID.
     * Oturum AÇMAZ (kullanıcı yeni parolayla giriş yapar); tüm oturumlar düşer (tokenVersion++).
     */
    public async confirmPasswordReset(rawToken: unknown, newPassword: unknown, ip?: string): Promise<{ success: true }> {
        if (typeof newPassword !== 'string' || newPassword.length === 0 || newPassword.length > PASSWORD_INPUT_MAX_LENGTH) {
            throw new ApplicationError(INVALID_REQUEST_MESSAGE, 400, CODES.INVALID_REQUEST);
        }
        const invalid = () => new ApplicationError(TOKEN_INVALID_MESSAGE, 400, CODES.TOKEN_INVALID);
        if (!isWellFormedToken(rawToken)) {
            void AuditLogger.log({ event: 'password_reset.confirm', result: 'fail', ip });
            throw invalid();
        }
        const tokens = this.db.getAccountTokenModel();
        const userModel = this.db.getUserModel();

        const peeked = await peekToken(tokens, rawToken, 'password_reset', this.now());
        const user: any = peeked ? await this.findUserById(peeked.sub) : null;
        if (!peeked || !user || user.isActive === false) {
            void AuditLogger.log({ event: 'password_reset.confirm', result: 'fail', ip });
            throw invalid();
        }
        assertPasswordStrength(newPassword, { email: user.email, name: user.name, surname: user.surname });

        const consumed = await consumeToken(tokens, rawToken, 'password_reset', this.now());
        if (!consumed || consumed.sub !== peeked.sub) {
            void AuditLogger.log({ event: 'password_reset.confirm', result: 'fail', ip });
            throw invalid();
        }

        const hash = await this.security.hashPassword(newPassword);
        const nowDate = new Date(this.now());
        const updated: any = await userModel.findOneAndUpdate(
            { _id: user._id },
            {
                // Bağlantıyı alan posta kutusunun sahibi olduğunu kanıtladı -> e-posta da doğrulanmış sayılır; kilit/sayaç temizlenir
                $set: { password: hash, passwordChangedAt: nowDate, failedLoginAttempts: 0, emailVerified: true, emailVerifiedAt: nowDate },
                $unset: { lockUntil: 1 },
                $inc: { tokenVersion: 1 },
            },
            { new: true },
        ).lean();
        if (!updated) { // kullanıcı arada silindi
            void AuditLogger.log({ event: 'password_reset.confirm', result: 'fail', ip });
            throw invalid();
        }
        await this.syncTenantCopy(updated, hash);
        await this.revokeQuietly(String(user._id), 'password_reset');
        void AuditLogger.log({ event: 'password_reset.confirm', result: 'ok', sub: String(user._id), tid: Number.isInteger(Number(updated.order)) && !updated.isGlobalAdmin ? Number(updated.order) : undefined, ip });
        this.notifyPasswordChanged(updated.email);
        return { success: true };
    }

    // ------------------------------------------------------------------------------------------------------------------
    // (3) E-posta doğrulama
    // ------------------------------------------------------------------------------------------------------------------

    /**
     * Kayıt sonrası (ve yeniden gönderimde) doğrulama token'ı üretip e-posta gönderir. `cooldown`: kayıtta false, yeniden
     * gönderimde true. Zaten doğrulanmışsa gönderilmez. Bağlantı tabanı yoksa 503 EMAIL_NOT_CONFIGURED fırlatır (çağıran yakalar).
     */
    public async issueEmailVerification(user: { _id: any; email: string; emailVerified?: boolean }, opts: { ip?: string; cooldown?: boolean } = {}): Promise<{ sent: boolean; reason?: 'already_verified' | 'cooldown' }> {
        if (user.emailVerified === true) return { sent: false, reason: 'already_verified' };
        const baseUrl = resolvePublicAppUrl();
        const tokens = this.db.getAccountTokenModel();
        const sub = String(user._id);
        if (opts.cooldown && await isWithinCooldown(tokens, sub, 'email_verify', this.now())) return { sent: false, reason: 'cooldown' };
        const issued = await issueToken(tokens, sub, 'email_verify', { ip: opts.ip, now: this.now() });
        const link = `${baseUrl}/verify-email?token=${encodeURIComponent(issued.token)}`;
        const mail = emailVerificationMail(link, Math.round(EMAIL_VERIFY_TTL_MS / 3600000));
        await this.send(user.email, mail.subject, mail.text, mail.html);
        return { sent: true };
    }

    /** Oturum açmış kullanıcının doğrulama e-postasını yeniden gönderir (principal.sub güvenilir). Hatalar açıktır (kimlikli çağrı; enumeration yok). */
    public async resendVerification(principal: { sub: string; tid?: number } | undefined, ip?: string): Promise<{ success: true; alreadyVerified?: true }> {
        if (!principal || typeof principal.sub !== 'string' || !principal.sub) throw new ApplicationError('Token is undefined', 401);
        const user: any = await this.findUserById(principal.sub);
        if (!user || user.isActive === false) throw new ApplicationError('Token not verified', 401);
        if (user.emailVerified === true) return { success: true, alreadyVerified: true };
        let result: { sent: boolean; reason?: string };
        try {
            result = await this.issueEmailVerification(user, { ip, cooldown: true });
        } catch (e: any) {
            if (e instanceof ApplicationError) throw e;
            console.error('[AccountLifecycle] doğrulama e-postası gönderilemedi:', e?.message);
            throw new ApplicationError('E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.', 502, CODES.MAIL_FAILED);
        }
        if (!result.sent && result.reason === 'cooldown') throw new ApplicationError('Lütfen yeni bir e-posta istemeden önce bir dakika bekleyin.', 429, CODES.COOLDOWN);
        void AuditLogger.log({ event: 'email.verify_resend', result: 'ok', sub: principal.sub, tid: principal.tid, ip });
        return { success: true };
    }

    /** Token'ı tek kullanımla tüketip `emailVerified` yazar. Geçersiz/süresi dolmuş/kullanılmış: 400 TOKEN_INVALID (aynı yanıt). */
    public async verifyEmail(rawToken: unknown, ip?: string): Promise<{ success: true }> {
        const invalid = () => new ApplicationError(TOKEN_INVALID_MESSAGE, 400, CODES.TOKEN_INVALID);
        if (!isWellFormedToken(rawToken)) {
            void AuditLogger.log({ event: 'email.verify', result: 'fail', ip });
            throw invalid();
        }
        const consumed = await consumeToken(this.db.getAccountTokenModel(), rawToken, 'email_verify', this.now());
        if (!consumed) {
            void AuditLogger.log({ event: 'email.verify', result: 'fail', ip });
            throw invalid();
        }
        const nowDate = new Date(this.now());
        const updated: any = await this.db.getUserModel().findOneAndUpdate(
            { _id: consumed.sub },
            { $set: { emailVerified: true, emailVerifiedAt: nowDate } },
            { new: true },
        ).lean();
        if (!updated) {
            void AuditLogger.log({ event: 'email.verify', result: 'fail', ip });
            throw invalid();
        }
        void AuditLogger.log({ event: 'email.verify', result: 'ok', sub: consumed.sub, tid: Number.isInteger(Number(updated.order)) && !updated.isGlobalAdmin ? Number(updated.order) : undefined, ip });
        return { success: true };
    }

    // ------------------------------------------------------------------------------------------------------------------
    // iç yardımcılar
    // ------------------------------------------------------------------------------------------------------------------

    private async findUserById(id: string): Promise<any> {
        try {
            return await this.db.getUserModel().findById(id).lean();
        } catch (e: any) {
            if (e && e.name === 'CastError') return null;
            throw e;
        }
    }

    /** Yanlış mevcut parola: login ile aynı sayaç/kilit kuralı (çalınmış oturumla parola tahmini engellenir; kilitli hesap authenticate'te reddedilir). */
    private async recordFailedAttempt(user: any): Promise<void> {
        const attempts = (Number.isInteger(user.failedLoginAttempts) ? user.failedLoginAttempts : 0) + 1;
        const set: any = { failedLoginAttempts: attempts };
        if (attempts >= LOCK_AFTER_ATTEMPTS) set.lockUntil = new Date(this.now() + LOCK_MS);
        try {
            await this.db.getUserModel().updateOne({ _id: user._id }, { $set: set });
        } catch (e: any) {
            console.error('[AccountLifecycle] başarısız deneme sayacı yazılamadı:', e?.message);
        }
    }

    private async revokeQuietly(sub: string, purpose: 'password_reset' | 'email_verify'): Promise<void> {
        try {
            await revokeOutstanding(this.db.getAccountTokenModel(), sub, purpose, this.now());
        } catch (e: any) {
            console.error('[AccountLifecycle] kalan token\'lar geçersiz kılınamadı:', e?.message);
        }
    }

    /**
     * Tenant DB'sindeki kullanıcı kopyası (UserService iki yere yazar) bayat parola özeti tutmasın diye BEST-EFFORT eşitlenir.
     * Giriş yalnızca MERKEZİ Users'a bakar; bu adım başarısız olsa da parola değişimi geçerlidir.
     */
    private async syncTenantCopy(user: any, hash: string): Promise<void> {
        try {
            const u = toPlain(user);
            const order = Number(u.order);
            if (u.isGlobalAdmin || !Number.isInteger(order) || order < 1 || typeof u.email !== 'string') return;
            const clientDb = await this.getClientDB(order);
            if (!clientDb) return;
            await clientDb.getUserModel().updateOne({ email: u.email }, { $set: { password: hash } });
        } catch (e: any) {
            console.error('[AccountLifecycle] tenant kullanıcı kopyası eşitlenemedi (best-effort):', e?.message);
        }
    }

    /** "Parolanız değiştirildi" bildirimi: best-effort, arka planda. */
    private notifyPasswordChanged(email: unknown): void {
        if (typeof email !== 'string' || !email) return;
        const mail = passwordChangedMail();
        runInBackground(this.send(email, mail.subject, mail.text, mail.html));
    }
}

import crypto from 'crypto';
import { ApplicationError } from '@platform/core/errors';
import { logger } from '@platform/core/logger';
import { AuditLogger } from '@services/audit/AuditLogger';
import { EntitlementService } from '@services/billing/EntitlementService';
import Security from '@platform/core/security/Security';
import { ROLES, type Role } from '../../capabilities/roles';
import { EMAIL_MAX_LENGTH, EMAIL_RE, normalizeEmail } from '../tenant/provisionInput';
import { assertPasswordStrength } from '../account/passwordPolicy';
import { generateToken, hashToken, isWellFormedToken } from '../account/accountTokens';
import { invitationMail } from '../account/accountMailTemplates';
import { resolvePublicAppUrl, type MailSender } from '../account/AccountLifecycleService';
import { MemberStore, roleRankOf, type SourceMode } from './memberStore';
import { assertNotImpersonating } from './userRules';
import { assertRecentReauth } from './reauth';

// [ADR-0028 WP-A4 / Karar 7] Davet yaşam döngüsü. Token 256 bit rastgele; DB'ye YALNIZCA sha256 özeti yazılır (accountTokens deseni), tek kullanım
// (atomik `pending -> accepted`), 7 gün. Düz token yalnız e-posta bağlantısında (`/invite#t=<token>`; fragment sunucu günlüğüne/Referer'a düşmez)
// bulunur; API yanıtına, audit meta'ya, bildirime GİRMEZ.

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_HOURLY_LIMIT = 20;              // tenant başına saatte (ADR-0028 Karar 7.1)
export const INVITABLE_ROLES: ReadonlyArray<Role> = ROLES.filter((r) => r !== 'owner');

export const INVITATION_CODES = {
    INVALID: 'INVITATION_INVALID',
    EXPIRED: 'INVITATION_EXPIRED',
    REVOKED: 'INVITATION_REVOKED',
    ACCEPTED: 'INVITATION_ACCEPTED',
    RATE_LIMITED: 'INVITATION_RATE_LIMITED',
    PLAN_LIMIT: 'PLAN_LIMIT_REACHED',
    MAIL_FAILED: 'MAIL_FAILED',
} as const;

const log = logger.child({ module: 'users.invitations' });
const EMAIL_TAKEN = 'Bu e-posta adresi kullanılamıyor.';
const isDup = (e: any) => !!e && (e.code === 11000 || e.code === 11001);
const forbidden = (m: string) => new ApplicationError(m, 403);

export interface InvitationActor { sub: string; rank: number; imp?: boolean; ip?: string }

export interface InvitationDeps {
    applicationDB: any;
    getClientDB: (tid: number) => Promise<any | undefined>;
    mailSender: MailSender;
    now?: () => number;
    /** Testte tabanı sabitlemek için; varsayılan `resolvePublicAppUrl()` (PUBLIC_APP_URL). */
    baseUrl?: () => string;
    mode?: SourceMode;
    security?: Security;
}

/** Sabit-zamanlı özet karşılaştırması (iki eşit uzunluk hex dizgisi). */
export function safeEqualHex(a: unknown, b: unknown): boolean {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function maskEmail(email: string): string {
    const [local, domain = ''] = email.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
}

const dto = (d: any, nowMs: number) => ({
    id: String(d._id), email: d.email, role: d.role, status: d.status,
    expiresAt: d.expiresAt, expired: d.status === 'pending' && new Date(d.expiresAt).getTime() <= nowMs,
    invitedBy: d.invitedBy, createdAt: d.createdAt, acceptedAt: d.acceptedAt,
});

export class InvitationService {
    private readonly now: () => number;
    constructor(private readonly deps: InvitationDeps) { this.now = deps.now ?? (() => Date.now()); }

    private inv() { return this.deps.applicationDB.getInvitationModel(); }
    private store(tid: number) { return new MemberStore({ applicationDB: this.deps.applicationDB, getClientDB: this.deps.getClientDB, tid, mode: this.deps.mode }); }
    private link(token: string): string { return `${(this.deps.baseUrl ?? resolvePublicAppUrl)()}/invite#t=${encodeURIComponent(token)}`; }

    private parseRole(role: unknown, actor: InvitationActor): Role {
        if (role === 'owner') throw forbidden('Sahip rolü davetle verilemez; sahiplik devri kullanılır.');
        if (typeof role !== 'string' || !(INVITABLE_ROLES as ReadonlyArray<string>).includes(role)) throw new ApplicationError('Geçersiz rol.', 400, 'INVALID_REQUEST');
        if (roleRankOf(role) > actor.rank) throw forbidden('Kendi yetkinizden yüksek bir rol atayamazsınız.');
        return role as Role;
    }

    private async tenantTitle(tid: number): Promise<string> {
        try {
            const c: any = await this.deps.applicationDB.getClientModel().findOne({ order: tid }, 'title status').lean();
            return typeof c?.title === 'string' ? c.title : '';
        } catch { return ''; }
    }

    private async sendMail(tid: number, email: string, role: string, token: string): Promise<void> {
        const mail = invitationMail(this.link(token), await this.tenantTitle(tid), role, Math.round(INVITATION_TTL_MS / 86400000));
        try {
            await this.deps.mailSender(email, mail.subject, mail.text, mail.html);
        } catch (e: any) {
            log.error({ err: { message: e?.message } }, 'davet e-postası gönderilemedi:');
            throw new ApplicationError('Davet kaydedildi ancak e-posta gönderilemedi. Daveti yeniden gönderebilirsiniz.', 502, INVITATION_CODES.MAIL_FAILED);
        }
    }

    /** limits.users: aktif üyelik + bekleyen (süresi dolmamış) davet sayısı. `excludeInvitationId`: yenilenen davet çift sayılmaz. */
    private async assertUserQuota(tid: number, excludeInvitationId?: unknown): Promise<void> {
        const store = this.store(tid);
        const pendingFilter: any = { tid, status: 'pending', expiresAt: { $gt: new Date(this.now()) } };
        if (excludeInvitationId) pendingFilter._id = { $ne: excludeInvitationId };
        const usage = (await store.countActiveMembers()) + (await this.inv().countDocuments(pendingFilter));
        const q = await EntitlementService.checkQuota(tid, 'users', usage, new Date(this.now()));
        if (!q.allowed) throw new ApplicationError(q.reason ?? 'Plan kullanıcı sınırına ulaşıldı.', 403, INVITATION_CODES.PLAN_LIMIT);
    }

    private async assertHourlyRate(tid: number): Promise<void> {
        const since = new Date(this.now() - 3600_000);
        const n = await this.inv().countDocuments({ tid, updatedAt: { $gte: since } });
        if (n >= INVITATION_HOURLY_LIMIT) throw new ApplicationError('Saatlik davet sınırına ulaşıldı. Lütfen daha sonra tekrar deneyin.', 429, INVITATION_CODES.RATE_LIMITED);
    }

    // -------------------------------------------------------------------------------------------------------------------
    // Yönetici uçları
    // -------------------------------------------------------------------------------------------------------------------

    async invite(tid: number, actor: InvitationActor, input: { email: unknown; role: unknown }): Promise<ReturnType<typeof dto>> {
        assertNotImpersonating({ imp: actor.imp });
        const email = typeof input.email === 'string' ? normalizeEmail(input.email) : undefined;
        if (!email || email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) throw new ApplicationError('Geçerli bir e-posta adresi giriniz.', 400, 'INVALID_REQUEST');
        const role = this.parseRole(input.role, actor);
        // [ADR-0028 Karar 8] admin rolü verme = adım-yükseltmesi (parola <= 5 dk)
        if (role === 'admin') await assertRecentReauth(this.deps.applicationDB.getUserModel(), actor.sub, this.now());
        this.link('probe'); // bağlantı tabanı yapılandırılmamışsa (503) HİÇBİR şey yazılmadan dur

        // Mevcut kullanıcı: ADR-0028 Karar 7.3 — Aşama 1-2'de tek aktif üyelik: bu e-posta başka bir mağazaya bağlıysa ekleme YOK (Aşama 3 çoklu üyelik).
        const existing: any = await this.deps.applicationDB.getUserModel().findOne({ email }).lean();
        if (existing) {
            if (Number(existing.order) === tid) throw new ApplicationError('Bu kullanıcı zaten mağazanın üyesi.', 409, 'ALREADY_MEMBER');
            throw new ApplicationError(EMAIL_TAKEN, 409, 'EMAIL_TAKEN');
        }

        await this.assertHourlyRate(tid);
        const pending: any = await this.inv().findOne({ tid, email, status: 'pending' }).lean();
        await this.assertUserQuota(tid, pending?._id);

        const token = generateToken();
        const fields = { role, tokenHash: hashToken(token), expiresAt: new Date(this.now() + INVITATION_TTL_MS), invitedBy: actor.sub };
        let doc: any;
        const renew = async () => this.inv().findOneAndUpdate({ tid, email, status: 'pending' }, { $set: fields }, { new: true }).lean();
        if (pending) doc = await renew();
        if (!doc) {
            try {
                doc = (await this.inv().create({ tid, email, status: 'pending', ...fields })).toObject();
            } catch (e) {
                if (!isDup(e)) throw e;
                doc = await renew(); // eşzamanlı ikinci davet: aynı bekleyen kayıt yenilenir (tekil kısmi indeks)
                if (!doc) throw e;
            }
        }
        void AuditLogger.log({ event: 'user.invite.create', result: 'ok', sub: actor.sub, tid, ip: actor.ip, meta: { invitationId: String(doc._id), toRole: role, renewed: !!pending } });
        await this.sendMail(tid, email, role, token);
        return dto(doc, this.now());
    }

    async resend(tid: number, actor: InvitationActor, invitationId: unknown): Promise<ReturnType<typeof dto>> {
        assertNotImpersonating({ imp: actor.imp });
        const current = await this.findPending(tid, invitationId);
        if (roleRankOf(current.role) > actor.rank) throw forbidden('Bu davet sizin yetkinizden yüksek bir rol içeriyor.');
        this.link('probe');
        await this.assertHourlyRate(tid);
        const token = generateToken();
        const doc: any = await this.inv().findOneAndUpdate(
            { _id: current._id, tid, status: 'pending' },
            { $set: { tokenHash: hashToken(token), expiresAt: new Date(this.now() + INVITATION_TTL_MS), invitedBy: actor.sub } },
            { new: true },
        ).lean();
        if (!doc) throw new ApplicationError('Davet bulunamadı.', 404, 'NOT_FOUND');
        void AuditLogger.log({ event: 'user.invite.resend', result: 'ok', sub: actor.sub, tid, ip: actor.ip, meta: { invitationId: String(doc._id), toRole: doc.role } });
        await this.sendMail(tid, doc.email, doc.role, token);
        return dto(doc, this.now());
    }

    async revoke(tid: number, actor: InvitationActor, invitationId: unknown): Promise<{ success: true }> {
        assertNotImpersonating({ imp: actor.imp });
        const current = await this.findPending(tid, invitationId);
        if (roleRankOf(current.role) > actor.rank) throw forbidden('Bu davet sizin yetkinizden yüksek bir rol içeriyor.');
        const doc: any = await this.inv().findOneAndUpdate({ _id: current._id, tid, status: 'pending' }, { $set: { status: 'revoked' } }, { new: true }).lean();
        if (!doc) throw new ApplicationError('Davet bulunamadı.', 404, 'NOT_FOUND');
        void AuditLogger.log({ event: 'user.invite.revoke', result: 'ok', sub: actor.sub, tid, ip: actor.ip, meta: { invitationId: String(doc._id), toRole: doc.role } });
        return { success: true };
    }

    async list(tid: number, opts: { status?: unknown } = {}): Promise<{ invitations: Array<ReturnType<typeof dto>> }> {
        const filter: any = { tid };
        if (opts.status !== undefined) {
            if (opts.status !== 'pending' && opts.status !== 'accepted' && opts.status !== 'revoked') throw new ApplicationError('Geçersiz durum.', 400, 'INVALID_REQUEST');
            filter.status = opts.status;
        }
        // tokenHash ASLA dönmez (beyaz liste projeksiyonu)
        const docs: any[] = await this.inv().find(filter, '_id email role status expiresAt invitedBy createdAt acceptedAt').sort({ createdAt: -1 }).limit(200).lean();
        return { invitations: docs.map((d) => dto(d, this.now())) };
    }

    private async findPending(tid: number, invitationId: unknown): Promise<any> {
        if (typeof invitationId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(invitationId)) throw new ApplicationError('Geçersiz istek.', 400, 'INVALID_REQUEST');
        const doc: any = await this.inv().findOne({ _id: invitationId, tid, status: 'pending' }).lean();
        if (!doc) throw new ApplicationError('Davet bulunamadı.', 404, 'NOT_FOUND');
        return doc;
    }

    // -------------------------------------------------------------------------------------------------------------------
    // Kimliksiz uçlar (rate limit: ApiManager accountTokenLimiter)
    // -------------------------------------------------------------------------------------------------------------------

    /** Token'ı özetle bulur; durum/süre için ANLAMLI hata (token sahibine; ayrım sızıntısı yok, 256 bit tahmin edilemez). */
    private async resolve(rawToken: unknown, ip?: string): Promise<any> {
        const invalid = () => new ApplicationError('Davet bağlantısı geçersiz.', 400, INVITATION_CODES.INVALID);
        if (!isWellFormedToken(rawToken)) throw invalid();
        const hash = hashToken(rawToken);
        const doc: any = await this.inv().findOne({ tokenHash: hash }).lean();
        if (!doc || !safeEqualHex(doc.tokenHash, hash)) {
            void AuditLogger.log({ event: 'user.invite.accept', result: 'fail', ip, meta: { reason: 'unknown_token' } });
            throw invalid();
        }
        if (doc.status === 'revoked') throw new ApplicationError('Bu davet iptal edilmiş.', 410, INVITATION_CODES.REVOKED);
        if (doc.status === 'accepted') throw new ApplicationError('Bu davet daha önce kullanılmış.', 409, INVITATION_CODES.ACCEPTED);
        if (new Date(doc.expiresAt).getTime() <= this.now()) throw new ApplicationError('Davetin süresi dolmuş. Yöneticinizden yeni bir davet isteyin.', 410, INVITATION_CODES.EXPIRED);
        return doc;
    }

    /** Yalnız `{tenantTitle, role, email (maskeli), expiresAt}`. */
    async getPublic(rawToken: unknown, ip?: string): Promise<{ tenantTitle: string; role: string; email: string; expiresAt: Date }> {
        const doc = await this.resolve(rawToken, ip);
        return { tenantTitle: await this.tenantTitle(doc.tid), role: doc.role, email: maskEmail(doc.email), expiresAt: doc.expiresAt };
    }

    async accept(input: { token: unknown; name: unknown; surname: unknown; password: unknown }, ip?: string): Promise<{ success: true }> {
        const doc = await this.resolve(input.token, ip);
        const tid = Number(doc.tid);
        const { name, surname, password } = input;
        const okText = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
        if (!okText(name, 100) || !okText(surname, 100)) throw new ApplicationError('Ad ve soyad zorunludur.', 400, 'INVALID_REQUEST');
        // Politika token TÜKETİLMEDEN önce: zayıf parola daveti yakmaz
        const plainPassword = assertPasswordStrength(password, { email: doc.email, name, surname });

        const client: any = await this.deps.applicationDB.getClientModel().findOne({ order: tid }, 'status').lean();
        if (!client || (client.status && client.status !== 'ACTIVE')) throw new ApplicationError('Davet bağlantısı geçersiz.', 400, INVITATION_CODES.INVALID);
        if (await this.deps.applicationDB.getUserModel().findOne({ email: doc.email }).lean()) throw new ApplicationError(EMAIL_TAKEN, 409, 'EMAIL_TAKEN');

        // Atomik tek kullanım: yalnız pending + süresi dolmamış + aynı özet
        const nowDate = new Date(this.now());
        const claimed: any = await this.inv().findOneAndUpdate(
            { _id: doc._id, tokenHash: doc.tokenHash, status: 'pending', expiresAt: { $gt: nowDate } },
            { $set: { status: 'accepted', acceptedAt: nowDate } },
            { new: false },
        ).lean();
        if (!claimed) throw new ApplicationError('Bu davet daha önce kullanılmış veya geçersiz.', 409, INVITATION_CODES.ACCEPTED);

        const revert = async () => { try { await this.inv().updateOne({ _id: doc._id }, { $set: { status: 'pending' }, $unset: { acceptedAt: 1, acceptedUserId: 1 } }); } catch { /* en iyi çaba */ } };
        try {
            const hash = await (this.deps.security ?? Security.getInstance()).hashPassword(plainPassword);
            const created = await this.store(tid).createMember({ email: doc.email, name: name.trim(), surname: surname.trim(), passwordHash: hash, role: doc.role, invitedBy: doc.invitedBy });
            await this.inv().updateOne({ _id: doc._id }, { $set: { acceptedUserId: created.userId } });
            void AuditLogger.log({ event: 'user.invite.accept', result: 'ok', sub: created.userId, tid, ip, meta: { invitationId: String(doc._id), toRole: doc.role, targetUserId: created.userId } });
        } catch (e) {
            await revert();
            if (isDup(e)) throw new ApplicationError(EMAIL_TAKEN, 409, 'EMAIL_TAKEN');
            throw e;
        }
        return { success: true };
    }
}

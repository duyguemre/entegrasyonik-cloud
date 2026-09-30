import { ApplicationError } from '@platform/core/errors';
import { logger } from '@platform/core/logger';
import { AuditLogger } from '@services/audit/AuditLogger';
import { NotificationService } from '@services/notification/NotificationService';
import { ROLE_RANK, assertNotImpersonating } from './userRules';
import { MemberStore, type MemberView, type SourceMode } from './memberStore';
import { assertRecentReauth } from './reauth';
import { generateToken, hashToken, isWellFormedToken, ttlFor } from '../account/accountTokens';
import { ownershipTransferMail } from '../account/accountMailTemplates';
import { resolvePublicAppUrl, type MailSender } from '../account/AccountLifecycleService';
import type { NotifyFn } from './suspension';

// [ADR-0028 WP-A4 / Karar 5.5] Sahiplik devri, İKİ ADIM. (1) Sahip + step-up: hedef (aktif, e-postası doğrulanmış üye) için 72 saatlik tek kullanımlık
// belirteç (AccountTokens purpose='ownership_transfer'; yalnız sha256 saklanır) -> hedefe e-posta + uygulama içi bildirim. (2) Hedef OTURUM AÇIKKEN
// belirteçle kabul eder: önce hedef `owner`, SONRA eski sahip `admin` (ara durumda 0 sahip olmaz); ikinci adım başarısızsa birinci geri alınır (Mongo
// standalone: çok belgeli işlem yok, ADR'nin "işlem sonrası sayım + telafi" deseni). İki tarafın tokenVersion'ı artar (yeniden giriş).

export interface OwnershipActor { sub: string; rank: number; imp?: boolean; ip?: string }
export interface OwnershipDeps {
    applicationDB: any;
    getClientDB: (tid: number) => Promise<any | undefined>;
    mailSender: MailSender;
    notify?: NotifyFn;
    mode?: SourceMode;
    now?: () => number;
    baseUrl?: () => string;
}

const log = logger.child({ module: 'users.ownership' });
const err = (m: string, s: number, c?: string) => new ApplicationError(m, s, c);
const PURPOSE = 'ownership_transfer' as const;
const TOKEN_INVALID = () => err('Devir bağlantısı geçersiz veya süresi dolmuş.', 400, 'TOKEN_INVALID');

export class OwnershipService {
    private readonly now: () => number;
    constructor(private readonly deps: OwnershipDeps) { this.now = deps.now ?? (() => Date.now()); }
    private store(tid: number) { return new MemberStore({ applicationDB: this.deps.applicationDB, getClientDB: this.deps.getClientDB, tid, mode: this.deps.mode }); }
    private tokens() { return this.deps.applicationDB.getAccountTokenModel(); }
    private notify(code: string, tid: number, params: Record<string, unknown>, opts?: any) {
        const fn: NotifyFn = this.deps.notify ?? ((c, t, p, o) => NotificationService.notify(c, t, p, o));
        void fn(code, tid, params, opts);
    }

    async initiate(tid: number, actor: OwnershipActor, input: { targetUserId: unknown }): Promise<{ success: true; transferId: string; expiresAt: Date }> {
        assertNotImpersonating({ imp: actor.imp });
        if (actor.rank < ROLE_RANK.owner) throw err('Sahiplik devrini yalnızca mağaza sahibi başlatabilir.', 403, 'FORBIDDEN');
        const base = (this.deps.baseUrl ?? resolvePublicAppUrl)(); // yapılandırılmamışsa 503, hiçbir şey yazılmadan
        await assertRecentReauth(this.deps.applicationDB.getUserModel(), actor.sub, this.now());

        const store = this.store(tid);
        const me = await store.find(actor.sub);
        if (!me || !me.isOwner || me.status !== 'active') throw err('Sahiplik devrini yalnızca mağaza sahibi başlatabilir.', 403, 'FORBIDDEN');
        const target = await store.find(input.targetUserId);
        if (!target) throw err('Kullanıcı bulunamadı.', 404, 'NOT_FOUND');
        if (target.userId === actor.sub) throw err('Sahipliği kendinize devredemezsiniz.', 400, 'INVALID_REQUEST');
        if (target.isOwner) throw err('Kullanıcı zaten mağaza sahibi.', 409, 'ALREADY_OWNER');
        if (target.status !== 'active') throw err('Devir hedefi aktif bir üye olmalıdır.', 409, 'TARGET_NOT_ACTIVE');
        if (target.central.emailVerified !== true) throw err('Devir hedefinin e-posta adresi doğrulanmış olmalıdır.', 409, 'TARGET_EMAIL_UNVERIFIED');

        const nowMs = this.now();
        const now = new Date(nowMs);
        // Tenant başına TEK bekleyen devir: öncekiler geçersiz kılınır
        await this.tokens().updateMany({ purpose: PURPOSE, tid, usedAt: null }, { $set: { usedAt: now } });
        const token = generateToken();
        const expiresAt = new Date(nowMs + ttlFor(PURPOSE));
        const rec: any = await this.tokens().create({
            sub: target.userId, purpose: PURPOSE, tokenHash: hashToken(token), createdAt: now, expiresAt, tid, initiatedBy: actor.sub,
            ...(actor.ip ? { ip: String(actor.ip).slice(0, 64) } : {}),
        });
        const transferId = String(rec._id);
        void AuditLogger.log({ event: 'ownership.transfer.request', result: 'ok', sub: actor.sub, tid, ip: actor.ip, meta: { transferId, targetUserId: target.userId, targetRole: target.role, toRole: 'owner' } });

        try {
            const title = await this.tenantTitle(tid);
            const mail = ownershipTransferMail(`${base}/accept-ownership#t=${encodeURIComponent(token)}`, title, Math.round(ttlFor(PURPOSE) / 3600000));
            await this.deps.mailSender(target.central.email, mail.subject, mail.text, mail.html);
        } catch (e: any) {
            await this.tokens().updateOne({ _id: rec._id }, { $set: { usedAt: new Date(this.now()) } }); // ulaşmayan belirteç açık kalmaz
            log.error({ err: { message: e?.message } }, 'devir e-postası gönderilemedi:');
            throw err('Devir talebi e-postası gönderilemedi. Lütfen tekrar deneyin.', 502, 'MAIL_FAILED');
        }
        this.notify('SECURITY_OWNERSHIP_TRANSFER_REQUESTED', tid, { transferId, expiresAt: expiresAt.toISOString() }, { recipients: { userIds: [target.userId] }, actorUserId: actor.sub, module: 'users.ownership' });
        return { success: true, transferId, expiresAt };
    }

    async cancel(tid: number, actor: OwnershipActor): Promise<{ success: true; cancelled: number }> {
        assertNotImpersonating({ imp: actor.imp });
        if (actor.rank < ROLE_RANK.owner) throw err('Sahiplik devrini yalnızca mağaza sahibi iptal edebilir.', 403, 'FORBIDDEN');
        const res: any = await this.tokens().updateMany({ purpose: PURPOSE, tid, usedAt: null, expiresAt: { $gt: new Date(this.now()) } }, { $set: { usedAt: new Date(this.now()) } });
        const cancelled = Number(res?.modifiedCount ?? res?.nModified ?? 0);
        void AuditLogger.log({ event: 'ownership.transfer.cancel', result: 'ok', sub: actor.sub, tid, ip: actor.ip, meta: { cancelled } });
        return { success: true, cancelled };
    }

    /** Hedef (oturum açık) kabul eder. Geçersiz/başkasına ait/süresi dolmuş/kullanılmış belirteç: hep aynı 400 TOKEN_INVALID. */
    async accept(tid: number, actor: { sub: string; imp?: boolean; ip?: string }, input: { token: unknown }): Promise<{ success: true }> {
        assertNotImpersonating({ imp: actor.imp });
        if (!isWellFormedToken(input.token)) throw TOKEN_INVALID();
        const nowDate = new Date(this.now());
        const hash = hashToken(input.token);
        const doc: any = await this.tokens().findOne({ tokenHash: hash, purpose: PURPOSE, usedAt: null, expiresAt: { $gt: nowDate } }).lean();
        if (!doc || doc.sub !== actor.sub || Number(doc.tid) !== tid) {
            void AuditLogger.log({ event: 'ownership.transfer.accept', result: 'fail', sub: actor.sub, tid, ip: actor.ip, meta: { reason: 'invalid_token' } });
            throw TOKEN_INVALID();
        }
        const store = this.store(tid);
        const oldOwner = await store.find(doc.initiatedBy);
        const newOwner = await store.find(actor.sub);
        if (!oldOwner || !oldOwner.isOwner || oldOwner.status !== 'active' || !newOwner || newOwner.status !== 'active' || newOwner.isOwner) {
            void AuditLogger.log({ event: 'ownership.transfer.accept', result: 'fail', sub: actor.sub, tid, ip: actor.ip, meta: { reason: 'parties_changed' } });
            throw TOKEN_INVALID();
        }
        // Atomik tek kullanım
        const consumed: any = await this.tokens().findOneAndUpdate({ _id: doc._id, usedAt: null, expiresAt: { $gt: nowDate } }, { $set: { usedAt: nowDate } }, { new: false }).lean();
        if (!consumed) throw TOKEN_INVALID();

        const prevRole = newOwner.role;
        try {
            await store.writeRole(newOwner, 'owner', { expectedRole: prevRole as any });      // 1) önce yeni sahip
            try {
                await store.writeRole(oldOwner, 'admin', { expectedRole: 'owner' });          // 2) sonra eski sahip
            } catch (e) {
                await this.rollbackNewOwner(store, newOwner, prevRole);
                throw e;
            }
            if ((await store.countActiveOwners()) < 1) {                                       // işlem sonrası sayım (telafi)
                await this.rollbackNewOwner(store, newOwner, prevRole);
                await store.writeRole(oldOwner, 'owner');
                throw err('Sahiplik devri tamamlanamadı.', 409, 'CONFLICT');
            }
        } catch (e) {
            await this.tokens().updateOne({ _id: doc._id }, { $unset: { usedAt: 1 } }); // devir olmadı: belirteç yeniden kullanılabilir
            throw e;
        }
        await store.revokeSessions(newOwner);
        await store.revokeSessions(oldOwner);

        const meta = { transferId: String(doc._id), fromOwnerId: oldOwner.userId, toOwnerId: newOwner.userId };
        void AuditLogger.log({ event: 'ownership.transfer.accept', result: 'ok', sub: actor.sub, tid, ip: actor.ip, meta: { ...meta, targetUserId: newOwner.userId, fromRole: prevRole, toRole: 'owner' } });
        void AuditLogger.log({ event: 'membership.role_change', result: 'ok', sub: actor.sub, tid, ip: actor.ip, meta: { ...meta, targetUserId: oldOwner.userId, fromRole: 'owner', toRole: 'admin' } });
        this.notify('SECURITY_OWNERSHIP_TRANSFERRED', tid, { transferId: String(doc._id) }, { actorUserId: actor.sub, module: 'users.ownership' });
        return { success: true };
    }

    private async rollbackNewOwner(store: MemberStore, v: MemberView, prevRole: string): Promise<void> {
        try { await store.writeRole(v, prevRole as any, { expectedRole: 'owner' }); }
        catch (e: any) { log.error({ err: { message: e?.message } }, 'geri alma başarısız (elle müdahale gerekir):'); }
    }

    private async tenantTitle(tid: number): Promise<string> {
        try {
            const c: any = await this.deps.applicationDB.getClientModel().findOne({ order: tid }, 'title').lean();
            return typeof c?.title === 'string' ? c.title : '';
        } catch { return ''; }
    }
}

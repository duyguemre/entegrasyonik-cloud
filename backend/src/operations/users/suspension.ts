import { ApplicationError } from '@platform/core/errors';
import { AuditLogger } from '@services/audit/AuditLogger';
import { NotificationService } from '@services/notification/NotificationService';
import { MemberStore, roleRankOf, type SourceMode } from './memberStore';
import { assertRecentReauth } from './reauth';
import { ROLE_RANK, assertNotImpersonating, assertOwnerTargetProtection } from './userRules';

// [ADR-0028 WP-A4 / Karar 5.7] Üyelik askıya alma / yeniden etkinleştirme. Askıya alma: Membership.status + legacy isActive (merkezi kayıt + tenant kopyası;
// A-05: yalnız tenant kopyası değil) + tokenVersion++ + kimlik önbelleği temizliği => hedefin oturumları anında düşer.

export interface SuspensionActor { sub: string; rank: number; imp?: boolean; ip?: string }
export type NotifyFn = (code: string, tid: number, params: Record<string, unknown>, opts?: any) => Promise<unknown>;

export interface SuspensionDeps {
    applicationDB: any;
    getClientDB: (tid: number) => Promise<any | undefined>;
    notify?: NotifyFn;
    mode?: SourceMode;
    now?: () => number;
}

const err = (m: string, s: number, c?: string) => new ApplicationError(m, s, c);

export class SuspensionService {
    constructor(private readonly deps: SuspensionDeps) {}
    private store(tid: number) { return new MemberStore({ applicationDB: this.deps.applicationDB, getClientDB: this.deps.getClientDB, tid, mode: this.deps.mode }); }
    private notify: NotifyFn = (c, t, p, o) => (this.deps.notify ?? ((...a) => NotificationService.notify(...(a as [string, number, Record<string, unknown>, any]))))(c, t, p, o);

    private async target(store: MemberStore, actor: SuspensionActor, userId: unknown) {
        assertNotImpersonating({ imp: actor.imp });
        const t = await store.find(userId);
        if (!t) throw err('Kullanıcı bulunamadı.', 404, 'NOT_FOUND');
        if (t.userId === actor.sub) throw err('Kendinizi askıya alamaz veya yeniden etkinleştiremezsiniz.', 403, 'FORBIDDEN');
        assertOwnerTargetProtection(actor.rank, roleRankOf(t.role) >= ROLE_RANK.owner ? ROLE_RANK.owner : roleRankOf(t.role));
        return t;
    }

    async suspend(tid: number, actor: SuspensionActor, input: { userId: unknown; reason?: unknown }): Promise<{ success: true; status: 'suspended' }> {
        const store = this.store(tid);
        const t = await this.target(store, actor, input.userId);
        // [ADR-0028 Karar 8] sahip olmayan birini askıya alma = adım-yükseltmesi
        if (!t.isOwner) await assertRecentReauth(this.deps.applicationDB.getUserModel(), actor.sub, (this.deps.now ?? Date.now)());
        const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 200) : undefined;
        if (t.status === 'suspended') return { success: true, status: 'suspended' }; // idempotent; ikinci tokenVersion artışı/bildirim yok
        // Son sahip: sahip askıya alınırken tenant'ta başka AKTİF sahip kalmalı
        if (t.isOwner && (await store.countActiveOwners()) <= 1) throw err('Mağazanın son sahibi askıya alınamaz.', 409, 'LAST_OWNER');

        await store.writeStatus(t, 'suspended', actor.sub, reason);
        // Yarışa karşı işlem sonrası yeniden sayım (ADR §5.4): 0 sahip kaldıysa geri al
        if (t.isOwner && (await store.countActiveOwners()) < 1) {
            await store.writeStatus(t, 'active', actor.sub);
            throw err('Mağazanın son sahibi askıya alınamaz.', 409, 'LAST_OWNER');
        }
        await store.revokeSessions(t);
        const at = new Date((this.deps.now ?? Date.now)()).toISOString();
        void AuditLogger.log({
            event: 'membership.suspend', result: 'ok', sub: actor.sub, tid, ip: actor.ip,
            meta: { targetUserId: t.userId, targetRole: t.role, fromStatus: t.status, toStatus: 'suspended', ...(reason ? { reason } : {}) },
        });
        void this.notify('SECURITY_MEMBER_SUSPENDED', tid, { targetUserId: t.userId, suspendedAt: at }, { actorUserId: actor.sub, module: 'users.suspension' });
        return { success: true, status: 'suspended' };
    }

    async reactivate(tid: number, actor: SuspensionActor, input: { userId: unknown }): Promise<{ success: true; status: 'active' }> {
        const store = this.store(tid);
        const t = await this.target(store, actor, input.userId);
        if (t.status === 'active') return { success: true, status: 'active' };
        await store.writeStatus(t, 'active', actor.sub);
        // Yeniden etkinleştirme oturumları geri getirmez: askıya almada tokenVersion zaten artmıştı (eski oturumlar ölü); kimlik önbelleği yine temizlenir.
        await store.revokeSessions(t);
        void AuditLogger.log({
            event: 'membership.reactivate', result: 'ok', sub: actor.sub, tid, ip: actor.ip,
            meta: { targetUserId: t.userId, targetRole: t.role, fromStatus: t.status, toStatus: 'active' },
        });
        return { success: true, status: 'active' };
    }
}

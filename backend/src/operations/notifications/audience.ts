// ADR-0029 Karar 5: alici cozumu (saf, DB yok). Uye listesi bir portla gelir (`NotifyDeps.listMembers`).
//
// ADR-0028 Asama 1 (izin katalogu + Memberships) henuz yok: izin -> GECICI rol kademesi eslemesi (`fallbackMinTier`)
// kullanilir; `hasPermission` portu verilirse (ADR-0028 gelince) o oncelik alir. Bu esleme `operationPolicy.resolveTier`
// ile ayni kurali izler (owner:true -> owner; ROLE_ADMIN/ROLE_OWNER -> admin; digerleri -> member) ama `api/`
// katmanina bagimli OLMAMAK icin (ADR-0024) burada yeniden yazilir.
import type { MinTier, NotificationDefinition, NotificationPermission } from './catalog.types';

export interface Member {
    /** Merkezi Users._id (string). */
    userId: string;
    owner?: boolean;
    roleCode?: string;
    emailVerified?: boolean;
    locale?: 'tr' | 'en';
}

export interface AudienceOptions {
    recipients?: { userIds: string[] };
    actorUserId?: string;
    /** Aktor destek (impersonation) oturumundaysa true: hicbir zaman e-posta alicisi olmaz, actorOnly bildirim sahip/yoneticilere gider. */
    actorImpersonating?: boolean;
}

const RANK: Record<MinTier, number> = { member: 1, admin: 2, owner: 3 };
const ADMIN_ROLE_CODES: ReadonlyArray<string> = ['ROLE_ADMIN', 'ROLE_OWNER'];

export function memberTier(m: Member): MinTier {
    if (m.owner === true) return 'owner';
    if (typeof m.roleCode === 'string' && ADMIN_ROLE_CODES.includes(m.roleCode)) return 'admin';
    return 'member';
}

export type HasPermission = (m: Member, permission: NotificationPermission) => boolean;

export function resolveRecipients(def: NotificationDefinition, opts: AudienceOptions, members: Member[], hasPermission?: HasPermission): Member[] {
    const byId = new Map(members.map((m) => [m.userId, m] as const));
    const eligible = (m: Member) => (hasPermission ? hasPermission(m, def.audience.permission) : RANK[memberTier(m)] >= RANK[def.audience.fallbackMinTier]);
    const admins = () => members.filter((m) => RANK[memberTier(m)] >= RANK.admin);

    if (opts.recipients?.userIds?.length) {
        // Tenant izolasyonu: yalniz bu tenant'in uyeleri (yabanci kimlik sessizce elenir).
        return [...new Set(opts.recipients.userIds)].map((id) => byId.get(id)).filter((m): m is Member => !!m);
    }
    if (def.audience.actorOnly && opts.actorUserId) {
        if (opts.actorImpersonating) return admins(); // destek oturumu -> sahip/yoneticilere (yalniz uygulama ici; e-posta yok)
        const a = byId.get(opts.actorUserId);
        return a ? [a] : [];
    }
    return members.filter(eligible);
}

// ADR-0001 Karar 7 / ADR-0028: aktörün eski kademesinin GÜVENİLİR kaynaklardan türetilmesi (platform katmanı; api'ye bağımlı DEĞİL).
// `api/rpc/operationPolicy.ts` bunları yeniden dışa verir (dışa açık API değişmez).
export type TenantTier = 'member' | 'admin' | 'owner';

export const TENANT_TIER_RANK: Record<TenantTier, number> = { member: 1, admin: 2, owner: 3 };

/** Kademe atamasında kullanılan roller (ADR Karar 7): ROLE_ADMIN ve ROLE_OWNER admin kademesindedir. */
const ADMIN_ROLE_CODES: ReadonlyArray<string> = ['ROLE_ADMIN', 'ROLE_OWNER'];

export interface TierActor {
    /** Kimliği doğrulanmış aktörün tenant kademesi; kimlik yoksa undefined. */
    tier: TenantTier | undefined;
    /** Doğrulanmış principal.ga === true. */
    platformAdmin: boolean;
}

/**
 * Aktörün kademesini GÜVENİLİR kaynaklardan çıkarır:
 *  - platformAdmin: yalnızca doğrulanmış `principal.ga === true` (istemci gövdesi/token `role` claim'i değil).
 *  - süper yönetici tenant bağlamında `admin` kademesinde çalışır (owner DEĞİL; kendi belgesinde owner:true olsa bile).
 *  - tenant kullanıcısı: `userContext.owner === true` -> owner; roleCode ROLE_ADMIN/ROLE_OWNER -> admin;
 *    diğer/tanımsız/ROLE_OPERATOR -> member.
 * `userContext` sunucuda merkezi Users belgesinden kurulmuş bağlamdır (authenticate.ts buildUserContext).
 */
export function resolveTier(userContext: any, principal: any): TierActor {
    if (!principal || typeof principal !== 'object') return { tier: undefined, platformAdmin: false };
    if (principal.ga === true) return { tier: 'admin', platformAdmin: true };
    const uc = userContext && typeof userContext === 'object' ? userContext : {};
    if (uc.owner === true) return { tier: 'owner', platformAdmin: false };
    if (typeof uc.roleCode === 'string' && ADMIN_ROLE_CODES.includes(uc.roleCode)) return { tier: 'admin', platformAdmin: false };
    return { tier: 'member', platformAdmin: false };
}

import { config } from '@config';
import { logger } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics';
import { resolveTier } from '@platform/core/authz/tier';
import { ROLE_PERMISSIONS, roleFromTier, type Role } from '../capabilities/roles';
import { ApplicationError } from '@platform/core/security/Security';

// ADR-0028 Karar 6 / WP-A3: authenticate'in yetki kaynağı (MEMBERSHIP_SOURCE = legacy | dual | membership).
//  - legacy: bugünkü davranış birebir (rol Users.owner/roleCode'dan; resolveTier). Bu dosya hiçbir okuma/metrik üretmez.
//  - dual: rol iki kaynaktan da çözülür; KARAR legacy'ye göredir (görev kararı: ADR §6 metni "üyelik kazanır" der, K1 ölçüm
//    aşamasıdır -- karar değişikliği güvenli geçişi için üyelik ancak `membership` modunda karar verir). Fark `authz.divergence`,
//    eksik üyelik `membership.fallback` olarak sayılır; yalnız SOĞUK okumada (önbellek girdisi başına bir kez).
//  - membership: karar Memberships'ten; üyelik yok/askıda/desteklenmeyen rol -> 403. tokenVersion kontrolü aynen sürer.
// Kararı RunOperation'a taşımak için membership modunda userContext'in eski-şekilli rol alanları (owner/roleCode) üyelik rolünden
// ÜRETİLİR (resolveTier/can aynı kalır; tek karar noktası bozulmaz).

export type MembershipSource = 'legacy' | 'dual' | 'membership';
export type PermissionSource = 'legacy' | 'membership';

/** Kimlik önbelleğine (kullanıcı belgesiyle birlikte) yazılan üyelik özeti; null = üyelik yok. */
export interface MembershipSnapshot { role: string; status: string }
/** Önbellekteki kullanıcı belgesi üzerindeki alan adı (buildUserContext bunu userContext'ten çıkarır). */
export const MEMBERSHIP_CACHE_FIELD = '__membership';

const log = logger.child({ module: 'api.membershipAuthz' });

export function membershipSource(): MembershipSource {
    const s = config.flags.membershipSource;
    return s === 'dual' || s === 'membership' ? s : 'legacy';
}

/** Eski alanlardan rol (dev-tools/_membershipsCommon.js legacyRole ile aynı eşleme; resolveTier tek kaynağı). */
export function legacyRoleOf(user: any): Role {
    return roleFromTier(resolveTier(user, { ga: false }).tier) as Role;
}

const ROLE_OVERLAY: Record<Role, { owner: boolean; roleCode: string }> = {
    owner: { owner: true, roleCode: 'ROLE_OWNER' },
    admin: { owner: false, roleCode: 'ROLE_ADMIN' },
    operator: { owner: false, roleCode: 'ROLE_OPERATOR' },
};

/** Üyelik rolünü eski-şekilli userContext/profil alanlarına yansıtır (girdi değişmez). */
export function overlayRole<T extends object>(user: T, role: Role): T {
    return { ...user, ...ROLE_OVERLAY[role] };
}

function isSystemRole(role: unknown): role is Role {
    return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}

/** Üyeliği okur (lean + projeksiyon). Bulunamazsa null. Hata fırlatır (fail-closed: çağıran 500 verir). */
export async function loadMembership(appDb: any, sub: unknown, tid: number): Promise<MembershipSnapshot | null> {
    const m: any = await appDb.getMembershipModel().findOne({ userId: sub, tid }, 'role status').lean();
    return m ? { role: String(m.role), status: String(m.status) } : null;
}

/** Soğuk okuma sonrası (dual): fallback/sapma ölçümü. PII yok: yalnız tid + roller + tür. Metrik tenant etiketi taşımaz. */
export function measureDual(user: any, membership: MembershipSnapshot | null, tid: number | undefined): void {
    const legacyRole = legacyRoleOf(user);
    if (!membership) {
        metricsRegistry.incCounter('membership.fallback', { source: 'dual' });
        log.warn({ event: 'membership.fallback', tid, legacyRole }, 'Üyelik kaydı yok; eski alanlardan çözüldü');
        return;
    }
    const kinds: string[] = [];
    if (membership.status !== 'active') kinds.push('status');
    if (membership.role !== legacyRole) kinds.push('role');
    for (const kind of kinds) {
        metricsRegistry.incCounter('authz.divergence', { kind });
        log.warn({ event: 'authz.divergence', kind, tid, legacyRole, membershipRole: membership.role, membershipStatus: membership.status },
            'Eski alan ile üyelik kararı ayrışıyor');
    }
}

export interface AuthzDecision {
    /** Kararı veren kaynak. */
    source: PermissionSource;
    /** Kararın rolü (legacy: resolveTier; membership: üyelik). */
    role: Role;
    /** userContext/profil üzerine yansıtılacak rol (yalnız membership modunda; legacy'de belge aynen kalır). */
    overlay?: Role;
}

/**
 * Tenant kullanıcısı (ga değil) için karar. `membership` modunda üyelik yok/askıda/desteklenmeyen rol -> ApplicationError 403.
 * `user` önbellekteki (dondurulmuş) belge; üyelik özeti `MEMBERSHIP_CACHE_FIELD` üzerindedir.
 */
export function decide(mode: MembershipSource, user: any): AuthzDecision {
    if (mode !== 'membership') return { source: 'legacy', role: legacyRoleOf(user) };
    const m: MembershipSnapshot | null | undefined = user?.[MEMBERSHIP_CACHE_FIELD];
    if (!m) return deny('no_membership', 'MEMBERSHIP_REQUIRED');
    if (m.status !== 'active') return deny(m.status === 'suspended' ? 'suspended' : 'inactive', 'MEMBERSHIP_SUSPENDED');
    if (!isSystemRole(m.role)) return deny('unsupported_role', 'MEMBERSHIP_ROLE_UNSUPPORTED');
    return { source: 'membership', role: m.role, overlay: m.role };
}

function deny(reason: string, code: string): never {
    metricsRegistry.incCounter('authz.membership_denied', { reason });
    throw new ApplicationError('Forbidden', 403, code);
}

/**
 * Login/profil yolu: `membership` modunda profil (permissions[]) üyelik rolünden kurulur; üyelik yok/askıdaysa giriş 403.
 * legacy/dual/süper yönetici: belge aynen döner (dual kararı legacy'dir).
 */
export async function resolveProfileSource(appDb: any, userObj: any): Promise<any> {
    if (membershipSource() !== 'membership' || !userObj || userObj.isGlobalAdmin === true) return userObj;
    const tid = Number(userObj.order);
    if (!Number.isInteger(tid) || tid <= 0) return userObj; // tenant'sız: karar yok (yalnız profil)
    const membership = await loadMembership(appDb, userObj._id, tid);
    const d = decide('membership', { ...userObj, [MEMBERSHIP_CACHE_FIELD]: membership });
    return overlayRole(userObj, d.overlay as Role);
}

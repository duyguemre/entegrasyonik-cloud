// ADR-0028 Karar 4 (WP-A1): TEK yetki karar noktası. `can(actor, permission, resource?)`.
// Bugün yalnız tenant kapsamı (resource yok sayılır; Aşama 3'te entegrasyon kapsamı buraya bağlanır). Arayüz soyut tutulur:
// eşik aşılırsa politika motoru arkaya takılır. Entitlement (plan) AYRI katmandır (RunOperation entitlement guard).
// platformAdmin tenant rolü DEĞİLDİR: `PLATFORM_ONLY` izinli yeteneklere yalnız o girer; tenant içinde admin izinlerini taşır
// (bugünkü davranış: süper yönetici tenant bağlamında admin kademesi).
import { PLATFORM_ONLY, type CapabilityPermission, type Permission } from '../../../capabilities/permissions';
import { ROLE_PERMISSIONS, roleFromTier, type Role } from '../../../capabilities/roles';
import { resolveTier, type TenantTier } from './tier';

export interface AuthzActor {
    tier?: TenantTier;
    platformAdmin?: boolean;
}

export type CanResult = { allowed: true } | { allowed: false; code: 'FORBIDDEN' };

/** Aktörün tenant rolü (platform yöneticisi tenant bağlamında admin). Kimliksiz -> undefined. */
export function roleOf(actor: AuthzActor | undefined): Role | undefined {
    return actor ? roleFromTier(actor.tier) : undefined;
}

/** Aktörün etkili tenant izinleri (sıralı; FE'ye taşınan liste). Platform işareti listelenmez. */
export function permissionsOf(actor: AuthzActor | undefined): Permission[] {
    const role = roleOf(actor);
    return role ? [...ROLE_PERMISSIONS[role]].sort() : [];
}

/** `resource` bugün yok sayılır (kaynak kapsamı Aşama 3). */
export function can(actor: AuthzActor | undefined, permission: CapabilityPermission, _resource?: unknown): CanResult {
    if (!actor) return { allowed: false, code: 'FORBIDDEN' };
    if (permission === PLATFORM_ONLY) return actor.platformAdmin === true ? { allowed: true } : { allowed: false, code: 'FORBIDDEN' };
    const role = roleOf(actor);
    if (!role) return { allowed: false, code: 'FORBIDDEN' };
    return ROLE_PERMISSIONS[role].has(permission) ? { allowed: true } : { allowed: false, code: 'FORBIDDEN' };
}

/** Doğrudan userContext + principal'dan (RunOperation/Export yolları). */
export function canFor(userContext: any, principal: any, permission: CapabilityPermission, resource?: unknown): CanResult {
    return can(resolveTier(userContext, principal), permission, resource);
}

/** FE'ye taşınan izin listesi: profil belgesinden (login/userContext/selectStore). ga -> admin izinleri. */
export function permissionsForProfile(user: any): Permission[] {
    if (!user || typeof user !== 'object') return [];
    return permissionsOf(resolveTier(user, { ga: user.isGlobalAdmin === true }));
}

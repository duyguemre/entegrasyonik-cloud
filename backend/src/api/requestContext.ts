import { randomUUID } from 'crypto';
import type { TenantEntry } from '@database/TenantRegistry';
import { getRequestId } from '@platform/core/context';
import { resolveTier, type TenantTier } from './operationPolicy';
import { ROLE_PERMISSIONS, roleFromTier, type Role } from '../capabilities/roles';
import type { Permission } from '../capabilities/permissions';

const EMPTY_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>();

/**
 * ADR-0024 D3 / ADR-0028: doğrulanmış istek bağlamı. `authenticate` kurar, `RunOperation` servise taşır, servis `this.ctx` ile okur.
 * (Not: `platform/core/context`'teki `RequestContext` günlük/izleme bağlamıdır; bu tip servis katmanının kimlik/tenant bağlamıdır.)
 */
export type ActorType = 'user' | 'platform' | 'impersonator';

export interface Actor {
    /** Merkezi Users._id (doğrulanmış token). */
    readonly sub: string;
    /** Doğrulanmış tenant numarası; mağaza seçmemiş platform yöneticisinde yok. */
    readonly tid?: number;
    /** Tenant kademesi (resolveTier); kimliksiz/geçersizde undefined. Platform yöneticisi de tenant işlemlerinde 'admin' kademesindedir. */
    readonly tier?: TenantTier;
    readonly tokenVersion: number;
    /** Platform yöneticisi başka bir tenant'ı görüntülüyor (impersonation). */
    readonly imp?: boolean;
    readonly actorType: ActorType;
    /** ADR-0028 Karar 3: tenant rolü (platform yöneticisi tenant bağlamında 'admin'); kimliksiz/geçersizde undefined. */
    readonly role?: Role;
    /** Rolün etkili izinleri (WP-A1 roles.ts). Profil DTO'daki permissions[] ile aynı kaynaktan (userContext) türer. */
    readonly permissions: ReadonlySet<Permission>;
    /** Rolü hangi kaynağın belirlediği (MEMBERSHIP_SOURCE: legacy/dual -> 'legacy'; membership -> 'membership'). */
    readonly permissionSource: 'legacy' | 'membership';
}

export interface RequestContext {
    readonly actor: Actor;
    /** Çözülmüş (ACTIVE doğrulanmış) tenant kaydı; tenant'sız bağlamda (mağaza seçmemiş platform yöneticisi) yok. */
    readonly tenant?: TenantEntry;
    readonly requestId: string;
    /** İstemci IP'si (sunucu tarafı; gövdeden ASLA alınmaz). */
    readonly ip?: string;
}

/** Doğrulanmış principal + sunucuda kurulan userContext'ten dondurulmuş Actor. Principal yoksa undefined. */
export function buildActor(principal: any, userContext?: any, opts?: { permissionSource?: 'legacy' | 'membership' }): Actor | undefined {
    if (!principal || typeof principal !== 'object' || typeof principal.sub !== 'string') return undefined;
    const ga = principal.ga === true;
    const imp = principal.imp === true;
    const tier = resolveTier(userContext, principal).tier;
    const role = roleFromTier(tier);
    return Object.freeze({
        sub: principal.sub,
        tid: typeof principal.tid === 'number' ? principal.tid : undefined,
        tier,
        role,
        permissions: role ? ROLE_PERMISSIONS[role] : EMPTY_PERMISSIONS,
        permissionSource: opts?.permissionSource ?? 'legacy',
        tokenVersion: Number.isInteger(principal.tv) ? principal.tv : 0,
        imp: imp || undefined,
        actorType: ga ? (imp ? 'impersonator' : 'platform') : 'user',
    });
}

export function buildRequestContext(args: { principal?: any; userContext?: any; tenant?: TenantEntry; ip?: string; requestId?: string }): RequestContext | undefined {
    const actor = buildActor(args.principal, args.userContext);
    if (!actor) return undefined;
    return Object.freeze({ actor, tenant: args.tenant, requestId: args.requestId ?? getRequestId() ?? randomUUID(), ip: args.ip });
}

// ADR-0028 Karar 3 (WP-A1): sistem rolleri (kodda) ve rol -> izin eşlemesi. Aşama 1: owner / admin / operator.
// (viewer, accountant: Aşama 2.) `platformAdmin` bir TENANT ROLÜ DEĞİLDİR: ayrı dikeydir (PLATFORM_ONLY işareti, can.ts).
// Hiyerarşi: owner ⊇ admin ⊇ operator. Eski kademe eşlemesi: member -> operator.
import type { Permission } from './permissions';

export type Role = 'owner' | 'admin' | 'operator';
export const ROLES: ReadonlyArray<Role> = ['operator', 'admin', 'owner'];

/** Operatör: bugünkü `member` kademesindeki yeteneklerin izinlerinin tamamı (parite). */
const OPERATOR: ReadonlyArray<Permission> = [
    'catalog:read', 'catalog:write', 'catalog:delete', 'catalog:publish',
    'stock:read',
    'orders:read', 'orders:write', 'claims:read', 'claims:write',
    'customers:read', 'customers:write', 'messages:read', 'messages:reply',
    'invoices:read', 'invoices:write', 'invoices:delete', 'shipments:read', 'shipments:write', 'finance:read',
    'integrations:read', 'integrations:sync',
    'reports:read', 'data:export',
    'settings:read', 'billing:read', 'support:use',
    'self:manage', 'app:use',
];

/** Yönetici: operatör + `tenant:*` dışındaki admin kademeli izinler. */
const ADMIN_EXTRA: ReadonlyArray<Permission> = [
    'integrations:manage', 'settings:manage', 'users:read', 'users:manage', 'audit:read', 'billing:manage', 'customers:anonymize',
];

/** Sahip: yönetici + tenant sahipliği izinleri. */
const OWNER_EXTRA: ReadonlyArray<Permission> = ['tenant:export', 'tenant:delete', 'tenant:transfer'];

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = Object.freeze({
    operator: new Set<Permission>(OPERATOR),
    admin: new Set<Permission>([...OPERATOR, ...ADMIN_EXTRA]),
    owner: new Set<Permission>([...OPERATOR, ...ADMIN_EXTRA, ...OWNER_EXTRA]),
});

/** Eski kademe (member/admin/owner) -> sistem rolü. */
export function roleFromTier(tier: 'member' | 'admin' | 'owner' | undefined): Role | undefined {
    if (tier === 'member') return 'operator';
    if (tier === 'admin') return 'admin';
    if (tier === 'owner') return 'owner';
    return undefined;
}

/** Bir tenant izninin en düşük rolü (ör. minTier türetimi için). Hiçbir rolde yoksa undefined. */
export function lowestRoleFor(permission: string): Role | undefined {
    return ROLES.find((r) => (ROLE_PERMISSIONS[r] as ReadonlySet<string>).has(permission));
}

const ROLE_TO_TIER = { operator: 'member', admin: 'admin', owner: 'owner' } as const;
/** İzinden türetilen minTier (geriye uyum): izni içeren en düşük rolün kademesi. */
export function minTierFromPermission(permission: string): 'member' | 'admin' | 'owner' | undefined {
    const r = lowestRoleFor(permission);
    return r ? ROLE_TO_TIER[r] : undefined;
}

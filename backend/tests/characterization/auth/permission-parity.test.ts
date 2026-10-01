import { describe, it, expect } from '@jest/globals';
import { CAPABILITIES, CAPABILITY_BY_RPC, findRegistryInvariantViolations } from '../../../src/capabilities';
import { PERMISSIONS, PLATFORM_ONLY, isPermission } from '../../../src/capabilities/permissions';
import { ROLES, ROLE_PERMISSIONS, minTierFromPermission } from '../../../src/capabilities/roles';
import { can, canFor, permissionsOf, permissionsForProfile, type AuthzActor } from '../../../src/platform/core/authz/can';
import { isAllowed, getRequiredPermission } from '../../../src/api/rpc/operationPolicy';
import { OPERATION_POLICY_SNAPSHOT } from './operationPolicy.snapshot';

// ADR-0028 WP-A1: izin kataloğu + kademe paritesi. Referans: Aşama A öncesi ELLE tablo (snapshot; bağımsız kaynak).
const ACTORS: Array<AuthzActor & { name: string }> = [
  { name: 'member', tier: 'member' },
  { name: 'admin', tier: 'admin' },
  { name: 'owner', tier: 'owner' },
  { name: 'platformAdmin', tier: 'admin', platformAdmin: true },
  { name: 'anonymous' },
];

describe('WP-A1 parite: 174 operasyon, bugünkü kademe kararı == izin modeli kararı', () => {
  const pairs: Array<[string, string, string]> = [];
  for (const [svc, ops] of Object.entries(OPERATION_POLICY_SNAPSHOT)) for (const [op, tier] of Object.entries(ops)) pairs.push([svc, op, tier as string]);

  it('312 operasyon = 208 tenant + 104 platformAdmin (hepsi aynı karar testinden geçer)', () => {
    expect(pairs.filter(([, , t]) => t !== 'platformAdmin')).toHaveLength(208); // MOB-04: +3 web push (member); PRC-R0/R1: +5 PricingService (member); PRC-R2: +8 PricingService (3 member + 5 admin); COM-08: +1 FinancialService/getCommissionDrift (member)
    expect(pairs).toHaveLength(312); // COM-08: +1; MOB-06: +3 backoffice web push (platformAdmin); MOB-08: +BackofficeTenantService/getUsage; PRC-CFG: +3 BackofficeBillingService rekabet ayarı (platformAdmin); PRC-R2: +1 fiyat kuralları özeti (platformAdmin)
  });

  it('her operasyon ve her aktör için karar birebir aynı (fark listelenir)', () => {
    const diffs: string[] = [];
    for (const [svc, op, tier] of pairs) {
      const cap = CAPABILITY_BY_RPC.get(`${svc}/${op}`);
      if (!cap) { diffs.push(`${svc}/${op}: yetenek yok`); continue; }
      for (const a of ACTORS) {
        const oldDecision = isAllowed(tier as any, { tier: a.tier, platformAdmin: a.platformAdmin === true } as any);
        const newDecision = can(a.tier ? a : undefined, cap.permission).allowed;
        if (oldDecision !== newDecision) diffs.push(`${svc}/${op} [${a.name}] eski=${oldDecision} yeni=${newDecision} (${cap.permission})`);
      }
    }
    expect(diffs).toEqual([]);
  });

  it('getRequiredPermission kayıttaki izni döner; kayıtta olmayan/prototip/_ önekli -> undefined', () => {
    expect(getRequiredPermission('OrderService', 'approveOrder')).toBe('orders:write');
    expect(getRequiredPermission('UserService', 'createUser')).toBe('users:manage');
    expect(getRequiredPermission('OrderService', 'nope')).toBeUndefined();
    expect(getRequiredPermission('OrderService', 'constructor')).toBeUndefined();
    expect(getRequiredPermission('X', '_y')).toBeUndefined();
  });
});

describe('WP-A1 katalog bütünlüğü', () => {
  it('kayıt değişmezleri (izin geçerli, minTier tutarlı, karışık kademe yok) ihlal edilmedi', () => {
    expect(findRegistryInvariantViolations()).toEqual([]);
  });
  it('her yetenek geçerli izin taşır (tenant: katalogdan; platform: PLATFORM_ONLY)', () => {
    for (const cap of CAPABILITIES) {
      if (cap.minTier === 'platformAdmin') expect([cap.id, cap.permission]).toEqual([cap.id, PLATFORM_ONLY]);
      else expect([cap.id, isPermission(cap.permission)]).toEqual([cap.id, true]);
    }
  });
  it('katalogdaki her izin en az bir yetenekte kullanılır', () => {
    const used = new Set(CAPABILITIES.map((c) => c.permission as string));
    expect(PERMISSIONS.filter((p) => !used.has(p))).toEqual([]);
  });
  it('bir izin tek kademeli: izinden türetilen minTier == yeteneğin minTier', () => {
    for (const cap of CAPABILITIES) if (cap.minTier !== 'platformAdmin') expect([cap.id, minTierFromPermission(cap.permission)]).toEqual([cap.id, cap.minTier]);
  });
  it('rol izinleri katalog dışı anahtar içermez; katalogda tekrar yok', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r]) expect(isPermission(p)).toBe(true);
  });
  it('hiçbir tenant rolü PLATFORM_ONLY taşımaz', () => {
    for (const r of ROLES) expect((ROLE_PERMISSIONS[r] as ReadonlySet<string>).has(PLATFORM_ONLY)).toBe(false);
  });
  it('ADR: admin tenant:* taşımaz; owner tümünü taşır', () => {
    expect([...ROLE_PERMISSIONS.admin].filter((p) => p.startsWith('tenant:'))).toEqual([]);
    expect([...ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
  });
  it('kayıt değişmezi: geçersiz izin ve tutarsız kademe yakalanır', () => {
    const base = CAPABILITIES.find((c) => c.id === 'orders.approve')!;
    const bad = findRegistryInvariantViolations([{ ...base, permission: 'nope:x' as any }]);
    expect(bad.map((v) => v.kind)).toContain('PERMISSION_INVALID');
    const mismatch = findRegistryInvariantViolations([{ ...base, permission: 'users:manage' }]);
    expect(mismatch.map((v) => v.kind)).toContain('PERMISSION_TIER_MISMATCH');
    const mixed = findRegistryInvariantViolations([
      { ...base, id: 'orders.a1' as any, bindings: [{ rpc: 'X/a' }] },
      { ...base, id: 'orders.a2' as any, minTier: 'admin', bindings: [{ rpc: 'X/b' }] },
    ]);
    expect(mixed.map((v) => v.kind)).toContain('PERMISSION_MIXED_TIER');
  });
});

describe('WP-A1 rol hiyerarşisi (owner ⊇ admin ⊇ operator)', () => {
  it('kapsama zinciri', () => {
    for (const p of ROLE_PERMISSIONS.operator) expect(ROLE_PERMISSIONS.admin.has(p)).toBe(true);
    for (const p of ROLE_PERMISSIONS.admin) expect(ROLE_PERMISSIONS.owner.has(p)).toBe(true);
    expect(ROLE_PERMISSIONS.admin.size).toBeGreaterThan(ROLE_PERMISSIONS.operator.size);
    expect(ROLE_PERMISSIONS.owner.size).toBeGreaterThan(ROLE_PERMISSIONS.admin.size);
  });
});

describe('WP-A1 can() birim', () => {
  it('kimliksiz -> ret; bilinmeyen izin -> ret (varsayılan ret)', () => {
    expect(can(undefined, 'orders:read')).toEqual({ allowed: false, code: 'FORBIDDEN' });
    expect(can({}, 'orders:read').allowed).toBe(false);
    expect(can({ tier: 'owner' }, 'nope:x' as any).allowed).toBe(false);
  });
  it('operator sipariş onaylar, kullanıcı yönetemez; admin yönetir ama tenant silemez; owner siler', () => {
    expect(can({ tier: 'member' }, 'orders:write').allowed).toBe(true);
    expect(can({ tier: 'member' }, 'users:manage').allowed).toBe(false);
    expect(can({ tier: 'admin' }, 'users:manage').allowed).toBe(true);
    expect(can({ tier: 'admin' }, 'tenant:delete').allowed).toBe(false);
    expect(can({ tier: 'owner' }, 'tenant:delete').allowed).toBe(true);
  });
  it('resource bugün yok sayılır', () => {
    expect(can({ tier: 'member' }, 'orders:read', { integrationCode: 'x' }).allowed).toBe(true);
  });
  it('platformAdmin ayrı katman: PLATFORM_ONLY yalnız ona; tenant içinde admin izinleri (owner değil)', () => {
    const ga = { tier: 'admin' as const, platformAdmin: true };
    expect(can(ga, PLATFORM_ONLY).allowed).toBe(true);
    expect(can({ tier: 'owner' }, PLATFORM_ONLY).allowed).toBe(false);
    expect(can(ga, 'users:manage').allowed).toBe(true);
    expect(can(ga, 'tenant:delete').allowed).toBe(false);
  });
  it('canFor userContext + principal üzerinden resolveTier ile karar verir', () => {
    expect(canFor({ owner: true }, { sub: 'u', ga: false }, 'tenant:export').allowed).toBe(true);
    expect(canFor({ roleCode: 'ROLE_ADMIN' }, { sub: 'u', ga: false }, 'tenant:export').allowed).toBe(false);
    expect(canFor({}, { sub: 'u', ga: false }, 'orders:read').allowed).toBe(true);
    expect(canFor({ owner: true }, undefined, 'orders:read').allowed).toBe(false);
  });
  it('permissionsOf / permissionsForProfile: sıralı liste; owner = tüm katalog; ga -> admin; kimliksiz -> []', () => {
    expect(permissionsOf({ tier: 'owner' })).toEqual([...PERMISSIONS].sort());
    expect(permissionsOf(undefined)).toEqual([]);
    expect(permissionsForProfile({ owner: true })).toEqual([...PERMISSIONS].sort());
    expect(permissionsForProfile({ roleCode: 'ROLE_ADMIN' })).not.toContain('tenant:delete');
    expect(permissionsForProfile({ roleCode: 'ROLE_OPERATOR' })).not.toContain('users:manage');
    expect(permissionsForProfile({ isGlobalAdmin: true })).toContain('users:manage');
    expect(permissionsForProfile(null)).toEqual([]);
  });
});

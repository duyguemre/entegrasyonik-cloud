import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';

// ADR-0028 WP-A3: authenticate + MEMBERSHIP_SOURCE (legacy | dual | membership). DB katmanı mock'lanır (DB/Redis/ağ YOK).
const appDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDb,
    getTenant: async (order: number) => ({ order, _id: 'client-oid', status: 'ACTIVE', dbname: 'entegrasyonikClient_' + order }),
  },
}));

import { authenticateRequest } from '../../../src/api/http/authenticate';
import { resetIdentityCacheForTests } from '../../../src/platform/core/security/identityCache';
import { metricsRegistry } from '../../../src/platform/runtime/metrics';
import { permissionsForProfile } from '../../../src/platform/core/authz/can';
import { ROLE_PERMISSIONS } from '../../../src/capabilities/roles';
import { makeReq, makeRes, signedToken, TEST_USER_ID } from '../../characterization/auth/_helpers';

const PRE = process.env.MEMBERSHIP_SOURCE;
let userDoc: any;
let membershipDoc: any; // null = üyelik yok
let findById: jest.Mock<any>;
let membershipFindOne: jest.Mock<any>;

const LEGACY: Record<string, any> = {
  owner: { owner: true, roleCode: 'ROLE_OWNER' },
  admin: { owner: false, roleCode: 'ROLE_ADMIN' },
  operator: { owner: false, roleCode: 'ROLE_OPERATOR' },
};

function setUser(legacyRole: string, over: any = {}) {
  userDoc = {
    _id: TEST_USER_ID, email: 'u@test.local', isGlobalAdmin: false, order: 3, tokenVersion: 0, isActive: true,
    ...LEGACY[legacyRole], ...over,
  };
}
const setMembership = (role: string | null, status = 'active') => { membershipDoc = role === null ? null : { role, status }; };

async function auth(tokenOver: any = {}) {
  const req = makeReq({ cookies: { JWT_TOKEN: signedToken(tokenOver) } });
  return authenticateRequest(req, makeRes());
}
async function authErr(tokenOver: any = {}): Promise<any> {
  try { await auth(tokenOver); } catch (e) { return e; }
  throw new Error('hata bekleniyordu');
}
const counter = (name: string, kind?: string) => {
  const snap = metricsRegistry.drain().filter((s) => s.metric === name && (kind === undefined || s.labels.kind === kind));
  return snap.reduce((a, s) => a + s.count, 0);
};

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  delete process.env.MEMBERSHIP_SOURCE;
  resetIdentityCacheForTests(60_000);
  metricsRegistry.resetForTests();
  findById = jest.fn(() => ({ lean: async () => userDoc }));
  membershipFindOne = jest.fn(() => ({ lean: async () => membershipDoc }));
  appDb.getUserModel = () => ({ findById });
  appDb.getMembershipModel = () => ({ findOne: membershipFindOne });
  setUser('owner'); setMembership('owner');
});
afterAll(() => { if (PRE === undefined) delete process.env.MEMBERSHIP_SOURCE; else process.env.MEMBERSHIP_SOURCE = PRE; });

describe('legacy (varsayılan): bugünkü davranış, üyelik OKUNMAZ', () => {
  it.each(['owner', 'admin', 'operator'] as const)('%s: rol Users alanlarından; Memberships hiç okunmaz; metrik yok', async (role) => {
    setUser(role); setMembership(role === 'owner' ? 'operator' : 'owner'); // üyelik ters olsa da yok sayılır
    const r = await auth();
    expect(r.actor.role).toBe(role);
    expect(r.actor.permissionSource).toBe('legacy');
    expect(r.actor.permissions).toBe(ROLE_PERMISSIONS[role]);
    expect(membershipFindOne).not.toHaveBeenCalled();
    expect(metricsRegistry.drain()).toEqual([]);
  });

  it('Users.order != tid -> 401 (eski tenant tutarlılığı)', async () => {
    setUser('owner', { order: 9 });
    expect((await authErr()).statusCode).toBe(401);
  });
});

describe('dual: karar legacy; sapma ve fallback ölçülür', () => {
  beforeEach(() => { process.env.MEMBERSHIP_SOURCE = 'dual'; });

  it.each(['owner', 'admin', 'operator'] as const)('%s: üyelik uyumlu -> karar legacy, sapma/fallback 0', async (role) => {
    setUser(role); setMembership(role);
    const r = await auth();
    expect(r.actor.role).toBe(role);
    expect(r.actor.permissionSource).toBe('legacy');
    expect(counter('authz.divergence')).toBe(0);
    expect(counter('membership.fallback')).toBe(0);
  });

  it('üyelik yok: legacy karar verir, membership.fallback +1 (tenant etiketi YOK)', async () => {
    setUser('admin'); setMembership(null);
    const r = await auth();
    expect(r.actor.role).toBe('admin');
    const snap = metricsRegistry.drain().find((s) => s.metric === 'membership.fallback')!;
    expect(snap.count).toBe(1);
    expect(Object.keys(snap.labels)).not.toContain('tid');
    expect(Object.keys(snap.labels)).not.toContain('tenant');
  });

  it('rol ayrışması: legacy kazanır (owner), authz.divergence{kind=role} +1', async () => {
    setUser('owner'); setMembership('operator');
    const r = await auth();
    expect(r.actor.role).toBe('owner');
    expect(counter('authz.divergence', 'role')).toBe(1);
  });

  it('üyelik askıda: legacy karar verir (oturum açık), divergence{kind=status} +1', async () => {
    setUser('operator'); setMembership('operator', 'suspended');
    const r = await auth();
    expect(r.actor.role).toBe('operator');
    expect(counter('authz.divergence', 'status')).toBe(1);
  });

  it('tenant kullanıcısı olmayan (ga) için üyelik okunmaz', async () => {
    setUser('owner', { isGlobalAdmin: true });
    const r = await auth({ ga: true, tid: 3 });
    expect(r.actor.role).toBe('admin');
    expect(membershipFindOne).not.toHaveBeenCalled();
  });

  it('sapma yalnız soğuk okumada sayılır (10 sıcak istek = 1 sayım)', async () => {
    setUser('owner'); setMembership('operator');
    for (let i = 0; i < 10; i++) await auth();
    expect(counter('authz.divergence')).toBe(1);
  });
});

describe('membership: karar Memberships\'ten', () => {
  beforeEach(() => { process.env.MEMBERSHIP_SOURCE = 'membership'; });

  it.each(['owner', 'admin', 'operator'] as const)('%s: rol üyelikten (legacy alanlar TERS olsa da); userContext/permissions tutarlı', async (role) => {
    setUser('operator', role === 'operator' ? { owner: true, roleCode: 'ROLE_OWNER' } : {}); setMembership(role);
    const r = await auth();
    expect(r.actor.role).toBe(role);
    expect(r.actor.permissionSource).toBe('membership');
    expect(r.actor.permissions).toBe(ROLE_PERMISSIONS[role]);
    // RunOperation'ın gördüğü userContext + profil DTO permissions[] aynı kaynaktan
    expect(permissionsForProfile(r.userContext)).toEqual([...ROLE_PERMISSIONS[role]].sort());
    expect(r.userContext.__membership).toBeUndefined();
  });

  it('üyelik yok -> 403 MEMBERSHIP_REQUIRED', async () => {
    setMembership(null);
    const e = await authErr();
    expect([e.statusCode, e.code]).toEqual([403, 'MEMBERSHIP_REQUIRED']);
    expect(counter('authz.membership_denied')).toBe(1);
  });

  it('üyelik askıda -> 403; sıcak istekte de her seferinde reddedilir (ek okuma yok)', async () => {
    setMembership('admin', 'suspended');
    expect((await authErr()).statusCode).toBe(403);
    expect((await authErr()).statusCode).toBe(403);
    expect(membershipFindOne).toHaveBeenCalledTimes(1);
  });

  it('davet edilmiş (kabul edilmemiş) ve desteklenmeyen rol -> 403', async () => {
    setMembership('admin', 'invited');
    expect((await authErr()).statusCode).toBe(403);
    resetIdentityCacheForTests(60_000);
    setMembership('viewer');
    expect((await authErr()).statusCode).toBe(403);
  });

  it('Users.order != tid çok-tenant üyeliği engellemez (tenant bağı üyeliktir)', async () => {
    setUser('operator', { order: 9 }); setMembership('admin');
    expect((await auth()).actor.role).toBe('admin');
    expect(membershipFindOne).toHaveBeenCalledWith({ userId: TEST_USER_ID, tid: 3 }, 'role status');
  });

  it('tokenVersion kontrolü sürer: tv değişmiş token -> 401 (üyelik okunmadan)', async () => {
    setUser('owner', { tokenVersion: 1 });
    expect((await authErr({ tv: 0 })).statusCode).toBe(401);
    expect(membershipFindOne).not.toHaveBeenCalled();
  });

  it('süper yönetici: üyelik aranmaz, tenant bağlamında admin', async () => {
    setUser('operator', { isGlobalAdmin: true }); setMembership(null);
    const r = await auth({ ga: true, tid: 3 });
    expect(r.actor.role).toBe('admin');
    expect(r.actor.permissionSource).toBe('legacy');
  });
});

describe('önbellek: ek üyelik okuması yalnız soğukta', () => {
  it.each(['dual', 'membership'])('%s: 5 istek = 1 Users + 1 Memberships okuması', async (mode) => {
    process.env.MEMBERSHIP_SOURCE = mode;
    for (let i = 0; i < 5; i++) await auth();
    expect(findById).toHaveBeenCalledTimes(1);
    expect(membershipFindOne).toHaveBeenCalledTimes(1);
  });

  it('legacy: 5 istek = 1 Users, 0 Memberships', async () => {
    for (let i = 0; i < 5; i++) await auth();
    expect(findById).toHaveBeenCalledTimes(1);
    expect(membershipFindOne).not.toHaveBeenCalled();
  });

  it('invalidateUser sonrası yeniden soğuk okuma; tv değişince (yeni tv, eski belge) eski token reddedilir', async () => {
    process.env.MEMBERSHIP_SOURCE = 'membership';
    await auth();
    const { getIdentityCache } = (require('../../../src/platform/core/security/identityCache') as typeof import('../../../src/platform/core/security/identityCache'));
    getIdentityCache().invalidateUser(TEST_USER_ID);
    setUser('owner', { tokenVersion: 1 });
    expect((await authErr({ tv: 0 })).statusCode).toBe(401);
    expect((await auth({ tv: 1 })).actor.role).toBe('owner');
    expect(membershipFindOne).toHaveBeenCalledTimes(2);
  });
});

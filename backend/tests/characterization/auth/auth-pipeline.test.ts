import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ADR-0001 adım 3-4, uçtan uca: gerçek authenticate middleware + gerçek ApiManager + gerçek RunOperation + sahte servis.
// DB mock'lu (DB/Redis/ağ YOK); Express yerine sahte app + elle zincirleme (middleware -> handler). Sırlar test-only.

const appDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => ({}), getTenant: async (order: number) => { const c: any = await appDb.getClientModel().findOne({ order }, 'status').lean(); return c ? { order, _id: 'cid', status: c.status, dbname: 'entegrasyonikClient_' + order } : undefined; } },
}));

const created: any[] = [];
class FakeTenantService {
  constructor(public clientId: any, public request: any) { created.push({ service: 'FakeTenantService', clientId, request }); }
  async init() { /* DB yok */ }
  async whoami() { return { clientId: this.clientId, request: this.request }; }
}
class AdminService {
  constructor(public clientId: any, public request: any) { created.push({ service: 'AdminService', clientId, request }); }
  async init() { /* DB yok */ }
  async getClients() { return ['tum-tenantlar']; }
}
class SecurityService {
  constructor(public clientId: any, public request: any) { created.push({ service: 'SecurityService', clientId, request }); }
  async init() { /* DB yok */ }
  async logout() { return { ok: 'ABCD' }; }
}

import { makeFakeApp, makeReq, makeRes, signedToken, forgedToken, unsignedToken, legacyStyleToken, nowSec, TEST_USER_ID } from './_helpers';

let userDoc: any;
let clientDoc: any;

function build() {
  let app: ReturnType<typeof makeFakeApp>;
  let mw: any;
  jest.isolateModules(() => {
    jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: { FakeTenantService, AdminService, SecurityService } }));
    // [ADR-0001 adım 5] sahte tenant servisi için kayıt eklenir (AdminService/SecurityService için GERÇEK kayıt kullanılır)
    require('../../../src/api/rpc/operationPolicy').OPERATION_POLICY.FakeTenantService = { whoami: 'member' };
    const { configureApis } = require('../../../src/api/rpc/ApiManager');
    const { createAuthenticateMiddleware } = require('../../../src/api/http/authenticate');
    app = makeFakeApp();
    configureApis(app, '/api');
    mw = createAuthenticateMiddleware('/api');
  });
  return { app: app!, mw };
}

/** Express'in yaptığı gibi: önce authenticate middleware'i, geçerse eşleşen handler. */
async function dispatch(method: 'GET' | 'POST', path: string, cookies: any, body: any = {}) {
  const { app, mw } = build();
  const res = makeRes();
  const req: any = makeReq({ method, path, cookies, body });
  let passed = false;
  await mw(req, res, () => { passed = true; });
  if (!passed) return { res, reachedHandler: false };
  const segs = path.replace(/^\/api\//, '').split('/');
  const explicit = app.routes[`${method} ${path}`] || app.routes[`${method} /api/${segs.join('/')}`];
  if (explicit) { await explicit(req, res); return { res, reachedHandler: true }; }
  if (method === 'POST') { req.params = { service: segs[0], operation: segs[1] }; await app.routes['POST /api/:service/:operation'](req, res); }
  else { req.params = { service: segs[0] }; await app.routes['GET /api/:service'](req, res); }
  return { res, reachedHandler: true };
}
const ck = (t: string) => ({ JWT_TOKEN: t });

beforeEach(() => {
  created.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  userDoc = {
    _id: TEST_USER_ID, email: 'u@test.local', password: 'HASH-PLACEHOLDER', isGlobalAdmin: false, owner: false,
    roleCode: 'ROLE_OPERATOR', order: 3, resources: ['r'], tokenVersion: 0,
  };
  clientDoc = { status: 'ACTIVE' };
  appDb.getUserModel = () => ({ findById: () => ({ lean: async () => userDoc }) });
  appDb.getClientModel = () => ({ findOne: () => ({ lean: async () => clientDoc }) });
});

describe('Kimlik hattı uçtan uca (ADR-0001 adım 3-4)', () => {
  it('[ADR-0001 adım 4] servis yalnızca DOĞRULANMIŞ tid\'i görür: gövdedeki userContext/order/clientId/principal sunucuda ezilir/atılır', async () => {
    const { res } = await dispatch('POST', '/api/FakeTenantService/whoami', ck(signedToken({ tid: 3 })), {
      userContext: { order: 99, isGlobalAdmin: true, owner: true }, order: 99, clientId: 99, principal: { ga: true, tid: 99 }, benim: 'veri',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.clientId).toBe(3);
    expect(res.body.request.benim).toBe('veri');
    expect(res.body.request.order).toBeUndefined();
    expect(res.body.request.clientId).toBeUndefined();
    expect(res.body.request.userContext).toMatchObject({ order: 3, isGlobalAdmin: false, owner: false, roleCode: 'ROLE_OPERATOR' });
    expect(res.body.request.userContext.password).toBeUndefined();
    expect(res.body.request.userContext.tokenVersion).toBeUndefined();
    expect(res.body.request.principal).toMatchObject({ sub: TEST_USER_ID, tid: 3, ga: false });
  });

  it('[ADR-0001 adım 4] başka tenant\'ın tid\'iyle (sunucu sırrıyla imzalı bile olsa) üretilmiş token servise ULAŞAMAZ: Users.order uyuşmazlığı 401', async () => {
    const { res, reachedHandler } = await dispatch('POST', '/api/FakeTenantService/whoami', ck(signedToken({ tid: 99 })), {});
    expect(res.statusCode).toBe(401);
    expect(reachedHandler).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('[ADR-0001 adım 3] sahte imzalı / imzasız (alg=none) / eski sabit-sır tarzı süresiz token tenant servisine ulaşamaz: 401, servis örneklenmez (eskiden order payload\'dan alınıp tam erişim)', async () => {
    for (const t of [forgedToken({ tid: 7 }), unsignedToken({ tid: 7 }), legacyStyleToken({ _id: TEST_USER_ID, order: 7, isGlobalAdmin: true })]) {
      const { res, reachedHandler } = await dispatch('POST', '/api/FakeTenantService/whoami', ck(t), {});
      expect(res.statusCode).toBe(401);
      expect(reachedHandler).toBe(false);
    }
    expect(created).toHaveLength(0);
  });

  it('[ADR-0001 adım 3] token\'sız AdminService/getClients 401 (eskiden kimliksiz çalışırdı; BACKLOG C2\'nin kimliksiz kısmı); tenant servisi GET da 401', async () => {
    const r1 = await dispatch('POST', '/api/AdminService/getClients', {}, {});
    expect(r1.res.statusCode).toBe(401);
    const r2 = await dispatch('GET', '/api/FakeTenantService', {});
    expect(r2.res.statusCode).toBe(401);
    expect(created).toHaveLength(0);
  });

  it('[ADR-0001 adım 5] kimlikli ama SIRADAN kullanıcı AdminService/getClients: 403 (eskiden her kimlikli kullanıcıya açıktı); servis ÖRNEKLENMEZ; owner bile 403', async () => {
    const r1 = await dispatch('POST', '/api/AdminService/getClients', ck(signedToken()), {});
    expect(r1.res.statusCode).toBe(403);
    userDoc.owner = true; userDoc.roleCode = 'ROLE_OWNER';
    const r2 = await dispatch('POST', '/api/AdminService/getClients', ck(signedToken()), {});
    expect(r2.res.statusCode).toBe(403);
    expect(created).toHaveLength(0);
  });

  it('[ADR-0001 adım 5] süper yönetici (ga) AdminService/getClients çağırabilir: 200', async () => {
    userDoc.isGlobalAdmin = true; delete userDoc.order;
    const { res } = await dispatch('POST', '/api/AdminService/getClients', ck(signedToken({ ga: true, tid: undefined, role: 'ROLE_ADMIN' })), {});
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(['tum-tenantlar']);
  });

  it('[ADR-0001 adım 5] kayıtta olmayan operasyon uçtan uca 403 (kimlikli kullanıcı için bile); init/toString/_gizli servis çağrılmadan reddedilir', async () => {
    for (const op of ['init', 'toString', '_gizli', 'olmayanOp']) {
      const { res } = await dispatch('POST', '/api/FakeTenantService/' + op, ck(signedToken()), {});
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    }
    expect((await dispatch('POST', '/api/YokServis/whoami', ck(signedToken()), {})).res.statusCode).toBe(403);
    expect(created).toHaveLength(0);
  });

  it('[ADR-0001 adım 3] açık rota SecurityService/logout token\'sız çalışır', async () => {
    const { res } = await dispatch('POST', '/api/SecurityService/logout', {}, {});
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(true);
  });

  it('[ADR-0001 adım 4] tokenVersion uyuşmazlığı, pasif kullanıcı, askıdaki tenant uçtan uca servise ULAŞMAZ (401/401/403)', async () => {
    userDoc.tokenVersion = 1;
    expect((await dispatch('POST', '/api/FakeTenantService/whoami', ck(signedToken({ tv: 0 })), {})).res.statusCode).toBe(401);
    userDoc.tokenVersion = 0; userDoc.isActive = false;
    expect((await dispatch('POST', '/api/FakeTenantService/whoami', ck(signedToken()), {})).res.statusCode).toBe(401);
    userDoc.isActive = true; clientDoc = { status: 'SUSPENDED' };
    expect((await dispatch('POST', '/api/FakeTenantService/whoami', ck(signedToken()), {})).res.statusCode).toBe(403);
    expect(created).toHaveLength(0);
  });

  it('[ADR-0001 adım 4] geçerli oturumda sliding: kalan < 4 saat ise yanıtla birlikte yenilenmiş çerez gelir', async () => {
    const { res } = await dispatch('POST', '/api/FakeTenantService/whoami', ck(signedToken({ iat: nowSec() - 6 * 3600, exp: nowSec() + 3600 })), {});
    expect(res.statusCode).toBe(200);
    expect(res.cookies).toHaveLength(1);
    expect(res.cookies[0].name).toBe('JWT_TOKEN');
  });

  it('[ADR-0001 adım 3] /userContext yalnızca sunucuda kurulan bağlamı döner: parola özeti/tokenVersion/kilit alanları yok; FE alanları (owner, resources, roleCode) var', async () => {
    userDoc.owner = true; userDoc.failedLoginAttempts = 2;
    const { res } = await dispatch('GET', '/api/userContext', ck(signedToken()), {});
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ _id: TEST_USER_ID, owner: true, resources: ['r'], roleCode: 'ROLE_OPERATOR', order: 3 });
    for (const f of ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil']) expect(f in res.body).toBe(false);
  });
});

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ADR-0024 P1-CORE: authenticate kimlik önbelleği + TenantRegistry (RPC başına ApplicationDB okuması), tipli istek bağlamı (ctx),
// önbellek geçersizleme bağları, tenant-yok hata sözleşmesi. DB/Redis/ağ YOK: DatabaseManagerInstance mock'lu; tenant kaydı
// GERÇEK TenantRegistry (sayaçlı yükleyici) ile çözülür. Okuma sayısı = mock sayaçları.

import { TenantRegistry } from '../../../src/database/TenantRegistry';

const appDb: any = {};
const clientDb = { tag: 'clientDb' };
let registry: TenantRegistry;
const getClientDB = jest.fn(async (_id: number): Promise<any> => clientDb);
const getClientDBForTenant = jest.fn(async (_t: any): Promise<any> => clientDb);
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDb,
    getTenant: (order: number) => registry.get(order),
    getClientDB: (id: number) => getClientDB(id),
    getClientDBForTenant: (t: any) => getClientDBForTenant(t),
  },
}));

import { createAuthenticateMiddleware } from '../../../src/api/http/authenticate';
import { BaseApi } from '../../../src/api/rpc/BaseApi';
import ApiWrapper from '../../../src/api/rpc/ApiWrapper';
import { buildRequestContext } from '../../../src/api/rpc/requestContext';
import { getTenantRegistry } from '../../../src/database/TenantRegistry';
import { getIdentityCache, resetIdentityCacheForTests } from '../../../src/platform/core/security/identityCache';
import AdminService from '../../../src/api/rpc/handlers/admin-service';
import { makeReq, makeRes, signedToken, TEST_USER_ID } from '../../characterization/auth/_helpers';

let userDoc: any;
let clientDoc: any;
let userReads: number;
let tenantReads: number;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  resetIdentityCacheForTests(30_000);
  userReads = 0; tenantReads = 0;
  getClientDB.mockClear(); getClientDBForTenant.mockClear();
  userDoc = {
    _id: TEST_USER_ID, email: 'u@test.local', password: 'HASH', isGlobalAdmin: false, owner: true, roleCode: 'ROLE_OWNER',
    order: 3, tokenVersion: 0,
  };
  clientDoc = { _id: 'cid3', order: 3, status: 'ACTIVE', dbConfig: { dbname: 'entegrasyonikClient_3' } };
  registry = new TenantRegistry(async () => { tenantReads++; return clientDoc; }, 30_000);
  appDb.getUserModel = () => ({ findById: () => ({ lean: async () => { userReads++; return userDoc; } }) });
});

async function authenticate(token: string = signedToken()) {
  const mw = createAuthenticateMiddleware('/api');
  const res = makeRes();
  const next = jest.fn();
  await mw(makeReq({ method: 'POST', path: '/api/ProductService/getProducts', cookies: { JWT_TOKEN: token } }), res, next);
  return { res, next };
}

describe('authenticate: kimlik önbelleği + TenantRegistry -> ApplicationDB okuması', () => {
  it('soğukken 1 Users + 1 Clients okuması; SICAKKEN 0 okuma (RPC başına ApplicationDB okuması: eskiden 3 -> şimdi soğuk 2, sıcak 0)', async () => {
    const a = await authenticate();
    expect(a.next).toHaveBeenCalledTimes(1);
    expect({ userReads, tenantReads }).toEqual({ userReads: 1, tenantReads: 1 });
    for (let i = 0; i < 5; i++) await authenticate();
    expect({ userReads, tenantReads }).toEqual({ userReads: 1, tenantReads: 1 });
  });

  it('res.locals: dondurulmuş Actor + çözülmüş tenant kaydı; userContext.order yalnızca doğrulanmış tid', async () => {
    const { res } = await authenticate();
    expect(res.locals.actor).toMatchObject({ sub: TEST_USER_ID, tid: 3, tier: 'owner', tokenVersion: 0, actorType: 'user' });
    expect(Object.isFrozen(res.locals.actor)).toBe(true);
    expect(res.locals.tenant).toMatchObject({ order: 3, status: 'ACTIVE', dbname: 'entegrasyonikClient_3' });
    expect(res.locals.userContext.order).toBe(3);
  });

  it('actorType: platform yöneticisi mağazasız = platform; başka tenant görüntülerken (imp) = impersonator', async () => {
    userDoc = { ...userDoc, isGlobalAdmin: true, order: undefined };
    const p = await authenticate(signedToken({ ga: true, tid: undefined }));
    expect(p.res.locals.actor).toMatchObject({ actorType: 'platform', tid: undefined });
    expect(p.res.locals.tenant).toBeUndefined();
    const i = await authenticate(signedToken({ ga: true, tid: 3, imp: true }));
    expect(i.res.locals.actor).toMatchObject({ actorType: 'impersonator', imp: true, tid: 3 });
  });

  it('tokenVersion değişince: yeni tv anahtarı eski girdiyi bulmaz (DB okunur, kabul); geçersizleme sonrası ESKİ tv token 401', async () => {
    await authenticate(signedToken({ tv: 0 }));
    expect(userReads).toBe(1);
    userDoc = { ...userDoc, tokenVersion: 1 }; // parola değişti (tv 0 -> 1); olay aynı pod'da geçersiz kıldı
    getIdentityCache().invalidateUser(TEST_USER_ID);
    const oldTok = await authenticate(signedToken({ tv: 0 }));
    expect(oldTok.res.statusCode).toBe(401);
    expect(oldTok.next).not.toHaveBeenCalled();
    const newTok = await authenticate(signedToken({ tv: 1 }));
    expect(newTok.next).toHaveBeenCalledTimes(1);
  });

  it('yeni tv ile gelen token, geçersizleme OLMASA da önbelleğe takılmaz (anahtar tv içerir)', async () => {
    await authenticate(signedToken({ tv: 0 }));
    userDoc = { ...userDoc, tokenVersion: 1 };
    const fresh = await authenticate(signedToken({ tv: 1 }));
    expect(fresh.next).toHaveBeenCalledTimes(1);
    expect(userReads).toBe(2);
  });

  it('geçersizleme OLMAZSA eski tv token TTL boyunca önbellekten geçer (bilinen çok-pod sınırı; belgelenmiş)', async () => {
    await authenticate(signedToken({ tv: 0 }));
    userDoc = { ...userDoc, tokenVersion: 1 };
    expect((await authenticate(signedToken({ tv: 0 }))).next).toHaveBeenCalledTimes(1);
  });

  it('başarısız doğrulama ÖNBELLEĞE ALINMAZ', async () => {
    userDoc.tokenVersion = 5;
    expect((await authenticate(signedToken({ tv: 0 }))).res.statusCode).toBe(401);
    userDoc.tokenVersion = 0;
    expect((await authenticate(signedToken({ tv: 0 }))).next).toHaveBeenCalledTimes(1);
    expect(userReads).toBe(2);
  });

  it('kilit/pasiflik önbellekteki belgede HER istekte yeniden değerlendirilir; kilit yazan yol geçersiz kılınca anında 401', async () => {
    userDoc.lockUntil = new Date(Date.now() + 60_000);
    expect((await authenticate()).res.statusCode).toBe(401); // kilitli: önbelleğe girmez
    userDoc.lockUntil = undefined;
    expect((await authenticate()).next).toHaveBeenCalledTimes(1);
    userDoc.lockUntil = new Date(Date.now() + 60_000);
    getIdentityCache().invalidateUser(TEST_USER_ID);
    expect((await authenticate()).res.statusCode).toBe(401);
  });

  it('invalidateTenant o tenant\'ın girdilerini düşürür; başka tenant\'a dokunmaz', async () => {
    await authenticate();
    getIdentityCache().invalidateTenant(99);
    await authenticate();
    expect(userReads).toBe(1);
    getIdentityCache().invalidateTenant(3);
    await authenticate();
    expect(userReads).toBe(2);
  });

  it('TTL=0 (AUTH_IDENTITY_CACHE_TTL_MS=0) önbelleği kapatır: her istek Users okur', async () => {
    resetIdentityCacheForTests(0);
    await authenticate(); await authenticate();
    expect(userReads).toBe(2);
  });

  it('uçuştaki okuma, araya giren geçersizlemeden sonra önbelleğe YAZILMAZ (yarış)', () => {
    const c = getIdentityCache();
    const epoch = c.epoch;
    c.invalidateUser(TEST_USER_ID);
    c.set(TEST_USER_ID, 3, 0, userDoc, epoch);
    expect(c.get(TEST_USER_ID, 3, 0)).toBeUndefined();
  });
});

describe('Clients.status değişimi: TenantRegistry geçersizleme', () => {
  it('status ACTIVE -> PASSIVE: geçersizleme sonrası aynı pod\'da anında 403 (geçersizleme yoksa TTL boyunca bayat)', async () => {
    expect((await authenticate()).next).toHaveBeenCalledTimes(1);
    clientDoc = { ...clientDoc, status: 'PASSIVE' };
    expect((await authenticate()).next).toHaveBeenCalledTimes(1);
    registry.invalidate(3);
    const r = await authenticate();
    expect(r.res.statusCode).toBe(403);
    expect(r.res.body).toEqual({ error: 'Tenant is not active', code: 'FORBIDDEN' });
  });

  it('AdminService.updateClient status yazınca TenantRegistry + kimlik önbelleği geçersizlenir (bağ)', async () => {
    const invTenant = jest.spyOn(getTenantRegistry(), 'invalidate');
    const invId = jest.spyOn(getIdentityCache(), 'invalidateTenant');
    const s: any = new (AdminService as any)(undefined, { targetClientId: 3, clientData: { status: 'PASSIVE' } });
    s.applicationDB = { getClientModel: () => ({ findOneAndUpdate: async () => ({ order: 3, status: 'PASSIVE', title: 't' }) }) };
    await s.updateClient();
    expect(invTenant).toHaveBeenCalledWith(3);
    expect(invId).toHaveBeenCalledWith(3);
  });
});

describe('tenant bulunamayınca hata sözleşmesi', () => {
  it('authenticate: Clients kaydı yok -> 401 (mevcut sözleşme korunur; 500 değil), kayıt önbelleğe alınmaz', async () => {
    clientDoc = null;
    expect((await authenticate()).res.statusCode).toBe(401);
    clientDoc = { _id: 'cid3', order: 3, status: 'ACTIVE', dbConfig: { dbname: 'entegrasyonikClient_3' } };
    expect((await authenticate()).next).toHaveBeenCalledTimes(1);
  });

  it('BaseApi.init: authenticate ile çağrı arasında tenant silindiyse 500 değil 404 "Tenant not found"', async () => {
    getClientDB.mockResolvedValueOnce(undefined);
    await expect(new BaseApi(3, {}).init()).rejects.toMatchObject({ statusCode: 404, message: 'Tenant not found' });
  });
});

describe('tipli bağlam (ctx)', () => {
  class Probe extends BaseApi {
    async who() { return { ctx: this.ctx, cid: this.currentClientId, req: this.request }; }
    async open() { return this.ctxOrUndefined; }
  }

  it('ctx.tenant varsa BaseApi.init TenantRegistry\'ye tekrar gitmez (getClientDB çağrılmaz); ctx alanları doğru, dondurulmuş', async () => {
    const { res } = await authenticate();
    const ctx = buildRequestContext({ principal: res.locals.principal, userContext: res.locals.userContext, tenant: res.locals.tenant, ip: '203.0.113.9' })!;
    const out = await new ApiWrapper(Probe as any).process(3, 'who', { ctx, userContext: res.locals.userContext, principal: res.locals.principal });
    expect(getClientDB).not.toHaveBeenCalled();
    expect(getClientDBForTenant).toHaveBeenCalledTimes(1);
    expect(out.cid).toBe(3);
    expect(out.ctx.actor.sub).toBe(TEST_USER_ID);
    expect(out.ctx.tenant.dbname).toBe('entegrasyonikClient_3');
    expect(out.ctx.ip).toBe('203.0.113.9');
    expect(typeof out.ctx.requestId).toBe('string');
    expect(Object.isFrozen(out.ctx)).toBe(true);
  });

  it('ctx.tenant başka tenant\'a aitse yok sayılır (kayıt defteri yolu)', async () => {
    const { res } = await authenticate();
    const ctx = buildRequestContext({ principal: res.locals.principal, userContext: res.locals.userContext, tenant: { ...res.locals.tenant, order: 77 } })!;
    await new ApiWrapper(Probe as any).process(3, 'who', { ctx, principal: res.locals.principal, userContext: res.locals.userContext });
    expect(getClientDB).toHaveBeenCalledWith(3);
    expect(getClientDBForTenant).not.toHaveBeenCalled();
  });

  it('kimliksiz (açık operasyon) bağlamda this.ctx 401 fırlatır (fail-closed); ctxOrUndefined undefined', async () => {
    const p: any = new Probe(undefined as any, { a: 1 });
    await expect(p.who()).rejects.toMatchObject({ statusCode: 401 });
    expect(await p.open()).toBeUndefined();
  });

  it('geriye uyumluluk: RunOperation dışında (yalnız principal/userContext ile) kurulan serviste ctx ham istekten türetilir; this.request aynen erişilir', async () => {
    const req = { principal: { sub: 'u1', tid: 3, ga: false, tv: 2, imp: false }, userContext: { order: 3, roleCode: 'ROLE_ADMIN' } };
    const out = await (new Probe(3, req) as any).who();
    expect(out.ctx.actor).toMatchObject({ sub: 'u1', tid: 3, tokenVersion: 2, tier: 'admin', actorType: 'user' });
    expect(out.ctx.tenant).toBeUndefined();
    expect(out.req).toBe(req);
  });
});

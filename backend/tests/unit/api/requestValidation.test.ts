import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { makeFakeApp, makeReq, makeRes } from '../../characterization/auth/_helpers';

// [ADR-0023] RPC gövde şeması doğrulaması: RunOperation (gerçek OPERATION_POLICY + gerçek yetenek kaydı) + ApiManager hata zarfı.
// Servisler SAHTE (DB/Redis yok); geçerli/geçersiz/fazla alan/tenant alanı enjeksiyonu senaryoları.

const calls: any[] = [];
class Fake {
  constructor(public clientId: any, public request: any) { calls.push({ ctor: true, request }); }
  async init() { /* yok */ }
}
const ops = ['createUser', 'updateUser', 'deleteUser', 'updateSettings', 'saveClientMarketplaceSettings', 'saveClientECommerceSettings',
  'saveTenantStockPolicy', 'cancelOrder', 'bulkCancelOrder', 'sendTicketMessage', 'selectStore', 'deleteClient'];
function fakeService() {
  class S extends Fake {}
  for (const o of ops) (S.prototype as any)[o] = async function (this: any) { return { ok: o, clientId: this.clientId, request: this.request }; };
  return S;
}
const apis = () => ({ UserService: fakeService(), SettingService: fakeService(), IntegrationService: fakeService(), OrderService: fakeService(), TicketService: fakeService(), SecurityService: fakeService(), AdminService: fakeService() });

const P = { sub: 'u1', tid: 4, ga: false, tv: 0, imp: false, auth_time: 1, iat: 1, exp: 2, iss: 'i', aud: 'web' };
const ADMIN = { uc: { _id: 'u1', order: 4, roleCode: 'ROLE_ADMIN', owner: false }, pr: P };
const MEMBER = { uc: { _id: 'u1', order: 4, roleCode: 'ROLE_OPERATOR', owner: false }, pr: P };
const GA = { uc: { _id: 'u1', order: 4, isGlobalAdmin: true, owner: false }, pr: { ...P, ga: true } };

function loadRun() {
  let run: any;
  jest.isolateModules(() => {
    jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: apis() }));
    run = require('../../../src/api/rpc/RunOperation').default;
  });
  return run as (uc: any, s: string, o: string, body: any, pr?: any) => Promise<any>;
}

beforeEach(() => { calls.length = 0; });

const validUser = { name: 'Ada', surname: 'Lovelace', email: 'ada@example.com', password: 'S3cret!pass', roleCode: 'ROLE_OPERATOR' };

describe('RunOperation: şemalı RPC gövde doğrulaması (ADR-0023)', () => {
  it('geçerli gövde: servis çağrılır; sunucu alanları (userContext/principal) eklenir, tenant = doğrulanmış tid', async () => {
    const run = loadRun();
    const r = await run(ADMIN.uc, 'UserService', 'createUser', { user: validUser }, ADMIN.pr);
    expect(r.ok).toBe('createUser');
    expect(r.clientId).toBe(4);
    expect(r.request.user).toEqual(validUser);
    expect(r.request.principal).toBe(ADMIN.pr);
  });

  it('geçersiz gövde: 400 VALIDATION + alan yolu; servis ÖRNEKLENMEZ; ileti gövde DEĞERİNİ içermez', async () => {
    const run = loadRun();
    const bad = { user: { ...validUser, email: 'not-an-email-SECRETVALUE', password: 12345 } };
    const err: any = await run(ADMIN.uc, 'UserService', 'createUser', bad, ADMIN.pr).catch((e: any) => e);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION');
    expect(err.details).toEqual(expect.arrayContaining([{ path: 'user.email', message: 'geçersiz biçim' }, { path: 'user.password', message: 'geçersiz tip' }]));
    expect(err.message).toContain('user.email');
    expect(err.message).not.toContain('SECRETVALUE');
    expect(JSON.stringify(err.details)).not.toContain('12345');
    expect(calls).toEqual([]);
  });

  it('zorunlu alan eksik: "zorunlu alan"', async () => {
    const run = loadRun();
    const err: any = await run(ADMIN.uc, 'UserService', 'deleteUser', {}, ADMIN.pr).catch((e: any) => e);
    expect(err.details).toEqual([{ path: 'userId', message: 'zorunlu alan' }]);
  });

  it('NoSQL operatör nesnesi kimlik yerine reddedilir ({ $ne: null })', async () => {
    const run = loadRun();
    await expect(run(MEMBER.uc, 'OrderService', 'cancelOrder', { orderId: { $ne: null } }, MEMBER.pr)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    expect(calls).toEqual([]);
  });

  it('FAZLA ALAN (üst düzey) reddedilir: tenantId/ownerId benzeri alanlar gövdeden alınamaz; yalnız alan ADI raporlanır', async () => {
    const run = loadRun();
    const err: any = await run(ADMIN.uc, 'UserService', 'deleteUser', { userId: 'abc', tenantId: 99, ownerId: 'x' }, ADMIN.pr).catch((e: any) => e);
    expect(err.statusCode).toBe(400);
    expect(err.details[0].message).toBe('izin verilmeyen alan: tenantId, ownerId');
    expect(calls).toEqual([]);
  });

  it('sunucu alanları gövdeden ALINAMAZ: order/clientId/userContext/principal doğrulamadan önce atılır (tenant = principal)', async () => {
    const run = loadRun();
    const r = await run(ADMIN.uc, 'UserService', 'deleteUser', { userId: 'abc', order: 999, clientId: 999, userContext: { order: 999 }, principal: { ga: true } }, ADMIN.pr);
    expect(r.clientId).toBe(4);
    expect(r.request.userContext).toBe(ADMIN.uc);
    expect(r.request.principal).toBe(ADMIN.pr);
    expect(r.request.order).toBeUndefined();
    expect(r.request.clientId).toBeUndefined();
  });

  it('mass assignment: iç içe kullanıcı nesnesindeki owner/isGlobalAdmin/clientId/lockUntil servise ULAŞMAZ (allow-list)', async () => {
    const run = loadRun();
    const r = await run(ADMIN.uc, 'UserService', 'createUser',
      { user: { ...validUser, owner: true, isGlobalAdmin: true, clientId: 1, lockUntil: 0, failedLoginAttempts: -1 } }, ADMIN.pr);
    expect(Object.keys(r.request.user).sort()).toEqual(['email', 'name', 'password', 'roleCode', 'surname']);
  });

  it('SettingService.updateSettings: settings yoksa 400 (eskiden TypeError/500); _id/__v/docId atılır; "$" veya "." içeren anahtar reddedilir', async () => {
    const run = loadRun();
    await expect(run(ADMIN.uc, 'SettingService', 'updateSettings', {}, ADMIN.pr)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    const ok = await run(ADMIN.uc, 'SettingService', 'updateSettings', { settings: { _id: 'x', __v: 1, docId: 7, currency: 'TRY' } }, ADMIN.pr);
    expect(ok.request.settings).toEqual({ currency: 'TRY' });
    await expect(run(ADMIN.uc, 'SettingService', 'updateSettings', { settings: { 'a.b': 1 } }, ADMIN.pr)).rejects.toMatchObject({ statusCode: 400 });
    await expect(run(ADMIN.uc, 'SettingService', 'updateSettings', { settings: { $set: 1 } }, ADMIN.pr)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('entegrasyon ayarı: yalnız code+settings geçer; ayar anahtarına yol/operatör enjeksiyonu reddedilir', async () => {
    const run = loadRun();
    const ok = await run(ADMIN.uc, 'IntegrationService', 'saveClientMarketplaceSettings',
      { clientMarketplace: { code: 'trendyol', name: 'Trendyol', logo: 'x', settings: { API_KEY: 'k', SELLERID: '1' } } }, ADMIN.pr);
    expect(ok.request.clientMarketplace).toEqual({ code: 'trendyol', settings: { API_KEY: 'k', SELLERID: '1' } });
    await expect(run(ADMIN.uc, 'IntegrationService', 'saveClientMarketplaceSettings', { clientMarketplace: { code: 'trendyol', settings: { 'a.b': 1 } } }, ADMIN.pr)).rejects.toMatchObject({ statusCode: 400 });
    await expect(run(ADMIN.uc, 'IntegrationService', 'saveClientECommerceSettings', { clientECommerce: { code: 'x', settings: { $where: 1 } } }, ADMIN.pr)).rejects.toMatchObject({ statusCode: 400 });
    await expect(run(ADMIN.uc, 'IntegrationService', 'saveClientMarketplaceSettings', { clientMarketplace: { code: { $ne: 1 }, settings: {} } }, ADMIN.pr)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('stok politikası birincil kanal: null/boş (temizle) ve geçerli kod geçer; nesne reddedilir', async () => {
    const run = loadRun();
    for (const v of [null, '', 'trendyol']) await run(ADMIN.uc, 'IntegrationService', 'saveTenantStockPolicy', { primaryChannel: v }, ADMIN.pr);
    await expect(run(ADMIN.uc, 'IntegrationService', 'saveTenantStockPolicy', { primaryChannel: { $gt: '' } }, ADMIN.pr)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('sipariş iptali: FE biçimleri (tekil cancelData; toplu orderIds+cancelData) geçer, boş liste reddedilir', async () => {
    const run = loadRun();
    await run(MEMBER.uc, 'OrderService', 'cancelOrder', { orderId: 'o1', cancelData: { reasonId: 3, reason: 'Stok yok' } }, MEMBER.pr);
    await run(MEMBER.uc, 'OrderService', 'bulkCancelOrder', { orderIds: ['o1', 'o2'], cancelData: { reasonId: '3', reason: 'x' } }, MEMBER.pr);
    await expect(run(MEMBER.uc, 'OrderService', 'bulkCancelOrder', { orderIds: [] }, MEMBER.pr)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('destek mesajı: senderType=SUPPORT / senderId gövdeden ALINAMAZ (kimlik taklidi); FE biçimi (CLIENT) geçer', async () => {
    const run = loadRun();
    await run(MEMBER.uc, 'TicketService', 'sendTicketMessage', { ticketId: 't1', content: 'merhaba', senderType: 'CLIENT' }, MEMBER.pr);
    await expect(run(MEMBER.uc, 'TicketService', 'sendTicketMessage', { ticketId: 't1', content: 'x', senderType: 'SUPPORT' }, MEMBER.pr)).rejects.toMatchObject({ statusCode: 400 });
    await expect(run(MEMBER.uc, 'TicketService', 'sendTicketMessage', { ticketId: 't1', content: 'x', senderId: 'other' }, MEMBER.pr)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('selectStore: hedef tenant (sayı ya da rakam dizisi) geçer, gövde clientId korunur; nesne reddedilir', async () => {
    const run = loadRun();
    const r = await run(GA.uc, 'SecurityService', 'selectStore', { clientId: 7 }, GA.pr);
    expect(r.request.clientId).toBe(7);
    await run(GA.uc, 'SecurityService', 'selectStore', { clientId: '7' }, GA.pr);
    await expect(run(GA.uc, 'SecurityService', 'selectStore', { clientId: { $ne: 1 } }, GA.pr)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('yetkisiz çağrı DOĞRULAMADAN ÖNCE 403 alır (şema ayrıntısı yetkisiz çağırana sızmaz)', async () => {
    const run = loadRun();
    await expect(run(MEMBER.uc, 'AdminService', 'deleteClient', {}, MEMBER.pr)).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' });
  });

  it('şemasız (kayıtlı ama şema atanmamış) operasyon eskisi gibi çalışır: gövde AYNEN geçer', async () => {
    let run: any;
    jest.isolateModules(() => {
      class S extends Fake { async getUsers() { return { request: this.request }; } }
      jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: { UserService: S } }));
      run = require('../../../src/api/rpc/RunOperation').default;
    });
    const r = await run(ADMIN.uc, 'UserService', 'getUsers', { anything: { goes: 1 } }, ADMIN.pr);
    expect(r.request.anything).toEqual({ goes: 1 });
  });
});

describe('ApiManager: doğrulama hatası zarfı (ADR-0023)', () => {
  it('400 + { error, code:VALIDATION, fields:[{path,message}], service, operation }; parola değeri yanıtta YOK', async () => {
    let app: ReturnType<typeof makeFakeApp>;
    jest.isolateModules(() => {
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
      jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: apis() }));
      const { configureApis } = require('../../../src/api/rpc/ApiManager');
      app = makeFakeApp();
      configureApis(app, '/api');
    });
    const res = makeRes({ userContext: ADMIN.uc, principal: ADMIN.pr });
    await app!.routes['POST /api/:service/:operation'](
      makeReq({ cookies: {}, body: { user: { ...validUser, email: 'bad', password: 'HUNTER2-VALUE' } }, params: { service: 'UserService', operation: 'createUser' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
    expect(res.body.fields).toEqual([{ path: 'user.email', message: 'geçersiz biçim' }]);
    expect(res.body.service).toBe('UserService');
    expect(JSON.stringify(res.body)).not.toContain('HUNTER2-VALUE');
  });
});

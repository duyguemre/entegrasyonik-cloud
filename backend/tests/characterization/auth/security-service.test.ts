import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

// Characterization: backend/src/api/rpc/handlers/security-service.ts (+ ApiManager üzerinden uçtan uca yanıt biçimi)
// DB katmanı jest ile mock'lanır. Parolalar/özetler sahte test değerleridir; kaynak koddaki gömülü kimlik bilgileri assert EDİLMEZ.

const appDb: any = {};
const clientDb: any = {};
const getClientDB = jest.fn(async (_id: number) => clientDb);

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDb,
    getClientDB: (id: number) => getClientDB(id),
  },
}));

import SecurityService from '../../../src/api/rpc/handlers/security-service';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import Security from '../../../src/platform/core/security/Security';
import { makeFakeApp, makeReq, makeRes } from './_helpers';
import { makeCentralDb, makeTenantDb } from '../tenant/_fakes';

function chain(result: any) {
  const c: any = {};
  ['sort', 'select'].forEach(m => { c[m] = jest.fn(() => c); });
  c.lean = jest.fn(async () => result);
  c.exec = jest.fn(async () => result);
  return c;
}

let userModel: any, clientModel: any, catModel: any, brandModel: any, ciModel: any;
let storedUser: any;

/** Mongoose doc benzeri kullanıcı: alanlar + toObject(). */
function fakeUser(fields: any) {
  const u: any = { ...fields };
  u.toObject = () => { const { toObject, ...rest } = u; return { ...rest }; };
  return u;
}

async function make(request: any) {
  const svc: any = new SecurityService(undefined as any, request);
  await svc.init();
  return svc;
}

beforeEach(async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  getClientDB.mockClear();
  const hash = await Security.getInstance().hashPassword('correct-pw');
  storedUser = fakeUser({ _id: 'u1', email: 'a@b.c', password: hash, failedLoginAttempts: 0, order: 3, roleCode: 'ROLE_OWNER' });
  userModel = {
    findOne: jest.fn(async () => storedUser),
    updateOne: jest.fn(async () => ({})),
    create: jest.fn(async (p: any) => fakeUser({ _id: 'new-user', ...p })),
  };
  clientModel = {
    findOne: jest.fn(() => chain({ order: 4 })),
    create: jest.fn(async (p: any) => ({ _id: 'client-oid', ...p })),
    find: jest.fn(() => chain([{ clientId: 1, title: 'A' }])),
  };
  catModel = { findOneAndUpdate: jest.fn(async () => ({})) };
  brandModel = { findOneAndUpdate: jest.fn(async () => ({})) };
  ciModel = { create: jest.fn(async () => ({})) };
  Object.assign(clientDb, {
    getCategoryModel: () => catModel,
    getBrandModel: () => brandModel,
    getClientIntegrationModel: () => ciModel,
  });
  Object.assign(appDb, { getUserModel: () => userModel, getClientModel: () => clientModel });
});

// Taze oturum: yenilenen token'ın exp'i auth_time+7g ile sınırlı olduğundan (ADR-0001 Karar 4) sabit eski bir tarih kullanılamaz.
const AUTH_TIME = Math.floor(Date.now() / 1000) - 3600;

// [ADR-0001 adım 7] login servis sonucu artık { sessionClaims, body } zarfıdır: body = profil DTO'su (parola özeti/tokenVersion YOK),
// sessionClaims yalnızca ApiManager'da Set-Cookie ile imzalanır. Kimlik doğrulama hataları AYNI generik mesaj + 401 (kullanıcı enumeration yok).
const GENERIC = 'E-posta veya parola hatalı';

describe('SecurityService.login', () => {
  it('[ADR-0001 adım 7] kullanıcı yoksa yanlış parolayla AYNI generik mesaj ve 401 (eskiden "Kullanıcı bulunamadı.")', async () => {
    userModel.findOne = jest.fn(async () => null);
    await expect((await make({ username: 'x@y.z', password: 'p' })).login()).rejects.toMatchObject({ message: GENERIC, statusCode: 401 });
    expect(userModel.findOne).toHaveBeenCalledWith({ email: 'x@y.z' });
  });

  it('[ADR-0001 adım 7] kullanıcı yokken de sahte bcrypt karşılaştırması yapılır (zamanlama farkını azaltmak için); yanlış parolada gerçek karşılaştırma', async () => {
    const spy = jest.spyOn(Security.getInstance(), 'comparePassword');
    userModel.findOne = jest.fn(async () => null);
    await expect((await make({ username: 'x@y.z', password: 'p' })).login()).rejects.toMatchObject({ statusCode: 401 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1].startsWith('$2')).toBe(true); // geçerli bcrypt özeti (sahte)
    spy.mockRestore();
  });

  it('[ADR-0001 adım 7] lockUntil gelecekteyse (doğru parolayla bile) generik 401; sayaç değişmez (eskiden ayrı kilit mesajı)', async () => {
    storedUser.lockUntil = new Date(Date.now() + 60000);
    await expect((await make({ username: 'a@b.c', password: 'correct-pw' })).login()).rejects.toMatchObject({ message: GENERIC, statusCode: 401 });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] süresi geçmiş lockUntil engel değildir', async () => {
    storedUser.lockUntil = new Date(Date.now() - 1000);
    const r = await (await make({ username: 'a@b.c', password: 'correct-pw' })).login();
    expect(r.body._id).toBe('u1');
  });

  it('[ADR-0028 WP-A5] sahte captcha KALDIRILDI: failedLoginAttempts >= 3 iken de parola normal doğrulanır; captcha alanı yok sayılır, requireCaptcha ASLA dönmez', async () => {
    storedUser.failedLoginAttempts = 4;
    const r = await (await make({ username: 'a@b.c', password: 'correct-pw', captcha: 'rastgele' })).login();
    expect(r.body._id).toBe('u1');
    storedUser.failedLoginAttempts = 3;
    await expect((await make({ username: 'a@b.c', password: 'wrong' })).login()).rejects.toMatchObject({ message: GENERIC, statusCode: 401 });
    expect(userModel.updateOne).toHaveBeenCalled(); // sayaç artar (kilit eşiği 5 aynen)
  });

  it('[ADR-0001 adım 7] başarılı giriş: sayaç sıfırlanır; gövde PROFİL DTO\'sudur (parola özeti, tokenVersion, kilit alanları YOK); sessionClaims tokenVersion\'ı taşır', async () => {
    storedUser.tokenVersion = 4;
    storedUser.lockUntil = new Date(Date.now() - 1000);
    storedUser.__v = 0;
    const r = await (await make({ username: 'a@b.c', password: 'correct-pw' })).login();
    expect(userModel.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } });
    expect(r.body).toEqual({ _id: 'u1', email: 'a@b.c', order: 3, roleCode: 'ROLE_OWNER', emailVerified: false, permissions: expect.any(Array) }); // [ADR-0028 WP-A1] eklemeli alan
    for (const k of ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil', '__v']) expect(k in r.body).toBe(false);
    expect(r.sessionClaims).toMatchObject({ sub: 'u1', tid: 3, role: 'ROLE_OWNER', ga: false, tv: 4, imp: false });
    expect(JSON.stringify(r)).not.toContain(storedUser.password);
  });

  it('[ADR-0001 adım 7] hatalı parola: sayaç +1; 5\'ten önce lockUntil ATANMAZ; generik 401', async () => {
    storedUser.failedLoginAttempts = 1;
    await expect((await make({ username: 'a@b.c', password: 'wrong' })).login()).rejects.toMatchObject({ message: GENERIC, statusCode: 401 });
    expect(userModel.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { failedLoginAttempts: 2 } });
  });

  it('[MEVCUT DAVRANIŞ] 5. hatalı denemede 15 dakikalık kilit atanır (captcha eşiği 3, kilit eşiği 5)', async () => {
    storedUser.failedLoginAttempts = 4;
    const before = Date.now();
    await expect((await make({ username: 'a@b.c', password: 'wrong', captcha: 'x' })).login()).rejects.toMatchObject({ message: GENERIC });
    const upd = userModel.updateOne.mock.calls[0][1];
    expect(upd.$set.failedLoginAttempts).toBe(5);
    const lockMs = upd.$set.lockUntil.getTime() - before;
    expect(lockMs).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(lockMs).toBeLessThan(15 * 60 * 1000 + 5000);
  });

  it('[ADR-0001 adım 7] global admin: gövde { requireStoreSelection, clients (ACTIVE, clientId+title), user (profil DTO) }; parola özeti YOK', async () => {
    storedUser.isGlobalAdmin = true;
    const r = await (await make({ username: 'a@b.c', password: 'correct-pw' })).login();
    expect(r.body.requireStoreSelection).toBe(true);
    expect(r.body.clients).toEqual([{ clientId: 1, title: 'A' }]);
    expect(clientModel.find).toHaveBeenCalledWith({ status: 'ACTIVE' }, 'clientId title');
    expect('password' in r.body.user).toBe(false);
    expect(r.body.user.isGlobalAdmin).toBe(true);
    expect(r.sessionClaims.ga).toBe(true);
    expect(r.sessionClaims.tid).toBeUndefined();
  });

  it('[ADR-0001 adım 7] NoSQL operatör enjeksiyonu: username/password nesne (ör. { $ne: null }) ise 400 ve veritabanına HİÇ sorgu atılmaz', async () => {
    for (const bad of [{ $ne: null }, { $gt: '' }, ['a@b.c'], 123, null, undefined, true]) {
      await expect((await make({ username: bad, password: 'correct-pw' })).login()).rejects.toMatchObject({ statusCode: 400 });
      await expect((await make({ username: 'a@b.c', password: bad })).login()).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(userModel.findOne).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 7] boş veya aşırı uzun username/password 400', async () => {
    await expect((await make({ username: '', password: 'x' })).login()).rejects.toMatchObject({ statusCode: 400 });
    await expect((await make({ username: 'a@b.c', password: '' })).login()).rejects.toMatchObject({ statusCode: 400 });
    await expect((await make({ username: 'a@b.c', password: 'x'.repeat(2000) })).login()).rejects.toMatchObject({ statusCode: 400 });
    expect(userModel.findOne).not.toHaveBeenCalled();
  });
});

describe('SecurityService.register', () => {
  // [ADR-0003 adım 3] register artık TenantProvisioningService'e devreder; ayrıntılı senaryolar tests/characterization/tenant/ altındadır.
  // Bu blok SecurityService sınırındaki davranışı (girdi -> oturum zarfı/profil DTO) sabitler. Durum tutan sahte merkezi DB kullanılır.
  let central: ReturnType<typeof makeCentralDb>;
  let tenant: ReturnType<typeof makeTenantDb>;
  beforeEach(() => {
    central = makeCentralDb({ clients: [{ order: 4, clientId: 4, status: 'ACTIVE', dbConfig: { dbname: 'x4' } }] });
    tenant = makeTenantDb();
    Object.assign(appDb, central.appDb);
    Object.assign(clientDb, tenant.db);
  });
  const reg = (extra: any = {}) => ({ registerValues: { name: 'Ad', surname: 'Soyad', email: 'n@x.y', password: 'plain-pw', password2: 'plain-pw', ...extra } });

  it('[ADR-0003 adım 3] yeni tenant order = Counters ile max(order)+1; kullanıcı oluşturulur; gövde profil DTO\'su (parola özeti YOK); password2 modele yazılmaz', async () => {
    const r = await (await make(reg())).register();
    expect(central.clientModel.create.mock.calls[0][0]).toMatchObject({ order: 5, clientId: 5, status: 'PROVISIONING', title: 'Mağaza Adı 5' });
    const created: any = central.userModel.create.mock.calls[0][0];
    expect(created).toMatchObject({ email: 'n@x.y', name: 'Ad', surname: 'Soyad', clientId: 5, order: 5, owner: true, isGlobalAdmin: false, roleCode: 'ROLE_OWNER' });
    expect(created.password2).toBeUndefined();
    expect(created.password).not.toBe('plain-pw');
    expect(await Security.getInstance().comparePassword('plain-pw', created.password)).toBe(true);
    expect(r.body._id).toBe('u1');
    expect('password' in r.body).toBe(false); // hash artık HTTP yanıtına girmez (DTO)
    expect(r.sessionClaims).toMatchObject({ sub: 'u1', tid: 5, role: 'ROLE_OWNER', ga: false });
    expect(getClientDB).toHaveBeenCalledWith(5);
    expect(central.state.clients.find((c: any) => c.order === 5).status).toBe('ACTIVE');
  });

  it('[ADR-0003 adım 3] hiç client yoksa ilk order 1 olur', async () => {
    const empty = makeCentralDb();
    Object.assign(appDb, empty.appDb);
    await (await make(reg())).register();
    expect((empty.clientModel.create.mock.calls[0][0] as any).order).toBe(1);
  });

  it('[ADR-0008 §3 / ADR-0014 S4a] kayıt yeni tenant için `trialing` abonelik açar (kartsız deneme); yanıt gövdesi/oturum zarfı abonelik verisi SIZDIRMAZ ve istemci verili plan/status yok sayılır', async () => {
    const r = await (await make(reg({ planCode: 'enterprise', status: 'active', subscription: { status: 'active' }, billingExempt: true }))).register();
    expect(central.state.subscriptions).toHaveLength(1);
    expect(central.state.subscriptions[0]).toMatchObject({ clientId: 5, planCode: 'starter', status: 'trialing', billingExempt: false });
    expect(JSON.stringify(r.body)).not.toMatch(/trialing|subscription|planCode/);
  });

  it('[MEVCUT DAVRANIŞ - KORUNDU] kayıt yeni tenant\'a 8 varsayılan entegrasyon (trendyol, pazarama, n11, hepsiburada, ptt, ideasoft, bizimhesap, gib) ve varsayılan kategori/marka ekler', async () => {
    await (await make(reg())).register();
    const codes = (central.clientModel.create.mock.calls[0][0] as any).integrations.map((i: any) => i.integrationCode);
    expect(codes).toEqual(['trendyol', 'pazarama', 'n11', 'hepsiburada', 'ptt', 'ideasoft', 'bizimhesap', 'gib']);
    expect(tenant.catModel.findOneAndUpdate.mock.calls[0][0]).toEqual({ isMain: true });
    expect(tenant.brandModel.findOneAndUpdate.mock.calls[0][0]).toEqual({ isMain: true });
    expect(Object.keys(tenant.ciModel.create.mock.calls[0][0] as any)).toEqual(['marketplace', 'shipment', 'ecommerce', 'erp', 'einvoice']);
  });

  it('[ADR-0003 adım 3] mass-assignment KAPANDI: istemci verili isGlobalAdmin/roleCode/owner/lockUntil/extraField/order/clientId modele yazılmaz (eskiden şemadaki diğer tüm alanlar aynen yazılırdı)', async () => {
    await (await make(reg({ isGlobalAdmin: true, roleCode: 'ROLE_ADMIN', owner: false, lockUntil: 'x', extraField: 1, tokenVersion: 99, order: 1, clientId: 1, status: 'ACTIVE', dbConfig: { dbname: 'baska' } }))).register();
    const created: any = central.userModel.create.mock.calls[0][0];
    expect(created).toMatchObject({ isGlobalAdmin: false, roleCode: 'ROLE_OWNER', owner: true, order: 5, clientId: 5 });
    for (const k of ['extraField', 'lockUntil', 'tokenVersion', 'status', 'dbConfig']) expect(created[k]).toBeUndefined();
    expect((central.clientModel.create.mock.calls[0][0] as any).dbConfig.dbname).toBe('entegrasyonikClient_5');
  });

  it.each([
    ['geçersiz e-posta', { email: 'gecersiz' }, 'Geçerli bir e-posta'],
    ['parola < 8 karakter', { password: 'a', password2: 'a' }, 'en az 8'],
    ['parola != password2', { password2: 'FARKLI-pw-1' }, 'eşleşmiyor'],
    ['eksik ad', { name: '' }, 'Ad zorunludur'],
    ['eksik soyad', { surname: undefined }, 'Soyad zorunludur'],
    ['operatör nesnesi e-posta', { email: { $ne: null } }, 'E-posta zorunludur'],
  ] as Array<[string, any, string]>)('[ADR-0003 adım 3] doğrulama: %s -> 400 ve hiçbir kayıt oluşmaz (eskiden ek doğrulama YOKTU)', async (_l, extra, msg) => {
    await expect((await make(reg(extra))).register()).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining(msg) });
    expect(central.clientModel.create).not.toHaveBeenCalled();
    expect(central.userModel.create).not.toHaveBeenCalled();
  });

  it('[ADR-0003 adım 3] registerValues yoksa 400 fırlar ve YETİM tenant oluşmaz (eskiden TypeError + oluşmuş client belgesi)', async () => {
    await expect((await make({})).register()).rejects.toMatchObject({ statusCode: 400 });
    expect(central.clientModel.create).not.toHaveBeenCalled();
    expect(central.userModel.create).not.toHaveBeenCalled();
  });

  it('[ADR-0003 adım 5] yeni tenant kaydına YALNIZCA dbConfig { dbname, poolsize } yazılır; DB kimlik bilgisi (url/user/password) ve depolama (archive/image) anahtarları YAZILMAZ (eskiden kod içi sabitlerle yazılırdı)', async () => {
    await (await make(reg())).register();
    const cp: any = central.clientModel.create.mock.calls[0][0];
    expect(Object.keys(cp.dbConfig).sort()).toEqual(['dbname', 'poolsize']);
    expect(cp.dbConfig.dbname).toBe('entegrasyonikClient_5');
    expect(cp.dbConfig.poolsize).toBe(20);
    expect(cp.archive).toBeUndefined();
    expect(cp.image).toBeUndefined();
  });
});

describe('SecurityService.selectStore / diğer', () => {
  const principalGa = { sub: '507f1f77bcf86cd799439011', ga: true, tv: 5, imp: false, auth_time: AUTH_TIME, tid: undefined };
  const gaCtx = { _id: 'adm', isGlobalAdmin: true, roleCode: 'ROLE_ADMIN', email: 'x@y.z', resources: ['a'], password: 'must-not-leak' };

  it('[ADR-0001 adım 6] userContext/principal yoksa, isGlobalAdmin değilse veya principal.ga doğrulanmamışsa 403 "Bu işlem için Süper Yönetici yetkisi gereklidir."', async () => {
    const forbidden = { message: 'Bu işlem için Süper Yönetici yetkisi gereklidir.', statusCode: 403 };
    await expect((await make({ clientId: 2 })).selectStore()).rejects.toMatchObject(forbidden);
    await expect((await make({ clientId: 2, userContext: { isGlobalAdmin: false }, principal: { ga: false } })).selectStore()).rejects.toMatchObject(forbidden);
    // userContext ga diyor ama doğrulanmış principal'da yok (eskiden yalnızca userContext.isGlobalAdmin bakılırdı)
    await expect((await make({ clientId: 2, userContext: { isGlobalAdmin: true } })).selectStore()).rejects.toMatchObject(forbidden);
    await expect((await make({ clientId: 2, userContext: { isGlobalAdmin: true }, principal: { ga: false } })).selectStore()).rejects.toMatchObject(forbidden);
    expect(clientModel.findOne).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 6] süper yönetici: { sessionClaims, body } döner — token GÖVDEDE YOK; sessionClaims asgari (tid=Number(clientId), ga, imp=true, tv ve auth_time KORUNUR); gövde { store, user DTO }', async () => {
    clientModel.findOne = jest.fn(() => chain({ order: 12, clientId: 12, title: 'Mağaza 12', status: 'ACTIVE' }));
    const svc = await make({ clientId: '12', userContext: gaCtx, principal: principalGa });
    const r = await svc.selectStore();
    expect(clientModel.findOne.mock.calls[0][0]).toEqual({ order: 12 });
    expect(r.sessionClaims).toEqual({ sub: principalGa.sub, tid: 12, ga: true, imp: true, tv: 5, auth_time: AUTH_TIME, role: 'ROLE_ADMIN' });
    expect(r.body.store).toEqual({ clientId: 12, title: 'Mağaza 12' });
    expect(r.body.user).toMatchObject({ _id: 'adm', order: 12, clientId: 12, isGlobalAdmin: true, roleCode: 'ROLE_ADMIN' });
    expect('password' in r.body.user).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/eyJ/); // gövdede JWT yok
    expect(JSON.stringify(r.body)).not.toContain('must-not-leak');
  });

  it('[ADR-0001 adım 6] hedef tenant yoksa veya ACTIVE değilse 400 "Geçersiz mağaza."; oturum claim\'i üretilmez', async () => {
    for (const found of [null, { order: 9, status: 'PASSIVE' }, { order: 9, status: 'SUSPENDED' }, { order: 9 }]) {
      clientModel.findOne = jest.fn(() => chain(found));
      await expect((await make({ clientId: 9, userContext: gaCtx, principal: principalGa })).selectStore()).rejects.toMatchObject({ message: 'Geçersiz mağaza.', statusCode: 400 });
    }
  });

  it('[ADR-0001 adım 6] clientId tamsayıya çevrilemezse/<=0 ise 400 "Geçersiz mağaza." ve tenant sorgusu yapılmaz', async () => {
    for (const bad of ['abc', undefined, 0, -3, 1.5]) {
      await expect((await make({ clientId: bad, userContext: { isGlobalAdmin: true }, principal: principalGa })).selectStore()).rejects.toMatchObject({ message: 'Geçersiz mağaza.', statusCode: 400 });
    }
    expect(clientModel.findOne).not.toHaveBeenCalled();
  });

  it('[ADR-0028 WP-A5] getCaptcha operasyonu KALDIRILDI (sahte kod üretimi yok)', async () => {
    expect((await make({})).getCaptcha).toBeUndefined();
  });

  it('[MEVCUT DAVRANIŞ] logout true döner, get undefined döner', async () => {
    const svc = await make({});
    expect(await svc.logout()).toBe(true);
    expect(await svc.get()).toBeUndefined();
  });
});

describe('SecurityService.login: pasif hesap (ADR-0001 adım 4)', () => {
  it('[ADR-0001 adım 7] isActive=false kullanıcı parola doğru olsa bile giriş yapamaz (generik 401, eskiden "Hesap pasif."); sayaç değişmez', async () => {
    storedUser.isActive = false;
    await expect((await make({ username: 'a@b.c', password: 'correct-pw' })).login()).rejects.toMatchObject({ message: 'E-posta veya parola hatalı', statusCode: 401 });
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
});

describe('Uçtan uca (ApiManager + RunOperation + SecurityService + mock DB): login/register HTTP yanıtı', () => {
  function loadApp() {
    let app: ReturnType<typeof makeFakeApp>;
    jest.isolateModules(() => {
      jest.dontMock('../../../src/api/rpc/RunOperation');
      jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: { SecurityService } }));
      const { configureApis } = require('../../../src/api/rpc/ApiManager');
      app = makeFakeApp();
      configureApis(app, '/api');
    });
    return app!;
  }

  it('[ADR-0001 adım 7] login HTTP yanıtı: 200, gövde profil DTO\'su (parola özeti YOK); cookie token\'ında YOK ve tv sunucudaki tokenVersion; asgari claim (tid = Users.order)', async () => {
    storedUser.tokenVersion = 3;
    const app = loadApp();
    const res = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: { username: 'a@b.c', password: 'correct-pw' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ _id: 'u1', email: 'a@b.c', order: 3, roleCode: 'ROLE_OWNER', emailVerified: false, permissions: expect.any(Array) });
    expect(res.cookies).toHaveLength(1);
    const d: any = jwt.verify(res.cookies[0].value, process.env.JWT_SECRET as string, { algorithms: ['HS256'] });
    expect(d.password).toBeUndefined();
    expect(d).toMatchObject({ sub: 'u1', tid: 3, role: 'ROLE_OWNER', ga: false, tv: 3, imp: false, aud: 'web' });
    expect(d.exp - d.iat).toBe(8 * 3600);
    expect(Object.keys(d)).not.toContain('email');
  });

  it('[ADR-0001 adım 7] login (global admin) HTTP yanıtı: gövdede user DTO (parola özeti/"sensitive" maskesi değil, alan hiç yok); cookie tid\'siz', async () => {
    storedUser.isGlobalAdmin = true;
    const app = loadApp();
    const res = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: { username: 'a@b.c', password: 'correct-pw' } }), res);
    expect('password' in res.body.user).toBe(false);
    expect(res.body.requireStoreSelection).toBe(true);
    const d: any = jwt.decode(res.cookies[0].value);
    expect(d.ga).toBe(true);
    expect('tid' in d).toBe(false);
  });

  it('[ADR-0001 adım 7] hatalı parola: HTTP 401 generik mesaj; yanıt gövdesi isteği (parolayı) GERİ YANSITMAZ; çerez basılmaz', async () => {
    const app = loadApp();
    const res = makeRes();
    const body = { username: 'a@b.c', password: 'wrong-pw-dummy' };
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe(GENERIC);
    expect('request' in res.body).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('wrong-pw-dummy');
    expect(res.cookies).toHaveLength(0);
  });

  it('[ADR-0001 adım 7] kullanıcı yok ve yanlış parola: HTTP durumu ve gövde birebir AYNI (enumeration yok)', async () => {
    const app = loadApp();
    const wrong = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: { username: 'a@b.c', password: 'wrong' } }), wrong);
    userModel.findOne = jest.fn(async () => null);
    const nouser = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: { username: 'zz@b.c', password: 'wrong' } }), nouser);
    expect(nouser.statusCode).toBe(wrong.statusCode);
    expect(nouser.body).toEqual(wrong.body);
  });

  it('[ADR-0001 adım 7] operatör nesnesi ({ "$ne": null }) ile login: HTTP 400; veritabanına sorgu gitmez', async () => {
    const app = loadApp();
    const res = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: { username: { $ne: null }, password: { $ne: null } } }), res);
    expect(res.statusCode).toBe(400);
    expect(userModel.findOne).not.toHaveBeenCalled();
    expect(res.cookies).toHaveLength(0);
  });

  it('[ADR-0001 adım 7] register HTTP yanıtı: 200, gövde profil DTO\'su (parola özeti YOK); cookie token\'ında yok; tid yeni tenant\'tır', async () => {
    const central = makeCentralDb({ clients: [{ order: 4, clientId: 4, status: 'ACTIVE', dbConfig: { dbname: 'x4' } }] });
    Object.assign(appDb, central.appDb);
    Object.assign(clientDb, makeTenantDb().db);
    const app = loadApp();
    const res = makeRes();
    await app.routes['POST /api/SecurityService/register'](makeReq({ cookies: {}, body: { registerValues: { name: 'Ad', surname: 'Soyad', email: 'n@x.y', password: 'plain-pw' } } }), res);
    expect(res.statusCode).toBe(200);
    expect('password' in res.body).toBe(false);
    expect(res.body._id).toBe('u1');
    const d: any = jwt.decode(res.cookies[0].value);
    expect(d.password).toBeUndefined();
    expect(d).toMatchObject({ tid: 5, role: 'ROLE_OWNER', ga: false });
  });

  it('[ADR-0001 adım 6] selectStore dedicated rotadan: principal\'sız 401; ga olmayan principal politika katmanında 403; ga principal ile 200, YENİ ÇEREZ (imp:true, tid, tv/auth_time korunur) ve gövdede token YOK', async () => {
    // eskiden: token'sız 500 Süper Yönetici hatası, sahte isGlobalAdmin token'ı ile 200 + imzalı token gövdesi (çerez yazılmıyordu)
    clientModel.findOne = jest.fn(() => chain({ order: 8, clientId: 8, title: 'M8', status: 'ACTIVE' }));
    const app = loadApp();
    const r0 = makeRes();
    await app.routes['POST /api/SecurityService/selectStore'](makeReq({ cookies: {}, body: { clientId: 8 } }), r0);
    expect(r0.statusCode).toBe(401);

    const r1 = makeRes({ userContext: { _id: 'u', isGlobalAdmin: false, order: 1 }, principal: { sub: 'u', ga: false, tv: 0, tid: 1, auth_time: 1 } });
    await app.routes['POST /api/SecurityService/selectStore'](makeReq({ cookies: {}, body: { clientId: 8, userContext: { isGlobalAdmin: true }, principal: { ga: true } } }), r1);
    // [ADR-0001 adım 5] selectStore = platformAdmin: ga olmayan (owner bile olsa) principal serviste değil politika katmanında 403 alır
    expect(r1.statusCode).toBe(403);
    expect(r1.body.error).toBe('Forbidden');
    expect(r1.cookies).toHaveLength(0);

    const principal = { sub: 'adm', ga: true, tv: 2, imp: false, auth_time: AUTH_TIME };
    const r2 = makeRes({ userContext: { _id: 'adm', isGlobalAdmin: true, roleCode: 'ROLE_ADMIN' }, principal });
    await app.routes['POST /api/SecurityService/selectStore'](makeReq({ cookies: {}, body: { clientId: 8 } }), r2);
    expect(r2.statusCode).toBe(200);
    expect(r2.body).toEqual({ store: { clientId: 8, title: 'M8' }, user: { _id: 'adm', isGlobalAdmin: true, roleCode: 'ROLE_ADMIN', order: 8, clientId: 8, emailVerified: false, permissions: expect.any(Array) } });
    expect(typeof r2.body).not.toBe('string');
    expect(r2.cookies).toHaveLength(1);
    expect(r2.cookies[0].name).toBe('JWT_TOKEN');
    expect(r2.cookies[0].options.httpOnly).toBe(true);
    expect(jwt.verify(r2.cookies[0].value, process.env.JWT_SECRET as string) as any).toMatchObject({ sub: 'adm', tid: 8, ga: true, imp: true, tv: 2, auth_time: AUTH_TIME, role: 'ROLE_ADMIN', aud: 'web' });
  });

  it('[ADR-0001 adım 6] hedef tenant ACTIVE değilse selectStore 400 ve çerez YAZILMAZ', async () => {
    clientModel.findOne = jest.fn(() => chain({ order: 8, status: 'PASSIVE' }));
    const app = loadApp();
    const res = makeRes({ userContext: { _id: 'adm', isGlobalAdmin: true }, principal: { sub: 'adm', ga: true, tv: 2, imp: false, auth_time: AUTH_TIME } });
    await app.routes['POST /api/SecurityService/selectStore'](makeReq({ cookies: {}, body: { clientId: 8 } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.cookies).toHaveLength(0);
  });
});

describe('Audit log (ADR-0001 Karar 11): login/selectStore olayları (best-effort, PII yok)', () => {
  const records: any[] = [];
  beforeEach(() => {
    records.length = 0;
    AuditLogger.setSink(async (r) => { records.push(r); });
  });
  afterEach(() => { AuditLogger.setSink(undefined); });
  // (isolateModules kopyası her loadApp'te yeniden kurulur)
  const flush = () => new Promise(r => setImmediate(r));

  function loadApp(sink: (r: any) => Promise<void> = async (r: any) => { records.push(r); }) {
    let app: ReturnType<typeof makeFakeApp>;
    jest.isolateModules(() => {
      jest.dontMock('../../../src/api/rpc/RunOperation');
      jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: { SecurityService } }));
      const { configureApis } = require('../../../src/api/rpc/ApiManager');
      // isolateModules ApiManager'a AYRI bir AuditLogger örneği verir; ikisine de aynı sink bağlanır
      require('../../../src/services/audit/AuditLogger').AuditLogger.setSink(sink);
      app = makeFakeApp();
      configureApis(app, '/api');
    });
    return app!;
  }
  const req = (body: any) => ({ ...makeReq({ cookies: {}, body }), socket: { remoteAddress: '203.0.113.9' } });

  it('login başarılı: event=login result=ok sub/tid/ip; e-posta/parola/token YOK', async () => {
    const app = loadApp();
    await app.routes['POST /api/SecurityService/login'](req({ username: 'a@b.c', password: 'correct-pw' }), makeRes());
    await flush();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ event: 'login', result: 'ok', sub: 'u1', tid: 3, ip: '203.0.113.9' });
    const text = JSON.stringify(records[0]);
    expect(text).not.toContain('a@b.c');
    expect(text).not.toContain('correct-pw');
    expect(text).not.toContain('$2');
  });

  it('login başarısız: yalnızca ip + result=fail; hesap bulundu/bulunamadı (sub) AYRIMI kayıtta YOK — iki durumda kayıt aynı şekilde', async () => {
    const app = loadApp();
    await app.routes['POST /api/SecurityService/login'](req({ username: 'a@b.c', password: 'wrong' }), makeRes());
    userModel.findOne = jest.fn(async () => null);
    await app.routes['POST /api/SecurityService/login'](req({ username: 'nobody@b.c', password: 'wrong' }), makeRes());
    await flush();
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r).toMatchObject({ event: 'login', result: 'fail', ip: '203.0.113.9' });
      expect(r.sub).toBeUndefined();
      expect(r.tid).toBeUndefined();
      expect(r.meta).toBeUndefined();
      expect(JSON.stringify(r)).not.toMatch(/a@b\.c|nobody|wrong/);
    }
  });

  it('selectStore başarılı ve başarısız: event=selectStore (ok: sub + tid; fail: sub + geçerliyse hedef tid)', async () => {
    clientModel.findOne = jest.fn(() => chain({ order: 8, clientId: 8, title: 'M8', status: 'ACTIVE' }));
    const app = loadApp();
    const principal = { sub: 'adm', ga: true, tv: 2, imp: false, auth_time: AUTH_TIME };
    const ok = makeRes({ userContext: { _id: 'adm', isGlobalAdmin: true }, principal });
    await app.routes['POST /api/SecurityService/selectStore'](req({ clientId: 8 }), ok);
    clientModel.findOne = jest.fn(() => chain(null));
    const bad = makeRes({ userContext: { _id: 'adm', isGlobalAdmin: true }, principal });
    await app.routes['POST /api/SecurityService/selectStore'](req({ clientId: 99 }), bad);
    await flush();
    expect(records.map(r => [r.event, r.result, r.sub, r.tid])).toEqual([['selectStore', 'ok', 'adm', 8], ['selectStore', 'fail', 'adm', 99]]);
    expect(records[0].ip).toBe('203.0.113.9');
  });

  it('audit yazımı HATA verse bile istek düşmez (best-effort); hata loglanır', async () => {
    const app = loadApp(async () => { throw new Error('db down'); });
    const res = makeRes();
    await app.routes['POST /api/SecurityService/login'](req({ username: 'a@b.c', password: 'correct-pw' }), res);
    await flush();
    expect(res.statusCode).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });
});

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { makeFakeApp, makeReq, makeRes, signedToken, forgedToken } from './_helpers';

// ADR-0001 adım 3-4 sonrası: ApiManager kimliği YALNIZCA authenticate middleware'inin doldurduğu res.locals.userContext/principal'dan alır;
// cookie'yi/token'ı kendisi okumaz (jwt.decode kalktı). Middleware'in kendisi authenticate.test.ts'te sınanır.
const PRINCIPAL = { sub: 'u1', tid: 3, ga: false, tv: 0, imp: false, auth_time: 1, iat: 1, exp: 2, iss: 'i', aud: 'web' };
const UC = { _id: 'u1', order: 3, roleCode: 'ROLE_OWNER' };
/** authenticate middleware'inden geçmiş (kimliği doğrulanmış) istek için res.locals. */
const authed = (over: any = {}) => makeRes({ userContext: UC, principal: PRINCIPAL, ...over });
const authenticateRequestMock = async (..._a: any[]) => ({ principal: PRINCIPAL, userContext: UC });

// Characterization: backend/src/api/rpc/ApiManager.ts (rota davranışı)
// Express yerine handler'ları yakalayan sahte app kullanılır; RunOperation mock'lanır veya sahte servis kaydıyla gerçek kullanılır.
// Test verilerindeki parola/token değerleri sahte, yalnızca test amaçlıdır.

const CTX = '/api';

function loadWithMockedRun(runImpl: (...a: any[]) => any) {
  const runMock = jest.fn(runImpl as any);
  let app: ReturnType<typeof makeFakeApp>;
  jest.isolateModules(() => {
    jest.doMock('../../../src/api/rpc/RunOperation', () => ({ __esModule: true, default: runMock }));
    jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
    jest.doMock('../../../src/api/http/authenticate', () => ({ ...(jest.requireActual('../../../src/api/http/authenticate') as any), authenticateRequest: authenticateRequestMock }));
    const { configureApis } = require('../../../src/api/rpc/ApiManager');
    app = makeFakeApp();
    configureApis(app, CTX);
  });
  return { app: app!, runMock: runMock as jest.Mock<any> };
}

function loadWithRealRun(apis: any) {
  let app: ReturnType<typeof makeFakeApp>;
  jest.dontMock('../../../src/api/rpc/RunOperation'); // önceki doMock kaydı temizlenir
  jest.isolateModules(() => {
    jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
    jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: apis }));
    // [ADR-0001 adım 5] sahte servis için politika kaydı (gerçek kayıt operation-policy.test.ts'te sınanır)
    Object.assign(require('../../../src/api/rpc/operationPolicy').OPERATION_POLICY, { Svc: { ok: 'member', ghost: 'member', ownerOnly: 'owner' } });
    const { configureApis } = require('../../../src/api/rpc/ApiManager');
    app = makeFakeApp();
    configureApis(app, CTX);
  });
  return app!;
}

beforeEach(() => {
  jest.restoreAllMocks();
  // [ADR-0017 2026-09-28] sendError artık 5xx'te console.error yazar (geçici; logger göçünde platform/core/logger'a taşınır) -- test çıktısını kirletmesin.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('ApiManager: rota tablosu', () => {
  it('[MEVCUT DAVRANIŞ] rotalar bu sırayla kaydedilir; jenerik /:service/:operation ve /:service EN SONA konur', () => {
    const { app } = loadWithMockedRun(async () => ({}));
    expect(Object.keys(app.routes)).toEqual([
      // Hesap yaşam döngüsü (docs/API_ACCOUNT_LIFECYCLE.md): jenerik rotadan ÖNCE kaydedilen özel rotalar (kendi rate limit kovaları / çerez yenileme)
      'POST /api/AccountService/requestPasswordReset',
      'POST /api/AccountService/confirmPasswordReset',
      'POST /api/AccountService/verifyEmail',
      'POST /api/AccountService/getInvitation', // [ADR-0028 WP-A4] davet: kimliksiz, accountTokenLimiter
      'POST /api/AccountService/acceptInvitation',
      'POST /api/AccountService/changePassword',
      'POST /api/SecurityService/register',
      'POST /api/SecurityService/login',
      'POST /api/SecurityService/googleSignIn', // Google ile giriş/kayıt: loginLimiter'li özel rota (çerez basar)
      'GET /api/SecurityService/authConfig', // kimliksiz önyüz yapılandırması ({ googleClientId | null })
      'POST /api/SecurityService/redeemImpersonation', // [ADR-0026 Karar 4.9] impersonation bileti tuketimi (kimliksiz, hiz sinirli)
      'POST /api/SecurityService/endImpersonation',
      'POST /api/SecurityService/logout',
      'POST /api/SecurityService/selectStore', // [ADR-0001 adım 6] dedicated rota: yeni oturum Set-Cookie ile yazılır
      'GET /api/userContext',
      'GET /api/checkAuthentication',
      // [ADR-0017 Karar 1.8] istemci hata raporlama: AUTH'LU, jenerik rotadan ÖNCE (özel gövde şekli/boyut/redaksiyon)
      'POST /api/client-log',
      'POST /api/:service/:operation',
      'GET /api/:service',
    ]);
  });
});

describe('ApiManager: jenerik POST /:service/:operation', () => {
  it('[ADR-0001 adım 3] principal YOKSA (middleware kimlik atamamışsa) servise ULAŞILMAZ: 401 (fail-closed); eskiden token\'sız çağrı doğrudan servise giderdi', async () => {
    const { app, runMock } = loadWithMockedRun(async () => ({ ok: 1 }));
    const res = makeRes();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: { x: 1 }, params: { service: 'AdminService', operation: 'getClients' } }), res);
    expect(runMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('[ADR-0001 adım 3] handler cookie\'deki token\'ı KENDİSİ okumaz: sahte imzalı/imzasız token + boş res.locals -> 401 (eskiden payload\'daki order/isGlobalAdmin userContext olurdu)', async () => {
    const { app, runMock } = loadWithMockedRun(async () => 'r');
    for (const t of [forgedToken({ tid: 123, ga: true }), 'garbage']) {
      const res = makeRes();
      await app.routes['POST /api/:service/:operation'](
        makeReq({ cookies: { JWT_TOKEN: t }, body: {}, params: { service: 'ProductService', operation: 'get' } }), res);
      expect(res.statusCode).toBe(401);
    }
    expect(runMock).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 4] doğrulanmış kimlik: runOperation(userContext, service, operation, body, principal) çağrılır (res.locals\'tan); 200 döner', async () => {
    const { app, runMock } = loadWithMockedRun(async () => ({ ok: 1 }));
    const res = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: { x: 1 }, params: { service: 'ProductService', operation: 'get' } }), res);
    expect(runMock).toHaveBeenCalledWith(UC, 'ProductService', 'get', { x: 1 }, PRINCIPAL, { ip: 'unknown' }); // 6. argüman: sunucu tarafı requestMeta (ip)
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: 1 });
  });

  it('[ADR-0001 adım 3] açık operasyon SecurityService/logout token/principal OLMADAN çalışır (userContext undefined)', async () => {
    const { app, runMock } = loadWithMockedRun(async () => ({ ok: 1 }));
    const res = makeRes();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: {}, params: { service: 'SecurityService', operation: 'logout' } }), res);
    expect(runMock).toHaveBeenCalledWith(undefined, 'SecurityService', 'logout', {}, undefined, { ip: 'unknown' });
    expect(res.statusCode).toBe(200);
  });

  it('[ADR-0001 adım 3] açık listede olmayan SecurityService operasyonları (selectStore, get) principal\'sız 401', async () => {
    const { app, runMock } = loadWithMockedRun(async () => 'r');
    for (const operation of ['selectStore', 'get']) {
      const res = makeRes();
      await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: {}, params: { service: 'SecurityService', operation } }), res);
      expect([operation, res.statusCode]).toEqual([operation, 401]);
    }
    expect(runMock).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] cookie yenilenmez: bu rota Set-Cookie basmaz (sliding yenileme middleware\'de)', async () => {
    const { app } = loadWithMockedRun(async () => 'r');
    const res = authed();
    await app.routes['POST /api/:service/:operation'](
      makeReq({ cookies: { JWT_TOKEN: signedToken() }, body: {}, params: { service: 'S', operation: 'o' } }), res);
    expect(res.cookies).toHaveLength(0);
  });

  it('[ADR-0017 2026-09-28] hata: 500 + { error, code, service, operation } — istek gövdesi yanıtta YANSITILMAZ; ham hata iletisi ("boom") İSTEMCİYE SIZMAZ (ESKİ davranış: error:"boom" döndürürdü, GN-07/MM-09)', async () => {
    const { app } = loadWithMockedRun(async () => { throw new Error('boom'); });
    const res = authed();
    const body = { username: 'a@b.c', password: 'dummy-plain-pw', nested: { k: 1 } };
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body, params: { service: 'X', operation: 'y' } }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Beklenmeyen bir hata oluştu.', code: 'INTERNAL', service: 'X', operation: 'y' });
    expect('request' in res.body).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('boom');
    expect(JSON.stringify(res.body)).not.toContain('dummy-plain-pw');
  });

  it('[MEVCUT DAVRANIŞ] hatada e.statusCode varsa o durum kodu kullanılır', async () => {
    const { app } = loadWithMockedRun(async () => { throw Object.assign(new Error('nope'), { statusCode: 403 }); });
    const res = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: {}, params: { service: 'X', operation: 'y' } }), res);
    expect(res.statusCode).toBe(403);
  });
});

describe('ApiManager: bilinmeyen servis / operasyon (gerçek RunOperation, sahte servis kaydı)', () => {
  class Svc { constructor(public c: any, public r: any) {} async init() {} async ok() { return { fine: true }; } }

  it('[ADR-0001 adım 5] bilinmeyen servis: HTTP 403 (eskiden HTTP 200 + { error: "entegrayonik api tanımlı değil", _status: 400 } gövdesi)', async () => {
    const app = loadWithRealRun({ Svc });
    const res = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: {}, params: { service: 'Nope', operation: 'ok' } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('[ADR-0001 adım 5] bilinmeyen servis GET /:service için de 403 (eskiden 200 + _status 400 gövdesi)', async () => {
    const app = loadWithRealRun({ Svc });
    const res = authed();
    await app.routes['GET /api/:service'](makeReq({ cookies: {}, params: { service: 'Nope' } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('[ADR-0001 adım 5][ADR-0017 2026-09-28] kayıtta olmayan operasyon: 403 + error "Forbidden" (eskiden 500 "Operation not implemented"); kayıtlı ama sınıfta olmayan (ölü kayıt): 500 + MASKELİ ileti (ham "Operation not implemented" artık İSTEMCİYE SIZMAZ, code:INTERNAL)', async () => {
    const app = loadWithRealRun({ Svc });
    const res = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: { q: 1 }, params: { service: 'Svc', operation: 'missing' } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden', service: 'Svc', operation: 'missing' }); // [ADR-0001 adım 7] gövde yansıması yok
    const ghost = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: { q: 1 }, params: { service: 'Svc', operation: 'ghost' } }), ghost);
    expect(ghost.statusCode).toBe(500);
    expect(ghost.body).toEqual({ error: 'Beklenmeyen bir hata oluştu.', code: 'INTERNAL', service: 'Svc', operation: 'ghost' });
  });

  it('[ADR-0001 adım 5] kademe yetmezse 403: UC = ROLE_OWNER (admin kademesi, owner:true değil) owner-kademeli operasyona giremez', async () => {
    const app = loadWithRealRun({ Svc });
    const res = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: {}, params: { service: 'Svc', operation: 'ownerOnly' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('[ADR-0001 adım 3] bilinen servis+operasyon token\'sız (principal\'sız) artık 401; kimlikli çalışır: 200', async () => {
    // eskiden: token'sız çalışırdı (200). BACKLOG C1
    const app = loadWithRealRun({ Svc });
    const anon = makeRes();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: {}, params: { service: 'Svc', operation: 'ok' } }), anon);
    expect(anon.statusCode).toBe(401);
    const res = authed();
    await app.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: {}, params: { service: 'Svc', operation: 'ok' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ fine: true });
  });
});

describe('ApiManager: GET /:service', () => {
  it('[ADR-0001 adım 3] principal yoksa 401 (eskiden userContext undefined ile servise giderdi)', async () => {
    const { app, runMock } = loadWithMockedRun(async () => [1, 2]);
    const res = makeRes();
    await app.routes['GET /api/:service'](makeReq({ cookies: {}, params: { service: 'BrandService' } }), res);
    expect(res.statusCode).toBe(401);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] operasyon "get", istek gövdesi {} olarak sabittir (kimlikli istek: userContext ve principal res.locals\'tan)', async () => {
    const { app, runMock } = loadWithMockedRun(async () => [1, 2]);
    const res = authed();
    await app.routes['GET /api/:service'](makeReq({ cookies: {}, params: { service: 'BrandService' } }), res);
    expect(runMock).toHaveBeenCalledWith(UC, 'BrandService', 'get', {}, PRINCIPAL, { ip: 'unknown' });
    expect(res.body).toEqual([1, 2]);
  });

  it('[ADR-0001 adım 7][ADR-0017 2026-09-28] hata yanıtında operation HER ZAMAN undefined (rota parametresi yok); istek gövdesi YANSITILMAZ; ham ileti ("x") MASKELENİR', async () => {
    const { app } = loadWithMockedRun(async () => { throw new Error('x'); });
    const res = authed();
    await app.routes['GET /api/:service'](makeReq({ cookies: {}, params: { service: 'S' }, body: undefined }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Beklenmeyen bir hata oluştu.', code: 'INTERNAL', service: 'S', operation: undefined });
    expect('request' in res.body).toBe(false);
  });
});

describe('ApiManager: GET /userContext ve /checkAuthentication', () => {
  it('[ADR-0001 adım 7] kimlik yoksa userContext 401 "Token is undefined"; gövde YANSITILMAZ, service/operation undefined', async () => {
    const { app } = loadWithMockedRun(async () => ({}));
    const res = makeRes();
    await app.routes['GET /api/userContext'](makeReq({ cookies: {}, body: { a: 1 } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Token is undefined', service: undefined, operation: undefined });
    expect('request' in res.body).toBe(false);
  });

  it('[ADR-0001 adım 3] userContext cookie\'ye bakmaz (sahte imzalı token dahil): yalnızca middleware\'in kurduğu res.locals.userContext döner', async () => {
    const { app } = loadWithMockedRun(async () => ({}));
    const res = makeRes();
    await app.routes['GET /api/userContext'](makeReq({ cookies: { JWT_TOKEN: forgedToken() } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('[ADR-0001 adım 7] kimlikli userContext: sunucuda kurulan PROFİL DTO\'su döner (FE alanları korunur; parola özeti/tokenVersion/kilit alanları/__v ve bilinmeyen alanlar YOK); eskiden token payload\'ı, sonra tüm userContext dönerdi', async () => {
    const { app } = loadWithMockedRun(async () => ({}));
    const full = { ...UC, email: 'a@b.c', name: 'Ad', surname: 'Soyad', username: 'ad', owner: true, resources: ['r1'], isGlobalAdmin: false, clientId: 3,
      password: 'HASH-PLACEHOLDER', tokenVersion: 2, failedLoginAttempts: 1, lockUntil: new Date(), __v: 0, internalNote: 'x' };
    const res = authed({ userContext: full });
    await app.routes['GET /api/userContext'](makeReq({ cookies: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ _id: 'u1', email: 'a@b.c', name: 'Ad', surname: 'Soyad', username: 'ad', owner: true, resources: ['r1'], roleCode: 'ROLE_OWNER', isGlobalAdmin: false, order: 3, clientId: 3, emailVerified: false, permissions: expect.any(Array) }); // [ADR-0028 WP-A1] yeni eklemeli alan
    for (const k of ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil', '__v', 'internalNote']) expect(k in res.body).toBe(false);
    expect(res.cookies).toHaveLength(0); // sliding yenileme artık middleware'de
  });

  it('[ADR-0001 adım 3] checkAuthentication (açık rota) authenticateRequest ile kendi doğrulamasını yapar: geçerliyse 200 + true', async () => {
    const { app } = loadWithMockedRun(async () => ({}));
    const res = makeRes();
    await app.routes['GET /api/checkAuthentication'](makeReq({ cookies: { JWT_TOKEN: signedToken() } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ] checkAuthentication doğrulama hatası: ApplicationError.statusCode (401) kullanılır', async () => {
    let app: ReturnType<typeof makeFakeApp>;
    jest.isolateModules(() => {
      jest.doMock('../../../src/api/rpc/RunOperation', () => ({ __esModule: true, default: jest.fn() }));
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
      jest.doMock('../../../src/api/http/authenticate', () => ({
        ...(jest.requireActual('../../../src/api/http/authenticate') as any),
        authenticateRequest: async () => { const { ApplicationError } = require('../../../src/platform/core/security/Security'); throw new ApplicationError('Token not verified', 401); },
      }));
      const { configureApis } = require('../../../src/api/rpc/ApiManager');
      app = makeFakeApp();
      configureApis(app, CTX);
    });
    const res = makeRes();
    await app!.routes['GET /api/checkAuthentication'](makeReq({ cookies: { JWT_TOKEN: forgedToken() } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Token not verified');
  });
});

describe('ApiManager: logout', () => {
  it('[ADR-0001 adım 3] logout AÇIK rota: principal yoksa (süresi dolmuş/iptal çerez) da 200 + true, Signout cookie\'si basılır (kullanıcı çıkış yapabilsin)', async () => {
    const { app, runMock } = loadWithMockedRun(async () => true);
    const res = makeRes();
    await app.routes['POST /api/SecurityService/logout'](makeReq({ cookies: {}, body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(true);
    expect(runMock).toHaveBeenCalledWith(undefined, 'SecurityService', 'logout', {}, undefined);
    expect(res.cookies[0]).toMatchObject({ name: 'JWT_TOKEN', value: 'Signout' });
    expect(res.cookies[0].options.maxAge).toBe(0);
  });

  it('[MEVCUT DAVRANIŞ] kimlikli logout: 200 + true; cookie "Signout"/maxAge 0 basılır; SecurityService.logout doğrulanmış userContext/principal ile çağrılır', async () => {
    const { app, runMock } = loadWithMockedRun(async () => true);
    const res = authed();
    await app.routes['POST /api/SecurityService/logout'](makeReq({ cookies: {}, body: {} }), res);
    expect(runMock).toHaveBeenCalledWith(UC, 'SecurityService', 'logout', {}, PRINCIPAL);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(true);
    expect(res.cookies[0]).toMatchObject({ name: 'JWT_TOKEN', value: 'Signout' });
    expect(res.cookies[0].options.maxAge).toBe(0);
  });

  it('[MEVCUT DAVRANIŞ] servis hatası olursa cookie silinmez; durum kodu artık e.statusCode\'a uyar (eskiden HER ZAMAN 500)', async () => {
    const { app } = loadWithMockedRun(async () => { throw Object.assign(new Error('l'), { statusCode: 401 }); });
    const res = authed();
    await app.routes['POST /api/SecurityService/logout'](makeReq({ cookies: {}, body: { z: 1 } }), res);
    expect(res.statusCode).toBe(401);
    expect(res.cookies).toHaveLength(0);
    expect('request' in res.body).toBe(false); // [ADR-0001 adım 7]
  });
});

// [ADR-0001 adım 6/7] login/register/selectStore servis sonucu { sessionClaims, body } zarfıdır (bkz. sessionResult.ts):
// HTTP gövdesine YALNIZCA body (profil DTO) gider; sessionClaims yalnızca Set-Cookie ile imzalanır.
describe('ApiManager: login / register yanıtları', () => {
  it('[ADR-0001 adım 7] login başarı: cookie sessionClaims\'ten basılır; HTTP gövdesi yalnızca body\'dir (zarf/claim gövdeye sızmaz)', async () => {
    const result = { sessionClaims: { sub: 'u1', tid: 2, role: 'ROLE_OWNER', ga: false, tv: 7, imp: false }, body: { _id: 'u1', email: 'a@b.c', order: 2 } };
    const { app } = loadWithMockedRun(async () => result);
    const res = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: { username: 'a@b.c', password: 'x' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(result.body);
    expect(JSON.stringify(res.body)).not.toContain('sessionClaims');
    const d: any = jwt.decode(res.cookies[0].value);
    expect(d).toMatchObject({ sub: 'u1', tid: 2, tv: 7, aud: 'web' });
    expect(d.password).toBeUndefined();
  });

  it('[ADR-0001 adım 7] login global admin: cookie tid\'siz (mağaza seçimi sonradan); gövde { requireStoreSelection, clients, user } olduğu gibi', async () => {
    const result = { sessionClaims: { sub: 'adm', ga: true, tv: 0, imp: false }, body: { requireStoreSelection: true, clients: [{ clientId: 1 }], user: { _id: 'adm', isGlobalAdmin: true } } };
    const { app } = loadWithMockedRun(async () => result);
    const res = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(result.body);
    expect(res.cookies).toHaveLength(1);
    const d: any = jwt.decode(res.cookies[0].value);
    expect(d.ga).toBe(true);
    expect('tid' in d).toBe(false);
  });

  it('[MEVCUT DAVRANIŞ] captcha gerekli yanıtı ({ requireCaptcha }) cookie basmaz, 200 döner', async () => {
    const { app } = loadWithMockedRun(async () => ({ requireCaptcha: true, message: 'm' }));
    const res = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.cookies).toHaveLength(0);
    expect(res.body.requireCaptcha).toBe(true);
  });

  it('[ADR-0001 adım 7] login servisi undefined dönerse çerez basılmaz, 200 + boş gövde (eskiden undefined.user TypeError -> 500)', async () => {
    const { app } = loadWithMockedRun(async () => undefined);
    const res = makeRes();
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.cookies).toHaveLength(0);
  });

  it('[ADR-0001 adım 7] login hatası: durum kodu e.statusCode\'dan (401; eskiden HER ZAMAN 500); gövde istekteki parolayı YANSITMAZ', async () => {
    const { app } = loadWithMockedRun(async () => { throw Object.assign(new Error('E-posta veya parola hatalı'), { statusCode: 401 }); });
    const res = makeRes();
    const body = { username: 'a@b.c', password: 'dummy-plain-pw' };
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'E-posta veya parola hatalı', service: undefined, operation: undefined });
  });

  it('[ADR-0001 adım 4] login/register runOperation\'a HİÇBİR ZAMAN userContext/principal geçirmez (açık rota; res.locals dolu olsa bile undefined); yalnızca sunucu tarafı requestMeta (ip) geçer', async () => {
    const { app, runMock } = loadWithMockedRun(async () => ({ requireCaptcha: true }));
    await app.routes['POST /api/SecurityService/login'](makeReq({ cookies: {}, body: { u: 1 } }), makeRes({ userContext: { order: 8 } }));
    expect(runMock).toHaveBeenCalledWith(undefined, 'SecurityService', 'login', { u: 1 }, undefined, { ip: 'unknown' });
    await app.routes['POST /api/SecurityService/register'](makeReq({ cookies: {}, body: { r: 1 } }), makeRes());
    expect(runMock).toHaveBeenLastCalledWith(undefined, 'SecurityService', 'register', { r: 1 }, undefined, { ip: 'unknown' });
  });

  it('[ADR-0001 adım 7] register başarı: cookie sessionClaims\'ten; yanıt YALNIZCA profil DTO gövdesi (parola özeti yok)', async () => {
    const result = { sessionClaims: { sub: 'n1', tid: 9, role: 'ROLE_OWNER', ga: false, tv: 0, imp: false }, body: { _id: 'n1', email: 'n@b.c', order: 9, roleCode: 'ROLE_OWNER' } };
    const { app } = loadWithMockedRun(async () => result);
    const res = makeRes();
    await app.routes['POST /api/SecurityService/register'](makeReq({ cookies: {}, body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe(result.body);
    expect('password' in res.body).toBe(false);
    expect(res.cookies).toHaveLength(1);
    expect((jwt.decode(res.cookies[0].value) as any)).toMatchObject({ sub: 'n1', tid: 9, role: 'ROLE_OWNER', ga: false });
  });

  it('[MEVCUT DAVRANIŞ] register zarfsız sonuç dönerse cookie basılmaz ama 200 ile aynen gönderilir', async () => {
    const { app } = loadWithMockedRun(async () => undefined);
    const res = makeRes();
    await app.routes['POST /api/SecurityService/register'](makeReq({ cookies: {}, body: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res.cookies).toHaveLength(0);
  });

  it('[ADR-0001 adım 7] register hatası: 500 ve gövde YANSITILMAZ (kayıt formu parolası dahil)', async () => {
    const { app } = loadWithMockedRun(async () => { throw new Error('dup'); });
    const res = makeRes();
    const body = { registerValues: { email: 'n@b.c', password: 'dummy-plain-pw', password2: 'dummy-plain-pw' } };
    await app.routes['POST /api/SecurityService/register'](makeReq({ cookies: {}, body }), res);
    expect(res.statusCode).toBe(500);
    expect('request' in res.body).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('dummy-plain-pw');
  });

  it('[ADR-0017 2026-09-28] istek bağlamında (AsyncLocalStorage) aktif requestId varsa hata gövdesine EKLENİR (RPC sözleşmesi: error string kalır, requestId yeni alan)', async () => {
    // Not: `loadWithMockedRun` gibi `jest.isolateModules` kullanır -- ApiManager'ın gördüğü `@platform/core/context`
    // kopyası, bu test dosyasının üst-seviye import'undan (bu dosyanın çalıştığı ana registry) FARKLI bir modül
    // örneğidir. Bu yüzden `withTestContext`/`ApiManager` AYNI izole registry'den alınır.
    const runMock = jest.fn(async () => { throw new Error('boom'); });
    let app: ReturnType<typeof makeFakeApp>;
    let withTestContextIsolated: typeof import('@platform/core/context').withTestContext;
    jest.isolateModules(() => {
      jest.doMock('../../../src/api/rpc/RunOperation', () => ({ __esModule: true, default: runMock }));
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
      jest.doMock('../../../src/api/http/authenticate', () => ({ ...(jest.requireActual('../../../src/api/http/authenticate') as any), authenticateRequest: authenticateRequestMock }));
      withTestContextIsolated = require('@platform/core/context').withTestContext;
      const { configureApis } = require('../../../src/api/rpc/ApiManager');
      app = makeFakeApp();
      configureApis(app, CTX);
    });
    const res = authed();
    await withTestContextIsolated!({ requestId: 'req-corr-abc123' }, async () => {
      await app!.routes['POST /api/:service/:operation'](makeReq({ cookies: {}, body: {}, params: { service: 'X', operation: 'y' } }), res);
    });
    expect(res.body).toMatchObject({ requestId: 'req-corr-abc123', code: 'INTERNAL' });
  });
});

describe('ApiManager: POST /client-log [ADR-0017 Karar 1.8]', () => {
  function loadClientLogRoute() {
    const recordErrorEvent = jest.fn();
    let app: ReturnType<typeof makeFakeApp>;
    jest.isolateModules(() => {
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
      jest.doMock('@platform/runtime/metrics', () => ({ recordErrorEvent }));
      const { configureApis } = require('../../../src/api/rpc/ApiManager');
      app = makeFakeApp();
      configureApis(app, CTX);
    });
    return { app: app!, recordErrorEvent };
  }

  it('principal YOKSA 401 döner (AUTH\'LU uç -- kimliksiz sayfalar raporlamaz, Karar 1.8)', async () => {
    const { app, recordErrorEvent } = loadClientLogRoute();
    const res = makeRes();
    await app.routes['POST /api/client-log'](makeReq({ body: { level: 'error', msg: 'x' } }), res);
    expect(res.statusCode).toBe(401);
    expect(recordErrorEvent).not.toHaveBeenCalled();
  });

  it('principal VARSA 204 döner ve recordErrorEvent çağrılır', async () => {
    const { app, recordErrorEvent } = loadClientLogRoute();
    const res = authed();
    await app.routes['POST /api/client-log'](makeReq({ body: { level: 'error', msg: 'istemci hatası' } }), res);
    expect(res.statusCode).toBe(204);
    expect(recordErrorEvent).toHaveBeenCalledWith(expect.objectContaining({ source: 'client', tenantId: 3 }));
  });
});

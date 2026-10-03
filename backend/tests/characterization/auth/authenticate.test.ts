import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

// ADR-0001 adım 3-4: tek authenticate middleware'i (backend/src/api/http/authenticate.ts).
// DB katmanı jest ile mock'lanır (DB/Redis/ağ YOK). Tüm sırlar test-only'dir (tests/setup/jwt-env.js).

const appDb: any = {};
const getApplicationDB = jest.fn(async () => appDb);
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: () => getApplicationDB(),
    getClientDB: async () => ({}),
    // ADR-0024 P1-CORE: tenant durumu TenantRegistry (DatabaseManagerInstance.getTenant) üzerinden okunur; burada sahte Clients okumasına yönlenir
    getTenant: async (order: number) => {
      const c: any = await appDb.getClientModel().findOne({ order }, 'status').lean();
      return c ? { order, _id: 'client-oid', status: c.status, dbname: 'entegrasyonikClient_' + order } : undefined;
    },
  },
}));

import { createAuthenticateMiddleware, isOpenRoute, OPEN_ROUTES, authenticateRequest } from '../../../src/api/http/authenticate';
import {
  makeReq, makeRes, signedToken, forgedToken, unsignedToken, tokenSignedWith, legacyStyleToken, nowSec, TEST_USER_ID,
} from './_helpers';

const CTX = '/api';
let userDoc: any;
let clientDoc: any;
let findById: jest.Mock<any>;
let clientFindOne: jest.Mock<any>;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  getApplicationDB.mockReset();
  getApplicationDB.mockImplementation(async () => appDb);
  userDoc = {
    _id: TEST_USER_ID, email: 'u@test.local', name: 'Ad', surname: 'Soyad',
    password: 'HASH-PLACEHOLDER', isGlobalAdmin: false, owner: true, roleCode: 'ROLE_OWNER',
    order: 3, clientId: 'client-oid', resources: ['product', 'order'],
    failedLoginAttempts: 2, lockUntil: undefined, tokenVersion: 0,
  };
  clientDoc = { status: 'ACTIVE' };
  findById = jest.fn(() => ({ lean: async () => userDoc }));
  clientFindOne = jest.fn(() => ({ lean: async () => clientDoc }));
  appDb.getUserModel = () => ({ findById });
  appDb.getClientModel = () => ({ findOne: clientFindOne });
});

async function call(method: string, path: string, cookies: any = {}, locals: any = {}) {
  const mw = createAuthenticateMiddleware(CTX);
  const req = makeReq({ method, path, cookies });
  const res = makeRes(locals);
  const next = jest.fn();
  await mw(req, res, next);
  return { res, next };
}
const withToken = (token: string) => ({ JWT_TOKEN: token });

describe('authenticate: açık rota listesi (ADR-0001 Karar 1)', () => {
  it('[ADR-0001 adım 3] açık liste tam olarak: login, register, logout (POST) ve checkAuthentication + public-config (GET)', () => {
    expect(OPEN_ROUTES.map(([m, p]) => m + ' ' + p).sort()).toEqual([
      'GET checkAuthentication',
      'GET SecurityService/authConfig', // Google ile giriş: kimliksiz önyüz yapılandırması ({ googleClientId | null })
      'GET public-config', // [ADR-0031 BE-CFG-3] kimliksiz kamu açılış yapılandırması (sır içermez; yalnız exposure:'public' + 2 env alanı)
      // Hesap yaşam döngüsü: giriş yapamayan kullanıcının akışları (rate limit ApiManager'daki özel rotalarda)
      'POST AccountService/confirmPasswordReset', 'POST AccountService/requestPasswordReset', 'POST AccountService/verifyEmail',
      'POST AccountService/getInvitation', 'POST AccountService/acceptInvitation', // [ADR-0028 WP-A4]
      'POST SecurityService/redeemImpersonation', // [ADR-0026 Karar 4.9] impersonation bileti = kimlik
      'POST SecurityService/googleSignIn', // Google ile giriş: kimlik = Google ID token (özel rota + loginLimiter)
      'POST SecurityService/login', 'POST SecurityService/logout', 'POST SecurityService/register',
    ].sort());
  });

  it('[ADR-0001 adım 3] açık rotalar token OLMADAN çalışır: next() çağrılır, DB\'ye dokunulmaz, userContext/principal atanmaz', async () => {
    for (const [m, p] of [
      ['POST', '/api/SecurityService/login'], ['POST', '/api/SecurityService/register'],
      ['POST', '/api/SecurityService/logout'], ['GET', '/api/checkAuthentication'],
    ]) {
      const { res, next } = await call(m, p);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBeUndefined();
      expect(res.locals.userContext).toBeUndefined();
      expect(res.locals.principal).toBeUndefined();
    }
    expect(getApplicationDB).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 3] eşleşme Express gibi büyük/küçük harf ve sondaki "/" duyarsızdır; yanlış yöntem/fazladan segment açık DEĞİLDİR', async () => {
    expect((await call('POST', '/api/securityservice/LOGIN/')).next).toHaveBeenCalledTimes(1);
    expect(isOpenRoute('GET', 'SecurityService/login')).toBe(false);
    expect(isOpenRoute('POST', 'checkAuthentication')).toBe(false);
    expect(isOpenRoute('POST', 'SecurityService/login/x')).toBe(false);
    expect(isOpenRoute('POST', 'SecurityService/logout')).toBe(true); // açık: süresi dolmuş çerezle de çıkış yapılabilsin
    expect(isOpenRoute('GET', 'SecurityService/logout')).toBe(false);
    expect(isOpenRoute('POST', 'SecurityService/selectStore')).toBe(false);
  });

  it('[ADR-0001 adım 3] açık rotada önceden dolu res.locals.userContext/principal sıfırlanır (istekten sızamaz)', async () => {
    const { res } = await call('POST', '/api/SecurityService/login', {}, { userContext: { order: 1 }, principal: { ga: true } });
    expect(res.locals.userContext).toBeUndefined();
    expect(res.locals.principal).toBeUndefined();
  });
});

describe('authenticate: token yok / geçersiz -> 401 (varsayılan ret)', () => {
  const protectedRoutes: Array<[string, string]> = [
    ['POST', '/api/AdminService/getClients'], ['POST', '/api/ProductService/getProducts'], ['GET', '/api/ProductService'],
    ['GET', '/api/userContext'], ['POST', '/api/SecurityService/selectStore'],
    ['POST', '/api/upload'], ['POST', '/api/getImages'], ['GET', '/api/getImage/abc'], ['GET', '/api/downloadImage/abc'],
    ['POST', '/api/uploadIdentity'], ['POST', '/api/deleteImage'], ['POST', '/api/sortImages'], ['POST', '/api/deleteImageSelected'],
    ['GET', '/api/SecurityService/login'], ['POST', '/no-api-prefix/anything'],
  ];

  it('[ADR-0001 adım 3] açık listede olmayan HER rota token\'sız 401 döner ve next() çağrılmaz (eskiden servise ulaşırdı, örn. AdminService/getClients)', async () => {
    for (const [m, p] of protectedRoutes) {
      const { res, next } = await call(m, p);
      expect([m, p, res.statusCode]).toEqual([m, p, 401]);
      expect(next).not.toHaveBeenCalled();
    }
    expect(getApplicationDB).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 3] 401 gövdesi yalnızca { error } içerir; istek gövdesi/parametreleri yansıtılmaz', async () => {
    const { res } = await call('POST', '/api/AdminService/getClients');
    expect(res.body).toEqual({ error: 'Token is undefined', code: 'UNAUTHENTICATED' });
  });

  it('[ADR-0001 adım 2/3] imzasız (alg=none), yanlış sırla imzalı, süresi geçmiş, yanlış aud/iss, exp\'siz, "Signout" ve bozuk token\'lar 401; DB sorgulanmaz', async () => {
    const bad: Record<string, string> = {
      none: unsignedToken(),
      forged: forgedToken(),
      expired: signedToken({ iat: nowSec() - 9 * 3600, exp: nowSec() - 60 }),
      badAud: signedToken({ aud: 'mcp' }),
      badIss: signedToken({ iss: 'x' }),
      noExp: signedToken({ exp: undefined }),
      signout: 'Signout',
      garbage: 'garbage',
      hs512: tokenSignedWith(process.env.JWT_SECRET as string, {}, 'HS512'),
    };
    for (const [name, t] of Object.entries(bad)) {
      const { res, next } = await call('POST', '/api/ProductService/getProducts', withToken(t));
      expect([name, res.statusCode]).toEqual([name, 401]);
      expect(next).not.toHaveBeenCalled();
    }
    expect(getApplicationDB).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 2] eski sistemin token\'ı (kullanıcı belgesi yükü, süresiz, başka sırla imzalı) 401', async () => {
    const legacy = legacyStyleToken({ _id: TEST_USER_ID, order: 3, isGlobalAdmin: true, roleCode: 'ROLE_OWNER', resources: ['x'] });
    const { res, next } = await call('GET', '/api/userContext', withToken(legacy));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authenticate: geçerli token -> principal + sunucuda kurulan userContext (ADR-0001 adım 4)', () => {
  it('[ADR-0001 adım 4] next() çağrılır; principal doğrulanmış claim\'lerdir; userContext eski token yükü şeklindedir ama parola özeti/tokenVersion/kilit alanları YOKTUR', async () => {
    const { res, next } = await call('POST', '/api/ProductService/getProducts', withToken(signedToken()));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.principal).toMatchObject({ sub: TEST_USER_ID, tid: 3, ga: false, tv: 0, aud: 'web' });
    const uc = res.locals.userContext;
    expect(uc).toMatchObject({
      _id: TEST_USER_ID, email: 'u@test.local', name: 'Ad', surname: 'Soyad', isGlobalAdmin: false, owner: true,
      roleCode: 'ROLE_OWNER', order: 3, clientId: 'client-oid', resources: ['product', 'order'],
    });
    for (const f of ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil']) expect(f in uc).toBe(false);
    expect(findById).toHaveBeenCalledWith(TEST_USER_ID);
  });

  it('[ADR-0001 adım 4] userContext.order YALNIZCA doğrulanmış tid\'dir (kullanıcı belgesinden değil)', async () => {
    // Belge ile tid çelişirse zaten 401 (aşağıdaki test); burada tid kaynağı: token -> order
    userDoc.order = 3;
    const { res } = await call('GET', '/api/ProductService', withToken(signedToken({ tid: 3 })));
    expect(res.locals.userContext.order).toBe(3);
  });

  it('[ADR-0001 adım 4] tenant kullanıcısı için tid, Users.order ile eşleşmezse 401 (başka tenant\'ın tid\'iyle imzalı geçerli token bile kullanılamaz)', async () => {
    const { res, next } = await call('GET', '/api/ProductService', withToken(signedToken({ tid: 4 })));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(clientFindOne).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 4] tenant kullanıcısı için tid claim\'i yoksa 401', async () => {
    const { res } = await call('GET', '/api/ProductService', withToken(signedToken({ tid: undefined })));
    expect(res.statusCode).toBe(401);
  });

  it('[ADR-0001 adım 4] süper yönetici mağaza seçmeden (tid yok): 200/next; userContext\'te order ve clientId YOK (belgede olsa bile)', async () => {
    userDoc = { ...userDoc, isGlobalAdmin: true, order: 9, clientId: 'x' };
    const { res, next } = await call('POST', '/api/AdminService/getClients', withToken(signedToken({ ga: true, tid: undefined })));
    expect(next).toHaveBeenCalledTimes(1);
    expect('order' in res.locals.userContext).toBe(false);
    expect('clientId' in res.locals.userContext).toBe(false);
    expect(clientFindOne).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 4] süper yönetici mağaza seçmiş (tid + imp): order = clientId = tid (sayı); tenant ACTIVE sorgulanır', async () => {
    userDoc = { ...userDoc, isGlobalAdmin: true, order: undefined };
    const { res, next } = await call('POST', '/api/ProductService/getProducts', withToken(signedToken({ ga: true, tid: 12, imp: true })));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.locals.userContext).toMatchObject({ order: 12, clientId: 12, isGlobalAdmin: true });
    expect(res.locals.principal.imp).toBe(true);
    expect(clientFindOne).toHaveBeenCalledWith({ order: 12 }, 'status');
  });
});

describe('authenticate: iptal, hesap durumu, tenant durumu (ADR-0001 Karar 4-5)', () => {
  const run401 = async (token = signedToken()) => call('POST', '/api/ProductService/getProducts', withToken(token));

  it('[ADR-0001 adım 4] tokenVersion uyuşmazlığı (token tv != Users.tokenVersion) -> 401', async () => {
    userDoc.tokenVersion = 1;
    const { res, next } = await run401(signedToken({ tv: 0 }));
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 4] tokenVersion alanı olmayan eski kullanıcı 0 sayılır; tv=0 token geçer, tv=1 token 401', async () => {
    delete userDoc.tokenVersion;
    expect((await run401(signedToken({ tv: 0 }))).next).toHaveBeenCalledTimes(1);
    expect((await run401(signedToken({ tv: 1 }))).res.statusCode).toBe(401);
  });

  it('[ADR-0001 adım 4] kullanıcı silinmişse (Users\'ta yok) 401', async () => {
    findById = jest.fn(() => ({ lean: async () => null }));
    expect((await run401()).res.statusCode).toBe(401);
  });

  it('[ADR-0001 adım 4] pasif kullanıcı (isActive=false) -> 401; alanı olmayan/true olan aktif sayılır', async () => {
    userDoc.isActive = false;
    const r = await run401();
    expect(r.res.statusCode).toBe(401);
    expect(r.next).not.toHaveBeenCalled();
    userDoc.isActive = true;
    expect((await run401()).next).toHaveBeenCalledTimes(1);
  });

  it('[ADR-0001 adım 4] kilitli kullanıcı (lockUntil gelecekte) -> 401; süresi geçmiş kilit engel değil', async () => {
    userDoc.lockUntil = new Date(Date.now() + 60000);
    expect((await run401()).res.statusCode).toBe(401);
    userDoc.lockUntil = new Date(Date.now() - 1000);
    expect((await run401()).next).toHaveBeenCalledTimes(1);
  });

  it('[ADR-0001 adım 4] ga claim\'i Users.isGlobalAdmin ile çelişirse 401 (iki yönde)', async () => {
    expect((await run401(signedToken({ ga: true, tid: undefined }))).res.statusCode).toBe(401); // token ga, belge değil
    userDoc.isGlobalAdmin = true;
    expect((await run401(signedToken({ ga: false }))).res.statusCode).toBe(401); // belge ga, token değil
  });

  it('[ADR-0001 adım 4] Clients.status != ACTIVE -> 403 (askıya alınmış tenant); next çağrılmaz', async () => {
    clientDoc = { status: 'SUSPENDED' };
    const r = await run401();
    expect(r.res.statusCode).toBe(403);
    expect(r.res.body).toEqual({ error: 'Tenant is not active', code: 'FORBIDDEN' });
    expect(r.next).not.toHaveBeenCalled();
    expect(clientFindOne).toHaveBeenCalledWith({ order: 3 }, 'status');
  });

  it('[ADR-0003 adım 8] Clients.status = DELETION_PENDING (yumuşak silme askısı) -> 403 (aynı ACTIVE kontrolü giriş engeller; ekstra kod DEĞİŞİKLİĞİ gerekmez)', async () => {
    clientDoc = { status: 'DELETION_PENDING' };
    const r = await run401();
    expect(r.res.statusCode).toBe(403);
    expect(r.res.body).toEqual({ error: 'Tenant is not active', code: 'FORBIDDEN' });
    expect(r.next).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 4] Clients kaydı yoksa 401', async () => {
    clientDoc = null;
    expect((await run401()).res.statusCode).toBe(401);
  });

  it('[ADR-0001 adım 4] DB hatası fail-open OLMAZ: 500 genel mesaj, next çağrılmaz, hata ayrıntısı sızmaz', async () => {
    getApplicationDB.mockImplementation(async () => { throw new Error('mongo bağlantı ayrıntısı'); });
    const r = await run401();
    expect(r.res.statusCode).toBe(500);
    expect(r.res.body).toEqual({ error: 'Authentication unavailable', code: 'INTERNAL' });
    expect(r.next).not.toHaveBeenCalled();
  });

  it('[ADR-0001 adım 4] sub geçersiz ObjectId (CastError) -> 401', async () => {
    findById = jest.fn(() => ({ lean: async () => { throw Object.assign(new Error('cast'), { name: 'CastError' }); } }));
    expect((await run401()).res.statusCode).toBe(401);
  });
});

describe('authenticate: sliding yenileme (ADR-0001 Karar 4)', () => {
  const cookiesOf = async (token: string) => (await call('GET', '/api/ProductService', withToken(token))).res;

  it('[ADR-0001 adım 4] kalan >= 4 saat: Set-Cookie basılmaz', async () => {
    const res = await cookiesOf(signedToken());
    expect(res.cookies).toHaveLength(0);
  });

  it('[ADR-0001 adım 4] kalan < 4 saat ve auth_time <= 7 gün: yeni token (aynı auth_time/tv/tid, taze exp, DB\'den güncel rol) çereze yazılır', async () => {
    const authTime = nowSec() - 2 * 86400;
    userDoc.roleCode = 'ROLE_ADMIN';
    const res = await cookiesOf(signedToken({ auth_time: authTime, iat: nowSec() - 6 * 3600, exp: nowSec() + 2 * 3600 }));
    expect(res.cookies).toHaveLength(1);
    expect(res.cookies[0].name).toBe('JWT_TOKEN');
    expect(res.cookies[0].options).toMatchObject({ httpOnly: true, maxAge: 28800000, path: '/' });
    const d: any = jwt.verify(res.cookies[0].value, process.env.JWT_SECRET as string);
    expect(d).toMatchObject({ sub: TEST_USER_ID, tid: 3, tv: 0, ga: false, auth_time: authTime, role: 'ROLE_ADMIN', aud: 'web' });
    expect(d.exp - nowSec()).toBeGreaterThan(7 * 3600);
  });

  it('[ADR-0001 adım 4] auth_time 7 günden eski: istek yine kabul edilir (token geçerli) ama YENİLENMEZ; token kendi exp\'inde biter', async () => {
    const { res, next } = await call('GET', '/api/ProductService', withToken(signedToken({ auth_time: nowSec() - 8 * 86400, iat: nowSec() - 6 * 3600, exp: nowSec() + 2 * 3600 })));
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.cookies).toHaveLength(0);
  });

  it('[ADR-0001 adım 4] checkAuthentication (açık rota) kendi içinde doğrular: geçerli -> ok + sliding; geçersiz -> 401 ApplicationError', async () => {
    const res = makeRes();
    await authenticateRequest(makeReq({ cookies: withToken(signedToken({ iat: nowSec() - 6 * 3600, exp: nowSec() + 3600 })) }), res);
    expect(res.cookies).toHaveLength(1);
    await expect(authenticateRequest(makeReq({ cookies: withToken(forgedToken()) }), makeRes())).rejects.toMatchObject({ statusCode: 401 });
    await expect(authenticateRequest(makeReq({ cookies: {} }), makeRes())).rejects.toMatchObject({ statusCode: 401 });
  });
});

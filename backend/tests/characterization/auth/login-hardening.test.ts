import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createRateLimiter, rateLimitOptionsFromEnv, registerRateLimitOptionsFromEnv } from '../../../src/platform/rateLimit/rateLimit';
import { getClientIp, getTrustedProxyHops } from '../../../src/platform/rateLimit/clientIp';
import { toProfileDto } from '../../../src/api/rpc/dto/profileDto';
import { makeFakeApp, makeReq, makeRes } from './_helpers';

// [ADR-0001 adım 7] login/register rate limit (süreç-içi, IP bazlı sliding window), istemci IP güveni, profil DTO,
// görsel rotalarında hata yanıtı hijyeni. DB/Redis/ağ YOK.

const envKeys = ['LOGIN_RATE_LIMIT_MAX', 'LOGIN_RATE_LIMIT_WINDOW_MS', 'TRUSTED_PROXY_HOPS'];
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = {}; envKeys.forEach(k => { saved[k] = process.env[k]; delete process.env[k]; }); });
afterEach(() => { envKeys.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); jest.restoreAllMocks(); });

function rq(ip: string, headers: any = {}): any {
  return { headers, socket: { remoteAddress: ip }, method: 'POST' };
}
function call(mw: any, r: any) {
  const next = jest.fn();
  const res: any = { statusCode: undefined, body: undefined, headers: {} };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.send = (b: any) => { res.body = b; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  mw(r, res, next);
  return { next, res };
}

describe('rate limit: kayan pencere', () => {
  it('pencere içinde max istek geçer, sonraki 429 + Retry-After; farklı IP etkilenmez', () => {
    let t = 1_000_000;
    const mw = createRateLimiter({ max: 3, windowMs: 60_000, now: () => t });
    for (let i = 0; i < 3; i++) expect(call(mw, rq('1.1.1.1')).next).toHaveBeenCalledTimes(1);
    const blocked = call(mw, rq('1.1.1.1'));
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.body).toEqual({ error: 'Too many requests' });
    expect(Number(blocked.res.headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    expect(call(mw, rq('2.2.2.2')).next).toHaveBeenCalledTimes(1);
    mw.stop();
  });

  it('pencere sonrası serbest kalır (kayan pencere: en eski istek düşünce yer açılır)', () => {
    let t = 1_000_000;
    const mw = createRateLimiter({ max: 2, windowMs: 60_000, now: () => t });
    call(mw, rq('1.1.1.1')); t += 30_000;
    call(mw, rq('1.1.1.1'));
    expect(call(mw, rq('1.1.1.1')).res.statusCode).toBe(429);
    t += 30_001; // ilk istek pencereden çıktı
    expect(call(mw, rq('1.1.1.1')).next).toHaveBeenCalledTimes(1);
    expect(call(mw, rq('1.1.1.1')).res.statusCode).toBe(429); // ikinci hâlâ pencerede
    t += 60_001; // hepsi düştü
    expect(call(mw, rq('1.1.1.1')).next).toHaveBeenCalledTimes(1);
    mw.stop();
  });

  it('engellenen istekler pencereyi uzatmaz (saldırgan kendini sonsuza dek kilitlemez, meşru kullanıcı beklemeyle serbest kalır)', () => {
    let t = 0;
    const mw = createRateLimiter({ max: 1, windowMs: 1000, now: () => t });
    call(mw, rq('1.1.1.1'));
    for (let i = 0; i < 50; i++) { t += 10; expect(call(mw, rq('1.1.1.1')).res.statusCode).toBe(429); }
    t = 1001;
    expect(call(mw, rq('1.1.1.1')).next).toHaveBeenCalledTimes(1);
    mw.stop();
  });

  it('bellek üst sınırı: maxKeys aşılınca eski anahtarlar atılır, harita sınırsız büyümez', () => {
    let t = 0;
    const mw = createRateLimiter({ max: 5, windowMs: 60_000, now: () => t, maxKeys: 10 });
    for (let i = 0; i < 100; i++) call(mw, rq('10.0.0.' + i));
    expect(mw.size()).toBeLessThanOrEqual(10);
    mw.stop();
  });

  it('varsayılan limit 10 istek/dk/IP; env ile ayarlanabilir; geçersiz env varsayılana döner', () => {
    expect(rateLimitOptionsFromEnv()).toEqual({ max: 10, windowMs: 60_000 });
    process.env.LOGIN_RATE_LIMIT_MAX = '3';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '5000';
    expect(rateLimitOptionsFromEnv()).toEqual({ max: 3, windowMs: 5000 });
    process.env.LOGIN_RATE_LIMIT_MAX = 'abc';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '-1';
    expect(rateLimitOptionsFromEnv()).toEqual({ max: 10, windowMs: 60_000 });
  });

  it('temizlik zamanlayıcısı unref\'lidir (süreç kapanışını engellemez)', () => {
    const spy = jest.spyOn(global, 'setInterval');
    const mw = createRateLimiter({ max: 1, windowMs: 60_000 });
    const timer: any = spy.mock.results[0].value;
    expect(typeof timer.hasRef).toBe('function');
    expect(timer.hasRef()).toBe(false);
    mw.stop();
  });
});

describe('istemci IP: X-Forwarded-For güveni YAPILANDIRILABİLİR, varsayılan güvenme', () => {
  it('varsayılan: X-Forwarded-For YOK SAYILIR (sahte başlıkla limit atlatılamaz), soket adresi kullanılır', () => {
    expect(getTrustedProxyHops()).toBe(0);
    expect(getClientIp(rq('9.9.9.9', { 'x-forwarded-for': '1.2.3.4' }))).toBe('9.9.9.9');
  });

  it('TRUSTED_PROXY_HOPS=1: sağdan 1. adres (güvenilir vekilin eklediği); istemcinin soldan yazdığı sahte adresler yok sayılır', () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    expect(getClientIp(rq('10.0.0.1', { 'x-forwarded-for': 'spoofed, 198.51.100.7' }))).toBe('198.51.100.7');
  });

  it('TRUSTED_PROXY_HOPS=2: sağdan 2. adres', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    expect(getClientIp(rq('10.0.0.1', { 'x-forwarded-for': 'spoofed, 198.51.100.7, 10.0.0.9' }))).toBe('198.51.100.7');
  });

  it('başlık yok/yetersiz ise soket adresine döner; geçersiz hops değeri = güvenme', () => {
    process.env.TRUSTED_PROXY_HOPS = '3';
    expect(getClientIp(rq('10.0.0.1', { 'x-forwarded-for': '1.1.1.1' }))).toBe('10.0.0.1');
    expect(getClientIp(rq('10.0.0.1'))).toBe('10.0.0.1');
    process.env.TRUSTED_PROXY_HOPS = 'x';
    expect(getClientIp(rq('10.0.0.1', { 'x-forwarded-for': '1.1.1.1' }))).toBe('10.0.0.1');
  });

  it('soket adresi de yoksa "unknown"', () => {
    expect(getClientIp({ headers: {} } as any)).toBe('unknown');
  });
});

describe('ApiManager: login ve register rotaları rate limit altındadır (aşımda 429, servis çağrılmaz)', () => {
  function load(runImpl: (...a: any[]) => any) {
    const runMock = jest.fn(runImpl as any);
    let app: ReturnType<typeof makeFakeApp>;
    jest.isolateModules(() => {
      jest.doMock('../../../src/api/rpc/RunOperation', () => ({ __esModule: true, default: runMock }));
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
      const { configureApis } = require('../../../src/api/rpc/ApiManager');
      // makeFakeApp yalnızca SON handler'ı tutar; rate limit middleware'ini de görebilmek için tüm zinciri kaydeden sahte app
      const chains: Record<string, any[]> = {};
      const fake: any = {
        chains,
        get: (p: string, ...h: any[]) => { chains['GET ' + p] = h; },
        post: (p: string, ...h: any[]) => { chains['POST ' + p] = h; },
      };
      configureApis(fake, '/api');
      app = fake;
    });
    return { app: app! as any, runMock };
  }

  async function hit(chain: any[], ip: string, body: any = { username: 'a@b.c', password: 'x' }) {
    const req: any = { ...makeReq({ cookies: {}, body }), socket: { remoteAddress: ip } };
    const res: any = makeRes();
    res.setHeader = () => undefined;
    let proceeded = false;
    await new Promise<void>((resolve) => {
      chain[0](req, res, () => { proceeded = true; resolve(); });
      if (res.statusCode !== undefined) resolve();
    });
    if (proceeded) await chain[chain.length - 1](req, res);
    return res;
  }

  it('login: varsayılan 10 istek/dk/IP; 11. istek 429 ve runOperation ÇAĞRILMAZ; başka IP serbest', async () => {
    const { app, runMock } = load(async () => { throw Object.assign(new Error('E-posta veya parola hatalı'), { statusCode: 401 }); });
    const chain = app.chains['POST /api/SecurityService/login'];
    expect(chain.length).toBe(2); // [rateLimit, handler]
    for (let i = 0; i < 10; i++) expect((await hit(chain, '7.7.7.7')).statusCode).toBe(401);
    const blocked = await hit(chain, '7.7.7.7');
    expect(blocked.statusCode).toBe(429);
    expect(runMock).toHaveBeenCalledTimes(10);
    expect((await hit(chain, '8.8.8.8')).statusCode).toBe(401);
  });

  it('[ADR-0003 adım 3] register: IP başına 3 kayıt/saat (eskiden login ile aynı 10/dk); 4. istek 429 ve servis ÇAĞRILMAZ; login\'den AYRI kova (girişi engellemez)', async () => {
    const { app, runMock } = load(async () => { throw new Error('x'); });
    const reg = app.chains['POST /api/SecurityService/register'];
    const login = app.chains['POST /api/SecurityService/login'];
    expect(reg.length).toBe(2);
    for (let i = 0; i < 3; i++) expect((await hit(reg, '7.7.7.7')).statusCode).not.toBe(429);
    expect((await hit(reg, '7.7.7.7')).statusCode).toBe(429);
    expect(runMock).toHaveBeenCalledTimes(3);
    expect((await hit(login, '7.7.7.7')).statusCode).not.toBe(429);
    expect((await hit(reg, '9.9.9.9')).statusCode).not.toBe(429); // başka IP serbest
  });

  it('[ADR-0003 adım 3] register limiti env ile ayarlanır (REGISTER_RATE_LIMIT_MAX=1)', async () => {
    process.env.REGISTER_RATE_LIMIT_MAX = '1';
    try {
      const { app } = load(async () => { throw new Error('x'); });
      const reg = app.chains['POST /api/SecurityService/register'];
      expect((await hit(reg, '5.5.5.5')).statusCode).not.toBe(429);
      expect((await hit(reg, '5.5.5.5')).statusCode).toBe(429);
    } finally { delete process.env.REGISTER_RATE_LIMIT_MAX; }
  });

  it('[ADR-0003 adım 3] registerRateLimitOptionsFromEnv: varsayılan 3 kayıt / 3600000 ms; env ile ezilir; geçersiz değer varsayılana düşer', () => {
    delete process.env.REGISTER_RATE_LIMIT_MAX; delete process.env.REGISTER_RATE_LIMIT_WINDOW_MS;
    expect(registerRateLimitOptionsFromEnv()).toEqual({ max: 3, windowMs: 3_600_000 });
    process.env.REGISTER_RATE_LIMIT_MAX = '5'; process.env.REGISTER_RATE_LIMIT_WINDOW_MS = '60000';
    expect(registerRateLimitOptionsFromEnv()).toEqual({ max: 5, windowMs: 60_000 });
    process.env.REGISTER_RATE_LIMIT_MAX = '-1'; process.env.REGISTER_RATE_LIMIT_WINDOW_MS = 'abc';
    expect(registerRateLimitOptionsFromEnv()).toEqual({ max: 3, windowMs: 3_600_000 });
    delete process.env.REGISTER_RATE_LIMIT_MAX; delete process.env.REGISTER_RATE_LIMIT_WINDOW_MS;
  });

  it('limit env ile ayarlanır (LOGIN_RATE_LIMIT_MAX=2)', async () => {
    process.env.LOGIN_RATE_LIMIT_MAX = '2';
    const { app } = load(async () => ({ requireCaptcha: true }));
    const chain = app.chains['POST /api/SecurityService/login'];
    expect((await hit(chain, '6.6.6.6')).statusCode).toBe(200);
    expect((await hit(chain, '6.6.6.6')).statusCode).toBe(200);
    expect((await hit(chain, '6.6.6.6')).statusCode).toBe(429);
  });

  it('logout, selectStore, userContext rotaları rate limit zincirinde DEĞİL', () => {
    const { app } = load(async () => ({}));
    expect(app.chains['POST /api/SecurityService/logout'].length).toBe(1);
    expect(app.chains['POST /api/SecurityService/selectStore'].length).toBe(1);
    expect(app.chains['GET /api/userContext'].length).toBe(1);
  });
});

describe('profil DTO', () => {
  const full = {
    _id: 'u1', email: 'a@b.c', name: 'Ad', surname: 'Soyad', username: 'ad', owner: true, resources: ['r1', 'r2'], roleCode: 'ROLE_OWNER',
    isGlobalAdmin: false, order: 3, clientId: 3,
    password: 'HASH-PLACEHOLDER', tokenVersion: 5, failedLoginAttempts: 2, lockUntil: new Date(), __v: 1, isActive: true, extra: 'x',
  };

  it('FE\'nin kullandığı alanlar (_id, email, name, surname, username, owner, resources, roleCode, isGlobalAdmin, order, clientId) KORUNUR', () => {
    const d = toProfileDto(full);
    // [ADR-0028 WP-A1] `permissions` yeni EKLEMELİ alan (etkili izin listesi); eski alanlar aynen.
    const { permissions, ...legacy } = d;
    expect(legacy).toEqual({ _id: 'u1', email: 'a@b.c', name: 'Ad', surname: 'Soyad', username: 'ad', owner: true, resources: ['r1', 'r2'], roleCode: 'ROLE_OWNER', isGlobalAdmin: false, order: 3, clientId: 3, emailVerified: false });
    expect(permissions).toContain('tenant:delete');
  });

  it('password, tokenVersion, failedLoginAttempts, lockUntil, __v ve bilinmeyen alanlar DÖNMEZ', () => {
    const d = toProfileDto(full);
    for (const k of ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil', '__v', 'isActive', 'extra']) expect(k in d).toBe(false);
    expect(JSON.stringify(d)).not.toContain('HASH-PLACEHOLDER');
  });

  it('Mongoose belgesi (toObject) kabul eder; girdiyi DEĞİŞTİRMEZ; resources kopyalanır; undefined alanlar eklenmez', () => {
    const doc = { toObject: () => ({ ...full }) };
    const d = toProfileDto(doc);
    expect(d._id).toBe('u1');
    const src: any = { _id: 'x', resources: ['a'], password: 'p' };
    const out = toProfileDto(src);
    expect(src.password).toBe('p');
    out.resources.push('b');
    expect(src.resources).toEqual(['a']);
    expect('email' in out).toBe(false);
  });

  it('null/undefined girdi olduğu gibi döner', () => {
    expect(toProfileDto(undefined)).toBeUndefined();
    expect(toProfileDto(null)).toBeNull();
  });
});

describe('ImageApiManager: hata yanıtları istek gövdesini geri yansıtmaz', () => {
  function load(runImpl: (...a: any[]) => any) {
    const chains: Record<string, any[]> = {};
    jest.isolateModules(() => {
      jest.doMock('../../../src/api/rpc/RunOperation', () => ({ runImageApi: jest.fn(runImpl as any), default: jest.fn() }));
      jest.doMock('multer', () => ({ __esModule: true, default: Object.assign(() => ({ any: () => (_r: any, _s: any, cb: any) => cb(undefined) }), { memoryStorage: () => ({}) }) }));
      const { configureImageServices } = require('../../../src/api/files/ImageApiManager');
      const fake: any = {
        get: (p: string, ...h: any[]) => { chains['GET ' + p] = h; },
        post: (p: string, ...h: any[]) => { chains['POST ' + p] = h; },
      };
      configureImageServices(fake, '/api', 'products/');
    });
    return chains;
  }

  it('getImages/deleteImage/sortImages/deleteImageSelected hata verince gövde ({ password, ... }) yanıtta YOK', async () => {
    const chains = load(async () => { throw Object.assign(new Error('boom'), { statusCode: 400 }); });
    for (const route of ['getImages', 'deleteImage', 'sortImages', 'deleteImageSelected']) {
      const chain = chains['POST /api/' + route];
      const handler = chain[chain.length - 1];
      const res: any = makeRes({ userContext: { order: 1 }, principal: { sub: 'u' } });
      await handler({ body: { secret: 'dummy-secret-value', password: 'dummy-pw' }, params: {} }, res);
      expect([route, res.statusCode]).toEqual([route, 400]);
      expect(res.body.error).toBe('boom');
      expect('request' in res.body).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/dummy-secret-value|dummy-pw/);
    }
  });

  it('getImage/downloadImage hata verince de gövde yansımaz', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const chains = load(async () => { throw new Error('nf'); });
    for (const route of ['getImage/:imageId', 'downloadImage/:imageId']) {
      const chain = chains['GET /api/' + route];
      const res: any = makeRes({ userContext: { order: 1 }, principal: { sub: 'u' } });
      await chain[chain.length - 1]({ body: { password: 'dummy-pw' }, params: { imageId: 'i' } }, res);
      expect(res.statusCode).toBe(500);
      expect('request' in res.body).toBe(false);
    }
  });
});

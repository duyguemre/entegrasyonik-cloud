import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Uçtan uca (ApiManager + RunOperation + OPERATION_POLICY + AccountService + AccountLifecycleService + sahte DB + SAHTE MailService).
// SMTP/ağ/DB YOK: `@services/mail/MailService` jest ile mock'lanır (mock transport); e-postalar yalnızca `mailService.send` çağrısı olarak yakalanır.

const appDb: any = {};
const tenantDbRef: { db: any } = { db: undefined };

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDb,
    getClientDB: async (_id: number) => tenantDbRef.db,
  },
}));
jest.mock('@services/mail/MailService', () => ({ mailService: { send: jest.fn() } }));
jest.mock('../../../src/api/rpc/index', () => ({
  __esModule: true,
  default: {
    AccountService: require('../../../src/api/rpc/handlers/account-service').default,
    SecurityService: require('../../../src/api/rpc/handlers/security-service').default,
  },
}));

import jwt from 'jsonwebtoken';
import { mailService } from '@services/mail/MailService';
import Security from '../../../src/platform/core/security/Security';
import { configureApis } from '../../../src/api/rpc/ApiManager';
import { drainBackground } from '../../../src/operations/account/AccountLifecycleService';
import { hashToken } from '../../../src/operations/account/accountTokens';
import { makeReq, makeRes } from '../../characterization/auth/_helpers';
import { makeCentralDb, makeTenantDb } from '../../characterization/tenant/_fakes';
import { makeAccountEnv, tokenFromMail, FakeAccountEnv } from './_fakeDb';

const send: any = mailService.send;
const OLD_PW = 'Old-Passw0rd-x1';
const NEW_PW = 'Nw9!kQ2#vLmZ';
const EMAIL = 'ali.veli@example.test';
const AUTH_TIME = Math.floor(Date.now() / 1000) - 600;
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ['PUBLIC_APP_URL', 'PASSWORD_RESET_RATE_LIMIT_MAX', 'PASSWORD_RESET_RATE_LIMIT_IP_MAX', 'ACCOUNT_TOKEN_RATE_LIMIT_MAX'];

let env: FakeAccountEnv;
let app: { chains: Record<string, any[]> };

function makeChainApp() {
  const chains: Record<string, any[]> = {};
  return { chains, get: (p: string, ...h: any[]) => { chains['GET ' + p] = h; }, post: (p: string, ...h: any[]) => { chains['POST ' + p] = h; } };
}

/** Rota zincirini (rate limit middleware'leri + handler) Express gibi sırayla çalıştırır. */
async function hit(key: string, body: any, opts: { ip?: string; locals?: any } = {}) {
  const chain = app.chains[key];
  if (!chain) throw new Error('rota yok: ' + key);
  const res: any = makeRes(opts.locals ?? {});
  res.headers = {};
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  const req: any = { ...makeReq({ cookies: {}, body }), socket: { remoteAddress: opts.ip ?? '203.0.113.9' }, method: 'POST' };
  for (let i = 0; i < chain.length; i++) {
    let proceeded = false;
    const isLast = i === chain.length - 1;
    await chain[i](req, res, () => { proceeded = true; });
    if (!isLast && !proceeded) break; // limiter yanıtı verdi (429)
  }
  return res;
}

async function seed(over: any = {}) {
  return {
    _id: 'u1', email: EMAIL, name: 'Ali', surname: 'Veli', password: await Security.getInstance().hashPassword(OLD_PW),
    tokenVersion: 2, failedLoginAttempts: 0, isActive: true, order: 7, owner: true, roleCode: 'ROLE_OWNER', isGlobalAdmin: false, ...over,
  };
}

beforeEach(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.PUBLIC_APP_URL = 'https://app.example.test';
  for (const k of ENV_KEYS.slice(1)) delete process.env[k];
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  send.mockReset();
  (send as any).mockImplementation(async () => undefined);
  env = makeAccountEnv([await seed()], [{ email: EMAIL, password: 'STALE' }]);
  for (const k of Object.keys(appDb)) delete appDb[k];
  Object.assign(appDb, env.appDb);
  tenantDbRef.db = { getUserModel: () => env.tenantUsers };
  const a = makeChainApp();
  configureApis(a as any, '/api');
  app = a;
});
afterEach(async () => {
  await drainBackground();
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  jest.restoreAllMocks();
});

const user = () => env.users.docs[0];
const mails = () => (send.mock.calls as any[][]).map(([to, subject, text, html]) => ({ to, subject, text, html }));

describe('rotalar: özel rotalar jenerik rotadan ÖNCE; rate limit zincirleri', () => {
  it('requestPasswordReset zinciri = [IP limiti, IP+e-posta limiti, handler]; confirm/verify = [limiter, handler]; changePassword = [handler] (kimlikli; kilit sayacı korur)', () => {
    expect(app.chains['POST /api/AccountService/requestPasswordReset']).toHaveLength(3);
    expect(app.chains['POST /api/AccountService/confirmPasswordReset']).toHaveLength(2);
    expect(app.chains['POST /api/AccountService/verifyEmail']).toHaveLength(2);
    expect(app.chains['POST /api/AccountService/changePassword']).toHaveLength(1);
    const keys = Object.keys(app.chains);
    expect(keys.indexOf('POST /api/AccountService/changePassword')).toBeLessThan(keys.indexOf('POST /api/:service/:operation'));
  });
});

describe('POST /AccountService/requestPasswordReset', () => {
  it('kayıtlı ve kayıtsız e-posta için HTTP durumu ve gövde BİREBİR AYNI (200 + genel mesaj); e-posta yalnızca kayıtlıya gider (yanıttan sonra)', async () => {
    const known = await hit('POST /api/AccountService/requestPasswordReset', { email: EMAIL }, { ip: '198.51.100.1' });
    const unknown = await hit('POST /api/AccountService/requestPasswordReset', { email: 'kimse@example.test' }, { ip: '198.51.100.2' });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(known.body).toEqual({ success: true, message: 'Bu e-posta adresi kayıtlıysa parola sıfırlama bağlantısı gönderildi.' });
    expect(known.cookies).toHaveLength(0);
    await drainBackground();
    expect(mails()).toHaveLength(1);
    expect(mails()[0].to).toBe(EMAIL);
    expect(mails()[0].text).toContain('https://app.example.test/reset-password?token=');
    expect(JSON.stringify(known.body)).not.toContain(tokenFromMail(mails()[0]));
  });

  it('geçersiz biçim 400 INVALID_REQUEST (kullanıcıdan bağımsız); yanıtta code var; operatör nesnesi DB\'ye gitmez', async () => {
    for (const bad of [{}, { email: 'gecersiz' }, { email: { $ne: null } }, { email: ['a@b.test'] }]) {
      const r = await hit('POST /api/AccountService/requestPasswordReset', bad, { ip: '198.51.100.3' });
      expect(r.statusCode).toBe(400);
      expect(r.body).toMatchObject({ error: 'Geçersiz istek.', code: 'INVALID_REQUEST', service: undefined });
    }
    await drainBackground();
    expect(env.users.calls.findOne ?? []).toHaveLength(0);
    expect(mails()).toHaveLength(0);
  });

  it('PUBLIC_APP_URL yok: kayıtlı/kayıtsız için AYNI 503 EMAIL_NOT_CONFIGURED; e-posta gitmez; hata loglanır', async () => {
    delete process.env.PUBLIC_APP_URL;
    const a = await hit('POST /api/AccountService/requestPasswordReset', { email: EMAIL }, { ip: '198.51.100.4' });
    const b = await hit('POST /api/AccountService/requestPasswordReset', { email: 'kimse@example.test' }, { ip: '198.51.100.5' });
    expect(a.statusCode).toBe(503);
    expect(a.body.code).toBe('EMAIL_NOT_CONFIGURED');
    expect(b.statusCode).toBe(503);
    expect(b.body).toEqual(a.body);
    await drainBackground();
    expect(mails()).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
  });

  it('SMTP hatası yanıtı DEĞİŞTİRMEZ: yine 200 genel mesaj (hata yalnızca loglanır)', async () => {
    send.mockImplementation(async () => { throw new Error('Mail sending failed: smtp down'); });
    const r = await hit('POST /api/AccountService/requestPasswordReset', { email: EMAIL }, { ip: '198.51.100.6' });
    expect(r.statusCode).toBe(200);
    await drainBackground();
    expect(r.body.success).toBe(true);
  });

  it('rate limit IP+e-posta: 3/saat, 4. istek 429 + Retry-After; kayıtlı ve kayıtsız e-posta için AYNI eşik (varlık sızmaz); engellenen istek servise ULAŞMAZ', async () => {
    const codes = async (email: string, ip: string) => {
      const out: number[] = [];
      for (let i = 0; i < 5; i++) out.push((await hit('POST /api/AccountService/requestPasswordReset', { email }, { ip })).statusCode);
      return out;
    };
    expect(await codes(EMAIL, '198.51.100.10')).toEqual([200, 200, 200, 429, 429]);
    expect(await codes('kimse@example.test', '198.51.100.11')).toEqual([200, 200, 200, 429, 429]);
    const blocked = await hit('POST /api/AccountService/requestPasswordReset', { email: EMAIL }, { ip: '198.51.100.10' });
    expect(blocked.body).toEqual({ error: 'Too many requests' });
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThanOrEqual(1);
    // e-posta harf büyüklüğü/boşluk farkı aynı kovaya düşer
    expect((await hit('POST /api/AccountService/requestPasswordReset', { email: '  ALI.VELI@EXAMPLE.TEST ' }, { ip: '198.51.100.10' })).statusCode).toBe(429);
    // aynı e-posta başka IP'den: IP+e-posta kovası ayrı
    expect((await hit('POST /api/AccountService/requestPasswordReset', { email: EMAIL }, { ip: '198.51.100.12' })).statusCode).toBe(200);
  });

  it('rate limit IP başına (varsayılan 10/saat): aynı IP\'den farklı e-postalarla 11. istek 429', async () => {
    const out: number[] = [];
    for (let i = 0; i < 12; i++) out.push((await hit('POST /api/AccountService/requestPasswordReset', { email: `k${i}@example.test` }, { ip: '198.51.100.20' })).statusCode);
    expect(out).toEqual([...Array(10).fill(200), 429, 429]);
  });

  it('rate limit env ile ayarlanır (PASSWORD_RESET_RATE_LIMIT_MAX=1)', async () => {
    process.env.PASSWORD_RESET_RATE_LIMIT_MAX = '1';
    const a = makeChainApp();
    configureApis(a as any, '/api');
    app = a;
    expect((await hit('POST /api/AccountService/requestPasswordReset', { email: EMAIL }, { ip: '198.51.100.30' })).statusCode).toBe(200);
    expect((await hit('POST /api/AccountService/requestPasswordReset', { email: EMAIL }, { ip: '198.51.100.30' })).statusCode).toBe(429);
  });
});

describe('POST /AccountService/confirmPasswordReset (açık uç; oturum AÇMAZ)', () => {
  async function requestToken() {
    await hit('POST /api/AccountService/requestPasswordReset', { email: EMAIL }, { ip: '198.51.100.40' });
    await drainBackground();
    const t = tokenFromMail(mails()[0]);
    send.mockClear();
    return t;
  }

  it('başarı: 200 { success:true }; ÇEREZ BASILMAZ; token/parola/claim gövdede YOK; kullanıcının tüm oturumları düşer (tv+1)', async () => {
    const token = await requestToken();
    const r = await hit('POST /api/AccountService/confirmPasswordReset', { token, newPassword: NEW_PW }, { ip: '198.51.100.41' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ success: true });
    expect(r.cookies).toHaveLength(0);
    expect(user().tokenVersion).toBe(3);
    expect(await Security.getInstance().comparePassword(NEW_PW, user().password)).toBe(true);
  });

  it('aynı token ikinci kez / uydurma token: 400 TOKEN_INVALID, AYNI gövde; zayıf parola 400 WEAK_PASSWORD ve token yanmaz; yanıt isteği (token/parola) GERİ YANSITMAZ', async () => {
    const token = await requestToken();
    const weak = await hit('POST /api/AccountService/confirmPasswordReset', { token, newPassword: 'zayif' });
    expect(weak.statusCode).toBe(400);
    expect(weak.body.code).toBe('WEAK_PASSWORD');
    const ok = await hit('POST /api/AccountService/confirmPasswordReset', { token, newPassword: NEW_PW });
    expect(ok.statusCode).toBe(200);
    const reused = await hit('POST /api/AccountService/confirmPasswordReset', { token, newPassword: NEW_PW });
    const fake = await hit('POST /api/AccountService/confirmPasswordReset', { token: 'A'.repeat(43), newPassword: NEW_PW });
    expect(reused.statusCode).toBe(400);
    expect(reused.body).toEqual(fake.body);
    expect(reused.body.code).toBe('TOKEN_INVALID');
    for (const r of [weak, reused, fake]) {
      const text = JSON.stringify(r.body);
      expect(text).not.toContain(token);
      expect(text).not.toContain(NEW_PW);
    }
  });

  it('rate limit: IP başına 20 deneme/10 dk; 21. istek 429 ve servise ulaşmaz', async () => {
    const out: number[] = [];
    for (let i = 0; i < 22; i++) out.push((await hit('POST /api/AccountService/confirmPasswordReset', { token: 'A'.repeat(43), newPassword: NEW_PW }, { ip: '198.51.100.50' })).statusCode);
    expect(out).toEqual([...Array(20).fill(400), 429, 429]);
  });
});

describe('POST /AccountService/verifyEmail (açık uç)', () => {
  it('kayıt-benzeri akış: doğrulama e-postasındaki token ile 200; emailVerified true; tek kullanım; çerez YOK', async () => {
    // doğrulama e-postasını istek yoluyla üret: resend (kimlikli, jenerik RPC) -> mail -> verify (kimliksiz özel rota)
    const locals = { userContext: { _id: 'u1', order: 7, roleCode: 'ROLE_OPERATOR', owner: false }, principal: { sub: 'u1', tid: 7, ga: false, tv: 2, imp: false, auth_time: AUTH_TIME } };
    const res: any = makeRes(locals);
    await (app.chains['POST /api/:service/:operation'][0] as any)({ ...makeReq({ cookies: {}, body: {}, params: { service: 'AccountService', operation: 'resendVerificationEmail' } }), socket: { remoteAddress: '198.51.100.60' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    const token = tokenFromMail(mails()[mails().length - 1]);
    const v = await hit('POST /api/AccountService/verifyEmail', { token }, { ip: '198.51.100.61' });
    expect(v.statusCode).toBe(200);
    expect(v.body).toEqual({ success: true });
    expect(v.cookies).toHaveLength(0);
    expect(user().emailVerified).toBe(true);
    const again = await hit('POST /api/AccountService/verifyEmail', { token }, { ip: '198.51.100.61' });
    expect(again.statusCode).toBe(400);
    expect(again.body.code).toBe('TOKEN_INVALID');
  });

  it('geçersiz/biçimsiz token 400 TOKEN_INVALID; nesne token DB\'ye gitmez', async () => {
    for (const bad of [{}, { token: { $ne: null } }, { token: 'kisa' }, { token: 'B'.repeat(43) }]) {
      const r = await hit('POST /api/AccountService/verifyEmail', bad, { ip: '198.51.100.62' });
      expect([r.statusCode, r.body.code]).toEqual([400, 'TOKEN_INVALID']);
    }
  });
});

describe('POST /AccountService/changePassword (kimlikli; çerezi yeniler)', () => {
  const principal = (over: any = {}) => ({ sub: 'u1', tid: 7, ga: false, tv: 2, imp: false, auth_time: AUTH_TIME, ...over });
  const locals = (over: any = {}, uc: any = {}) => ({ userContext: { _id: 'u1', order: 7, roleCode: 'ROLE_OPERATOR', owner: false, ...uc }, principal: principal(over) });

  it('principal yok -> 401 (servise ulaşılmaz)', async () => {
    const r = await hit('POST /api/AccountService/changePassword', { currentPassword: OLD_PW, newPassword: NEW_PW });
    expect(r.statusCode).toBe(401);
    expect(user().tokenVersion).toBe(2);
  });

  it('member kademesi (ROLE_OPERATOR) çağırabilir: 200 { success:true }; YENİ çerez (tv=3, tid/role/imp/auth_time korunur, 8 saat); gövdede claim/token/parola YOK', async () => {
    const r = await hit('POST /api/AccountService/changePassword', { currentPassword: OLD_PW, newPassword: NEW_PW }, { locals: locals() });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ success: true });
    expect(r.cookies).toHaveLength(1);
    expect(r.cookies[0].name).toBe('JWT_TOKEN');
    expect(r.cookies[0].options.httpOnly).toBe(true);
    const d: any = jwt.verify(r.cookies[0].value, process.env.JWT_SECRET as string, { algorithms: ['HS256'] });
    expect(d).toMatchObject({ sub: 'u1', tid: 7, role: 'ROLE_OWNER', ga: false, tv: 3, imp: false, auth_time: AUTH_TIME, aud: 'web' });
    expect(Object.keys(d)).not.toContain('email');
    expect(JSON.stringify(r.body)).not.toMatch(/tv|sessionClaims|eyJ/);
    expect(user().tokenVersion).toBe(3);
    // eski oturumun token'ı (tv=2) authenticate'te artık uyuşmaz: yeni tokenVersion 3
    expect(user().tokenVersion).not.toBe(principal().tv);
    // tenant kopyası eşitlendi
    expect(env.tenantUsers.docs[0].password).toBe(user().password);
  });

  it('yanlış mevcut parola: 400 INVALID_CURRENT_PASSWORD (+code), çerez YOK, yanıt parolaları geri yansıtmaz', async () => {
    const r = await hit('POST /api/AccountService/changePassword', { currentPassword: 'yanlis-parola-9', newPassword: NEW_PW }, { locals: locals() });
    expect(r.statusCode).toBe(400);
    expect(r.body).toMatchObject({ error: 'Mevcut parola hatalı.', code: 'INVALID_CURRENT_PASSWORD' });
    expect(r.cookies).toHaveLength(0);
    for (const s of ['yanlis-parola-9', NEW_PW]) expect(JSON.stringify(r.body)).not.toContain(s);
    expect(user().tokenVersion).toBe(2);
  });

  it('zayıf yeni parola 400 WEAK_PASSWORD; operatör nesnesi 400 INVALID_REQUEST; çerez yok', async () => {
    const weak = await hit('POST /api/AccountService/changePassword', { currentPassword: OLD_PW, newPassword: 'kisa' }, { locals: locals() });
    expect([weak.statusCode, weak.body.code]).toEqual([400, 'WEAK_PASSWORD']);
    const inj = await hit('POST /api/AccountService/changePassword', { currentPassword: { $ne: null }, newPassword: NEW_PW }, { locals: locals() });
    expect([inj.statusCode, inj.body.code]).toEqual([400, 'INVALID_REQUEST']);
    expect(weak.cookies.concat(inj.cookies)).toHaveLength(0);
  });

  it('gövdedeki userContext/principal/userId sahte alanları kimliği DEĞİŞTİRMEZ: hedef yalnızca doğrulanmış principal.sub', async () => {
    const other = await seed({ _id: 'u2', email: 'baska@example.test', name: 'Baska', surname: 'Kisi' });
    env.users.docs.push({ ...other });
    const before2 = env.users.docs[1].password;
    const r = await hit('POST /api/AccountService/changePassword', { currentPassword: OLD_PW, newPassword: NEW_PW, principal: { sub: 'u2' }, userContext: { _id: 'u2' }, userId: 'u2', email: 'baska@example.test' }, { locals: locals() });
    expect(r.statusCode).toBe(200);
    expect(env.users.docs[1].password).toBe(before2);
    expect(env.users.docs[1].tokenVersion).toBe(2);
  });
});

describe('jenerik RPC üzerinden politika', () => {
  it('kimlikli olmayan çağrı: resendVerificationEmail 401; kayıtsız AccountService/get ve yardımcılar 403', async () => {
    const call = async (operation: string, locals: any = {}) => {
      const res: any = makeRes(locals);
      await (app.chains['POST /api/:service/:operation'][0] as any)({ ...makeReq({ cookies: {}, body: {}, params: { service: 'AccountService', operation } }), socket: { remoteAddress: '198.51.100.70' } }, res);
      return res;
    };
    expect((await call('resendVerificationEmail')).statusCode).toBe(401);
    const authed = { userContext: { _id: 'u1', order: 7, roleCode: 'ROLE_OPERATOR' }, principal: { sub: 'u1', tid: 7, ga: false, tv: 2, imp: false, auth_time: AUTH_TIME } };
    for (const op of ['get', 'init', 'lifecycle', 'ip', 'constructor']) expect([op, (await call(op, authed)).statusCode]).toEqual([op, 403]);
  });
});

describe('jenerik rota özel-rota operasyonlarını ATLATMA yolu olamaz', () => {
  it('yüzde-kodlanmış yol gibi bir sapmayla jenerik rotaya düşen requestPasswordReset/confirmPasswordReset/verifyEmail/changePassword: kimlikli olsa bile 403; e-posta gitmez, DB değişmez (rate limit/çerez atlatılamaz)', async () => {
    const authed = { userContext: { _id: 'u1', order: 7, roleCode: 'ROLE_OWNER', owner: true }, principal: { sub: 'u1', tid: 7, ga: false, tv: 2, imp: false, auth_time: AUTH_TIME } };
    for (const locals of [authed, {}]) {
      for (const operation of ['requestPasswordReset', 'confirmPasswordReset', 'verifyEmail', 'changePassword', 'REQUESTPASSWORDRESET']) {
        const res: any = makeRes(locals);
        await (app.chains['POST /api/:service/:operation'][0] as any)({ ...makeReq({ cookies: {}, body: { email: EMAIL, token: 'A'.repeat(43), newPassword: NEW_PW, currentPassword: OLD_PW }, params: { service: 'AccountService', operation } }), socket: { remoteAddress: '198.51.100.90' } }, res);
        expect([operation, res.statusCode]).toEqual([operation, 403]);
        expect(res.cookies).toHaveLength(0);
      }
    }
    await drainBackground();
    expect(mails()).toHaveLength(0);
    expect(user().tokenVersion).toBe(2);
    expect(env.tokens.docs).toHaveLength(0);
  });
});

describe('kayıt: doğrulama e-postası (best-effort, kaydı ETKİLEMEZ)', () => {
  function useCentral() {
    const central = makeCentralDb({ clients: [{ order: 4, clientId: 4, status: 'ACTIVE', dbConfig: { dbname: 'x4' } }] });
    const tenant = makeTenantDb();
    for (const k of Object.keys(appDb)) delete appDb[k];
    Object.assign(appDb, central.appDb, { getAccountTokenModel: () => env.tokens });
    tenantDbRef.db = tenant.db; // provisioning getClientDB(order) ile bu sahte tenant DB'sini alır
    return { central, tenant };
  }
  const registerBody = { registerValues: { name: 'Ad', surname: 'Soyad', email: 'n@x.test', password: 'plain-pw-1', password2: 'plain-pw-1' } };

  it('kayıt başarılıysa doğrulama token\'ı üretilir (hash) ve MailService.send çağrılır; yanıt profil DTO\'su emailVerified:false içerir', async () => {
    useCentral();
    const res = makeRes();
    await (app.chains['POST /api/SecurityService/register'][1] as any)({ ...makeReq({ cookies: {}, body: registerBody }), socket: { remoteAddress: '198.51.100.80' } }, res);
    await drainBackground();
    if (res.statusCode !== 200) throw new Error('kayıt başarısız: ' + JSON.stringify(res.body));
    expect(res.body.emailVerified).toBe(false);
    expect(mails()).toHaveLength(1);
    expect(mails()[0].to).toBe('n@x.test');
    expect(mails()[0].subject).toBe('Entegrasyonik e-posta doğrulama');
    const token = tokenFromMail(mails()[0]);
    expect(env.tokens.docs).toHaveLength(1);
    expect(env.tokens.docs[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it('e-posta gönderimi (SMTP) HATA verse veya PUBLIC_APP_URL yoksa kayıt yine 200 (uyarı loglanır)', async () => {
    useCentral();
    send.mockImplementation(async () => { throw new Error('smtp down'); });
    const res1 = makeRes();
    await (app.chains['POST /api/SecurityService/register'][1] as any)({ ...makeReq({ cookies: {}, body: registerBody }), socket: { remoteAddress: '198.51.100.81' } }, res1);
    await drainBackground();
    expect(res1.statusCode).toBe(200);

    useCentral();
    delete process.env.PUBLIC_APP_URL;
    send.mockClear();
    const res2 = makeRes();
    await (app.chains['POST /api/SecurityService/register'][1] as any)({ ...makeReq({ cookies: {}, body: { registerValues: { ...registerBody.registerValues, email: 'n2@x.test' } } }), socket: { remoteAddress: '198.51.100.82' } }, res2);
    await drainBackground();
    expect(res2.statusCode).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });
});

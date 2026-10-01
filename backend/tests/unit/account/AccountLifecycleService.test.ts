import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// AccountLifecycleService: parola değiştir / parola sıfırla / e-posta doğrula. DB (durum tutan bellek-içi sahte), e-posta (sahte gönderici),
// saat (enjekte) — gerçek DB/Redis/ağ/SMTP YOK. Parolalar/e-postalar sahte test değerleridir.

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getClientDB: async () => undefined } }));

import Security from '../../../src/platform/core/security/Security';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import {
  AccountLifecycleService, drainBackground, resolvePublicAppUrl, TOKEN_INVALID_MESSAGE,
} from '../../../src/operations/account/AccountLifecycleService';
import { TOKEN_RESEND_COOLDOWN_MS, hashToken } from '../../../src/operations/account/accountTokens';
import { makeAccountEnv, tokenFromMail, FakeAccountEnv } from './_fakeDb';

const OLD_PW = 'Old-Passw0rd-x1';
const NEW_PW = 'Nw9!kQ2#vLmZ';
const T0 = 1_800_000_000_000;

let env: FakeAccountEnv;
let clock = T0;
let audit: any[] = [];
let svc: AccountLifecycleService;
const savedUrl = process.env.PUBLIC_APP_URL;

async function seedUser(over: any = {}) {
  return {
    _id: 'u1', email: 'ali.veli@example.test', name: 'Ali', surname: 'Veli', password: await Security.getInstance().hashPassword(OLD_PW),
    tokenVersion: 2, failedLoginAttempts: 0, isActive: true, order: 7, owner: true, roleCode: 'ROLE_OWNER', isGlobalAdmin: false, ...over,
  };
}

async function setup(users?: any[], tenantUsers?: any[]) {
  env = makeAccountEnv(users ?? [await seedUser()], tenantUsers ?? [{ email: 'ali.veli@example.test', password: 'STALE-HASH' }]);
  svc = new AccountLifecycleService({
    applicationDB: env.appDb, mailSender: env.mailSender, getClientDB: env.getClientDB, now: () => clock,
  });
}

const principal = (over: any = {}) => ({ sub: 'u1', tid: 7, ga: false, imp: false, auth_time: Math.floor(T0 / 1000) - 600, ...over });
const code = (c: string, status: number) => expect.objectContaining({ code: c, statusCode: status });

beforeEach(async () => {
  clock = T0;
  audit = [];
  AuditLogger.setSink(async (r) => { audit.push(r); });
  process.env.PUBLIC_APP_URL = 'https://app.example.test';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await setup();
});
afterEach(async () => {
  await drainBackground();
  AuditLogger.setSink(undefined);
  if (savedUrl === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = savedUrl;
  jest.restoreAllMocks();
});

const user = () => env.users.docs[0];
const tokenDocs = (purpose?: string) => env.tokens.docs.filter((d: any) => !purpose || d.purpose === purpose);
const flushAudit = () => new Promise((r) => setImmediate(r));

// =====================================================================================================================
describe('changePassword', () => {
  it('başarı: yeni parola bcrypt ile yazılır, tokenVersion +1, sayaç/kilit sıfırlanır; çağıran oturum için YENİ claim\'ler (tv yeni, tid/imp/auth_time korunur)', async () => {
    env.users.docs[0].failedLoginAttempts = 3; env.users.docs[0].lockUntil = new Date(T0 - 1000);
    const before = user().password;
    const p = principal();
    const r = await svc.changePassword({ principal: p, currentPassword: OLD_PW, newPassword: NEW_PW, ip: '203.0.113.7' });
    expect(r.body).toEqual({ success: true });
    expect(user().password).not.toBe(before);
    expect(user().password).not.toBe(NEW_PW);
    expect(await Security.getInstance().comparePassword(NEW_PW, user().password)).toBe(true);
    expect(user().tokenVersion).toBe(3);
    expect(user().failedLoginAttempts).toBe(0);
    expect(user().lockUntil).toBeUndefined();
    expect(user().passwordChangedAt).toEqual(new Date(T0));
    expect(r.sessionClaims).toEqual({ sub: 'u1', tid: 7, role: 'ROLE_OWNER', ga: false, tv: 3, imp: false, auth_time: p.auth_time });
    // yanıtta parola/özet yok
    expect(JSON.stringify(r)).not.toContain(NEW_PW);
    expect(JSON.stringify(r)).not.toContain(user().password);
  });

  it('süper yönetici (ga + imp) oturumu: ga/imp/tid/auth_time claim\'leri KORUNUR', async () => {
    await setup([await seedUser({ isGlobalAdmin: true, order: undefined })]);
    const p = principal({ ga: true, imp: true, tid: 12 });
    const r = await svc.changePassword({ principal: p, currentPassword: OLD_PW, newPassword: NEW_PW });
    expect(r.sessionClaims).toMatchObject({ sub: 'u1', tid: 12, ga: true, imp: true, tv: 3, auth_time: p.auth_time });
    expect(env.getClientDB).not.toHaveBeenCalled(); // süper yöneticinin tenant kopyası yok
  });

  it('diğer oturumlar düşer: yeni tokenVersion eski token\'ın tv\'sinden büyük (authenticate tv uyuşmazlığında 401 verir)', async () => {
    const oldTv = user().tokenVersion;
    const r = await svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: NEW_PW });
    expect(r.sessionClaims.tv).toBe(oldTv + 1);
    expect(user().tokenVersion).not.toBe(oldTv);
  });

  it('tenant kullanıcı kopyası (UserService iki yere yazar) best-effort eşitlenir; eşitleme hatası parola değişimini BOZMAZ', async () => {
    await svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: NEW_PW });
    expect(env.getClientDB).toHaveBeenCalledWith(7);
    expect(env.tenantUsers.docs[0].password).toBe(user().password);

    await setup();
    env.getClientDB.mockImplementation(async () => { throw new Error('tenant db down'); });
    const r = await svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: NEW_PW });
    expect(r.body.success).toBe(true);
    expect(await Security.getInstance().comparePassword(NEW_PW, user().password)).toBe(true);
  });

  it('başarıda: bekleyen parola sıfırlama bağlantıları geçersiz kılınır; "parolanız değiştirildi" bildirimi gider (best-effort)', async () => {
    const issued = await svc.prepareResetRequest('ali.veli@example.test');
    await svc.executeResetRequest(issued.email, issued.baseUrl);
    env.sent.length = 0;
    expect(tokenDocs('password_reset').filter((d: any) => !d.usedAt)).toHaveLength(1);
    await svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: NEW_PW });
    await drainBackground();
    expect(tokenDocs('password_reset').filter((d: any) => !d.usedAt)).toHaveLength(0);
    expect(env.sent).toHaveLength(1);
    expect(env.sent[0].to).toBe('ali.veli@example.test');
    expect(env.sent[0].subject).toMatch(/parolanız değiştirildi/);
    expect(env.sent[0].text).not.toContain(NEW_PW);
  });

  it('yanlış mevcut parola: 400 INVALID_CURRENT_PASSWORD (401 DEĞİL — FE yönlendirmesi tetiklenmez); hiçbir şey yazılmaz; sayaç +1', async () => {
    const before = { ...user() };
    await expect(svc.changePassword({ principal: principal(), currentPassword: 'yanlis-parola-1', newPassword: NEW_PW })).rejects.toEqual(code('INVALID_CURRENT_PASSWORD', 400));
    expect(user().password).toBe(before.password);
    expect(user().tokenVersion).toBe(before.tokenVersion);
    expect(user().failedLoginAttempts).toBe(1);
    expect(env.sent).toHaveLength(0);
  });

  it('5 yanlış mevcut parola denemesinde hesap 15 dk kilitlenir (login ile aynı kural; çalınmış oturumla parola tahmini durur)', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(svc.changePassword({ principal: principal(), currentPassword: 'yanlis-parola-' + i, newPassword: NEW_PW })).rejects.toEqual(code('INVALID_CURRENT_PASSWORD', 400));
    }
    expect(user().failedLoginAttempts).toBe(5);
    expect(user().lockUntil.getTime() - T0).toBe(15 * 60 * 1000);
  });

  it('zayıf yeni parola: 400 WEAK_PASSWORD, parola değişmez; mevcut parola doğru olsa da yanlış olsa da parolayı içermeyen mesaj', async () => {
    const before = user().password;
    for (const weak of ['kisa1A!', 'passwordpassword', 'Ali-veli-Zq9!x', '1234567890']) {
      await expect(svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: weak })).rejects.toEqual(code('WEAK_PASSWORD', 400));
    }
    expect(user().password).toBe(before);
    expect(user().tokenVersion).toBe(2);
    expect(user().failedLoginAttempts).toBe(0); // zayıf parola sayaç artırmaz
  });

  it('yeni parola mevcutla aynıysa 400 SAME_PASSWORD', async () => {
    await expect(svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: OLD_PW })).rejects.toEqual(code('SAME_PASSWORD', 400));
    expect(user().tokenVersion).toBe(2);
  });

  it('ADR-0001 string-only: nesne/dizi/sayı/boş/aşırı uzun girdi 400 INVALID_REQUEST ve veritabanına HİÇ sorgu atılmaz', async () => {
    for (const bad of [{ $ne: null }, ['a'], 5, null, undefined, '', 'x'.repeat(2000)] as any[]) {
      await expect(svc.changePassword({ principal: principal(), currentPassword: bad, newPassword: NEW_PW })).rejects.toEqual(code('INVALID_REQUEST', 400));
      await expect(svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: bad })).rejects.toEqual(code('INVALID_REQUEST', 400));
    }
    expect(env.users.calls.findById ?? []).toHaveLength(0);
  });

  it('principal yok -> 401; kullanıcı silinmiş/pasif -> generik 401 (sahte bcrypt yapılır); DB\'de yazma olmaz', async () => {
    await expect(svc.changePassword({ principal: undefined, currentPassword: OLD_PW, newPassword: NEW_PW })).rejects.toMatchObject({ statusCode: 401 });
    const spy = jest.spyOn(Security.getInstance(), 'comparePassword');
    await expect(svc.changePassword({ principal: principal({ sub: 'yok' }), currentPassword: OLD_PW, newPassword: NEW_PW })).rejects.toMatchObject({ statusCode: 401, message: 'Token not verified' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][1] as string).startsWith('$2')).toBe(true);
    await setup([await seedUser({ isActive: false })]);
    await expect(svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: NEW_PW })).rejects.toMatchObject({ statusCode: 401 });
    expect(user().tokenVersion).toBe(2);
  });

  it('hedef kullanıcı DAİMA principal.sub: istek alanları (userId/email) kullanılmaz — başka kullanıcının parolası değişmez', async () => {
    await setup([await seedUser(), await seedUser({ _id: 'u2', email: 'baska@example.test', name: 'Baska', surname: 'Kisi' })]);
    const other = env.users.docs[1].password;
    await svc.changePassword({ principal: principal({ sub: 'u1' }), currentPassword: OLD_PW, newPassword: NEW_PW, ...( { userId: 'u2', email: 'baska@example.test' } as any) });
    expect(env.users.docs[1].password).toBe(other);
    expect(env.users.docs[1].tokenVersion).toBe(2);
  });

  it('eşzamanlı iki değişim (aynı mevcut parola): YALNIZCA biri başarılı, diğeri 409 CONFLICT (CAS); tokenVersion tam +1', async () => {
    const [a, b] = await Promise.allSettled([
      svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: NEW_PW }),
      svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: 'Zr7#pLw!q9Xa' }),
    ]);
    const ok = [a, b].filter((x) => x.status === 'fulfilled');
    const bad: any = [a, b].find((x) => x.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(bad.reason).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
    expect(user().tokenVersion).toBe(3);
  });

  it('denetim kaydı: user.password_change ok/fail; PII (e-posta/parola/token/özet) YOK; başarısızlık nedeni meta.reason', async () => {
    await expect(svc.changePassword({ principal: principal(), currentPassword: 'yanlis-parola-1', newPassword: NEW_PW, ip: '203.0.113.7' })).rejects.toBeDefined();
    await svc.changePassword({ principal: principal(), currentPassword: OLD_PW, newPassword: NEW_PW, ip: '203.0.113.7' });
    await flushAudit();
    expect(audit.map((r) => [r.event, r.result, r.meta?.reason])).toEqual([['user.password_change', 'fail', 'wrong_current'], ['user.password_change', 'ok', undefined]]);
    expect(audit[1]).toMatchObject({ sub: 'u1', tid: 7, ip: '203.0.113.7' });
    const text = JSON.stringify(audit);
    for (const secret of [NEW_PW, OLD_PW, 'ali.veli@example.test', user().password]) expect(text).not.toContain(secret);
  });
});

// =====================================================================================================================
describe('PUBLIC_APP_URL', () => {
  it('https tabanı kabul; sondaki "/" atılır; yol öneki korunur; http yalnızca localhost/127.0.0.1', () => {
    process.env.PUBLIC_APP_URL = 'https://app.example.test/';
    expect(resolvePublicAppUrl()).toBe('https://app.example.test');
    process.env.PUBLIC_APP_URL = 'https://example.test/panel/';
    expect(resolvePublicAppUrl()).toBe('https://example.test/panel');
    process.env.PUBLIC_APP_URL = 'http://localhost:3000';
    expect(resolvePublicAppUrl()).toBe('http://localhost:3000');
  });

  it('tanımsız/boş/geçersiz/http(uzak)/kimlik bilgili/sorgulu: açık hata 503 EMAIL_NOT_CONFIGURED + log (fail-fast DEĞİL)', () => {
    for (const bad of [undefined, '', '   ', 'app.example.test', 'ftp://x.test', 'http://app.example.test', 'https://u:p@app.example.test', 'https://app.example.test/?x=1', 'https://app.example.test/#a']) {
      if (bad === undefined) delete process.env.PUBLIC_APP_URL; else process.env.PUBLIC_APP_URL = bad;
      expect(() => resolvePublicAppUrl()).toThrow(expect.objectContaining({ statusCode: 503, code: 'EMAIL_NOT_CONFIGURED' }));
    }
    expect(console.error).toHaveBeenCalled();
    expect((console.error as any).mock.calls.every((c: any[]) => String(c[0]).includes('PUBLIC_APP_URL'))).toBe(true);
  });
});

// =====================================================================================================================
describe('parola sıfırlama isteği (kullanıcı numaralandırma yok)', () => {
  const run = async (email: unknown, ip?: string) => {
    const { email: e, baseUrl } = svc.prepareResetRequest(email);
    await svc.executeResetRequest(e, baseUrl, ip);
  };

  it('kayıtlı kullanıcı: tek kullanımlık token üretilir, YALNIZCA hash saklanır, e-posta bağlantısı PUBLIC_APP_URL tabanlıdır; e-posta büyük/küçük harf ve boşluktan bağımsız', async () => {
    await run('  ALI.Veli@Example.TEST ', '203.0.113.7');
    expect(env.sent).toHaveLength(1);
    const mail = env.sent[0];
    expect(mail.to).toBe('ali.veli@example.test');
    expect(mail.text).toMatch(/^Merhaba,/);
    expect(mail.text).toContain('https://app.example.test/reset-password?token=');
    expect(mail.text).toContain('30 dakika');
    const token = tokenFromMail(mail);
    expect(tokenDocs('password_reset')).toHaveLength(1);
    expect(tokenDocs()[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(tokenDocs())).not.toContain(token);
    expect(tokenDocs()[0].expiresAt.getTime() - T0).toBe(30 * 60 * 1000);
    expect(mail.html).toContain(token);
  });

  it('kayıtsız e-posta: hata YOK, token YOK, e-posta YOK — ve denetim kaydı kayıtlı kullanıcıyla BİREBİR aynı biçimde (yalnızca ip; sub/meta yok)', async () => {
    await run('kimse@example.test', '203.0.113.7');
    await run('ali.veli@example.test', '203.0.113.7');
    await flushAudit();
    expect(env.sent).toHaveLength(1); // yalnızca kayıtlı olana
    expect(tokenDocs()).toHaveLength(1);
    expect(audit).toHaveLength(2);
    const strip = (r: any) => { const { at, ...rest } = r; return rest; };
    expect(strip(audit[0])).toEqual(strip(audit[1]));
    expect(audit[0]).toMatchObject({ event: 'password_reset.request', result: 'ok', ip: '203.0.113.7' });
    expect(audit[0].sub).toBeUndefined();
    expect(JSON.stringify(audit)).not.toMatch(/kimse|ali\.veli/);
  });

  it('pasif hesap: sessizce hiçbir şey yapılmaz (kayıtsızla aynı)', async () => {
    await setup([await seedUser({ isActive: false })]);
    await run('ali.veli@example.test');
    expect(env.sent).toHaveLength(0);
    expect(tokenDocs()).toHaveLength(0);
  });

  it('cooldown: aynı kullanıcı için 60 sn içinde ikinci istek yeni e-posta/token ÜRETMEZ; sonra yenisi üretilir ve ESKİ token geçersiz olur', async () => {
    await run('ali.veli@example.test');
    clock += TOKEN_RESEND_COOLDOWN_MS - 1;
    await run('ali.veli@example.test');
    expect(env.sent).toHaveLength(1);
    const first = tokenFromMail(env.sent[0]);
    clock += 1;
    await run('ali.veli@example.test');
    expect(env.sent).toHaveLength(2);
    const second = tokenFromMail(env.sent[1]);
    await expect(svc.confirmPasswordReset(first, NEW_PW)).rejects.toEqual(code('TOKEN_INVALID', 400));
    await expect(svc.confirmPasswordReset(second, NEW_PW)).resolves.toEqual({ success: true });
  });

  it('yanıt öncesi (prepare) aşaması kullanıcı DB\'sine HİÇ dokunmaz — varlık bilgisi yanıttan önce hesaplanmaz', async () => {
    svc.prepareResetRequest('ali.veli@example.test');
    svc.prepareResetRequest('kimse@example.test');
    expect(env.users.calls.findOne ?? []).toHaveLength(0);
    expect(env.tokens.calls.create ?? []).toHaveLength(0);
  });

  it('geçersiz biçim (string değil / nesne / e-posta değil / aşırı uzun): 400 INVALID_REQUEST — kullanıcıdan bağımsız', () => {
    for (const bad of [undefined, null, 5, { $ne: null }, ['a@b.test'], '', 'gecersiz', 'a@b', 'x'.repeat(300) + '@e.test']) {
      expect(() => svc.prepareResetRequest(bad)).toThrow(expect.objectContaining({ statusCode: 400, code: 'INVALID_REQUEST' }));
    }
  });

  it('PUBLIC_APP_URL yoksa: açık hata 503 (kayıtlı/kayıtsız için AYNI), e-posta gönderilmez', () => {
    delete process.env.PUBLIC_APP_URL;
    for (const e of ['ali.veli@example.test', 'kimse@example.test']) {
      expect(() => svc.prepareResetRequest(e)).toThrow(expect.objectContaining({ statusCode: 503, code: 'EMAIL_NOT_CONFIGURED' }));
    }
    expect(env.sent).toHaveLength(0);
  });

  it('e-posta gönderimi (SMTP) hata verse bile executeResetRequest FIRLATMAZ (yanıt kullanıcıya göre değişmez); hata loglanır, token/adres loglanmaz', async () => {
    env.mailSender.mockImplementation(async () => { throw new Error('smtp down'); });
    await expect(run('ali.veli@example.test')).resolves.toBeUndefined();
    const logged = JSON.stringify((console.error as any).mock.calls);
    expect(logged).toContain('smtp down');
    expect(logged).not.toContain('ali.veli');
    expect(logged).not.toContain(tokenDocs()[0].tokenHash);
  });
});

// =====================================================================================================================
describe('parola sıfırlama onayı', () => {
  async function requestToken(): Promise<string> {
    const { email, baseUrl } = svc.prepareResetRequest('ali.veli@example.test');
    await svc.executeResetRequest(email, baseUrl);
    const t = tokenFromMail(env.sent[env.sent.length - 1]);
    env.sent.length = 0;
    return t;
  }

  it('başarı: parola + tokenVersion +1 (TÜM oturumlar düşer), kilit/sayaç temizlenir, e-posta doğrulanmış sayılır, tenant kopyası eşitlenir; oturum AÇILMAZ (yalnızca { success })', async () => {
    env.users.docs[0].failedLoginAttempts = 5; env.users.docs[0].lockUntil = new Date(T0 + 60_000);
    const token = await requestToken();
    const r = await svc.confirmPasswordReset(token, NEW_PW, '203.0.113.7');
    expect(r).toEqual({ success: true });
    expect(await Security.getInstance().comparePassword(NEW_PW, user().password)).toBe(true);
    expect(user().tokenVersion).toBe(3);
    expect(user().failedLoginAttempts).toBe(0);
    expect(user().lockUntil).toBeUndefined();
    expect(user().emailVerified).toBe(true);
    expect(env.tenantUsers.docs[0].password).toBe(user().password);
    await drainBackground();
    expect(env.sent.map((m) => m.subject)).toEqual([expect.stringMatching(/parolanız değiştirildi/)]);
  });

  it('tek kullanım: aynı token ikinci kez 400 TOKEN_INVALID; parola tekrar değişmez', async () => {
    const token = await requestToken();
    await svc.confirmPasswordReset(token, NEW_PW);
    const hashAfter = user().password;
    await expect(svc.confirmPasswordReset(token, 'Zr7#pLw!q9Xa')).rejects.toEqual(code('TOKEN_INVALID', 400));
    expect(user().password).toBe(hashAfter);
    expect(user().tokenVersion).toBe(3);
  });

  it('eşzamanlı iki onay: YALNIZCA biri başarılı (atomik tüketim)', async () => {
    const token = await requestToken();
    const res = await Promise.allSettled([svc.confirmPasswordReset(token, NEW_PW), svc.confirmPasswordReset(token, 'Zr7#pLw!q9Xa')]);
    expect(res.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(user().tokenVersion).toBe(3);
  });

  it('30 dk sonra süresi dolar: 400 TOKEN_INVALID (sınırdan 1 ms önce hâlâ geçerli)', async () => {
    const token = await requestToken();
    clock += 30 * 60 * 1000 - 1;
    expect(await svc.confirmPasswordReset(token, NEW_PW)).toEqual({ success: true });
    await setup();
    const t2 = await requestToken();
    clock += 30 * 60 * 1000;
    await expect(svc.confirmPasswordReset(t2, NEW_PW)).rejects.toEqual(code('TOKEN_INVALID', 400));
  });

  it('geçersiz / uydurma / kullanılmış / süresi dolmuş / biçimsiz token: AYNI yanıt (mesaj + kod + durum) — ayırt edilemez', async () => {
    const used = await requestToken();
    await svc.confirmPasswordReset(used, NEW_PW);
    await setup();
    const expired = await requestToken();
    clock += 31 * 60 * 1000;
    const errs: any[] = [];
    for (const t of [used, expired, 'A'.repeat(43), 'kisa', { $ne: null }, ['x'], undefined, 12345]) {
      try { await svc.confirmPasswordReset(t, NEW_PW); errs.push(null); } catch (e) { errs.push(e); }
    }
    for (const e of errs) expect(e).toMatchObject({ statusCode: 400, code: 'TOKEN_INVALID', message: TOKEN_INVALID_MESSAGE });
  });

  it('zayıf parola token\'ı YAKMAZ: 400 WEAK_PASSWORD, ardından güçlü parolayla aynı token çalışır', async () => {
    const token = await requestToken();
    await expect(svc.confirmPasswordReset(token, 'zayif')).rejects.toEqual(code('WEAK_PASSWORD', 400));
    await expect(svc.confirmPasswordReset(token, 'Ali-veli-Zq9!x')).rejects.toEqual(code('WEAK_PASSWORD', 400)); // e-posta/ad içerir
    expect(user().tokenVersion).toBe(2);
    expect(await svc.confirmPasswordReset(token, NEW_PW)).toEqual({ success: true });
  });

  it('parola girdisi string değil/boş/aşırı uzun: 400 INVALID_REQUEST', async () => {
    const token = await requestToken();
    for (const bad of [undefined, null, 5, { $ne: null }, '', 'x'.repeat(2000)] as any[]) {
      await expect(svc.confirmPasswordReset(token, bad)).rejects.toEqual(code('INVALID_REQUEST', 400));
    }
    expect(user().tokenVersion).toBe(2);
  });

  it('bir kullanıcının token\'ı başka kullanıcının parolasını DEĞİŞTİREMEZ', async () => {
    await setup([await seedUser(), await seedUser({ _id: 'u2', email: 'baska@example.test', name: 'Baska', surname: 'Kisi' })]);
    const t1 = await requestToken();
    const before2 = env.users.docs[1].password;
    await svc.confirmPasswordReset(t1, NEW_PW);
    expect(env.users.docs[1].password).toBe(before2);
    expect(env.users.docs[1].tokenVersion).toBe(2);
  });

  it('parola sıfırlanınca kalan bekleyen sıfırlama token\'ları da ölür; pasif hesap için token kullanılamaz', async () => {
    const token = await requestToken();
    env.users.docs[0].isActive = false;
    await expect(svc.confirmPasswordReset(token, NEW_PW)).rejects.toEqual(code('TOKEN_INVALID', 400));
    expect(user().tokenVersion).toBe(2);
  });

  it('e-posta doğrulama token\'ı parola sıfırlamada KULLANILAMAZ (amaç ayrımı)', async () => {
    await svc.issueEmailVerification({ _id: 'u1', email: 'ali.veli@example.test', emailVerified: false });
    const verifyToken = tokenFromMail(env.sent[0]);
    await expect(svc.confirmPasswordReset(verifyToken, NEW_PW)).rejects.toEqual(code('TOKEN_INVALID', 400));
    expect(user().tokenVersion).toBe(2);
  });

  it('denetim kaydı: password_reset.confirm ok (sub) / fail (yalnızca ip); token/parola/e-posta YOK', async () => {
    const token = await requestToken();
    await expect(svc.confirmPasswordReset('A'.repeat(43), NEW_PW, '203.0.113.7')).rejects.toBeDefined();
    await svc.confirmPasswordReset(token, NEW_PW, '203.0.113.7');
    await flushAudit();
    const confirms = audit.filter((r) => r.event === 'password_reset.confirm');
    expect(confirms.map((r) => [r.result, r.sub])).toEqual([['fail', undefined], ['ok', 'u1']]);
    const text = JSON.stringify(audit);
    for (const secret of [token, NEW_PW, 'ali.veli@example.test', hashToken(token)]) expect(text).not.toContain(secret);
  });
});

// =====================================================================================================================
describe('e-posta doğrulama', () => {
  it('kayıt sonrası: doğrulama token\'ı üretilir (yalnızca hash saklanır), e-posta PUBLIC_APP_URL bağlantısı + 24 saat; zaten doğrulanmışsa gönderilmez', async () => {
    const r = await svc.issueEmailVerification({ _id: 'u1', email: 'ali.veli@example.test', emailVerified: false }, { ip: '203.0.113.7' });
    expect(r).toEqual({ sent: true });
    const mail = env.sent[0];
    expect(mail.text).toContain('https://app.example.test/verify-email?token=');
    expect(mail.text).toContain('24 saat');
    const token = tokenFromMail(mail);
    expect(tokenDocs('email_verify')).toHaveLength(1);
    expect(tokenDocs()[0].tokenHash).toBe(hashToken(token));
    expect(tokenDocs()[0].expiresAt.getTime() - T0).toBe(24 * 3600 * 1000);
    expect(await svc.issueEmailVerification({ _id: 'u1', email: 'x@y.test', emailVerified: true })).toEqual({ sent: false, reason: 'already_verified' });
    expect(env.sent).toHaveLength(1);
  });

  it('PUBLIC_APP_URL yoksa issueEmailVerification açık hata (503) fırlatır; hiçbir token yazılmaz', async () => {
    delete process.env.PUBLIC_APP_URL;
    await expect(svc.issueEmailVerification({ _id: 'u1', email: 'ali.veli@example.test' })).rejects.toMatchObject({ statusCode: 503, code: 'EMAIL_NOT_CONFIGURED' });
    expect(tokenDocs()).toHaveLength(0);
    expect(env.sent).toHaveLength(0);
  });

  it('verifyEmail: emailVerified=true yazılır; token tek kullanımlık; girişten ENGEL YOK (alan yalnızca bilgi)', async () => {
    await svc.issueEmailVerification({ _id: 'u1', email: 'ali.veli@example.test', emailVerified: false });
    const token = tokenFromMail(env.sent[0]);
    expect(user().emailVerified).toBeUndefined();
    expect(await svc.verifyEmail(token, '203.0.113.7')).toEqual({ success: true });
    expect(user().emailVerified).toBe(true);
    expect(user().emailVerifiedAt).toEqual(new Date(T0));
    await expect(svc.verifyEmail(token)).rejects.toEqual(code('TOKEN_INVALID', 400));
    expect(user().tokenVersion).toBe(2); // doğrulama oturumları düşürmez
  });

  it('verifyEmail: süresi dolmuş / uydurma / biçimsiz / parola-sıfırlama token\'ı -> AYNI 400 TOKEN_INVALID', async () => {
    await svc.issueEmailVerification({ _id: 'u1', email: 'ali.veli@example.test', emailVerified: false });
    const token = tokenFromMail(env.sent[0]);
    const { email, baseUrl } = svc.prepareResetRequest('ali.veli@example.test');
    await svc.executeResetRequest(email, baseUrl);
    const resetToken = tokenFromMail(env.sent[1]);
    clock += 24 * 3600 * 1000;
    const errs: any[] = [];
    for (const t of [token, resetToken, 'B'.repeat(43), 'kisa', { $ne: null }, undefined]) {
      try { await svc.verifyEmail(t); errs.push(null); } catch (e) { errs.push(e); }
    }
    for (const e of errs) expect(e).toMatchObject({ statusCode: 400, code: 'TOKEN_INVALID', message: TOKEN_INVALID_MESSAGE });
    expect(user().emailVerified).toBeUndefined();
  });

  it('resendVerification: kimlikli; 60 sn cooldown (429 COOLDOWN); zaten doğrulanmışsa alreadyVerified; principal yok 401', async () => {
    expect(await svc.resendVerification(principal(), '203.0.113.7')).toEqual({ success: true });
    expect(env.sent).toHaveLength(1);
    await expect(svc.resendVerification(principal())).rejects.toEqual(code('COOLDOWN', 429));
    expect(env.sent).toHaveLength(1);
    clock += TOKEN_RESEND_COOLDOWN_MS;
    expect(await svc.resendVerification(principal())).toEqual({ success: true });
    // yeni token eskisini geçersiz kılar
    await expect(svc.verifyEmail(tokenFromMail(env.sent[0]))).rejects.toEqual(code('TOKEN_INVALID', 400));
    await expect(svc.verifyEmail(tokenFromMail(env.sent[1]))).resolves.toEqual({ success: true });
    expect(await svc.resendVerification(principal())).toEqual({ success: true, alreadyVerified: true });
    await expect(svc.resendVerification(undefined)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('resendVerification: SMTP hatası 502 MAIL_FAILED (kimlikli çağrı; ayrıntı sızmaz); PUBLIC_APP_URL yoksa 503', async () => {
    env.mailSender.mockImplementation(async () => { throw new Error('smtp down: creds x'); });
    await expect(svc.resendVerification(principal())).rejects.toMatchObject({ statusCode: 502, code: 'MAIL_FAILED', message: expect.not.stringContaining('smtp') });
    delete process.env.PUBLIC_APP_URL;
    await expect(svc.resendVerification(principal())).rejects.toMatchObject({ statusCode: 503, code: 'EMAIL_NOT_CONFIGURED' });
  });

  it('denetim kaydı: email.verify ok (sub) / fail (yalnızca ip); token/e-posta YOK', async () => {
    await svc.issueEmailVerification({ _id: 'u1', email: 'ali.veli@example.test', emailVerified: false });
    const token = tokenFromMail(env.sent[0]);
    await expect(svc.verifyEmail('C'.repeat(43), '203.0.113.7')).rejects.toBeDefined();
    await svc.verifyEmail(token, '203.0.113.7');
    await flushAudit();
    expect(audit.map((r) => [r.event, r.result, r.sub])).toEqual([['email.verify', 'fail', undefined], ['email.verify', 'ok', 'u1']]);
    for (const secret of [token, 'ali.veli@example.test']) expect(JSON.stringify(audit)).not.toContain(secret);
  });
});

// =====================================================================================================================
describe('e-posta şablonları', () => {
  it('sade Türkçe; bağlantı PUBLIC_APP_URL\'den; sabit gerçek alan adı yok; kullanıcı verisi (ad/soyad) şablona girmez', async () => {
    process.env.PUBLIC_APP_URL = 'https://kurulum.example.test/panel';
    const { email, baseUrl } = svc.prepareResetRequest('ali.veli@example.test');
    await svc.executeResetRequest(email, baseUrl);
    await svc.issueEmailVerification({ _id: 'u1', email: 'ali.veli@example.test', emailVerified: false });
    for (const m of env.sent) {
      expect(m.text).toContain('https://kurulum.example.test/panel/');
      expect(m.text + m.html).not.toMatch(/entegrasyonik\.com|onrender|railway/i);
      expect(m.text + m.html).not.toMatch(/\bAli\b|\bVeli\b/);
    }
    expect(env.sent[0].subject).toBe('Entegrasyonik parola sıfırlama');
    expect(env.sent[1].subject).toBe('Entegrasyonik e-posta doğrulama');
  });
});

import { describe, it, expect, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import Security, { ApplicationError } from '../../../src/platform/core/security/Security';
import { makeReq, makeRes, signedToken, forgedToken, unsignedToken, tokenSignedWith, legacyStyleToken, nowSec, TEST_USER_ID } from './_helpers';

// Characterization: backend/src/api/Security.ts
// ADR-0001 adım 2-3 sonrası: [MEVCUT DAVRANIŞ] = hâlâ geçerli; [ADR-0001 adım N] = kasıtlı olarak değiştirilmiş/yeni davranış.
// Sırlar test-only (tests/setup/jwt-env.js); gerçek .env'e bağımlılık yok.

const sec = () => Security.getInstance();

describe('Security: singleton ve token üretimi', () => {
  it('[MEVCUT DAVRANIŞ] getInstance her zaman aynı örneği döner (name parametresi yok sayılır)', () => {
    expect(Security.getInstance('a')).toBe(Security.getInstance('b'));
  });

  it('[ADR-0001 adım 2] signSession HS256, exp = iat + 8 saat, asgari claim seti, iss/aud sabit üretir (eskiden exp YOKTU, yük kullanıcı belgesiydi)', () => {
    const before = nowSec();
    const token = sec().signSession({ sub: 'u1', tid: 7, role: 'ROLE_OWNER', ga: false, tv: 2 });
    const complete = jwt.decode(token, { complete: true })!;
    const d: any = complete.payload;
    expect(complete.header.alg).toBe('HS256');
    expect(Object.keys(d).sort()).toEqual(['aud', 'auth_time', 'exp', 'ga', 'iat', 'imp', 'iss', 'role', 'sub', 'tid', 'tv'].sort());
    expect(d).toMatchObject({ sub: 'u1', tid: 7, role: 'ROLE_OWNER', ga: false, tv: 2, imp: false, aud: 'web', iss: process.env.JWT_ISSUER });
    expect(d.exp - d.iat).toBe(8 * 3600);
    expect(d.auth_time).toBeGreaterThanOrEqual(before);
    expect(d.iat).toBeGreaterThanOrEqual(before);
  });

  it('[ADR-0001 adım 2] tid verilmezse (mağaza seçmemiş süper yönetici) claim hiç yazılmaz', () => {
    const d: any = jwt.decode(sec().signSession({ sub: 'adm', ga: true, tv: 0 }));
    expect('tid' in d).toBe(false);
    expect(d.ga).toBe(true);
  });

  it('[ADR-0001 adım 2] token yalnızca env\'deki JWT_SECRET ile doğrulanır (imza sırrı artık kaynak koda gömülü değil)', () => {
    const token = sec().signSession({ sub: 'u1', ga: false, tv: 0 });
    expect(() => jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: ['HS256'] })).not.toThrow();
    expect((Security.getInstance() as any).accessTokenSecret).toBeUndefined();
  });

  it('[ADR-0001 adım 2] eski generateToken (rastgele yük imzalayan) ve decode (imza doğrulamayan) yöntemleri KALDIRILDI', () => {
    expect((Security.getInstance() as any).generateToken).toBeUndefined();
    expect((Security.getInstance() as any).decode).toBeUndefined();
    expect((Security as any).verifySecurityCookie).toBeUndefined();
  });
});

describe('Security: JWT_SECRET fail-fast (ADR-0001 adım 2)', () => {
  const saved = { s: process.env.JWT_SECRET, p: process.env.JWT_SECRET_PREVIOUS, i: process.env.JWT_ISSUER };
  afterEach(() => {
    process.env.JWT_SECRET = saved.s;
    if (saved.p === undefined) delete process.env.JWT_SECRET_PREVIOUS; else process.env.JWT_SECRET_PREVIOUS = saved.p;
    process.env.JWT_ISSUER = saved.i;
  });

  it('[ADR-0001 adım 2] JWT_SECRET tanımsızsa assertConfig hata fırlatır (süreç başlamaz); imzalama/doğrulama da fail-closed', () => {
    delete process.env.JWT_SECRET;
    expect(() => Security.assertConfig()).toThrow(/JWT_SECRET/);
    expect(() => sec().signSession({ sub: 'u', ga: false, tv: 0 })).toThrow(/JWT_SECRET/);
    expect(() => sec().verifyToken('a.b.c')).toThrow(/JWT_SECRET/);
  });

  it('[ADR-0001 adım 2] JWT_SECRET 32 bayttan kısaysa hata; boş string de hata; tam 32 bayt kabul', () => {
    process.env.JWT_SECRET = 'x'.repeat(31);
    expect(() => Security.assertConfig()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = '';
    expect(() => Security.assertConfig()).toThrow(/JWT_SECRET/);
    process.env.JWT_SECRET = 'x'.repeat(32);
    expect(() => Security.assertConfig()).not.toThrow();
  });

  it('[ADR-0001 adım 2] JWT_SECRET_PREVIOUS tanımlıysa o da >= 32 bayt olmalı (kısa eski sabit sır önceki-sır olarak sokulamaz)', () => {
    process.env.JWT_SECRET_PREVIOUS = 'kisa-onceki-sir-ornegi'; // 22 bayt
    expect(() => Security.assertConfig()).toThrow(/JWT_SECRET_PREVIOUS/);
  });

  it('[ADR-0001 adım 2] JWT_ISSUER boşsa varsayılan "entegrasyonik" kullanılır', () => {
    process.env.JWT_ISSUER = '';
    expect(Security.loadConfig().issuer).toBe('entegrasyonik');
  });

  it('[ADR-0001 adım 2] JWT_SECRET_PREVIOUS yalnızca DOĞRULAMADA kabul edilir; imzalama her zaman güncel sırla', () => {
    const prev = 'p'.repeat(48);
    const oldToken = tokenSignedWith(prev, { sub: TEST_USER_ID });
    expect(() => sec().verifyToken(oldToken)).toThrow('Token not verified'); // previous tanımsız
    process.env.JWT_SECRET_PREVIOUS = prev;
    expect(sec().verifyToken(oldToken).sub).toBe(TEST_USER_ID);
    const fresh = sec().signSession({ sub: 'u', ga: false, tv: 0 });
    expect(() => jwt.verify(fresh, prev)).toThrow();
    expect(() => jwt.verify(fresh, process.env.JWT_SECRET as string)).not.toThrow();
  });
});

describe('Security.verify (imza doğrulayan tek yol)', () => {
  const throwsWith = (fn: () => any) => { try { fn(); } catch (e) { return e as any; } return undefined; };
  const verifyCookie = (t: string) => sec().verify(makeReq({ cookies: { JWT_TOKEN: t } }));

  it('[MEVCUT DAVRANIŞ] token yoksa ApplicationError("Token is undefined", 401) fırlatır', () => {
    const err = throwsWith(() => sec().verify(makeReq({ cookies: {} })));
    expect(err).toBeInstanceOf(ApplicationError);
    expect(err.message).toBe('Token is undefined');
    expect(err.statusCode).toBe(401);
    expect(err.name).toBe('ApplicationError');
  });

  it('[MEVCUT DAVRANIŞ] sahte imzalı token için "Token not verified" 401', () => {
    const err = throwsWith(() => verifyCookie(forgedToken()));
    expect(err.message).toBe('Token not verified');
    expect(err.statusCode).toBe(401);
  });

  it('[MEVCUT DAVRANIŞ] imzasız (alg=none) token reddedilir', () => {
    expect(() => verifyCookie(unsignedToken())).toThrow('Token not verified');
  });

  it('[ADR-0001 adım 2] geçerli token doğrulanmış principal döner (sub, tid, role, ga, tv, imp, auth_time, iat, exp, iss, aud); eskiden payload aynen dönerdi', () => {
    const p = verifyCookie(signedToken({ tid: 3, role: 'ROLE_ADMIN', tv: 4 }));
    expect(p).toMatchObject({ sub: TEST_USER_ID, tid: 3, role: 'ROLE_ADMIN', ga: false, tv: 4, imp: false, aud: 'web', iss: process.env.JWT_ISSUER });
    expect(typeof p.exp).toBe('number');
    expect(typeof p.auth_time).toBe('number');
  });

  it('[ADR-0001 adım 2] süresi geçmiş token (exp) reddedilir', () => {
    expect(() => verifyCookie(signedToken({ iat: nowSec() - 9 * 3600, exp: nowSec() - 3600 }))).toThrow('Token not verified');
  });

  it('[ADR-0001 adım 2] exp claim\'i olmayan (süresiz) token reddedilir — sunucu sırrıyla imzalı olsa bile', () => {
    expect(() => verifyCookie(signedToken({ exp: undefined }))).toThrow('Token not verified');
  });

  it('[ADR-0001 adım 2] yanlış aud ("mcp", eksik) ve yanlış/eksik iss token\'ları reddedilir', () => {
    expect(() => verifyCookie(signedToken({ aud: 'mcp' }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ aud: undefined }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ iss: 'baska-yayinci' }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ iss: undefined }))).toThrow('Token not verified');
  });

  it('[ADR-0001 adım 2] HS256 dışı algoritma (HS512) sunucu sırrıyla imzalı olsa bile reddedilir (açık algoritma listesi)', () => {
    expect(() => verifyCookie(tokenSignedWith(process.env.JWT_SECRET as string, {}, 'HS512'))).toThrow('Token not verified');
  });

  it('[ADR-0001 adım 2] eski biçim token (kullanıcı belgesi yükü, exp yok, başka sırla imzalı) reddedilir', () => {
    const legacy = legacyStyleToken({ _id: 'u1', order: 3, isGlobalAdmin: true, roleCode: 'ROLE_OWNER', resources: ['x'] });
    expect(() => verifyCookie(legacy)).toThrow('Token not verified');
  });

  it('[ADR-0001 adım 2] zorunlu claim tipleri: sub string, tv sayı, ga boolean, auth_time sayı, tid tamsayı — biri bozuksa 401', () => {
    expect(() => verifyCookie(signedToken({ sub: undefined }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ sub: 12 }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ tv: '0' }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ tv: undefined }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ ga: 'true' }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ auth_time: undefined }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ tid: '3' }))).toThrow('Token not verified');
    expect(() => verifyCookie(signedToken({ tid: 1.5 }))).toThrow('Token not verified');
  });

  it('[ADR-0001 adım 2] logout çerez değeri "Signout" ve bozuk (JWT olmayan) token 401 (eskiden decode null dönerdi)', () => {
    expect(() => verifyCookie('Signout')).toThrow('Token not verified');
    expect(() => verifyCookie('not-a-jwt')).toThrow('Token not verified');
  });
});

describe('Security: sliding yenileme kuralı (ADR-0001 adım 4)', () => {
  const principalWith = (over: any) => sec().verifyToken(signedToken(over));

  it('[ADR-0001 adım 4] kalan süre >= 4 saat ise yenilenmez', () => {
    expect(Security.shouldRefresh(principalWith({}))).toBe(false); // kalan 8 saat
    expect(Security.shouldRefresh(principalWith({ exp: nowSec() + 4 * 3600 + 60 }))).toBe(false);
  });

  it('[ADR-0001 adım 4] kalan süre < 4 saat ve auth_time <= 7 gün ise yenilenir', () => {
    expect(Security.shouldRefresh(principalWith({ exp: nowSec() + 3 * 3600 }))).toBe(true);
    expect(Security.shouldRefresh(principalWith({ iat: nowSec() - 5 * 3600, exp: nowSec() + 3 * 3600, auth_time: nowSec() - 6 * 86400 }))).toBe(true);
  });

  it('[ADR-0001 adım 4] auth_time 7 günden eskiyse (ilk girişten >7 gün) yenilenmez: yeniden giriş', () => {
    expect(Security.shouldRefresh(principalWith({ exp: nowSec() + 3 * 3600, auth_time: nowSec() - 7 * 86400 - 60 }))).toBe(false);
  });

  it('[ADR-0001 adım 4] YENİLENEN token bile ilk girişten 7 günü AŞAMAZ: exp = min(şimdi+8s, auth_time+7g) (toplam oturum ≤ 7 gün)', () => {
    const authTime = nowSec() - (7 * 86400 - 3600); // 7 günün dolmasına 1 saat kaldı
    const renewed = sec().verifyToken(sec().signSession({ sub: 'u1', tid: 1, ga: false, tv: 0, auth_time: authTime }));
    expect(renewed.exp).toBe(authTime + 7 * 86400);
    expect(renewed.exp - nowSec()).toBeLessThanOrEqual(3600 + 2); // 8 saat DEĞİL, ~1 saat
    // exp zaten sınırdaysa yeniden yenilemenin anlamı yok
    expect(Security.shouldRefresh(renewed)).toBe(false);
  });

  it('[ADR-0001 adım 4] ilk girişten 6 gün 23 saat geçmişse ve token 3 saat sonra bitiyorsa yenilenmez (yenilenen exp mevcuttan ileri değil)', () => {
    expect(Security.shouldRefresh(principalWith({ exp: nowSec() + 3 * 3600, auth_time: nowSec() - (7 * 86400 - 3600) }))).toBe(false);
  });
});

describe('Security: token\'ın istekten okunması', () => {
  it('[MEVCUT DAVRANIŞ] cookie-parser çıktısı (req.cookies) Cookie header\'ından önceliklidir', () => {
    const d = sec().verify(makeReq({
      cookies: { JWT_TOKEN: signedToken({ tid: 1 }) },
      cookieHeader: 'JWT_TOKEN=' + signedToken({ tid: 2 }),
    }));
    expect(d.tid).toBe(1);
  });

  it('[MEVCUT DAVRANIŞ] req.cookies yoksa ham Cookie header\'ı regex ile parse edilir', () => {
    const t = signedToken({ tid: 5 });
    expect(sec().verify(makeReq({ cookieHeader: 'JWT_TOKEN=' + t })).tid).toBe(5);
    expect(sec().verify(makeReq({ cookieHeader: 'a=1; JWT_TOKEN=' + t + '; b=2' })).tid).toBe(5);
  });

  it('[MEVCUT DAVRANIŞ] "; " yerine ";" ile ayrılmış header\'da token BULUNAMAZ (regex başlangıç/boşluk şartı) -> "Token is undefined" 401', () => {
    // Şüpheli/tesadüfi: regex '(^| )' bekliyor; 'a=1;JWT_TOKEN=..' eşleşmez. BACKLOG'a "incelenmesi gereken" olarak eklendi (1g-T1).
    const t = signedToken({ tid: 5 });
    expect(sec().getSecurityToken(makeReq({ cookieHeader: 'a=1;JWT_TOKEN=' + t }))).toBeUndefined();
    expect(() => sec().verify(makeReq({ cookieHeader: 'a=1;JWT_TOKEN=' + t }))).toThrow('Token is undefined');
  });
});

describe('Security: cookie yardımcıları', () => {
  const origEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = origEnv;
  });

  it('[MEVCUT DAVRANIŞ] addSecurityCookie user yoksa hiçbir cookie basmaz (ADR-0001 sonrası _id\'siz kullanıcı için de)', () => {
    const res = makeRes();
    Security.addSecurityCookie(res, '/api', undefined);
    Security.addSecurityCookie(res, '/api', null);
    Security.addSecurityCookie(res, '/api', { email: 'x' });
    expect(res.cookies).toHaveLength(0);
  });

  it('[ADR-0001 adım 2] addSecurityCookie kullanıcı belgesini token\'a KOYMAZ: yalnızca asgari claim\'ler (parola özeti, resources, email vb. yok); eskiden belgenin tamamı (password hariç) girerdi', () => {
    const res = makeRes();
    Security.addSecurityCookie(res, '/api', {
      _id: 'u1', order: 4, password: 'HASH', roleCode: 'ROLE_OWNER', resources: ['r1'], email: 'a@b.c',
      tokenVersion: 3, isGlobalAdmin: false, failedLoginAttempts: 1,
    });
    expect(res.cookies).toHaveLength(1);
    expect(res.cookies[0].name).toBe('JWT_TOKEN');
    const d: any = jwt.decode(res.cookies[0].value);
    expect(Object.keys(d).sort()).toEqual(['aud', 'auth_time', 'exp', 'ga', 'iat', 'imp', 'iss', 'role', 'sub', 'tid', 'tv'].sort());
    expect(d).toMatchObject({ sub: 'u1', tid: 4, role: 'ROLE_OWNER', ga: false, tv: 3, imp: false });
    expect(res.cookies[0].value).not.toContain('HASH');
  });

  it('[ADR-0001 adım 2] süper yönetici (isGlobalAdmin) için tid claim\'i yazılmaz (kullanıcı belgesinde order olsa bile); ga=true', () => {
    const res = makeRes();
    Security.addSecurityCookie(res, '/api', { _id: 'adm', order: 9, isGlobalAdmin: true });
    const d: any = jwt.decode(res.cookies[0].value);
    expect('tid' in d).toBe(false);
    expect(d.ga).toBe(true);
  });

  it('[ADR-0001 adım 4] tokenVersion alanı olmayan (eski) kullanıcı tv=0 alır', () => {
    const res = makeRes();
    Security.addSecurityCookie(res, '/api', { _id: 'u', order: 1 });
    expect((jwt.decode(res.cookies[0].value) as any).tv).toBe(0);
  });

  it('[MEVCUT DAVRANIŞ] geliştirme (NODE_ENV=development veya tanımsız): httpOnly, secure=false, sameSite=lax, 8 saat, path=/', () => {
    for (const env of ['development', undefined]) {
      if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
      const res = makeRes();
      Security.addSecurityCookie(res, '/api', { _id: 'u' });
      expect(res.cookies[0].options).toEqual({ httpOnly: true, secure: false, sameSite: 'lax', maxAge: 28800000, path: '/' });
    }
  });

  it('[MEVCUT DAVRANIŞ] diğer ortamlarda: secure=true, sameSite=none', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    Security.addSecurityCookie(res, '/api', { _id: 'u' });
    expect(res.cookies[0].options).toEqual({ httpOnly: true, secure: true, sameSite: 'none', maxAge: 28800000, path: '/' });
  });

  it('[ADR-0027] SESSION_COOKIE_SAMESITE=lax (app./api. aynı site): üretimde sameSite=lax, secure=true, Domain YOK (host-only)', () => {
    const prev = process.env.SESSION_COOKIE_SAMESITE;
    process.env.NODE_ENV = 'production';
    process.env.SESSION_COOKIE_SAMESITE = 'lax';
    try {
      const res = makeRes();
      Security.addSecurityCookie(res, '/api', { _id: 'u' });
      expect(res.cookies[0].options).toEqual({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 28800000, path: '/' });
      expect('domain' in res.cookies[0].options).toBe(false);
      // none seçilirse geliştirmede bile secure zorunlu (tarayıcı SameSite=None'u Secure'suz reddeder)
      process.env.NODE_ENV = 'development';
      process.env.SESSION_COOKIE_SAMESITE = 'none';
      const res2 = makeRes();
      Security.addSecurityCookie(res2, '/api', { _id: 'u' });
      expect(res2.cookies[0].options).toMatchObject({ sameSite: 'none', secure: true });
    } finally {
      if (prev === undefined) delete process.env.SESSION_COOKIE_SAMESITE; else process.env.SESSION_COOKIE_SAMESITE = prev;
    }
  });

  it('[MEVCUT DAVRANIŞ] expireSecurityCookie "Signout" değerli, maxAge=0 cookie basar', () => {
    const res = makeRes();
    Security.expireSecurityCookie(res, '/api');
    expect(res.cookies[0].name).toBe('JWT_TOKEN');
    expect(res.cookies[0].value).toBe('Signout');
    expect(res.cookies[0].options.maxAge).toBe(0);
  });

  it('[ADR-0001 adım 4] setSessionCookie ile yenilenen token aynı auth_time\'ı korur, iat/exp tazelenir (eskiden verifySecurityCookie token içeriğini/iat\'ı olduğu gibi yeniden imzalar, exp eklemezdi)', () => {
    const oldAuth = nowSec() - 3 * 86400;
    const res = makeRes();
    Security.setSessionCookie(res, { sub: 'u1', tid: 2, role: 'R', ga: false, tv: 1, imp: false, auth_time: oldAuth });
    const d: any = jwt.decode(res.cookies[0].value);
    expect(d.auth_time).toBe(oldAuth);
    expect(d.exp - d.iat).toBe(8 * 3600);
    expect(res.cookies[0].options.maxAge).toBe(28800000);
  });

  it('[MEVCUT DAVRANIŞ] claimsFromUser tamsayı olmayan/eksik order için tid üretmez', () => {
    expect(Security.claimsFromUser({ _id: 'u', order: 'abc' }).tid).toBeUndefined();
    expect(Security.claimsFromUser({ _id: 'u' }).tid).toBeUndefined();
  });
});

describe('Security: parola özeti yardımcıları', () => {
  it('[MEVCUT DAVRANIŞ] hashPassword bcrypt özeti üretir (düz metin değil); comparePassword doğru/yanlış ayırır', async () => {
    const h = await sec().hashPassword('pw-test-1');
    expect(h).not.toBe('pw-test-1');
    expect(h.startsWith('$2')).toBe(true);
    expect(await sec().comparePassword('pw-test-1', h)).toBe(true);
    expect(await sec().comparePassword('pw-test-2', h)).toBe(false);
  });
});

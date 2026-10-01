// Ortak yardımcılar (yalnızca auth characterization testleri). DB/Redis/ağ YOK.
// JWT_SECRET/JWT_ISSUER jest setupFiles (tests/setup/jwt-env.js) ile test-only rastgele değerlerdir; gerçek .env'e bağımlı değil.
import jwt from 'jsonwebtoken';

export type Handler = (req: any, res: any) => Promise<void> | void;

/** ApiManager.configureApis'in kaydettiği handler'ları yakalayan sahte Express app. */
export function makeFakeApp() {
  const routes: Record<string, Handler> = {};
  return {
    routes,
    get: (path: string, ...h: Handler[]) => { routes['GET ' + path] = h[h.length - 1]; },
    post: (path: string, ...h: Handler[]) => { routes['POST ' + path] = h[h.length - 1]; },
  };
}

/** Minimal Express Response taklidi. */
export function makeRes(locals: any = {}) {
  const res: any = {
    locals,
    statusCode: undefined as number | undefined,
    body: undefined as any,
    cookies: [] as Array<{ name: string; value: string; options: any }>,
  };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.send = (b: any) => { res.body = b; return res; };
  res.cookie = (name: string, value: string, options: any) => { res.cookies.push({ name, value, options }); return res; };
  return res;
}

export function makeReq(opts: { cookies?: any; cookieHeader?: string; body?: any; params?: any; method?: string; path?: string } = {}) {
  return {
    cookies: opts.cookies,
    headers: opts.cookieHeader ? { cookie: opts.cookieHeader } : {},
    body: opts.body,
    params: opts.params || {},
    method: opts.method || 'GET',
    path: opts.path || '/',
  } as any;
}

export const TEST_USER_ID = '507f1f77bcf86cd799439011';

export const nowSec = () => Math.floor(Date.now() / 1000);

/** Geçerli (sunucunun üreteceği biçimde) claim seti; `over` ile ezilir (undefined değer claim'i düşürür). */
export function validClaims(over: Record<string, any> = {}): Record<string, any> {
  const now = nowSec();
  const claims: Record<string, any> = {
    sub: TEST_USER_ID, tid: 3, role: 'ROLE_OWNER', ga: false, tv: 0, imp: false,
    auth_time: now, iat: now, exp: now + 8 * 3600,
    iss: process.env.JWT_ISSUER, aud: 'web',
    ...over,
  };
  for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k];
  return claims;
}

/** Test-only JWT_SECRET ile HS256 imzalı token. */
export function signedToken(over: Record<string, any> = {}): string {
  return jwt.sign(validClaims(over), process.env.JWT_SECRET as string, { algorithm: 'HS256' });
}

/** Belirtilen sırla imzalı token (rastgele/başka sır senaryoları için). */
export function tokenSignedWith(secret: string, over: Record<string, any> = {}, algorithm: 'HS256' | 'HS512' = 'HS256'): string {
  return jwt.sign(validClaims(over), secret, { algorithm });
}

/** Sunucu sırrından FARKLI rastgele bir anahtarla imzalanmış (sahte imzalı) token. */
export function forgedToken(over: Record<string, any> = {}): string {
  return tokenSignedWith('test-only-not-the-server-key-' + Math.random() + '-' + Math.random(), over);
}

/** alg=none, imza kısmı boş (tamamen imzasız) token. */
export function unsignedToken(over: Record<string, any> = {}): string {
  const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(validClaims(over)) + '.';
}

/** Eski (ADR öncesi) biçimde token: kullanıcı belgesi yükü, exp YOK; rastgele başka sırla imzalı (gerçek eski sır kullanılmaz). */
export function legacyStyleToken(payload: object): string {
  return jwt.sign(payload, 'test-only-legacy-style-' + Math.random() + '-' + Math.random());
}

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '@config';
import { ApplicationError } from '@platform/core/errors';

// ADR-0010 madde 4/8 + ADR-0035 Karar 2: OAuth access token (HS256, 15 dk). Web cerez JWT'sinden AYRI sirla (`JWT_OAUTH_SECRET`) imzalanir ve
// baslikta `kid` tasir (aud denetiminde olasi bir hata web ve Bearer token'larini birbirine cevirmesin). `ga` ve `imp` claim'leri bu token'lara
// HICBIR KOSULDA girmez (impersonation/platform yetkisi MCP'de yapisal olarak imkansiz). `aud` = MCP kaynak URI'si (RFC 8707).

export const OAUTH_ACCESS_TTL_SECONDS = 15 * 60;
export const OAUTH_KID_CURRENT = 'oa1';
export const OAUTH_KID_PREVIOUS = 'oa0';
export const OAUTH_SCOPES = ['mcp:read', 'mcp:write'] as const;
export type OAuthScope = typeof OAUTH_SCOPES[number];

export interface OAuthAccessClaimsInput {
    sub: string;
    tid: number;
    role?: string;
    tv: number;
    cid: string;
    scope: ReadonlyArray<OAuthScope>;
    fam: string;
    aud: string;
}

/** Dogrulanmis access token icerigi. `role` yalniz bilgi amaclidir (MCP-3 her cagrida guncel `can()` ile yeniden kesistirir). */
export interface OAuthPrincipal {
    sub: string;
    tid: number;
    role?: string;
    tv: number;
    cid: string;
    scope: OAuthScope[];
    fam: string;
    aud: string;
    iat: number;
    exp: number;
    iss: string;
}

/** MCP kapali ya da sir yoksa/kisa ise `undefined` (MCP kapali). */
export function oauthSecrets(): { current: string; previous?: string } | undefined {
    const { enabled, oauthSecret, oauthSecretPrevious } = config.mcp;
    if (!enabled || !oauthSecret || Buffer.byteLength(oauthSecret, 'utf8') < 32) return undefined;
    const previous = oauthSecretPrevious && Buffer.byteLength(oauthSecretPrevious, 'utf8') >= 32 ? oauthSecretPrevious : undefined;
    return { current: oauthSecret, previous };
}

export function isMcpEnabled(): boolean { return oauthSecrets() !== undefined; }

function requireSecrets() {
    const s = oauthSecrets();
    if (!s) throw new Error('[oauth] MCP kapali veya JWT_OAUTH_SECRET gecersiz.');
    return s;
}

export function signOAuthAccessToken(claims: OAuthAccessClaimsInput, nowMs: number = Date.now()): string {
    const s = requireSecrets();
    const now = Math.floor(nowMs / 1000);
    // `ga`/`imp` KASITLI olarak yok. Yalniz asagidaki alanlar yazilir.
    const payload = {
        sub: claims.sub, tid: claims.tid, role: claims.role, tv: claims.tv, cid: claims.cid,
        scope: claims.scope.join(' '), fam: claims.fam, iat: now, exp: now + OAUTH_ACCESS_TTL_SECONDS, iss: config.auth.jwtIssuer, aud: claims.aud,
    };
    return jwt.sign(payload, s.current, { algorithm: 'HS256', keyid: OAUTH_KID_CURRENT });
}

/** Imza dogrulanmadan ONCE yalniz anahtar secimi icin baslik `kid`'i okunur (karar/claim okunmaz). */
function headerKid(token: string): string | undefined {
    const seg = token.split('.')[0];
    if (!seg) return undefined;
    try {
        const h = JSON.parse(Buffer.from(seg, 'base64url').toString('utf8')) as { kid?: unknown };
        return typeof h.kid === 'string' ? h.kid : undefined;
    } catch { return undefined; }
}

function unauthorized(): ApplicationError { return new ApplicationError('Token not verified', 401); }

/**
 * Bearer (OAuth) access token'i dogrular: `kid` ile sir secimi, HS256, exp/iss/aud ZORUNLU, claim tipleri; `ga`/`imp` tasiyan token REDDEDILIR.
 * `expectedAud`: bu ucun kaynak tanitici (MCP: `config.mcp.resourceUri`). Web cerezi (farkli sir + `aud:web`) burada gecmez.
 */
export function verifyOAuthAccessToken(token: string, expectedAud: string): OAuthPrincipal {
    const s = oauthSecrets();
    if (!s || typeof token !== 'string' || token.length > 4096) throw unauthorized();
    const kid = headerKid(token);
    const secret = kid === OAUTH_KID_CURRENT ? s.current : kid === OAUTH_KID_PREVIOUS ? s.previous : undefined;
    if (!secret) throw unauthorized();
    let p: any;
    try {
        p = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: config.auth.jwtIssuer, audience: expectedAud });
    } catch { throw unauthorized(); }
    if (!p || typeof p !== 'object' || typeof p.sub !== 'string' || !p.sub || !Number.isInteger(p.tid) || !Number.isInteger(p.tv)
        || typeof p.cid !== 'string' || typeof p.fam !== 'string' || typeof p.scope !== 'string'
        || typeof p.exp !== 'number' || typeof p.iat !== 'number' || 'ga' in p || 'imp' in p) throw unauthorized();
    const scope = p.scope.split(' ').filter((x: string): x is OAuthScope => (OAUTH_SCOPES as readonly string[]).includes(x));
    if (scope.length === 0) throw unauthorized();
    return { sub: p.sub, tid: p.tid, role: typeof p.role === 'string' ? p.role : undefined, tv: p.tv, cid: p.cid, scope, fam: p.fam, aud: p.aud, iat: p.iat, exp: p.exp, iss: p.iss };
}

/** Opak rastgele belirtec (>=32 bayt; base64url). */
export function randomToken(bytes = 32): string { return crypto.randomBytes(bytes).toString('base64url'); }

/** Saklanan ozet (yuksek entropili belirtec icin yavas/tuzlu ozet gerekmez). */
export function sha256Hex(v: string): string { return crypto.createHash('sha256').update(v, 'utf8').digest('hex'); }

/** PKCE S256: BASE64URL(SHA256(verifier)) === challenge (zamanlama-guvenli karsilastirma). */
export function pkceS256Matches(verifier: string, challenge: string): boolean {
    const computed = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
    const a = Buffer.from(computed); const b = Buffer.from(challenge);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

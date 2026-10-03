// Google ile giriş/kayıt (docs/GOOGLE_SIGN_IN.md): Google Identity Services ID token (JWT, RS256) doğrulaması + kayıt belirteci.
//
// Yeni bağımlılık YOK: imza `crypto.createPublicKey({ key: jwk, format: 'jwk' })` + `crypto.verify`. Google JWKS
// (`https://www.googleapis.com/oauth2/v3/certs`) `Cache-Control: max-age`'e göre bellekte tutulur; bilinmeyen `kid` en çok
// dakikada bir yeniden çekim tetikler (saldırganın JWKS isteği çoğaltması engellenir). Giden istek K7 izin listesinden
// (`google-auth`) geçer ve yerelde egress guard'da `EGRESS_ALLOW_GOOGLE_AUTH=1` olmadan zaten çıkamaz.
// Sır/token/JWKS gövdesi loga ve hata iletisine ASLA girmez; tüm doğrulama hataları tek genel iletiyle (GOOGLE_TOKEN_INVALID) döner.
import crypto from 'crypto';
import https from 'https';
import jwt from 'jsonwebtoken';
import { ApplicationError } from '@platform/core/errors';
import Security from '@platform/core/security/Security';
import { assertAllowedOutboundHost } from '@integration/modules/common/security/outboundHosts';

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_ISSUERS: readonly string[] = ['accounts.google.com', 'https://accounts.google.com'];
export const GOOGLE_CLOCK_SKEW_SECONDS = 60;
export const GOOGLE_SIGNUP_AUDIENCE = 'google-signup';
export const GOOGLE_SIGNUP_TTL_SECONDS = 15 * 60;

const MAX_CREDENTIAL_LENGTH = 8192;
const JWKS_MIN_TTL_SECONDS = 60;
const JWKS_MAX_TTL_SECONDS = 24 * 60 * 60;
const JWKS_DEFAULT_TTL_SECONDS = 60 * 60;
const JWKS_UNKNOWN_KID_REFETCH_MS = 60_000;
const JWKS_MAX_BODY_BYTES = 64 * 1024;
const JWKS_TIMEOUT_MS = 5000;

export const tokenInvalid = (): ApplicationError => new ApplicationError('Google doğrulaması başarısız.', 401, 'GOOGLE_TOKEN_INVALID');

export interface GoogleIdentity {
    sub: string;
    /** Küçük harfe normalize, kırpılmış. */
    email: string;
    name: string;
    givenName?: string;
    familyName?: string;
    picture?: string;
}

// --- JWKS ---

export interface JwksResponse { status: number; body: string; cacheControl?: string }
export type JwksFetcher = (url: string) => Promise<JwksResponse>;

/** Varsayılan çekici: yalnız GET, https, boyut/süre sınırlı. Ağ yalnız gerçek çalışmada kullanılır (testler çekici enjekte eder). */
export const defaultJwksFetcher: JwksFetcher = (url) => new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: JWKS_TIMEOUT_MS, headers: { Accept: 'application/json' } }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
            size += c.length;
            if (size > JWKS_MAX_BODY_BYTES) { req.destroy(new Error('jwks too large')); return; }
            chunks.push(c);
        });
        res.on('end', () => resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            cacheControl: typeof res.headers['cache-control'] === 'string' ? res.headers['cache-control'] : undefined,
        }));
        res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('jwks timeout')));
    req.on('error', reject);
});

export function parseMaxAgeSeconds(cacheControl: string | undefined): number {
    const m = /max-age\s*=\s*(\d{1,9})/i.exec(cacheControl ?? '');
    const n = m ? Number(m[1]) : JWKS_DEFAULT_TTL_SECONDS;
    return Math.min(JWKS_MAX_TTL_SECONDS, Math.max(JWKS_MIN_TTL_SECONDS, n));
}

export class GoogleJwksCache {
    private keys = new Map<string, crypto.KeyObject>();
    private expiresAt = 0;
    private lastFetchAt = 0;
    private inflight?: Promise<void>;

    constructor(private readonly fetcher: JwksFetcher = defaultJwksFetcher, private readonly url: string = GOOGLE_JWKS_URL, private readonly nowFn: () => number = Date.now) { }

    async getKey(kid: string): Promise<crypto.KeyObject | undefined> {
        const now = this.nowFn();
        const fresh = now < this.expiresAt;
        if (fresh && this.keys.has(kid)) return this.keys.get(kid);
        // süresi dolduysa her durumda; bilinmeyen kid'de yalnız son çekimden >= 1 dk sonra yeniden çek
        if (!fresh || now - this.lastFetchAt >= JWKS_UNKNOWN_KID_REFETCH_MS) await this.refresh();
        return this.keys.get(kid);
    }

    private refresh(): Promise<void> {
        if (!this.inflight) {
            this.inflight = this.doRefresh().finally(() => { this.inflight = undefined; });
        }
        return this.inflight;
    }

    private async doRefresh(): Promise<void> {
        assertAllowedOutboundHost('google-auth', this.url); // K7: yalnız izinli host; izinli değilse istek ATILMAZ
        this.lastFetchAt = this.nowFn();
        let res: JwksResponse;
        try { res = await this.fetcher(this.url); } catch { throw tokenInvalid(); }
        if (res.status !== 200) throw tokenInvalid();
        let doc: any;
        try { doc = JSON.parse(res.body); } catch { throw tokenInvalid(); }
        if (!doc || !Array.isArray(doc.keys)) throw tokenInvalid();
        const next = new Map<string, crypto.KeyObject>();
        for (const jwk of doc.keys) {
            if (!jwk || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || (jwk.alg !== undefined && jwk.alg !== 'RS256') || (jwk.use !== undefined && jwk.use !== 'sig')) continue;
            try { next.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })); } catch { /* bozuk anahtar atlanır */ }
        }
        if (next.size === 0) throw tokenInvalid();
        this.keys = next;
        this.expiresAt = this.nowFn() + parseMaxAgeSeconds(res.cacheControl) * 1000;
    }
}

let defaultCache: GoogleJwksCache | undefined;
export function getDefaultJwksCache(): GoogleJwksCache {
    return (defaultCache ??= new GoogleJwksCache());
}
/** Yalnız test: varsayılan JWKS önbelleği yerine sahte çekicili örnek kullanılır (ağ YOK). */
export function setGoogleJwksCacheForTests(cache: GoogleJwksCache | undefined): void { defaultCache = cache; }

// --- ID token doğrulama ---

const b64urlJson = (s: string): any => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export interface VerifyOptions {
    clientId: string;
    jwks?: Pick<GoogleJwksCache, 'getKey'>;
    nowMs?: number;
}

/**
 * RS256 imza (Google JWKS), `aud === clientId`, `iss ∈ GOOGLE_ISSUERS`, `exp`/`iat` (±60 sn tolerans), `email_verified === true`.
 * Geçersizse `GOOGLE_TOKEN_INVALID` (401); e-posta doğrulanmamışsa `GOOGLE_EMAIL_UNVERIFIED` (403). Hata iletisi token içeriği taşımaz.
 */
export async function verifyGoogleIdToken(credential: unknown, opts: VerifyOptions): Promise<GoogleIdentity> {
    if (typeof credential !== 'string' || credential.length === 0 || credential.length > MAX_CREDENTIAL_LENGTH) throw tokenInvalid();
    const parts = credential.split('.');
    if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw tokenInvalid();

    let header: any; let payload: any;
    try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); } catch { throw tokenInvalid(); }
    if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || !payload || typeof payload !== 'object') throw tokenInvalid();

    const key = await (opts.jwks ?? getDefaultJwksCache()).getKey(header.kid);
    if (!key) throw tokenInvalid();
    let sigOk = false;
    try { sigOk = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url')); } catch { sigOk = false; }
    if (!sigOk) throw tokenInvalid();

    const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
    if (payload.aud !== opts.clientId || !opts.clientId) throw tokenInvalid();
    if (typeof payload.iss !== 'string' || !GOOGLE_ISSUERS.includes(payload.iss)) throw tokenInvalid();
    if (typeof payload.exp !== 'number' || payload.exp + GOOGLE_CLOCK_SKEW_SECONDS < now) throw tokenInvalid();
    if (typeof payload.iat !== 'number' || payload.iat - GOOGLE_CLOCK_SKEW_SECONDS > now) throw tokenInvalid();
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) throw tokenInvalid();
    if (typeof payload.email !== 'string' || !payload.email || payload.email.length > 254) throw tokenInvalid();
    if (payload.email_verified !== true) throw new ApplicationError('Google e-posta adresi doğrulanmamış.', 403, 'GOOGLE_EMAIL_UNVERIFIED');

    const str = (v: unknown, max = 200): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
    const email = payload.email.trim().toLowerCase();
    return {
        sub: payload.sub,
        email,
        name: str(payload.name) ?? email.split('@')[0],
        givenName: str(payload.given_name),
        familyName: str(payload.family_name),
        picture: typeof payload.picture === 'string' && /^https:\/\//.test(payload.picture) ? payload.picture.slice(0, 500) : undefined,
    };
}

// --- Kayıt belirteci (signupToken) ---
// Mevcut JWT sırrıyla, AYRI `aud` (`google-signup`) ve `typ`: oturum doğrulayıcısı `aud:'web'` zorunlu kıldığından oturum belirteci olarak ASLA geçmez.

export interface GoogleSignupClaims { email: string; name: string; givenName?: string; familyName?: string; sub: string }

export function signGoogleSignupToken(id: GoogleIdentity, nowMs: number = Date.now()): string {
    const cfg = Security.loadConfig();
    const now = Math.floor(nowMs / 1000);
    const payload: Record<string, unknown> = {
        typ: GOOGLE_SIGNUP_AUDIENCE, email: id.email, name: id.name, gsub: id.sub,
        ...(id.givenName ? { given_name: id.givenName } : {}), ...(id.familyName ? { family_name: id.familyName } : {}),
        iat: now, exp: now + GOOGLE_SIGNUP_TTL_SECONDS, iss: cfg.issuer, aud: GOOGLE_SIGNUP_AUDIENCE,
    };
    return jwt.sign(payload, cfg.secret, { algorithm: 'HS256', header: { alg: 'HS256', typ: GOOGLE_SIGNUP_AUDIENCE } as any });
}

const signupInvalid = () => new ApplicationError('Google kayıt oturumu geçersiz veya süresi dolmuş. Lütfen Google ile tekrar deneyin.', 400, 'TOKEN_INVALID');

export function verifyGoogleSignupToken(token: unknown, nowMs: number = Date.now()): GoogleSignupClaims {
    if (typeof token !== 'string' || !token || token.length > MAX_CREDENTIAL_LENGTH) throw signupInvalid();
    const cfg = Security.loadConfig();
    const opts: jwt.VerifyOptions = { algorithms: ['HS256'], issuer: cfg.issuer, audience: GOOGLE_SIGNUP_AUDIENCE, clockTimestamp: Math.floor(nowMs / 1000) };
    let p: any;
    try {
        try { p = jwt.verify(token, cfg.secret, opts); } catch (err: any) {
            if (cfg.previous && err && err.message === 'invalid signature') p = jwt.verify(token, cfg.previous, opts); else throw err;
        }
    } catch { throw signupInvalid(); }
    if (!p || p.typ !== GOOGLE_SIGNUP_AUDIENCE || typeof p.email !== 'string' || !p.email || typeof p.gsub !== 'string' || !p.gsub) throw signupInvalid();
    return {
        email: p.email.trim().toLowerCase(), name: typeof p.name === 'string' ? p.name : '', sub: p.gsub,
        ...(typeof p.given_name === 'string' ? { givenName: p.given_name } : {}), ...(typeof p.family_name === 'string' ? { familyName: p.family_name } : {}),
    };
}

// --- Authorization code (GIS `initCodeClient`, popup) -> id_token ---
// Sunucudan Google token ucuna POST (redirect_uri 'postmessage'). Yalnız `id_token` alinir ve verifyGoogleIdToken ile dogrulanir;
// access_token/refresh_token SAKLANMAZ/LOGLANMAZ. Hata yaniti (invalid_grant vb.) govdesi yansitilmaz -> GOOGLE_TOKEN_INVALID.
export type TokenPoster = (url: string, form: string) => Promise<{ status: number; body: string }>;

const TOKEN_MAX_BODY_BYTES = 64 * 1024;
const TOKEN_TIMEOUT_MS = 8000;

export const defaultTokenPoster: TokenPoster = (url, form) => new Promise((resolve, reject) => {
    const req = https.request(url, {
        method: 'POST', timeout: TOKEN_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form), Accept: 'application/json' },
    }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
            size += c.length;
            if (size > TOKEN_MAX_BODY_BYTES) { req.destroy(new Error('token response too large')); return; }
            chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('token timeout')));
    req.on('error', reject);
    req.end(form);
});

export async function exchangeGoogleCode(code: unknown, opts: { clientId: string; clientSecret: string; poster?: TokenPoster }): Promise<string> {
    if (typeof code !== 'string' || !code || code.length > 2048) throw tokenInvalid();
    assertAllowedOutboundHost('google-auth', GOOGLE_TOKEN_URL); // K7: izinli degilse istek ATILMAZ
    const form = new URLSearchParams({
        code, client_id: opts.clientId, client_secret: opts.clientSecret, redirect_uri: 'postmessage', grant_type: 'authorization_code',
    }).toString();
    let res: { status: number; body: string };
    try { res = await (opts.poster ?? defaultTokenPoster)(GOOGLE_TOKEN_URL, form); } catch { throw tokenInvalid(); }
    if (res.status !== 200) throw tokenInvalid();
    let doc: any;
    try { doc = JSON.parse(res.body); } catch { throw tokenInvalid(); }
    if (!doc || typeof doc.id_token !== 'string' || !doc.id_token) throw tokenInvalid();
    return doc.id_token;
}

let defaultPoster: TokenPoster | undefined;
export function getDefaultTokenPoster(): TokenPoster | undefined { return defaultPoster; }
/** Yalniz test: sahte token ucu (ag YOK). */
export function setGoogleTokenPosterForTests(p: TokenPoster | undefined): void { defaultPoster = p; }

import crypto from 'crypto';
import { getMockHmacSecret } from './mockSecret';

// ADR-0008 §1 (MockPaymentProvider "hosted checkout" sayfası) + ADR-0014 S4a.
//
// Mock checkout sayfası ve dev tetikleyicisi için: (1) etkinlik kapısı, (2) İMZALI + TEK KULLANIMLIK + süreli token.
//
// Etkinlik kapısı (`isMockCheckoutEnabled`): yalnızca `PAYMENT_PROVIDER=mock` (varsayılan) VE `PAYMENT_ENV!=live` VE
// `NODE_ENV!=='production'` iken açıktır (ADR-0008 §1: "yalnızca NODE_ENV!==production iken açılan dev tetikleyicisi").
// Aksi hâlde rotalar 404 döner (varlıkları sızmaz).
//
// Token: `base64url(JSON{ref, exp, n}) . hex(HMAC-SHA256(BILLING_MOCK_HMAC_SECRET, "mock-checkout:v1:" + payloadB64))`.
//  - Webhook imzasıyla AYNI sır (ADR-0008 "mock HMAC sırrı .env'de"), ama ALAN AYRIMLI önek: bir webhook gövde imzası token
//    olarak (ve tersi) kullanılamaz.
//  - `ref` = providerSubscriptionRef'e bağlıdır: başka bir checkout oturumunda kullanılamaz (CSRF/karışıklık).
//  - Sabit zamanlı imza karşılaştırması; süre (TTL) dolunca reddedilir.
//  - TEK KULLANIM (replay): `consumeCheckoutToken` nonce'u süreç-içi kümeye yazar; ikinci kullanım reddedilir. Mock sağlayıcının
//    kendisi de süreç-içi durum tuttuğundan (MockPaymentProvider.subscriptions) küme de süreç-içidir — çok replikalı çalışma
//    mock'un kapsamı DIŞINDADIR (yalnızca dev/local).
//  - Token'ın sırrı/ham imzası loglanmaz.

export const CHECKOUT_TOKEN_TTL_MS = 15 * 60 * 1000;
const DOMAIN = 'mock-checkout:v1:';
const MAX_USED = 10_000;

export type TokenFailure = 'malformed' | 'bad_signature' | 'expired' | 'ref_mismatch' | 'replayed';
export type TokenResult = { ok: true; nonce: string; exp: number } | { ok: false; reason: TokenFailure };

/** nonce -> exp (ms). Yalnızca tüketilen (kullanılmış) token'lar; süresi geçenler temizlenir. */
const used = new Map<string, number>();

export function isMockCheckoutEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    const provider = (env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase();
    const paymentEnv = (env.PAYMENT_ENV || 'sandbox').trim().toLowerCase();
    return provider === 'mock' && paymentEnv !== 'live' && env.NODE_ENV !== 'production';
}

function sign(payloadB64: string): string {
    return crypto.createHmac('sha256', getMockHmacSecret()).update(DOMAIN + payloadB64).digest('hex');
}

export function mintCheckoutToken(providerRef: string, now: number = Date.now()): string {
    const payload = { ref: providerRef, exp: now + CHECKOUT_TOKEN_TTL_MS, n: crypto.randomBytes(12).toString('hex') };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${payloadB64}.${sign(payloadB64)}`;
}

/** İmza + süre + ref bağı doğrulanır; nonce'u TÜKETMEZ (GET sayfası için). Kullanılmış nonce de reddedilir. */
export function verifyCheckoutToken(token: unknown, providerRef: string, now: number = Date.now()): TokenResult {
    if (typeof token !== 'string' || token.length > 1024) return { ok: false, reason: 'malformed' };
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
    const [payloadB64, sig] = parts;

    const expected = Buffer.from(sign(payloadB64), 'utf8');
    const provided = Buffer.from(sig, 'utf8');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return { ok: false, reason: 'bad_signature' };

    let payload: any;
    try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
    if (!payload || typeof payload.ref !== 'string' || typeof payload.n !== 'string' || typeof payload.exp !== 'number') return { ok: false, reason: 'malformed' };
    if (payload.ref !== providerRef) return { ok: false, reason: 'ref_mismatch' };
    if (now > payload.exp) return { ok: false, reason: 'expired' };
    if (used.has(payload.n)) return { ok: false, reason: 'replayed' };
    return { ok: true, nonce: payload.n, exp: payload.exp };
}

/** Doğrular VE nonce'u atomik (tek senkron blok) tüketir; aynı token ikinci kez `replayed` döner. */
export function consumeCheckoutToken(token: unknown, providerRef: string, now: number = Date.now()): TokenResult {
    const r = verifyCheckoutToken(token, providerRef, now);
    if (!r.ok) return r;
    if (used.size >= MAX_USED) {
        for (const [n, exp] of used) if (exp < now) used.delete(n);
    }
    used.set(r.nonce, r.exp);
    return r;
}

/** Yalnızca testler için. */
export function resetCheckoutTokensForTests(): void {
    used.clear();
    usedDevNonces.clear();
}

// ---------------------------------------------------------------------------------------------------------------------
// Dev tetikleyici isteği imzası (POST /api/billing/mock/simulate): gövde, webhook'la AYNI sırrla ama AYRI alan önekiyle
// (`mock-dev-simulate:v1:`) HMAC'lenir -> webhook imzası bu uçta, bu imza da webhook'ta GEÇERSİZ. Gövde `{providerRef, scenario,
// nonce, iat}`; `iat` ±5 dk, `nonce` tek kullanımlık (replay). Sır ağ üzerinden gitmez (yalnızca imza).
// ---------------------------------------------------------------------------------------------------------------------
const DEV_DOMAIN = 'mock-dev-simulate:v1:';
export const DEV_REQUEST_SKEW_MS = 5 * 60 * 1000;
const usedDevNonces = new Map<string, number>();

export function signDevRequest(rawBody: Buffer | string): string {
    const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    return crypto.createHmac('sha256', getMockHmacSecret()).update(DEV_DOMAIN).update(buf).digest('hex');
}

export type DevRequestResult =
    | { ok: true; providerRef: string; scenario: string }
    | { ok: false; reason: 'bad_signature' | 'malformed' | 'stale' | 'replayed' };

export function verifyAndConsumeDevRequest(rawBody: Buffer, signature: unknown, now: number = Date.now()): DevRequestResult {
    if (typeof signature !== 'string' || !signature) return { ok: false, reason: 'bad_signature' };
    const expected = Buffer.from(signDevRequest(rawBody), 'utf8');
    const provided = Buffer.from(signature, 'utf8');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return { ok: false, reason: 'bad_signature' };

    let body: any;
    try { body = JSON.parse(rawBody.toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
    if (!body || typeof body.providerRef !== 'string' || typeof body.scenario !== 'string'
        || typeof body.nonce !== 'string' || body.nonce.length < 8 || body.nonce.length > 64 || typeof body.iat !== 'number') {
        return { ok: false, reason: 'malformed' };
    }
    if (Math.abs(now - body.iat) > DEV_REQUEST_SKEW_MS) return { ok: false, reason: 'stale' };
    if (usedDevNonces.has(body.nonce)) return { ok: false, reason: 'replayed' };
    if (usedDevNonces.size >= MAX_USED) {
        for (const [n, exp] of usedDevNonces) if (exp < now) usedDevNonces.delete(n);
    }
    usedDevNonces.set(body.nonce, body.iat + DEV_REQUEST_SKEW_MS);
    return { ok: true, providerRef: body.providerRef, scenario: body.scenario };
}

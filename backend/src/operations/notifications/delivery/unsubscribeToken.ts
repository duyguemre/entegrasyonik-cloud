// ADR-0029 Karar 4 (NB5): abonelikten cikma belirteci -- HMAC-SHA256 imzali `{t:tid,u:userId,c:category,e:expEpochSec}`.
// Anahtar: env `NOTIFY_UNSUB_SECRET` (FIELD_ENCRYPTION_KEYS'ten turetilmez). Dogrulama sabit-zamanli; hata nedeni cagirana
// yalniz sabit sinif olarak doner (oracle yok). Belirtec HTTP'de sorgu dizesinde tasinir: tek amacli (yalniz tercih kapatma), sureli.
import { createHmac, timingSafeEqual } from 'crypto';

export const UNSUB_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 gun (e-posta gec acilabilir)
/** '*' = "bu ozet e-postasindan cik": tum zorunlu-olmayan kategorilerde e-posta kapanir. */
export const UNSUB_ALL = '*';
export const MIN_SECRET_LENGTH = 32;

export interface UnsubPayload { tid: number; userId: string; category: string }
export type UnsubVerify = { ok: true; payload: UnsubPayload; exp: number } | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

const b64u = (b: Buffer) => b.toString('base64url');
const sign = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest();

export function isUsableSecret(secret: string | undefined): secret is string { return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH; }

export function signUnsubscribeToken(secret: string, p: UnsubPayload, now: Date, ttlMs = UNSUB_TOKEN_TTL_MS): string {
    if (!isUsableSecret(secret)) throw new Error('unsub_secret_missing');
    const body = b64u(Buffer.from(JSON.stringify({ t: p.tid, u: p.userId, c: p.category, e: Math.floor((now.getTime() + ttlMs) / 1000) })));
    return `${body}.${b64u(sign(secret, body))}`;
}

export function verifyUnsubscribeToken(secret: string | undefined, token: unknown, now: Date): UnsubVerify {
    if (!isUsableSecret(secret) || typeof token !== 'string' || token.length > 512) return { ok: false, reason: 'malformed' };
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
    const given = Buffer.from(parts[1], 'base64url');
    const want = sign(secret, parts[0]);
    // Uzunluk esitligi timingSafeEqual on kosulu; imza uzunlugu sabit (32) oldugundan uzunluk sizintisi bilgi vermez.
    if (given.length !== want.length || !timingSafeEqual(given, want)) return { ok: false, reason: 'bad_signature' };
    let j: any;
    try { j = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'malformed' }; }
    if (!Number.isInteger(j?.t) || typeof j?.u !== 'string' || typeof j?.c !== 'string' || !Number.isInteger(j?.e)) return { ok: false, reason: 'malformed' };
    if (j.e * 1000 <= now.getTime()) return { ok: false, reason: 'expired' };
    return { ok: true, payload: { tid: j.t, userId: j.u, category: j.c }, exp: j.e };
}

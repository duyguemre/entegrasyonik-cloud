// MOB-04: VAPID yapilandirmasi (SAF). Anahtarlar YALNIZ env'den (WEBPUSH_VAPID_PUBLIC/PRIVATE/SUBJECT). Uclu eksik ya da
// bicimsizse kanal KAPALI doner (undefined) -- surec COKMEZ, yalniz bir kez uyari loglanir (cagiran tarafinda).
export interface VapidConfig { publicKey: string; privateKey: string; subject: string }
export interface VapidEnv { publicKey?: string; privateKey?: string; subject?: string }

const B64URL = /^[A-Za-z0-9_-]+$/;

function b64urlLen(v: string): number {
    return Buffer.from(v, 'base64url').length;
}

/** Gecerliyse VapidConfig, degilse `reason` (deger ASLA donmez/loglanmaz). */
export function resolveVapid(env: VapidEnv | undefined): { ok: true; vapid: VapidConfig } | { ok: false; reason: 'missing' | 'invalid_public' | 'invalid_private' | 'invalid_subject' } {
    const pub = (env?.publicKey ?? '').trim();
    const priv = (env?.privateKey ?? '').trim();
    const subject = (env?.subject ?? '').trim();
    if (!pub && !priv && !subject) return { ok: false, reason: 'missing' };
    if (!pub || !B64URL.test(pub) || b64urlLen(pub) !== 65) return { ok: false, reason: 'invalid_public' };
    if (!priv || !B64URL.test(priv) || b64urlLen(priv) !== 32) return { ok: false, reason: 'invalid_private' };
    if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject) && !/^https:\/\/[^\s]+$/.test(subject)) return { ok: false, reason: 'invalid_subject' };
    return { ok: true, vapid: { publicKey: pub, privateKey: priv, subject } };
}

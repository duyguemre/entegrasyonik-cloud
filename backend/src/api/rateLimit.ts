import type { NextFunction, Request, Response } from 'express';
import { getClientIp } from './clientIp';
import { config } from '@config';

// ADR-0001 Karar 10: login/register için süreç-içi IP bazlı kayan pencere (sliding window) rate limit.
// Yeni bağımlılık yok. Süreç-içi olduğundan tek replika varsayar (ADR: 2+ replikada Redis'e taşınır).

export interface RateLimitOptions {
    windowMs: number;
    max: number;
    /** `res` (ADR-0017 `/client-log`: IP+oturum anahtarı, `res.locals.principal.sub` gerekir) İSTEĞE BAĞLIDIR -- mevcut çağrıların hepsi tek parametreli kalır. */
    keyFn?: (req: Request, res?: Response) => string;
    now?: () => number;       // test için
    maxKeys?: number;         // bellek üst sınırı
}

const DEFAULT_MAX_KEYS = 50_000;

// Değerler `@config` şemasından gelir (B-R5; varsayılanlar ve "geçersiz -> varsayılan" semantiği orada).

/** Ortam değişkenlerinden: LOGIN_RATE_LIMIT_MAX (varsayılan 10), LOGIN_RATE_LIMIT_WINDOW_MS (varsayılan 60000). */
export function rateLimitOptionsFromEnv(): RateLimitOptions {
    return { max: config.rateLimit.login.max, windowMs: config.rateLimit.login.windowMs };
}

/**
 * ADR-0003 A.4: register için IP başına kayıt sınırı — varsayılan 3 kayıt/saat/IP.
 * Ortam değişkenleri: REGISTER_RATE_LIMIT_MAX (varsayılan 3), REGISTER_RATE_LIMIT_WINDOW_MS (varsayılan 3600000).
 * Login sınırından AYRI bir kovadır (createRateLimiter çağrısı başına ayrı Map).
 */
export function registerRateLimitOptionsFromEnv(): RateLimitOptions {
    return { max: config.rateLimit.register.max, windowMs: config.rateLimit.register.windowMs };
}

/**
 * Parola sıfırlama isteği (kimliksiz; posta kutusu taşırma + kullanıcı numaralandırma sondajı savunması) — ÜÇ ayrı kova:
 *  - IP başına: PASSWORD_RESET_RATE_LIMIT_IP_MAX (varsayılan 10) / PASSWORD_RESET_RATE_LIMIT_WINDOW_MS (varsayılan 3600000)
 *  - IP+e-posta başına: PASSWORD_RESET_RATE_LIMIT_MAX (varsayılan 3) / aynı pencere
 * Limit aşımı 429'dur ve kullanıcının var olup olmadığından BAĞIMSIZDIR (yalnızca istek sayısına bağlı).
 */
export function passwordResetIpRateLimitOptionsFromEnv(): RateLimitOptions {
    return { max: config.rateLimit.passwordResetIp.max, windowMs: config.rateLimit.passwordResetIp.windowMs };
}

export function passwordResetEmailRateLimitOptionsFromEnv(): RateLimitOptions {
    return {
        max: config.rateLimit.passwordResetEmail.max,
        windowMs: config.rateLimit.passwordResetEmail.windowMs,
        keyFn: ipAndEmailKey,
    };
}

/** Parola sıfırlama onayı / e-posta doğrulama (token deneme): IP başına ACCOUNT_TOKEN_RATE_LIMIT_MAX (varsayılan 20) / 10 dk. */
export function accountTokenRateLimitOptionsFromEnv(): RateLimitOptions {
    return { max: config.rateLimit.accountToken.max, windowMs: config.rateLimit.accountToken.windowMs };
}

/** `ip|e-posta` (e-posta küçük harfe/kırpılmış; string değilse yalnızca IP). Anahtar uzunluğu sınırlıdır (bellek). */
export function ipAndEmailKey(req: Request): string {
    const email = typeof (req as any)?.body?.email === 'string' ? (req as any).body.email.trim().toLowerCase().slice(0, 254) : '';
    return getClientIp(req) + '|' + email;
}

/** ADR-0017 Karar 1.8 (`POST /client-log`): "istemci başına" = IP + oturum (`res.locals.principal.sub`, auth middleware'i tarafından doldurulur). */
export function ipAndUserSubKey(req: Request, res?: Response): string {
    const sub = (res?.locals as any)?.principal?.sub;
    return getClientIp(req) + '|' + (typeof sub === 'string' ? sub : '');
}

/** `POST /client-log` için: ADR-0017 Karar 1.8 "istemci başına 20 olay/5 dk". */
export function clientLogRateLimitOptionsFromEnv(): RateLimitOptions {
    return { max: config.rateLimit.clientLog.max, windowMs: config.rateLimit.clientLog.windowMs, keyFn: ipAndUserSubKey };
}

export function createRateLimiter(opts: RateLimitOptions) {
    const now = opts.now ?? (() => Date.now());
    const keyFn = opts.keyFn ?? ((req: Request) => getClientIp(req));
    const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
    const hits = new Map<string, number[]>();

    function sweep(t: number) {
        for (const [k, arr] of hits) {
            const cutoff = t - opts.windowMs;
            while (arr.length && arr[0] <= cutoff) arr.shift();
            if (arr.length === 0) hits.delete(k);
        }
    }

    // Temizlik zamanlayıcısı süreç kapanışını engellemez (unref)
    const timer = setInterval(() => sweep(now()), Math.max(1000, opts.windowMs));
    if (typeof (timer as any).unref === 'function') (timer as any).unref();

    /** true => izinli, false => limit aşıldı (istek sayılır: aşan istekler pencereyi uzatmaz). */
    function hit(key: string): { allowed: boolean; retryAfterMs: number } {
        const t = now();
        const cutoff = t - opts.windowMs;
        let arr = hits.get(key);
        if (arr) {
            while (arr.length && arr[0] <= cutoff) arr.shift();
        } else {
            if (hits.size >= maxKeys) {
                sweep(t);
                if (hits.size >= maxKeys) {
                    // Hâlâ doluysa en eski anahtarı at (Map ekleme sırası)
                    const oldest = hits.keys().next().value;
                    if (oldest !== undefined) hits.delete(oldest);
                }
            }
            arr = [];
            hits.set(key, arr);
        }
        if (arr.length >= opts.max) {
            return { allowed: false, retryAfterMs: Math.max(0, arr[0] + opts.windowMs - t) };
        }
        arr.push(t);
        return { allowed: true, retryAfterMs: 0 };
    }

    const middleware = (req: Request, res: Response, next: NextFunction) => {
        const r = hit(keyFn(req, res));
        if (!r.allowed) {
            res.setHeader?.('Retry-After', String(Math.max(1, Math.ceil(r.retryAfterMs / 1000))));
            res.status(429).send({ error: 'Too many requests' });
            return;
        }
        next();
    };
    (middleware as any).stop = () => clearInterval(timer);
    (middleware as any).size = () => hits.size;
    return middleware as typeof middleware & { stop: () => void; size: () => number };
}

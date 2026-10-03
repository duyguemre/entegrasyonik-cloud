// ADR-0026 Karar 4.3/4.4: backoffice oturumu (`EK_ADMIN`). Musteri oturumundan KRIPTOGRAFIK olarak ayridir:
//  - ayri cerez adi + `Path=/admin-api` + `SameSite=Strict` + `Domain` YOK (yalniz api host'u),
//  - ayri `aud:'backoffice'` (musteri token'i `aud:'web'`; iki yonde de takas dogrulamada reddedilir),
//  - kayan bosta kalma 30 dk (her basarili istekte yeniden basilir), mutlak ust sinir 8 sa (`auth_time`),
//  - iki asama: `pwd` (parola dogrulandi, TOTP bekliyor; 5 dk, YENILENMEZ) -> `full` (`mfa:true`).
// Ayni JWT_SECRET/JWT_ISSUER kullanilir (yeni sir yok); ayrim `aud` + `stg` + cerez yoluyla yapilir.
import jwt from 'jsonwebtoken';
import type { CookieOptions, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import Security, { ApplicationError } from '@api/Security';
import { config } from '@config';

export const ADMIN_API_PATH = '/admin-api';
export const ADMIN_COOKIE_NAME = 'EK_ADMIN';
export const ADMIN_AUDIENCE = 'backoffice';
export const ADMIN_IDLE_SECONDS = 30 * 60;          // kayan bosta kalma
export const ADMIN_ABSOLUTE_SECONDS = 8 * 60 * 60;  // mutlak ust sinir (auth_time'dan)
export const ADMIN_HALF_SECONDS = 5 * 60;           // parola sonrasi TOTP bekleme penceresi
export const ADMIN_REAUTH_SECONDS = 5 * 60;         // step-up penceresi

export type AdminStage = 'pwd' | 'full';

export interface AdminClaimsInput {
    sub: string;
    tv: number;
    stg: AdminStage;
    auth_time?: number;
    reauth_at?: number;
    jti?: string;
}

export interface AdminPrincipal {
    sub: string;
    ga: true;
    tv: number;
    mfa: boolean;
    stg: AdminStage;
    auth_time: number;
    reauth_at?: number;
    jti: string;
    iat: number;
    exp: number;
}

const nowSec = (ms: number) => Math.floor(ms / 1000);

export function signAdminSession(claims: AdminClaimsInput, nowMs: number = Date.now()): string {
    const cfg = Security.loadConfig();
    const now = nowSec(nowMs);
    const authTime = claims.auth_time ?? now;
    const full = claims.stg === 'full';
    const exp = full ? Math.min(now + ADMIN_IDLE_SECONDS, authTime + ADMIN_ABSOLUTE_SECONDS) : now + ADMIN_HALF_SECONDS;
    const payload: Record<string, unknown> = {
        sub: claims.sub,
        ga: true,
        tv: claims.tv,
        mfa: full,
        stg: claims.stg,
        auth_time: authTime,
        jti: claims.jti ?? randomUUID(),
        iat: now,
        exp,
        iss: cfg.issuer,
        aud: ADMIN_AUDIENCE,
    };
    if (claims.reauth_at !== undefined) payload.reauth_at = claims.reauth_at;
    return jwt.sign(payload, cfg.secret, { algorithm: 'HS256' });
}

export function verifyAdminToken(token: string, nowMs: number = Date.now()): AdminPrincipal {
    const cfg = Security.loadConfig();
    const opts: jwt.VerifyOptions = { algorithms: ['HS256'], issuer: cfg.issuer, audience: ADMIN_AUDIENCE, clockTimestamp: nowSec(nowMs) };
    let payload: any;
    try {
        try {
            payload = jwt.verify(token, cfg.secret, opts);
        } catch (err: any) {
            if (cfg.previous && err && err.message === 'invalid signature') payload = jwt.verify(token, cfg.previous, opts);
            else throw err;
        }
    } catch {
        throw new ApplicationError('Token not verified', 401);
    }
    if (!payload || typeof payload !== 'object'
        || typeof payload.sub !== 'string' || !payload.sub
        || payload.ga !== true
        || typeof payload.tv !== 'number' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number'
        || typeof payload.auth_time !== 'number' || typeof payload.jti !== 'string'
        || (payload.stg !== 'pwd' && payload.stg !== 'full')
        || typeof payload.mfa !== 'boolean'
        || (payload.reauth_at !== undefined && typeof payload.reauth_at !== 'number')
        // asama ile mfa claim'i tutarli olmali (pwd asamasi mfa:true tasiyamaz)
        || (payload.stg === 'full') !== (payload.mfa === true)) {
        throw new ApplicationError('Token not verified', 401);
    }
    // Mutlak ust sinir token'a ek olarak acikca kontrol edilir (auth_time'dan 8 sa)
    if (nowSec(nowMs) - payload.auth_time > ADMIN_ABSOLUTE_SECONDS) throw new ApplicationError('Token not verified', 401);
    return {
        sub: payload.sub, ga: true, tv: payload.tv, mfa: payload.mfa, stg: payload.stg, auth_time: payload.auth_time,
        reauth_at: payload.reauth_at, jti: payload.jti, iat: payload.iat, exp: payload.exp,
    };
}

/** YALNIZ `EK_ADMIN` cerezi okunur; musteri `JWT_TOKEN` cerezi bu baglama noktasinda HIC okunmaz. */
export function readAdminCookie(req: Request): string | undefined {
    const fromParsed = (req as any).cookies?.[ADMIN_COOKIE_NAME];
    if (typeof fromParsed === 'string' && fromParsed) return fromParsed;
    const header = req.headers?.cookie;
    if (typeof header === 'string') {
        // RegExp'siz ayristirma: "ad=deger" ciftleri ';' ile ayrilir (bosluk toleransli).
        for (const part of header.split(';')) {
            const t = part.trim();
            if (t.startsWith(ADMIN_COOKIE_NAME + '=')) {
                const v = t.slice(ADMIN_COOKIE_NAME.length + 1);
                if (v) return v;
            }
        }
    }
    return undefined;
}

function cookieOptions(maxAgeSeconds: number): CookieOptions {
    const isDev = config.nodeEnv === 'development' || !config.nodeEnv;
    return {
        httpOnly: true,
        secure: !isDev,
        sameSite: 'strict',
        path: ADMIN_API_PATH,
        // `domain` BILEREK yok: host-only (yalniz api host'u)
        maxAge: maxAgeSeconds * 1000,
    };
}

export function setAdminSessionCookie(res: Response, claims: AdminClaimsInput, nowMs: number = Date.now()): string {
    const token = signAdminSession(claims, nowMs);
    const p = jwt.decode(token) as any;
    res.cookie(ADMIN_COOKIE_NAME, token, cookieOptions(Math.max(1, p.exp - p.iat)));
    return token;
}

export function expireAdminSessionCookie(res: Response): void {
    res.cookie(ADMIN_COOKIE_NAME, 'Signout', cookieOptions(0));
}

/**
 * Kayan yenileme: tam oturumda her basarili istekte yeni token (bosta kalma 30 dk'ya uzar; mutlak sinir asilamaz).
 * `reauth_at` ve `jti` KORUNUR (yenileme step-up penceresini uzatmaz).
 */
export function refreshAdminSession(res: Response, p: AdminPrincipal, nowMs: number = Date.now()): void {
    if (p.stg !== 'full') return;
    setAdminSessionCookie(res, { sub: p.sub, tv: p.tv, stg: 'full', auth_time: p.auth_time, reauth_at: p.reauth_at, jti: p.jti }, nowMs);
}

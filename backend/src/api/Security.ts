import jwt from 'jsonwebtoken';
import { CookieOptions, Response, Request } from 'express';
import bcrypt from 'bcrypt';
import { AppError } from '@platform/core/errors';
import { config } from '@config';

// ADR-0001 (Karar 1-4): imzalı, süreli, asgari claim'li oturum JWT'si.
// Sır yalnızca env'den okunur (JWT_SECRET); eski kaynak-koddaki sabit sır hiçbir koşulda kabul edilmez.

/**
 * Bilinçli, kullanıcıya yazılmış hata (ADR-0016 §4.3: `AppError`'ın uyumlu alt sınıfı). `message` istemciye AYNEN döner
 * (expose=true); `statusCode` = HTTP durumu. `code` verilmezse HTTP durumundan katalog kodu türetilir
 * (`platform/core/errors/codes.ts`); verilirse (ör. WEAK_PASSWORD) o kod korunur.
 */
export class ApplicationError extends AppError {
    constructor(message: any, statusCode: any, code?: string) {
        super(message, Number(statusCode) || 500, { code, expose: true });
    }
}

export const SESSION_COOKIE_NAME = 'JWT_TOKEN';
export const SESSION_AUDIENCE = 'web';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;            // exp = 8 saat (çerez süresiyle aynı)
export const SLIDING_REFRESH_THRESHOLD_SECONDS = 4 * 60 * 60; // kalan < 4 saat ise yenile
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;   // auth_time'dan itibaren en fazla 7 gün yenilenebilir
export const JWT_SECRET_MIN_BYTES = 32;

/** Doğrulanmış token içeriği (asgari claim seti). Kullanıcı belgesi/resources/parola özeti içermez. */
export interface SessionPrincipal {
    sub: string;        // merkezi Users._id
    tid?: number;       // tenant order; süper yönetici mağaza seçmeden önce yok
    role?: string;      // roleCode
    ga: boolean;        // isGlobalAdmin
    tv: number;         // tokenVersion
    imp: boolean;       // süper yönetici başka tenant'ı görüntülüyor
    auth_time: number;  // ilk girişin epoch saniyesi
    iat: number;
    exp: number;
    iss: string;
    aud: string;
}

/** Token üretimi için girdi; iat/exp/iss/aud sunucuda eklenir. */
export interface SessionClaimsInput {
    sub: string;
    tid?: number;
    role?: string;
    ga?: boolean;
    tv?: number;
    imp?: boolean;
    auth_time?: number;
}

interface JwtConfig { secret: string; previous?: string; issuer: string }

export default class Security {
    private static instance: Security;

    private constructor() { }

    public static getInstance(name?: string): Security {
        if (!Security.instance) {
            Security.instance = new Security();
        }
        return Security.instance;
    }

    // --- Sır/yapılandırma (fail-fast) ---

    /**
     * JWT yapılandırmasını env'den okur. JWT_SECRET tanımsız veya 32 bayttan kısaysa HATA fırlatır (fail-fast).
     * JWT_SECRET_PREVIOUS (opsiyonel) yalnızca doğrulamada kullanılır; aynı asgari uzunluk şartı vardır
     * (bu şart eski, kısa sabit sırrın önceki-sır olarak sokulmasını da engeller).
     */
    public static loadConfig(): JwtConfig {
        const secret = config.auth.jwtSecret;
        if (!secret || Buffer.byteLength(secret, 'utf8') < JWT_SECRET_MIN_BYTES) {
            throw new Error(`[Security] JWT_SECRET tanımsız veya ${JWT_SECRET_MIN_BYTES} bayttan kısa; süreç başlatılamaz (ADR-0001).`);
        }
        const previous = config.auth.jwtSecretPrevious;
        if (previous && Buffer.byteLength(previous, 'utf8') < JWT_SECRET_MIN_BYTES) {
            throw new Error(`[Security] JWT_SECRET_PREVIOUS tanımlıysa en az ${JWT_SECRET_MIN_BYTES} bayt olmalı (ADR-0001).`);
        }
        return { secret, previous: previous || undefined, issuer: config.auth.jwtIssuer };
    }

    /** Başlangıçta çağrılır: yapılandırma geçersizse süreç başlamaz. */
    public static assertConfig(): void {
        Security.loadConfig();
    }

    // Şifreleme Yardımları
    public async hashPassword(password: string): Promise<string> {
        return await bcrypt.hash(password, 10);
    }

    public async comparePassword(password: string, hash: string): Promise<boolean> {
        return await bcrypt.compare(password, hash);
    }

    private dummyHash?: Promise<string>;

    /**
     * Kullanıcı yokken de gerçek bir bcrypt karşılaştırması yapabilmek için (zamanlama farkını azaltır; ADR-0001 Karar 10)
     * süreç başına bir kez üretilen, hiçbir parolayla eşleşmeyen sahte özet.
     */
    public getDummyHash(): Promise<string> {
        if (!this.dummyHash) {
            this.dummyHash = bcrypt.hash('dummy-' + Math.random().toString(36) + Date.now(), 10);
        }
        return this.dummyHash;
    }

    // Merkezi Çerez Ayarları
    private getCookieOptions(isExtending: boolean): CookieOptions {
        const isDev = config.nodeEnv === 'development' || !config.nodeEnv;
        return {
            httpOnly: true,
            secure: !isDev,
            sameSite: isDev ? 'lax' : 'none',
            maxAge: isExtending ? 28800000 : 0, // 8 saat veya 0 (expire)
            path: '/',
        };
    }

    // --- Çerez yardımcıları ---

    /** Kullanıcı belgesinden (parola/tokenVersion dahil olabilir) asgari claim girdisi türetir. Belge token'a girmez. */
    public static claimsFromUser(user: any, extra: Partial<SessionClaimsInput> = {}): SessionClaimsInput {
        const ga = !!user.isGlobalAdmin;
        const order = Number(user.order);
        return {
            sub: String(user._id),
            tid: !ga && Number.isInteger(order) ? order : undefined, // süper yönetici mağaza seçmeden tenant'sız
            role: user.roleCode,
            ga,
            tv: Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0,
            imp: false,
            ...extra,
        };
    }

    /** Verilen claim girdisiyle imzalı oturum çerezini basar. */
    public static setSessionCookie(res: Response, claims: SessionClaimsInput) {
        const token = Security.getInstance().signSession(claims);
        res.cookie(SESSION_COOKIE_NAME, token, Security.getInstance().getCookieOptions(true));
    }

    /** Login/register sonrası çağrılır; token yalnızca asgari claim'leri taşır (kullanıcı belgesi/parola özeti YOK). */
    public static addSecurityCookie(res: Response, context: any, user: any) {
        if (!user || !user._id) return;
        Security.setSessionCookie(res, Security.claimsFromUser(user));
    }

    public static expireSecurityCookie(res: Response, context: any) {
        const options = Security.getInstance().getCookieOptions(false);
        res.cookie(SESSION_COOKIE_NAME, "Signout", options);
    }

    // --- JWT işlemleri ---

    /** HS256, exp=8 saat, asgari claim'ler, iss/aud sabit. */
    public signSession(claims: SessionClaimsInput, nowMs: number = Date.now()): string {
        const cfg = Security.loadConfig();
        const now = Math.floor(nowMs / 1000);
        const authTime = claims.auth_time ?? now;
        const payload: any = {
            sub: claims.sub,
            role: claims.role,
            ga: !!claims.ga,
            tv: claims.tv ?? 0,
            imp: !!claims.imp,
            auth_time: authTime,
            iat: now,
            // ADR-0001 Karar 4: oturum ilk girişten (auth_time) itibaren en fazla 7 gün sürer; yenilenen token bile bu sınırı aşamaz
            exp: Math.min(now + SESSION_TTL_SECONDS, authTime + SESSION_MAX_AGE_SECONDS),
            iss: cfg.issuer,
            aud: SESSION_AUDIENCE,
        };
        if (claims.tid !== undefined && claims.tid !== null) payload.tid = claims.tid;
        return jwt.sign(payload, cfg.secret, { algorithm: 'HS256' });
    }

    /**
     * Token'ı yalnızca env'deki sırla (ve varsa JWT_SECRET_PREVIOUS ile) HS256 olarak doğrular;
     * exp, iss, aud, asgari claim tipleri zorunlu. Herhangi bir sorun 401 "Token not verified".
     */
    public verifyToken(token: string): SessionPrincipal {
        const cfg = Security.loadConfig();
        const opts: jwt.VerifyOptions = { algorithms: ['HS256'], issuer: cfg.issuer, audience: SESSION_AUDIENCE };
        let payload: any;
        try {
            try {
                payload = jwt.verify(token, cfg.secret, opts);
            } catch (err: any) {
                // Yalnızca imza uyuşmazlığında önceki sır denenir (süre/iss/aud hataları için değil)
                if (cfg.previous && err && err.message === 'invalid signature') {
                    payload = jwt.verify(token, cfg.previous, opts);
                } else {
                    throw err;
                }
            }
        } catch (error) {
            throw new ApplicationError("Token not verified", 401);
        }
        if (!payload || typeof payload !== 'object'
            || typeof payload.sub !== 'string' || !payload.sub
            || typeof payload.exp !== 'number' || typeof payload.iat !== 'number'
            || typeof payload.tv !== 'number' || typeof payload.auth_time !== 'number'
            || typeof payload.ga !== 'boolean'
            || (payload.tid !== undefined && !Number.isInteger(payload.tid))) {
            throw new ApplicationError("Token not verified", 401);
        }
        return {
            sub: payload.sub,
            tid: payload.tid,
            role: typeof payload.role === 'string' ? payload.role : undefined,
            ga: payload.ga,
            tv: payload.tv,
            imp: payload.imp === true,
            auth_time: payload.auth_time,
            iat: payload.iat,
            exp: payload.exp,
            iss: payload.iss,
            aud: payload.aud,
        };
    }

    /** İstekteki çerezden token'ı okuyup doğrular. */
    public verify(req: Request): SessionPrincipal {
        const token = this.getSecurityToken(req);
        if (!token) throw new ApplicationError("Token is undefined", 401);
        return this.verifyToken(token);
    }

    /**
     * Sliding yenileme kuralı (ADR-0001 Karar 4): kalan < 4 saat VE yenilenen token'ın exp'i (min(şimdi+8s, auth_time+7g))
     * mevcut exp'ten ileride olmalı — yani ilk girişten 7 gün dolmuşsa yenilenmez, yeniden giriş gerekir.
     */
    public static shouldRefresh(principal: SessionPrincipal, nowMs: number = Date.now()): boolean {
        const now = Math.floor(nowMs / 1000);
        const renewedExp = Math.min(now + SESSION_TTL_SECONDS, principal.auth_time + SESSION_MAX_AGE_SECONDS);
        return (principal.exp - now) < SLIDING_REFRESH_THRESHOLD_SECONDS && renewedExp > principal.exp;
    }

    public getSecurityToken(request: Request): string | undefined {
        // Öncelik cookie-parser'da, yoksa manuel parse
        if (request.cookies && request.cookies[SESSION_COOKIE_NAME]) {
            return request.cookies[SESSION_COOKIE_NAME];
        }

        const cookieHeader = request.headers.cookie;
        if (cookieHeader) {
            const match = cookieHeader.match(new RegExp('(^| )' + SESSION_COOKIE_NAME + '=([^;]+)'));
            if (match) return match[2];
        }
        return undefined;
    }
}

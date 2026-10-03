// ADR-0035 Karar 2 / MCP-1: OAuth HTTP katmani (ince sarmal; mantik `service.ts`'te).
//  - KIMLIKSIZ uclar (`configureOAuthPublicRoutes`): `/.well-known/*`, `/oauth/{register,authorize,token,revoke}`. `authenticate`'ten ONCE baglanir
//    (cerez okunmaz); CORS `*` (cerezsiz, credentials yok: tarayici tabanli MCP istemcileri metadata/token/register'a erisebilsin).
//  - CEREZLI onay uclari (`configureOAuthConsentRoutes`): `/api/oauth/requests/:id[/decision]` -- `authenticate`'ten SONRA (cerez oturumu; Origin kontrolu POST'ta).
// MCP_ENABLED=false veya JWT_OAUTH_SECRET yoksa tum uclar 404 (yuzey kapali). Hata bicimi: OAuth uclarinda RFC 6749 JSON; onay uclarinda katalog zarfi.
import cors from 'cors';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '@config';
import { getAgentKv } from '@operations/agent/kv';
import { logger } from '@platform/core/logger';
import { NotificationService } from '@services/notification/NotificationService';
import { isMcpEnabled, OAUTH_SCOPES } from '@platform/core/security/oauthTokens';
import { createRateLimiter, rateLimitOptionsFromEnv } from '../rateLimit';
import { getClientIp } from '../clientIp';
import { sendHttpError } from '../http/errorEnvelope';
import { defaultOAuthAudit } from './audit';
import { FamilyGate } from './familyGate';
import { createDbIdentity } from './identity';
import { MongoOAuthStore } from './mongoStore';
import { OAuthError } from './errors';
import { ConsentError, OAuthService, type ConnectedEvent, type ConsentSession } from './service';

const log = logger.child({ module: 'oauth.routes' });

export const REGISTER_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 } as const; // 10 kayit / saat / IP
export const TOKEN_IP_LIMIT = { max: 30, windowMs: 60 * 1000 } as const;      // 30 / dk / IP
export const TOKEN_FAMILY_LIMIT = { max: 10, windowMs: 60 * 1000 } as const;  // 10 / dk / aile
export const REVOKE_LIMIT = { max: 30, windowMs: 60 * 1000 } as const;        // 30 / dk / IP

export function oauthUrls(): { issuer: string; resource: string; appOrigin: string } {
    return { issuer: config.mcp.apiOrigin ?? '', resource: config.mcp.resourceUri ?? '', appOrigin: config.mcp.appOrigin ?? '' };
}

/** RFC 8414 yetkilendirme sunucusu metadata'si. */
export function authorizationServerMetadata(): Record<string, unknown> {
    const { issuer } = oauthUrls();
    return {
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        registration_endpoint: `${issuer}/oauth/register`,
        revocation_endpoint: `${issuer}/oauth/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        revocation_endpoint_auth_methods_supported: ['none'],
        scopes_supported: [...OAUTH_SCOPES],
    };
}

/** RFC 9728 korunan kaynak metadata'si (`/mcp`). */
export function protectedResourceMetadata(): Record<string, unknown> {
    const { issuer, resource } = oauthUrls();
    return { resource, authorization_servers: [issuer], scopes_supported: [...OAUTH_SCOPES], bearer_methods_supported: ['header'] };
}

/** Uretim servisi (tembel tekil): Mongo deposu + Redis/bellek KV + DB kimlik portu. */
let singleton: { service: OAuthService; gate: FamilyGate; store: MongoOAuthStore } | undefined;
function build(): { service: OAuthService; gate: FamilyGate; store: MongoOAuthStore } {
    if (!singleton) {
        const store = new MongoOAuthStore();
        const gate = new FamilyGate(store);
        const famLimiter = createRateLimiter({ ...TOKEN_FAMILY_LIMIT, maxKeys: 10_000 });
        singleton = {
            gate, store,
            service: new OAuthService({
                store, gate, kv: getAgentKv, identity: createDbIdentity(), audit: defaultOAuthAudit, urls: oauthUrls,
                familyLimit: (famId) => famLimiter.hit(famId).allowed,
                onConnected: notifyConnected,
            }),
        };
    }
    return singleton;
}
/** MCP-2: yeni baglanti -> baglanan kullaniciya `security.mcp_connected` bildirimi (ADR-0029 katalogu; NOTIFY_V2 kapaliyken cephe/sink bir sey yazmaz). Ad DCR'dan gelir: yalniz kisa/duz metin. */
const safeLabel = (v: string, max: number): string => v.replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, max);
async function notifyConnected(e: ConnectedEvent): Promise<void> {
    await NotificationService.notify(
        'SECURITY_MCP_CONNECTED', e.tid,
        { familyId: e.familyId, clientName: safeLabel(e.clientName, 60) || e.redirectHost.slice(0, 60), redirectHost: safeLabel(e.redirectHost, 80) },
        { recipients: { userIds: [e.sub] }, actorUserId: e.sub, module: 'mcp.oauth', idempotencyKey: `mcp-connected:${e.familyId}` },
    );
}

/** MCP-2: bagli uygulamalar servisi icin canli depo + aile kapisi (tekil; OAuth servisi ile AYNI kapi, iptal anında dusurulur). */
export function getOAuthRuntime(): { store: MongoOAuthStore; gate: FamilyGate } { const { store, gate } = build(); return { store, gate }; }
// MCP-3: `/mcp` her istekte bagli aile durumunu `build().gate` (FamilyGate, 60 sn onbellek) uzerinden sorar; o is baslayinca `getFamilyGate()` buradan disa acilir.
const getOAuthService = (): OAuthService => build().service;

export interface OAuthRouteDeps {
    service(): OAuthService;
    enabled(): boolean;
}
const prodDeps: OAuthRouteDeps = { service: getOAuthService, enabled: isMcpEnabled };

const noStore = (res: Response) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache'); };

function oauthFail(res: Response, e: unknown): void {
    noStore(res);
    if (e instanceof OAuthError) {
        if (e.status === 429) res.setHeader('Retry-After', '60');
        if (e.status === 401) res.setHeader('WWW-Authenticate', 'Bearer error="invalid_client"');
        res.status(e.status).json({ error: e.oauthError, error_description: e.description });
        return;
    }
    log.error({ err: e }, 'OAuth beklenmeyen hata');
    res.status(500).json({ error: 'server_error' });
}

const PAGE_ERROR_HTML = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Bağlantı isteği geçersiz</title></head>'
    + '<body><h1>Bağlantı isteği geçersiz</h1><p>Uygulama tanınmıyor veya yönlendirme adresi kayıtlı değil. Yapay zekâ uygulamanıza dönüp bağlantıyı yeniden başlatın.</p></body></html>';

/** Kimliksiz OAuth uclari. `authenticate`'ten ve genel cors'tan ONCE baglanir. */
export function configureOAuthPublicRoutes(app: Express, deps: OAuthRouteDeps = prodDeps) {
    const gate: RequestHandler = (_req, res, next) => {
        if (!deps.enabled()) { sendHttpError(res, 404, 'İstenen yol bulunamadı.', 'NOT_FOUND'); return; }
        next();
    };
    const open = cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'MCP-Protocol-Version'], maxAge: 600 });
    const limit = (opts: { max: number; windowMs: number }): RequestHandler => createRateLimiter({ ...opts }) as unknown as RequestHandler;
    const limitAuthorize = createRateLimiter(rateLimitOptionsFromEnv()) as unknown as RequestHandler; // ADR-0010 madde 9: giris limitini (10/dk/IP) paylasir

    app.use(['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/oauth'], open, gate);

    app.get('/.well-known/oauth-authorization-server', (_req, res) => { res.setHeader('Cache-Control', 'public, max-age=300'); res.json(authorizationServerMetadata()); });
    const prm = (_req: Request, res: Response) => { res.setHeader('Cache-Control', 'public, max-age=300'); res.json(protectedResourceMetadata()); };
    app.get('/.well-known/oauth-protected-resource', prm);
    app.get('/.well-known/oauth-protected-resource/mcp', prm);

    app.post('/oauth/register', limit(REGISTER_LIMIT), async (req: Request, res: Response) => {
        try {
            const out = await deps.service().register(req.body, getClientIp(req));
            noStore(res);
            res.status(201).json(out);
        } catch (e) { oauthFail(res, e); }
    });

    app.get('/oauth/authorize', limitAuthorize, async (req: Request, res: Response) => {
        try {
            const out = await deps.service().authorize(req.query as Record<string, unknown>, getClientIp(req));
            noStore(res);
            if (out.type === 'page_error') { res.status(400).type('html').send(PAGE_ERROR_HTML); return; }
            res.redirect(302, out.url);
        } catch (e) {
            log.error({ err: e }, 'OAuth authorize hata');
            res.status(500).type('html').send(PAGE_ERROR_HTML);
        }
    });

    app.post('/oauth/token', limit(TOKEN_IP_LIMIT), async (req: Request, res: Response) => {
        try {
            const out = await deps.service().token((req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>, getClientIp(req));
            noStore(res);
            res.status(200).json(out);
        } catch (e) { oauthFail(res, e); }
    });

    app.post('/oauth/revoke', limit(REVOKE_LIMIT), async (req: Request, res: Response) => {
        try {
            await deps.service().revokeToken((req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>, getClientIp(req));
            noStore(res);
            res.status(200).end();
        } catch (e) { oauthFail(res, e); }
    });
}

function sessionOf(res: Response, req: Request): ConsentSession | null {
    const p = res.locals.principal as { sub?: string; ga?: boolean; imp?: boolean } | undefined;
    if (!p || typeof p.sub !== 'string') { sendHttpError(res, 401, undefined, 'UNAUTHENTICATED'); return null; }
    return { sub: p.sub, ga: p.ga === true, imp: p.imp === true, ip: getClientIp(req) };
}

function consentFail(res: Response, next: NextFunction, e: unknown): void {
    if (e instanceof ConsentError) { sendHttpError(res, e.status, undefined, e.code); return; }
    next(e);
}

/** Cerezli onay ekrani uclari (yetenekler: oauth.consent.view / oauth.consent.decide). `authenticate`'ten SONRA baglanir. */
export function configureOAuthConsentRoutes(app: Express, context: string, deps: OAuthRouteDeps = prodDeps) {
    const base = `${context.replace(/\/+$/, '')}/oauth/requests`;
    const off = (res: Response): boolean => {
        if (deps.enabled()) return false;
        sendHttpError(res, 404, 'İstenen yol bulunamadı.', 'NOT_FOUND');
        return true;
    };

    app.get(`${base}/:id`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (off(res)) return;
            const session = sessionOf(res, req);
            if (!session) return;
            noStore(res);
            res.status(200).json(await deps.service().getConsentRequest(String(req.params.id), session));
        } catch (e) { consentFail(res, next, e); }
    });

    app.post(`${base}/:id/decision`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (off(res)) return;
            const session = sessionOf(res, req);
            if (!session) return;
            noStore(res);
            res.status(200).json(await deps.service().decide(String(req.params.id), session, (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>));
        } catch (e) { consentFail(res, next, e); }
    });
}

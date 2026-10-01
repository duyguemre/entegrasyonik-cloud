// ADR-0035 Karar 1 / MCP-3: Streamable HTTP, DURUMSUZ `/mcp` ucu (oturum kimligi YOK, JSON yanit; yalniz POST -- GET/DELETE 405).
// Sira (her istek): yuzey kapali -> 404 | Origin (varsa izinli liste) 403 | yontem 405 | `MCP-Protocol-Version` 400 | Bearer + aile + kimlik + tenant ayari
// (McpAuth; 401'de `WWW-Authenticate ... resource_metadata`) | Redis yoksa 503 (bilincli, kapali-guvenli) | govde <=256 KB + JSON-RPC | oran siniri/kota | dagitim.
// `authenticate`/cerez hatti BU yolda calismaz (Webserver bunu body-parser ve authenticate'ten ONCE baglar); kimlik tamamen `McpAuth`'tadir.
import bodyParser from 'body-parser';
import type { Express, Request, RequestHandler, Response } from 'express';
import { config } from '@config';
import { metricsRegistry } from '@platform/runtime/metrics';
import { enrichContext } from '@platform/core/context';
import { logger } from '@platform/core/logger';
import Security from '@platform/core/security/Security';
import { isMcpEnabled } from '@platform/core/security/oauthTokens';
import { RedisService } from '@services/redis';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { getAgentKv, type AgentKv } from '@operations/agent/kv';
import { createToolRuntime } from '@operations/agent/tools';
import { resolveIdentity } from '../api/authenticate';
import { getClientIp } from '@platform/rateLimit/clientIp';
import { sendHttpError } from '../api/http/errorEnvelope';
import { parseCorsOrigins } from '../api/originCheck';
import { getOAuthRuntime } from '../api/oauth/routes';
import { getMcpAccess } from '../api/oauth/tenantAccess';
import { getMcpApprovals } from './approvalsRuntime';
import { McpAuth, McpAuthError, type McpCaller, type McpFailure } from './McpAuth';
import { McpLimits } from './McpLimits';
import { MAX_RESPONSE_BYTES, McpServer, toolErrorResult } from './McpServer';
import { classify, isObject, methodLabel, rpcError, rpcResult, RPC_ERROR, type JsonRpcResponse } from './protocol';
import { isSupportedVersion, SUPPORTED_PROTOCOL_VERSIONS } from './versions';

const log = logger.child({ module: 'mcp.http' });

export const MCP_PATH = '/mcp';
export const MAX_BODY_BYTES = 256 * 1024;

type Outcome = 'ok' | 'error' | 'denied' | 'rate_limited' | 'expired' | 'unauthorized' | 'bad_request' | 'unavailable' | 'forbidden_origin';

export interface McpEndpointDeps {
    enabled(): boolean;
    auth: Pick<McpAuth, 'authenticate'>;
    server: McpServer;
    /** Redis tabanli kv; hazir degilse null -> 503 (surec-ici yedek KULLANILMAZ). */
    kv(): AgentKv | null;
    limits(kv: AgentKv): McpLimits;
    allowedOrigins(): string[];
    resourceUri(): string;
}

// ---- yardimcilar ---------------------------------------------------------------------------------------------------------
const norm = (o: string) => o.trim().replace(/\/+$/, '').toLowerCase();

/** RFC 9728: `/.well-known/oauth-protected-resource` + kaynak yolu. */
export function resourceMetadataUrl(resourceUri: string): string {
    try {
        const u = new URL(resourceUri);
        const path = u.pathname.replace(/\/+$/, '');
        return `${u.origin}/.well-known/oauth-protected-resource${path}`;
    } catch { return ''; }
}

function wwwAuthenticate(kind: McpFailure, resourceUri: string): string {
    const parts: string[] = [];
    if (kind === 'invalid_token') parts.push('error="invalid_token"');
    if (kind === 'insufficient_scope') parts.push('error="insufficient_scope"', 'scope="mcp:read"');
    const meta = resourceMetadataUrl(resourceUri);
    if (meta) parts.push(`resource_metadata="${meta}"`);
    return `Bearer ${parts.join(', ')}`.trim();
}

function bearerOf(req: Request): string | undefined {
    const h = req.headers.authorization;
    if (typeof h !== 'string') return undefined;
    const m = /^Bearer\s+(\S+)$/i.exec(h.trim());
    return m?.[1];
}

const jsonParser: RequestHandler = bodyParser.json({ limit: MAX_BODY_BYTES, type: 'application/json', strict: true });
const parseBody = (req: Request, res: Response) => new Promise<void>((resolve, reject) => jsonParser(req, res, (e?: unknown) => (e ? reject(e) : resolve())));

const TRACEPARENT = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

function record(method: string, outcome: Outcome): void {
    try { metricsRegistry.incCounter('mcp_requests_total', { method, outcome }); } catch { /* metrik hatasi yutulur */ }
}

// ---- uc ----------------------------------------------------------------------------------------------------------------------
export function configureMcpEndpoint(app: Express, deps: McpEndpointDeps = prodDeps()): void {
    app.all(MCP_PATH, async (req: Request, res: Response) => {
        let method = 'http';
        const done = (outcome: Outcome) => record(method, outcome);
        try {
            if (!deps.enabled()) { sendHttpError(res, 404, 'İstenen yol bulunamadı.', 'NOT_FOUND'); return; }
            res.setHeader('Cache-Control', 'no-store');

            // Origin: varsa izinli liste disi -> 403 (DNS rebinding/tarayici saldirisi). Yoksa (sunucu/masaustu istemci) denetim yok.
            const origin = req.headers.origin;
            if (typeof origin === 'string') {
                if (!deps.allowedOrigins().some((a) => norm(a) === norm(origin))) { done('forbidden_origin'); sendHttpError(res, 403, 'Forbidden origin', 'FORBIDDEN'); return; }
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
                res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Retry-After, X-Request-Id');
            }
            if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version, X-Request-Id');
                res.setHeader('Access-Control-Max-Age', '600');
                res.status(204).end();
                return;
            }
            if (req.method !== 'POST') { done('bad_request'); res.setHeader('Allow', 'POST, OPTIONS'); sendHttpError(res, 405, 'Method not allowed', 'VALIDATION'); return; }

            const pv = req.headers['mcp-protocol-version'];
            if (pv !== undefined && !(typeof pv === 'string' && isSupportedVersion(pv))) {
                done('bad_request');
                sendHttpError(res, 400, `Unsupported MCP-Protocol-Version. Supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}.`, 'VALIDATION');
                return;
            }
            // baslik yoksa spesifikasyon varsayimi (2025-03-26, `versions.ts`): durumsuz oldugundan yalniz kabul edilir

            // kimlik + durum (her istekte)
            let caller: McpCaller;
            try {
                caller = await deps.auth.authenticate(bearerOf(req), getClientIp(req));
            } catch (e) {
                if (e instanceof McpAuthError) {
                    done(e.status === 401 ? 'unauthorized' : e.status === 503 ? 'unavailable' : 'denied');
                    if (e.status === 401 || e.challenge !== 'none') res.setHeader('WWW-Authenticate', wwwAuthenticate(e.challenge, deps.resourceUri()));
                    if (e.status === 503) res.setHeader('Retry-After', '30');
                    sendHttpError(res, e.status, undefined, e.code);
                    return;
                }
                throw e;
            }
            enrichContext({ tenantId: caller.tid, userSub: caller.userId });

            // Redis ZORUNLU (oran siniri + kota); yoksa kapali-guvenli 503
            const kv = deps.kv();
            if (!kv) { done('unavailable'); res.setHeader('Retry-After', '30'); sendHttpError(res, 503, undefined, 'UNAVAILABLE'); return; }

            // govde
            if (!req.is('application/json')) { done('bad_request'); sendHttpError(res, 415, 'Content-Type must be application/json.', 'VALIDATION'); return; }
            try {
                await parseBody(req, res);
            } catch (e) {
                const type = (e as { type?: string }).type;
                done('bad_request');
                if (type === 'entity.too.large') { sendHttpError(res, 413, undefined, 'PAYLOAD_TOO_LARGE'); return; }
                if (type === 'entity.parse.failed') { res.status(400).json(rpcError(null, RPC_ERROR.PARSE, 'Parse error')); return; }
                sendHttpError(res, 400, undefined, 'VALIDATION');
                return;
            }

            const parsed = classify(req.body);
            if (parsed.kind === 'invalid') {
                done('bad_request');
                res.status(400).json(rpcError(parsed.id, RPC_ERROR.INVALID_REQUEST, Array.isArray(req.body) ? 'Batch requests are not supported' : 'Invalid request'));
                return;
            }
            if (parsed.kind === 'notification' || parsed.kind === 'response') {
                method = parsed.kind === 'notification' ? methodLabel(parsed.msg.method) : 'other';
                done('ok');
                res.status(202).end();
                return;
            }

            const { id, method: rpcMethod, params } = parsed.msg;
            method = methodLabel(rpcMethod);
            const tp = isObject(params) && isObject(params._meta) ? params._meta.traceparent : undefined;
            if (typeof tp === 'string' && TRACEPARENT.test(tp)) log.debug({ traceparent: tp, method }, 'MCP istegi (istemci iz baglami)');

            // oran siniri + gunluk kota
            const limits = deps.limits(kv);
            const decision = await limits.hit(caller.fam, caller.tid, deps.server.rateCostOf(rpcMethod, params));
            const quota = decision.ok && rpcMethod === 'tools/call' ? await limits.daily(caller.tid) : decision;
            if (!quota.ok) {
                done('rate_limited');
                res.setHeader('Retry-After', String(quota.retryAfterSec));
                if (rpcMethod === 'tools/call') {
                    const msg = quota.code === 'QUOTA_EXCEEDED' ? 'Daily MCP call quota of the plan is used up.' : 'Too many requests; slow down.';
                    res.status(200).json(rpcResult(id, toolErrorResult({ code: quota.code, message: msg, retryAfterSec: quota.retryAfterSec })));
                } else {
                    sendHttpError(res, 429, undefined, 'RATE_LIMITED');
                }
                return;
            }

            const { response, outcome } = await deps.server.handle(id, rpcMethod, params, caller);
            done(outcome === 'approval_required' ? 'ok' : outcome); // `approval_required` bir ISTEK sonucu olarak basaridir (denetimde ayri tutulur)
            send(res, response);
        } catch (e) {
            log.error({ err: e }, 'MCP istegi beklenmeyen hata');
            done('error');
            if (!res.headersSent) sendHttpError(res, 500, undefined, 'INTERNAL');
        }
    });
}

function send(res: Response, response: JsonRpcResponse): void {
    const json = JSON.stringify(response);
    if (Buffer.byteLength(json, 'utf8') > MAX_RESPONSE_BYTES) {
        const id = 'id' in response ? response.id : null;
        res.status(200).json(id === null ? rpcError(null, RPC_ERROR.INTERNAL, 'Response too large') : rpcResult(id, toolErrorResult({ code: 'PAYLOAD_TOO_LARGE', message: 'The response is too large; narrow the filters.' })));
        return;
    }
    res.status(200).type('application/json').send(json);
}

// ---- uretim bagimliliklari ------------------------------------------------------------------------------------------------
const isMaintenance = (): boolean => { try { return getPlatformSetting<boolean>('maintenance.enabled') === true; } catch { return false; } };

function prodDeps(): McpEndpointDeps {
    let auth: McpAuth | undefined;
    let server: McpServer | undefined;
    return {
        enabled: isMcpEnabled,
        get auth() {
            return (auth ??= new McpAuth({
                verify: (t) => Security.getInstance().verifyBearer(t, config.mcp.resourceUri ?? ''),
                familyActive: (f) => getOAuthRuntime().gate.isActive(f),
                identity: async (p) => (await resolveIdentity(p)).result,
                access: getMcpAccess,
                readonly: () => config.liveReadonly.enabled,
            }));
        },
        get server() { return (server ??= new McpServer({ tools: createToolRuntime({ isMaintenance }), approvals: getMcpApprovals(), version: config.version })); },
        kv: () => (RedisService.isReady() ? getAgentKv() : null),
        limits: (kv) => new McpLimits({ kv }),
        allowedOrigins: () => [
            ...parseCorsOrigins(config.server.cors.origins).origins,
            ...(config.mcp.appOrigin ? [config.mcp.appOrigin] : []),
            ...config.mcp.allowedOrigins,
        ],
        resourceUri: () => config.mcp.resourceUri ?? '',
    };
}

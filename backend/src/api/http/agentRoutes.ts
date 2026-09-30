// ADR-0034 / AGENT_BROKER_PLAN BR-1: `/api/agent/*` -- sohbet araci ucleri. `authenticate`'ten SONRA baglanir (cerez oturumu;
// res.locals.principal/actor). Tur = POST yaniti olarak SSE (ADR-0029 Karar 6 baslik/nabiz kurallari; RealtimeBus KULLANILMAZ).
// Kimlik/tenant yalniz oturumdan gelir (govdede tenant yok). Kalici sohbet kaydi yok (K38): gecici durum Redis'te.
// BR-1 uclari: GET /info, POST /turns, DELETE /conversations/:id. (confirm/more/provider: BR-2/BR-5.)
import type { Express, NextFunction, Request, Response } from 'express';
import { config } from '@config';
import { isFeatureEnabled } from '@integration/config/featureFlags';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { logger } from '@platform/core/logger';
import { AgentBroker, type AgentCtx } from '@operations/agent/AgentBroker';
import { getAgentKv } from '@operations/agent/kv';
import { isScriptedMode, resolveLlmProvider } from '@operations/agent/providerResolver';
import { CHAT_PROTOCOL_VERSION, LocaleSchema, TurnRequestSchema, type ServerEvent } from '@operations/agent/protocol/v1';
import { AppError } from '@platform/core/errors';
import { sendHttpError } from './errorEnvelope';
import type { Actor } from '../requestContext';

const log = logger.child({ module: 'agent.routes' });

export const AGENT_PATH = '/agent';
export const HEARTBEAT_MS = 15_000;

export interface AgentRouteDeps {
    broker(): AgentBroker;
    /** Test: nabiz araligi. */
    heartbeatMs?: number;
}

let singleton: AgentBroker | undefined;
/** Uretim broker'i: Redis (yoksa surec-ici bellek), `features.agent` bayragi, bakim modu, scripted/BYOK saglayici. */
export function getAgentBroker(): AgentBroker {
    singleton ??= new AgentBroker({
        kv: getAgentKv,
        isEnabled: () => isScriptedMode() || isFeatureEnabled('agent'),
        isMaintenance: () => { try { return getPlatformSetting<boolean>('maintenance.enabled') === true; } catch { return false; } },
        resolveProvider: resolveLlmProvider,
    });
    return singleton;
}

/** Oturumdan AgentCtx; yoksa yanit gonderilir ve null doner. */
function resolveCtx(res: Response): AgentCtx | null {
    const principal = res.locals.principal as { sub?: string; tid?: number; imp?: boolean } | undefined;
    const actor = res.locals.actor as Actor | undefined;
    if (!principal || typeof principal.sub !== 'string' || !actor) { sendHttpError(res, 401, undefined, 'UNAUTHENTICATED'); return null; }
    if (typeof principal.tid !== 'number') { sendHttpError(res, 403, 'Mağaza seçimi gerekli.', 'FORBIDDEN'); return null; }
    if (!actor.permissions.has('app:use')) { sendHttpError(res, 403, undefined, 'FORBIDDEN'); return null; }
    const imp = principal.imp === true;
    return {
        tid: principal.tid,
        userId: principal.sub,
        canConfigure: actor.permissions.has('settings:manage'),
        canConsent: actor.role === 'owner' && !imp,
        readOnly: config.liveReadonly.enabled || imp,
    };
}

function toNext(next: NextFunction, res: Response, e: unknown) {
    if (e instanceof AppError && e.code === 'RATE_LIMITED') {
        const s = (e.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
        if (s) res.setHeader('Retry-After', String(s));
    }
    if (e instanceof AppError && e.code === 'MAINTENANCE') res.setHeader('Retry-After', '60');
    // errorHandler 5xx AppError'u maskeler; bilincli uretilmis 503 (UNAVAILABLE/MAINTENANCE) iletisi/kodu burada aynen doner.
    if (e instanceof AppError && e.expose) { sendHttpError(res, e.status, e.message, e.code); return; }
    next(e);
}

export function configureAgentRoutes(app: Express, context: string, deps: AgentRouteDeps) {
    const base = `${context.replace(/\/+$/, '')}${AGENT_PATH}`;

    app.get(`${base}/info`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = resolveCtx(res);
            if (!ctx) return;
            const loc = LocaleSchema.safeParse(req.query.locale);
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(await deps.broker().info(ctx, loc.success ? loc.data : 'tr'));
        } catch (e) { toNext(next, res, e); }
    });

    app.delete(`${base}/conversations/:id`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = resolveCtx(res);
            if (!ctx) return;
            await deps.broker().reset(ctx, String(req.params.id));
            res.status(204).end();
        } catch (e) { toNext(next, res, e); }
    });

    app.post(`${base}/turns`, async (req: Request, res: Response, next: NextFunction) => {
        let run: Awaited<ReturnType<AgentBroker['beginTurn']>> | undefined;
        try {
            const ctx = resolveCtx(res);
            if (!ctx) return;
            const body = req.body as { v?: unknown } | undefined;
            if (body && typeof body === 'object' && body.v !== undefined && body.v !== CHAT_PROTOCOL_VERSION) {
                return sendHttpError(res, 400, undefined, 'PROTOCOL');
            }
            const parsed = TurnRequestSchema.safeParse(body);
            if (!parsed.success) {
                const paths = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(gövde)'))].slice(0, 5).join(', ');
                return sendHttpError(res, 400, `Geçersiz istek: ${paths}`, 'VALIDATION');
            }
            run = await deps.broker().beginTurn(ctx, parsed.data); // sinirlar: hata burada, SSE baslamadan

            const ac = new AbortController();
            let ended = false;
            res.on('close', () => { ended = true; if (!res.writableEnded) ac.abort(); }); // istemci koptu -> tur + saglayici iptali
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            });
            req.socket.setTimeout(0);
            req.socket.setNoDelay(true);
            req.socket.setKeepAlive(true);
            const flush = () => (res as unknown as { flush?: () => void }).flush?.();
            const write = (chunk: string) => { if (ended || res.writableEnded) return; res.write(chunk); flush(); };
            write(': open\n\n');
            const hb = setInterval(() => write(': ping\n\n'), deps.heartbeatMs ?? HEARTBEAT_MS);
            try {
                await run.run((e: ServerEvent) => write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`), ac.signal);
            } finally {
                clearInterval(hb);
                if (!res.writableEnded) res.end();
            }
        } catch (e) {
            if (res.headersSent) { log.error({ err: e }, 'Sohbet akisi hata'); if (!res.writableEnded) res.end(); return; }
            toNext(next, res, e);
        } finally {
            await run?.abandon();
        }
    });
}

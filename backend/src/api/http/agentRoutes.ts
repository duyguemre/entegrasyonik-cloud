// ADR-0034 / AGENT_BROKER_PLAN BR-1: `/api/agent/*` -- sohbet araci ucleri. `authenticate`'ten SONRA baglanir (cerez oturumu;
// res.locals.principal/actor). Tur = POST yaniti olarak SSE (ADR-0029 Karar 6 baslik/nabiz kurallari; RealtimeBus KULLANILMAZ).
// Kimlik/tenant yalniz oturumdan gelir (govdede tenant yok). Kalici sohbet kaydi yok (K38): gecici durum Redis'te.
// Uclar: GET /info, POST /turns (SSE), POST /confirm (SSE; onay/ret), POST /more (JSON; tablo sayfalama), DELETE /conversations/:id.
// BR-5 (BYOK): GET|PUT|DELETE /provider, POST /provider/test, POST /provider/consent -- YALNIZ settings:manage (consent: yalniz tenant SAHIBI);
// impersonation'da hepsi yasak (destek oturumu tenant anahtarini/onayini goremez/degistiremez); anahtar yanitlarda 'sensitive'.
// Yetenek kaydi girdileri: `capabilities/domains/agent.ts` (`bindings: [{ http }]`).
import type { Express, NextFunction, Request, Response } from 'express';
import { config } from '@config';
import { isFeatureEnabled } from '@integration/config/featureFlags';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { logger } from '@platform/core/logger';
import { AgentBroker, type AgentCtx } from '@operations/agent/AgentBroker';
import { getAgentKv } from '@operations/agent/kv';
import { isScriptedMode, resolveLlmProvider, resolveSetupState } from '@operations/agent/providerResolver';
import { ProviderService, ProviderTestFailed, getProviderService } from '@operations/agent/providerSettings';
import {
    CHAT_PROTOCOL_VERSION, ConfirmRequestSchema, LocaleSchema, MoreRequestSchema, ProviderConsentRequestSchema, ProviderSaveRequestSchema,
    ProviderTestRequestSchema, TurnRequestSchema, type ServerEvent,
} from '@operations/agent/protocol/v1';
import { createToolRuntime } from '@operations/agent/tools';
import { dbVerifyRefs } from '@operations/agent/refVerifiers';
import { resolveTier } from '@platform/core/authz/tier';
import { getClientIp } from '@platform/rateLimit/clientIp';
import { AppError } from '@platform/core/errors';
import { publicErrorExtras, sendHttpError } from './errorEnvelope';
import type { Actor } from '../requestContext';

const log = logger.child({ module: 'agent.routes' });

export const AGENT_PATH = '/agent';
export const HEARTBEAT_MS = 15_000;

export interface AgentRouteDeps {
    broker(): AgentBroker;
    /** Test: nabiz araligi. */
    heartbeatMs?: number;
    /** BR-5: BYOK ayar servisi (varsayilan: tekil canli servis). */
    providers?: () => ProviderService;
    /** Test: bakim modu (varsayilan: platform ayari). */
    isMaintenance?: () => boolean;
}

const isMaintenance = (): boolean => { try { return getPlatformSetting<boolean>('maintenance.enabled') === true; } catch { return false; } };

let singleton: AgentBroker | undefined;
/** Uretim broker'i: Redis (yoksa surec-ici bellek), `features.agent` bayragi, bakim modu, scripted/BYOK saglayici. */
export function getAgentBroker(): AgentBroker {
    singleton ??= new AgentBroker({
        kv: getAgentKv,
        isEnabled: () => isScriptedMode() || isFeatureEnabled('agent'),
        isMaintenance,
        resolveProvider: resolveLlmProvider,
        setupState: resolveSetupState,
        tools: createToolRuntime({ isMaintenance, verifyRefs: dbVerifyRefs }),
    });
    return singleton;
}

/** Oturumdan AgentCtx; yoksa yanit gonderilir ve null doner. */
function resolveCtx(req: Request, res: Response): AgentCtx | null {
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
        // Arac katmani oturumu: SUNUCUDA cozulmus kimlik (govdeden hicbir sey gelmez); tenant yalniz userContext.order'dan.
        session: {
            actor: resolveTier(res.locals.userContext, principal),
            invoke: { userContext: res.locals.userContext, principal, tenant: res.locals.tenant, ip: getClientIp(req) },
        },
    };
}

export function toNext(next: NextFunction, res: Response, e: unknown) {
    if (e instanceof AppError && e.code === 'RATE_LIMITED') {
        const s = (e.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
        if (s) res.setHeader('Retry-After', String(s));
    }
    if (e instanceof AppError && e.code === 'MAINTENANCE') res.setHeader('Retry-After', '60');
    // errorHandler 5xx AppError'u maskeler; bilincli uretilmis 503 (UNAVAILABLE/MAINTENANCE) iletisi/kodu burada aynen doner.
    if (e instanceof AppError && e.expose) { sendHttpError(res, e.status, e.message, e.code, publicErrorExtras(e)); return; }
    next(e);
}

/** ADR-0029 Karar 6 baslik/nabiz kurallariyla SSE yaniti; `fn` olaylari `emit` ile yazar. Istemci kopunca `signal` iptal olur. */
export async function streamSse(req: Request, res: Response, heartbeatMs: number, fn: (emit: (e: ServerEvent) => void, signal: AbortSignal) => Promise<void>): Promise<void> {
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
    const hb = setInterval(() => write(': ping\n\n'), heartbeatMs);
    try {
        await fn((e: ServerEvent) => write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`), ac.signal);
    } finally {
        clearInterval(hb);
        if (!res.writableEnded) res.end();
    }
}

export function configureAgentRoutes(app: Express, context: string, deps: AgentRouteDeps) {
    const base = `${context.replace(/\/+$/, '')}${AGENT_PATH}`;

    app.get(`${base}/info`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = resolveCtx(req, res);
            if (!ctx) return;
            const loc = LocaleSchema.safeParse(req.query.locale);
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(await deps.broker().info(ctx, loc.success ? loc.data : 'tr'));
        } catch (e) { toNext(next, res, e); }
    });

    app.delete(`${base}/conversations/:id`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = resolveCtx(req, res);
            if (!ctx) return;
            await deps.broker().reset(ctx, String(req.params.id));
            res.status(204).end();
        } catch (e) { toNext(next, res, e); }
    });

    // Onay/ret: model cagrilmaz; yurutme yalniz bu uctan. Gecersiz/suresi dolmus/baskasinin kaydi SSE baslamadan 4xx (410 CONFIRM_EXPIRED).
    app.post(`${base}/confirm`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = resolveCtx(req, res);
            if (!ctx) return;
            const body = req.body as { v?: unknown } | undefined;
            if (body && typeof body === 'object' && body.v !== undefined && body.v !== CHAT_PROTOCOL_VERSION) return sendHttpError(res, 400, undefined, 'PROTOCOL');
            const parsed = ConfirmRequestSchema.safeParse(body);
            if (!parsed.success) {
                const paths = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(gövde)'))].slice(0, 5).join(', ');
                return sendHttpError(res, 400, `Geçersiz istek: ${paths}`, 'VALIDATION');
            }
            const run = await deps.broker().beginConfirm(ctx, parsed.data);
            await streamSse(req, res, deps.heartbeatMs ?? HEARTBEAT_MS, (emit) => run.run(emit));
        } catch (e) {
            if (res.headersSent) { log.error({ err: e }, 'Onay akisi hata'); if (!res.writableEnded) res.end(); return; }
            toNext(next, res, e);
        }
    });

    // Tablo "daha fazla": LLM'siz dogrudan okuma; belirtec kullaniciya/tenant'a bagli, tek kullanimlik.
    app.post(`${base}/more`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = resolveCtx(req, res);
            if (!ctx) return;
            const parsed = MoreRequestSchema.safeParse(req.body);
            if (!parsed.success) return sendHttpError(res, 400, 'Geçersiz istek.', 'VALIDATION');
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(await deps.broker().more(ctx, parsed.data));
        } catch (e) { toNext(next, res, e); }
    });

    // ---- BR-5: BYOK saglayici kurulumu (yalniz settings:manage; impersonation YASAK; anahtar asla yanitta/logda) ----
    const providers = () => (deps.providers ?? getProviderService)();
    /** Kurulum uclari icin baglam: impersonation -> 403 IMPERSONATION_FORBIDDEN; izin yoksa 403 FORBIDDEN. `owner`: onay ucu (izin yerine sahiplik servis icinde). */
    const setupCtx = (req: Request, res: Response): AgentCtx | null => {
        const ctx = resolveCtx(req, res);
        if (!ctx) return null;
        if ((res.locals.principal as { imp?: boolean } | undefined)?.imp === true) { sendHttpError(res, 403, undefined, 'IMPERSONATION_FORBIDDEN'); return null; }
        if (!ctx.canConfigure) { sendHttpError(res, 403, undefined, 'FORBIDDEN'); return null; }
        return ctx;
    };
    const parseBody = <T,>(req: Request, res: Response, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: Array<string | number> }> } } }): T | null => {
        const body = req.body as { v?: unknown } | undefined;
        if (body && typeof body === 'object' && body.v !== undefined && body.v !== CHAT_PROTOCOL_VERSION) { sendHttpError(res, 400, undefined, 'PROTOCOL'); return null; }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
            const paths = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(gövde)'))].slice(0, 5).join(', ');
            sendHttpError(res, 400, `Geçersiz istek: ${paths}`, 'VALIDATION');
            return null;
        }
        return parsed.data;
    };
    const providerFail = (next: NextFunction, res: Response, e: unknown) => {
        if (e instanceof ProviderTestFailed) { res.setHeader('Cache-Control', 'no-store'); res.status(422).send(e.result); return; }
        toNext(next, res, e);
    };
    const blockInMaintenance = () => { if ((deps.isMaintenance ?? isMaintenance)()) throw AppError.of('MAINTENANCE'); };

    app.get(`${base}/provider`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = setupCtx(req, res);
            if (!ctx) return;
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(await providers().status(ctx));
        } catch (e) { providerFail(next, res, e); }
    });

    app.put(`${base}/provider`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = setupCtx(req, res);
            if (!ctx) return;
            const body = parseBody(req, res, ProviderSaveRequestSchema);
            if (!body) return;
            blockInMaintenance();
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(await providers().save(ctx, body));
        } catch (e) { providerFail(next, res, e); }
    });

    app.post(`${base}/provider/test`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = setupCtx(req, res);
            if (!ctx) return;
            const body = parseBody(req, res, ProviderTestRequestSchema);
            if (!body) return;
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(await providers().test(ctx, body));
        } catch (e) { providerFail(next, res, e); }
    });

    app.delete(`${base}/provider`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = setupCtx(req, res);
            if (!ctx) return;
            blockInMaintenance();
            await providers().remove(ctx);
            res.status(204).end();
        } catch (e) { providerFail(next, res, e); }
    });

    // KVKK aktarim onayi (K38): YALNIZ tenant sahibi (canConsent); admin anahtar girebilir ama onay veremez -> 403 FORBIDDEN.
    app.post(`${base}/provider/consent`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const ctx = resolveCtx(req, res);
            if (!ctx) return;
            if ((res.locals.principal as { imp?: boolean } | undefined)?.imp === true) return sendHttpError(res, 403, undefined, 'IMPERSONATION_FORBIDDEN');
            if (!ctx.canConsent) return sendHttpError(res, 403, 'Veri aktarım onayını yalnızca mağaza sahibi verebilir.', 'FORBIDDEN');
            const body = parseBody(req, res, ProviderConsentRequestSchema);
            if (!body) return;
            blockInMaintenance();
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(await providers().consent(ctx, body));
        } catch (e) { providerFail(next, res, e); }
    });

    app.post(`${base}/turns`, async (req: Request, res: Response, next: NextFunction) => {
        let run: Awaited<ReturnType<AgentBroker['beginTurn']>> | undefined;
        try {
            const ctx = resolveCtx(req, res);
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

            await streamSse(req, res, deps.heartbeatMs ?? HEARTBEAT_MS, (emit, signal) => run!.run(emit, signal));
        } catch (e) {
            if (res.headersSent) { log.error({ err: e }, 'Sohbet akisi hata'); if (!res.writableEnded) res.end(); return; }
            toNext(next, res, e);
        } finally {
            await run?.abandon();
        }
    });
}

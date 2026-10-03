// ADR-0035 Karar 6 / MCP_PLAN MCP-2: `/api/mcp/*` -- tenant MCP ayari + bagli uygulamalar (cerezli oturum; `authenticate`'ten SONRA baglanir; `agentRoutes` deseni).
// Uclar (MCP_UI_CONTRACT §4): GET|PUT /mcp/settings, GET /mcp/connections?scope=me|tenant, DELETE /mcp/connections/:id, POST /mcp/connections/revoke-all, GET /mcp/approvals (bekleyenler), GET|POST /mcp/approvals/:id (MCP-4: bant disi onay; yalniz sahibi).
// Kimlik/tenant YALNIZ oturumdan (govdede tenant yok). Impersonation/platform (ga) oturumunda HEPSI 403 IMPERSONATION_FORBIDDEN. MCP_ENABLED=false -> 404 (yuzey kapali).
// Yetenek kaydi girdileri: `capabilities/domains/mcp.ts`. Gercek ayar okuyucusu `setMcpAccessReader` ile BURADA baglanir (onay karari `MCP_TENANT_OFF`).
import type { Express, NextFunction, Request, Response } from 'express';
import { config } from '@config';
import { isMcpEnabled } from '@platform/core/security/oauthTokens';
import { AppError } from '@platform/core/errors';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { getMcpSettingsService, type McpSettingsService } from '@operations/mcp/mcpSettings';
import type { McpApprovals } from '@operations/mcp/mcpApprovals';
import type { AgentCtx } from '@operations/agent/types';
import { resolveTier } from '@platform/core/authz/tier';
import { getMcpApprovals } from '../../mcp/approvalsRuntime';
import { getClientIp } from '../clientIp';
import { ConnectionsService, type ConnectionsSession } from '../oauth/connections';
import { getOAuthRuntime } from '../oauth/routes';
import { setMcpAccessReader } from '../oauth/tenantAccess';
import { publicErrorExtras, sendHttpError } from './errorEnvelope';
import type { Actor } from '../requestContext';

export const MCP_PATH = '/mcp';

export interface McpRouteDeps {
    settings(): McpSettingsService;
    connections(): ConnectionsService;
    /** MCP-4: bant disi onay servisi (gorunum/liste/karar). */
    approvals(): McpApprovals;
    enabled(): boolean;
    /** Kullaniciya gosterilecek MCP adresi. */
    serverUrl(): string;
}

let prodConnections: ConnectionsService | undefined;
const prodDeps: McpRouteDeps = {
    settings: getMcpSettingsService,
    connections: () => (prodConnections ??= new ConnectionsService({
        ...getOAuthRuntime(),
        async tenantName(tid) {
            const app = await DatabaseManagerInstance.getApplicationDB();
            const d = await app.getClientModel().findOne({ order: tid }, 'title name').lean() as { title?: string; name?: string } | null;
            return String(d?.title ?? d?.name ?? `#${tid}`).slice(0, 120);
        },
        async userEmails(ids) {
            const app = await DatabaseManagerInstance.getApplicationDB();
            const rows = await app.getUserModel().find({ _id: { $in: ids } }, 'email').lean() as Array<{ _id: unknown; email?: string }>;
            return new Map(rows.map((r) => [String(r._id), String(r.email ?? '')]));
        },
    })),
    approvals: getMcpApprovals,
    enabled: isMcpEnabled,
    serverUrl: () => config.mcp.resourceUri ?? '',
};

interface Resolved { session: ConnectionsSession; actor: Actor; isOwner: boolean; ctx: AgentCtx }

/** Oturumdan baglam; yoksa yanit gonderilir ve null doner. Impersonation/platform oturumu burada reddedilir. */
function resolve(req: Request, res: Response): Resolved | null {
    const principal = res.locals.principal as { sub?: string; tid?: number; imp?: boolean; ga?: boolean } | undefined;
    const actor = res.locals.actor as Actor | undefined;
    if (!principal || typeof principal.sub !== 'string' || !actor) { sendHttpError(res, 401, undefined, 'UNAUTHENTICATED'); return null; }
    if (principal.imp === true || principal.ga === true || actor.imp === true) { sendHttpError(res, 403, undefined, 'IMPERSONATION_FORBIDDEN'); return null; }
    if (typeof principal.tid !== 'number') { sendHttpError(res, 403, 'Mağaza seçimi gerekli.', 'FORBIDDEN'); return null; }
    if (!actor.permissions.has('app:use')) { sendHttpError(res, 403, undefined, 'FORBIDDEN'); return null; }
    const tid = principal.tid;
    const ip = getClientIp(req);
    return {
        actor, isOwner: actor.role === 'owner',
        session: { tid, userId: principal.sub, canManageUsers: actor.permissions.has('users:manage'), ip },
        // Onay ucu arac baglami: SUNUCUDA cozulmus cerez oturumu (govdeden hicbir sey gelmez); `decide` yuzeyi 'mcp' olarak kurar.
        ctx: {
            tid, userId: principal.sub, canConfigure: false, canConsent: false, readOnly: config.liveReadonly.enabled, surface: 'mcp',
            session: { actor: resolveTier(res.locals.userContext, principal), invoke: { userContext: res.locals.userContext, principal, tenant: res.locals.tenant, ip } },
        },
    };
}

function fail(next: NextFunction, res: Response, e: unknown): void {
    if (e instanceof AppError && e.expose) { sendHttpError(res, e.status, e.message, e.code, publicErrorExtras(e)); return; }
    next(e);
}

export function configureMcpRoutes(app: Express, context: string, deps: McpRouteDeps = prodDeps) {
    const base = `${context.replace(/\/+$/, '')}${MCP_PATH}`;
    // Onay karari (`getMcpAccess`) ve ileride `/mcp` gercek ayari okur. Depo hatasi firlar -> cagiran reddeder (fail-closed).
    setMcpAccessReader((tid) => deps.settings().getAccess(tid));

    /** Tum uclarin ortak kapisi: yuzey kapali -> 404; oturum/imp -> resolve. */
    const guard = (req: Request, res: Response): Resolved | null => {
        if (!deps.enabled()) { sendHttpError(res, 404, 'İstenen yol bulunamadı.', 'NOT_FOUND'); return null; }
        res.setHeader('Cache-Control', 'no-store');
        return resolve(req, res);
    };

    app.get(`${base}/settings`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const r = guard(req, res);
            if (!r) return;
            if (!r.actor.permissions.has('settings:read')) return sendHttpError(res, 403, undefined, 'FORBIDDEN');
            const activeConnections = await deps.connections().count(r.session.tid);
            res.status(200).send(await deps.settings().view(r.session.tid, { canEdit: r.isOwner, serverUrl: deps.serverUrl(), activeConnections }));
        } catch (e) { fail(next, res, e); }
    });

    app.put(`${base}/settings`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const r = guard(req, res);
            if (!r) return;
            const body = (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) as { access?: unknown; acceptTextVersion?: unknown };
            await deps.settings().save({ tid: r.session.tid, userId: r.session.userId, isOwner: r.isOwner, imp: false, ip: r.session.ip }, body);
            const activeConnections = await deps.connections().count(r.session.tid);
            res.status(200).send(await deps.settings().view(r.session.tid, { canEdit: r.isOwner, serverUrl: deps.serverUrl(), activeConnections }));
        } catch (e) { fail(next, res, e); }
    });

    app.get(`${base}/connections`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const r = guard(req, res);
            if (!r) return;
            const scope = req.query.scope === undefined || req.query.scope === 'me' ? 'me' : req.query.scope === 'tenant' ? 'tenant' : null;
            if (!scope) return sendHttpError(res, 400, 'Geçersiz kapsam.', 'VALIDATION');
            res.status(200).send(await deps.connections().list(r.session, scope));
        } catch (e) { fail(next, res, e); }
    });

    // `revoke-all` sabit yol: `:id`'den ONCE tanimlanir (POST/DELETE ayri yontem oldugundan cakisma yok; yine de okunabilirlik icin once).
    app.post(`${base}/connections/revoke-all`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const r = guard(req, res);
            if (!r) return;
            res.status(200).send(await deps.connections().revokeAll(r.session));
        } catch (e) { fail(next, res, e); }
    });

    app.delete(`${base}/connections/:id`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const r = guard(req, res);
            if (!r) return;
            await deps.connections().revoke(r.session, String(req.params.id));
            res.status(204).end();
        } catch (e) { fail(next, res, e); }
    });

    // MCP-4 (ADR-0035 Karar 5): bant disi onay. Yalniz KAYDIN SAHIBI (ayni kullanici + ayni tenant) gorur/karar verir; digerleri 404.
    // `decide` yazma uctur: bakimda middleware 503 (onay ve ret), LIVE_READONLY'de onay 423 (servis; ret serbest), kota asimi 403 + upgradeUrl, sure 410 APPROVAL_EXPIRED.
    app.get(`${base}/approvals`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const r = guard(req, res);
            if (!r) return;
            if (req.query.status !== undefined && req.query.status !== 'pending') return sendHttpError(res, 400, 'Geçersiz durum filtresi.', 'VALIDATION');
            res.status(200).send(await deps.approvals().list(r.ctx));
        } catch (e) { fail(next, res, e); }
    });

    app.get(`${base}/approvals/:id`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const r = guard(req, res);
            if (!r) return;
            res.status(200).send(await deps.approvals().view(r.ctx, String(req.params.id)));
        } catch (e) { fail(next, res, e); }
    });

    app.post(`${base}/approvals/:id`, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const r = guard(req, res);
            if (!r) return;
            const decision = (req.body as { decision?: unknown } | undefined)?.decision;
            if (decision !== 'approve' && decision !== 'reject') return sendHttpError(res, 400, 'Geçersiz karar.', 'VALIDATION');
            res.status(200).send(await deps.approvals().decide(r.ctx, String(req.params.id), decision));
        } catch (e) { fail(next, res, e); }
    });
}

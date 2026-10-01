// BACKOFFICE_PLAN B11 — bakım modu ara katmanı. `maintenance.enabled` (`_platform`, bellek-içi, 15 sn head poll; istek başına DB YOK)
// açıkken tenant `/api` YAZMA istekleri 503 `MAINTENANCE` döner. Serbest: okuma yöntemleri (GET/HEAD/OPTIONS), kayıtlı `read`/`propose`
// etkili operasyonlar, giriş/çıkış/oturum akışları (aşağıdaki liste), küresel yönetici (bakımı kapatabilsin) ve `/api` DIŞI yollar
// (/health, /ready, /admin-api, webhook'lar bu ara katmandan önce/ayrı bağlıdır). Mesaj `maintenance.message` (public-config ile aynı kaynak).
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getPlatformSetting } from '@integration/config/platformSettings';
import { OPEN_OPERATIONS } from '@api/operationPolicy';
import { CAPABILITY_BY_RPC } from '../../capabilities';
import { ERROR_CODES } from '@platform/core/errors';
import { sendHttpError } from './errorEnvelope';

export const MAINTENANCE_RETRY_AFTER_SECONDS = 60;

/** Kimlik/oturum akışı: bakımda da çalışır (register HARİÇ: yeni tenant yaratır). */
const SESSION_EXEMPT: ReadonlySet<string> = new Set([
    ...OPEN_OPERATIONS.filter((o) => o !== 'SecurityService/register'),
    'SecurityService/selectStore', 'SecurityService/redeemImpersonation', 'SecurityService/endImpersonation', 'client-log',
].map((s) => s.toLowerCase()));

/**
 * Sohbet araci (`/api/agent/*`, ADR-0034 BR-3): bakimda ACIK. Okuma turlari calisir; yazma korumasi YETENEK duzeyindedir
 * (`invokeCapability`/arac listesi `isMaintenanceBlocked` ile ayni ilke: yazma araclari gizli, onay ucu 503 `MAINTENANCE`).
 * `agent/provider*` (BR-5: ayar yazimi) muaf DEGILDIR.
 */
const AGENT_EXEMPT = /^agent\/(turns|confirm|more|info|conversations\/[^/]+)$/i;

/** MCP-2: bagli uygulama IPTALI guvenlik islemidir; bakimda da calisir (ayar yazimi `PUT /mcp/settings` muaf DEGILDIR). */
const MCP_REVOKE_EXEMPT = /^mcp\/connections\/(revoke-all|[^/]+)$/i;

/** `relPath`: context önekinden sonraki yol ('Servis/operasyon'). Saf. */
export function isMaintenanceBlocked(method: string, relPath: string): boolean {
    const m = (method || '').toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
    const p = (relPath || '').replace(/^\/+|\/+$/g, '');
    if (SESSION_EXEMPT.has(p.toLowerCase())) return false;
    if (AGENT_EXEMPT.test(p)) return false;
    if (MCP_REVOKE_EXEMPT.test(p)) return false;
    if (m === 'POST') {
        const cap = CAPABILITY_BY_RPC.get(p);
        if (cap && (cap.effect === 'read' || cap.effect === 'propose')) return false;
    }
    return true; // bilinmeyen/yazma/PUT/PATCH/DELETE
}

export interface MaintenanceDeps { isEnabled: () => boolean; message: () => string }
const defaultDeps: MaintenanceDeps = {
    isEnabled: () => getPlatformSetting<boolean>('maintenance.enabled') === true,
    message: () => getPlatformSetting<string>('maintenance.message'),
};

/** `app.use(context, …)` ile bağlanır (req.path context'e göredir). */
export function createMaintenanceMiddleware(deps: MaintenanceDeps = defaultDeps): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        let block = false;
        let msg = '';
        try {
            block = deps.isEnabled() && isMaintenanceBlocked(req.method, req.path) && (res.locals?.principal as any)?.ga !== true;
            if (block) msg = deps.message();
        } catch {
            block = false; // fail-open: ayar okunamazsa trafiği kesme
        }
        if (!block) return next();
        res.setHeader('Retry-After', String(MAINTENANCE_RETRY_AFTER_SECONDS));
        sendHttpError(res, 503, msg || ERROR_CODES.MAINTENANCE.message, 'MAINTENANCE');
    };
}

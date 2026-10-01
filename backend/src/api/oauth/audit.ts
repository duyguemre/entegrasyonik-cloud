import { AuditLogger } from '@services/audit/AuditLogger';
import { metricsRegistry } from '@platform/runtime/metrics';

// ADR-0035 Karar 7: OAuth olaylari `AuditLogs` (surface:'mcp') + `oauth_events_total{event}` sayaci. Yalniz sub/tid/ip + kisa meta
// (clientId, fam, olay ayrintisi). Belirtec/ozet/kod/redirect URI LOGLANMAZ (sanitizeMeta anahtar filtresi de korur).
export type OAuthAuditEvent =
    | 'oauth.register' | 'oauth.consent_granted' | 'oauth.consent_denied' | 'oauth.token_issued' | 'oauth.refresh'
    | 'oauth.refresh_grace' | 'oauth.refresh_reuse' | 'oauth.code_reuse' | 'oauth.client_mismatch' | 'oauth.revoke'
    | 'oauth.grant_invalid' | 'oauth.resource_rejected';

export interface OAuthAuditInput {
    event: OAuthAuditEvent;
    result: 'ok' | 'fail';
    sub?: string;
    tid?: number;
    ip?: string;
    clientId?: string;
    fam?: string;
    detail?: string;
}

export type OAuditSink = (e: OAuthAuditInput) => void;

export const defaultOAuthAudit: OAuditSink = (e) => {
    try { metricsRegistry.incCounter('oauth_events_total', { event: e.event.slice('oauth.'.length) }); } catch { /* metrik hatasi yutulur */ }
    const meta: Record<string, string> = {};
    if (e.clientId) meta.clientId = e.clientId;
    if (e.fam) meta.fam = e.fam;
    if (e.detail) meta.detail = e.detail;
    void AuditLogger.log({ event: e.event, result: e.result, sub: e.sub, tid: e.tid, ip: e.ip, surface: 'mcp', actorType: 'user', meta });
};

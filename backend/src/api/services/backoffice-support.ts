// ADR-0026 WP-LOG L2: Backoffice log/denetim servislerinin ortak yardımcıları (yanıt kesme, filtre özeti, tek-kayıt hassas okuma denetimi).
import { ApplicationError } from '../Security';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getRequestId } from '@platform/core/context';
import { LogQueryError } from '@platform/runtime/logs';

export const RESPONSE_FIELD_MAX = 2048;

/** L1 doğrulama hatası -> 400 VALIDATION (ileti alan yolu içerir, değer içermez). */
export async function asValidation<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); } catch (e) {
        if (e instanceof LogQueryError) throw new ApplicationError(e.message, 400, 'VALIDATION');
        throw e;
    }
}

export function dateOf(v: unknown): Date | undefined { return typeof v === 'string' ? new Date(v) : undefined; }

const cut = (s: string): string => (s.length > RESPONSE_FIELD_MAX ? s.slice(0, RESPONSE_FIELD_MAX) : s);

/** `msg`/`ctx`/`sampleMessage` yanıtta <=2 KB; `ctx` büyükse `{ _truncated:true, preview }` olur (PII zaten yazımda maskeli, ek maskeleme yok). */
export function truncateLogEntry<T extends Record<string, any>>(row: T): T {
    const out: Record<string, any> = { ...row };
    if (typeof out.msg === 'string') out.msg = cut(out.msg);
    if (typeof out.sampleMessage === 'string') out.sampleMessage = cut(out.sampleMessage);
    if (out.ctx !== undefined && out.ctx !== null) {
        let json = '';
        try { json = JSON.stringify(out.ctx) ?? ''; } catch { json = ''; }
        if (json.length > RESPONSE_FIELD_MAX) out.ctx = { _truncated: true, preview: json.slice(0, RESPONSE_FIELD_MAX) };
    }
    return out as T;
}

/**
 * Hassas okuma denetimi: çağrı (= sayfa) başına TEK `backoffice.sensitive_read` kaydı; yalnız filtre ÖZETİ (ilkel, kısa; değerler AuditLogger.sanitizeMeta'dan geçer).
 * Toplu/agregat uçlar (issueGroups/issueTrend/volume) yazılmaz (gürültü). Best-effort: isteği düşürmez.
 */
export function auditSensitiveRead(request: any, service: string, operation: string, filters: Record<string, unknown>, resultCount: number): void {
    const meta: Record<string, string | number | boolean> = { service, operation, effect: 'read', rows: resultCount };
    let n = 0;
    for (const [k, v] of Object.entries(filters)) {
        if (v === undefined || v === null || k === 'cursor' || n >= 6) continue;
        meta['f_' + k] = Array.isArray(v) ? v.join(',').slice(0, 100) : typeof v === 'string' ? v.slice(0, 100) : typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 100);
        n++;
    }
    void AuditLogger.log({
        event: 'backoffice.sensitive_read', result: 'ok', sub: request?.principal?.sub, ip: request?.requestMeta?.ip,
        surface: 'backoffice', actorType: 'platform', reqId: getRequestId(), meta,
    });
}

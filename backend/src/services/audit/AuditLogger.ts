import type { AuditResult } from '@database/application/models/AuditLog';

// ADR-0001 Karar 11: asgari denetim kaydı (ApplicationDB.AuditLogs).
// BEST-EFFORT: yazma asenkron yapılır; hata YUTULUR ama loglanır — audit hatası asla isteği düşürmez.
// PII yalnızca sub/tid/ip; e-posta/parola/token/istek gövdesi yazılmaz (meta sanitize edilir).

export interface AuditEntry {
    event: string;
    result: AuditResult;
    sub?: string;
    tid?: number;
    ip?: string;
    meta?: Record<string, any>;
}

export type AuditSink = (record: Record<string, any>) => Promise<void>;

const FORBIDDEN_META_KEY = /pass|token|secret|mail|authorization|cookie|key/i;
const MAX_META_KEYS = 10;
const MAX_META_STRING = 200;

/** meta: küçük, düz, yalnızca ilkel değerler; hassas görünen anahtarlar atılır. */
export function sanitizeMeta(meta: any): Record<string, string | number | boolean> | undefined {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
    const out: Record<string, string | number | boolean> = {};
    let n = 0;
    for (const [k, v] of Object.entries(meta)) {
        if (n >= MAX_META_KEYS) break;
        if (FORBIDDEN_META_KEY.test(k)) continue;
        if (typeof v === 'string') out[k] = v.slice(0, MAX_META_STRING);
        else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
        else continue;
        n++;
    }
    return n > 0 ? out : undefined;
}

let customSink: AuditSink | undefined;

async function defaultSink(record: Record<string, any>): Promise<void> {
    // Lazy import: bu modülü yüklemek DB katmanını yüklemez
    const { DatabaseManagerInstance } = await import('@database/DatabaseManager');
    const db = await DatabaseManagerInstance.getApplicationDB();
    await db.getAuditLogModel().create(record);
}

export class AuditLogger {
    /** Test/özel depolama için. undefined => varsayılan (ApplicationDB.AuditLogs). */
    public static setSink(sink: AuditSink | undefined): void { customSink = sink; }

    /** AUDIT_LOG_DISABLED=true yalnızca test/geliştirme içindir (jest setup bunu açar). */
    private static isDisabled(): boolean { return process.env.AUDIT_LOG_DISABLED === 'true' && !customSink; }

    /**
     * Kaydı yazar. ASLA reddetmez (reject etmez) ve fırlatmaz; çağıranlar `void` ile bırakabilir, testler await edebilir.
     */
    public static log(entry: AuditEntry): Promise<void> {
        try {
            if (this.isDisabled()) return Promise.resolve();
            const record: Record<string, any> = { at: new Date(), event: entry.event, result: entry.result };
            if (entry.sub !== undefined && entry.sub !== null) record.sub = String(entry.sub);
            if (entry.tid !== undefined && entry.tid !== null && Number.isInteger(Number(entry.tid))) record.tid = Number(entry.tid);
            if (entry.ip) record.ip = String(entry.ip).slice(0, 64);
            const meta = sanitizeMeta(entry.meta);
            if (meta) record.meta = meta;
            const sink = customSink ?? defaultSink;
            // Asenkron: çağıran akışı bloklamaz; mikro görevde çalışır
            return Promise.resolve().then(() => sink(record)).catch((e: any) => {
                console.error('[AuditLogger] kayıt yazılamadı (best-effort):', e?.message);
            });
        } catch (e: any) {
            console.error('[AuditLogger] kayıt hazırlanamadı (best-effort):', e?.message);
            return Promise.resolve();
        }
    }

    /**
     * Servis istek nesnesinden (RunOperation'ın kurduğu `principal` + `requestMeta`) sub/tid/ip türetir.
     * `tid` doğrulanmış principal'dan gelir, gövdeden değil.
     */
    public static fromRequest(request: any, event: string, result: AuditResult, meta?: Record<string, any>, overrides: Partial<AuditEntry> = {}): Promise<void> {
        const principal = request?.principal;
        return AuditLogger.log({
            event,
            result,
            sub: principal?.sub,
            tid: principal?.tid,
            ip: request?.requestMeta?.ip,
            meta,
            ...overrides,
        });
    }
}

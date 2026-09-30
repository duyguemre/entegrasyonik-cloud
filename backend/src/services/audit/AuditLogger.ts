import type { AuditResult } from '@database/application/models/AuditLog';
import { metricsRegistry } from '@platform/runtime/metrics';

/** [ADR-0030 X4] Denetim yazım hatası sayacı (best-effort: istek düşmez, ama görünür olur). Metrik hatası yutulur. */
function countAuditFailure(): void { try { metricsRegistry.incCounter('audit_write_failures_total', {}, 1); } catch { /* yut */ } }

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
    // ADR-0026 Karar 4.8 / ADR-0028 §10 (geriye uyumlu, istege bagli): eylemi yapan aktor turu, adina islem yapilan tenant, yuzey, imp, istek kimligi.
    actorType?: AuditActorType;
    onBehalfOf?: number;
    surface?: AuditSurface;
    imp?: boolean;
    reqId?: string;
}

export type AuditActorType = 'user' | 'platform' | 'impersonator' | 'system';
export type AuditSurface = 'app' | 'backoffice';
const ACTOR_TYPES: ReadonlyArray<string> = ['user', 'platform', 'impersonator', 'system'];
const SURFACES: ReadonlyArray<string> = ['app', 'backoffice'];

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
    const { DatabaseManagerInstance } = (require('@database/DatabaseManager') as typeof import('@database/DatabaseManager'));
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
            if (entry.actorType && ACTOR_TYPES.includes(entry.actorType)) record.actorType = entry.actorType;
            if (entry.onBehalfOf !== undefined && entry.onBehalfOf !== null && Number.isInteger(Number(entry.onBehalfOf))) record.onBehalfOf = Number(entry.onBehalfOf);
            if (entry.surface && SURFACES.includes(entry.surface)) record.surface = entry.surface;
            if (entry.imp === true) record.imp = true;
            if (typeof entry.reqId === 'string' && entry.reqId) record.reqId = entry.reqId.slice(0, 64);
            const meta = sanitizeMeta(entry.meta);
            if (meta) record.meta = meta;
            const sink = customSink ?? defaultSink;
            // Asenkron: çağıran akışı bloklamaz; mikro görevde çalışır
            return Promise.resolve().then(() => sink(record)).catch((e: any) => {
                console.error('[AuditLogger] kayıt yazılamadı (best-effort):', e?.message);
                countAuditFailure();
            });
        } catch (e: any) {
            console.error('[AuditLogger] kayıt hazırlanamadı (best-effort):', e?.message);
            countAuditFailure();
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

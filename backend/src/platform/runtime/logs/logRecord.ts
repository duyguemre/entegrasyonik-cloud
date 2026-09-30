// ADR-0026 WP-LOG L1: `LogSinkRecord` -> `LogEvents` belgesi. Saf fonksiyon (DB YOK).
// Maskeleme: logger.ts zaten ZORUNLU maskeler; burada kalıcılaştırmadan ÖNCE İKİNCİ kontrol uygulanır (savunma derinliği --
// bir çağıranın kancayı/maske adımını atlatması halinde bile PII/sır DB'ye yazılmaz).
import type { LogSinkRecord } from '@platform/core/logger';
import { redactLogObject, maskLogText } from '@platform/core/logger';

export const LOG_TTL_DAYS = 14;
export const LOG_TTL_DAYS_LOW = 3;
export const CTX_MAX_BYTES = 2048;
export const MSG_MAX_CHARS = 1000;
const STACK_MAX_LINES = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const LEVEL_RANK: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
export const levelRank = (l: string): number => LEVEL_RANK[l] ?? 0;

export interface LogEventDoc {
    ts: Date;
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    source?: string;
    module?: string;
    code?: string;
    errorClass?: string;
    tenantId?: number;
    integrationCode?: string;
    operation?: string;
    correlationId?: string;
    durationMs?: number;
    msg?: string;
    fingerprint?: string;
    ctx?: Record<string, unknown>;
    expAt: Date;
}

/** Ayrı sütun olan alanlar (ctx'e KOPYALANMAZ) + pino/iç alanlar. */
const RESERVED = new Set([
    'ts', 'level', 'source', 'module', 'code', 'errorClass', 'tenantId', 'integrationCode', 'operation', 'correlationId',
    'durationMs', 'msg', 'fingerprint', 'fp', 'reqId', 'time', 'svc', 'role', 'pod', 'env', 'ver', 'err',
]);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
    return undefined;
};

function shrinkCtx(ctx: Record<string, unknown>): Record<string, unknown> | undefined {
    const keys = Object.keys(ctx);
    if (keys.length === 0) return undefined;
    let json: string;
    try { json = JSON.stringify(ctx); } catch { return { _unserializable: true, keys: keys.slice(0, 20) }; }
    if (Buffer.byteLength(json, 'utf8') <= CTX_MAX_BYTES) return ctx;
    // Sığmıyor: alan alan ekle, sığmayanı at (öncelik sırası = anahtar sırası) ve işaretle.
    const out: Record<string, unknown> = {};
    let used = 40;
    const dropped: string[] = [];
    for (const k of keys) {
        let piece: string;
        try { piece = JSON.stringify({ [k]: ctx[k] }); } catch { dropped.push(k); continue; }
        const b = Buffer.byteLength(piece, 'utf8');
        if (used + b <= CTX_MAX_BYTES) { out[k] = ctx[k]; used += b; } else dropped.push(k);
    }
    out._truncated = dropped.slice(0, 10);
    return out;
}

/** `rec` -> belge. `now` yalnız `ts` yoksa kullanılır. */
export function toLogEventDoc(rec: LogSinkRecord, now: Date = new Date()): LogEventDoc {
    // İKİNCİ maske kontrolü: alanlar (anahtar tabanlı + desen) ve metin.
    const f = redactLogObject(rec.fields) as Record<string, unknown>;
    const ctxIn = rec.ctx;
    const b = rec.bindings;

    const tsRaw = f.ts;
    const ts = tsRaw instanceof Date ? tsRaw : (typeof tsRaw === 'string' && !Number.isNaN(Date.parse(tsRaw)) ? new Date(tsRaw) : now);
    const level = (rec.level === 'trace' ? 'debug' : rec.level) as LogEventDoc['level'];

    const err = f.err && typeof f.err === 'object' ? (f.err as Record<string, unknown>) : undefined;
    const errType = str(err?.type);
    const rest: Record<string, unknown> = {};
    for (const k of Object.keys(f)) if (!RESERVED.has(k)) rest[k] = f[k];
    // child bağları (ör. integ/src) ctx'e girsin (module hariç: sütun)
    for (const k of Object.keys(b)) if (k !== 'module' && !RESERVED.has(k) && !(k in rest)) rest[k] = b[k];
    if (err) {
        const stack = str(err.stack);
        const message = str(err.message);
        rest.err = {
            type: errType, code: str(err.code), message: message ? maskLogText(message).slice(0, 500) : undefined,
            stack: stack ? maskLogText(stack.split('\n').slice(0, STACK_MAX_LINES).join('\n')) : undefined,
        };
    }

    const doc: LogEventDoc = {
        ts, level,
        source: str(f.source) ?? str(ctxIn?.source) ?? str(b.source) ?? str(b.src),
        module: str(b.module) ?? str(f.module),
        code: str(f.code) ?? str(err?.code),
        errorClass: str(f.errorClass) ?? errType,
        tenantId: num(f.tenantId) ?? num(ctxIn?.tenantId),
        integrationCode: str(f.integrationCode) ?? str(ctxIn?.integrationCode) ?? str(b.integ),
        operation: str(f.operation) ?? str(ctxIn?.operation) ?? str(b.op),
        correlationId: str(f.correlationId) ?? str(f.reqId) ?? str(ctxIn?.requestId),
        durationMs: num(f.durationMs),
        msg: typeof rec.msg === 'string' ? maskLogText(rec.msg).slice(0, MSG_MAX_CHARS) : undefined,
        fingerprint: str(f.fingerprint) ?? str(f.fp),
        ctx: shrinkCtx(rest),
        expAt: new Date(ts.getTime() + (levelRank(level) >= levelRank('warn') ? LOG_TTL_DAYS : LOG_TTL_DAYS_LOW) * DAY_MS),
    };
    for (const k of Object.keys(doc) as (keyof LogEventDoc)[]) if (doc[k] === undefined) delete doc[k];
    return doc;
}

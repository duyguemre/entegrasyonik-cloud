// [F-06 / BACKOFFICE_PLAN §2.9 Log Kontrol Merkezi L1] Yapılandırılmış OLAY log'u: bugünkü pino çıktısı, ileride
// `LogEvents` koleksiyonuna yazılacak şemayla UYUMLU alanlarla basılır:
//   ts, level, source, code, errorClass, tenantId, integrationCode, operation, correlationId, durationMs, msg, fingerprint
// - `ts`, `correlationId`, `tenantId`, `integrationCode`, `operation` AsyncLocalStorage bağlamından (logger.ts mixin) gelir;
//   açık verilen alan bağlamı ezer.
// - `fingerprint` = sha1(source | code | mesaj ŞABLONU)[0..16]; şablon: sayılar/uzun kimlikler/UUID normalize edilir ->
//   aynı hata farklı tenant/id/tekrar ile AYNI parmak izini üretir (kararlı).
// - Maskeleme logger.ts `mergeArgs` içinde ZORUNLU uygulanır (bu modül bypass edemez).
import { logger } from './logger';
import { computeFingerprint, classifyError } from './fingerprint';

/** LogEvents.source (BACKOFFICE_PLAN §2.9): api | engine | adapter-{platform} | worker | webhook | auth. */
export type LogSource = 'api' | 'engine' | 'worker' | 'webhook' | 'auth' | `adapter-${string}`;

export interface EventFields {
    tenantId?: number | string;
    integrationCode?: string;
    operation?: string;
    durationMs?: number;
    errorClass?: string;
    err?: unknown;
    [k: string]: unknown;
}

export interface EventLogger {
    debug(code: string, msg: string, fieldsOrErr?: EventFields | Error): void;
    info(code: string, msg: string, fieldsOrErr?: EventFields | Error): void;
    warn(code: string, msg: string, fieldsOrErr?: EventFields | Error): void;
    error(code: string, msg: string, fieldsOrErr?: EventFields | Error): void;
}

/**
 * Bir kaynak (`source`) ve modül adı için olay logger'ı. Tembeldir (kök logger ilk çağrıda kurulur).
 * `code` ZORUNLU (SCREAMING_SNAKE, ör. `PAGINATION_TRUNCATED`); `fieldsOrErr` bir `Error` ise `err`/`errorClass` türetilir.
 */
export function eventLog(source: LogSource, module?: string): EventLogger {
    const emit = (level: 'debug' | 'info' | 'warn' | 'error', code: string, msg: string, fieldsOrErr?: EventFields | Error) => {
        const fields: EventFields = fieldsOrErr instanceof Error ? { err: fieldsOrErr } : { ...(fieldsOrErr ?? {}) };
        const errorClass = fields.errorClass ?? classifyError(fields.err);
        const payload: Record<string, unknown> = { ...fields, source, code, fingerprint: computeFingerprint(source, code, msg) };
        if (errorClass !== undefined) payload.errorClass = errorClass;
        (module ? logger.child({ module }) : logger)[level](payload, msg);
    };
    return {
        debug: (c, m, f) => emit('debug', c, m, f),
        info: (c, m, f) => emit('info', c, m, f),
        warn: (c, m, f) => emit('warn', c, m, f),
        error: (c, m, f) => emit('error', c, m, f),
    };
}

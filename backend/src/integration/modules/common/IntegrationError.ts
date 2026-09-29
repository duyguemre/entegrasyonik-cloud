// ADR-0006 Karar 2: tüm IPlatform metotları için bağlayıcı hata sözleşmesi.
// Sahte başarı / hata yutma (catch->[]/null/{}/true, boş catch) YASAK; bu tip fırlatılır.

export type IntegrationErrorCode =
    | 'AUTH'
    | 'RATE_LIMITED'
    | 'UNAVAILABLE'
    | 'VALIDATION'
    | 'NOT_FOUND'
    | 'NOT_SUPPORTED'
    | 'UNKNOWN_OUTCOME'
    | 'INTERNAL';

/**
 * Hangi kodların "retryable" sayıldığı (ADR'de kod başına açık liste yok; bu, üst katmanın
 * -- OrderErrorHandler/Publisher -- DLQ'ya düşürmeden bekleyebileceği durumları işaretler).
 * Karar (bu görevde alınmıştır, ADR'de açık değildir -- bulgu olarak raporlanmıştır):
 *   RATE_LIMITED / UNAVAILABLE / UNKNOWN_OUTCOME => retryable (geçici / doğrulanmalı)
 *   AUTH / VALIDATION / NOT_FOUND / NOT_SUPPORTED / INTERNAL => retryable değil (DLQ)
 */
const RETRYABLE_CODES: ReadonlySet<IntegrationErrorCode> = new Set(['RATE_LIMITED', 'UNAVAILABLE', 'UNKNOWN_OUTCOME']);

export interface IntegrationErrorInit {
    integrationCode: string;
    operation: string;
    clientId: string | number;
    httpStatus?: number;
    retryAfterMs?: number;
    platformCode?: string;
    circuitOpen?: boolean;
}

// Mesajdaki olası kimlik bilgisi/PII'yi temizler (loglama/redaction ADR'siyle uyumlu).
const SENSITIVE_KV = /((?:pass\w*|token|secret\w*|auth\w*|apikey|api[_-]?key|cookie|key)\s*[:=]\s*)("?)([^\s"&,;]+)\2/gi;
const BEARER = /Bearer\s+[A-Za-z0-9\-_.]+/gi;
const BASIC = /Basic\s+[A-Za-z0-9+/=]+/gi;
const MAX_MESSAGE_LEN = 500;

export function redactMessage(message: unknown): string {
    let msg = typeof message === 'string' ? message : String(message ?? 'Bilinmeyen hata');
    msg = msg.replace(BEARER, 'Bearer ***').replace(BASIC, 'Basic ***');
    msg = msg.replace(SENSITIVE_KV, (_m, prefix, quote) => `${prefix}${quote}***${quote}`);
    if (msg.length > MAX_MESSAGE_LEN) msg = `${msg.slice(0, MAX_MESSAGE_LEN)}…`;
    return msg;
}

export class IntegrationError extends Error {
    public readonly code: IntegrationErrorCode;
    public readonly retryable: boolean;
    public readonly integrationCode: string;
    public readonly operation: string;
    public readonly clientId: string | number;
    public readonly httpStatus?: number;
    public readonly retryAfterMs?: number;
    public readonly platformCode?: string;
    public readonly circuitOpen?: boolean;

    constructor(code: IntegrationErrorCode, message: string, ctx: IntegrationErrorInit) {
        // `[CODE]` öneki bilinçlidir: BullMQ QueueEvents 'failed' olayı yalnızca `failedReason` STRING'i
        // taşır (Redis'e serileştirilirken code/retryable gibi ek alanlar kaybolur). OrderErrorHandler
        // gibi tüketiciler bu öneki ayrıştırarak metin eşleştirmesi yerine gerçek koda göre karar verir
        // (bkz. OrderErrorHandler.categorizeError). Kod adları PII içermez, redaction'dan ÖNCE eklenir.
        super(`[${code}] ${redactMessage(message)}`);
        this.name = 'IntegrationError';
        this.code = code;
        this.retryable = RETRYABLE_CODES.has(code);
        this.integrationCode = ctx.integrationCode;
        this.operation = ctx.operation;
        this.clientId = ctx.clientId;
        this.httpStatus = ctx.httpStatus;
        this.retryAfterMs = ctx.retryAfterMs;
        this.platformCode = ctx.platformCode;
        this.circuitOpen = ctx.circuitOpen;
        Object.setPrototypeOf(this, IntegrationError.prototype);
    }

    public static isIntegrationError(err: unknown): err is IntegrationError {
        return !!err && typeof err === 'object' && (err as any).name === 'IntegrationError' && typeof (err as any).code === 'string';
    }
}

export interface FromHttpErrorOptions extends IntegrationErrorInit {
    /** true => okuma (GET/okuma amaçlı); belirsiz sonuçlar (timeout/5xx) UNAVAILABLE olur.
     *  false => yazma; belirsiz sonuçlar (timeout/5xx/ECONNRESET vb.) UNKNOWN_OUTCOME olur,
     *  kesin-gönderilmedi bağlantı hataları (ECONNREFUSED/DNS) UNAVAILABLE olur. */
    idempotent: boolean;
    /** true ise breaker açık durumdaydı, gerçek istek atılmadı. */
    circuitOpen?: boolean;
}

const DNS_OR_REFUSED_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

function isTimeoutLike(err: any): boolean {
    return !!err && (
        err.isTaskCancelledError === true ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ETIMEDOUT' ||
        err.name === 'AbortError' ||
        err.code === 'ERR_CANCELED'
    );
}

/**
 * Herhangi bir hatayı (axios hatası, cockatiel hatası, ağ hatası) IntegrationError'a çevirir.
 * Bağlayıcılar/servisler kendi `catch` bloklarında bunu kullanmalı; asla [] / null / true dönmemeli.
 */
export function fromHttpError(err: any, ctx: FromHttpErrorOptions): IntegrationError {
    if (IntegrationError.isIntegrationError(err)) return err;

    const status: number | undefined = err?.response?.status ?? err?.httpStatus;
    const rawMessage = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Bilinmeyen hata';

    if (ctx.circuitOpen || err?.isBrokenCircuitError) {
        return new IntegrationError('UNAVAILABLE', 'Entegrasyon devresi açık (circuit breaker); istek gönderilmedi.', { ...ctx, circuitOpen: true, httpStatus: status });
    }

    if (status === 401 || status === 403) {
        return new IntegrationError('AUTH', rawMessage, { ...ctx, httpStatus: status });
    }
    if (status === 429) {
        return new IntegrationError('RATE_LIMITED', rawMessage, { ...ctx, httpStatus: status });
    }
    if (status === 404) {
        return new IntegrationError('NOT_FOUND', rawMessage, { ...ctx, httpStatus: status });
    }
    if (status !== undefined && status >= 400 && status < 500 && status !== 408) {
        return new IntegrationError('VALIDATION', rawMessage, { ...ctx, httpStatus: status });
    }

    const uncertain = status === 408 || (status !== undefined && status >= 500) || isTimeoutLike(err) ||
        (!status && err?.code && !DNS_OR_REFUSED_CODES.has(err.code));

    if (uncertain) {
        return new IntegrationError(
            ctx.idempotent ? 'UNAVAILABLE' : 'UNKNOWN_OUTCOME',
            rawMessage,
            { ...ctx, httpStatus: status }
        );
    }

    if (!status && err?.code && DNS_OR_REFUSED_CODES.has(err.code)) {
        // Kesin olarak gönderilmedi (bağlantı hiç kurulamadı) -> güvenle UNAVAILABLE.
        return new IntegrationError('UNAVAILABLE', rawMessage, { ...ctx, httpStatus: status });
    }

    return new IntegrationError('INTERNAL', rawMessage, { ...ctx, httpStatus: status });
}

// ADR-0034 / BR-5: saglayici HTTP hatasi -> LlmErrorCode. SAF (ag/log yok). Ham govde/mesaj sonuca GIRMEZ: yalniz sinif + retryAfterSec.
import { LlmError, type LlmErrorCode } from './LlmProvider';

export interface ProviderErrorInfo {
    /** `error.type` (Anthropic/OpenAI) ya da `error.status` (Google: RESOURCE_EXHAUSTED...). */
    type?: string;
    /** `error.code` (OpenAI: insufficient_quota) ya da Google `details[].reason` (API_KEY_INVALID). */
    code?: string;
    /** YALNIZ siniflandirma icin okunur; saklanmaz/loglanmaz/donmez. */
    message?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v.slice(0, 300) : undefined);

/** Saglayici hata govdesinden (JSON) siniflandirma ipuclari. Bozuk/beklenmeyen govde -> bos. */
export function extractErrorInfo(body: unknown): ProviderErrorInfo {
    if (!body || typeof body !== 'object') return {};
    const err = (body as { error?: unknown }).error;
    if (!err || typeof err !== 'object') return {};
    const e = err as { type?: unknown; status?: unknown; code?: unknown; message?: unknown; details?: unknown };
    let code = str(e.code);
    if (!code && Array.isArray(e.details)) {
        for (const d of e.details) { const r = str((d as { reason?: unknown })?.reason); if (r) { code = r; break; } }
    }
    return { type: str(e.type) ?? str(e.status), code, message: str(e.message) };
}

const TYPE_TO_CODE: Readonly<Record<string, LlmErrorCode>> = {
    authentication_error: 'LLM_KEY_INVALID', permission_error: 'LLM_KEY_INVALID', invalid_api_key: 'LLM_KEY_INVALID',
    UNAUTHENTICATED: 'LLM_KEY_INVALID', PERMISSION_DENIED: 'LLM_KEY_INVALID', API_KEY_INVALID: 'LLM_KEY_INVALID',
    insufficient_quota: 'LLM_QUOTA', billing_not_active: 'LLM_QUOTA',
    rate_limit_error: 'LLM_RATE_LIMITED', rate_limit_exceeded: 'LLM_RATE_LIMITED', RESOURCE_EXHAUSTED: 'LLM_RATE_LIMITED',
    not_found_error: 'LLM_MODEL_UNAVAILABLE', model_not_found: 'LLM_MODEL_UNAVAILABLE', NOT_FOUND: 'LLM_MODEL_UNAVAILABLE',
    overloaded_error: 'LLM_UNAVAILABLE', api_error: 'LLM_UNAVAILABLE', server_error: 'LLM_UNAVAILABLE', UNAVAILABLE: 'LLM_UNAVAILABLE', INTERNAL: 'LLM_UNAVAILABLE',
};

/** `Retry-After`: saniye ya da HTTP tarihi -> [1, 3600] tam saniye; yoksa/gecersizse undefined. */
export function parseRetryAfter(v: string | null | undefined, now: number = Date.now()): number | undefined {
    if (!v) return undefined;
    const s = v.trim();
    let sec: number;
    if (/^\d+(\.\d+)?$/.test(s)) sec = Math.ceil(Number(s));
    else { const t = Date.parse(s); if (Number.isNaN(t)) return undefined; sec = Math.ceil((t - now) / 1000); }
    if (!Number.isFinite(sec)) return undefined;
    return Math.min(3600, Math.max(1, sec));
}

const QUOTA_MESSAGE = /credit balance|insufficient[_ ]quota|billing (is )?(not|in)active|exceeded your current quota|payment required|out of credits/i;

export interface ClassifyInput extends ProviderErrorInfo {
    /** HTTP durumu; akis ICI hatada 0/200 verilir (sinif `type`tan cikar). */
    status: number;
    retryAfter?: string | null;
}

export function classifyProviderError(i: ClassifyInput): LlmError {
    const { status } = i;
    const byType = (i.code && TYPE_TO_CODE[i.code]) || (i.type && TYPE_TO_CODE[i.type]);
    const quotaHint = i.type === 'insufficient_quota' || i.code === 'insufficient_quota' || i.code === 'billing_not_active'
        || (i.message !== undefined && QUOTA_MESSAGE.test(i.message) && status !== 429) || status === 402 || (i.type === 'FAILED_PRECONDITION' && /billing/i.test(i.message ?? ''));
    // OpenAI insufficient_quota 429 doner: hiz siniri DEGIL, kredi bitti.
    const quota429 = status === 429 && (i.type === 'insufficient_quota' || i.code === 'insufficient_quota');
    if (quotaHint || quota429) return new LlmError('LLM_QUOTA');
    if (i.code === 'model_not_found' || i.type === 'not_found_error' || status === 404) return new LlmError('LLM_MODEL_UNAVAILABLE');
    if (i.code === 'API_KEY_INVALID' || i.code === 'invalid_api_key') return new LlmError('LLM_KEY_INVALID');
    if (status === 401 || status === 403) return new LlmError('LLM_KEY_INVALID');
    if (status === 429 || byType === 'LLM_RATE_LIMITED') {
        const retryAfterSec = parseRetryAfter(i.retryAfter);
        return new LlmError('LLM_RATE_LIMITED', retryAfterSec !== undefined ? { retryAfterSec } : {});
    }
    if (byType && status < 500) return new LlmError(byType);
    return new LlmError('LLM_UNAVAILABLE'); // 5xx (529 dahil), 408, gecersiz istek (400: bizim hatamiz), bilinmeyen
}

/** Ag/zaman asimi/akis kesilmesi -> LLM_UNAVAILABLE (ayrinti ham hata loglanmaz). */
export const networkError = (): LlmError => new LlmError('LLM_UNAVAILABLE');

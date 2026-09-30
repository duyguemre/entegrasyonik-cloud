// ADR-0029 Karar 8 / N-05: kullaniciya giden bildirimde ham `error.message` YASAK. Hata nesnesi -> guvenli hata kodu.
// Kaynak: `AppError.code` / `IntegrationError.code` gibi SCREAMING_SNAKE kodlar; yoksa hata sinifina gore genel kod.
// Ham ileti/stack/URL/sir HICBIR yolla params'a girmez.

const CODE_RE = /^[A-Z][A-Z0-9_]{1,59}$/;

/** Bilinen hata kodlari -> kullaniciya gosterilebilir sabit metin (i18n yedegi; ham ileti degil). */
export const SAFE_ERROR_MESSAGES: Record<string, { tr: string; en: string }> = {
    UPSTREAM_TIMEOUT: { tr: 'Pazaryeri zamanında yanıt vermedi.', en: 'The marketplace did not respond in time.' },
    UPSTREAM_UNAVAILABLE: { tr: 'Pazaryeri geçici olarak ulaşılamıyor.', en: 'The marketplace is temporarily unavailable.' },
    AUTH_FAILED: { tr: 'Kimlik bilgileri reddedildi.', en: 'Credentials were rejected.' },
    RATE_LIMITED: { tr: 'İstek sınırı aşıldı; daha sonra yeniden denenecek.', en: 'Rate limit exceeded; will retry later.' },
    VALIDATION_FAILED: { tr: 'Gönderilen veri doğrulamadan geçemedi.', en: 'The submitted data failed validation.' },
    UNEXPECTED_ERROR: { tr: 'Beklenmeyen bir hata oluştu.', en: 'An unexpected error occurred.' },
};

export function safeErrorCode(err: unknown): string {
    const code = (err as { code?: unknown } | null | undefined)?.code;
    if (typeof code === 'string' && CODE_RE.test(code)) return code;
    if (typeof err === 'string' && CODE_RE.test(err)) return err;
    return 'UNEXPECTED_ERROR';
}

export function safeErrorMessage(code: string, locale: 'tr' | 'en' = 'tr'): string {
    return (SAFE_ERROR_MESSAGES[code] ?? SAFE_ERROR_MESSAGES.UNEXPECTED_ERROR)[locale];
}

const ERROR_KEYS = ['error', 'err', 'exception', 'cause'];

/**
 * params icindeki hata nesnesini/metnini (`error`, `err`, ...) atar; yerine `errorCode` koyar (yoksa). Diger alanlara dokunmaz.
 * Sema `strict` oldugundan hata nesnesi/ham ileti zaten reddedilirdi; bu adim cagirani "fail" yerine guvenli koda cevirir.
 */
export function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...params };
    for (const k of ERROR_KEYS) {
        if (k in out) {
            if (out.errorCode === undefined) out.errorCode = safeErrorCode(out[k]);
            delete out[k];
        }
    }
    return out;
}

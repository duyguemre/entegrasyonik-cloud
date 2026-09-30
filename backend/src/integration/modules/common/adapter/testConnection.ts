// INT-01 (testConnection): adaptörlerin `IPlatform.testConnection()` için ortak sonuç eşlemesi. Tek yer; adaptörler yalnız
// "en ucuz, yan etkisiz, kimlik doğrulamalı okuma"yı (probe) verir, hata -> sonuç kodu eşlemesi burada yapılır.
// Sözleşme: ASLA fırlatmaz; `detail` sabit kısa Türkçe metindir (ham hata mesajı/URL/başlık/kimlik bilgisi/PII ASLA yazılmaz).
import { IntegrationError, fromHttpError } from '../IntegrationError';

export type TestConnectionCode = 'OK' | 'AUTH_FAILED' | 'UNREACHABLE' | 'RATE_LIMITED' | 'UNKNOWN';

export interface TestConnectionResult {
    ok: boolean;
    code: TestConnectionCode;
    /** Kısa, sır/PII içermeyen açıklama (sabit metinler; en fazla HTTP durum kodu eklenir). */
    detail?: string;
}

const DETAIL: Record<Exclude<TestConnectionCode, 'OK'>, string> = {
    AUTH_FAILED: 'Kimlik bilgileri pazaryeri/servis tarafından reddedildi.',
    UNREACHABLE: 'Servise ulaşılamadı (ağ, zaman aşımı veya servis geçici olarak kullanılamıyor).',
    RATE_LIMITED: 'İstek sınırına takıldı; biraz sonra tekrar deneyin.',
    UNKNOWN: 'Bağlantı doğrulanamadı.',
};

/** Hata -> sonuç. IntegrationError ise koduna göre; değilse HTTP hata sınıflandırıcısından geçirilir. */
export function mapConnectionError(err: unknown, integrationCode: string): TestConnectionResult {
    const ie = IntegrationError.isIntegrationError(err)
        ? err
        : fromHttpError(err, { integrationCode, operation: 'testConnection', clientId: 'testConnection', idempotent: true });
    const status = ie.httpStatus ? ` (HTTP ${ie.httpStatus})` : '';
    switch (ie.code) {
        case 'AUTH': return { ok: false, code: 'AUTH_FAILED', detail: DETAIL.AUTH_FAILED + status };
        case 'RATE_LIMITED': return { ok: false, code: 'RATE_LIMITED', detail: DETAIL.RATE_LIMITED };
        case 'UNAVAILABLE': return { ok: false, code: 'UNREACHABLE', detail: DETAIL.UNREACHABLE };
        default: return { ok: false, code: 'UNKNOWN', detail: DETAIL.UNKNOWN + status };
    }
}

/** Probe başarıyla döndüyse OK; fırlatırsa eşlenir. Asla fırlatmaz. */
export async function runConnectionProbe(integrationCode: string, probe: () => Promise<unknown>): Promise<TestConnectionResult> {
    try {
        await probe();
        return { ok: true, code: 'OK' };
    } catch (err) {
        return mapConnectionError(err, integrationCode);
    }
}

/**
 * [eslesme-fiyat WP1, D-ERR-1] Kanal hata metni/kodu → `IntegrationIssue` çevirisi (ortak çekirdek).
 *
 * Her adaptör `modules/<tür>/<kanal>/errorMap.ts` içinde kendi kural listesini tutar (pazaryeri mesajı/kodu → issue kodu);
 * ortak kurallar (dönüştürücülerin yerel `validate` gerekçeleri) her kanala ÖNCE uygulanır. Eşleşmeyen metin → `PLATFORM_REJECTED`
 * + maskeli ham metin (`platformMessage`). `IntegrationError` kodları (AUTH/RATE_LIMITED/UNAVAILABLE) doğrudan çevrilir.
 */
import { IntegrationIssue, IntegrationIssueCode, IssueContext, IssueError, makeIssue } from '@platform/core/errors/integrationIssues';
import { IntegrationError } from '../IntegrationError';

export interface ErrorMapRule {
    /** Kanal metni (büyük/küçük harf duyarsız) ya da kanal hata kodu (`platformCode`) üzerinde denenir. */
    match: RegExp;
    code: IntegrationIssueCode;
    field?: string;
}

/** Dönüştürücülerin (TY/HB/N11/PZ/IS `transformer.validate`) ortak yerel gerekçeleri + Validator'ın eski düz metinleri. */
export const COMMON_ERROR_RULES: readonly ErrorMapRule[] = [
    { match: /barkod eksik/i, code: 'BARCODE_MISSING', field: 'barcode' },
    { match: /fiyat ge[çc]ersiz/i, code: 'PRICE_INVALID', field: 'prices.salePrice' },
    { match: /sat[ıi][şs]\s*>\s*liste/i, code: 'PRICE_ABOVE_LIST', field: 'prices.marketPrice' },
    { match: /stok ge[çc]ersiz/i, code: 'STOCK_INVALID', field: 'stock' },
    { match: /zaten g[öo]nderilmi[şs]/i, code: 'ALREADY_SENT' },
    { match: /kategorisi bulunamad/i, code: 'PRODUCT_CATEGORY_MISSING', field: 'category' },
    { match: /markas[ıi] bulunamad/i, code: 'PRODUCT_BRAND_MISSING', field: 'brand' },
    { match: /ana kayd[ıi] bulunamad/i, code: 'PRODUCT_NOT_FOUND' },
    { match: /varyant ana tabloda bulunamad/i, code: 'VARIANT_NOT_FOUND' },
];

const INTEGRATION_ERROR_CODES: Partial<Record<string, IntegrationIssueCode>> = {
    AUTH: 'AUTH_FAILED', RATE_LIMITED: 'RATE_LIMITED', UNAVAILABLE: 'PLATFORM_UNAVAILABLE', INTERNAL: 'SYSTEM_ERROR',
};

/** `[CODE] ` önekleri atılır (IntegrationError/Validator biçimi). */
const stripPrefixes = (msg: string) => msg.replace(/^(\[.*?\]\s*)+/, '');

/** Tek kanal metnini issue'ya çevirir; önce ortak (kesin metinli yerel gerekçe) kurallar, sonra kanalın genel desenleri. */
export function mapPlatformMessage(message: unknown, ctx: IssueContext, rules: readonly ErrorMapRule[] = [], platformCode?: string): IntegrationIssue {
    const text = stripPrefixes(typeof message === 'string' ? message : String(message ?? ''));
    for (const rule of [...COMMON_ERROR_RULES, ...rules]) {
        if (rule.match.test(text) || (platformCode && rule.match.test(platformCode))) {
            return makeIssue(rule.code, { ...ctx, field: ctx.field ?? rule.field, platformMessage: text });
        }
    }
    return makeIssue('PLATFORM_REJECTED', { ...ctx, platformMessage: text || undefined });
}

/** Herhangi bir hatayı issue listesine çevirir (IssueError → kendi issue'ları; IntegrationError → kod; diğer → metin kuralları). */
export function issuesFromError(err: unknown, ctx: IssueContext, rules: readonly ErrorMapRule[] = []): IntegrationIssue[] {
    if (IssueError.is(err)) return err.issues;
    if (IntegrationError.isIntegrationError(err)) {
        const mapped = INTEGRATION_ERROR_CODES[err.code];
        if (mapped) return [makeIssue(mapped, { ...ctx, platformMessage: stripPrefixes(err.message) })];
        return [mapPlatformMessage(err.message, ctx, rules, err.platformCode)];
    }
    return [mapPlatformMessage((err as any)?.message ?? err, ctx, rules)];
}

/**
 * [eslesme-fiyat WP5, D-PRICE-2, Ek B P1-3] KDV oranının TEK çözümleyicisi.
 *
 * Kural: `null`/boş = AYARSIZ; `0` GEÇERLİ bir orandır. Sıra: kanal eşleme ayarı (`platforms[kod].mapping.taxPercentage`) →
 * ürün (`Products.taxPercentage`) → tenant kanal ayarı (`settings.taxPercentage`). İzinli oranlar {0, 1, 10, 20}.
 * Sessiz varsayılanlar (HB/PZ/TY/N11 20, Ideasoft 18) KALDIRILDI: çözülemeyen KDV içerik gönderiminde engelleyici sorundur
 * (`VAT_MISSING`), ürün düzeyinde 0 ise uyarı (`VAT_ZERO_CHECK`; eski kayıtlarda şema varsayılanı 0 "ayarsız" anlamına geliyordu).
 * Saf modül; adaptörler ve hazırlık denetimi kullanır (adaptörler `operations` içe aktaramaz → `platform/core`).
 */

export const VAT_RATES = [0, 1, 10, 20] as const;
export type VatSource = 'channelMapping' | 'product' | 'settings' | 'none';

export interface VatResolution {
    value: number | null;
    source: VatSource;
    /** Ham değer izinli kümede değil (ör. eski %18). `value` yine sayıdır; çağıran reddeder. */
    invalid: boolean;
}

const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';

export function isValidVat(v: unknown): boolean {
    return filled(v) && (VAT_RATES as readonly number[]).includes(Number(v));
}

export function resolveVatRate(variant: any, code: string, settings?: Record<string, any> | null, product?: any): VatResolution {
    const p = product ?? variant?.product;
    const chain: Array<[VatSource, unknown]> = [
        ['channelMapping', variant?.platforms?.[code]?.mapping?.taxPercentage],
        ['product', p?.taxPercentage],
        ['settings', settings?.taxPercentage],
    ];
    for (const [source, raw] of chain) {
        if (!filled(raw)) continue;
        const n = Number(raw);
        return { value: Number.isFinite(n) ? n : null, source, invalid: !(VAT_RATES as readonly number[]).includes(n) };
    }
    return { value: null, source: 'none', invalid: false };
}

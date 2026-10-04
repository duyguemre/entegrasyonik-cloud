/**
 * [eslesme-fiyat WP5, PLAN §3.4, Ek B P1-1] "Bu kanala hangi fiyat gidecek" sorusunun TEK cevabı.
 *
 * Sıra (ilk dolu kazanır):
 *   1. Kanal özel fiyatı  — `prices.isPlatformBasedPrice === true` VE `platforms[kod].prices.salePrice` geçerli sayı.
 *   2. `channel` kuralı sonucu — `platforms[kod].rulePrice` (kanal fiyat kuralı motorunun UYGULANMIŞ çıktısı; öneri değil).
 *   3. Ana fiyat — `prices.{salePrice, marketPrice}`.
 *
 * Bayrak ESASTIR (K05): içe aktarma bayrak=false iken de `platforms[kod].prices` yazmış eski kayıtlar ana fiyatla gider;
 * düzeltme göçü yok. Eskiden gönderim "nesne var mı"ya, kural/kâr motoru bayrağa bakıyordu → ekranda görünen ile kanala giden
 * fiyat ayrışabiliyordu. Adaptörler, Validator, hazırlık denetimi, kural motoru, komisyon/net gelir ve önizleme bu modülü kullanır.
 *
 * Konum: `platform/core` (saf, yatay katman) — adaptörler `operations`'ı içe aktaramaz (depcruise `adapters-not-to-operations`).
 * Saf modül (DB/ağ yok). Para: TL, KDV dahil brüt; hesap kuruş tamsayı (`toKurus`), saklama 2 ondalık (`round2`, D-PRICE-1).
 */

export type PriceSource = 'channel' | 'rule' | 'base';

export interface RulePrice {
    salePrice: number;
    marketPrice?: number | null;
    ruleId?: string;
    ruleVersion?: number;
    at?: Date | string;
    reasons?: string[];
}

export interface EffectivePrice {
    /** Kanala gidecek satış fiyatı; hiçbir kaynakta geçerli sayı yoksa null. */
    salePrice: number | null;
    /** Liste (üstü çizili) fiyatı ham değer; tanımsızsa null (adaptör kendi kuralıyla satışa düşer). */
    marketPrice: number | null;
    source: PriceSource;
    /** Değerin okunduğu alan yolu (explain zinciri için). */
    field: string;
    ruleId?: string;
    ruleVersion?: number;
}

const finite = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};

/** 2 ondalığa yuvarlama (yarım yukarı; kayan nokta hatası için EPSILON). */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** TL → kuruş tamsayı. */
export const toKurus = (tl: number): number => Math.round((tl + (tl >= 0 ? Number.EPSILON : -Number.EPSILON)) * 100);
/** Kuruş → TL. */
export const fromKurus = (k: number): number => k / 100;

/** Kanal özel fiyatı AÇIK ve geçerli mi (bayrak + kanal nesnesinde sayı). */
export function hasChannelPrice(variant: any, code: string): boolean {
    return variant?.prices?.isPlatformBasedPrice === true && finite(variant?.platforms?.[code]?.prices?.salePrice) !== null;
}

/** Uygulanmış `channel` kuralı sonucu (yoksa null). */
export function rulePriceOf(variant: any, code: string): RulePrice | null {
    const r = variant?.platforms?.[code]?.rulePrice;
    const sale = finite(r?.salePrice);
    return sale === null ? null : { ...r, salePrice: sale };
}

export interface EffectivePriceOptions {
    /** true: `channel` kuralı sonucu yok sayılır (ör. kuralın kendi tabanını hesaplarken döngüyü önlemek için). */
    ignoreRule?: boolean;
}

export function effectiveChannelPrice(variant: any, code: string, opts: EffectivePriceOptions = {}): EffectivePrice {
    if (hasChannelPrice(variant, code)) {
        const p = variant.platforms[code].prices;
        return { salePrice: finite(p.salePrice), marketPrice: finite(p.marketPrice), source: 'channel', field: `platforms.${code}.prices` };
    }
    const rule = opts.ignoreRule ? null : rulePriceOf(variant, code);
    if (rule) {
        return {
            salePrice: rule.salePrice, marketPrice: finite(rule.marketPrice), source: 'rule', field: `platforms.${code}.rulePrice`,
            ruleId: rule.ruleId ? String(rule.ruleId) : undefined, ruleVersion: rule.ruleVersion,
        };
    }
    return { salePrice: finite(variant?.prices?.salePrice), marketPrice: finite(variant?.prices?.marketPrice), source: 'base', field: 'prices' };
}

/** Adaptörlerin eski `platforms[kod].prices || prices` ifadesinin yerine: `{salePrice, marketPrice}` (undefined yerine 0 değil, ham). */
export function channelPricePair(variant: any, code: string): { salePrice: number | undefined; marketPrice: number | undefined } {
    const e = effectiveChannelPrice(variant, code);
    return { salePrice: e.salePrice ?? undefined, marketPrice: e.marketPrice ?? undefined };
}

/** Kanala gidecek liste fiyatı: tanımlı ve ≥ satış ise o, değilse satış fiyatı (pazaryerleri liste < satışı reddeder). 2 ondalık. */
export function effectiveListPrice(e: Pick<EffectivePrice, 'salePrice' | 'marketPrice'>): number | null {
    if (e.salePrice === null) return null;
    const sale = round2(e.salePrice);
    const market = e.marketPrice !== null && e.marketPrice > 0 ? round2(e.marketPrice) : sale;
    return Math.max(market, sale);
}

/** Açıklama satırı (explainChannelProduct / UI kaynak zinciri). */
export function describeEffectivePrice(e: EffectivePrice): string {
    const v = e.salePrice === null ? '-' : e.salePrice.toFixed(2);
    if (e.source === 'channel') return `${v} ← kanal özel fiyatı (${e.field})`;
    if (e.source === 'rule') return `${v} ← kanal fiyat kuralı${e.ruleId ? ` ${e.ruleId}` : ''}${e.ruleVersion ? ` s${e.ruleVersion}` : ''} (${e.field})`;
    return `${v} ← ana fiyat (prices; kanal özel fiyatı/kuralı yok)`;
}

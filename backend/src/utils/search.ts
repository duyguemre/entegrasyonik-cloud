/**
 * Kullanıcı girdili arama/sayfalama yardımcıları (BACKEND_CODE_AUDIT GV-01 / MM-08; ADR-0021 K-türü düzeltme).
 *
 * - `escapeRegex`: kullanıcı metnindeki regex meta karakterlerini etkisizleştirir → regex enjeksiyonu/ReDoS kapanır.
 *   Arama semantiği DEĞİŞMEZ: "içerir" araması (kısmi eşleşme, büyük/küçük harf duyarsız) aynen sürer; yalnızca `.`, `(`, `+`
 *   gibi karakterler artık sabit metin olarak eşleşir (eskiden `(`/`[` gibi girdiler geçersiz regex hatası verirdi).
 * - Uzunluk sınırı: aşırı uzun sorgu metni kırpılır (kırpma, hata değil → mevcut FE akışı bozulmaz).
 * - `clampLimit`/`clampPage`: sayfa boyutu üst sınırı ve geçersiz (≤0/NaN) değerlerde varsayılan.
 */

/** Arama metni için azami uzunluk (karakter). */
export const MAX_SEARCH_LENGTH = 100;
/** Liste uçlarında azami sayfa boyutu (FE'nin kullandığı en büyük tablo limiti 100; admin müşteri seçimi 1000 → çağıran max verir). */
export const MAX_PAGE_LIMIT = 200;

/** Regex meta karakterlerini kaçırır. */
export function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bilinmeyen girdiyi arama metnine çevirir: yalnız string/number kabul edilir (nesne/dizi operatör enjeksiyonu → ''), uzunluk sınırlı. */
export function toSearchString(input: unknown, maxLength: number = MAX_SEARCH_LENGTH): string {
    if (typeof input === 'number' && Number.isFinite(input)) input = String(input);
    if (typeof input !== 'string') return '';
    return input.length > maxLength ? input.slice(0, maxLength) : input;
}

/** Kaçışlı "içerir" regex'i (büyük/küçük harf duyarsız): `{ $regex: <kaçışlı>, $options: 'i' }`. */
export function containsRegex(input: unknown, maxLength: number = MAX_SEARCH_LENGTH): { $regex: string; $options: 'i' } {
    return { $regex: escapeRegex(toSearchString(input, maxLength)), $options: 'i' };
}

/** Sayfa boyutu: tamsayıya indirilir; geçersiz/≤0 → `defaultLimit`; `max` üstü → `max`. */
export function clampLimit(raw: unknown, defaultLimit: number, max: number = MAX_PAGE_LIMIT): number {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) return Math.min(defaultLimit, max);
    return Math.min(n, max);
}

/** Sayfa numarası (1 tabanlı): geçersiz/≤0 → 1. */
export function clampPage(raw: unknown): number {
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** `{ page, limit }` istek nesnesini güvenli hale getirir (eksik/geçersiz → varsayılan; limit üst sınırlı). */
export function normalizePagination(raw: any, defaultLimit: number, max: number = MAX_PAGE_LIMIT): { page: number; limit: number } {
    return { page: clampPage(raw?.page), limit: clampLimit(raw?.limit, defaultLimit, max) };
}

/**
 * [DB-02 / DBR-06] Sıralama alanı İZİN LİSTESİ: liste uçlarında `sortBy.key` yalnız bu listedeki alanlardan biri olabilir.
 * Bilinmeyen/tür dışı alan HATA vermez (mevcut FE akışı bozulmasın) — `fallback` (varsayılan sıralama alanı) kullanılır.
 * Dönüş: `{ field, usedFallback }`; yön çağıranın mevcut kuralında kalır.
 */
export function pickSortField(raw: unknown, allowed: readonly string[], fallback: string): { field: string; usedFallback: boolean } {
    if (typeof raw === 'string' && allowed.includes(raw)) return { field: raw, usedFallback: false };
    return { field: fallback, usedFallback: true };
}

/**
 * [faz4-int-wp7] Ortak "eksik cekim" (incomplete fetch) sozlesmesi.
 *
 * Sorun: HB/N11 sayfalama tavana (sayfa/kayit) ya da tekrar eden sayfaya takilinca KISMI sonuc doner.
 * Motor bunu bilmezse `lastSuccessfulOrderSync` ilerler ve kalan siparisler bir daha cekilmez (sessiz kayip).
 *
 * Kanal: baglayicilarin `Promise<T[]>` donus tipi KIRILMAZ. Isaret, sonuc dizisine NON-ENUMERABLE bir
 * Symbol ozelligi olarak eklenir (JSON/spread/for-of etkilenmez); servis katmani dizi donusturdugunde
 * `carryIncomplete(from, to)` ile tasir. Motor `getIncomplete(result)` ile okur.
 *
 * Trendyol: pencere > 10.000 ise ORDER_WINDOW_OVERFLOW ile FIRLATIR (is FAIL -> imec ilerlemez). Bu zaten
 * guvenli bir "eksik" sinyalidir; `isWindowOverflowError` motorda ayni olay olarak bildirime baglanir.
 */
export type IncompleteReason =
    | 'PAGINATION_RECORD_CAP'
    | 'PAGINATION_PAGE_CAP'
    | 'PAGINATION_REPEATED_PAGE';

export interface IncompleteInfo {
    incomplete: true;
    reason: IncompleteReason;
    /** Kac kayit toplandi (bilgi amacli). */
    collected: number;
}

const INCOMPLETE = Symbol.for('entegrasyonik.incompleteFetch');

export function markIncomplete<T extends any[]>(items: T, info: Omit<IncompleteInfo, 'incomplete'>): T {
    Object.defineProperty(items, INCOMPLETE, {
        value: { incomplete: true, ...info } as IncompleteInfo,
        enumerable: false, configurable: true, writable: true,
    });
    return items;
}

export function getIncomplete(items: unknown): IncompleteInfo | undefined {
    return (items && typeof items === 'object') ? (items as any)[INCOMPLETE] : undefined;
}

/** Ham sonuctaki isareti donusturulmus (mapper ciktisi) diziye tasir. */
export function carryIncomplete<T extends any[]>(from: unknown, to: T): T {
    const info = getIncomplete(from);
    return info ? markIncomplete(to, { reason: info.reason, collected: info.collected }) : to;
}

/** Trendyol'un mevcut "pencere tasti" hatasi (fetchWindow) mi? */
export function isWindowOverflowError(e: any): boolean {
    return e?.context?.platformCode === 'ORDER_WINDOW_OVERFLOW' || e?.platformCode === 'ORDER_WINDOW_OVERFLOW';
}

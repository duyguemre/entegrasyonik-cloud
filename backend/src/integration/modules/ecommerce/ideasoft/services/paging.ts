// [F-04c / F-10 -> ADR-0033 INT-05] Ideasoft sayfalama: ortak `paginate` (tavan + tekrar eden sayfa => sessiz kesme YOK, `markIncomplete` sinyali).
// Sözleşme (sayfa boyutu, sayfa üst sınırı) DOĞRULANAMADI (docs/research/API_CONTRACTS_2026-09-30.md §5); bu yüzden döngü,
// API `page` parametresini yok sayıp aynı sayfayı sonsuza dek döndürse bile sonlanır (tekrar eden sayfa => PAGINATION_REPEATED_PAGE).
import { paginate } from '@integration/modules/common/adapter/paginate';
import { observeResponseSchema, type ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';
import { integrationCode } from '../constants';

/** Sayfa (istek turu) üst sınırı; `IDEASOFT_MAX_PAGES` ile ayarlanır. Aşılırsa sonuç `incomplete` işaretlenir (sessiz kırpma yok). */
export function maxPages(): number {
    const n = Number(process.env.IDEASOFT_MAX_PAGES);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
}

/** Yanıt gövdesinden kayıt dizisi: `[...]` ya da `{ data: [...] }`. */
export const itemsOf = (data: any): any[] => (Array.isArray(data) ? data : (data?.data || []));

/** F-09 (C7a): yanıt gövdesini sözleşmeye karşı GÖZLEMLER (yalnız sinyal; gövdeyi aynen döndürür, asla fırlatmaz) ve kayıt dizisini çıkarır. */
export const observedItems = (contract: ResponseContract, data: any, clientId: string | number): any[] => {
    observeResponseSchema(contract, data, { clientId });
    return itemsOf(data);
};

/**
 * 1 tabanlı `page` sayfalaması (sayfa boyutu 100; `<100` kayıt => son sayfa). `loadPage(page)` tek sayfanın kayıtlarını döndürür.
 * Tavan/tekrar => dönen dizi `getIncomplete()` ile okunur (eksik veri).
 */
export function fetchAllPages(loadPage: (page: number) => Promise<any[]>, operation: string, clientId: string | number): Promise<any[]> {
    return paginate<any>(async ({ page }) => ({ items: await loadPage(page + 1) }), {
        kind: 'page', limit: 100, maxPages: maxPages(), operation, integrationCode, clientId,
    });
}

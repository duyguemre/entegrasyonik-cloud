/**
 * [INT-05 / N11] Sayfa-numarası (0 tabanlı `currentPage`) sayfalaması: ortak `paginate` (common/adapter/paginate.ts) üstüne İNCE sarmalayıcı.
 * Yalnız N11'e özgü olanlar burada: sayfa boyutu/tavan sabitleri ve toplam-sayı alanı eşlemesi. Döngü, tekrar eden sayfa koruması (sunucu
 * sayfa parametresini yok sayarsa aynı sayfa döner => PAGINATION_REPEATED_PAGE), tavanda `markIncomplete` + yapılandırılmış uyarı ve
 * "ara sayfa hatası yutulmaz" davranışı ortak tabandadır.
 *
 * Sözleşme notu: REST sipariş yanıtı `totalElements` taşır (sipariş listeleme belgesi); yoksa/`null` ise durma kuralı `dönen < sayfa boyutu`dur.
 * Ürün sorgusunda (`ms/product-query`) toplam alanı `pagingData.totalCount` okunur; sayfa parametre adı (`currentPage`/`pageSize`) DOĞRULANAMADI
 * (testConnection `page`/`size` kullanır): sunucu yok sayarsa tekrar eden sayfa korumasıyla akış FAILED olur (sessiz kesme yok).
 */
import { paginate } from '@integration/modules/common/adapter/paginate';
import { integrationCode } from '../constants';

export const N11_PAGE_LIMIT = 100;
export const N11_MAX_PAGES = 50;
/** streamProducts: sayfa başına 100 => 100.000 ürün (Hepsiburada/Pazarama ile aynı tavan). */
export const N11_STREAM_MAX_PAGES = 1000;
export const N11_STREAM_MAX_RECORDS = 100_000;

export interface N11PageOptions {
    operation: string;
    clientId?: string | number;
    limit?: number;
    maxPages?: number;
    maxRecords?: number;
    /** Akış kipi: her sayfa buraya verilir, kayıtlar bellekte toplanmaz (dönüş boş dizi). */
    onPage?: (items: any[], page: number) => Promise<void>;
}

/** Toplam-sayı değerini güvenli sayıya çevirir (yok/null/sayı değil => undefined). */
export function readTotal(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

export function paginatePage(
    fetchPage: (page: number, limit: number) => Promise<{ items: any[]; total?: number }>,
    opts: N11PageOptions,
): Promise<any[]> {
    return paginate<any>(({ page, limit }) => fetchPage(page, limit), {
        kind: 'page',
        limit: opts.limit ?? N11_PAGE_LIMIT,
        maxPages: opts.maxPages ?? N11_MAX_PAGES,
        maxRecords: opts.maxRecords,
        operation: opts.operation,
        integrationCode,
        clientId: opts.clientId,
        onPage: opts.onPage ? (items, req) => opts.onPage!(items, req.page) : undefined,
        collect: opts.onPage ? false : true,
    });
}

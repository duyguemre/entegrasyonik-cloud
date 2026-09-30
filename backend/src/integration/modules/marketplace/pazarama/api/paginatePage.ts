/**
 * [INT-05 / Pazarama] Sayfa-numarası (1 tabanlı) sayfalaması: ortak `paginate` (common/adapter/paginate.ts) üstüne İNCE sarmalayıcı.
 * Yalnız Pazarama'ya özgü olanlar burada: sayfa boyutu/tavan sabitleri ve 1 tabanlı `pageNumber` eşlemesi. Döngü, tekrar eden sayfa
 * koruması (sunucu sayfa numarasını yok sayarsa aynı sayfa döner => PAGINATION_REPEATED_PAGE), tavanda `markIncomplete` + uyarı ve
 * "ara sayfa hatası yutulmaz" davranışı ortak tabandadır.
 *
 * Sözleşme notu: Pazarama sipariş/iade liste yanıtında toplam-sayı alanı DOĞRULANAMADI (panel belgesi 403); bu yüzden durma kuralı
 * `dönen < sayfa boyutu` (ya da boş sayfa)dır; toplam alanına güvenilmez. Gövde alanları `pageNumber`/`pageSize` mock ve iade ucuyla tutarlıdır.
 */
import { paginate } from '@integration/modules/common/adapter/paginate';
import { integrationCode } from '../constants';

export const PZ_PAGE_LIMIT = 100;
export const PZ_MAX_PAGES = 50;
export const PZ_MAX_RECORDS = 5000;
/** streamProducts: sayfa başına 100 => 100.000 ürün (Hepsiburada ile aynı tavan). */
export const PZ_STREAM_MAX_PAGES = 1000;
export const PZ_STREAM_MAX_RECORDS = 100_000;

export interface PazaramaPageOptions {
    operation: string;
    clientId?: string | number;
    /** İlk sayfa numarası (varsayılan 1). */
    startPage?: number;
    limit?: number;
    maxPages?: number;
    maxRecords?: number;
    /** Akış kipi: her sayfa buraya verilir, kayıtlar bellekte toplanmaz (dönüş boş dizi). */
    onPage?: (items: any[], pageNumber: number) => Promise<void>;
}

export function paginatePage(
    fetchPage: (pageNumber: number, limit: number) => Promise<any[]>,
    opts: PazaramaPageOptions,
): Promise<any[]> {
    const start = opts.startPage ?? 1;
    return paginate<any>(async ({ page, limit }) => ({ items: await fetchPage(start + page, limit) }), {
        kind: 'page',
        limit: opts.limit ?? PZ_PAGE_LIMIT,
        maxPages: opts.maxPages ?? PZ_MAX_PAGES,
        maxRecords: opts.maxRecords ?? PZ_MAX_RECORDS,
        operation: opts.operation,
        integrationCode,
        clientId: opts.clientId,
        onPage: opts.onPage ? (items, req) => opts.onPage!(items, start + req.page) : undefined,
        collect: opts.onPage ? false : true,
    });
}

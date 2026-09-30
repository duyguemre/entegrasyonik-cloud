/**
 * [faz4-int-wp1 / F-02, INT-05] Hepsiburada offset+limit sayfalaması: ortak `paginate` (common/adapter/paginate.ts) üstüne İNCE sarmalayıcı.
 * Yalnız HB'ye özgü olanlar burada: sayfa/kayıt tavanı sabitleri ve toplam-sayı alanı adayları. Döngü, tekrar eden sayfa koruması,
 * tavanda `markIncomplete` + yapılandırılmış uyarı ve "ara sayfa hatası yutulmaz" davranışı ortak tabandadır.
 *
 * Sözleşme notu: HB yanıtındaki toplam-sayı alanının adı DOĞRULANAMADI (resmi portal 403). Bu yüzden bilinen adaylar
 * (`totalCount`/`totalElements`/`total`) VARSA kullanılır; YOKSA `dönen < limit` ile durulur.
 */
import { paginate } from '@integration/modules/common/adapter/paginate';

export const HB_PAGE_LIMIT = 100;
export const HB_MAX_PAGES = 50;
export const HB_MAX_RECORDS = 5000;

export interface OffsetPage { items: any[]; total?: number }

export interface HbPaginateOptions {
    operation: string;
    clientId?: string | number;
    limit?: number;
    maxPages?: number;
    maxRecords?: number;
    /** Akış kipi: her sayfa buraya verilir, kayıtlar bellekte toplanmaz (dönüş boş dizi). */
    onPage?: (items: any[]) => Promise<void>;
}

export function readTotal(data: any): number | undefined {
    for (const k of ['totalCount', 'totalElements', 'total']) {
        const n = Number(data?.[k]);
        if (data?.[k] !== undefined && data?.[k] !== null && Number.isFinite(n) && n >= 0) return n;
    }
    return undefined;
}

export function paginateOffset(
    fetchPage: (offset: number, limit: number) => Promise<OffsetPage>,
    opts: HbPaginateOptions,
): Promise<any[]> {
    return paginate<any>(({ offset, limit }) => fetchPage(offset, limit), {
        kind: 'offset',
        limit: opts.limit ?? HB_PAGE_LIMIT,
        maxPages: opts.maxPages ?? HB_MAX_PAGES,
        maxRecords: opts.maxRecords ?? HB_MAX_RECORDS,
        operation: opts.operation,
        integrationCode: 'hepsiburada',
        clientId: opts.clientId,
        onPage: opts.onPage ? (items) => opts.onPage!(items) : undefined,
        collect: opts.onPage ? false : true,
    });
}

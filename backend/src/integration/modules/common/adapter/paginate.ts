// ADR-0033 Karar 1 (INT-01): ortak sayfalama. Tavan (sayfa/kayıt) ya da tekrar eden sayfa SESSİZCE kesilmez:
// sonuç `markIncomplete` ile işaretlenir (WP7 sinyali: contracts/IncompleteFetch.ts) ve yapılandırılmış uyarı loglanır.
// Ara sayfa hatası yutulmaz (fırlar; yeniden deneme ResilientHttpClient'tadır). Adaptör-yerel sayfalama bunun üstüne ince sarmalayıcıdır (HB: api/paginateOffset.ts; INT-05).
import { markIncomplete, type IncompleteReason } from '@integration/contracts/IncompleteFetch';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-common', 'paginate');

export interface PageRequest {
    /** 0 tabanlı sayfa sırası. */
    page: number;
    /** O ana kadar toplanan kayıt sayısı. */
    offset: number;
    limit: number;
    /** 'cursor' kipinde önceki sayfanın `next` değeri (ilk çağrıda undefined). */
    cursor?: string | number;
}
export interface PageResult<T> { items: T[]; total?: number; next?: string | number | null }

export interface PaginateOptions<T = unknown> {
    kind: 'page' | 'offset' | 'cursor';
    maxPages: number;
    /** Sayfa boyutu (page/offset kipinde `items < limit` => son sayfa). Varsayılan 100. */
    limit?: number;
    maxRecords?: number;
    operation: string;
    integrationCode?: string;
    clientId?: string | number;
    /** Akış kipi (büyük kataloglar): her sayfa alınınca çağrılır (kayıt toplanmadan önce). Hatası yutulmaz (fırlar). */
    onPage?: (items: T[], req: PageRequest) => Promise<void>;
    /** false => kayıtlar bellekte TUTULMAZ (yalnız `onPage` için); dönüş boş dizi (tavan/eksiklik yine `getIncomplete` ile okunur). Varsayılan true. */
    collect?: boolean;
}

export async function paginate<T>(fetchPage: (req: PageRequest) => Promise<PageResult<T>>, opts: PaginateOptions<T>): Promise<T[]> {
    const limit = opts.limit ?? 100;
    const all: T[] = [];
    const collect = opts.collect !== false;
    let count = 0; // toplanan (ya da akıtılan) kayıt sayısı; `all` yalnız collect=true iken dolar
    let cursor: string | number | undefined;
    let prevSig: string | undefined;

    const stop = (reason: IncompleteReason, extra: Record<string, unknown>): T[] => {
        log.warn(reason, 'Sayfalama tavanına/anomalisine ulaşıldı; sonuç eksik olabilir.', {
            integrationCode: opts.integrationCode, operation: opts.operation, tenantId: opts.clientId, collected: count, ...extra,
        });
        return markIncomplete(all, { reason, collected: count });
    };

    for (let page = 0; page < opts.maxPages; page++) {
        const req: PageRequest = { page, offset: count, limit, cursor };
        const { items, total, next } = await fetchPage(req);
        if (!items.length) return all;

        const sig = JSON.stringify(items);
        if (sig === prevSig) return stop('PAGINATION_REPEATED_PAGE', { page });
        prevSig = sig;
        if (opts.onPage) await opts.onPage(items, req);
        if (collect) all.push(...items);
        count += items.length;

        if (opts.kind === 'cursor') {
            if (next === null || next === undefined) return all;
            cursor = next;
        } else if (total !== undefined ? count >= total : items.length < limit) {
            return all;
        }
        if (opts.maxRecords !== undefined && count >= opts.maxRecords) return stop('PAGINATION_RECORD_CAP', { page, maxRecords: opts.maxRecords });
    }
    return stop('PAGINATION_PAGE_CAP', { maxPages: opts.maxPages });
}

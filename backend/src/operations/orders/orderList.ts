import { ApplicationError } from '@platform/core/security/Security';
import { ORDER_ITEM_ALLOCATION_STATES } from '@operations/stock/allocationStates';
import { containsRegex, normalizePagination, toInList } from '@utils/search';
import { startOfDayInZone, endOfDayInZone } from '@utils/timeZone';
import type { OrderPanelRepository } from '@database/repositories/tenant/OrderPanelRepository';

/**
 * [ADR-0021 D1 / GV-02] getOrders sıralama alanı izin listesi. Sipariş tarihi şemada `dates.orderDate`'tir
 * (üst düzey `orderDate` yoktu → varsayılan sıralama/tarih filtresi etkisizdi). Eski istemcilerin `orderDate`
 * göndermesi `dates.orderDate`'e eşlenir. Liste FE sipariş tablosunun sıralanabilir başlıklarını kapsar.
 */
const ORDER_SORT_FIELD_ALIASES: Record<string, string> = { orderDate: 'dates.orderDate' };
const ORDER_SORT_FIELDS: readonly string[] = [
    'dates.orderDate', 'orderNumber', 'externalOrderId', 'internalStatus', 'integrationCode', 'financials.grandTotal',
];
const DEFAULT_ORDER_SORT_FIELD = 'dates.orderDate';

/** SİPARİŞLERİ LİSTELEME (Arama, Filtreleme, Sıralama, Sayfalama). Geçersiz sıralama/tarih/rezervasyon durumu => 400. */
export async function listOrders(repo: OrderPanelRepository, searchOrderForm: any): Promise<any> {
    const sort = searchOrderForm?.sort;
    const pagination = normalizePagination(searchOrderForm?.pagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const filterData = searchOrderForm?.filter || {};

    // 1. Sıralama (Sort) Hazırlığı
    const sortBy: any = {};
    if (sort && sort.field) {
        const direction = sort.direction === 'asc' ? 1 : -1;
        const field = ORDER_SORT_FIELD_ALIASES[sort.field] ?? sort.field;
        if (typeof field !== 'string' || !ORDER_SORT_FIELDS.includes(field)) {
            throw new ApplicationError('sort.field geçersiz: ' + ORDER_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
        }
        sortBy[field] = direction;
    } else {
        sortBy[DEFAULT_ORDER_SORT_FIELD] = -1; // Varsayılan en yeni siparişler
    }

    // 2. Dinamik Filtre (Match) Oluşturma
    const filterQuery: any = {};

    // 2.A - Global Search (Arama Çubuğu)
    if (filterData.globalSearch) {
        const searchRegex = containsRegex(filterData.globalSearch); // [GV-01] kaçışlı + uzunluk sınırlı
        filterQuery.$or = [
            { orderNumber: searchRegex },
            { externalOrderId: searchRegex },
            { "billingAddress.firstName": searchRegex },
            { "billingAddress.lastName": searchRegex },
            { "billingAddress.phone": searchRegex },
            { "fulfillment.trackingCode": searchRegex }
        ];
    }

    // 2.B - Tarih Filtreleri (Date Range)
    // [ADR-0021 D1 / GV-02] Şema alanı `dates.orderDate`. Gün sınırları sunucu (UTC) günü değil
    // platform saat dilimi (Europe/Istanbul) gününe göre hesaplanır (PLATFORM_BASELINE C5).
    if (filterData.startDate || filterData.endDate) {
        const range: any = {};
        if (filterData.startDate) {
            const start = new Date(filterData.startDate);
            if (isNaN(start.getTime())) throw new ApplicationError('startDate geçersiz.', 400);
            range.$gte = startOfDayInZone(start);
        }
        if (filterData.endDate) {
            const end = new Date(filterData.endDate);
            if (isNaN(end.getTime())) throw new ApplicationError('endDate geçersiz.', 400);
            range.$lte = endOfDayInZone(end); // Günün sonuna kadar
        }
        filterQuery['dates.orderDate'] = range;
    }

    // 2.C - Platform ve Statü Filtreleri (Multi Select)
    // [2026-10-03] tek dize de kabul (eskiden `$in: "trendyol"` -> Mongo 500 "$in needs an array")
    const integrationCodes = toInList(filterData.integrationCodes);
    if (integrationCodes) filterQuery.integrationCode = { $in: integrationCodes };
    const internalStatuses = toInList(filterData.internalStatuses);
    if (internalStatuses) filterQuery.internalStatus = { $in: internalStatuses };

    // 2.D - [N6 / ADR-0004] Kalem düzeyi rezervasyon durumu (ör. ['OVERSOLD']): en az bir kalemi bu durumlardan birinde olan siparişler.
    // Değerler beyaz listeyle doğrulanır (operatör/nesne enjeksiyonu yok); geçersiz değer => 400.
    if (filterData.allocationStates !== undefined && filterData.allocationStates !== null) {
        const states = filterData.allocationStates;
        if (!Array.isArray(states) || states.some((s: any) => typeof s !== 'string' || !ORDER_ITEM_ALLOCATION_STATES.includes(s))) {
            throw new ApplicationError('allocationStates geçersiz: ' + ORDER_ITEM_ALLOCATION_STATES.join(', ') + ' değerlerinden oluşan bir dizi olmalıdır.', 400);
        }
        if (states.length > 0) filterQuery.items = { $elemMatch: { allocationState: { $in: states } } };
    }

    // 3. Aggregate Süreci
    const skipCount = (pagination.page - 1) * pagination.limit;
    const { total, orders } = await repo.listPage(filterQuery, sortBy, skipCount, pagination.limit);

    return {
        totalNumberOfRecords: total,
        totalNumberOfPages: Math.ceil(total / pagination.limit) || 1,
        orders: orders
    };
}

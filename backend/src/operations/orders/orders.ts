import { IClientDB, IOrderRejectParams, OrderInternalStatusEnum } from '@interfaces/index';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { OrderRepository } from '@database/repositories/tenant/OrderRepository';
import { ApplicationError } from '@platform/core/security/Security';
import { ORDER_ITEM_ALLOCATION_STATES } from '@operations/stock/allocationStates';
import { containsRegex, normalizePagination } from '@utils/search';
import { startOfDayInZone, endOfDayInZone } from '@utils/timeZone';

/**
 * ADR-0024 P3-ORD: sipariş listeleme ve satıcı aksiyonları (iptal/onay/barkod), eski `OrderService` gövdesi; davranış BİREBİR.
 * Pazaryeri bildirimi ÖNCE, yerel durum SONRA yazılır (platform reddederse yerel kayıt değişmez).
 */
export interface OrderDeps { clientDB: IClientDB; clientId: unknown }

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

/** Satıcı işlemi sonrası pazaryeri senkronu beklenirken sipariş bu süre kilitli kalır. */
function lockUntil(minutes: number): Date {
    const lockTime = new Date();
    lockTime.setMinutes(lockTime.getMinutes() + minutes);
    return lockTime;
}

/** Evrensel red parametreleri: tüm satırlar + lojistik meta (packageId vb.). */
function rejectParamsOf(order: any, reasonId: unknown, reason: unknown): IOrderRejectParams {
    return {
        reasonId: String(reasonId),
        description: reason as any,
        source: 'SELLER',
        lineItems: order.items.map((item: any) => ({ externalLineId: item.externalItemId, quantity: item.quantity })),
        meta: order.meta,
    };
}

function cancelUpdate(reason: unknown, opMessage: string, historyDescription: string, lockedUntil: Date) {
    return {
        $set: {
            internalStatus: OrderInternalStatusEnum.CANCELLED,
            'items.$[].itemStatus': 'CANCELLED',
            'dates.externalUpdatedAt': new Date(),
            'dates.cancelledDate': new Date(),
            'cancelReason': reason,
            'cancelSource': 'SELLER',
            platformOperation: { status: 'PENDING', message: opMessage, lockedUntil },
        },
        $push: { history: { status: OrderInternalStatusEnum.CANCELLED, changedAt: new Date(), description: historyDescription, actionBy: 'USER' } },
    };
}

/** Toplu işlemde entegrasyon örneği kod başına bir kez kurulur. */
function instanceCache(clientId: unknown) {
    const factory = new IntegrationFactory(Number(clientId));
    const cache = new Map<string, any>();
    return async (code: string) => {
        let instance = cache.get(code);
        if (!instance) {
            instance = await factory.getInstance(code as any);
            cache.set(code, instance);
        }
        return instance;
    };
}

/** SİPARİŞLERİ LİSTELEME (arama, filtre, sıralama, sayfalama). */
export async function searchOrders(clientDB: IClientDB, searchOrderForm: any) {
    const sort = searchOrderForm?.sort;
    const pagination = normalizePagination(searchOrderForm?.pagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const filterData = searchOrderForm?.filter || {};

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

    const filterQuery: any = {};
    if (filterData.globalSearch) {
        const searchRegex = containsRegex(filterData.globalSearch); // [GV-01] kaçışlı + uzunluk sınırlı
        filterQuery.$or = [
            { orderNumber: searchRegex },
            { externalOrderId: searchRegex },
            { 'billingAddress.firstName': searchRegex },
            { 'billingAddress.lastName': searchRegex },
            { 'billingAddress.phone': searchRegex },
            { 'fulfillment.trackingCode': searchRegex },
        ];
    }
    // [ADR-0021 D1 / GV-02] Gün sınırları platform saat dilimi (Europe/Istanbul) gününe göre (PLATFORM_BASELINE C5).
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
            range.$lte = endOfDayInZone(end);
        }
        filterQuery['dates.orderDate'] = range;
    }
    if (filterData.integrationCodes && filterData.integrationCodes.length > 0) filterQuery.integrationCode = { $in: filterData.integrationCodes };
    if (filterData.internalStatuses && filterData.internalStatuses.length > 0) filterQuery.internalStatus = { $in: filterData.internalStatuses };
    // [N6 / ADR-0004] Kalem düzeyi rezervasyon durumu: beyaz listeyle doğrulanır (operatör/nesne enjeksiyonu yok); geçersiz => 400.
    if (filterData.allocationStates !== undefined && filterData.allocationStates !== null) {
        const states = filterData.allocationStates;
        if (!Array.isArray(states) || states.some((s: any) => typeof s !== 'string' || !ORDER_ITEM_ALLOCATION_STATES.includes(s))) {
            throw new ApplicationError('allocationStates geçersiz: ' + ORDER_ITEM_ALLOCATION_STATES.join(', ') + ' değerlerinden oluşan bir dizi olmalıdır.', 400);
        }
        if (states.length > 0) filterQuery.items = { $elemMatch: { allocationState: { $in: states } } };
    }

    const skipCount = (pagination.page - 1) * pagination.limit;
    const { total, items } = await new OrderRepository(clientDB).pagedSearch(filterQuery, sortBy, skipCount, pagination.limit);
    return { totalNumberOfRecords: total, totalNumberOfPages: Math.ceil(total / pagination.limit) || 1, orders: items };
}

/** TEKİL SİPARİŞ İPTALİ (Reject/Unsupplied). */
export async function cancelOrder(deps: OrderDeps, orderId: unknown, reason: unknown, reasonId: unknown) {
    const repo = new OrderRepository(deps.clientDB);
    const order = await repo.findById(orderId);
    if (!order) throw new Error('Sipariş bulunamadı.');

    const factory = new IntegrationFactory(Number(deps.clientId));
    const instance = await factory.getInstance(order.integrationCode);
    const marketplaceResult = await instance.rejectOrder(order.externalOrderId, rejectParamsOf(order, reasonId, reason));
    if (marketplaceResult === false) throw new Error('Pazar yeri iptal işlemini reddetti veya bir sorun oluştu.');

    const updatedOrder = await repo.updateById(orderId,
        cancelUpdate(reason, 'Sipariş iptal ediliyor, pazar yeri onayı bekleniyor...', `Sipariş kullanıcı tarafından iptal edildi. Sebep: ${reason}`, lockUntil(5)),
        { new: true });
    return { success: true, message: 'Sipariş başarıyla iptal edildi.', data: updatedOrder };
}

/** TOPLU SİPARİŞ İPTALİ (her sipariş bağımsız; hata diğerlerini durdurmaz). */
export async function bulkCancelOrder(deps: OrderDeps, orderIds: unknown, cancelData: any) {
    const reasonId = cancelData?.reasonId;
    const reason = cancelData?.reason;
    if (!Array.isArray(orderIds) || orderIds.length === 0) throw new Error('İptal edilecek sipariş seçilmedi.');

    const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };
    const instanceFor = instanceCache(deps.clientId);
    const lockedUntil = lockUntil(5);
    const repo = new OrderRepository(deps.clientDB);

    for (const orderId of orderIds) {
        try {
            const order = await repo.findById(orderId);
            if (!order) throw new Error(`${orderId} nolu sipariş sistemde bulunamadı.`);
            const instance = await instanceFor(order.integrationCode);
            const marketplaceResult = await instance.rejectOrder(order.externalOrderId, rejectParamsOf(order, reasonId, reason));
            if (marketplaceResult === false) throw new Error('Pazar yeri bu iptal isteğine onay vermedi.');

            await repo.updateById(orderId, cancelUpdate(reason, 'Sipariş toplu işlem ile iptal ediliyor...', `Toplu iptal işlemiyle reddedildi. Sebep: ${reason}`, lockedUntil));
            results.successful.push({ orderId, orderNumber: order.orderNumber });
            results.successCount++;
        } catch (error: any) {
            results.failed.push({ orderId, errorMessage: error.message || 'Bilinmeyen hata' });
            results.failedCount++;
        }
    }
    return {
        success: results.failedCount === 0,
        message: `${results.successCount} sipariş iptal edildi, ${results.failedCount} hata alındı.`,
        data: results,
    };
}

/** SİPARİŞ ONAYLAMA: yalnız AWAITING_APPROVAL; platform kargo bilgisi döndüyse fulfillment yazılır. */
export async function approveOrder(deps: OrderDeps, orderId: unknown) {
    const repo = new OrderRepository(deps.clientDB);
    const order = await repo.findById(orderId);
    if (!order) throw new Error('Sipariş bulunamadı.');
    if (order.internalStatus !== OrderInternalStatusEnum.AWAITING_APPROVAL) {
        throw new Error('Sadece "Satıcı Onayı Bekliyor" durumundaki siparişler onaylanabilir.');
    }

    const factory = new IntegrationFactory(Number(deps.clientId));
    const instance = await factory.getInstance(order.integrationCode);
    const result = await instance.approveOrder(order.externalOrderId, {
        meta: { externalLineItemId: order.items?.[0]?.externalLineItemId, ...order.meta },
    });
    if (!result) throw new Error('Pazar yeri onay işlemini reddetti.');

    const updateFields: any = {
        internalStatus: OrderInternalStatusEnum.APPROVED,
        'dates.externalUpdatedAt': new Date(),
        'dates.approvedDate': new Date(),
        platformOperation: {
            status: 'PENDING',
            message: 'Sipariş paketlendi, pazar yeri onayı ve kargo bilgileri senkronize ediliyor...',
            lockedUntil: lockUntil(2),
        },
    };
    if (typeof result === 'object' && result.success && result.rawResponse) {
        const raw = result.rawResponse;
        if (raw.barcode || raw.trackingCode || raw.labelUrl) {
            updateFields.fulfillment = [{
                shipmentMethod: 'MARKETPLACE',
                status: 'PENDING',
                trackingCode: raw.barcode || raw.trackingCode,
                labelUrl: raw.labelUrl,
                campaignCode: raw.packageNumber,
                createdAt: new Date(),
            }];
        }
    }

    const updatedOrder = await repo.updateById(orderId, {
        $set: updateFields,
        $push: { history: { status: OrderInternalStatusEnum.APPROVED, changedAt: new Date(), description: 'Sipariş kullanıcı tarafından onaylandı.', actionBy: 'USER' } },
    }, { new: true });
    return { success: true, message: 'Sipariş onaylandı.', data: updatedOrder };
}

/** TOPLU SİPARİŞ ONAYLAMA. */
export async function bulkApproveOrder(deps: OrderDeps, orderIds: unknown) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) throw new Error('Onaylanacak sipariş seçilmedi.');

    const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };
    const instanceFor = instanceCache(deps.clientId);
    const lockedUntil = lockUntil(5);
    const repo = new OrderRepository(deps.clientDB);

    for (const orderId of orderIds) {
        try {
            const order = await repo.findById(orderId);
            if (!order) throw new Error('Bulunamadı.');
            if (order.internalStatus !== OrderInternalStatusEnum.AWAITING_APPROVAL) throw new Error('Statü uygun değil.');
            const instance = await instanceFor(order.integrationCode);
            const res = await instance.approveOrder(order.externalOrderId, {
                meta: { externalLineItemId: order.items?.[0]?.externalLineItemId, ...order.meta },
            });
            if (!res) throw new Error('Platform reddetti.');

            await repo.updateById(orderId, {
                $set: {
                    internalStatus: OrderInternalStatusEnum.APPROVED,
                    'dates.approvedDate': new Date(),
                    platformOperation: { status: 'PENDING', message: 'Sipariş toplu işlem ile onaylanıyor...', lockedUntil },
                },
                $push: { history: { status: OrderInternalStatusEnum.APPROVED, changedAt: new Date(), description: 'Toplu onay işlemiyle onaylandı.', actionBy: 'USER' } },
            });
            results.successful.push({ orderId, orderNumber: order.orderNumber });
            results.successCount++;
        } catch (error: any) {
            results.failed.push({ orderId, errorMessage: error.message });
            results.failedCount++;
        }
    }
    return {
        success: results.failedCount === 0,
        message: `${results.successCount} sipariş onaylandı, ${results.failedCount} hata.`,
        data: results,
    };
}

/** BARKOD YAZDIRILDI İŞARETLEMESİ (platform aksiyon kaydıyla). */
export async function markAsPrinted(clientDB: IClientDB, orderId: unknown) {
    const updatedOrder = await new OrderRepository(clientDB).updateById(orderId, {
        $set: { 'flags.isBarcodePrinted': true },
        $push: {
            platformActions: {
                actionType: 'BARCODE_PRINT',
                platform: 'SYSTEM',
                status: 'SUCCESS',
                requestPayload: { printedAt: new Date() },
                responsePayload: { message: 'Barkod başarıyla yazdırıldı.' },
                createdAt: new Date(),
            },
        },
    }, { new: true });
    return { success: true, message: 'Barkod basıldı olarak işaretlendi.', data: updatedOrder };
}

/** Pazaryerine özgü sipariş iptal nedenleri. */
export async function getOrderRejectionReasons(clientId: unknown, integrationCode: any) {
    const factory = new IntegrationFactory(Number(clientId));
    const instance = await factory.getInstance(integrationCode);
    const reasons = await instance.retrieveOrderRejectionReasons();
    return { success: true, message: 'İptal nedenleri başarıyla getirildi.', data: reasons };
}

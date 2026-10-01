import { IClientDB, IPlatformResponse, OrderInternalStatusEnum } from '@interfaces/index';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { OrderRepository } from '@database/repositories/tenant/OrderRepository';
import { ApplicationError } from '@platform/core/security/Security';

/**
 * ADR-0024 P3-ORD: sevkiyat listesi ve kargo bilgisi girişi (tekil/toplu); eski `ShipmentService` gövdesi, davranış BİREBİR.
 * Platform bildirimi ÖNCE; platform reddederse sipariş durumu güncellenmez.
 */
export interface ShipmentDeps { clientDB: IClientDB; clientId: unknown }

export const MAX_SHIPMENTS_PAGE_LIMIT = 100;

/**
 * [MM-08 / ADR-0021 aynı desen] getShipments sıralama alanı izin listesi. `Orders` sorgulandığından alanlar Order şemasından
 * (OrderService.getOrders ile TUTARLI). `price` eşlemesi (`prices.price`) MEVCUT davranış olarak KORUNDU (BULGU: Order şemasında
 * `prices` yok; düzeltilmedi, yalnızca doğrulandı). [DÜZELTME 2026-09-29] `sortBy` artık `$skip`/`$limit`'ten ÖNCE uygulanır.
 */
const SHIPMENT_SORT_FIELD_ALIASES: Record<string, string> = { price: 'prices.price' };
const SHIPMENT_SORT_FIELDS: readonly string[] = ['prices.price', 'orderNumber', 'externalOrderId', 'internalStatus', 'integrationCode', '_id'];

export async function searchShipments(clientDB: IClientDB, request: any) {
    const sortBy: any = {};
    if (request.sortBy != undefined && request.sortBy.key) {
        const direction = request.sortBy.order == 'asc' ? 1 : -1;
        const field = SHIPMENT_SORT_FIELD_ALIASES[request.sortBy.key] ?? request.sortBy.key;
        if (typeof field !== 'string' || !SHIPMENT_SORT_FIELDS.includes(field)) {
            throw new ApplicationError('sortBy.key geçersiz: ' + SHIPMENT_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
        }
        sortBy[field] = direction;
    } else {
        sortBy._id = 1;
    }

    // [API_TENANT_SURFACE §6] sayfalama girdisi doğrulanır: eksik => {1,15} (eskiden TypeError/500), sınırsız `limit` => 400
    const pagination = request.pagination ?? { page: 1, limit: 15 };
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 15;
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new ApplicationError('pagination.page geçersiz.', 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SHIPMENTS_PAGE_LIMIT) throw new ApplicationError(`pagination.limit 1 ile ${MAX_SHIPMENTS_PAGE_LIMIT} arasında bir tamsayı olmalıdır.`, 400);
    const skipCount = (page - 1) * limit;

    const { total, items } = await new OrderRepository(clientDB).pagedSearch({}, sortBy, skipCount, limit);
    const response: any = { totalNumberOfRecords: total, orders: items };
    if (items.length > 0) response.fromTo = { from: skipCount + 1, to: skipCount + items.length };
    return response;
}

/** Kargo takip kodunu pazaryerine gönderir ve `platformActions`'a loglar. İstisna yutulur, `{success:false}` döner. */
async function syncShipmentToPlatform(deps: ShipmentDeps, order: any, fulfillmentData: any, shipmentDate: Date): Promise<IPlatformResponse> {
    try {
        const factory = new IntegrationFactory(Number(deps.clientId));
        const instance = await factory.getInstance(order.integrationCode);
        if (instance && typeof instance.sendOrderShipping === 'function') {
            const platformResult = await instance.sendOrderShipping({
                orderId: order.externalOrderId,
                remoteOrderId: String(order._id),
                carrierCode: fulfillmentData?.carrierCode || fulfillmentData?.carrierName,
                carrierName: fulfillmentData?.carrierName,
                trackingCode: fulfillmentData?.trackingCode,
                trackingUrl: fulfillmentData?.trackingUrl,
                shipmentDate: shipmentDate,
                meta: { shipmentMethod: order.fulfillment?.[0]?.shipmentMethod || 'MANUAL' },
            });
            await new OrderRepository(deps.clientDB).updateById(order._id, {
                $push: {
                    platformActions: {
                        actionType: 'UPDATE_TRACKING',
                        platform: order.integrationCode,
                        requestPayload: fulfillmentData,
                        responsePayload: platformResult.rawResponse,
                        status: platformResult.success ? 'SUCCESS' : 'FAILED',
                        requestId: platformResult.rawResponse?.batchRequestId || null,
                        createdAt: new Date(),
                    },
                },
            });
            return platformResult;
        }
        return { success: true, message: 'Platform kargo bildirimini desteklemiyor veya metod tanımlı değil.' };
    } catch (syncError: any) {
        console.error('[ShipmentService] Platform Sync Error:', syncError);
        return { success: false, message: syncError.message };
    }
}

/** TEKİL SEVKİYAT: kargo bilgisi yoksa manuel form istenir; teslim edilmiş sipariş SHIPPED'a geri çekilmez. */
export async function createShipment(deps: ShipmentDeps, orderId: unknown, fulfillmentData: any) {
    try {
        return await createShipmentUnlogged(deps, orderId, fulfillmentData);
    } catch (error: any) {
        console.error('[ShipmentService] createShipment Hatası:', error);
        throw error;
    }
}

async function createShipmentUnlogged(deps: ShipmentDeps, orderId: unknown, fulfillmentData: any) {
    const orders = new OrderRepository(deps.clientDB);
    const order = await orders.findById(orderId);
    if (!order) throw new Error('Sipariş bulunamadı.');

    const hasShipmentIntegration = false; // Kargo entegrasyonu kontrolü (ileride konfigürasyondan)
    if (!hasShipmentIntegration && !fulfillmentData) {
        return { success: false, action: 'OPEN_MANUAL_SHIPMENT_FORM', message: 'Kargo entegrasyonu bulunamadı. Lütfen bilgileri manuel girin.' };
    }

    const now = new Date();
    const platformResult = await syncShipmentToPlatform(deps, order, fulfillmentData, now);
    if (!platformResult.success) {
        return { success: false, message: `Kargo bilgileri platforma iletilemedi: ${platformResult.message}`, data: { order } };
    }

    const statusUpdate: any = { 'dates.shippedDate': now };
    if (order.internalStatus !== OrderInternalStatusEnum.DELIVERED) statusUpdate.internalStatus = OrderInternalStatusEnum.SHIPPED;

    const updatedOrder = await orders.updateById(orderId, {
        $set: statusUpdate,
        $push: {
            fulfillment: {
                shipmentMethod: fulfillmentData?.shipmentMethod || 'MANUAL',
                status: 'SUCCESS',
                carrierCode: fulfillmentData?.carrierCode,
                carrierName: fulfillmentData?.carrierName,
                trackingCode: fulfillmentData?.trackingCode,
                trackingUrl: fulfillmentData?.trackingUrl,
                shippedAt: now,
            },
            history: {
                status: statusUpdate.internalStatus || order.internalStatus,
                changedAt: new Date(),
                description: `Kargo bilgileri girildi (${fulfillmentData?.carrierName}: ${fulfillmentData?.trackingCode}) ve pazaryerine iletildi.`,
                actionBy: 'USER',
            },
        },
    }, { new: true });
    return { success: true, message: 'Sevkiyat bilgileri başarıyla işlendi ve platforma iletildi.', data: updatedOrder };
}

/** TOPLU SEVKİYAT: her sipariş YALNIZ `{orderId}` ile `createShipment`'e gider (kargo verisi yoksa manuel form -> başarısız). */
export async function bulkCreateShipment(deps: ShipmentDeps, orderIds: unknown) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) throw new Error('Lütfen işlem yapılacak en az bir sipariş seçin.');

    const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };
    const orders = new OrderRepository(deps.clientDB);
    for (const orderId of orderIds) {
        let orderNumber = orderId;
        try {
            const orderRecord = await orders.findById(orderId).select('orderNumber');
            if (orderRecord && orderRecord.orderNumber) orderNumber = orderRecord.orderNumber;
            const res: any = await createShipment(deps, orderId, undefined);
            if (res.success) {
                results.successful.push({ orderId, orderNumber, data: res.data });
                results.successCount++;
            } else {
                results.failed.push({ orderId, orderNumber, reason: 'Kargo bilgileri (desi/firma) eksik. Lütfen bu siparişi tekli olarak işleyiniz.' });
                results.failedCount++;
            }
        } catch (error: any) {
            results.failed.push({ orderId, orderNumber, reason: error.message || 'Kargo bilgileri oluşturulurken bir hata oluştu' });
            results.failedCount++;
        }
    }
    return {
        success: true,
        message: `Toplu kargo işlemi tamamlandı. ${results.successCount} başarılı, ${results.failedCount} başarısız.`,
        data: results,
    };
}

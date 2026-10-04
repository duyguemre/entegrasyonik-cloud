import { OrderInternalStatusEnum, IPlatformResponse, ISendTrackingPayload } from '@interfaces/index'
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ApplicationError } from '@platform/core/security/Security';
import type { ShipmentPanelRepository } from '@database/repositories/tenant/ShipmentPanelRepository'

/**
 * ADR-0024 Dalga 3 (P3-ORD): sevkiyat iş kuralları (liste, kargo bilgisi girişi + pazaryeri bildirimi, toplu). Davranış
 * `ShipmentService`'in eski gövdeleriyle birebir. Günlükleme çağıran (handler) tarafındadır: `logError` platform bildirim
 * hatasını yazar.
 */
export interface ShipmentDeps { repo: ShipmentPanelRepository; clientId: number; logError: (message: string, error: unknown) => void }

export const MAX_SHIPMENTS_PAGE_LIMIT = 100;

/**
 * [MM-08 / ADR-0021 aynı desen] getShipments sıralama alanı izin listesi. `getShipments` `Orders` koleksiyonunu
 * sorguladığından (`getOrderModel()`) alanlar Order şemasından türetildi (OrderService.getOrders ile TUTARLI).
 * `price` özel eşlemesi (`sortBy['prices.' + key]`) MEVCUT davranış olarak KORUNDU (BULGU: Order şemasında
 * `prices` alanı yok, muhtemelen `financials` ile karıştırılmış — düzeltilmedi, yalnızca doğrulandı).
 * [DÜZELTME, 2026-09-29, orkestratör] `sortBy` ÖNCEDEN hesaplanıyor ama pipeline'daki `$facet`e HİÇ
 * UYGULANMIYORDU (ölü kod, sıralama isteği sessizce yok sayılıyordu) — artık `orders` dalına `$skip`/`$limit`'ten
 * ÖNCE `{ $sort: sortBy }` eklendi.
 */
const SHIPMENT_SORT_FIELD_ALIASES: Record<string, string> = { price: 'prices.price' };
const SHIPMENT_SORT_FIELDS: readonly string[] = [
    'prices.price', 'orderNumber', 'externalOrderId', 'internalStatus', 'integrationCode', '_id',
];

export async function listShipments(repo: ShipmentPanelRepository, request: any): Promise<any> {
    let direction = 1
    const sortBy: any = {}
    if (request.sortBy != undefined && request.sortBy.key) {
        direction = request.sortBy.order == 'asc' ? 1 : -1
        const field = SHIPMENT_SORT_FIELD_ALIASES[request.sortBy.key] ?? request.sortBy.key;
        if (typeof field !== 'string' || !SHIPMENT_SORT_FIELDS.includes(field)) {
            throw new ApplicationError('sortBy.key geçersiz: ' + SHIPMENT_SORT_FIELDS.join(', ') + ' değerlerinden biri olmalıdır.', 400);
        }
        sortBy[field] = direction
    } else {
        sortBy._id = 1
    }

    const filterQuery = {};
    const response: any = {};

    // [API_TENANT_SURFACE §6] sayfalama girdisi doğrulanır: eksik => {1,15} (eskiden TypeError/500), sınırsız `limit` => 400
    const pagination = request.pagination ?? { page: 1, limit: 15 };
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 15;
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new ApplicationError('pagination.page geçersiz.', 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SHIPMENTS_PAGE_LIMIT) throw new ApplicationError(`pagination.limit 1 ile ${MAX_SHIPMENTS_PAGE_LIMIT} arasında bir tamsayı olmalıdır.`, 400);
    const skipCount = (page - 1) * limit;
    const limitCount = limit;

    const { total, orders } = await repo.listPage(filterQuery, sortBy, skipCount, limitCount);

    response.totalNumberOfRecords = total;
    response.orders = orders;
    if (response.orders.length > 0) {
        response.fromTo = {
            from: skipCount + 1,
            to: skipCount + response.orders.length
        };
    }
    return response;
}

/**
 * TEKİL SEVKİYAT / KARGO PAKETİ OLUŞTURMA
 */
export async function createShipment(deps: ShipmentDeps, orderId: any, fulfillmentData: any): Promise<any> {
    const { repo } = deps;
    const order = await repo.findOrderById(orderId);
    if (!order) throw new Error("Sipariş bulunamadı.");

    // 1. Kargo entegrasyonu kontrolü (İleride konfigürasyondan okunabilir)
    const hasShipmentIntegration = false;

    if (!hasShipmentIntegration && !fulfillmentData) {
        return {
            success: false,
            action: 'OPEN_MANUAL_SHIPMENT_FORM',
            message: 'Kargo entegrasyonu bulunamadı. Lütfen bilgileri manuel girin.'
        };
    }

    const now = new Date();

    // 2. PAZARYERİ BİLDİRİMİ (ÖNCE)
    // Platform bildirimini yapıyoruz. Eğer platform reddederse DB statüsünü güncellemiyoruz.
    const platformResult = await syncShipmentToPlatform(deps, order, fulfillmentData, now);

    if (!platformResult.success) {
        return {
            success: false,
            message: `Kargo bilgileri platforma iletilemedi: ${platformResult.message}`,
            data: { order }
        };
    }

    // [eslesme-fiyat WP6, K-D] `performed:false` = kanal tarafında işlem YAPILMADI (ör. Trendyol lojistiği). Yerel kayıt
    // yine güncellenir ama kullanıcıya ve denetim izine "iletildi" denmez (ADR-0006 sahte başarı yok).
    const notPerformed = platformResult.performed === false;

    // 3. DB GÜNCELLEME (Internal State - SONRA)
    const statusUpdate: any = {
        'dates.shippedDate': now
    };

    // Sadece Teslim Edilmediyse 'SHIPPED' yap
    if (order.internalStatus !== OrderInternalStatusEnum.DELIVERED) {
        statusUpdate.internalStatus = OrderInternalStatusEnum.SHIPPED;
    }

    const updatedOrder = await repo.updateOrderById(
        orderId,
        {
            $set: statusUpdate,
            $push: {
                fulfillment: {
                    shipmentMethod: fulfillmentData?.shipmentMethod || 'MANUAL',
                    status: 'SUCCESS',
                    carrierCode: fulfillmentData?.carrierCode,
                    carrierName: fulfillmentData?.carrierName,
                    trackingCode: fulfillmentData?.trackingCode,
                    trackingUrl: fulfillmentData?.trackingUrl,
                    shippedAt: now
                },
                history: {
                    status: statusUpdate.internalStatus || order.internalStatus,
                    changedAt: new Date(),
                    description: `Kargo bilgileri girildi (${fulfillmentData?.carrierName}: ${fulfillmentData?.trackingCode}) ${notPerformed ? 've pazaryerine iletilmedi (kanal bildirim gerektirmiyor).' : 've pazaryerine iletildi.'}`,
                    actionBy: 'USER',
                    action: 'SHIP'
                }
            }
        },
        { new: true }
    );

    return {
        success: true,
        message: notPerformed
            ? `Sevkiyat bilgileri kaydedildi; pazaryerine bildirim yapılmadı: ${platformResult.message || 'kanal bildirim gerektirmiyor.'}`
            : 'Sevkiyat bilgileri başarıyla işlendi ve platforma iletildi.',
        platformPerformed: !notPerformed,
        data: updatedOrder
    };
}

/**
 * TOPLU SEVKİYAT / KARGO PAKETİ OLUŞTURMA
 * Seçilen tüm siparişler için sırayla `create(orderId)` (tekil oluşturma; çağıran tarafça sağlanır) tetiklenir.
 */
export async function bulkCreateShipments(repo: ShipmentPanelRepository, orderIds: any, create: (orderId: any) => Promise<any>): Promise<any> {
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new Error("Lütfen işlem yapılacak en az bir sipariş seçin.");
    }

    const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };

    for (const orderId of orderIds) {
        let orderNumber = orderId;

        try {
            // 1. Sipariş Numarasını frontend'e düzgün yollamak için DB'den çek
            const orderRecord = await repo.findOrderNumberById(orderId);
            if (orderRecord && orderRecord.orderNumber) {
                orderNumber = orderRecord.orderNumber;
            }

            // 2. Tekil kargoyu çağır
            const res = await create(orderId);

            // 3. Yanıtı Kontrol Et
            if (res.success) {
                results.successful.push({
                    orderId,
                    orderNumber,
                    data: res.data
                });
                results.successCount++;
            } else {
                // Kargo entegrasyonu yoksa ve manuel form isteniyorsa (OPEN_MANUAL_SHIPMENT_FORM)
                results.failed.push({
                    orderId,
                    orderNumber,
                    reason: "Kargo bilgileri (desi/firma) eksik. Lütfen bu siparişi tekli olarak işleyiniz."
                });
                results.failedCount++;
            }

        } catch (error: any) {
            // Beklenmedik veritabanı veya kod hataları
            results.failed.push({
                orderId,
                orderNumber,
                reason: error.message || "Kargo bilgileri oluşturulurken bir hata oluştu"
            });
            results.failedCount++;
        }
    }

    return {
        success: true,
        message: `Toplu kargo işlemi tamamlandı. ${results.successCount} başarılı, ${results.failedCount} başarısız.`,
        data: results
    };
}

/**
 * [eslesme-fiyat WP6, D-ORD-6 / Ek E F-P0-3] Kargo bildirim sözleşmesi. ESKİDEN `lineItems`, `meta.orderItemId` ve
 * `meta.currentExternalStatus` gönderilmiyordu: HB boş paket (`createPackage([])`), N11/PZ `orderItemId = orderNumber`, PZ 3→12
 * geçişi atlanıyordu. Artık iptal/iade edilmemiş TÜM satırlar (`externalLineItemId` = pazaryeri satır kimliği), ilk satırın
 * kimliği (eski tekil tüketiciler için), dış durum ve varsa paket numarası / kampanya kodu gider.
 */
export function buildShippingPayload(order: any, fulfillmentData: any, shipmentDate: Date): ISendTrackingPayload {
    const activeLines = (order.items || []).filter((i: any) => i?.itemStatus !== 'CANCELLED' && i?.itemStatus !== 'RETURNED');
    const lineItems = activeLines
        .filter((i: any) => i?.externalLineItemId !== undefined && i?.externalLineItemId !== null && String(i.externalLineItemId) !== '')
        .map((i: any) => ({ externalLineItemId: String(i.externalLineItemId), merchantSku: i.sku, quantity: Number(i.quantity) || 1 }));
    const meta: Record<string, any> = {
        shipmentMethod: order.fulfillment?.[0]?.shipmentMethod || 'MANUAL',
        currentExternalStatus: order.externalStatus !== undefined && order.externalStatus !== null ? String(order.externalStatus) : undefined,
        orderItemId: lineItems[0]?.externalLineItemId,
    };
    const packageNumber = order.meta?.packageNumber ?? order.meta?.PackageNumber ?? order.meta?.shipmentPackageId;
    if (packageNumber !== undefined && packageNumber !== null && String(packageNumber) !== '') meta.packageNumber = String(packageNumber);
    if (fulfillmentData?.campaignCode) meta.campaignNumber = String(fulfillmentData.campaignCode);
    if (fulfillmentData?.deliveryType !== undefined) meta.deliveryType = fulfillmentData.deliveryType;
    return {
        orderId: order.externalOrderId,
        remoteOrderId: String(order._id),
        carrierCode: fulfillmentData?.carrierCode || fulfillmentData?.carrierName,
        carrierName: fulfillmentData?.carrierName,
        trackingCode: fulfillmentData?.trackingCode,
        trackingUrl: fulfillmentData?.trackingUrl,
        shipmentDate,
        lineItems,
        meta,
    };
}

/**
 * Platform Entegrasyonu Bildirimi (Sync)
 * Kargo takip kodunu pazaryerine gönderir ve loglar.
 */
async function syncShipmentToPlatform(deps: ShipmentDeps, order: any, fulfillmentData: any, shipmentDate: Date): Promise<IPlatformResponse> {
    try {
        const factory = new IntegrationFactory(deps.clientId);
        const instance = await factory.getInstance(order.integrationCode);

        if (instance && typeof instance.sendOrderShipping === 'function') {
            const platformResult = await instance.sendOrderShipping(buildShippingPayload(order, fulfillmentData, shipmentDate));

            // Platform hareketini logla
            await deps.repo.updateOrderById(order._id, {
                $push: {
                    platformActions: {
                        actionType: 'UPDATE_TRACKING',
                        platform: order.integrationCode,
                        requestPayload: fulfillmentData,
                        responsePayload: platformResult.rawResponse,
                        status: !platformResult.success ? 'FAILED' : platformResult.performed === false ? 'SKIPPED' : 'SUCCESS',
                        requestId: platformResult.rawResponse?.batchRequestId || null,
                        createdAt: new Date()
                    }
                }
            });

            return platformResult;
        }

        return { success: true, message: 'Platform kargo bildirimini desteklemiyor veya metod tanımlı değil.' };
    } catch (syncError: any) {
        deps.logError("[ShipmentService] Platform Sync Error:", syncError);
        return { success: false, message: syncError.message };
    }
}

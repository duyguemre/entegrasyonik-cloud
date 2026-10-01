import { IService, OrderInternalStatusEnum, IPlatformResponse } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ApplicationError } from '@platform/core/security/Security';

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

export default class ShipmentService extends BaseApi implements IService {


    async get(): Promise<any> {
    }

    async getShipments(): Promise<any> {
        try {
            var direction = 1
            const sortBy: any = {}
            if (this.request.sortBy != undefined && this.request.sortBy.key) {
                direction = this.request.sortBy.order == 'asc' ? 1 : -1
                const field = SHIPMENT_SORT_FIELD_ALIASES[this.request.sortBy.key] ?? this.request.sortBy.key;
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
            const pagination = this.request.pagination ?? { page: 1, limit: 15 };
            const page = pagination.page ?? 1;
            const limit = pagination.limit ?? 15;
            if (!Number.isInteger(page) || page < 1 || page > 100000) throw new ApplicationError('pagination.page geçersiz.', 400);
            if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SHIPMENTS_PAGE_LIMIT) throw new ApplicationError(`pagination.limit 1 ile ${MAX_SHIPMENTS_PAGE_LIMIT} arasında bir tamsayı olmalıdır.`, 400);
            const skipCount = (page - 1) * limit;
            const limitCount = limit;

            const result = await this.clientDB.getOrderModel().aggregate([
                { $match: filterQuery },
                { $sort: sortBy }, // [DB-02] $facet dışında: indeks kullanılabilir
                {
                    $facet: {
                        totalNumberOfRecords: [
                            { $count: 'count' }
                        ],
                        orders: [
                            { $skip: skipCount },
                            { $limit: limitCount }
                        ]
                    }
                },
            ]);

            const aggregationResult = result[0] || {};

            response.totalNumberOfRecords = aggregationResult.totalNumberOfRecords?.[0]?.count || 0;
            response.orders = aggregationResult.orders || [];
            if (response.orders.length > 0) {
                response.fromTo = {
                    from: skipCount + 1,
                    to: skipCount + response.orders.length
                };
            }
            return response;
        } catch (error) {
            throw error
        }
    }

    /**
     * TEKİL SEVKİYAT / KARGO PAKETİ OLUŞTURMA
     */
    async createShipment(): Promise<any> {
        try {
            const { orderId, fulfillmentData } = this.request;

            const order = await this.clientDB.getOrderModel().findById(orderId);
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
            const platformResult = await this.syncShipmentToPlatform(order, fulfillmentData, now);

            if (!platformResult.success) {
                return {
                    success: false,
                    message: `Kargo bilgileri platforma iletilemedi: ${platformResult.message}`,
                    data: { order }
                };
            }

            // 3. DB GÜNCELLEME (Internal State - SONRA)
            const statusUpdate: any = {
                'dates.shippedDate': now
            };

            // Sadece Teslim Edilmediyse 'SHIPPED' yap
            if (order.internalStatus !== OrderInternalStatusEnum.DELIVERED) {
                statusUpdate.internalStatus = OrderInternalStatusEnum.SHIPPED;
            }

            const updatedOrder = await this.clientDB.getOrderModel().findByIdAndUpdate(
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
                            description: `Kargo bilgileri girildi (${fulfillmentData?.carrierName}: ${fulfillmentData?.trackingCode}) ve pazaryerine iletildi.`,
                            actionBy: 'USER'
                        }
                    }
                },
                { new: true }
            );

            return {
                success: true,
                message: 'Sevkiyat bilgileri başarıyla işlendi ve platforma iletildi.',
                data: updatedOrder
            };

        } catch (error: any) {
            console.error('[ShipmentService] createShipment Hatası:', error);
            throw error;
        }
    }

    /**
     * TOPLU SEVKİYAT / KARGO PAKETİ OLUŞTURMA
     * Seçilen tüm siparişler için sırayla createShipment metodunu tetikler.
     */
    async bulkCreateShipment(): Promise<any> {
        const { orderIds } = this.request;

        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            throw new Error("Lütfen işlem yapılacak en az bir sipariş seçin.");
        }

        const results = { successCount: 0, failedCount: 0, successful: [] as any[], failed: [] as any[] };
        const originalRequest = { ...this.request };

        for (const orderId of orderIds) {
            let orderNumber = orderId;

            try {
                // 1. Sipariş Numarasını frontend'e düzgün yollamak için DB'den çek
                const orderRecord = await this.clientDB.getOrderModel().findById(orderId).select('orderNumber');
                if (orderRecord && orderRecord.orderNumber) {
                    orderNumber = orderRecord.orderNumber;
                }

                // 2. Tekil kargoyu çağır
                this.request = { orderId };
                const res = await this.createShipment();

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

        // İstek objesini eski haline getir
        this.request = originalRequest;

        return {
            success: true,
            message: `Toplu kargo işlemi tamamlandı. ${results.successCount} başarılı, ${results.failedCount} başarısız.`,
            data: results
        };
    }

    /**
     * PRIVATE: Platform Entegrasyonu Bildirimi (Sync)
     * Kargo takip kodunu pazaryerine gönderir ve loglar.
     */
    private async syncShipmentToPlatform(order: any, fulfillmentData: any, shipmentDate: Date): Promise<IPlatformResponse> {
        try {
            const factory = new IntegrationFactory(Number(this.currentClientId));
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
                    meta: {
                        shipmentMethod: order.fulfillment?.[0]?.shipmentMethod || 'MANUAL'
                    }
                });

                // Platform hareketini logla
                await this.clientDB.getOrderModel().findByIdAndUpdate(order._id, {
                    $push: {
                        platformActions: {
                            actionType: 'UPDATE_TRACKING',
                            platform: order.integrationCode,
                            requestPayload: fulfillmentData,
                            responsePayload: platformResult.rawResponse,
                            status: platformResult.success ? 'SUCCESS' : 'FAILED',
                            requestId: platformResult.rawResponse?.batchRequestId || null,
                            createdAt: new Date()
                        }
                    }
                });

                return platformResult;
            }

            return { success: true, message: 'Platform kargo bildirimini desteklemiyor veya metod tanımlı değil.' };
        } catch (syncError: any) {
            console.error("[ShipmentService] Platform Sync Error:", syncError);
            return { success: false, message: syncError.message };
        }
    }
}

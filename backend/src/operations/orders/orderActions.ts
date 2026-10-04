import { IOrderRejectParams, OrderInternalStatusEnum } from '@interfaces/index';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import type { OrderPanelRepository } from '@database/repositories/tenant/OrderPanelRepository';

/**
 * ADR-0024 Dalga 3 (P3-ORD): sipariş iptal/onay iş kuralları (pazaryeri bildirimi + yerel durum güncellemesi).
 * Tenant = `clientId` (doğrulanmış principal) + `repo` (tenant DB). Davranış `OrderService`'in eski gövdeleriyle birebir.
 */
export interface OrderActionDeps { repo: OrderPanelRepository; clientId: number }

type BulkResults = { successCount: number; failedCount: number; successful: any[]; failed: any[] };
const emptyResults = (): BulkResults => ({ successCount: 0, failedCount: 0, successful: [], failed: [] });

/**
 * [eslesme-fiyat WP6, Ek E F-P0-4] Satır kimliği = pazaryeri SATIR kimliği (`externalLineItemId`). ESKİDEN `externalItemId`
 * (Pazarama'da ProductId, HB'de SKU) gidiyordu → PZ `updateOrderStatus` yanlış OrderItemId alıyordu (oversell telafisi dahil).
 * TY'de iki alan aynıdır (lineId), davranış değişmez.
 */
const lineIdOf = (item: any): string => String(item.externalLineItemId || item.externalItemId);

/** Evrensel reject parametreleri: satırlar (Trendyol/Amazon gibi) + lojistik paket meta'sı. */
function rejectParamsOf(order: any, reasonId: any, reason: any): IOrderRejectParams {
    return {
        reasonId: String(reasonId),
        description: reason,
        source: 'SELLER',
        lineItems: order.items.map((item: any) => ({
            externalLineId: lineIdOf(item),
            quantity: item.quantity
        })),
        meta: order.meta
    };
}

function cancelUpdate(reason: any, lockTime: Date, message: string, description: string) {
    return {
        $set: {
            internalStatus: OrderInternalStatusEnum.CANCELLED,
            'items.$[].itemStatus': 'CANCELLED',
            'dates.externalUpdatedAt': new Date(),
            'dates.cancelledDate': new Date(),
            'cancelReason': reason,
            'cancelSource': 'SELLER',
            platformOperation: { status: 'PENDING', message, lockedUntil: lockTime }
        },
        $push: {
            history: { status: OrderInternalStatusEnum.CANCELLED, changedAt: new Date(), description, actionBy: 'USER', action: 'CANCEL' }
        }
    };
}

const lockIn = (minutes: number): Date => { const t = new Date(); t.setMinutes(t.getMinutes() + minutes); return t; };

/** TEKİL SİPARİŞ İPTALİ (Reject/Unsupplied). Pazaryeri `false` dönerse hata; DB güncellemesi yalnız başarıda. */
export async function cancelOrder({ repo, clientId }: OrderActionDeps, orderId: any, cancelData: any): Promise<any> {
    const { reason, reasonId } = cancelData;
    const order = await repo.findById(orderId);
    if (!order) throw new Error('Sipariş bulunamadı.');

    const factory = new IntegrationFactory(Number(clientId));
    const instance = await factory.getInstance(order.integrationCode);
    const marketplaceResult = await instance.rejectOrder(order.externalOrderId, rejectParamsOf(order, reasonId, reason));
    if (marketplaceResult === false) {
        throw new Error('Pazar yeri iptal işlemini reddetti veya bir sorun oluştu.');
    }

    const updatedOrder = await repo.updateById(
        orderId,
        cancelUpdate(reason, lockIn(5), 'Sipariş iptal ediliyor, pazar yeri onayı bekleniyor...', `Sipariş kullanıcı tarafından iptal edildi. Sebep: ${reason}`),
        { new: true }
    );
    return { success: true, message: 'Sipariş başarıyla iptal edildi.', data: updatedOrder };
}

/** TOPLU SİPARİŞ İPTALİ: sipariş başına hata toplanır (biri diğerini durdurmaz); entegrasyon örneği önbelleklenir. */
export async function bulkCancelOrders({ repo, clientId }: OrderActionDeps, orderIds: any, cancelData: any): Promise<any> {
    const reasonId = cancelData?.reasonId;
    const reason = cancelData?.reason;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new Error("İptal edilecek sipariş seçilmedi.");
    }

    const results = emptyResults();
    const instanceCache: Map<string, any> = new Map();
    const factory = new IntegrationFactory(Number(clientId));
    const lockTime = lockIn(5);

    for (const orderId of orderIds) {
        try {
            const order = await repo.findById(orderId);
            if (!order) throw new Error(`${orderId} nolu sipariş sistemde bulunamadı.`);

            let instance = instanceCache.get(order.integrationCode);
            if (!instance) {
                instance = await factory.getInstance(order.integrationCode);
                instanceCache.set(order.integrationCode, instance);
            }

            const marketplaceResult = await instance.rejectOrder(order.externalOrderId, rejectParamsOf(order, reasonId, reason));
            if (marketplaceResult === false) {
                throw new Error('Pazar yeri bu iptal isteğine onay vermedi.');
            }

            await repo.updateById(orderId, cancelUpdate(reason, lockTime, 'Sipariş toplu işlem ile iptal ediliyor...', `Toplu iptal işlemiyle reddedildi. Sebep: ${reason}`));
            results.successful.push({ orderId, orderNumber: order.orderNumber });
            results.successCount++;
        } catch (error: any) {
            results.failed.push({ orderId, errorMessage: error.message || "Bilinmeyen hata" });
            results.failedCount++;
        }
    }

    return {
        success: results.failedCount === 0,
        message: `${results.successCount} sipariş iptal edildi, ${results.failedCount} hata alındı.`,
        data: results
    };
}

/** SİPARİŞ ONAYLAMA: yalnız AWAITING_APPROVAL; platform kargo etiketi döndürdüyse `fulfillment` doldurulur. */
export async function approveOrder({ repo, clientId }: OrderActionDeps, orderId: any): Promise<any> {
    const order = await repo.findById(orderId);
    if (!order) throw new Error('Sipariş bulunamadı.');
    if (order.internalStatus !== OrderInternalStatusEnum.AWAITING_APPROVAL) {
        throw new Error('Sadece "Satıcı Onayı Bekliyor" durumundaki siparişler onaylanabilir.');
    }

    const factory = new IntegrationFactory(Number(clientId));
    const instance = await factory.getInstance(order.integrationCode);
    const result = await instance.approveOrder(order.externalOrderId, {
        meta: {
            externalLineItemId: order.items?.[0]?.externalLineItemId,
            ...order.meta
        }
    });
    if (!result) throw new Error('Pazar yeri onay işlemini reddetti.');

    const updateFields: any = {
        internalStatus: OrderInternalStatusEnum.APPROVED,
        'dates.externalUpdatedAt': new Date(),
        'dates.approvedDate': new Date(),
        platformOperation: {
            status: 'PENDING',
            message: 'Sipariş paketlendi, pazar yeri onayı ve kargo bilgileri senkronize ediliyor...',
            lockedUntil: lockIn(2) // 2 dakikalık kilit
        }
    };

    // Platform detaylı kargo bilgisi (etiket vb.) döndüyse fulfillment güncellenir
    if (typeof result === 'object' && result.success && result.rawResponse) {
        const raw = result.rawResponse;
        if (raw.barcode || raw.trackingCode || raw.labelUrl) {
            updateFields.fulfillment = [{
                shipmentMethod: 'MARKETPLACE',
                status: 'PENDING',
                trackingCode: raw.barcode || raw.trackingCode,
                labelUrl: raw.labelUrl,
                campaignCode: raw.packageNumber,
                createdAt: new Date()
            }];
        }
    }

    const updatedOrder = await repo.updateById(
        orderId,
        {
            $set: updateFields,
            $push: {
                history: { status: OrderInternalStatusEnum.APPROVED, changedAt: new Date(), description: 'Sipariş kullanıcı tarafından onaylandı.', actionBy: 'USER', action: 'APPROVE' }
            }
        },
        { new: true }
    );
    return { success: true, message: 'Sipariş onaylandı.', data: updatedOrder };
}

/** TOPLU SİPARİŞ ONAYLAMA. */
export async function bulkApproveOrders({ repo, clientId }: OrderActionDeps, orderIds: any): Promise<any> {
    if (!Array.isArray(orderIds) || orderIds.length === 0) throw new Error("Onaylanacak sipariş seçilmedi.");

    const results = emptyResults();
    const factory = new IntegrationFactory(Number(clientId));
    const instanceCache = new Map<string, any>();
    const lockTime = lockIn(5);

    for (const orderId of orderIds) {
        try {
            const order = await repo.findById(orderId);
            if (!order) throw new Error('Bulunamadı.');
            if (order.internalStatus !== OrderInternalStatusEnum.AWAITING_APPROVAL) throw new Error('Statü uygun değil.');

            let instance = instanceCache.get(order.integrationCode);
            if (!instance) {
                instance = await factory.getInstance(order.integrationCode);
                instanceCache.set(order.integrationCode, instance);
            }

            const res = await instance.approveOrder(order.externalOrderId, {
                meta: { externalLineItemId: order.items?.[0]?.externalLineItemId, ...order.meta }
            });
            if (!res) throw new Error('Platform reddetti.');

            await repo.updateById(orderId, {
                $set: {
                    internalStatus: OrderInternalStatusEnum.APPROVED,
                    'dates.approvedDate': new Date(),
                    platformOperation: { status: 'PENDING', message: 'Sipariş toplu işlem ile onaylanıyor...', lockedUntil: lockTime }
                },
                $push: {
                    history: { status: OrderInternalStatusEnum.APPROVED, changedAt: new Date(), description: 'Toplu onay işlemiyle onaylandı.', actionBy: 'USER', action: 'APPROVE' }
                }
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
        data: results
    };
}

/** BARKOD YAZDIRILDI İŞARETLEMESİ (yalnız yerel bayrak + platformActions kaydı). */
export async function markOrderPrinted(repo: OrderPanelRepository, orderId: any): Promise<any> {
    const updatedOrder = await repo.updateById(
        orderId,
        {
            $set: { 'flags.isBarcodePrinted': true },
            $push: {
                platformActions: {
                    actionType: 'BARCODE_PRINT',
                    platform: 'SYSTEM',
                    status: 'SUCCESS',
                    requestPayload: { printedAt: new Date() },
                    responsePayload: { message: "Barkod başarıyla yazdırıldı." },
                    createdAt: new Date()
                }
            }
        },
        { new: true }
    );
    return { success: true, message: 'Barkod basıldı olarak işaretlendi.', data: updatedOrder };
}

/**
 * SİPARİŞ İPTAL NEDENLERİ (pazaryerine özgü). [eslesme-fiyat WP6, K-G] İPTAL kataloğu (`retrieveOrderCancelReasons`; yoksa eski
 * `retrieveOrderRejectionReasons`). İade reddi sebepleri ayrı: `claimRejectReasons` (operations/orders/claims).
 */
export async function orderRejectionReasons(clientId: number, integrationCode: any): Promise<any> {
    const factory = new IntegrationFactory(Number(clientId));
    const instance = await factory.getInstance(integrationCode);
    const reasons = typeof instance.retrieveOrderCancelReasons === 'function'
        ? await instance.retrieveOrderCancelReasons()
        : await instance.retrieveOrderRejectionReasons();
    return { success: true, message: 'İptal nedenleri başarıyla getirildi.', data: reasons };
}

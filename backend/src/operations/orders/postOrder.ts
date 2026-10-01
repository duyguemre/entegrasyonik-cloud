import { IClientDB } from "@interfaces/index";
import { NotificationService } from "@services/notification/NotificationService";
import { getRequestId } from "@platform/core/context";
import { StockAllocator } from "@operations/stock/StockAllocator";
import { deriveDesiredAllocationBucket, AllocationBucket } from "@operations/stock/orderStatusMapping";
import { IStockAllocationResult } from "@interfaces/stock";

/**
 * ADR-0004 — Zero-oversell: rezervasyon, çakışma ve stok yayını modeli (Karar 3-4, seviye tetiklemeli sürücü).
 * bkz. docs/adr/0004-zero-oversell-rezervasyon-modeli.md
 *
 * ÖNCEKİ DAVRANIŞ (characterization ile sabitlendi, `tests/characterization/stock/PostOrderOperations.characterization.test.ts`):
 * bu sınıf BOŞTU — `OrderOrchestrator.triggerDownstreamWorkflows` içinde yorum satırı olarak anılıyordu
 * ("PostOrderOperations.triggerAllocation(...)") ama HİÇ örneklenmiyor/çağrılmıyordu; siparişten stok
 * düşme hattı yoktu (BACKLOG C8/1c bulgusu).
 *
 * YENİ DAVRANIŞ: `OrderWorker.process()` siparişleri kaydettikten SONRA (ADR Karar 3) bu sınıf her
 * sipariş SATIRI için pazaryeri durumundan istenen tahsis durumunu türetir (`orderStatusMapping`) ve
 * `StockAllocator.reserve/commit/release` (Aşama A, DEĞİŞTİRİLMEDİ) ile idempotent uygular. Her satır
 * BAĞIMSIZ ele alınır (ADR Karar 4, transaction YOK): bir satırın hatası diğerlerini bloklamaz.
 *
 * 15 dakikalık süpürme işi (`@operations/stock/AllocationSweepJob`) da AYNI `processOrder` metodunu
 * çökme/kaçak telafisi için tekrar çağırır (kod tekrarı YOK, tek giriş noktası).
 */
export class PostOrderOperations {
    /** Aynası (`Orders.items[].allocationState`) "tahsis edilmiş" sayılan durumlar — `flags.isAllocated` bundan türetilir. */
    private static readonly ALLOCATED_MIRROR_STATES = new Set(['RESERVED', 'COMMITTED', 'OVERSOLD']);
    /** Süpürme işinin yeniden sürmesi GEREKMEYEN (terminal) aynası durumları. */
    public static readonly SETTLED_MIRROR_STATES = ['COMMITTED', 'RELEASED', 'RESTOCKED'] as const;

    private readonly allocator: StockAllocator;

    constructor(private clientDB: IClientDB, allocator?: StockAllocator) {
        this.allocator = allocator || new StockAllocator(clientDB);
    }

    private get orderModel() {
        return this.clientDB.getOrderModel();
    }

    private get variantModel() {
        return this.clientDB.getVariantModel();
    }

    /**
     * `OrderWorker` giriş noktası: yeni kaydedilen/güncellenen siparişleri (external ID listesiyle) tazeden
     * (post-save) OKUR — bu KASITLI bir tasarım kararı (ADR'de belirtilmiyor): `OrderWorker`'ın elindeki
     * pre-save nesneler `items[].allocationState`/`lastAllocationAppliedAt` aynasını taşımaz (marketplace
     * transformer'ı bu alanları hiç set etmez); bayat-veri koruması ve "zaten UNMAPPED, tekrar bildirme"
     * kontrolü DB'deki GÜNCEL durumu gerektirir.
     */
    public async processOrdersByExternalIds(
        clientId: number,
        integrationCode: string,
        externalOrderIds: string[],
    ): Promise<void> {
        if (!externalOrderIds || externalOrderIds.length === 0) return;

        const orders = await this.orderModel
            .find({ integrationCode, externalOrderId: { $in: externalOrderIds } })
            .lean();

        for (const order of orders || []) {
            try {
                await this.processOrder(clientId, order);
            } catch (error) {
                console.error(`[PostOrderOperations] Sipariş işleme hatası (order=${(order as any)?.externalOrderId}):`, error);
            }
        }
    }

    /**
     * Tek bir siparişin TÜM satırlarını işler (her satır bağımsız, ADR Karar 4). Süpürme işi de bu metodu
     * doğrudan çağırır (kendi bulduğu stale order dokümanlarıyla).
     */
    public async processOrder(clientId: number, order: any): Promise<void> {
        const desiredBucket = deriveDesiredAllocationBucket(order.integrationCode, order.externalStatus, order.internalStatus);
        if (!desiredBucket) {
            console.warn(
                `[PostOrderOperations] Bilinmeyen durum, satırlar ATLANDI: integrationCode=${order.integrationCode} ` +
                `externalStatus=${order.externalStatus} internalStatus=${order.internalStatus} externalOrderId=${order.externalOrderId}`,
            );
            return;
        }

        const items = order.items || [];
        const finalStates: Array<string | undefined> = [];

        for (const item of items) {
            try {
                const state = await this.processItem(clientId, order, item, desiredBucket);
                finalStates.push(state);
            } catch (error) {
                // ADR Karar 4: bir satırın hatası diğerlerini BLOKLAMAZ; süpürme işi bu satırı tekrar dener
                // (aynası değişmediği için `allocationState` istenen durumla eşleşmeyecek -- sweep filtresine düşer).
                console.error(
                    `[PostOrderOperations] Satır işleme hatası (order=${order.externalOrderId}, line=${item.externalLineItemId}):`,
                    error,
                );
                finalStates.push(item.allocationState);
            }
        }

        await this.syncIsAllocatedFlag(order, finalStates);
    }

    /**
     * Tek bir sipariş satırını işler ve satırın (değişmiş veya değişmemiş) `allocationState` aynasını
     * döner. Sırasıyla: (1) bayat veri koruması, (2) varyant eşleşmesi (yoksa UNMAPPED + bildirim),
     * (3) `StockAllocator` ile idempotent geçiş, (4) aynayı DB'ye yazma, (5) OVERSOLD ise bildirim.
     */
    private async processItem(
        clientId: number,
        order: any,
        item: any,
        desiredBucket: AllocationBucket,
    ): Promise<string | undefined> {
        const externalUpdatedAt = order.dates?.externalUpdatedAt ? new Date(order.dates.externalUpdatedAt) : undefined;

        // Bayat veri koruması (ADR Karar 3 + yukarıdaki IOrderItem.lastAllocationAppliedAt JSDoc'u).
        if (item.lastAllocationAppliedAt && externalUpdatedAt) {
            const lastApplied = new Date(item.lastAllocationAppliedAt);
            if (externalUpdatedAt.getTime() <= lastApplied.getTime()) {
                console.log(
                    `[PostOrderOperations] Bayat veri, atlanıyor: ${this.buildKey(order, item)} ` +
                    `(externalUpdatedAt=${externalUpdatedAt.toISOString()} <= lastApplied=${lastApplied.toISOString()})`,
                );
                return item.allocationState;
            }
        }

        const variantId = await this.resolveVariantId(item);
        if (!variantId) {
            if (item.allocationState !== 'UNMAPPED') {
                await this.orderModel.updateOne(
                    { _id: order._id, 'items.externalLineItemId': item.externalLineItemId },
                    { $set: { 'items.$.allocationState': 'UNMAPPED' } },
                );
                await this.notify(clientId, order, item, { code: 'STOCK_UNMAPPED_LINE', withInteg: true, params: {} }, {
                    severity: 'warning',
                    title: 'Stok eşleşmesi bulunamadı',
                    message: `${order.orderNumber || order.externalOrderId} numaralı siparişteki "${item.productName || item.sku || item.barcode || item.externalLineItemId}" kalemi için varyant eşleşmesi bulunamadı; stok tahsisi yapılmadı.`,
                });
            }
            return 'UNMAPPED';
        }

        const key = this.buildKey(order, item);
        const qty = Number(item.quantity) || 0;

        let result: IStockAllocationResult;
        switch (desiredBucket) {
            case 'RESERVED':
                result = await this.allocator.reserve(variantId, key, qty);
                break;
            case 'COMMITTED':
                result = await this.allocator.commit(variantId, key, qty);
                break;
            case 'RELEASED':
                result = await this.allocator.release(variantId, key);
                break;
        }

        const appliedAt = externalUpdatedAt || new Date();
        await this.orderModel.updateOne(
            { _id: order._id, 'items.externalLineItemId': item.externalLineItemId },
            { $set: { 'items.$.allocationState': result.state, 'items.$.lastAllocationAppliedAt': appliedAt } },
        );

        // [ADR Karar 7, yalnızca bildirim tetikleme kısmı Aşama B kapsamında] Grace-period/auto-cancel
        // mantığı Aşama C'dedir; burada yalnızca YENİ tespit edilen (idempotent tekrar DEĞİL) OVERSOLD için
        // tenant'a anında bildirim gönderilir.
        if (result.state === 'OVERSOLD' && !result.idempotent) {
            await this.notify(clientId, order, item, { code: 'STOCK_OVERSOLD', withInteg: true, params: {} }, {
                severity: 'error',
                title: 'Stok yetersiz (oversell)',
                message: `${order.orderNumber || order.externalOrderId} numaralı sipariş stok yetersizliğinden OVERSOLD işaretlendi; telafi akışı (Aşama C) devreye girene kadar manuel takip gerekir.`,
            });
        }

        return result.state;
    }

    /**
     * `internalVariantId` -> yoksa `barcode` -> yoksa `sku` (Variant şemasındaki karşılığı `stockcode`)
     * sırasıyla dener. Hiçbiri eşleşmezse `null` (UNMAPPED).
     */
    private async resolveVariantId(item: any): Promise<any | null> {
        if (item.internalVariantId) return item.internalVariantId;

        if (item.barcode) {
            const byBarcode = await this.variantModel.findOne({ barcode: item.barcode }).select('_id').lean();
            if (byBarcode) return byBarcode._id;
        }
        if (item.sku) {
            const bySku = await this.variantModel.findOne({ stockcode: item.sku }).select('_id').lean();
            if (bySku) return bySku._id;
        }
        return null;
    }

    private buildKey(order: any, item: any): string {
        return `${order.integrationCode}:${order.externalOrderId}:${item.externalLineItemId}`;
    }

    /**
     * `Orders.flags.isAllocated` aynasını, bu turda işlenen satırların NİHAİ (değişmiş veya değişmemiş)
     * `allocationState` değerlerinden türetir (ADR: "flags.isAllocated bu aynadan türetilir"). Gereksiz
     * yazmayı önlemek için mevcut değerle aynıysa DB'ye dokunulmaz.
     */
    private async syncIsAllocatedFlag(order: any, finalStates: Array<string | undefined>): Promise<void> {
        const isAllocated = finalStates.length > 0
            && finalStates.every((s) => !!s && PostOrderOperations.ALLOCATED_MIRROR_STATES.has(s));

        if (order.flags?.isAllocated === isAllocated) return;

        await this.orderModel.updateOne(
            { _id: order._id },
            { $set: { 'flags.isAllocated': isAllocated } },
        );
    }

    /** [ADR-0029 NB3] Katalog kodu + params ile `notify`; bayrak kapaliyken eski olay (`legacy`) birebir. */
    private async notify(
        clientId: number,
        order: any,
        item: any,
        cat: { code: string; params: Record<string, unknown>; withInteg?: boolean },
        payload: { severity: 'warning' | 'error'; title: string; message: string },
    ): Promise<void> {
        try {
            await NotificationService.notify(cat.code, clientId, {
                ...(cat.withInteg ? { integ: String(order.integrationCode ?? 'unknown') } : {}),
                lineId: String(item.externalLineItemId),
                orderId: String(order.externalOrderId),
                ...(item.sku ? { sku: String(item.sku).slice(0, 80) } : {}),
                ...cat.params,
            }, {
                corrId: getRequestId(),
                module: 'PostOrderOperations',
                legacy: { event: {
                    clientId: String(clientId),
                    notificationData: {
                        type: 'STOCK_ALERT',
                        severity: payload.severity,
                        title: payload.title,
                        message: payload.message,
                        metaData: {
                            integrationCode: order.integrationCode,
                            externalOrderId: order.externalOrderId,
                            externalLineItemId: item.externalLineItemId,
                            sku: item.sku,
                            barcode: item.barcode,
                        },
                    },
                } as any },
            });
        } catch (error) {
            console.error('[PostOrderOperations] Bildirim gönderilemedi:', error);
        }
    }
}

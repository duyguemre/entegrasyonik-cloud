/**
 * CHARACTERIZATION: PostOrderOperations (backend/src/operations/integration/PostOrderOperations.ts)
 * ADR-0004 Aşama B (Karar 3-4). ÖNCEKİ DAVRANIŞ: bu sınıf BOŞTU (hiçbir metodu yoktu, hiç örneklenmiyordu
 * — bkz. BACKLOG C8/1c bulgusu, `OrderOrchestrator.triggerDownstreamWorkflows`'taki yorum satırı). Bu dosya
 * önce o boş/no-op durumu sabitler, SONRA doldurulmuş sürücünün davranışını test eder.
 *
 * `StockAllocator` gerçek sınıfı KULLANILMAZ — enjekte edilebilir bir sahte (allocator mock) ile kesilir
 * (aşama A'da zaten gerçek-Mongo'da test edildi, burada yalnızca ÇAĞRI ARGÜMANLARI doğrulanır). DB modelleri
 * (`OrderModel`/`VariantModel`) tamamen jest.fn ile mocklanır. DB/Redis/ağ YOK.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const anyFn = (): any => jest.fn();

jest.mock('@services/notification/NotificationService', () => require('../../helpers/notificationServiceMock').notificationServiceModule());

import { PostOrderOperations } from '@operations/integration/PostOrderOperations';
import { NotificationService } from '@services/notification/NotificationService';
import { expectCatalogNotify } from '../../helpers/notificationServiceMock';

function makeOrderModel(): any {
    return {
        find: anyFn(),
        updateOne: anyFn().mockResolvedValue(undefined),
    };
}

function makeVariantModel(): any {
    return { findOne: anyFn() };
}

function leanFind(model: any, docs: any[]) {
    model.find.mockReturnValue({ lean: anyFn().mockResolvedValue(docs) });
}

function selectLeanFindOne(model: any, doc: any) {
    model.findOne.mockReturnValue({ select: anyFn().mockReturnValue({ lean: anyFn().mockResolvedValue(doc) }) });
}

function clientDBWith(orderModel: any, variantModel: any) {
    return { getOrderModel: () => orderModel, getVariantModel: () => variantModel } as any;
}

function makeAllocator(): any {
    return { reserve: anyFn(), commit: anyFn(), release: anyFn() };
}

function baseOrder(overrides: any = {}) {
    return {
        _id: 'order-1',
        integrationCode: 'trendyol',
        externalOrderId: 'ORD-1',
        orderNumber: 'ORD-1',
        externalStatus: 'Created',
        internalStatus: 'UNAPPROVED',
        dates: { externalUpdatedAt: new Date('2026-01-10T10:00:00.000Z') },
        flags: { isAllocated: false },
        items: [
            { externalLineItemId: 'LINE-1', sku: 'SKU-1', barcode: 'BAR-1', quantity: 2, productName: 'Ürün 1' },
        ],
        ...overrides,
    };
}

describe('PostOrderOperations - ÖNCEKİ DAVRANIŞ (boş sınıf sabitlemesi)', () => {
    it('[MEVCUT DAVRANIŞ, aşama A öncesi] sınıf yalnızca sabitler/metotlar taşıyan bir kabuk değildi -- artık processOrder/processOrdersByExternalIds metotlarını taşıyor (dolduruldu)', () => {
        const clientDB = clientDBWith(makeOrderModel(), makeVariantModel());
        const ops = new PostOrderOperations(clientDB, makeAllocator() as any);
        expect(typeof ops.processOrder).toBe('function');
        expect(typeof ops.processOrdersByExternalIds).toBe('function');
    });
});

describe('PostOrderOperations.processOrder - pazaryeri durumundan tahsis türetme', () => {
    let orderModel: ReturnType<typeof makeOrderModel>;
    let variantModel: ReturnType<typeof makeVariantModel>;
    let allocator: ReturnType<typeof makeAllocator>;
    let ops: PostOrderOperations;

    beforeEach(() => {
        orderModel = makeOrderModel();
        variantModel = makeVariantModel();
        allocator = makeAllocator();
        ops = new PostOrderOperations(clientDBWith(orderModel, variantModel), allocator as any);
        selectLeanFindOne(variantModel, { _id: 'variant-1' });
        (NotificationService.sendClientNotification as any).mockClear();
    });

    it('[YENİ DAVRANIŞ] Created (trendyol) -> RESERVED: StockAllocator.reserve doğru key/qty ile çağrılır, ayna + flags yazılır', async () => {
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        const order = baseOrder();

        await ops.processOrder(5, order);

        expect(allocator.reserve).toHaveBeenCalledWith('variant-1', 'trendyol:ORD-1:LINE-1', 2);
        expect(allocator.commit).not.toHaveBeenCalled();
        expect(allocator.release).not.toHaveBeenCalled();
        expect(orderModel.updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', 'items.externalLineItemId': 'LINE-1' },
            { $set: { 'items.$.allocationState': 'RESERVED', 'items.$.lastAllocationAppliedAt': order.dates.externalUpdatedAt } },
        );
        expect(orderModel.updateOne).toHaveBeenCalledWith({ _id: 'order-1' }, { $set: { 'flags.isAllocated': true } });
    });

    it('[YENİ DAVRANIŞ] Shipped (trendyol) -> COMMITTED: StockAllocator.commit çağrılır', async () => {
        allocator.commit.mockResolvedValue({ state: 'COMMITTED', idempotent: false, variant: {} });
        const order = baseOrder({ externalStatus: 'Shipped', internalStatus: 'SHIPPED' });

        await ops.processOrder(5, order);

        expect(allocator.commit).toHaveBeenCalledWith('variant-1', 'trendyol:ORD-1:LINE-1', 2);
    });

    it('[YENİ DAVRANIŞ] Cancelled (trendyol) -> RELEASED: StockAllocator.release çağrılır (qty argümanı YOK)', async () => {
        allocator.release.mockResolvedValue({ state: 'RELEASED', idempotent: false, variant: {} });
        const order = baseOrder({ externalStatus: 'Cancelled', internalStatus: 'CANCELLED' });

        await ops.processOrder(5, order);

        expect(allocator.release).toHaveBeenCalledWith('variant-1', 'trendyol:ORD-1:LINE-1');
    });

    it('[YENİ DAVRANIŞ] hepsiburada ham durumu (küçük/büyük harf duyarsız) -> RESERVED', async () => {
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        const order = baseOrder({ integrationCode: 'hepsiburada', externalStatus: 'AwaitingApproval', internalStatus: 'AWAITING_APPROVAL' });

        await ops.processOrder(5, order);

        expect(allocator.reserve).toHaveBeenCalledWith('variant-1', 'hepsiburada:ORD-1:LINE-1', 2);
    });

    it('[YENİ DAVRANIŞ] pazarama sayısal ham durumu (14 = Cancelled varyantı) -> RELEASED', async () => {
        allocator.release.mockResolvedValue({ state: 'RELEASED', idempotent: false, variant: {} });
        const order = baseOrder({ integrationCode: 'pazarama', externalStatus: '14', internalStatus: 'CANCELLED' });

        await ops.processOrder(5, order);

        expect(allocator.release).toHaveBeenCalledWith('variant-1', 'pazarama:ORD-1:LINE-1');
    });

    it('[YENİ DAVRANIŞ, BULGU] n11 (ham durum tablosu yok) her zaman internalStatus=APPROVED yedeğiyle RESERVED\'e düşer', async () => {
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        const order = baseOrder({ integrationCode: 'n11', externalStatus: 'her-ne-olursa-olsun', internalStatus: 'APPROVED' });

        await ops.processOrder(5, order);

        expect(allocator.reserve).toHaveBeenCalledWith('variant-1', 'n11:ORD-1:LINE-1', 2);
    });

    it('[YENİ DAVRANIŞ] bilinmeyen durum (ne ham tablo ne internalStatus eşleşir) -> StockAllocator HİÇ çağrılmaz, satır atlanır', async () => {
        const order = baseOrder({ integrationCode: 'bilinmeyen', externalStatus: 'X', internalStatus: 'BILINMEYEN' });

        await ops.processOrder(5, order);

        expect(allocator.reserve).not.toHaveBeenCalled();
        expect(allocator.commit).not.toHaveBeenCalled();
        expect(allocator.release).not.toHaveBeenCalled();
        expect(orderModel.updateOne).not.toHaveBeenCalled();
    });
});

describe('PostOrderOperations.processOrder - varyant eşleşmeyen satır (UNMAPPED)', () => {
    let orderModel: ReturnType<typeof makeOrderModel>;
    let variantModel: ReturnType<typeof makeVariantModel>;
    let allocator: ReturnType<typeof makeAllocator>;
    let ops: PostOrderOperations;

    beforeEach(() => {
        orderModel = makeOrderModel();
        variantModel = makeVariantModel();
        allocator = makeAllocator();
        ops = new PostOrderOperations(clientDBWith(orderModel, variantModel), allocator as any);
        (NotificationService.sendClientNotification as any).mockClear();
    });

    it('[YENİ DAVRANIŞ] internalVariantId/barkod/sku hiçbiri eşleşmezse UNMAPPED yazılır, StockAllocator ÇAĞRILMAZ, tenant bildirimi gönderilir', async () => {
        selectLeanFindOne(variantModel, null);
        const order = baseOrder();

        await ops.processOrder(5, order);

        expect(allocator.reserve).not.toHaveBeenCalled();
        expect(orderModel.updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', 'items.externalLineItemId': 'LINE-1' },
            { $set: { 'items.$.allocationState': 'UNMAPPED' } },
        );
        expect(NotificationService.sendClientNotification).toHaveBeenCalledTimes(1);
        const [event] = (NotificationService.sendClientNotification as any).mock.calls[0];
        expect(event.clientId).toBe('5');
        expect(event.notificationData.type).toBe('STOCK_ALERT');
        expect(event.notificationData.severity).toBe('warning');
        // [ADR-0029 NB3] katalog kodu + params (zod) + corrId/module; ham metin yok
        const [, tid, params] = expectCatalogNotify(NotificationService, 'STOCK_UNMAPPED_LINE', 5);
        expect(tid).toBe(5);
        expect(params).toMatchObject({ integ: 'trendyol', lineId: 'LINE-1' });
    });

    it('[YENİ DAVRANIŞ] satır ZATEN UNMAPPED ise (aynı durum tekrar geldi) tekrar YAZILMAZ ve tekrar bildirim GÖNDERİLMEZ', async () => {
        selectLeanFindOne(variantModel, null);
        const order = baseOrder({ items: [{ externalLineItemId: 'LINE-1', sku: 'SKU-1', quantity: 2, allocationState: 'UNMAPPED' }] });

        await ops.processOrder(5, order);

        expect(orderModel.updateOne).not.toHaveBeenCalled();
        expect(NotificationService.sendClientNotification).not.toHaveBeenCalled();
    });

    it('[YENİ DAVRANIŞ] internalVariantId doğrudan varsa VariantModel hiç sorgulanmaz (öncelik sırası)', async () => {
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        const order = baseOrder({ items: [{ externalLineItemId: 'LINE-1', internalVariantId: 'direct-variant', sku: 'SKU-1', barcode: 'BAR-1', quantity: 1 }] });

        await ops.processOrder(5, order);

        expect(variantModel.findOne).not.toHaveBeenCalled();
        expect(allocator.reserve).toHaveBeenCalledWith('direct-variant', 'trendyol:ORD-1:LINE-1', 1);
    });

    it('[YENİ DAVRANIŞ] barkod eşleşmesi sku\'dan ÖNCELİKLİdir', async () => {
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        (variantModel.findOne as any).mockImplementation((filter: any) => ({
            select: () => ({ lean: async () => (filter.barcode ? { _id: 'variant-by-barcode' } : { _id: 'variant-by-sku' }) }),
        }));
        const order = baseOrder();

        await ops.processOrder(5, order);

        expect(allocator.reserve).toHaveBeenCalledWith('variant-by-barcode', 'trendyol:ORD-1:LINE-1', 2);
    });
});

describe('PostOrderOperations.processOrder - bayat veri koruması', () => {
    let orderModel: ReturnType<typeof makeOrderModel>;
    let variantModel: ReturnType<typeof makeVariantModel>;
    let allocator: ReturnType<typeof makeAllocator>;
    let ops: PostOrderOperations;

    beforeEach(() => {
        orderModel = makeOrderModel();
        variantModel = makeVariantModel();
        allocator = makeAllocator();
        ops = new PostOrderOperations(clientDBWith(orderModel, variantModel), allocator as any);
        selectLeanFindOne(variantModel, { _id: 'variant-1' });
    });

    it('[YENİ DAVRANIŞ] externalUpdatedAt, satırda son uygulanandan ESKİ/EŞİTse geçiş ATLANIR (StockAllocator çağrılmaz, ayna yazılmaz)', async () => {
        const order = baseOrder({
            dates: { externalUpdatedAt: new Date('2026-01-10T09:00:00.000Z') }, // eski geldi
            items: [{
                externalLineItemId: 'LINE-1', sku: 'SKU-1', quantity: 2,
                allocationState: 'RESERVED',
                lastAllocationAppliedAt: new Date('2026-01-10T10:00:00.000Z'), // daha önce DAHA YENİ bir tarihle uygulanmış
            }],
        });

        await ops.processOrder(5, order);

        expect(allocator.reserve).not.toHaveBeenCalled();
        expect(allocator.commit).not.toHaveBeenCalled();
        expect(allocator.release).not.toHaveBeenCalled();
        expect(orderModel.updateOne).not.toHaveBeenCalledWith(
            expect.objectContaining({ 'items.externalLineItemId': 'LINE-1' }),
            expect.anything(),
        );
    });

    it('[YENİ DAVRANIŞ] externalUpdatedAt, son uygulanandan YENİyse geçiş UYGULANIR', async () => {
        allocator.commit.mockResolvedValue({ state: 'COMMITTED', idempotent: false, variant: {} });
        const order = baseOrder({
            externalStatus: 'Shipped', internalStatus: 'SHIPPED',
            dates: { externalUpdatedAt: new Date('2026-01-10T12:00:00.000Z') }, // yeni
            items: [{
                externalLineItemId: 'LINE-1', sku: 'SKU-1', quantity: 2,
                allocationState: 'RESERVED',
                lastAllocationAppliedAt: new Date('2026-01-10T10:00:00.000Z'),
            }],
        });

        await ops.processOrder(5, order);

        expect(allocator.commit).toHaveBeenCalledWith('variant-1', 'trendyol:ORD-1:LINE-1', 2);
    });

    it('[YENİ DAVRANIŞ] satırda lastAllocationAppliedAt hiç YOKSA (ilk kez işleniyor) her zaman uygulanır', async () => {
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        const order = baseOrder();

        await ops.processOrder(5, order);

        expect(allocator.reserve).toHaveBeenCalledTimes(1);
    });
});

describe('PostOrderOperations.processOrder - çok satırlı sipariş (ADR Karar 4: her satır bağımsız)', () => {
    let orderModel: ReturnType<typeof makeOrderModel>;
    let variantModel: ReturnType<typeof makeVariantModel>;
    let allocator: ReturnType<typeof makeAllocator>;
    let ops: PostOrderOperations;

    beforeEach(() => {
        orderModel = makeOrderModel();
        variantModel = makeVariantModel();
        allocator = makeAllocator();
        ops = new PostOrderOperations(clientDBWith(orderModel, variantModel), allocator as any);
        selectLeanFindOne(variantModel, { _id: 'variant-1' });
    });

    it('[YENİ DAVRANIŞ] bir satırın StockAllocator çağrısı hata verirse diğer satır YİNE DE işlenir (transaction YOK)', async () => {
        allocator.reserve
            .mockRejectedValueOnce(new Error('DB hatası'))
            .mockResolvedValueOnce({ state: 'RESERVED', idempotent: false, variant: {} });
        const order = baseOrder({
            items: [
                { externalLineItemId: 'LINE-1', sku: 'SKU-1', quantity: 1 },
                { externalLineItemId: 'LINE-2', sku: 'SKU-2', quantity: 1 },
            ],
        });

        await expect(ops.processOrder(5, order)).resolves.toBeUndefined();

        expect(allocator.reserve).toHaveBeenCalledTimes(2);
        // Hatalı satır (LINE-1) için ayna YAZILMADI; sağlıklı satır (LINE-2) için yazıldı.
        expect(orderModel.updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', 'items.externalLineItemId': 'LINE-2' },
            expect.objectContaining({ $set: expect.objectContaining({ 'items.$.allocationState': 'RESERVED' }) }),
        );
        expect(orderModel.updateOne).not.toHaveBeenCalledWith(
            expect.objectContaining({ 'items.externalLineItemId': 'LINE-1' }),
            expect.anything(),
        );
    });

    it('[YENİ DAVRANIŞ] flags.isAllocated: TÜM satırlar RESERVED/COMMITTED/OVERSOLD ise true, en az biri değilse false', async () => {
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        allocator.release.mockResolvedValue({ state: 'RELEASED', idempotent: false, variant: {} });
        const order = baseOrder({
            externalStatus: 'Created',
            items: [
                { externalLineItemId: 'LINE-1', sku: 'SKU-1', quantity: 1 },
            ],
        });

        await ops.processOrder(5, order);
        expect(orderModel.updateOne).toHaveBeenCalledWith({ _id: 'order-1' }, { $set: { 'flags.isAllocated': true } });
    });

    it('[YENİ DAVRANIŞ] flags.isAllocated zaten doğru değerdeyse GEREKSİZ YAZMA yapılmaz', async () => {
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        const order = baseOrder({ flags: { isAllocated: true } });

        await ops.processOrder(5, order);

        expect(orderModel.updateOne).not.toHaveBeenCalledWith({ _id: 'order-1' }, expect.anything());
    });
});

describe('PostOrderOperations.processOrder - idempotent tekrar çağrı ve OVERSOLD bildirimi', () => {
    let orderModel: ReturnType<typeof makeOrderModel>;
    let variantModel: ReturnType<typeof makeVariantModel>;
    let allocator: ReturnType<typeof makeAllocator>;
    let ops: PostOrderOperations;

    beforeEach(() => {
        orderModel = makeOrderModel();
        variantModel = makeVariantModel();
        allocator = makeAllocator();
        ops = new PostOrderOperations(clientDBWith(orderModel, variantModel), allocator as any);
        selectLeanFindOne(variantModel, { _id: 'variant-1' });
        (NotificationService.sendClientNotification as any).mockClear();
    });

    it('[YENİ DAVRANIŞ] aynı sipariş/satır tekrar sürülürse (idempotent StockAllocator sonucu) ayna YİNE DE aynı değere set edilir (zararsız), tekrar OVERSOLD bildirimi GÖNDERİLMEZ', async () => {
        allocator.reserve.mockResolvedValueOnce({ state: 'OVERSOLD', idempotent: false, variant: {} });
        const order1 = baseOrder();
        await ops.processOrder(5, order1);
        expect(NotificationService.sendClientNotification).toHaveBeenCalledTimes(1);

        (NotificationService.sendClientNotification as any).mockClear();
        allocator.reserve.mockResolvedValueOnce({ state: 'OVERSOLD', idempotent: true, variant: {} });
        const order2 = baseOrder({ items: [{ ...order1.items[0], allocationState: 'OVERSOLD' }] });
        await ops.processOrder(5, order2);

        expect(NotificationService.sendClientNotification).not.toHaveBeenCalled();
    });

    it('[YENİ DAVRANIŞ] YENİ (idempotent:false) OVERSOLD tespitinde tenant bildirimi gönderilir (severity=error)', async () => {
        allocator.reserve.mockResolvedValue({ state: 'OVERSOLD', idempotent: false, variant: {} });
        const order = baseOrder();

        await ops.processOrder(5, order);

        expect(NotificationService.sendClientNotification).toHaveBeenCalledTimes(1);
        const [event] = (NotificationService.sendClientNotification as any).mock.calls[0];
        expect(event.notificationData.severity).toBe('error');
        expect(event.notificationData.type).toBe('STOCK_ALERT');
        expect(expectCatalogNotify(NotificationService, 'STOCK_OVERSOLD', 5)[2]).toMatchObject({ integ: 'trendyol', lineId: 'LINE-1' });
    });
});

describe('PostOrderOperations.processOrdersByExternalIds - OrderWorker giriş noktası', () => {
    it('[YENİ DAVRANIŞ] externalOrderIds boşsa DB HİÇ sorgulanmaz', async () => {
        const orderModel = makeOrderModel();
        const ops = new PostOrderOperations(clientDBWith(orderModel, makeVariantModel()), makeAllocator() as any);

        await ops.processOrdersByExternalIds(5, 'trendyol', []);

        expect(orderModel.find).not.toHaveBeenCalled();
    });

    it('[YENİ DAVRANIŞ] verilen integrationCode + externalOrderId listesiyle Order koleksiyonu taze OKUNUR (pre-save nesneler DEĞİL)', async () => {
        const orderModel = makeOrderModel();
        const variantModel = makeVariantModel();
        selectLeanFindOne(variantModel, { _id: 'variant-1' });
        const allocator = makeAllocator();
        allocator.reserve.mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });
        leanFind(orderModel, [baseOrder()]);
        const ops = new PostOrderOperations(clientDBWith(orderModel, variantModel), allocator as any);

        await ops.processOrdersByExternalIds(5, 'trendyol', ['ORD-1', 'ORD-2']);

        expect(orderModel.find).toHaveBeenCalledWith({ integrationCode: 'trendyol', externalOrderId: { $in: ['ORD-1', 'ORD-2'] } });
        expect(allocator.reserve).toHaveBeenCalledTimes(1);
    });

    it('[YENİ DAVRANIŞ] bir siparişin işlenmesi hata verirse diğer sipariş YİNE DE işlenir', async () => {
        const orderModel = makeOrderModel();
        const variantModel = makeVariantModel();
        selectLeanFindOne(variantModel, { _id: 'variant-1' });
        const allocator = makeAllocator();
        allocator.reserve
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce({ state: 'RESERVED', idempotent: false, variant: {} });
        leanFind(orderModel, [baseOrder({ _id: 'order-1', externalOrderId: 'ORD-1' }), baseOrder({ _id: 'order-2', externalOrderId: 'ORD-2' })]);
        const ops = new PostOrderOperations(clientDBWith(orderModel, variantModel), allocator as any);

        await expect(ops.processOrdersByExternalIds(5, 'trendyol', ['ORD-1', 'ORD-2'])).resolves.toBeUndefined();

        expect(allocator.reserve).toHaveBeenCalledTimes(2);
    });
});

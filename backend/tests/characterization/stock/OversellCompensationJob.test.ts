/**
 * BİRİM/CHARACTERIZATION: OversellCompensationJob (backend/src/operations/stock/OversellCompensationJob.ts)
 * ADR-0004 Karar 7 (Aşama C) — OVERSOLD telafi: grace içinde yeniden dene, grace sonrası otomatik iptal/
 * bildirim. `DatabaseManagerInstance`/`RedisService`/`IntegrationFactory`/`NotificationService` tamamen
 * jest.mock. DB/Redis/ağ/pazaryeri YOK.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
    DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { isReady: jest.fn() } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@services/notification/NotificationService', () => require('../../helpers/notificationServiceMock').notificationServiceModule());

import { OversellCompensationJob } from '@operations/stock/OversellCompensationJob';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { RedisService } from '@services/redis/RedisService';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { NotificationService } from '@services/notification/NotificationService';
import { expectCatalogNotify } from '../../helpers/notificationServiceMock';

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;
const NOW = Date.now();

function leanArr(result: any[]) {
    return { lean: jest.fn(async () => result) };
}

function makeOrder(over: any = {}) {
    return {
        _id: 'order-1', integrationCode: 'trendyol', externalOrderId: 'EXT-1', orderNumber: 'ON-1',
        dates: { orderDate: new Date(NOW - 60 * 60 * 1000) },
        items: [{ externalLineItemId: 'L1', externalItemId: 'L1', barcode: 'B1', sku: 'B1', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: new Date(NOW - 5 * 60 * 1000) }],
        ...over,
    };
}

describe('OversellCompensationJob.run - Redis dayanıklılığı (ADR-0005 Karar 2 ile AYNI kapı)', () => {
    it('Redis hazır değilse tur TAMAMEN ATLANIR', async () => {
        (RedisService.isReady as any).mockReturnValue(false);
        const job = new OversellCompensationJob();

        const result = await job.run();

        expect(result).toEqual({ skipped: true, scannedClients: 0, retried: 0, cancelled: 0, escalated: 0 });
        expect(DatabaseManagerInstance.getApplicationDB).not.toHaveBeenCalled();
    });
});

describe('OversellCompensationJob.run - grace penceresi içinde yeniden deneme (ADR Karar 7b)', () => {
    let clientModel: any, appDb: any, clientDb: any, orderModel: any, variantModel: any, integrationModel: any;
    let retryOversoldMock: jest.Mock<any>;
    let instance: any;

    beforeEach(() => {
        (RedisService.isReady as any).mockReturnValue(true);
        (NotificationService.sendClientNotification as any).mockClear();

        clientModel = { find: jest.fn(() => leanArr([{ order: 1, status: 'ACTIVE' }])) };
        appDb = { getClientModel: () => clientModel };
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(appDb);

        orderModel = {
            find: jest.fn(() => leanArr([makeOrder()])),
            updateOne: jest.fn(async () => ({})),
        };
        variantModel = { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: 'v1' }) }) })) };
        integrationModel = { findOne: jest.fn(() => ({ lean: async () => ({ marketplace: [{ code: 'trendyol', settings: { stockPolicy: { graceMinutes: 30 } } }] }) })) };
        clientDb = {
            getOrderModel: () => orderModel,
            getVariantModel: () => variantModel,
            getClientIntegrationModel: () => integrationModel,
        };
        (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(clientDb);

        instance = { rejectOrder: jest.fn(async () => true) };
        factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));

        retryOversoldMock = jest.fn();
        jest.spyOn(require('@operations/stock/StockAllocator').StockAllocator.prototype, 'retryOversold').mockImplementation(retryOversoldMock as any);
        jest.spyOn(require('@operations/stock/StockAllocator').StockAllocator.prototype, 'release').mockImplementation(jest.fn(async () => ({ state: 'RELEASED', idempotent: false, variant: {} })) as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('OVERSOLD tespitinden 5 dk sonra (grace=30dk içinde): retryOversold çağrılır, RESERVED olursa aynası güncellenir + bildirim gider', async () => {
        (retryOversoldMock as any).mockResolvedValue({ state: 'RESERVED', idempotent: false, variant: {} });

        const job = new OversellCompensationJob();
        const result = await job.run();

        expect(result).toEqual({ skipped: false, scannedClients: 1, retried: 1, cancelled: 0, escalated: 0 });
        expect(retryOversoldMock).toHaveBeenCalledWith('v1', 'trendyol:EXT-1:L1', 2);
        expect(orderModel.updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', 'items.externalLineItemId': 'L1' },
            { $set: { 'items.$.allocationState': 'RESERVED', 'items.$.lastAllocationAppliedAt': expect.any(Date) } },
        );
        expect(NotificationService.sendClientNotification).toHaveBeenCalledTimes(1);
        const [event] = (NotificationService.sendClientNotification as any).mock.calls[0];
        expect(event.notificationData.severity).toBe('success');
    });

    it('retryOversold hâlâ OVERSOLD döndürürse (stok yeterli değil): aynaya DOKUNULMAZ, bildirim gitmez', async () => {
        (retryOversoldMock as any).mockResolvedValue({ state: 'OVERSOLD', idempotent: true, variant: {} });

        const job = new OversellCompensationJob();
        const result = await job.run();

        expect(result.retried).toBe(0);
        expect(orderModel.updateOne).not.toHaveBeenCalled();
        expect(NotificationService.sendClientNotification).not.toHaveBeenCalled();
    });
});

describe('OversellCompensationJob.run - grace süresi dolunca telafi (ADR Karar 7c)', () => {
    let clientModel: any, appDb: any, clientDb: any, orderModel: any, variantModel: any, integrationModel: any;
    let instance: any;

    function setupCommon(order: any, stockPolicy: any = {}) {
        (RedisService.isReady as any).mockReturnValue(true);
        (NotificationService.sendClientNotification as any).mockClear();

        clientModel = { find: jest.fn(() => leanArr([{ order: 1, status: 'ACTIVE' }])) };
        appDb = { getClientModel: () => clientModel };
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(appDb);

        // [DÜZELTME 2026-09-28, GV-08] grace sonrası iptal artık ÖNCE atomik satır talebi (findOneAndUpdate) alır; talep kazanılmış varsayılır.
        orderModel = { find: jest.fn(() => leanArr([order])), updateOne: jest.fn(async () => ({})), findOneAndUpdate: jest.fn(async () => ({ _id: 'order-1' })) };
        variantModel = { findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: 'v1' }) }) })) };
        integrationModel = { findOne: jest.fn(() => ({ lean: async () => ({ marketplace: [{ code: order.integrationCode, settings: { stockPolicy } }] }) })) };
        clientDb = { getOrderModel: () => orderModel, getVariantModel: () => variantModel, getClientIntegrationModel: () => integrationModel };
        (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(clientDb);

        jest.spyOn(require('@operations/stock/StockAllocator').StockAllocator.prototype, 'release').mockImplementation(jest.fn(async () => ({ state: 'RELEASED', idempotent: false, variant: {} })) as any);
    }

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('[DÜZELTME 2026-09-29, C22] Hepsiburada + autoCancelOversold varsayılan açık: grace dolunca rejectOrder çağrılır, başarılıysa RELEASED\'e geçer + iptal bildirimi gider (kanal DOĞRULANMIŞ reasonId eşlemesine sahip -- eskiden bu test Trendyol kullanıyordu; Trendyol artık ayrı bir testte reasonId eşlemesi yok diye rejectOrder\'ı hiç çağırmıyor, bkz. aşağıdaki test)', async () => {
        const order = makeOrder({ integrationCode: 'hepsiburada', items: [{ externalLineItemId: 'L1', externalItemId: 'L1', barcode: 'B1', sku: 'B1', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: new Date(NOW - 40 * 60 * 1000) }] });
        setupCommon(order, { graceMinutes: 30 });
        instance = { rejectOrder: jest.fn(async () => true) };
        factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));

        const job = new OversellCompensationJob();
        const result = await job.run();

        expect(result.cancelled).toBe(1);
        expect(instance.rejectOrder).toHaveBeenCalledWith('EXT-1', expect.objectContaining({
            reasonId: 'OUT_OF_STOCK',
            lineItems: [{ externalLineId: 'L1', quantity: 2 }],
        }));
        expect(orderModel.updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', 'items.externalLineItemId': 'L1' },
            { $set: { 'items.$.allocationState': 'RELEASED', 'items.$.itemStatus': 'CANCELLED', 'items.$.lastAllocationAppliedAt': expect.any(Date) } },
        );
        expect(NotificationService.sendClientNotification).toHaveBeenCalledTimes(1);
        expect((NotificationService.sendClientNotification as any).mock.calls[0][0].notificationData.severity).toBe('warning');
        expect(expectCatalogNotify(NotificationService, 'STOCK_LINE_AUTO_CANCELLED')[2]).toMatchObject({ lineId: 'L1' });
    });

    it('[DÜZELTME 2026-09-29, BACKLOG C22] Trendyol: doğrulanmış reasonId eşlemesi YOK -> rejectOrder HİÇ ÇAĞRILMAZ (eskiden reasonId:\'OUT_OF_STOCK\' gönderilir, Trendyol connector\'ı Number() ile NaN üretirdi); satır kalıcı cancelUnknownAt ile işaretlenir, talep bırakılır, manuel doğrulama bildirimi gider; sonraki tur BİR DAHA DENEMEZ', async () => {
        const order = makeOrder({ integrationCode: 'trendyol', items: [{ externalLineItemId: 'L1', externalItemId: 'L1', barcode: 'B1', sku: 'B1', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: new Date(NOW - 40 * 60 * 1000) }] });
        setupCommon(order, { graceMinutes: 30 });
        instance = { rejectOrder: jest.fn(async () => true) };
        factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));

        const job = new OversellCompensationJob();
        const result = await job.run();

        expect(instance.rejectOrder).not.toHaveBeenCalled();
        expect(result.cancelled).toBe(0);
        expect(result.escalated).toBe(1);
        expect(orderModel.updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', 'items.externalLineItemId': 'L1' },
            {
                $set: { 'items.$.cancelUnknownAt': expect.any(Date), 'items.$.oversoldEscalatedAt': expect.any(Date) },
                $unset: { 'items.$.cancelClaimedBy': '', 'items.$.cancelClaimedAt': '', 'items.$.cancelClaimUntil': '' },
            },
        );
        expect((NotificationService.sendClientNotification as any).mock.calls[0][0].notificationData.severity).toBe('error');

        expect(expectCatalogNotify(NotificationService, 'STOCK_COMPENSATION_MANUAL')[2]).toMatchObject({ reason: 'cancel_uncertain' });

        // sonraki tur: kalıcı işaret nedeniyle rejectOrder ASLA çağrılmaz (GV-08 retry-yok davranışı korunur)
        (instance.rejectOrder as any).mockClear();
        const item2 = { ...order.items[0], allocationState: 'OVERSOLD', cancelUnknownAt: new Date() };
        orderModel.find = jest.fn(() => leanArr([{ ...order, items: [item2] }]));
        const result2 = await job.run();
        expect(instance.rejectOrder).not.toHaveBeenCalled();
        expect(result2.cancelled).toBe(0);
        expect(result2.escalated).toBe(0);
    });

    it('N11: kanal desteklenmediği için rejectOrder HİÇ ÇAĞRILMAZ, doğrudan manuel görev bildirimi gider (C9 bulgusuyla tutarlı)', async () => {
        const order = makeOrder({
            integrationCode: 'n11',
            items: [{ externalLineItemId: 'L1', externalItemId: 'L1', barcode: 'B1', sku: 'B1', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: new Date(NOW - 40 * 60 * 1000) }],
        });
        setupCommon(order, { graceMinutes: 30 });
        instance = { rejectOrder: jest.fn(async () => true) };
        factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));

        const job = new OversellCompensationJob();
        const result = await job.run();

        expect(instance.rejectOrder).not.toHaveBeenCalled();
        expect(result.cancelled).toBe(0);
        expect(result.escalated).toBe(1);
        expect(orderModel.updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', 'items.externalLineItemId': 'L1' },
            { $set: { 'items.$.oversoldEscalatedAt': expect.any(Date) } },
        );
        expect((NotificationService.sendClientNotification as any).mock.calls[0][0].notificationData.severity).toBe('error');
    });

    it('autoCancelOversold=false: otomatik iptal ÇAĞRILMAZ, manuel görev bildirimi gider', async () => {
        const order = makeOrder({ items: [{ externalLineItemId: 'L1', externalItemId: 'L1', barcode: 'B1', sku: 'B1', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: new Date(NOW - 40 * 60 * 1000) }] });
        setupCommon(order, { graceMinutes: 30, autoCancelOversold: false });
        instance = { rejectOrder: jest.fn(async () => true) };
        factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));

        const job = new OversellCompensationJob();
        const result = await job.run();

        expect(instance.rejectOrder).not.toHaveBeenCalled();
        expect(result.escalated).toBe(1);
    });

    it('rejectOrder BAŞARISIZ (false döner): manuel göreve düşer, allocationState DEĞİŞMEZ', async () => {
        // [NOT 2026-09-29, C22] kanal DOĞRULANMIŞ reasonId eşlemesine (hepsiburada) sahip olmalı; aksi halde
        // reasonId eksikliği nedeniyle erken UNKNOWN_OUTCOME'a düşer ve bu test farklı bir dalı sınamış olurdu.
        const order = makeOrder({ integrationCode: 'hepsiburada', items: [{ externalLineItemId: 'L1', externalItemId: 'L1', barcode: 'B1', sku: 'B1', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: new Date(NOW - 40 * 60 * 1000) }] });
        setupCommon(order, { graceMinutes: 30 });
        instance = { rejectOrder: jest.fn(async () => false) };
        factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));

        const job = new OversellCompensationJob();
        const result = await job.run();

        expect(result.cancelled).toBe(0);
        expect(result.escalated).toBe(1);
        expect(orderModel.updateOne).toHaveBeenCalledWith(
            { _id: 'order-1', 'items.externalLineItemId': 'L1' },
            { $set: { 'items.$.oversoldEscalatedAt': expect.any(Date) } },
        );
    });

    it('daha önce escalate edilmiş satır (oversoldEscalatedAt dolu) tekrar bildirim SPAM YAPMAZ', async () => {
        const order = makeOrder({
            items: [{ externalLineItemId: 'L1', externalItemId: 'L1', barcode: 'B1', sku: 'B1', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: new Date(NOW - 40 * 60 * 1000), oversoldEscalatedAt: new Date(NOW - 10 * 60 * 1000) }],
        });
        setupCommon(order, { graceMinutes: 30, autoCancelOversold: false });

        const job = new OversellCompensationJob();
        const result = await job.run();

        expect(result.escalated).toBe(0);
        expect(NotificationService.sendClientNotification).not.toHaveBeenCalled();
    });
});

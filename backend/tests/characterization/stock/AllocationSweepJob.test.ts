/**
 * BİRİM/CHARACTERIZATION: AllocationSweepJob (backend/src/operations/stock/AllocationSweepJob.ts)
 * ADR-0004 Karar 3 — 15 dk'lık çökme/kaçak telafi süpürmesi. `DatabaseManagerInstance`/`RedisService`/
 * `PostOrderOperations` tamamen jest.mock ile kesilir. DB/Redis/ağ YOK.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { isReady: jest.fn() } }));
jest.mock('@operations/orders/postOrder', () => ({
    // `AllocationSweepJob` kaynağı `PostOrderOperations.SETTLED_MIRROR_STATES` static alanını okuyor;
    // mock factory'de de taşınması GEREKİR (aksi halde $nin filtresi undefined olur).
    PostOrderOperations: Object.assign(
        jest.fn().mockImplementation(() => ({ processOrder: jest.fn(async () => undefined) })),
        { SETTLED_MIRROR_STATES: ['COMMITTED', 'RELEASED', 'RESTOCKED'] },
    ),
}));

import { AllocationSweepJob } from '@operations/stock/AllocationSweepJob';
import { DatabaseManagerInstance } from '@database/index';
import { RedisService } from '@services/redis/RedisService';
import { PostOrderOperations } from '@operations/orders/postOrder';

function leanFind(mockFn: any, result: any[]) {
    mockFn.mockReturnValue({ lean: jest.fn(async () => result) });
}

describe('AllocationSweepJob.run - Redis dayanıklılığı (ADR-0005 Karar 2 ile AYNI kapı)', () => {
    it('[YENİ DAVRANIŞ] Redis hazır değilse tur TAMAMEN ATLANIR: ApplicationDB\'ye bile sorulmaz, hata FIRLATILMAZ', async () => {
        (RedisService.isReady as any).mockReturnValue(false);
        const applicationDB = { getClientModel: jest.fn() };
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(applicationDB);

        const result = await new AllocationSweepJob().run();

        expect(result).toEqual({ skipped: true, scannedClients: 0, scannedOrders: 0 });
        expect(DatabaseManagerInstance.getApplicationDB).not.toHaveBeenCalled();
    });
});

describe('AllocationSweepJob.run - normal akış (Redis hazır)', () => {
    beforeEach(() => {
        (RedisService.isReady as any).mockReturnValue(true);
        (PostOrderOperations as any).mockClear();
    });

    it('[YENİ DAVRANIŞ] aktif client\'lar taranır, her biri için ClientDB alınır ve allocationState TERMİNAL OLMAYAN satırı olan siparişler PostOrderOperations.processOrder ile sürülür', async () => {
        const clientModel = { find: jest.fn() };
        leanFind(clientModel.find, [{ clientId: 7, status: 'ACTIVE' }]);
        const applicationDB = { getClientModel: () => clientModel };
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(applicationDB);

        const orderModel = { find: jest.fn() };
        const staleOrder = { _id: 'o1', externalOrderId: 'ORD-1', items: [{ allocationState: 'RESERVED' }] };
        leanFind(orderModel.find, [staleOrder]);
        const clientDb = { getOrderModel: () => orderModel };
        (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(clientDb);

        const result = await new AllocationSweepJob().run();

        expect(DatabaseManagerInstance.getClientDB).toHaveBeenCalledWith(7);
        // Terminal ayna durumları ('COMMITTED'/'RELEASED'/'RESTOCKED') dışındaki her şey aday: bkz.
        // `PostOrderOperations.SETTLED_MIRROR_STATES` (gerçek sınıf mock'landığı için burada LİTERAL doğrulanır).
        expect(orderModel.find).toHaveBeenCalledWith(expect.objectContaining({
            items: { $elemMatch: { allocationState: { $nin: ['COMMITTED', 'RELEASED', 'RESTOCKED'] } } },
        }));
        expect(PostOrderOperations).toHaveBeenCalledWith(clientDb);
        expect(result).toEqual({ skipped: false, scannedClients: 1, scannedOrders: 1 });
    });

    it('[YENİ DAVRANIŞ] hiç aday sipariş yoksa PostOrderOperations HİÇ örneklenmez', async () => {
        const clientModel = { find: jest.fn() };
        leanFind(clientModel.find, [{ clientId: 7, status: 'ACTIVE' }]);
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({ getClientModel: () => clientModel });

        const orderModel = { find: jest.fn() };
        leanFind(orderModel.find, []);
        (DatabaseManagerInstance.getClientDB as any).mockResolvedValue({ getOrderModel: () => orderModel });

        const result = await new AllocationSweepJob().run();

        expect(PostOrderOperations).not.toHaveBeenCalled();
        expect(result.scannedOrders).toBe(0);
    });

    it('[YENİ DAVRANIŞ] bir client\'ın süpürmesi hata verirse diğer client YİNE DE taranır', async () => {
        const clientModel = { find: jest.fn() };
        leanFind(clientModel.find, [{ clientId: 1, status: 'ACTIVE' }, { clientId: 2, status: 'ACTIVE' }]);
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({ getClientModel: () => clientModel });

        (DatabaseManagerInstance.getClientDB as any)
            .mockRejectedValueOnce(new Error('client 1 patladı'))
            .mockResolvedValueOnce({ getOrderModel: () => { const m = { find: jest.fn() }; leanFind(m.find, []); return m; } });

        const result = await expect(new AllocationSweepJob().run()).resolves.toEqual(
            expect.objectContaining({ skipped: false, scannedClients: 2 }),
        );
        result;
    });

    it('[YENİ DAVRANIŞ] client listesi boşsa hiçbir şey taranmaz, hata FIRLATILMAZ', async () => {
        const clientModel = { find: jest.fn() };
        leanFind(clientModel.find, []);
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({ getClientModel: () => clientModel });

        const result = await new AllocationSweepJob().run();
        expect(result).toEqual({ skipped: false, scannedClients: 0, scannedOrders: 0 });
    });
});

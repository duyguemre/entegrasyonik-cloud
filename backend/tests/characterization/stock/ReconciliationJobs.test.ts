/**
 * BİRİM/CHARACTERIZATION: InternalReconciliationJob + ExternalReconciliationJob
 * ADR-0004 Karar 8 (Aşama C) — iç (saatlik) ve dış (günlük) mutabakat. `DatabaseManagerInstance`/
 * `RedisService`/`IntegrationFactory` tamamen jest.mock. DB/Redis/ağ/pazaryeri YOK.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
    DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { isReady: jest.fn() } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import { InternalReconciliationJob } from '@operations/stock/InternalReconciliationJob';
import { ExternalReconciliationJob } from '@operations/stock/ExternalReconciliationJob';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { RedisService } from '@services/redis/RedisService';
import IntegrationFactory from '@integration/modules/IntegrationFactory';

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;

function leanArr(result: any[]) {
    return { lean: jest.fn(async () => result) };
}

beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('InternalReconciliationJob.run - Redis dayanıklılığı', () => {
    it('Redis hazır değilse tur TAMAMEN ATLANIR', async () => {
        (RedisService.isReady as any).mockReturnValue(false);
        const job = new InternalReconciliationJob();

        const result = await job.run();

        expect(result).toEqual({ skipped: true, scannedClients: 0, scanned: 0, corrected: 0, skippedFresh: 0, conflicted: 0 });
        expect(DatabaseManagerInstance.getApplicationDB).not.toHaveBeenCalled();
    });
});

describe('InternalReconciliationJob.run - reserved/allocations tutarlılığı (ADR Karar 8a)', () => {
    let clientModel: any, appDb: any, clientDb: any, variantModel: any;

    beforeEach(() => {
        (RedisService.isReady as any).mockReturnValue(true);
        clientModel = { find: jest.fn(() => leanArr([{ order: 1, status: 'ACTIVE' }])) };
        appDb = { getClientModel: () => clientModel };
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(appDb);
    });

    function setupVariants(variants: any[]) {
        variantModel = {
            find: jest.fn(() => ({ select: () => ({ limit: () => ({ lean: async () => variants }) }) })),
            findOneAndUpdate: jest.fn(async () => ({ _id: variants[0]?._id, reserved: 999 })),
        };
        clientDb = { getVariantModel: () => variantModel };
        (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(clientDb);
    }

    it('reserved zaten allocations RESERVED toplamıyla eşleşiyorsa hiçbir şey yapılmaz', async () => {
        setupVariants([{ _id: 'v1', reserved: 3, stockVersion: 1, allocations: [{ qty: 3, state: 'RESERVED', at: new Date(Date.now() - 10 * 60 * 1000) }] }]);
        const job = new InternalReconciliationJob();

        const result = await job.run();

        expect(result.corrected).toBe(0);
        expect(variantModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('fark var ama TAZE (<2dk) işlem varsa DÜZELTME YAPILMAZ (race koruması)', async () => {
        setupVariants([{ _id: 'v1', reserved: 5, stockVersion: 1, allocations: [{ qty: 3, state: 'RESERVED', at: new Date(Date.now() - 30 * 1000) }] }]);
        const job = new InternalReconciliationJob();

        const result = await job.run();

        expect(result.skippedFresh).toBe(1);
        expect(result.corrected).toBe(0);
        expect(variantModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('fark var ve BAYAT (>=2dk) ise stockVersion guard\'lı optimistic $set ile onarılır', async () => {
        setupVariants([{ _id: 'v1', reserved: 5, stockVersion: 1, allocations: [{ qty: 3, state: 'RESERVED', at: new Date(Date.now() - 10 * 60 * 1000) }] }]);
        const job = new InternalReconciliationJob();

        const result = await job.run();

        expect(result.corrected).toBe(1);
        const [filter, update] = variantModel.findOneAndUpdate.mock.calls[0];
        expect(filter).toEqual({ _id: 'v1', stockVersion: 1 });
        expect(update.$set).toEqual({ reserved: 3 });
        expect(update.$inc).toEqual({ stockVersion: 1 });
    });

    it('stockVersion guard eşleşmezse (eşzamanlı başka geçiş) bu tur ATLANIR, hata FIRLATILMAZ', async () => {
        setupVariants([{ _id: 'v1', reserved: 5, stockVersion: 1, allocations: [{ qty: 3, state: 'RESERVED', at: new Date(Date.now() - 10 * 60 * 1000) }] }]);
        variantModel.findOneAndUpdate = jest.fn(async () => null);
        const job = new InternalReconciliationJob();

        const result = await job.run();

        expect(result.conflicted).toBe(1);
        expect(result.corrected).toBe(0);
    });

    it('RESERVED olmayan (COMMITTED/RELEASED) girdiler toplama dahil EDİLMEZ', async () => {
        setupVariants([{
            _id: 'v1', reserved: 2, stockVersion: 1,
            allocations: [
                { qty: 2, state: 'RESERVED', at: new Date(Date.now() - 10 * 60 * 1000) },
                { qty: 5, state: 'COMMITTED', at: new Date(Date.now() - 10 * 60 * 1000) },
            ],
        }]);
        const job = new InternalReconciliationJob();

        const result = await job.run();

        expect(result.corrected).toBe(0); // 2 (RESERVED toplamı) === reserved(2) -> fark yok
    });
});

describe('ExternalReconciliationJob.run - Redis dayanıklılığı', () => {
    it('Redis hazır değilse tur TAMAMEN ATLANIR', async () => {
        (RedisService.isReady as any).mockReturnValue(false);
        const job = new ExternalReconciliationJob();

        const result = await job.run();

        expect(result).toEqual({ skipped: true, scannedClients: 0, scannedChannels: 0, markedDirty: 0 });
    });
});

describe('ExternalReconciliationJob.run - kanal raporu vs lastPublishedQty (ADR Karar 8b)', () => {
    let clientModel: any, appDb: any, clientDb: any, variantModel: any, integrationModel: any, instance: any;

    beforeEach(() => {
        (RedisService.isReady as any).mockReturnValue(true);
        clientModel = { find: jest.fn(() => leanArr([{ order: 1, status: 'ACTIVE' }])) };
        appDb = { getClientModel: () => clientModel };
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(appDb);

        integrationModel = { findOne: jest.fn(() => ({ lean: async () => ({ marketplace: [{ code: 'trendyol', status: true }] }) })) };
    });

    function setup(rawChunk: any[], summaryFn: (raw: any) => any, variantLookup: any) {
        instance = {
            getMatchKey: () => 'barcode',
            streamProducts: jest.fn(async (cb: (chunk: any[]) => Promise<void>) => { await cb(rawChunk); }),
            getSummaryFromRaw: jest.fn(async (raw: any) => summaryFn(raw)),
        };
        factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => instance) }));

        variantModel = {
            findOne: jest.fn(() => ({ select: () => ({ lean: async () => variantLookup }) })),
            updateOne: jest.fn(async () => ({})),
        };
        clientDb = { getClientIntegrationModel: () => integrationModel, getVariantModel: () => variantModel };
        (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(clientDb);
    }

    it('kanalın raporladığı adet lastPublishedQty ile AYNIYSA stockDirty SET EDİLMEZ', async () => {
        setup([{ raw: 1 }], () => ({ barcode: 'B1', quantity: 10 }), { _id: 'v1', platforms: { trendyol: { stockSync: { lastPublishedQty: 10 } } } });
        const job = new ExternalReconciliationJob();

        const result = await job.run();

        expect(result.markedDirty).toBe(0);
        expect(variantModel.updateOne).not.toHaveBeenCalled();
    });

    it('fark VARSA stockDirty=true SET EDİLİR (bir DÜZELTME değil, yeniden yayın tetiklemesi)', async () => {
        setup([{ raw: 1 }], () => ({ barcode: 'B1', quantity: 3 }), { _id: 'v1', platforms: { trendyol: { stockSync: { lastPublishedQty: 10 } } } });
        const job = new ExternalReconciliationJob();

        const result = await job.run();

        expect(result.markedDirty).toBe(1);
        expect(variantModel.updateOne).toHaveBeenCalledWith({ _id: 'v1' }, { $set: { stockDirty: true, stockDirtyAt: expect.any(Date) } });
    });

    it('bizde hiç yayın geçmişi yoksa (lastPublishedQty undefined) KARŞILAŞTIRMA ATLANIR', async () => {
        setup([{ raw: 1 }], () => ({ barcode: 'B1', quantity: 3 }), { _id: 'v1', platforms: {} });
        const job = new ExternalReconciliationJob();

        const result = await job.run();

        expect(result.markedDirty).toBe(0);
    });

    it('pazaryerinde var ama bizde eşleşen varyant yoksa (null) hata FIRLATILMAZ, atlanır', async () => {
        setup([{ raw: 1 }], () => ({ barcode: 'B-YOK', quantity: 3 }), null);
        const job = new ExternalReconciliationJob();

        const result = await job.run();

        expect(result.markedDirty).toBe(0);
        expect(result.skipped).toBe(false);
    });
});

/**
 * BİRİM/CHARACTERIZATION: StockPublishTrigger (backend/src/operations/stock/StockPublishTrigger.ts)
 * ADR-0004 Karar 5-6 (Aşama C) — kanal yayını/debounce köprüsü. `DatabaseManagerInstance`/`RedisService`/
 * `IntegrationFactory`/`integrationEventBus` tamamen jest.mock ile kesilir. DB/Redis/ağ YOK.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
    DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { isReady: jest.fn() } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import { StockPublishTrigger } from '@operations/stock/StockPublishTrigger';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { RedisService } from '@services/redis/RedisService';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { EVENTS, integrationEventBus } from '@integration/engine/IntegrationEventBus';

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;

function leanChain(result: any) {
    return { limit: jest.fn().mockReturnThis(), lean: jest.fn(async () => result) };
}

describe('StockPublishTrigger.computePublishQuantity (saf fonksiyon, ADR Karar 5)', () => {
    it('birincil kanalda tampon uygulanmaz (available olduğu gibi yayınlanır)', () => {
        expect(StockPublishTrigger.computePublishQuantity(10, { isPrimary: true })).toBe(10);
    });

    it('birincil olmayan kanalda varsayılan bufferUnits=1 uygulanır', () => {
        expect(StockPublishTrigger.computePublishQuantity(10, { isPrimary: false })).toBe(9);
    });

    it('bufferPercent tanımlıysa max(bufferUnits, floor(available*percent/100)) kullanılır', () => {
        // available=100, bufferPercent=10 -> floor(10)=10 > bufferUnits(1) -> publish=90
        expect(StockPublishTrigger.computePublishQuantity(100, { isPrimary: false, bufferPercent: 10 })).toBe(90);
    });

    it('sonuç asla negatif olmaz (0a clamp)', () => {
        expect(StockPublishTrigger.computePublishQuantity(0, { isPrimary: false, bufferUnits: 5 })).toBe(0);
    });

    it('channelMax verilmişse üst sınıra clamp edilir (Trendyol 20000)', () => {
        expect(StockPublishTrigger.computePublishQuantity(50000, { isPrimary: true, channelMax: 20000 })).toBe(20000);
    });
});

describe('StockPublishTrigger.run - Redis dayanıklılığı (ADR-0005 Karar 2 ile AYNI kapı)', () => {
    it('Redis hazır değilse tur TAMAMEN ATLANIR, ApplicationDB\'ye sorulmaz', async () => {
        (RedisService.isReady as any).mockReturnValue(false);
        const trigger = new StockPublishTrigger();

        const result = await trigger.run();

        expect(result).toEqual({ skipped: true, scannedClients: 0, staged: 0 });
        expect((DatabaseManagerInstance.getApplicationDB as any)).not.toHaveBeenCalled();
    });
});

describe('StockPublishTrigger.run - tenant tarama ve staged kayıt oluşturma', () => {
    let clientModel: any;
    let appDb: any;
    let clientDb: any;
    let integrationModel: any;
    let variantModel: any;
    let stagedModel: any;
    let exportFlagModel: any;
    let integrationInstance: any;
    let emitSpy: any;

    beforeEach(() => {
        (RedisService.isReady as any).mockReturnValue(true);

        clientModel = { find: jest.fn(() => ({ lean: jest.fn(async () => [{ order: 1, status: 'ACTIVE' }]) })) };
        exportFlagModel = { updateOne: jest.fn(async () => ({})) };
        appDb = { getClientModel: () => clientModel, getExportFlagModel: () => exportFlagModel };
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(appDb);

        integrationModel = { findOne: jest.fn(() => ({ lean: jest.fn(async () => ({ marketplace: [{ code: 'trendyol', order: 1, status: true, settings: {} }] })) })) };
        variantModel = {
            find: jest.fn(() => leanChain([])),
            bulkWrite: jest.fn(async () => ({})),
        };
        stagedModel = {
            countDocuments: jest.fn(async () => 0),
            updateOne: jest.fn(async () => ({})),
        };
        clientDb = {
            getClientIntegrationModel: () => integrationModel,
            getVariantModel: () => variantModel,
            getExportStagedProductModel: () => stagedModel,
        };
        (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(clientDb);

        integrationInstance = { getMatchKey: () => 'barcode' };
        factoryCtor.mockImplementation(() => ({ getInstance: jest.fn(async () => integrationInstance) }));

        emitSpy = jest.spyOn(integrationEventBus, 'emit');
    });

    afterEach(() => {
        emitSpy.mockRestore();
    });

    it('dirty varyant yoksa hiçbir staged kayıt oluşturulmaz, event fırlatılmaz', async () => {
        const trigger = new StockPublishTrigger();
        const result = await trigger.run();

        expect(result).toEqual({ skipped: false, scannedClients: 1, staged: 0 });
        expect(stagedModel.updateOne).not.toHaveBeenCalled();
        expect(emitSpy).not.toHaveBeenCalled();
    });

    it('[DB-03] kirli varyant taraması yalnız gereken alanları okur; ClientIntegrations okuması -erp.settings.catalog projeksiyonuyla', async () => {
        const trigger = new StockPublishTrigger();
        await trigger.run();

        expect(variantModel.find).toHaveBeenCalledWith({ stockDirty: true }, {
            _id: 1, stock: 1, reserved: 1, barcode: 1, stockcode: 1, productId: 1, stockVersion: 1, stockDirtyAt: 1,
            'platforms.trendyol.upload.TRANSFER.status': 1, 'platforms.trendyol.stockSync': 1,
        });
        expect(integrationModel.findOne).toHaveBeenCalledWith({}, { 'erp.settings.catalog': 0 });
    });

    it('TRANSFER tamamlanmamış SKU atlanır (mevcut BatchCreator kuralıyla AYNI)', async () => {
        variantModel.find = jest.fn(() => leanChain([
            { _id: 'v1', barcode: 'B1', stock: 10, reserved: 0, platforms: { trendyol: { upload: { TRANSFER: { status: 'PENDING' } } } } },
        ]));

        const trigger = new StockPublishTrigger();
        const result = await trigger.run();

        expect(result.staged).toBe(0);
        expect(stagedModel.updateOne).not.toHaveBeenCalled();
        // Hiç kanal dokunulmadığı için stockDirty temizleme de YAPILMAZ (touchedAnyChannel=false).
        expect(variantModel.bulkWrite).not.toHaveBeenCalled();
    });

    it('publish değeri lastPublishedQty ile AYNIYSA staged kayıt oluşturulmaz (delta yalnızca değişen SKU)', async () => {
        variantModel.find = jest.fn(() => leanChain([
            {
                _id: 'v1', barcode: 'B1', stock: 10, reserved: 0,
                platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } }, stockSync: { lastPublishedQty: 9 } } },
            },
        ]));

        const trigger = new StockPublishTrigger();
        const result = await trigger.run();

        // isPrimary (tek kanal, order=1 -> primary), buffer=0 -> publish=10 (BAŞKA bir sonuç: lastPublishedQty=9 farklı!)
        // Bu senaryoda primary kanal olduğundan publish=10 != 9 -> staged OLUŞMALI. Aşağıdaki testte primary=false ele alınır.
        expect(result.staged).toBe(1);
    });

    it('publish gerçekten lastPublishedQty ile eşleşince ATLANIR', async () => {
        variantModel.find = jest.fn(() => leanChain([
            {
                _id: 'v1', barcode: 'B1', stock: 10, reserved: 0,
                platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } }, stockSync: { lastPublishedQty: 10 } } },
            },
        ]));

        const trigger = new StockPublishTrigger();
        const result = await trigger.run();

        expect(result.staged).toBe(0);
        expect(stagedModel.updateOne).not.toHaveBeenCalled();
        // Değerlendirildi (kanal dokunuldu) -> dirty temizlenir.
        // [X2] koşullu temizleme: tarama sonrası araya giren düzenleme bayrağı kaybetmez
        expect(variantModel.bulkWrite).toHaveBeenCalledWith([{ updateOne: { filter: { _id: 'v1', stockDirtyAt: null, stockVersion: null }, update: { $set: { stockDirty: false } } } }]);
    });

    it('aktif in-flight (SENT/WAITING vb.) bir staged kayıt varsa YENİ kayıt oluşturulmaz (15dk aynı gövde koruması)', async () => {
        variantModel.find = jest.fn(() => leanChain([
            { _id: 'v1', barcode: 'B1', stock: 10, reserved: 0, platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } } } } },
        ]));
        stagedModel.countDocuments = jest.fn(async () => 1);

        const trigger = new StockPublishTrigger();
        const result = await trigger.run();

        expect(result.staged).toBe(0);
        expect(stagedModel.updateOne).not.toHaveBeenCalled();
    });

    it('başarıyla staged kayıt oluşturulunca: upsert edilir, targetPublishQty set edilir, ExportFlag artar, event fırlatılır', async () => {
        variantModel.find = jest.fn(() => leanChain([
            { _id: 'v1', barcode: 'B1', productId: 'p1', stockcode: 'SC1', stock: 10, reserved: 0, platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } } } } },
        ]));

        const trigger = new StockPublishTrigger();
        const result = await trigger.run();

        expect(result.staged).toBe(1);
        expect(stagedModel.updateOne).toHaveBeenCalledTimes(1);
        const [filter, update, options] = stagedModel.updateOne.mock.calls[0];
        expect(filter).toMatchObject({ barcode: 'B1', mode: 'UPDATE_STOCK', integrationCode: 'trendyol' });
        expect(update.$set.targetPublishQty).toBe(10); // tek kanal -> primary -> buffer 0 -> publish=10
        expect(options).toEqual({ upsert: true });

        expect(exportFlagModel.updateOne).toHaveBeenCalledWith(
            { clientId: 1, integrationCode: 'trendyol' },
            { $inc: { queuedCount: 1 }, $set: { lastUpdatedAt: expect.any(Date) } },
            { upsert: true },
        );
        expect(emitSpy).toHaveBeenCalledWith(EVENTS.PROCESS_NEXT_SIGNAL);
        // [X2] koşullu temizleme: tarama sonrası araya giren düzenleme bayrağı kaybetmez
        expect(variantModel.bulkWrite).toHaveBeenCalledWith([{ updateOne: { filter: { _id: 'v1', stockDirtyAt: null, stockVersion: null }, update: { $set: { stockDirty: false } } } }]);
    });

    it('stok 0a düşen SKU normal (120) yerine yüksek priorityScore (500) ile staged edilir', async () => {
        variantModel.find = jest.fn(() => leanChain([
            { _id: 'v1', barcode: 'B1', stock: 0, reserved: 0, platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } } } } },
        ]));

        const trigger = new StockPublishTrigger();
        await trigger.run();

        const [, update] = stagedModel.updateOne.mock.calls[0];
        expect(update.$set.targetPublishQty).toBe(0);
        expect(update.$set.priorityScore).toBe(500);
    });

    it('birincil olmayan kanalda varsayılan bufferUnits=1 uygulanır (son adet birincil kanalda kalır)', async () => {
        integrationModel.findOne = jest.fn(() => ({
            lean: jest.fn(async () => ({
                stockPolicy: { primaryChannel: 'hepsiburada' },
                marketplace: [
                    { code: 'trendyol', order: 1, status: true, settings: {} },
                    { code: 'hepsiburada', order: 2, status: true, settings: {} },
                ],
            })),
        }));
        variantModel.find = jest.fn(() => leanChain([
            {
                _id: 'v1', barcode: 'B1', stock: 10, reserved: 0,
                platforms: {
                    trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } } },
                    hepsiburada: { upload: { TRANSFER: { status: 'COMPLETED' } } },
                },
            },
        ]));
        factoryCtor.mockImplementation(() => ({
            getInstance: jest.fn(async (code: string) => ({ getMatchKey: () => 'barcode' })),
        }));

        const trigger = new StockPublishTrigger();
        const result = await trigger.run();

        expect(result.staged).toBe(2);
        const trendyolCall = stagedModel.updateOne.mock.calls.find((c: any) => c[0].integrationCode === 'trendyol');
        const hbCall = stagedModel.updateOne.mock.calls.find((c: any) => c[0].integrationCode === 'hepsiburada');
        expect(trendyolCall[1].$set.targetPublishQty).toBe(9); // birincil DEĞİL -> buffer 1
        expect(hbCall[1].$set.targetPublishQty).toBe(10); // birincil -> buffer 0
    });
});

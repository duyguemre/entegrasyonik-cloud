/**
 * [C22 2026-09-28] Publisher: bir işlem birden çok pazaryeri isteğine bölündüğünde (Trendyol UPDATE: onaylı
 * content-bulk-update + onaysız unapproved-bulk-update) `variantList[i].trackingId` ÖNCELİKLİ kullanılır; yoksa
 * parçanın ortak `trackingId`'si (ESKİ davranış, DEĞİŞMEDİ). Mock'lu; DB/ağ YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));

import Publisher from '@integration/engine/catalog/export/Publisher';
import IntegrationFactory from '@integration/modules/IntegrationFactory';

const anyFn = (): any => jest.fn();
let stagedModel: any, variantModel: any, signalModel: any, provider: any, instance: any;

beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    instance = { getMatchKey: () => 'barcode', updateProduct: anyFn() };
    (IntegrationFactory as any).mockImplementation(() => ({ getInstance: anyFn().mockResolvedValue(instance) }));
    const entries = [
        { _id: 'e1', barcode: 'B1', stockcode: 'S1', productId: 'P1' },
        { _id: 'e2', barcode: 'B2', stockcode: 'S2', productId: 'P2' },
    ];
    const chain = (rows: any[]) => ({ select: () => ({ lean: async () => rows }), lean: async () => rows });
    stagedModel = { find: anyFn().mockImplementation(() => chain(entries)), bulkWrite: anyFn().mockResolvedValue({}) };
    variantModel = { bulkWrite: anyFn().mockResolvedValue({}) };
    signalModel = { updateOne: anyFn().mockResolvedValue({}) };
    provider = {
        getExportStagedProductModel: () => stagedModel,
        getVariantModel: () => variantModel,
        getExportSignalModel: () => signalModel,
        markStatsAsDirty: anyFn().mockResolvedValue(undefined),
        prepareStagingUpdateOp: anyFn().mockImplementation((id: any, _w: any, status: any, extra: any) => ({ id, status, ...extra })),
        prepareVariantPlatformUpdateOp: anyFn().mockImplementation((matchValue: any, _v: any, _c: any, _m: any, status: any, extra: any) => ({ matchValue, status, ...extra })),
    };
});
afterEach(() => { jest.restoreAllMocks(); });

describe('Publisher.handleResults - varyant bazlı trackingId (C22)', () => {
    it('variantList[i].trackingId farklıysa her staged kayıt KENDİ takip ID\'sini alır', async () => {
        instance.updateProduct.mockResolvedValue({
            trackingId: 'T-A', result: true, failedVariants: [],
            variantList: [{ variantId: 1, barcode: 'B1', trackingId: 'T-A' }, { variantId: 2, barcode: 'B2', trackingId: 'T-U' }],
        });
        await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE' as any, 'batch-1');
        const ops = stagedModel.bulkWrite.mock.calls[0][0];
        expect(ops.map((o: any) => [o.id, o.status, o.trackingId])).toEqual([['e1', 'SENT', 'T-A'], ['e2', 'SENT', 'T-U']]);
        const vops = variantModel.bulkWrite.mock.calls[0][0];
        expect(vops.map((o: any) => [o.matchValue, o.batchProcessId])).toEqual([['B1', 'T-A'], ['B2', 'T-U']]);
    });

    it('ESKİ davranış DEĞİŞMEDİ: varyantta trackingId yoksa parçanın ortak trackingId\'si kullanılır; hiç yoksa COMPLETED', async () => {
        instance.updateProduct.mockResolvedValue({ trackingId: 'T-X', result: true, failedVariants: [], variantList: [{ variantId: 1, barcode: 'B1' }, { variantId: 2, barcode: 'B2' }] });
        await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE' as any, 'batch-1');
        expect(stagedModel.bulkWrite.mock.calls[0][0].map((o: any) => o.trackingId)).toEqual(['T-X', 'T-X']);

        stagedModel.bulkWrite.mockClear();
        instance.updateProduct.mockResolvedValue({ trackingId: null, result: true, failedVariants: [], variantList: [{ variantId: 1, barcode: 'B1' }] });
        await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE' as any, 'batch-2');
        expect(stagedModel.bulkWrite.mock.calls[0][0][0].status).toBe('COMPLETED');
    });
});

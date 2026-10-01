/**
 * CHARACTERIZATION: Catalog Publisher toplu hata yolu (handleBatchFailure)
 * Kaynak: backend/src/integration/engine/catalog/export/Publisher.ts (~satır 225)
 *
 * [DÜZELTME 2026-09-28] Eski bulgu: IExportStagedProduct / Export şemasında `clientId` alanı yok; handleBatchFailure
 * `new IntegrationFactory(Number(entries[0]?.clientId || 1))` kullandığından toplu hata yolunda fabrika HER ZAMAN
 * client 1 için kuruluyordu. DÜZELTİLDİ: handleBatchFailure artık ikinci bir fabrika/DB okuması YAPMAZ; runOnce'daki
 * tenant'a ait matchKey parametre olarak geçer (fabrika yalnızca runOnce'ta, doğru tenant ile bir kez kurulur).
 * Gerçek IntegrationFactory ile çok-tenant doğrulaması: Publisher.clientOneFallback.characterization.test.ts.
 *
 * IntegrationFactory ve engineProvider tamamen mock; DB/Redis/ağ YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));

import Publisher from '@integration/engine/catalog/export/Publisher';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

const anyFn = (): any => jest.fn();

let getInstanceByClient: Record<number, any>;
let factoryCtorCalls: number[];
let instance: any;
let stagedModel: any;
let variantModel: any;
let signalModel: any;
let provider: any;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);

  factoryCtorCalls = [];
  getInstanceByClient = {};
  instance = {
    getMatchKey: () => 'barcode',
    updateProductStock: anyFn().mockRejectedValue(new Error('[Trendyol] [Service] 500 patladı')),
  };
  (IntegrationFactory as any).mockImplementation((clientId: number) => {
    factoryCtorCalls.push(clientId);
    return { getInstance: anyFn().mockResolvedValue(instance) };
  });

  // Staged kayıtlarda clientId alanı YOK (şemada yok)
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
    prepareStagingUpdateOp: anyFn().mockImplementation((id: any, worker: any, status: any, extra: any) => ({ id, status, ...extra })),
    prepareVariantPlatformUpdateOp: anyFn().mockImplementation((matchValue: any, _v: any, code: any, mode: any, status: any, extra: any) => ({ matchValue, status, ...extra })),
  };
});

afterEach(() => { jest.restoreAllMocks(); });

describe('Publisher.runOnce - toplu hata yolu', () => {
  it('[DÜZELTME 2026-09-28] toplu hata yolunda IntegrationFactory YALNIZCA doğru tenant (9) ile kurulur; client 1 fallback\'i YOK', async () => {
    const publisher = new Publisher(provider);
    await publisher.runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-1');

    // Yalnızca runOnce başındaki doğru tenant (9); handleBatchFailure içinde ikinci (client 1) fabrika YOK
    expect(factoryCtorCalls).toEqual([9]);
  });

  it('[MEVCUT DAVRANIŞ] hata yolu yine de staging/variant kayıtlarını FAILED işaretler ve sinyali SENT yapar (iş FAILED sinyaliyle bitmez)', async () => {
    const publisher = new Publisher(provider);
    await publisher.runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-1');

    const stagingOps = stagedModel.bulkWrite.mock.calls[0][0];
    expect(stagingOps.map((o: any) => o.status)).toEqual(['FAILED', 'FAILED']);
    expect(stagingOps[0].errorType).toBe('SYSTEM_ERROR');
    // formatUserMessage baştaki [..] önekleri temizler
    expect(stagingOps[0].errorMessage).toBe('Publisher hatası: 500 patladı');
    const variantOps = variantModel.bulkWrite.mock.calls[0][0];
    expect(variantOps.map((o: any) => [o.matchValue, o.status])).toEqual([['B1', 'FAILED'], ['B2', 'FAILED']]);
    expect(signalModel.updateOne).toHaveBeenCalledTimes(1);
    expect(signalModel.updateOne.mock.calls[0][0]).toEqual({ batchId: 'batch-1' });
    expect(signalModel.updateOne.mock.calls[0][1].$set.status).toBe('SENT');
  });

  it('[DÜZELTME 2026-09-28] staged kayıtta clientId falsy (0) olsa bile fabrika yalnızca doğru tenant (9) ile kurulur (eskiden || 1 fallback\'i)', async () => {
    const rows = [{ _id: 'e1', barcode: 'B1', clientId: 0 }];
    const chain = (r: any[]) => ({ select: () => ({ lean: async () => r }), lean: async () => r });
    stagedModel.find.mockImplementation(() => chain(rows));
    await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-2');
    expect(factoryCtorCalls).toEqual([9]);
  });

  it('[DÜZELTME 2026-09-28] staged kayıtta (şemada olmayan) clientId alanı dolu gelse bile YOK SAYILIR; tenant daima runOnce\'un clientId\'sidir (eskiden [9, 5])', async () => {
    const rows = [{ _id: 'e1', barcode: 'B1', clientId: 5 }];
    const chain = (r: any[]) => ({ select: () => ({ lean: async () => r }), lean: async () => r });
    stagedModel.find.mockImplementation(() => chain(rows));
    await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-3');
    expect(factoryCtorCalls).toEqual([9]);
  });
});

describe('Publisher.runOnce - toplu hata yolu [ADR-0006 adım 5] IntegrationError.retryable ayrımı', () => {
  it('[YENİ DAVRANIŞ] retryable=true (UNAVAILABLE) -> kalem FAILED YAPILMAZ, PENDING + nextRunAt ile tekrar denenir; varyant platform durumuna DOKUNULMAZ', async () => {
    instance.updateProductStock = anyFn().mockRejectedValue(
      new IntegrationError('UNAVAILABLE', 'devre açık', { integrationCode: 'trendyol', operation: 'updateProductStock', clientId: 9, circuitOpen: true })
    );
    const publisher = new Publisher(provider);
    await publisher.runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-4');

    const stagingOps = stagedModel.bulkWrite.mock.calls[0][0];
    expect(stagingOps.map((o: any) => o.status)).toEqual(['PENDING', 'PENDING']);
    expect(stagingOps[0].errorType).toBe('TRANSIENT_ERROR');
    expect(stagingOps[0].nextRunAt).toBeInstanceOf(Date);
    // Retryable yolda varyant modeli bulkWrite HİÇ çağrılmaz (kalıcı FAILED gösterilmez).
    expect(variantModel.bulkWrite).not.toHaveBeenCalled();
    // Retryable yolda tenant için IntegrationFactory yeniden kurulmaz (yalnızca runOnce başındaki çağrı).
    expect(factoryCtorCalls).toEqual([9]);
  });

  it('[ADR-0006 B3 - YENİ DAVRANIŞ] retryable=true (UNAVAILABLE) -> SİNYAL SENT YAPILMAZ; PENDING kalır ve nextRunAt ile (varsayılan 5dk) ertelenir', async () => {
    instance.updateProductStock = anyFn().mockRejectedValue(
      new IntegrationError('UNAVAILABLE', 'devre açık', { integrationCode: 'trendyol', operation: 'updateProductStock', clientId: 9, circuitOpen: true })
    );
    const publisher = new Publisher(provider);
    const before = Date.now();
    await publisher.runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-4b');

    expect(signalModel.updateOne).toHaveBeenCalledTimes(1);
    const setDoc = signalModel.updateOne.mock.calls[0][1].$set;
    expect(setDoc.status).toBe('PENDING'); // ÖNCEDEN (B1/B2): 'SENT' olurdu — bu davranış B3'te TERS ÇEVRİLDİ
    expect(setDoc.nextRunAt.getTime()).toBeGreaterThan(before + 4 * 60 * 1000); // varsayılan ~5dk erteleme
  });

  it('[YENİ DAVRANIŞ] retryable=true (RATE_LIMITED) -> aynı şekilde PENDING + nextRunAt (retryAfterMs varsa ona göre)', async () => {
    instance.updateProductStock = anyFn().mockRejectedValue(
      new IntegrationError('RATE_LIMITED', 'hız sınırı', { integrationCode: 'trendyol', operation: 'updateProductStock', clientId: 9, retryAfterMs: 2000 })
    );
    const publisher = new Publisher(provider);
    await publisher.runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-5');

    const stagingOps = stagedModel.bulkWrite.mock.calls[0][0];
    expect(stagingOps.map((o: any) => o.status)).toEqual(['PENDING', 'PENDING']);
  });

  it('[ADR-0006 B3 - YENİ DAVRANIŞ] retryable=true (RATE_LIMITED, retryAfterMs=2000) -> SİNYAL PENDING kalır, nextRunAt retryAfterMs kadar (2sn) ertelenir, SENT YAPILMAZ', async () => {
    instance.updateProductStock = anyFn().mockRejectedValue(
      new IntegrationError('RATE_LIMITED', 'hız sınırı', { integrationCode: 'trendyol', operation: 'updateProductStock', clientId: 9, retryAfterMs: 2000 })
    );
    const publisher = new Publisher(provider);
    const before = Date.now();
    await publisher.runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-5b');

    expect(signalModel.updateOne).toHaveBeenCalledTimes(1);
    const setDoc = signalModel.updateOne.mock.calls[0][1].$set;
    expect(setDoc.status).toBe('PENDING');
    const delay = setDoc.nextRunAt.getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(1900);
    expect(delay).toBeLessThan(60000); // retryAfterMs (2sn) kullanıldı, varsayılan 5dk'ya düşülmedi
  });

  it('[ADR-0006 B3 - YENİ DAVRANIŞ] hiçbir hata yoksa (mevcut MEVCUT DAVRANIŞ testiyle aynı senaryo) sinyal hâlâ SENT olur', async () => {
    // Kontrol: başarı yolunda B3 tamamlaması hiçbir şeyi bozmaz (bkz. dosyanın başındaki
    // "[MEVCUT DAVRANIŞ] hata yolu ... sinyali SENT yapar" testi, retryable OLMAYAN hata için).
    instance.updateProductStock = anyFn().mockResolvedValue({ trackingId: null, variantList: [{ barcode: 'B1' }, { barcode: 'B2' }], failedVariants: [] });
    const publisher = new Publisher(provider);
    await publisher.runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-7');
    expect(signalModel.updateOne).toHaveBeenCalledTimes(1);
    expect(signalModel.updateOne.mock.calls[0][1].$set.status).toBe('SENT');
  });

  it('[YENİ DAVRANIŞ] retryable=false (VALIDATION, gerçek IntegrationError) -> hâlâ KALICI FAILED yapılır (davranış değişmedi)', async () => {
    instance.updateProductStock = anyFn().mockRejectedValue(
      new IntegrationError('VALIDATION', 'geçersiz gövde', { integrationCode: 'trendyol', operation: 'updateProductStock', clientId: 9 })
    );
    const publisher = new Publisher(provider);
    await publisher.runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-6');

    const stagingOps = stagedModel.bulkWrite.mock.calls[0][0];
    expect(stagingOps.map((o: any) => o.status)).toEqual(['FAILED', 'FAILED']);
    expect(variantModel.bulkWrite).toHaveBeenCalledTimes(1);
  });
});

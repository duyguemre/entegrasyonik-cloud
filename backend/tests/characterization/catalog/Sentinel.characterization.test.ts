/**
 * CHARACTERIZATION: katalog export Sentinel.runOnce/finalizeTracking
 * Kaynak: backend/src/integration/engine/catalog/export/Sentinel.ts
 *
 * ÖNCE (Protokol 13): mevcut davranış sabitlenir — Sentinel, `checkBatchProduct` sonucu COMPLETED dönen
 * kalemler için SADECE `prepareVariantPlatformUpdateOp`/`prepareStagingUpdateOp` çağırırdı; `Variant.
 * platforms.<code>.stockSync` (lastPublishedQty/lastPublishedAt/lastBatchId) HİÇ YAZILMAZDI.
 *
 * SONRA (ADR-0004 Karar 6, Aşama C — bu görevde eklendi): `mode === 'UPDATE_STOCK'` VE nihai durum
 * COMPLETED ise, EK olarak `prepareStockSyncConfirmationOp` çağrılıp `stockSync.lastPublishedQty` (staging
 * kaydının `stock` alanından, yani Validator'ın yazdığı yayın adedinden) güncellenir. WAITING/FAILED veya
 * UPDATE_STOCK-DIŞI modlarda EK çağrı YAPILMAZ (davranış ÖNCEKİYLE AYNI).
 *
 * IntegrationFactory/engineProvider tamamen mock. DB/Redis/ağ YOK.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import Sentinel from '@integration/engine/catalog/export/Sentinel';
import IntegrationFactory from '@integration/modules/IntegrationFactory';

const anyFn = (): any => jest.fn();
const BATCH_ID = 'batch-1';
const TRACKING_ID = 'track-1';

let instance: any;
let stagedModel: any;
let variantModel: any;
let signalModel: any;
let provider: any;
let variantOpCalls: any[];
let stockSyncOpCalls: any[];

function chain(rows: any) {
  return { select: () => ({ lean: async () => rows }), lean: async () => rows };
}

function setup(reportStatus: 'COMPLETED' | 'FAILED' | 'WAITING', stagingEntry: any) {
  instance = {
    getMatchKey: () => 'barcode',
    checkBatchProduct: anyFn().mockResolvedValue([{ matchValue: 'B1', status: reportStatus, messages: ['ok'] }]),
  };
  (IntegrationFactory as any).mockImplementation(() => ({ getInstance: anyFn().mockResolvedValue(instance) }));

  variantOpCalls = [];
  stockSyncOpCalls = [];

  // 1) timeout sorgusu (boş) 2) pendingBatches aggregate 3) finalizeTracking staging sorgusu
  const timedOutChain = chain([]);
  const findCalls: any[] = [];
  stagedModel = {
    find: anyFn().mockImplementation((filter: any) => {
      findCalls.push(filter);
      if (findCalls.length === 1) return timedOutChain; // handleTimeout sorgusu
      return chain([stagingEntry]); // finalizeTracking sorgusu
    }),
    aggregate: anyFn().mockResolvedValue([{ _id: TRACKING_ID }]),
    bulkWrite: anyFn().mockResolvedValue({}),
    countDocuments: anyFn().mockResolvedValue(0),
  };
  variantModel = { bulkWrite: anyFn().mockImplementation(async (ops: any[]) => { variantOpCalls.push(...ops); }) };
  signalModel = { updateOne: anyFn().mockResolvedValue({}) };

  provider = {
    getExportStagedProductModel: () => stagedModel,
    getVariantModel: () => variantModel,
    getExportSignalModel: () => signalModel,
    markStatsAsDirty: anyFn().mockResolvedValue(undefined),
    prepareVariantPlatformUpdateOp: anyFn().mockImplementation((matchValue: any, mapping: any, integrationCode: any, mode: any, status: any, extra: any) => ({ __op: 'variantPlatform', matchValue, mode, status, ...extra })),
    prepareStagingUpdateOp: anyFn().mockImplementation((id: any, worker: any, status: any, extra: any) => ({ __op: 'staging', id, status, ...extra })),
    prepareStockSyncConfirmationOp: anyFn().mockImplementation((matchValue: any, integrationCode: any, qty: any, options: any) => {
      const op = { __op: 'stockSync', matchValue, integrationCode, qty, ...options };
      stockSyncOpCalls.push(op);
      return op;
    }),
  };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('Sentinel.finalizeTracking — ÖNCEKİ davranış (stockSync HİÇ yazılmazdı)', () => {
  it('UPDATE_STOCK dışı bir modda (TRANSFER) COMPLETED olsa da prepareStockSyncConfirmationOp ÇAĞRILMAZ', async () => {
    setup('COMPLETED', { _id: 'e1', barcode: 'B1', stock: 7 });
    const sentinel = new Sentinel(provider);

    await sentinel.runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);

    expect(stockSyncOpCalls).toHaveLength(0);
  });

  it('UPDATE_STOCK modunda WAITING/FAILED sonuçta prepareStockSyncConfirmationOp ÇAĞRILMAZ', async () => {
    setup('FAILED', { _id: 'e1', barcode: 'B1', stock: 7 });
    const sentinel = new Sentinel(provider);

    await sentinel.runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stockSyncOpCalls).toHaveLength(0);
  });
});

describe('Sentinel.finalizeTracking — YENİ davranış (ADR-0004 Karar 6, Aşama C): UPDATE_STOCK + COMPLETED -> stockSync onayı', () => {
  it('UPDATE_STOCK + COMPLETED: prepareStockSyncConfirmationOp, staging kaydının stock alanıyla (Validator\'ın yazdığı yayın adedi) çağrılır', async () => {
    setup('COMPLETED', { _id: 'e1', barcode: 'B1', stock: 7 });
    const sentinel = new Sentinel(provider);

    await sentinel.runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stockSyncOpCalls).toHaveLength(1);
    expect(stockSyncOpCalls[0]).toMatchObject({ matchValue: 'B1', integrationCode: 'trendyol', qty: 7, batchId: TRACKING_ID, matchKey: 'barcode' });
    expect(variantOpCalls.some((op: any) => op.__op === 'stockSync')).toBe(true);
  });

  it('staging kaydında stock alanı YOKSA (beklenmeyen durum) stockSync onayı ÇAĞRILMAZ (güvenli varsayılan)', async () => {
    setup('COMPLETED', { _id: 'e1', barcode: 'B1' });
    const sentinel = new Sentinel(provider);

    await sentinel.runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stockSyncOpCalls).toHaveLength(0);
  });
});

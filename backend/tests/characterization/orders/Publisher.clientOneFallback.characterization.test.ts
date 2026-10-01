/**
 * [DÜZELTME 2026-09-28] Publisher toplu hata yolu: "daima client 1'i alır" hatası DÜZELTİLDİ (GERÇEK IntegrationFactory ile doğrulama)
 * Kaynak: backend/src/integration/engine/catalog/export/Publisher.ts -> runOnce / handleBatchFailure (kalıcı/retryable OLMAYAN dal)
 *
 * Geçmiş bulgu (BACKLOG C7 açık ucu): `export_staged_product` şemasında (`database/client/models/Export.ts`) `clientId` alanı
 * YOKTUR (strict mod) -> eski kod `new IntegrationFactory(Number(entries[0]?.clientId || 1)).getInstance(...)` daima tenant 1'in
 * entegrasyon ayarlarını okuyordu (çapraz-tenant sızıntı); tenant 1'de entegrasyon yoksa "Ayarları bulunamadı" dış catch'e sızıp
 * staging/variant kayıtlarının FAILED işaretlenmesini ve kalan chunk'ların işlenmesini engelliyordu. Ayrıca gerçek Proxy
 * sarmalayıcı `getMatchKey()`'i Promise'e çevirdiğinden bu yola hiç ulaşılmıyordu (bkz. IntegrationFactory.getMatchKeyPromise testi).
 *
 * Düzeltme: handleBatchFailure artık ikinci bir fabrika/DB okuması yapmaz; runOnce'un (doğru tenant) matchKey'i parametre olarak
 * geçer. Proxy sarmalayıcı `getMatchKey()`'i senkron bırakır. Bu dosya IntegrationFactory'yi MOCK'LAMAZ: gerçek fabrika (GERÇEK
 * Proxy dahil) + sahte adaptör sınıfı + sahte DatabaseManager (DB/Redis/ağ YOK) kullanır; çok-tenant senaryosu içerir.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const clientDbs: Record<number, any> = {};
const appDb: any = {};
const requestedClientIds: any[] = [];
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getClientDB: async (id: any) => { requestedClientIds.push(id); return clientDbs[Number(id)]; },
    getApplicationDB: async () => appDb,
  },
}));

const built: any[] = [];
const updateProductStock: any = jest.fn();
const fakeAdapter = () => ({
  __esModule: true,
  default: class {
    constructor(public config: any) { built.push(config); }
    getMatchKey() { return this.config.integrationSettings.settings.MATCHKEY; }
    updateProductStock(...a: any[]) { return updateProductStock(this.config.clientId, ...a); }
  },
});
jest.mock('../../../src/integration/modules/marketplace/trendyol', () => fakeAdapter());
jest.mock('../../../src/integration/modules/marketplace/pazarama', () => fakeAdapter());
jest.mock('../../../src/integration/modules/marketplace/n11', () => fakeAdapter());
jest.mock('../../../src/integration/modules/marketplace/hepsiburada', () => fakeAdapter());
jest.mock('../../../src/integration/modules/ecommerce/ideasoft', () => fakeAdapter());
jest.mock('../../../src/integration/modules/erp/bizimhesap', () => fakeAdapter());
jest.mock('../../../src/integration/modules/provider/PlatformMappingProvider', () => ({ PlatformMappingProvider: class { } }));

import Publisher from '@integration/engine/catalog/export/Publisher';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ExportStagedProductSchema } from '@database/client/models/Export';

const lean = (v: any) => ({ lean: async () => v });

/** Tenant için client DB: `configured` ise trendyol ayarı (MATCHKEY + tenant'a özgü APIKEY ile) vardır, değilse hiç entegrasyon yoktur. */
function tenantDb(configured: boolean, matchKey = 'barcode', apiKey = 'sentetik') {
  const doc = configured ? { marketplace: [{ code: 'trendyol', settings: { MATCHKEY: matchKey, APIKEY: apiKey } }] } : { marketplace: [] };
  return {
    getClientIntegrationModel: () => ({ findOne: () => lean(doc) }),
    getSettingModel: () => ({ findOne: () => lean({ app: 1 }) }),
  };
}

let stagedRows: any[];
let stagedModel: any;
let variantModel: any;
let signalModel: any;
let provider: any;

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  IntegrationFactory.clearCache(); // statik instance/config önbelleği testler arası sızmasın
  built.length = 0;
  requestedClientIds.length = 0;
  for (const k of Object.keys(clientDbs)) delete clientDbs[Number(k)];
  updateProductStock.mockReset().mockRejectedValue(new Error('[Trendyol] [Service] 500 patladı'));
  Object.assign(appDb, { getIntegrationModel: () => ({ find: () => lean([{ code: 'trendyol', name: 'Trendyol' }]) }) });

  // Staged kayıtlarda clientId YOK (gerçek şemada alan yok)
  stagedRows = [
    { _id: 'e1', barcode: 'B1', stockcode: 'S1', productId: 'P1' },
    { _id: 'e2', barcode: 'B2', stockcode: 'S2', productId: 'P2' },
  ];
  const chain = (rows: any[]) => ({ select: () => ({ lean: async () => rows }), lean: async () => rows });
  stagedModel = { find: (jest.fn() as any).mockImplementation(() => chain(stagedRows)), bulkWrite: (jest.fn() as any).mockResolvedValue({}) };
  variantModel = { bulkWrite: (jest.fn() as any).mockResolvedValue({}) };
  signalModel = { updateOne: (jest.fn() as any).mockResolvedValue({}) };
  provider = {
    getExportStagedProductModel: () => stagedModel,
    getVariantModel: () => variantModel,
    getExportSignalModel: () => signalModel,
    markStatsAsDirty: (jest.fn() as any).mockResolvedValue(undefined),
    prepareStagingUpdateOp: (jest.fn() as any).mockImplementation((id: any, _w: any, status: any, extra: any) => ({ id, status, ...extra })),
    prepareVariantPlatformUpdateOp: (jest.fn() as any).mockImplementation((matchValue: any, _v: any, _c: any, _m: any, status: any, extra: any) => ({ matchValue, status, ...extra })),
  };
});

afterEach(() => { jest.restoreAllMocks(); });

describe('C7 kaynağı: export_staged_product şemasında clientId YOK (tenant kimliği staged kayıttan okunamaz)', () => {
  it('[MEVCUT DAVRANIŞ] gerçek ExportStagedProductSchema `clientId` yolunu içermez ve strict modda: tenant kimliği çağıran bağlamdan (runOnce) gelmek ZORUNDADIR — düzeltme bunu yapar', () => {
    expect(ExportStagedProductSchema.path('clientId')).toBeUndefined();
    expect(ExportStagedProductSchema.get('strict')).not.toBe(false);
  });
});

describe('Gerçek Proxy AKTİF: toplu hata yolu artık çalışır (getMatchKey senkron) ve YALNIZCA çağıran tenant için kurulur', () => {
  it('[DÜZELTME 2026-09-28] tenant 9 toplu (kalıcı) hata: getClientDB yalnızca 9 ile çağrılır (client 1 ASLA); adaptör yalnızca tenant 9 ayarlarıyla kurulur; staging/variant FAILED, sinyal SENT', async () => {
    clientDbs[9] = tenantDb(true, 'barcode', 'tenant9-key');
    clientDbs[1] = tenantDb(true, 'barcode', 'tenant1-key');

    await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-c7-1');

    expect(requestedClientIds).toEqual([9]);
    expect(built.map((c) => c.clientId)).toEqual([9]);
    expect(built.map((c) => c.integrationSettings.settings.APIKEY)).toEqual(['tenant9-key']); // tenant 1'in kimlik bilgisi asla okunmadı
    expect(updateProductStock).toHaveBeenCalledTimes(1);
    expect(updateProductStock.mock.calls[0][0]).toBe(9);
    const stagingOps = stagedModel.bulkWrite.mock.calls[0][0];
    expect(stagingOps.map((o: any) => o.status)).toEqual(['FAILED', 'FAILED']);
    const variantOps = variantModel.bulkWrite.mock.calls[0][0];
    expect(variantOps.map((o: any) => [o.matchValue, o.matchKey, o.status])).toEqual([['B1', 'barcode', 'FAILED'], ['B2', 'barcode', 'FAILED']]);
    expect(signalModel.updateOne.mock.calls[0][1].$set.status).toBe('SENT');
  });

  it('[DÜZELTME 2026-09-28] matchKey tenant 9\'un KENDİ adaptöründen gelir: tenant 9 "stockcode", tenant 1 "barcode" -> variant ops stockcode değerleriyle yazılır (eskiden tenant 1\'in matchKey\'i kullanılırdı)', async () => {
    clientDbs[9] = tenantDb(true, 'stockcode');
    clientDbs[1] = tenantDb(true, 'barcode');

    await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-c7-2');

    const variantOps = variantModel.bulkWrite.mock.calls[0][0];
    expect(variantOps.map((o: any) => [o.matchValue, o.matchKey, o.status])).toEqual([['S1', 'stockcode', 'FAILED'], ['S2', 'stockcode', 'FAILED']]);
  });

  it('[DÜZELTME 2026-09-28] tenant 1\'de o entegrasyon OLMASA bile tenant 9 etkilenmez: "Ayarları bulunamadı" YOK, staging/variant kayıtları FAILED işaretlenir, sinyal SENT (eskiden kayıtlar PENDING kalır, sinyal FAILED olurdu)', async () => {
    clientDbs[9] = tenantDb(true);
    clientDbs[1] = tenantDb(false); // tenant 1 trendyol'u hiç kurmamış

    await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-c7-3');

    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('Publisher Critical Error'), expect.anything());
    expect(stagedModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(stagedModel.bulkWrite.mock.calls[0][0].map((o: any) => o.status)).toEqual(['FAILED', 'FAILED']);
    expect(variantModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(signalModel.updateOne).toHaveBeenCalledTimes(1);
    const set = signalModel.updateOne.mock.calls[0][1].$set;
    expect(set.status).toBe('SENT');
    expect(set.lockedBy).toBeNull();
  });

  it('[DÜZELTME 2026-09-28] çok-chunk batch: her chunk\'ın hatası kendi kayıtlarını FAILED işaretler ve KALAN chunk\'lar işlenir (120 kalem / publisher.chunkSize 30 -> updateProductStock 4 kez, staging bulkWrite 4 kez)', async () => {
    clientDbs[9] = tenantDb(true);
    clientDbs[1] = tenantDb(false);
    stagedRows = Array.from({ length: 120 }, (_, i) => ({ _id: `e${i}`, barcode: `B${i}`, productId: `P${i}` }));

    await new Publisher(provider).runOnce('9', 'trendyol', 'UPDATE_STOCK' as any, 'batch-c7-4');

    expect(updateProductStock).toHaveBeenCalledTimes(4);
    expect(stagedModel.bulkWrite).toHaveBeenCalledTimes(4);
    expect(signalModel.updateOne.mock.calls[0][1].$set.status).toBe('SENT');
    expect(requestedClientIds).toEqual([9]);
  });

  it('[KONTROL] tenant 1 kendisi için çalışırken davranış tutarlıdır (yalnızca kendi ayarları); hata yolunda sinyal SENT', async () => {
    clientDbs[1] = tenantDb(true);

    await new Publisher(provider).runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, 'batch-c7-5');

    expect(built.every((c) => c.clientId === 1)).toBe(true);
    expect(stagedModel.bulkWrite).toHaveBeenCalledTimes(1);
    expect(signalModel.updateOne.mock.calls[0][1].$set.status).toBe('SENT');
  });
});

describe('Çok-tenant izolasyonu (GERÇEK IntegrationFactory): her tenant yalnızca KENDİ ayarını okur', () => {
  it('[DÜZELTME 2026-09-28] tenant 2 için tenant 2 ayarı okunur, tenant 1\'in ayarı ASLA: tenant 1 ve 3 DB\'leri hiç istenmez (2 farklı matchKey ile)', async () => {
    clientDbs[1] = tenantDb(true, 'barcode', 'tenant1-key');
    clientDbs[2] = tenantDb(true, 'stockcode', 'tenant2-key');

    await new Publisher(provider).runOnce('2', 'trendyol', 'UPDATE_STOCK' as any, 'batch-mt-1');

    expect(requestedClientIds).toEqual([2]);
    expect(requestedClientIds).not.toContain(1);
    expect(built.map((c) => [c.clientId, c.integrationSettings.settings.APIKEY])).toEqual([[2, 'tenant2-key']]);
    expect(variantModel.bulkWrite.mock.calls[0][0].map((o: any) => o.matchKey)).toEqual(['stockcode', 'stockcode']);
  });

  it('[DÜZELTME 2026-09-28] art arda iki tenant (2 sonra 3, sonra 1): her biri kendi DB/ayar/matchKey ile; hiçbir tenant başkasının kimlik bilgisiyle adaptör kurmaz', async () => {
    clientDbs[1] = tenantDb(true, 'barcode', 'tenant1-key');
    clientDbs[2] = tenantDb(true, 'stockcode', 'tenant2-key');
    clientDbs[3] = tenantDb(true, 'barcode', 'tenant3-key');

    for (const t of ['2', '3', '1']) {
      variantModel.bulkWrite.mockClear();
      await new Publisher(provider).runOnce(t, 'trendyol', 'UPDATE_STOCK' as any, `batch-mt-${t}`);
      expect(variantModel.bulkWrite.mock.calls[0][0].map((o: any) => o.matchKey)).toEqual(t === '2' ? ['stockcode', 'stockcode'] : ['barcode', 'barcode']);
    }

    expect(requestedClientIds).toEqual([2, 3, 1]);
    expect(built.map((c) => [c.clientId, c.integrationSettings.settings.APIKEY])).toEqual([[2, 'tenant2-key'], [3, 'tenant3-key'], [1, 'tenant1-key']]);
    expect(updateProductStock.mock.calls.map((c: any[]) => c[0])).toEqual([2, 3, 1]);
  });

  it('[DÜZELTME 2026-09-28] tenant 2 entegrasyonu KURMAMIŞSA (tenant 1 kurmuş olsa da) tenant 2 tenant 1\'e düşmez: runOnce başında "Ayarları bulunamadı" ile sinyal FAILED olur, tenant 1 DB\'si istenmez', async () => {
    clientDbs[1] = tenantDb(true, 'barcode', 'tenant1-key');
    clientDbs[2] = tenantDb(false);

    await new Publisher(provider).runOnce('2', 'trendyol', 'UPDATE_STOCK' as any, 'batch-mt-4');

    expect(requestedClientIds).toEqual([2]);
    expect(built).toEqual([]); // tenant 1'in ayarıyla hiçbir adaptör kurulmadı
    expect(updateProductStock).not.toHaveBeenCalled();
    const set = signalModel.updateOne.mock.calls[0][1].$set;
    expect(set.status).toBe('FAILED');
    expect(set.errorMessage).toEqual(expect.stringContaining('Ayarları bulunamadı'));
  });
});

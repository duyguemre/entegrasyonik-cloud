/**
 * CHARACTERIZATION: katalog import Importer.runOnce
 * Kaynak: backend/src/integration/engine/catalog/import/Importer.ts
 *
 * %0 kapsam, dokunulmaz listesindeydi (docs/QA_FAZ2.md madde 7/12, MASTER_STATE.md). Kod TAM okunup
 * DEĞİŞTİRİLMEDİ (görev talimatı gereği dikkatlice okundu — hâlâ tamamen testsizdi).
 *
 * IntegrationFactory jest.mock ile değiştirilir. `engineProvider` (IIntegrationEngineProvider) sahte bir
 * nesnedir (Sync.characterization.test.ts'teki desenle AYNI: her get*Model() metodu kendi sahte koleksiyon
 * nesnesini döner). DB/Redis/ağ YOK; veriler sentetiktir.
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import Importer from '@integration/engine/catalog/import/Importer';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import importConfig from '@integration/engine/catalog/import/import.config.json';
import { ObjectId } from 'mongodb';

/** Kod `new ObjectId(...)` ile gerçek bir 24-hex-karakter ID bekler (bkz. Importer.ts finalVariants); test
 * verisi bu yüzden GERÇEK ObjectId üretir, keyfi string DEĞİL (aksi halde "input must be a 24 character hex
 * string..." hatasıyla runOnce sessizce job'u FAILED yapar -- bizzat gözlemlenen bir tuzak). */
const oid = () => new ObjectId().toString();

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;

function lean(fnResult: () => any) {
  const c: any = { calls: {} as Record<string, any[]> };
  for (const m of ['sort', 'limit', 'select']) c[m] = jest.fn((...a: any[]) => { c.calls[m] = a; return c; });
  c.lean = jest.fn(async () => fnResult());
  return c;
}

let jobModel: any;
let stagedModel: any;
let summaryModel: any;
let variantModel: any;
let productModel: any;
let provider: any;
let instance: any;
let getInstance: jest.Mock<any>;

let jobDoc: any;
let stagedSummaries: any[];
let stagedChunks: any[][]; // her çağrıda bir sonraki chunk döner (sayfalama taklidi)
let existingVariants: any[];
let productBulkResult: any;
let relevantProducts: any[];

beforeEach(() => {
  jest.useFakeTimers();

  jobDoc = { _id: 'job1', clientId: 7, integrationCode: 'trendyol', status: 'READY_TO_SYNC', matchKey: undefined, processedCount: 0, failedCount: 0, duplicateCount: 0 };
  stagedSummaries = [];
  stagedChunks = [[]];
  existingVariants = [];
  productBulkResult = {};
  relevantProducts = [];

  jobModel = {
    findById: jest.fn(() => lean(() => jobDoc)),
    updateOne: jest.fn(async () => ({})),
  };
  let chunkCallIndex = 0;
  stagedModel = {
    find: jest.fn(() => lean(() => stagedChunks[Math.min(chunkCallIndex++, stagedChunks.length - 1)] ?? [])),
    bulkWrite: jest.fn(async () => ({})),
  };
  summaryModel = { find: jest.fn(() => lean(() => stagedSummaries)) };
  variantModel = {
    find: jest.fn(() => lean(() => existingVariants)),
    insertMany: jest.fn(async () => ({})),
    aggregate: jest.fn(async () => []),
  };
  productModel = {
    bulkWrite: jest.fn(async () => productBulkResult),
    find: jest.fn(() => lean(() => relevantProducts)),
  };

  provider = {
    getImportJobModel: () => jobModel,
    getImportStagedProductModel: () => stagedModel,
    getImportStagedProductSummaryModel: () => summaryModel,
    getVariantModel: () => variantModel,
    getProductModel: () => productModel,
  };

  instance = { convertToInternalModel: jest.fn() };
  getInstance = jest.fn(async () => instance);
  factoryCtor.mockReset();
  factoryCtor.mockImplementation((clientId: any) => { void clientId; return { getInstance }; });

  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  cap = captureLogs();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Importer.ts, staging kaydının `_id`'sini SONRADAN `new ObjectId(id)` ile kullanır (bkz. Importer.ts satır
 * ~216, staging bulkWrite filtresi); bu yüzden burada 's1' gibi keyfi bir string DEĞİL, GERÇEK bir ObjectId
 * hex string üretilir (aksi halde "input must be a 24 character hex string..." ile runOnce sessizce job'u
 * FAILED yapar -- Importer.characterization.test.ts'te ObjectId dokümantasyonuyla AYNI tuzak, bizzat gözlemlendi). */
const rawItem = (barcode: string) => ({ _id: oid(), barcode, rawData: { barcode } });
const internalModel = (maincode: string, barcode: string, choices: any[] = [{ choiceId: '1', choiceValueId: 'A' }]) => ({
  product: { maincode, title: 'T', description: 'D', taxPercentage: 18, brand: 'B', category: 'C', hasVariant: false },
  variant: { salePrice: 100, description: 'D', taxPercentage: 18, choices },
});

async function run(jobId = 'job1') {
  return new Importer(provider).runOnce(jobId);
}

describe('Importer.runOnce - koruma (guard)', () => {
  it('[MEVCUT DAVRANIŞ] job bulunamazsa hiçbir şey yapılmaz (sessizce döner)', async () => {
    jobDoc = null;
    await run();
    expect(factoryCtor).not.toHaveBeenCalled();
    expect(jobModel.updateOne).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] job.status READY_TO_SYNC DEĞİLSE (ör. hâlâ FETCHING) hiçbir şey yapılmaz', async () => {
    jobDoc = { ...jobDoc, status: 'FETCHING' };
    await run();
    expect(factoryCtor).not.toHaveBeenCalled();
  });
});

describe('Importer.runOnce - mutlu yol', () => {
  it('[MEVCUT DAVRANIŞ] status PROCESSING\'e çekilir, IntegrationFactory(clientId) ile instance alınır, tek geçerli kayıt işlenir, PRODUCT upsert + VARIANT insert + STAGING COMPLETED yapılır, sonunda status COMPLETED', async () => {
    stagedChunks = [[rawItem('B1')], []];
    instance.convertToInternalModel.mockResolvedValue(internalModel('M1', 'B1'));
    relevantProducts = [{ _id: oid(), maincode: 'M1' }];

    await run();

    expect(factoryCtor).toHaveBeenCalledWith(7);
    expect(getInstance).toHaveBeenCalledWith('trendyol');
    expect(jobModel.updateOne).toHaveBeenCalledWith({ _id: 'job1' }, { $set: { status: 'PROCESSING', updatedAt: expect.any(Date) } });

    const productOp = productModel.bulkWrite.mock.calls[0][0][0];
    expect(productOp.updateOne.filter).toEqual({ maincode: 'M1' });
    expect(productOp.updateOne.upsert).toBe(true);

    const variantOp = variantModel.insertMany.mock.calls[0][0][0];
    expect(variantOp).toMatchObject({ barcode: 'B1', maincode: 'M1', integrationCode: 'trendyol', productId: expect.anything() });
    expect(variantOp.stagedId).toBeUndefined(); // stagedId temizlendi (pureVariantData)

    const stagingOp = stagedModel.bulkWrite.mock.calls[stagedModel.bulkWrite.mock.calls.length - 1][0][0];
    expect(stagingOp.updateOne.filter).toEqual({ _id: expect.anything() });
    expect(stagingOp.updateOne.update.$set).toMatchObject({ importStatus: 'COMPLETED' });

    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate).toEqual([{ _id: 'job1' }, { $set: { status: 'COMPLETED', completedAt: expect.any(Date) } }]);
  });

  it('[MEVCUT DAVRANIŞ] job.matchKey tanımsızsa "barcode" varsayılır; tanımlıysa o alan kullanılır', async () => {
    jobDoc = { ...jobDoc, matchKey: 'stockcode' };
    stagedChunks = [[{ _id: oid(), stockcode: 'SC1', rawData: { stockcode: 'SC1' } }], []];
    instance.convertToInternalModel.mockResolvedValue(internalModel('M1', 'SC1'));
    relevantProducts = [{ _id: oid(), maincode: 'M1' }];

    await run();
    expect(variantModel.find).toHaveBeenCalledWith({ stockcode: { $in: ['SC1'] } });
  });
});

describe('Importer.runOnce - atlama/mükerrer senaryoları', () => {
  it('[MEVCUT DAVRANIŞ] barkod ZATEN Variant koleksiyonunda varsa SKIP: convertToInternalModel HİÇ çağrılmaz, "Barkod mevcut" ile duplicateCount artar', async () => {
    stagedChunks = [[rawItem('B1')], []];
    existingVariants = [{ barcode: 'B1', variantHash: 'x' }];

    await run();

    expect(instance.convertToInternalModel).not.toHaveBeenCalled();
    const stagingOp = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(stagingOp.updateOne.update.$set).toMatchObject({ importStatus: 'COMPLETED', skipReason: 'Barkod mevcut' });
    const countUpdate = jobModel.updateOne.mock.calls.find((c: any[]) => c[1].$set.duplicateCount !== undefined);
    expect(countUpdate![1].$set.duplicateCount).toBe(1);
  });

  it('[MEVCUT DAVRANIŞ] varyant hash\'i (maincode+choices) DB\'de zaten varsa "Mükerrer Kayıt (Varyant Mevcut)" ile SKIP edilir (barkod farklı olsa bile)', async () => {
    stagedChunks = [[rawItem('B2')], []];
    const model = internalModel('M1', 'B2', [{ choiceId: '1', choiceValueId: 'A' }]);
    instance.convertToInternalModel.mockResolvedValue(model);
    // Aynı maincode+choices hash'ine sahip BAŞKA bir barkodun DB'deki hash'i:
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update('M1:1:A').digest('hex');
    existingVariants = [{ barcode: 'OTHER', variantHash: hash }];

    await run();

    const stagingOp = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(stagingOp.updateOne.update.$set.skipReason).toBe('Mükerrer Kayıt (Varyant Mevcut)');
    expect(variantModel.insertMany).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] convertToInternalModel hata verirse FAIL: "Sistem Hatası: <mesaj>" ile failedCount artar, işlem DURMAZ (döngü devam eder)', async () => {
    stagedChunks = [[rawItem('B1')], []];
    instance.convertToInternalModel.mockRejectedValue(new Error('dönüşüm patladı'));

    await run();

    const stagingOp = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(stagingOp.updateOne.update.$set).toMatchObject({ importStatus: 'FAILED', skipReason: 'Sistem Hatası: dönüşüm patladı' });
    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate[1].$set.status).toBe('COMPLETED'); // tekil kayıt hatası TÜM job'u FAILED yapmaz
  });
});

describe('Importer.runOnce - insertMany yarış/yazma hataları (code 11000 vs diğer)', () => {
  it('[MEVCUT DAVRANIŞ] insertMany writeErrors code 11000 (yarış durumunda mükerrer anahtar) ise duplicateCount++/processedCount--, "Mükerrer Kayıt (Yarış Durumu)"', async () => {
    stagedChunks = [[rawItem('B1')], []];
    instance.convertToInternalModel.mockResolvedValue(internalModel('M1', 'B1'));
    relevantProducts = [{ _id: oid(), maincode: 'M1' }];
    variantModel.insertMany.mockRejectedValue({ writeErrors: [{ index: 0, err: { code: 11000 } }] });

    await run();

    const stagingCalls = stagedModel.bulkWrite.mock.calls;
    const lastStagingOp = stagingCalls[stagingCalls.length - 1][0][0];
    expect(lastStagingOp.updateOne.update.$set.skipReason).toBe('Mükerrer Kayıt (Yarış Durumu)');
  });

  it('[MEVCUT DAVRANIŞ] insertMany writeErrors code!=11000 ise failedCount++/processedCount--, "Yazma Hatası: <mesaj>"', async () => {
    stagedChunks = [[rawItem('B1')], []];
    instance.convertToInternalModel.mockResolvedValue(internalModel('M1', 'B1'));
    relevantProducts = [{ _id: oid(), maincode: 'M1' }];
    variantModel.insertMany.mockRejectedValue({ writeErrors: [{ index: 0, err: { code: 99, errmsg: 'disk full' } }] });

    await run();

    const stagingCalls = stagedModel.bulkWrite.mock.calls;
    const lastStagingOp = stagingCalls[stagingCalls.length - 1][0][0];
    expect(lastStagingOp.updateOne.update.$set).toMatchObject({ importStatus: 'FAILED', skipReason: 'Yazma Hatası: disk full' });
  });
});

describe('Importer.runOnce - sayfalama (hasMore) ve imleç', () => {
  it('[MEVCUT DAVRANIŞ] dönen kayıt sayısı fetchLimit\'e (50) EŞİTSE bir sonraki sayfa aranır ($gt lastProcessedId ile); AZSA döngü durur', async () => {
    const full = Array.from({ length: importConfig.importer.fetchLimit }, (_, i) => rawItem(`B${i}`));
    stagedChunks = [full, []]; // ilk sayfa TAM (fetchLimit kadar) -> ikinci sayfa boş -> dur
    instance.convertToInternalModel.mockImplementation(async (item: any) => internalModel('M_' + item._id, item.barcode));
    relevantProducts = full.map((it) => ({ _id: oid(), maincode: 'M_' + it._id }));

    await run();

    expect(stagedModel.find).toHaveBeenCalledTimes(2); // iki sayfa da sorgulandı
    const secondPageFilter = (stagedModel.find.mock.calls[1] as any[])[0];
    expect(secondPageFilter._id).toEqual({ $gt: expect.anything() }); // ikinci sayfa imleçli
  });
});

describe('Importer.runOnce - fetchWithRetry', () => {
  it('[MEVCUT DAVRANIŞ] sayfa sorgusu ilk denemede hata verirse retryCount (3) kez, retryDelay (3000ms) aralıkla tekrar denenir; sonunda başarılı olursa devam eder', async () => {
    let attempt = 0;
    stagedModel.find.mockImplementation(() => lean(() => {
      attempt++;
      if (attempt < 3) throw new Error('geçici DB hatası');
      return attempt === 3 ? [rawItem('B1')] : [];
    }));
    instance.convertToInternalModel.mockResolvedValue(internalModel('M1', 'B1'));
    relevantProducts = [{ _id: oid(), maincode: 'M1' }];

    const p = run();
    await jest.advanceTimersByTimeAsync(importConfig.importer.retryDelay * 3);
    await p;

    expect(attempt).toBeGreaterThanOrEqual(3);
    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate[1].$set.status).toBe('COMPLETED');
  });

  it('[MEVCUT DAVRANIŞ] retryCount (3) kere de başarısız olursa hata YUKARI FIRLATILIR: dış try/catch job\'u FAILED yapar (error.message kaydedilir)', async () => {
    stagedModel.find.mockImplementation(() => lean(() => { throw new Error('mongo kalıcı hata'); }));

    const p = run();
    await jest.advanceTimersByTimeAsync(importConfig.importer.retryDelay * (importConfig.importer.retryCount + 1));
    await p;

    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate).toEqual([{ _id: 'job1' }, { $set: { status: 'FAILED', completedAt: expect.any(Date), error: { message: 'mongo kalıcı hata', updatedAt: expect.any(Date) } } }]);
  });
});

describe('Importer.runOnce - stok senkronizasyon hatası (syncProductStocks)', () => {
  it('[MEVCUT DAVRANIŞ] stok toplama (aggregate) hata verirse yutulur (console.error), import işlemi YİNE DE COMPLETED olur', async () => {
    stagedChunks = [[rawItem('B1')], []];
    instance.convertToInternalModel.mockResolvedValue(internalModel('M1', 'B1'));
    relevantProducts = [{ _id: oid(), maincode: 'M1' }];
    variantModel.aggregate.mockRejectedValue(new Error('aggregate patladı'));

    await run();

    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'IMPORTER_STOK_SENKRONIZASYON_HATASI', err: expect.objectContaining({ message: "aggregate patladı" }) }));
    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate[1].$set.status).toBe('COMPLETED');
  });
});

describe('Importer.runOnce — İZOLASYON (yapısal gözlem)', () => {
  it('[MEVCUT DAVRANIŞ] her çağrı KENDİ engineProvider\'ına (dolayısıyla KENDİ ClientDB modellerine) bağımlıdır; iki ayrı job/tenant için ayrı Importer örnekleri birbirinin model çağrılarını PAYLAŞMAZ (constructor enjeksiyonu ile izolasyon)', async () => {
    stagedChunks = [[rawItem('B1')], []];
    instance.convertToInternalModel.mockResolvedValue(internalModel('M1', 'B1'));
    relevantProducts = [{ _id: oid(), maincode: 'M1' }];
    await run();

    const otherJobModel = { findById: jest.fn(() => lean(() => null)), updateOne: jest.fn(async () => ({})) };
    const otherProvider = { ...provider, getImportJobModel: () => otherJobModel };
    await new Importer(otherProvider as any).runOnce('other-job');

    expect(otherJobModel.findById).toHaveBeenCalledWith('other-job');
    expect(jobModel.findById).not.toHaveBeenCalledWith('other-job'); // birbirine karışmadı
  });
});

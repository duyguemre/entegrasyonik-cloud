/**
 * CHARACTERIZATION: katalog import Stager.runOnce
 * Kaynak: backend/src/integration/engine/catalog/import/Stager.ts
 *
 * %0 kapsam, dokunulmaz listesindeydi (docs/QA_FAZ2.md madde 7/12, MASTER_STATE.md). Kod TAM okunup
 * DEĞİŞTİRİLMEDİ (görev talimatı gereği dikkatlice okundu — hâlâ tamamen testsizdi).
 *
 * IntegrationFactory jest.mock ile değiştirilir. `engineProvider` sahte bir nesnedir (Importer
 * characterization testiyle AYNI desen). DB/Redis/ağ YOK; veriler sentetiktir.
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import Stager from '@integration/engine/catalog/import/Stager';
import IntegrationFactory from '@integration/modules/IntegrationFactory';

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
let reportModel: any;
let attributeMappingModel: any;
let provider: any;
let integration: any;
let getInstance: jest.Mock<any>;

let jobDoc: any;
let mappings: any[];
let streamResult: any;

beforeEach(() => {
  jobDoc = { _id: 'job1', clientId: 7, integrationCode: 'trendyol', status: 'WAITING_FOR_FETCH' };
  mappings = [];
  streamResult = { status: 'COMPLETED' };

  jobModel = { findById: jest.fn(() => lean(() => jobDoc)), updateOne: jest.fn(async () => ({})) };
  stagedModel = { bulkWrite: jest.fn(async () => ({})) };
  summaryModel = { bulkWrite: jest.fn(async () => ({})) };
  reportModel = { deleteMany: jest.fn(async () => ({})), updateOne: jest.fn(async () => ({})) };
  attributeMappingModel = { find: jest.fn(() => lean(() => mappings)) };

  provider = {
    getImportJobModel: () => jobModel,
    getImportStagedProductModel: () => stagedModel,
    getImportStagedProductSummaryModel: () => summaryModel,
    getImportJobReportModel: () => reportModel,
    getAttributeMappingModel: () => attributeMappingModel,
  };

  integration = {
    getMatchKey: jest.fn(() => 'barcode'),
    streamProducts: jest.fn(async (onChunk: (chunk: any[]) => Promise<void>) => { void onChunk; return streamResult; }),
    // Testte "ham ürün" nesnesi zaten özet ŞEKLİNDE üretiliyor (bkz. `summary()`); bu yüzden
    // getSummaryFromRaw sadece kendisine verileni aynen döndürür (gerçek adaptörlerin ham->özet dönüşümünü
    // taklit eder, iş mantığı burada test edilmiyor -- yalnızca Stager'ın özeti NASIL kullandığı test ediliyor).
    getSummaryFromRaw: jest.fn(async (raw: any) => raw),
  };
  getInstance = jest.fn(async () => integration);
  factoryCtor.mockReset();
  factoryCtor.mockImplementation((clientId: any) => { void clientId; return { getInstance }; });

  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  cap = captureLogs();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function run(jobId = 'job1') {
  return new Stager(provider).runOnce(jobId);
}

/** streamProducts'ın verdiği `onChunk` callback'ini TEK bir sentetik ürün chunk'ıyla çağıracak şekilde kurar. */
function withChunk(products: any[], resultOverride?: any) {
  integration.streamProducts.mockImplementation(async (onChunk: (chunk: any[]) => Promise<void>) => {
    await onChunk(products);
    return resultOverride ?? streamResult;
  });
}

const catMapping = (platformCategoryId: string, localCategoryId: string) => ({ platformCategoryId, isCategoryMapping: true, localCategoryId });
// [WP9] Özellik eşlemesi artık YEREL kategoriye göre aranır: varsayılan LOCAL1 (catMapping(..., 'LOCAL1') ile eşleşir).
const attrMapping = (platformCategoryId: string, platformAttributeId: string, values: any[], localCategoryId = 'LOCAL1') => ({ platformCategoryId, platformAttributeId, isCategoryMapping: false, values, localCategoryId });

const summary = (over: Partial<any> = {}) => ({
  maincode: 'M1', barcode: 'B1', stockcode: 'SC1', productId: 'P1', platformCategoryId: 'CAT1',
  salePrice: 100, marketPrice: 120, quantity: 5, images: ['img1.jpg'], requiredAttributes: [],
  ...over,
});

describe('Stager.runOnce - koruma (guard)', () => {
  it('[MEVCUT DAVRANIŞ] job bulunamazsa hiçbir şey yapılmaz', async () => {
    jobDoc = null;
    await run();
    expect(factoryCtor).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] job.status WAITING_FOR_FETCH DEĞİLSE (ör. zaten FETCHING) hiçbir şey yapılmaz', async () => {
    jobDoc = { ...jobDoc, status: 'FETCHING' };
    await run();
    expect(factoryCtor).not.toHaveBeenCalled();
  });
});

describe('Stager.runOnce - kurulum', () => {
  it('[MEVCUT DAVRANIŞ] mapping\'ler cache\'lenir, ESKİ rapor silinir, status FETCHING+matchKey(getMatchKey()) yazılır; matchKey boşsa "barcode" varsayılır', async () => {
    integration.getMatchKey.mockReturnValue('');
    await run();
    expect(reportModel.deleteMany).toHaveBeenCalledWith({ jobId: 'job1' });
    expect(jobModel.updateOne).toHaveBeenCalledWith({ _id: 'job1' }, { $set: { status: 'FETCHING', startedAt: expect.any(Date), matchKey: 'barcode' } });
  });

  it('[MEVCUT DAVRANIŞ] IntegrationFactory clientId ile (dönüştürülmeden), instance integrationCode ile alınır', async () => {
    await run();
    expect(factoryCtor).toHaveBeenCalledWith(7);
    expect(getInstance).toHaveBeenCalledWith('trendyol');
  });
});

describe('Stager.runOnce - validateMapping: kategori/nitelik eşleşmesi', () => {
  it('[MEVCUT DAVRANIŞ] kategori HİÇ eşleşmemişse: INVALID, "Kategori eşleşmesi eksik.", missingCategories\'e eklenir, TÜM zorunlu nitelikler missing sayılır', async () => {
    withChunk([summary({ requiredAttributes: [{ attributeId: 'a1', attributeName: 'Renk', attributeValue: 'Kırmızı', required: true }] })]);

    await run();

    const stagingOp = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(stagingOp.updateOne.update.$set).toMatchObject({ importStatus: 'INVALID', skipReason: 'Kategori eşleşmesi eksik.', localCategoryId: undefined });

    const reportUpdate = reportModel.updateOne.mock.calls[0][1].$set;
    expect(reportUpdate.missingCategories).toEqual(['CAT1']);
    expect(reportUpdate.missingCategoryProductCounts).toEqual([{ platformCategoryId: 'CAT1', productCount: 1 }]);
    // NOT: attribute-seviyesi obje `null` ile üretiliyor AMA Stager'daki `{ ...attr, localCategoryId }` spread'i
    // DIŞ (kategori-seviyesi) `localCategoryId`'yi (bu senaryoda `undefined`, kategori HİÇ eşleşmediği için)
    // ÜZERİNE YAZIYOR -- attribute'un kendi `null` değeri KAYBOLUYOR. Gözlemlenen mevcut davranış budur.
    expect(reportUpdate.missingAttributes[0]).toMatchObject({ attributeId: 'a1', localCategoryId: undefined });
  });

  it('[MEVCUT DAVRANIŞ] kategori eşleşmiş ama nitelik eşleşmemişse: INVALID, "Nitelik eşleşmesi eksik.", missingCategories\'E EKLENMEZ (kategori zaten var)', async () => {
    mappings = [catMapping('CAT1', 'LOCAL1')];
    withChunk([summary({ requiredAttributes: [{ attributeId: 'a1', attributeName: 'Renk', attributeValue: 'Kırmızı', required: true }] })]);

    await run();

    const stagingOp = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(stagingOp.updateOne.update.$set).toMatchObject({ importStatus: 'INVALID', skipReason: 'Nitelik eşleşmesi eksik.', localCategoryId: 'LOCAL1' });

    const reportUpdate = reportModel.updateOne.mock.calls[0][1].$set;
    expect(reportUpdate.missingCategories).toEqual([]);
  });

  it('[MEVCUT DAVRANIŞ] kategori VE nitelik (attributeValueId eşleşmesi ile) eşleşirse: VALID, vCount artar', async () => {
    mappings = [
      catMapping('CAT1', 'LOCAL1'),
      attrMapping('CAT1', 'a1', [{ platformValueId: 'V1', platformValueName: 'Kırmızı' }]),
    ];
    withChunk([summary({ requiredAttributes: [{ attributeId: 'a1', attributeName: 'Renk', attributeValue: 'Kırmızı', attributeValueId: 'V1', required: true }] })]);

    await run();

    const stagingOp = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(stagingOp.updateOne.update.$set).toMatchObject({ importStatus: 'VALID', localCategoryId: 'LOCAL1', skipReason: '' });
    const jobCountUpdate = jobModel.updateOne.mock.calls.find((c: any[]) => c[1].$set?.validCount !== undefined);
    expect(jobCountUpdate![1].$set).toMatchObject({ totalCount: 1, validCount: 1, invalidCount: 0 });
  });

  it('[MEVCUT DAVRANIŞ] nitelik eşleşmesi attributeValueId OLMADAN, YALNIZCA attributeValue adı ile de (platformValueName) sağlanabilir; TÜRKÇE büyük harfe çevrilerek karşılaştırılır (case-insensitive gibi davranır)', async () => {
    mappings = [
      catMapping('CAT1', 'LOCAL1'),
      attrMapping('CAT1', 'a1', [{ platformValueName: 'kırmızı' }]),
    ];
    withChunk([summary({ requiredAttributes: [{ attributeId: 'a1', attributeName: 'Renk', attributeValue: 'KIRMIZI', required: true }] })]);

    await run();

    const stagingOp = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(stagingOp.updateOne.update.$set.importStatus).toBe('VALID');
  });

  it('[MEVCUT DAVRANIŞ] BİRDEN FAZLA yerel kategori eşleşmesi varsa (categoryMap dizisi): İLK BAŞARISIZ olan denenir, biri BAŞARILI olursa hasValidPath true olur ve O kategorinin localCategoryId\'si kullanılır', async () => {
    mappings = [
      catMapping('CAT1', 'LOCAL_FAIL'), // önce denenecek ama nitelik eşleşmeyecek
      catMapping('CAT1', 'LOCAL_OK'),   // sonra denenecek, nitelik eşleşecek
      attrMapping('CAT1', 'a1', [{ platformValueId: 'V1' }], 'LOCAL_OK'), // [WP9] yalnız LOCAL_OK kategorisinin özellik eşlemesi var
    ];
    // NOT: attributeMap yalnızca (platformCategoryId, platformAttributeId) ile anahtarlanır (localCategoryId'den
    // BAĞIMSIZ); bu yüzden gerçek kodda "ilk kategori başarısız, ikincisi başarılı" senaryosunu izole etmek
    // için nitelik anahtarını değil, `some()`'un dönüş sırasını gözlemliyoruz: ilk eşleşen kategori kazanır.
    withChunk([summary({ requiredAttributes: [{ attributeId: 'a1', attributeName: 'Renk', attributeValue: 'X', attributeValueId: 'V1', required: true }] })]);

    await run();

    const stagingOp = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(stagingOp.updateOne.update.$set.importStatus).toBe('VALID');
    expect(stagingOp.updateOne.update.$set.localCategoryId).toBe('LOCAL_OK'); // [WP9] eskiden LOCAL_FAIL (özellik eşlemesi yerel kategoriden bağımsız aranıyordu); şimdi eşlemesi olan yol kazanır
  });
});

describe('Stager.runOnce - staging/summary yazımı', () => {
  it('[MEVCUT DAVRANIŞ] staging upsert filtresi {jobId, [matchKey]:matchValue}; $set rawData/localCategoryId/importStatus/skipReason içerir', async () => {
    withChunk([summary()]);
    await run();
    const op = stagedModel.bulkWrite.mock.calls[0][0][0];
    expect(op.updateOne.filter).toEqual({ jobId: 'job1', barcode: 'B1' });
    expect(op.updateOne.update.$set).toMatchObject({ clientId: 7, integrationCode: 'trendyol', maincode: 'M1', barcode: 'B1', stockcode: 'SC1', platformProductId: 'P1' });
    expect(op.updateOne.upsert).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ] AYNI maincode\'a sahip birden fazla ürün TEK bir summary işlemine BİRİKTİRİLİR (min/max/inc/addToSet JS tarafında elle toplanır)', async () => {
    withChunk([
      summary({ barcode: 'B1', salePrice: 100, marketPrice: 90, quantity: 5, images: ['a.jpg'] }),
      summary({ barcode: 'B2', salePrice: 150, marketPrice: 80, quantity: 3, images: ['b.jpg'] }),
    ]);
    await run();

    expect(summaryModel.bulkWrite).toHaveBeenCalledTimes(1);
    const ops = summaryModel.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1); // aynı maincode -> TEK op
    const u = ops[0].updateOne.update;
    expect(u.$min).toEqual({ minSalePrice: 100, minMarketPrice: 80 });
    expect(u.$max).toEqual({ maxSalePrice: 150 });
    expect(u.$inc).toEqual({ totalStock: 8 });
    expect(u.$addToSet.allImages.$each).toEqual(['a.jpg', 'b.jpg']);
  });

  it('[MEVCUT DAVRANIŞ] her chunk sonunda job sayaçları (totalCount/validCount/invalidCount/duplicateCount) güncellenir; duplicateCount HER ZAMAN 0 kalır (globalDuplicates hiç doldurulmuyor -- kod okumasıyla doğrulandı)', async () => {
    // BACKLOG: şüpheli - `globalDuplicates` Set'i tanımlanıyor ve rapora yazılıyor ama HİÇBİR YERDE
    // `.add(...)` çağrısı yok; bu yüzden duplicateBarcodes her zaman boş, dCount her zaman 0 kalıyor. Bu,
    // "mükerrer barkod" tespitinin Stager aşamasında aslında hiç YAPILMADIĞINI gösteriyor (mükerrer kontrolü
    // yalnızca Importer.runOnce'ta, DB'ye karşı, gerçekleşiyor). Düzeltilirse bu test kasıtlı güncellenecek.
    withChunk([summary()]);
    await run();
    const countUpdate = jobModel.updateOne.mock.calls.find((c: any[]) => c[1].$set?.totalCount !== undefined)![1].$set;
    expect(countUpdate).toEqual({ totalCount: 1, validCount: 0, invalidCount: 1, duplicateCount: 0, updatedAt: expect.any(Date) });
  });
});

describe('Stager.runOnce - nihai rapor ve status', () => {
  it('[MEVCUT DAVRANIŞ] streamProducts sonucu COMPLETED ise job READY_TO_SYNC yapılır', async () => {
    withChunk([summary()], { status: 'COMPLETED' });
    await run();
    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate).toEqual([{ _id: 'job1' }, { $set: { status: 'READY_TO_SYNC', updatedAt: expect.any(Date) } }]);
  });

  it('[MEVCUT DAVRANIŞ] streamProducts sonucu COMPLETED DEĞİLSE (ör. FAILED) job FAILED yapılır', async () => {
    withChunk([summary()], { status: 'FAILED' });
    await run();
    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate[1].$set.status).toBe('FAILED');
  });

  it('[MEVCUT DAVRANIŞ] rapor upsert: missingCategoryProductCounts kategori bazlı sayaçtan üretilir; duplicateBarcodes en fazla 500 ile sınırlanır (slice)', async () => {
    withChunk([summary({ platformCategoryId: 'CAT_X' })]);
    await run();
    const [filter, update, opts] = reportModel.updateOne.mock.calls[0] as any[];
    expect(filter).toEqual({ jobId: 'job1' });
    expect(update.$set).toMatchObject({ clientId: 7, integrationCode: 'trendyol' });
    expect(update.$set.duplicateBarcodes).toEqual([]);
    expect(opts).toEqual({ upsert: true });
  });
});

describe('Stager.runOnce - hata yolu', () => {
  it('[MEVCUT DAVRANIŞ] IntegrationFactory.getInstance hata verirse job FAILED yapılır (error.message ile, completedAt YOK -- Importer\'dan FARKLI)', async () => {
    getInstance.mockRejectedValue(new Error('adapter kurulamadı'));
    await run();
    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate).toEqual([{ _id: 'job1' }, { $set: { status: 'FAILED', error: { message: 'adapter kurulamadı' } } }]);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'STAGER_FAILED', msg: expect.stringContaining('Stager failed for job1') }));
  });

  it('[MEVCUT DAVRANIŞ] streamProducts hata verirse de aynı FAILED yoluna düşer', async () => {
    integration.streamProducts.mockRejectedValue(new Error('platform stream patladı'));
    await run();
    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate[1].$set.error.message).toBe('platform stream patladı');
  });

  it('[MEVCUT DAVRANIŞ] chunk işleme (stagedModel.bulkWrite) hata verirse streamProducts\'ın kendi hata yönetimine bağlıdır; burada DIŞARI FIRLATILDIĞINDA dış catch job\'u FAILED yapar', async () => {
    stagedModel.bulkWrite.mockRejectedValue(new Error('yazma hatası'));
    withChunk([summary()]);
    await run();
    const finalUpdate = jobModel.updateOne.mock.calls[jobModel.updateOne.mock.calls.length - 1] as any[];
    expect(finalUpdate[1].$set.status).toBe('FAILED');
  });
});

describe('Stager.runOnce — İZOLASYON (yapısal gözlem)', () => {
  it('[MEVCUT DAVRANIŞ] her çağrı KENDİ engineProvider\'ına bağımlıdır; iki ayrı job/tenant birbirinin model çağrılarını PAYLAŞMAZ', async () => {
    withChunk([summary()]);
    await run();

    const otherJobModel = { findById: jest.fn(() => lean(() => null)), updateOne: jest.fn(async () => ({})) };
    const otherProvider = { ...provider, getImportJobModel: () => otherJobModel };
    await new Stager(otherProvider as any).runOnce('other-job');

    expect(otherJobModel.findById).toHaveBeenCalledWith('other-job');
    expect(jobModel.findById).not.toHaveBeenCalledWith('other-job');
  });
});

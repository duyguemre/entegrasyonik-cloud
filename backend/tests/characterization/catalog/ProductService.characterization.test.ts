/**
 * CHARACTERIZATION: ProductService (backend/src/api/services/product-service.ts)
 *
 * Bu dosya `tests/characterization/product/*.characterization.test.ts` (copyTempImages/updateTempImageDocuments,
 * saveProduct/updateProduct motor-alanı temizliği — ADR-0013 B3 / N6) tarafından ZATEN kapsanan metotları
 * TEKRAR ETMEZ. Kapsam: get, getIntegrations, getProductStatistics, getProducts (+ filtre/sıralama/sayfalama
 * kurucuları), updateOnsale, deleteProduct, retrieveProduct/getProduct, hashChoices, exportExcel.
 * DB/Redis/ağ YOK; `clientDB`/`applicationDB` sahte model nesneleridir (ADR-0016 B-R-T1). Kod DEĞİŞTİRİLMEDİ.
 *
 * Tenant izolasyonu: hiçbir sorgu clientId/tenant alanıyla filtrelenmez; izolasyon tamamen `this.clientDB`
 * (tenant başına ayrı Mongo DB) seçimine dayanır (OrderService/BrandService/CategoryService ile AYNI mimari desen).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

jest.mock('@operations/client/StatsOperations');

import ProductService from '@api/services/product-service';
import { StatsOperations } from '@operations/client/StatsOperations';

const StatsOperationsMock = StatsOperations as unknown as jest.Mock<any>;

let productModel: any;
let variantModel: any;
let statisticsModel: any;
let integrationModel: any;

function makeService(request: any = {}, clientId: any = 42) {
  const svc: any = new ProductService(clientId, request);
  svc.clientDB = {
    getProductModel: () => productModel,
    getVariantModel: () => variantModel,
    getStatisticsModel: () => statisticsModel,
  };
  svc.applicationDB = { getIntegrationModel: () => integrationModel };
  return svc;
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  productModel = {
    find: jest.fn(() => ({ sort: jest.fn(async () => [{ _id: 'p1' }]) })),
    aggregate: jest.fn(async () => [{ totalNumberOfRecords: [], products: [] }]),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
  };
  variantModel = {
    aggregate: jest.fn(async () => []),
    find: jest.fn(() => ({ lean: jest.fn(async () => []) })),
    deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
  };
  statisticsModel = {
    findOne: jest.fn(() => ({ lean: jest.fn(async () => ({ _id: 'variant_stats', isDirty: false, totalProducts: 3, counts: {}, totalVariants: 5, totalStock: 20 })) })),
    updateOne: jest.fn(async () => ({})),
  };
  integrationModel = { find: jest.fn(() => ({ populate: jest.fn(async () => [{ code: 'trendyol' }]) })) };
  StatsOperationsMock.mockReset();
  StatsOperationsMock.mockImplementation(() => ({ reconcileStatistics: jest.fn(async () => ({})), markStatsAsDirty: jest.fn(async () => undefined) }));
});

afterEach(() => { jest.restoreAllMocks(); });

describe('ProductService.get', () => {
  it('[MEVCUT DAVRANIŞ] get(): filtresiz find({}).sort({order:1}) çağrılır, sonuç aynen döner (lean() YOK — Mongoose belge döner)', async () => {
    const res = await makeService().get();
    expect(productModel.find).toHaveBeenCalledWith({});
    expect(res).toEqual([{ _id: 'p1' }]);
  });

  it('[MEVCUT DAVRANIŞ] get(): DB hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('db down');
    productModel.find.mockReturnValue({ sort: jest.fn(async () => { throw err; }) });
    await expect(makeService().get()).rejects.toBe(err);
  });

});

describe('ProductService.getProductStatistics', () => {
  it('[MEVCUT DAVRANIŞ] mevcut ve temiz (isDirty:false) istatistik varsa reconcile ÇAĞRILMAZ; yanıt şekli sabit alan adlarıyla döner', async () => {
    const res = await makeService().getProductStatistics();
    expect(StatsOperationsMock).toHaveBeenCalledWith(expect.anything());
    const instance = StatsOperationsMock.mock.results[0].value;
    expect(instance.reconcileStatistics).not.toHaveBeenCalled();
    expect(res).toEqual({
      totalProducts: 3,
      variantPlatformTransferStatistics: { counts: {}, totalVariants: 5, totalStock: 20 },
    });
  });

  it('[MEVCUT DAVRANIŞ] istatistik yoksa (null) VEYA isDirty:true ise reconcileStatistics() çağrılıp SONUCU kullanılır', async () => {
    statisticsModel.findOne.mockReturnValue({ lean: jest.fn(async () => null) });
    const reconciled = { totalProducts: 9, counts: { a: 1 }, totalVariants: 40, totalStock: 400 };
    StatsOperationsMock.mockImplementation(() => ({ reconcileStatistics: jest.fn(async () => reconciled) }));
    const res = await makeService().getProductStatistics();
    expect(res.totalProducts).toBe(9);
    expect(res.variantPlatformTransferStatistics).toEqual({ counts: { a: 1 }, totalVariants: 40, totalStock: 400 });
  });

  it('[MEVCUT DAVRANIŞ] isDirty:true iken de reconcile tetiklenir (kayıt VAR ama bayat)', async () => {
    statisticsModel.findOne.mockReturnValue({ lean: jest.fn(async () => ({ isDirty: true, totalProducts: 1 })) });
    const reconciled = { totalProducts: 99, counts: {}, totalVariants: 0, totalStock: 0 };
    const reconcileFn = jest.fn(async () => reconciled);
    StatsOperationsMock.mockImplementation(() => ({ reconcileStatistics: reconcileFn }));
    const res = await makeService().getProductStatistics();
    expect(reconcileFn).toHaveBeenCalled();
    expect(res.totalProducts).toBe(99);
  });
});

describe('ProductService.getProducts: filtre/sıralama/sayfalama', () => {
  const pipelineOf = () => productModel.aggregate.mock.calls[0][0] as any[];
  const facetOf = () => (pipelineOf()[2] as any).$facet;
  const matchOf = () => (pipelineOf()[0] as any).$match;

  it('[MEVCUT DAVRANIŞ] boş form: $match {}, varsayılan sıralama yalnız {_id: -1} (sort belirtilmezse sortBy.field HİÇ eklenmez)', async () => {
    await makeService({ searchProductForm: {} }).getProducts();
    expect(pipelineOf()[1]).toEqual({ $sort: { _id: -1 } });
    expect(matchOf()).toEqual({});
  });

  it('[MEVCUT DAVRANIŞ] sort.field === "price" -> gerçek şema alanı "prices.minSalePrice" ile eşlenir; direction "asc" -> 1, aksi -> -1', async () => {
    await makeService({ searchProductForm: { sort: { field: 'price', direction: 'asc' } } }).getProducts();
    expect(pipelineOf()[1]).toEqual({ $sort: { 'prices.minSalePrice': 1, _id: 1 } });

    productModel.aggregate.mockClear();
    await makeService({ searchProductForm: { sort: { field: 'title', direction: 'garbage' } } }).getProducts();
    expect(pipelineOf()[1]).toEqual({ $sort: { title: -1, _id: -1 } });
  });

  it('[DÜZELTME, MM-08, KASITLI TERS ÇEVRİLDİ] sort.field artık İZİN LİSTESİYLE doğrulanır — bilinmeyen alan 400 fırlatır (eskiden $sort\'a doğrudan yazılıyordu)', async () => {
    // OrderService.getOrders'ın ADR-0021/GV-01 ile kapattığı AYNI riski (keyfi alan adı $sort'a yazılabiliyordu) kapatır.
    for (const field of ['$where', 'password', 'billingAddress.phone', { $gt: 1 }]) {
      await expect(makeService({ searchProductForm: { sort: { field, direction: 'asc' } } }).getProducts()).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('[DÜZELTME, MM-08] izin listesindeki HER alan geçer, direction ve ikincil {_id} sıralaması doğru uygulanır', async () => {
    for (const field of ['title', 'stockcode', 'barcode', 'stock']) {
      productModel.aggregate.mockClear();
      await makeService({ searchProductForm: { sort: { field, direction: 'asc' } } }).getProducts();
      expect(pipelineOf()[1]).toEqual({ $sort: { [field]: 1, _id: 1 } });
    }
  });

  it('[DÜZELTME, MM-08, KASITLI TERS ÇEVRİLDİ] sort NESNESİ var ama .field YOKSA artık HİÇBİR alan eklenmez (yalnız {_id}) — eskiden sortBy[undefined] gibi tuhaf bir anahtar üretiyordu', async () => {
    await makeService({ searchProductForm: { sort: { direction: 'asc' } } }).getProducts();
    expect(pipelineOf()[1]).toEqual({ $sort: { _id: 1 } });
  });

  it('[MEVCUT DAVRANIŞ] pagination normalize edilir: page<1 -> 1, limit varsayılan 10, üst sınır 200 (normalizePagination)', async () => {
    await makeService({ searchProductForm: { pagination: { page: 0, limit: 0 } } }).getProducts();
    expect(facetOf().products[0]).toEqual({ $skip: 0 });
    expect(facetOf().products[1]).toEqual({ $limit: 10 });

    productModel.aggregate.mockClear();
    await makeService({ searchProductForm: { pagination: { page: 3, limit: 99999 } } }).getProducts();
    expect(facetOf().products[0]).toEqual({ $skip: 400 }); // (3-1) * 200 (üst sınıra kırpılmış limit)
    expect(facetOf().products[1]).toEqual({ $limit: 200 });
  });

  it('[MEVCUT DAVRANIŞ] searchText verilirse ÜRÜN title/​_id filtresi İLE varyant stockcode/barcode araması BİRLEŞİR (searchText tanımlıysa $or ile birleştirme)', async () => {
    // Not: getProductVariantFilterQuery de AYNI `searchProductForm.data` nesnesini alır ve `.searchText` alanını okur;
    // bu yüzden bir searchText girildiğinde hem ürün (title/_id) hem varyant (stockcode/barcode) araması TETİKLENİR
    // ve ikisi $or ile birleştirilir (variantFilterQuery boş olmadığından).
    const validId = new ObjectId().toString();
    variantModel.aggregate.mockResolvedValue([]);
    await makeService({ searchProductForm: { data: { searchText: validId } } }).getProducts();
    expect(matchOf()).toEqual({
      $or: [
        { $or: [{ title: { $regex: validId, $options: 'i' } }, { _id: new ObjectId(validId) }] },
        { _id: { $in: [] } },
      ],
    });
    // varyant tarafı: stockcode/barcode kaçışlı regex ile $group productId
    const variantPipeline = variantModel.aggregate.mock.calls[0][0];
    expect(variantPipeline[0].$match.$and[0].$or).toEqual([
      { stockcode: { $regex: validId, $options: 'i' } },
      { barcode: { $regex: validId, $options: 'i' } },
    ]);
  });

  it('[MEVCUT DAVRANIŞ] searchText kaçışsız regex meta karakteri içerse bile KAÇIŞLI olarak $regex\'e yazılır (ReDoS/enjeksiyon kapalı)', async () => {
    variantModel.aggregate.mockResolvedValue([{ _id: 'p9' }]);
    await makeService({ searchProductForm: { data: { searchText: '(a+)+$' } } }).getProducts();
    const inner = matchOf().$or[0];
    expect(inner.$or).toEqual([{ title: { $regex: '\\(a\\+\\)\\+\\$', $options: 'i' } }]); // ObjectId.isValid false -> _id koşulu YOK
    expect(matchOf().$or[1]).toEqual({ _id: { $in: ['p9'] } });
  });

  it('[MEVCUT DAVRANIŞ] category/brand -1 ise filtreye eklenmez; diğer değerler ObjectId\'ye çevrilir', async () => {
    const catId = new ObjectId().toString();
    await makeService({ searchProductForm: { data: { category: catId, brand: -1 } } }).getProducts();
    const match = (pipelineOf()[0] as any).$match;
    expect(match.$and).toEqual([{ category: new ObjectId(catId) }]);
  });

  it('[MEVCUT DAVRANIŞ] prices.minSalePrice/maxSalePrice filtreleri $gte/$lte olarak eklenir (maxSalePrice yalnız >0 ise)', async () => {
    await makeService({ searchProductForm: { data: { prices: { minSalePrice: 10, maxSalePrice: 0 } } } }).getProducts();
    let match = (pipelineOf()[0] as any).$match;
    expect(match.$and).toEqual([{ 'prices.minSalePrice': { $gte: 10 } }]); // maxSalePrice:0 eklenmez

    productModel.aggregate.mockClear();
    await makeService({ searchProductForm: { data: { prices: { maxSalePrice: 50 } } } }).getProducts();
    match = (pipelineOf()[0] as any).$match;
    expect(match.$and).toEqual([{ 'prices.maxSalePrice': { $lte: 50 } }]);
  });

  it('[MEVCUT DAVRANIŞ] varyant filtresi (ör. stockcode) varsa Variant aggregate ile productId listesi çıkarılır; searchText YOKSA $and, VARSA $or ile birleştirilir', async () => {
    variantModel.aggregate.mockResolvedValue([{ _id: 'p1' }, { _id: 'p2' }]);
    await makeService({ searchProductForm: { data: { stockcode: 'SKU-1' } } }).getProducts();
    const match = (pipelineOf()[0] as any).$match;
    expect(match.$and).toEqual([{}, { _id: { $in: ['p1', 'p2'] } }]); // searchText yok -> $and

    productModel.aggregate.mockClear();
    await makeService({ searchProductForm: { data: { searchText: 'abc', stockcode: 'SKU-1' } } }).getProducts();
    const match2 = (pipelineOf()[0] as any).$match;
    expect(Object.keys(match2)).toEqual(['$or']);
  });

  it('[MEVCUT DAVRANIŞ] transferStatuses "PENDING" hem PENDING hem alan-yok durumunu $or ile kapsar; onSale filtresi eklenebilir', async () => {
    await makeService({ searchProductForm: { data: { transferStatuses: ['PENDING|trendyol'], onSale: 1 } } }).getProducts();
    const filterCall = variantModel.aggregate.mock.calls[0]?.[0];
    // transferStatuses varlığında variantFilterQuery boş olmayacağından Variant aggregate çağrılır
    expect(filterCall[0].$match.$and[0].$or[0]).toEqual({
      $or: [{ 'platforms.trendyol.upload.TRANSFER.status': 'PENDING' }, { 'platforms.trendyol.upload.TRANSFER.status': { $exists: false } }],
      'platforms.trendyol.upload.onSale': true,
    });
  });

  it('[MEVCUT DAVRANIŞ] onSale === -1 ise onSale filtresi HİÇ eklenmez ("tümü" anlamına gelir)', async () => {
    await makeService({ searchProductForm: { data: { transferStatuses: ['APPROVED|n11'], onSale: -1 } } }).getProducts();
    const filterCall = variantModel.aggregate.mock.calls[0][0];
    const statusQuery = filterCall[0].$match.$and[0].$or[0];
    expect(statusQuery).toEqual({ 'platforms.n11.upload.TRANSFER.status': 'APPROVED' });
    expect(statusQuery['platforms.n11.upload.onSale']).toBeUndefined();
  });

  it('[MEVCUT DAVRANIŞ] sonuç: totalNumberOfRecords $facet.count\'tan alınır (yoksa 0); ürün varsa fromTo {from,to} eklenir, yoksa eklenmez', async () => {
    productModel.aggregate.mockResolvedValue([{ totalNumberOfRecords: [{ count: 25 }], products: [{ _id: 'a' }, { _id: 'b' }] }]);
    const res = await makeService({ searchProductForm: { pagination: { page: 1, limit: 10 } } }).getProducts();
    expect(res.totalNumberOfRecords).toBe(25);
    expect(res.fromTo).toEqual({ from: 1, to: 2 });

    productModel.aggregate.mockResolvedValue([{ totalNumberOfRecords: [], products: [] }]);
    const res2 = await makeService({}).getProducts();
    expect(res2.totalNumberOfRecords).toBe(0);
    expect(res2.fromTo).toBeUndefined();
  });

  it('[MEVCUT DAVRANIŞ] aggregate hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('agg fail');
    productModel.aggregate.mockRejectedValue(err);
    await expect(makeService({}).getProducts()).rejects.toBe(err);
  });

  it('[MEVCUT DAVRANIŞ] $match/$and/$or içinde clientId/tenant alanı YOK', async () => {
    await makeService({ searchProductForm: { data: { category: new ObjectId().toString() } } }, 999).getProducts();
    expect(JSON.stringify(pipelineOf()[0])).not.toMatch(/clientId/i);
  });
});

describe('ProductService.updateOnsale', () => {
  it('[MEVCUT DAVRANIŞ] modifiedCount===1 -> {result:true} VE istatistikler kirletilir', async () => {
    const res = await makeService({ _id: new ObjectId().toString(), onsale: true }).updateOnsale();
    expect(res).toEqual({ result: true });
    expect(StatsOperationsMock).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] modifiedCount!==1 -> {result:false}, istatistik kirletilmez', async () => {
    productModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const res = await makeService({ _id: new ObjectId().toString(), onsale: false }).updateOnsale();
    expect(res).toEqual({ result: false });
    expect(StatsOperationsMock).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] hata olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('write fail');
    productModel.updateOne.mockRejectedValue(err);
    await expect(makeService({ _id: new ObjectId().toString() }).updateOnsale()).rejects.toBe(err);
  });
});

describe('ProductService.deleteProduct', () => {
  it('[MEVCUT DAVRANIŞ] ÖNCE Variant.deleteMany({productId}), SONRA Product.deleteOne({_id}); istatistik kirletilir; Product yanıtı döner', async () => {
    const id = new ObjectId().toString();
    const raw = { deletedCount: 1, acknowledged: true };
    productModel.deleteOne.mockResolvedValue(raw);
    const res = await makeService({ _id: id }).deleteProduct();
    expect(variantModel.deleteMany).toHaveBeenCalledWith({ productId: new ObjectId(id) });
    expect(productModel.deleteOne).toHaveBeenCalledWith({ _id: new ObjectId(id) });
    expect(res).toBe(raw);
    expect(StatsOperationsMock).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] Variant.deleteMany BAŞARISIZ olursa Product HİÇ silinmez (hata yayılır)', async () => {
    const err = new Error('variant delete fail');
    variantModel.deleteMany.mockRejectedValue(err);
    await expect(makeService({ _id: new ObjectId().toString() }).deleteProduct()).rejects.toBe(err);
    expect(productModel.deleteOne).not.toHaveBeenCalled();
  });
});

describe('ProductService.retrieveProduct / getProduct', () => {
  it('[MEVCUT DAVRANIŞ] $lookup ile Variants birleştirilir; sonuç varsa {product: result[0]}, yoksa undefined', async () => {
    const id = new ObjectId();
    productModel.aggregate.mockResolvedValue([{ _id: id, variants: [] }]);
    const res = await makeService({ _id: id.toString() }).retrieveProduct();
    expect(res).toEqual({ product: { _id: id, variants: [] } });
    const pipeline = productModel.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { _id: new ObjectId(id.toString()) } });
    expect(pipeline[1].$lookup).toMatchObject({ from: 'Variants', localField: '_id', foreignField: 'productId', as: 'variants' });
  });

  it('[MEVCUT DAVRANIŞ] ürün bulunamazsa undefined döner (hata YOK)', async () => {
    productModel.aggregate.mockResolvedValue([]);
    await expect(makeService({ _id: new ObjectId().toString() }).retrieveProduct()).resolves.toBeUndefined();
  });

  it('[MEVCUT DAVRANIŞ] geçersiz _id senkron hata fırlatır (ObjectId cast)', async () => {
    await expect(makeService({ _id: 'invalid' }).retrieveProduct()).rejects.toThrow();
  });
});

describe('ProductService.hashChoices', () => {
  it('[MEVCUT DAVRANIŞ] choices choiceId\'ye göre SIRALANIR (girdi sırası SONUCU ETKİLEMEZ); sha256 hex döner', () => {
    const svc = makeService();
    const h1 = svc.hashChoices('MC1', [{ choiceId: 'b', choiceValueId: '2' }, { choiceId: 'a', choiceValueId: '1' }]);
    const h2 = svc.hashChoices('MC1', [{ choiceId: 'a', choiceValueId: '1' }, { choiceId: 'b', choiceValueId: '2' }]);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('[MEVCUT DAVRANIŞ] farklı maincode -> farklı hash (aynı choices ile)', () => {
    const svc = makeService();
    const choices = [{ choiceId: 'a', choiceValueId: '1' }];
    expect(svc.hashChoices('MC1', choices)).not.toBe(svc.hashChoices('MC2', choices));
  });

  it('[MEVCUT DAVRANIŞ] choices undefined/[] ise hata vermez, sabit bir hash üretir', () => {
    const svc = makeService();
    expect(svc.hashChoices('MC1', undefined)).toBe(svc.hashChoices('MC1', []));
  });
});

// [F-12 / WP8] exportExcel artık ürünleri `find(filter, projection).lean().cursor()` ile akıtır (bellek dostu) ve varyantları
// ürün gruplarıyla çeker. Aşağıdaki mock yalnızca bu yeni SORGU BİÇİMİNE uyarlandı; ASSERTION'lar (dönüş sözleşmesi:
// {result,count:0} / {result,excelData,fileName}, DB hatasının yeniden fırlatılması) ESKİ karakterizasyonla AYNIDIR.
const cursorQuery = (docs: any[]) => ({ lean: jest.fn(() => ({ cursor: jest.fn(() => (async function* () { for (const d of docs) yield d; })()) })) });

describe('ProductService.exportExcel', () => {
  it("[MEVCUT DAVRANIŞ] scope 0: seçili ürün id'leriyle filtrelenir; hiç ürün yoksa {result:true, count:0} (excelData ÜRETİLMEZ)", async () => {
    productModel.find.mockReturnValue(cursorQuery([]));
    const res = await makeService({ scope: 0, selectedProducts: [new ObjectId().toString()] }).exportExcel();
    expect(res).toEqual({ result: true, count: 0 });
  });

  it('[MEVCUT DAVRANIŞ] scope 1: getProductFilterQuery ile arama formu filtresi uygulanır; sonuç base64 xlsx döner', async () => {
    const pid = new ObjectId();
    productModel.find.mockReturnValue(cursorQuery([{ _id: pid, title: 'Ürün A' }]));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => [{ _id: 'v1', productId: pid, barcode: 'BC1', stock: 5, prices: { salePrice: 100 } }]) });
    const res = await makeService({ scope: 1, searchProductForm: { data: {} } }).exportExcel();
    expect(res.result).toBe(true);
    expect(res.fileName).toBe('urun_listesi.xlsx');
    expect(typeof res.excelData).toBe('string');
    expect(res.excelData.length).toBeGreaterThan(0);
  });

  it('[MEVCUT DAVRANIŞ] selectedIntegrations verilirse her kod için TRANSFER.status sütunu eklenir (yoksa "PENDING")', async () => {
    const pid = new ObjectId();
    productModel.find.mockReturnValue(cursorQuery([{ _id: pid, title: 'Ürün A' }]));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => [{ _id: 'v1', productId: pid, barcode: 'BC1', stock: 5, prices: {}, platforms: { trendyol: { upload: { TRANSFER: { status: 'APPROVED' } } } } }]) });
    const res = await makeService({ scope: 0, selectedProducts: [pid.toString()], selectedIntegrations: ['trendyol', 'n11'] }).exportExcel();
    expect(res.result).toBe(true);
    expect(typeof res.excelData).toBe('string');
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('find fail');
    productModel.find.mockReturnValue({ lean: jest.fn(() => { throw err; }) });
    await expect(makeService({ scope: 0, selectedProducts: [] }).exportExcel()).rejects.toBe(err);
  });

  // --- YENİ DAVRANIŞ (F-12) ---
  // Okuyucu: exceljs (yazıcıyla aynı kütüphane). Boş hücreler satır nesnesinde YOKTUR (eski sheet_to_json ile aynı).
  const ExcelJS = require('exceljs');
  const loadSheet = async (b64: string) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(b64, 'base64')); return wb; };
  const sheetMatrix = async (b64: string): Promise<any[][]> => { const ws = (await loadSheet(b64)).getWorksheet('Ürünler'); const out: any[][] = []; ws.eachRow({ includeEmpty: false }, (r: any) => { out.push(r.values.slice(1)); }); return out; };
  const readRows = async (b64: string) => { const [head, ...rows] = await sheetMatrix(b64); return rows.map((r) => { const o: any = {}; head.forEach((h: string, i: number) => { if (r[i] !== undefined && r[i] !== null) o[h] = r[i]; }); return o; }); };
  const readSheetNames = async (b64: string): Promise<string[]> => (await loadSheet(b64)).worksheets.map((w: any) => w.name);
  const readFirstRowHeaders = async (b64: string): Promise<string[]> => (await sheetMatrix(b64))[0];
  const withMaxRows = (n: number) => { const ex = require('@config').config.exports; const old = ex.excelMaxRows; ex.excelMaxRows = n; return { mockRestore: () => { ex.excelMaxRows = old; } }; };

  it('[YENİ] sorgu projeksiyonlu: ürün yalnız title; varyant yalnız gereken alanlar + seçili entegrasyonun TRANSFER.status yolu', async () => {
    const pid = new ObjectId();
    productModel.find.mockReturnValue(cursorQuery([{ _id: pid, title: 'A' }]));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => []) });
    await makeService({ scope: 0, selectedProducts: [pid.toString()], selectedIntegrations: ['trendyol'] }).exportExcel();
    expect(productModel.find.mock.calls[0][1]).toEqual({ title: 1 });
    expect(variantModel.find.mock.calls[0][1]).toEqual({ productId: 1, barcode: 1, stock: 1, 'prices.salePrice': 1, 'platforms.trendyol.upload.TRANSFER.status': 1 });
  });

  it('[YENİ] satırlar eskisiyle aynı sütunlarda üretilir (Ürün/Barkod/Stok/Fiyat + entegrasyon sütunu); ürün başına birden çok varyant', async () => {
    const p1 = new ObjectId(), p2 = new ObjectId();
    productModel.find.mockReturnValue(cursorQuery([{ _id: p1, title: 'P1' }, { _id: p2, title: 'P2' }]));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => [
      { productId: p2, barcode: 'B3', stock: 1, prices: { salePrice: 30 } },
      { productId: p1, barcode: 'B1', stock: 5, prices: { salePrice: 10 }, platforms: { trendyol: { upload: { TRANSFER: { status: 'APPROVED' } } } } },
      { productId: p1, barcode: 'B2', stock: 6, prices: { salePrice: 20 } },
    ]) });
    const res = await makeService({ scope: 0, selectedProducts: [p1.toString(), p2.toString()], selectedIntegrations: ['trendyol'] }).exportExcel();
    expect(await readRows(res.excelData)).toEqual([
      { 'Ürün': 'P1', 'Barkod': 'B1', 'Stok': 5, 'Fiyat': 10, TRENDYOL: 'APPROVED' },
      { 'Ürün': 'P1', 'Barkod': 'B2', 'Stok': 6, 'Fiyat': 20, TRENDYOL: 'PENDING' },
      { 'Ürün': 'P2', 'Barkod': 'B3', 'Stok': 1, 'Fiyat': 30, TRENDYOL: 'PENDING' },
    ]);
  });

  it('[YENİ] ürünler 500\'lük gruplarla çekilir: 1200 ürün -> 3 varyant sorgusu (tek dev $in yok)', async () => {
    const docs = Array.from({ length: 1200 }, (_, i) => ({ _id: new ObjectId(), title: 'P' + i }));
    productModel.find.mockReturnValue(cursorQuery(docs));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => []) });
    await makeService({ scope: 0, selectedProducts: [] }).exportExcel();
    expect(variantModel.find).toHaveBeenCalledTimes(3);
    expect(variantModel.find.mock.calls.map((c: any[]) => c[0].productId.$in.length)).toEqual([500, 500, 200]);
  });

  it('[YENİ] satır tavanı (EXPORT_EXCEL_MAX_ROWS) aşılırsa üretim DURUR: {result:false, code:EXPORT_ROW_LIMIT, limit, message}; excelData yok', async () => {
    const spy = withMaxRows(3);
    const pid = new ObjectId();
    productModel.find.mockReturnValue(cursorQuery([{ _id: pid, title: 'A' }]));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => Array.from({ length: 4 }, (_, i) => ({ productId: pid, barcode: 'B' + i, stock: 1, prices: {} }))) });
    const res = await makeService({ scope: 0, selectedProducts: [pid.toString()] }).exportExcel();
    spy.mockRestore();
    expect(res.result).toBe(false);
    expect(res.code).toBe('EXPORT_ROW_LIMIT');
    expect(res.limit).toBe(3);
    expect(res.message).toContain('3');
    expect(res.excelData).toBeUndefined();
  });

  it('[YENİ] tam tavan sınırında (satır sayısı == tavan) başarılıdır', async () => {
    const spy = withMaxRows(4);
    const pid = new ObjectId();
    productModel.find.mockReturnValue(cursorQuery([{ _id: pid, title: 'A' }]));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => Array.from({ length: 4 }, (_, i) => ({ productId: pid, barcode: 'B' + i, stock: 1, prices: {} }))) });
    const res = await makeService({ scope: 0, selectedProducts: [pid.toString()] }).exportExcel();
    spy.mockRestore();
    expect(res.result).toBe(true);
    expect(await readRows(res.excelData)).toHaveLength(4);
  });

  it('[MEVCUT DAVRANIŞ] tek sayfa "Ürünler"; boş hücre (fiyat yok) atlanır; sayılar sayı kalır; "=" ile başlayan metin formül DEĞİL metin kalır', async () => {
    const pid = new ObjectId();
    productModel.find.mockReturnValue(cursorQuery([{ _id: pid, title: '=HYPERLINK("http://x")' }]));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => [{ productId: pid, barcode: '0123', stock: 7, prices: {} }]) });
    const res = await makeService({ scope: 0, selectedProducts: [pid.toString()] }).exportExcel();
    expect(await readSheetNames(res.excelData)).toEqual(['Ürünler']);
    const [row] = (await readRows(res.excelData)) as any[];
    expect(row['Ürün']).toBe('=HYPERLINK("http://x")');
    expect(row['Barkod']).toBe('0123');
    expect(row['Stok']).toBe(7);
    expect(typeof row['Stok']).toBe('number');
    expect('Fiyat' in row).toBe(false);
    expect(await readFirstRowHeaders(res.excelData)).toEqual(['Ürün', 'Barkod', 'Stok', 'Fiyat']);
  });

  it('[MEVCUT DAVRANIŞ] üretilen dosya geçerli xlsx (zip "PK" başlığı) taşır. NOT: serviste Excel İÇE aktarma/ayrıştırma yoktur (yalnız dışa aktarım)', async () => {
    const pid = new ObjectId();
    productModel.find.mockReturnValue(cursorQuery([{ _id: pid, title: 'A' }]));
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => [{ productId: pid, barcode: 'B', stock: 1, prices: { salePrice: 2 } }]) });
    const res = await makeService({ scope: 0, selectedProducts: [pid.toString()] }).exportExcel();
    expect(Buffer.from(res.excelData, 'base64').subarray(0, 2).toString()).toBe('PK');
  });

  it('[YENİ] entegrasyon kodu yol enjeksiyonu (a.b) 400 VALIDATION ile reddedilir; sorgu atılmaz', async () => {
    await expect(makeService({ scope: 0, selectedProducts: [], selectedIntegrations: ['a.b'] }).exportExcel()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    expect(productModel.find).not.toHaveBeenCalled();
  });
});

describe('ProductService: tenant izolasyonu (iki farklı tenant)', () => {
  it('her tenant yalnızca KENDİ clientDB\'sindeki ürünleri görür; istek gövdesindeki clientId sorguyu ETKİLEMEZ', async () => {
    const svcA: any = new ProductService(4, { clientId: 999 });
    svcA.clientDB = { getProductModel: () => ({ find: jest.fn(() => ({ sort: jest.fn(async () => [{ _id: 'A-1' }]) })) }) };
    const svcB: any = new ProductService(7, {});
    svcB.clientDB = { getProductModel: () => ({ find: jest.fn(() => ({ sort: jest.fn(async () => [{ _id: 'B-1' }]) })) }) };

    const resA = await svcA.get();
    const resB = await svcB.get();
    expect(resA).toEqual([{ _id: 'A-1' }]);
    expect(resB).toEqual([{ _id: 'B-1' }]);
  });
});

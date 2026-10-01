/**
 * CHARACTERIZATION: VariantService (backend/src/api/rpc/handlers/variant-service.ts)
 *
 * Kapsam: get, getVariants, getIntegrations, getChoices, constructMatchQuery, constructUpdateQuery,
 * batchProcessUpdate, batchProcessDelete, generateVariantId, addVariant, updateProductStock,
 * updateProductPrices, updateVariants, updateVariant, generateCombinations1, prepareCandidateArray,
 * addVariants, deleteVariant. DB/Redis/ağ YOK; `clientDB`/`applicationDB` sahte model nesneleridir
 * (ADR-0016 B-R-T1). Kod başlangıçta DEĞİŞTİRİLMEDİ (yalnızca mevcut davranış sabitlendi).
 *
 * [DÜZELTME, 2026-09-29, orkestratör] Bu characterization'ın ortaya çıkardığı `getIntegrations()`
 * `.populate('type')` eksikliği (ProductService.getIntegrations ile tutarsızlık; min/max fiyat
 * filtresinde gerçek Mongo'da "$or boş dizi olamaz" hatasına yol açıyordu) DÜZELTİLDİ — tek satırlık,
 * ProductService'in ÇALIŞAN implementasyonuyla birebir eşleşen, düşük riskli bir düzeltme. İlgili
 * testler (getIntegrations, constructMatchQuery min/max, constructUpdateQuery entegrasyon override'ı)
 * kasıtlı ters çevrildi (bkz. [DÜZELTİLDİ] etiketli testler). Aşağıdaki İKİ FARKLI veri modeli bulgusu
 * ve diğer BACKLOG maddeleri (silent catch, Infinity sızıntısı, $push $each eksikliği) HALA AÇIK,
 * insan/ayrı görev kararı gerektiriyor — bu düzeltmenin kapsamı DIŞINDA.
 *
 * [DB-07 / DBR-09, 2026-09-30, KASITLI DAVRANIŞ DEĞİŞİKLİĞİ] Aşağıdaki "İKİ FARKLI veri modeli" bulgusu KAPATILDI: getVariants/
 * addVariant/addVariants/updateVariants/batchProcessUpdate/batchProcessDelete artık kanonik `Variants` koleksiyonuna
 * (getVariantModel) gider; gömülü Product.variants yolu kaldırıldı; `getVariantsList` eklendi. Bu dosyadaki ilgili testler
 * yeni sözleşmeye göre tersine çevrildi (yakalanan hatalar: dizi-içinde-dizi $push, sessiz catch, prices ezme).
 *
 * (ESKİ) ÖNEMLİ BULGU: bu dosyadaki yazma metotları İKİ FARKLI veri
 * modeli karıştırıyor: `addVariant`/`updateVariant`/`updateVariants`/`batchProcessUpdate`/
 * `batchProcessDelete`/`addVariants` `Product.variants` GÖMÜLÜ dizisini günceller (`getProductModel()`
 * + `'variants.$[...]'`), ama `deleteVariant`/`updateProductStock`/`updateProductPrices`/
 * `ProductService`'in TAMAMI ayrı üst düzey `Variants` koleksiyonunu (`getVariantModel()`) kullanır
 * (ADR-0004/N6 mimarisi). Bu iki model AYNI ANDA doğru olamaz — ya bu servisin yazma metotları artık
 * ÖLÜ KOD (yeni akış tamamen `product-service.ts` üzerinden yürüyor), ya da gerçek bir veri bütünlüğü
 * hatası var (bu servisten yapılan bir ekleme/güncelleme, `Variants` koleksiyonundaki kanonik veriye
 * HİÇ yansımaz). Ayrı bir insan kararı/görev gerekir; kod DEĞİŞTİRİLMEDİ.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

jest.mock('@operations/reports/StatsOperations');

import VariantService from '@api/rpc/handlers/variant-service';
import { StatsOperations } from '@operations/reports/StatsOperations';

const StatsOperationsMock = StatsOperations as unknown as jest.Mock<any>;

let productModel: any;
let variantModel: any;
let choiceModel: any;
let integrationModel: any;
let markDirtyFn: jest.Mock<any>;

function makeService(request: any = {}, clientId: any = 42) {
  const svc: any = new VariantService(clientId, request);
  svc.clientDB = {
    getProductModel: () => productModel,
    getVariantModel: () => variantModel,
    getChoiceModel: () => choiceModel,
  };
  svc.applicationDB = { getIntegrationModel: () => integrationModel };
  return svc;
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  productModel = {
    findOne: jest.fn(() => ({ select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => undefined) })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    bulkWrite: jest.fn(async () => ({ modifiedCount: 1 })),
  };
  variantModel = {
    aggregate: jest.fn(async () => []),
    find: jest.fn(() => ({ lean: jest.fn(async () => []) })),
    deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
  };
  choiceModel = { find: jest.fn(async () => []) };
  // [DÜZELTİLDİ, 2026-09-29] populate('type') artık ProductService.getIntegrations ile TUTARLI şekilde çağrılıyor;
  // `type` alanı populate edilmiş nesne olarak döner, `.code` okunabilir, marketplace/ecommerce filtreleri çalışır.
  integrationModel = { find: jest.fn(() => ({ populate: jest.fn(async () => [{ code: 'trendyol', type: { code: 'marketplace' } }, { code: 'n11', type: { code: 'marketplace' } }]) })) };
  markDirtyFn = jest.fn(async () => undefined);
  StatsOperationsMock.mockReset();
  StatsOperationsMock.mockImplementation(() => ({ markStatsAsDirty: markDirtyFn }));
});

afterEach(() => { jest.restoreAllMocks(); });

describe('VariantService.get (IService no-op)', () => {
  it('[MEVCUT DAVRANIŞ] her zaman undefined döner', async () => {
    await expect(makeService().get()).resolves.toBeUndefined();
  });
});

describe('VariantService.getVariants / getVariantsList [DB-07: Variants KOLEKSİYONU]', () => {
  it('getVariants: Variants.find({productId: ObjectId(_id)}).lean() varyant dizisini döner (gömülü Product.variants OKUNMAZ)', async () => {
    const pid = new ObjectId();
    const lean = jest.fn(async () => [{ _id: 'v1' }]);
    variantModel.find = jest.fn(() => ({ lean }));
    const res = await makeService({ _id: String(pid) }).getVariants();
    expect(variantModel.find).toHaveBeenCalledWith({ productId: pid });
    expect(productModel.findOne).not.toHaveBeenCalled();
    expect(res).toEqual([{ _id: 'v1' }]);
  });

  it('getVariants: _id yoksa undefined; DB hatası olduğu gibi yeniden fırlatılır', async () => {
    await expect(makeService({}).getVariants()).resolves.toBeUndefined();
    const err = new Error('db fail');
    variantModel.find = jest.fn(() => ({ lean: jest.fn(async () => { throw err; }) }));
    await expect(makeService({ _id: String(new ObjectId()) }).getVariants()).rejects.toBe(err);
  });

  it('getVariantsList (FE 5 bileşen): { variants: [{_id,title,...}] }; title yoksa stockcode, o da yoksa _id', async () => {
    const pid = new ObjectId();
    const a = new ObjectId();
    const b = new ObjectId();
    variantModel.find = jest.fn(() => ({ lean: jest.fn(async () => [{ _id: a, stockcode: 'SC1', choices: [] }, { _id: b, title: 'T2' }]) }));
    const res = await makeService({ _id: String(pid) }).getVariantsList();
    expect((variantModel.find as any).mock.calls[0][0]).toEqual({ productId: pid });
    expect(res.variants.map((v: any) => [v._id, v.title])).toEqual([[a, 'SC1'], [b, 'T2']]);
    await expect(makeService({}).getVariantsList()).resolves.toEqual({ variants: [] });
  });
});

describe('VariantService.getIntegrations', () => {
  it('[DÜZELTİLDİ, 2026-09-29] applicationDB.getIntegrationModel().find({}, {settings:0}).populate("type") çağrılır (ProductService.getIntegrations ile TUTARLI; find() ikinci argümanı DOĞRUDAN projeksiyon nesnesi — eskiden {projection:{...}} ile yanlış sarmalanmıştı, bkz. tests/mongo-semantics/integrationProjectionShape.mongoSemantics.test.ts)', async () => {
    const res = await makeService().getIntegrations();
    expect(integrationModel.find).toHaveBeenCalledWith({}, { settings: 0 });
    expect(res).toEqual([{ code: 'trendyol', type: { code: 'marketplace' } }, { code: 'n11', type: { code: 'marketplace' } }]);
  });
});

describe('VariantService.getChoices: bellek-içi önbellekleme', () => {
  it('[MEVCUT DAVRANIŞ] ilk çağrı DB\'den okur ve this.choices\'e YAZAR; İKİNCİ çağrı find\'i TEKRAR ÇAĞIRMAZ (aynı örnek üzerinde)', async () => {
    choiceModel.find.mockResolvedValue([{ _id: 'c1', title: 'Renk' }]);
    const svc = makeService();
    const r1 = await svc.getChoices();
    const r2 = await svc.getChoices();
    expect(choiceModel.find).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
    expect(r1).toEqual([{ _id: 'c1', title: 'Renk' }]);
  });

  it('[MEVCUT DAVRANIŞ] boş dizi [] de "önbellekte" sayılır: ikinci çağrı yine DB\'ye gitmez ([] !== undefined)', async () => {
    choiceModel.find.mockResolvedValue([]);
    const svc = makeService();
    await svc.getChoices();
    await svc.getChoices();
    expect(choiceModel.find).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ - BULGU] DB null dönerse önbellekleme ÇALIŞMAZ: `this.choices == undefined` gevşek karşılaştırması null\'ı da yakalar, her çağrı yeniden sorgular', async () => {
    // BACKLOG: şüpheli - `==` (gevşek) kullanımı; `null == undefined` true olduğundan, choices null'a düşerse
    // (find() gerçekte hemen hiç null dönmez ama tip olarak mümkündür) önbellek HİÇBİR ZAMAN devreye girmez.
    choiceModel.find.mockResolvedValue(null as any);
    const svc = makeService();
    await svc.getChoices();
    await svc.getChoices();
    expect(choiceModel.find).toHaveBeenCalledTimes(2);
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi yeniden fırlatılır, choices ayarlanmaz', async () => {
    const err = new Error('choice db fail');
    choiceModel.find.mockRejectedValue(err);
    await expect(makeService().getChoices()).rejects.toBe(err);
  });
});

describe('VariantService.constructUpdateQuery [DB-07: Variants belgesi nokta yolları]', () => {
  it('batchProcessForm undefined -> {} (çökmez)', async () => {
    await expect(makeService().constructUpdateQuery(1, undefined)).resolves.toEqual({});
  });

  it('`.prices` yoksa artık TypeError DEĞİL: yalnız stock/shelf yolları döner', async () => {
    await expect(makeService().constructUpdateQuery(1, { stock: 5 })).resolves.toEqual({ stock: 5 });
  });

  it('scope yol biçimini etkilemez; tanımlı alanlar tek tek nokta yoluyla yazılır (prices nesnesi ezilmez)', async () => {
    const form = { stock: 7, shelf: 'B2', prices: { marketPrice: 10, salePrice: 12, isPlatformBasedPrice: false } };
    const expected = { stock: 7, shelf: 'B2', 'prices.marketPrice': 10, 'prices.salePrice': 12, 'prices.isPlatformBasedPrice': false };
    expect(await makeService().constructUpdateQuery(1, form)).toEqual(expected);
    expect(await makeService().constructUpdateQuery(2, form)).toEqual(expected);
  });

  it('kanal fiyat override\'ı platforms.<kod>.prices altına yazılır; tanımsız alanlar atlanır', async () => {
    const res = await makeService().constructUpdateQuery(1, { prices: { marketPrice: 5, salePrice: 6, isPlatformBasedPrice: false, trendyol: { marketPrice: 999, salePrice: 888 }, n11: { salePrice: 7 } } });
    expect(res.stock).toBeUndefined();
    expect(res).toEqual({
      'prices.marketPrice': 5, 'prices.salePrice': 6, 'prices.isPlatformBasedPrice': false,
      'platforms.trendyol.prices.marketPrice': 999, 'platforms.trendyol.prices.salePrice': 888,
      'platforms.n11.prices.salePrice': 7,
    });
  });
});

describe('VariantService.batchProcessUpdate [DB-07: Variants.updateMany]', () => {
  const pid = new ObjectId();
  const v1 = new ObjectId();
  const v2 = new ObjectId();
  beforeEach(() => { variantModel.updateMany = jest.fn(async () => ({ modifiedCount: 2 })); });

  it('scope 0/1: filtre {productId, _id:{$in:[seçili]}}; stok değişiyorsa stockDirty işaretlenir; sonra stok/fiyat/istatistik güncellenir', async () => {
    const res = await makeService({ productId: String(pid), scope: 0, selectedVariants: [String(v1), String(v2)], batchProcessForm: { stock: 5, prices: { marketPrice: 1 } } }).batchProcessUpdate();
    const [filter, upd] = variantModel.updateMany.mock.calls[0];
    expect(filter).toEqual({ productId: pid, _id: { $in: [v1, v2] } });
    expect(upd.$set).toMatchObject({ stock: 5, 'prices.marketPrice': 1, stockDirty: true });
    expect(upd.$set.stockDirtyAt).toBeInstanceOf(Date);
    expect(productModel.updateOne).toHaveBeenCalled();
    expect(markDirtyFn).toHaveBeenCalled();
    expect(productModel.findOne).not.toHaveBeenCalled();
    expect(res).toEqual({ modifiedCount: 2 });
  });

  it('scope 2: filtre yalnız productId; stok yoksa stockDirty EKLENMEZ', async () => {
    await makeService({ productId: String(pid), scope: 2, batchProcessForm: { shelf: 'A1' } }).batchProcessUpdate();
    const [filter, upd] = variantModel.updateMany.mock.calls[0];
    expect(filter).toEqual({ productId: pid });
    expect(upd).toEqual({ $set: { shelf: 'A1' } });
  });

  it('güncellenecek alan yoksa yazma yapılmaz (modifiedCount 0)', async () => {
    const res = await makeService({ productId: String(pid), scope: 2, batchProcessForm: {} }).batchProcessUpdate();
    expect(variantModel.updateMany).not.toHaveBeenCalled();
    expect(res.modifiedCount).toBe(0);
  });

  it('hata olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('boom');
    variantModel.updateMany.mockRejectedValue(err);
    await expect(makeService({ productId: String(pid), scope: 2, batchProcessForm: { shelf: 'x' } }).batchProcessUpdate()).rejects.toBe(err);
  });
});

describe('VariantService.batchProcessDelete [DB-07: Variants.deleteMany]', () => {
  const pid = new ObjectId();
  const v1 = new ObjectId();
  beforeEach(() => { variantModel.deleteMany = jest.fn(async () => ({ deletedCount: 3 })); });

  it('scope 0/1: yalnız seçili varyantlar silinir; FE için modifiedCount = deletedCount', async () => {
    const res = await makeService({ productId: String(pid), scope: 1, selectedVariants: [String(v1)] }).batchProcessDelete();
    expect(variantModel.deleteMany).toHaveBeenCalledWith({ productId: pid, _id: { $in: [v1] } });
    expect(res).toEqual({ deletedCount: 3, modifiedCount: 3 });
    expect(markDirtyFn).toHaveBeenCalled();
  });

  it('scope 2: ürünün TÜM varyantları silinir (yalnız productId filtresi)', async () => {
    await makeService({ productId: String(pid), scope: 2 }).batchProcessDelete();
    expect(variantModel.deleteMany).toHaveBeenCalledWith({ productId: pid });
  });

  it('hata olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('boom');
    variantModel.deleteMany.mockRejectedValue(err);
    await expect(makeService({ productId: String(pid), scope: 2 }).batchProcessDelete()).rejects.toBe(err);
  });
});

describe('VariantService.addVariant [DB-07: Variants koleksiyonu]', () => {
  const pid = new ObjectId();
  beforeEach(() => {
    productModel.findOne = jest.fn(() => ({ select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => ({ maincode: 'MC1' })) }));
    variantModel.create = jest.fn(async (d: any) => ({ _id: new ObjectId(), ...d }));
  });

  it('Variants.create: _id ve motor-sahipli alanlar atılır, productId + variantHash yazılır, Product.variants\'e DOKUNULMAZ; başarıda istatistik kirletilir', async () => {
    const res = await makeService({ productId: String(pid), variant: { _id: 'x', stockcode: 'S1', stock: 4, reserved: 99, stockDirty: true, choices: [{ choiceId: 'c', choiceValueId: 'v' }] } }).addVariant();
    const doc = variantModel.create.mock.calls[0][0];
    expect(doc._id).toBeUndefined();
    expect(doc.reserved).toBeUndefined();
    expect(doc.stockDirty).toBeUndefined();
    expect(doc.productId).toEqual(pid);
    expect(doc.variantHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.modifiedCount).toBe(1);
    expect(productModel.updateOne).not.toHaveBeenCalledWith(expect.anything(), { $push: expect.anything() });
    expect(markDirtyFn).toHaveBeenCalled();
  });

  it('ürün yoksa yazma yapılmaz (modifiedCount 0)', async () => {
    productModel.findOne = jest.fn(() => ({ select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => null) }));
    const res = await makeService({ productId: String(pid), variant: { stockcode: 'S1' } }).addVariant();
    expect(variantModel.create).not.toHaveBeenCalled();
    expect(res.modifiedCount).toBe(0);
  });

  it('yinelenen variantHash/stockcode (E11000) yutulmaz: modifiedCount 0 + error:DUPLICATE_VARIANT; diğer hatalar fırlatılır', async () => {
    variantModel.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const res = await makeService({ productId: String(pid), variant: { stockcode: 'S1' } }).addVariant();
    expect(res).toEqual({ acknowledged: false, modifiedCount: 0, error: 'DUPLICATE_VARIANT' });
    const err = new Error('other');
    variantModel.create.mockRejectedValue(err);
    await expect(makeService({ productId: String(pid), variant: { stockcode: 'S1' } }).addVariant()).rejects.toBe(err);
  });
});

describe('VariantService.updateProductStock [Variants KOLEKSİYONU — deleteVariant ile TUTARLI, addVariant ile TUTARSIZ]', () => {
  it('[MEVCUT DAVRANIŞ] variantModel.aggregate ile toplam stok hesaplanıp Product.stock $set edilir', async () => {
    const productId = new ObjectId();
    variantModel.aggregate.mockResolvedValue([{ totalStock: 42 }]);
    const res = await makeService().updateProductStock(productId);
    expect(variantModel.aggregate).toHaveBeenCalledWith([
      { $match: { productId } },
      { $group: { _id: null, totalStock: { $sum: '$stock' } } },
    ]);
    expect(productModel.updateOne).toHaveBeenCalledWith({ _id: productId }, { $set: { stock: 42 } });
    expect(res).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ] aggregate boş dizi dönerse totalStock 0 yazılır', async () => {
    variantModel.aggregate.mockResolvedValue([]);
    await makeService().updateProductStock(new ObjectId());
    expect(productModel.updateOne.mock.calls[0][1]).toEqual({ $set: { stock: 0 } });
  });

  it('[MEVCUT DAVRANIŞ] hata olduğu gibi yeniden fırlatılır (SWALLOW YOK)', async () => {
    const err = new Error('agg fail');
    variantModel.aggregate.mockRejectedValue(err);
    await expect(makeService().updateProductStock(new ObjectId())).rejects.toBe(err);
  });
});

describe('VariantService.updateProductPrices [BULGU: Infinity sızıntısı]', () => {
  it('[MEVCUT DAVRANIŞ] hiç varyant yoksa {minSalePrice:0,maxSalePrice:0} (erken çıkış, buggy ternary\'e gelinmez)', async () => {
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => []) });
    const productId = new ObjectId();
    const res = await makeService().updateProductPrices(productId);
    expect(productModel.updateOne).toHaveBeenCalledWith({ _id: productId }, { $set: { prices: { minSalePrice: 0, maxSalePrice: 0 } } });
    expect(res).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ] isPlatformBasedPrice===false: sabit fiyat doğrudan min/max olur', async () => {
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => [{ prices: { isPlatformBasedPrice: false, salePrice: 25 } }]) });
    await makeService().updateProductPrices(new ObjectId());
    expect(productModel.updateOne.mock.calls[0][1]).toEqual({ $set: { prices: { minSalePrice: 25, maxSalePrice: 25 } } });
  });

  it('[MEVCUT DAVRANIŞ] isPlatformBasedPrice=true: platforms üzerinden min/max hesaplanır (isPlatformBasedPrice yoksa DA bu dala girer)', async () => {
    variantModel.find.mockReturnValue({
      lean: jest.fn(async () => [
        { prices: { isPlatformBasedPrice: true }, platforms: { trendyol: { prices: { salePrice: 30 } }, n11: { prices: { salePrice: 20 } } } },
      ]),
    });
    await makeService().updateProductPrices(new ObjectId());
    expect(productModel.updateOne.mock.calls[0][1]).toEqual({ $set: { prices: { minSalePrice: 20, maxSalePrice: 30 } } });
  });

  it('[MEVCUT DAVRANIŞ - BULGU] isPlatformBasedPrice=true/undefined AMA `platforms` alanı YOKSA TypeError fırlatır (Object.values(undefined))', async () => {
    // BACKLOG: şüpheli - "sabit fiyat" (isPlatformBasedPrice===false) dışındaki HER varyantın `platforms` alanına
    // sahip olduğu varsayılıyor; olmayan/eksik `platforms` çöküşe yol açar.
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => [{ prices: { salePrice: 10 } }]) }); // isPlatformBasedPrice YOK, platforms YOK
    await expect(makeService().updateProductPrices(new ObjectId())).rejects.toThrow(TypeError);
  });

  it('[MEVCUT DAVRANIŞ - BULGU] "Infinity sızıntısı": minSalePrice hesabı Infinity\'de kalırsa SONUÇTA Infinity olarak YAZILIR (ternary sonucu hiçbir yere ATANMAMIŞ ölü kod; product-service.ts\'in AKSİNE düzeltilmemiş)', async () => {
    // BACKLOG: kritik olabilir - `minSalePrice === Infinity ? 0 : minSalePrice` satırı bir STATEMENT olarak
    // yazılmış ama sonucu HİÇBİR DEĞİŞKENE atanmamış (dead code); bu yüzden minSalePrice bulunamadığında
    // (salePrice tanımsız/NaN) Product.prices.minSalePrice alanına gerçekten `Infinity` yazılır (JSON'da `null`
    // olur, karşılaştırma sorgularını bozabilir). `ProductService.updateProductStockAndPrices` AYNI riski satır
    // içinde (`minPrice === Infinity ? 0 : minPrice`) DOĞRU ele alıyor — iki servis arasında TUTARSIZLIK var.
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => [{ prices: { isPlatformBasedPrice: false, salePrice: undefined } }]) });
    await makeService().updateProductPrices(new ObjectId());
    const written = productModel.updateOne.mock.calls[0][1].$set.prices;
    expect(written.minSalePrice).toBe(Infinity);
    expect(written.maxSalePrice).toBe(0);
  });

  it('[MEVCUT DAVRANIŞ] hata olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('find fail');
    variantModel.find.mockReturnValue({ lean: jest.fn(async () => { throw err; }) });
    await expect(makeService().updateProductPrices(new ObjectId())).rejects.toBe(err);
  });
});

describe('VariantService.updateVariants [DB-07: Variants.bulkWrite]', () => {
  const pid = new ObjectId();
  const v1 = new ObjectId();
  beforeEach(() => {
    productModel.findOne = jest.fn(() => ({ select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => ({ maincode: 'MC1' })) }));
    variantModel.bulkWrite = jest.fn(async () => ({ modifiedCount: 1 }));
    variantModel.find = jest.fn(() => ({ lean: jest.fn(async () => [{ _id: v1, stock: 1, platforms: {}, prices: { isPlatformBasedPrice: false, salePrice: 1 } }]) }));
  });

  it('her varyant için {_id, productId} filtreli updateOne; _id/productId/motor alanları $set\'ten atılır; stoğu değişen stockDirty alır', async () => {
    const res = await makeService({ productId: String(pid), variants: [{ _id: String(v1), stock: 9, reserved: 5, stockcode: 'S1', choices: [{ choiceId: 'c', choiceValueId: 'v' }] }] }).updateVariants();
    const ops = variantModel.bulkWrite.mock.calls[0][0];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter).toEqual({ _id: v1, productId: pid });
    const set = ops[0].updateOne.update.$set;
    expect(set._id).toBeUndefined();
    expect(set.reserved).toBeUndefined();
    expect(set.stockcode).toBe('S1');
    expect(set.stockDirty).toBe(true);
    expect(set.variantHash).toMatch(/^[0-9a-f]{64}$/);
    expect(productModel.bulkWrite).not.toHaveBeenCalled();
    expect(res).toEqual({ modifiedCount: 1 });
    expect(markDirtyFn).toHaveBeenCalled();
  });

  it('stoğu değişmeyen varyant stockDirty almaz', async () => {
    await makeService({ productId: String(pid), variants: [{ _id: String(v1), stock: 1, stockcode: 'S1' }] }).updateVariants();
    expect(variantModel.bulkWrite.mock.calls[0][0][0].updateOne.update.$set.stockDirty).toBeUndefined();
  });

  it('hata olduğu gibi yeniden fırlatılır (bulkWrite hatası SWALLOW EDİLMEZ)', async () => {
    const err = new Error('bulk fail');
    variantModel.bulkWrite.mockRejectedValue(err);
    await expect(makeService({ productId: String(pid), variants: [{ _id: String(v1), stock: 1 }] }).updateVariants()).rejects.toBe(err);
  });
});

describe('VariantService.generateCombinations1: kartezyen çarpım üretici', () => {
  it('[MEVCUT DAVRANIŞ] {renk:[a,b], beden:[S]} -> 2 kombinasyon üretir (anahtar sırasına göre)', () => {
    const svc = makeService();
    const res = svc.generateCombinations1({ renk: ['kırmızı', 'mavi'], beden: ['S'] });
    expect(res).toEqual([{ renk: 'kırmızı', beden: 'S' }, { renk: 'mavi', beden: 'S' }]);
  });

  it('[MEVCUT DAVRANIŞ] boş nesne -> tek boş kombinasyon [{}] döner (kartezyen çarpımın nötr elemanı)', () => {
    expect(makeService().generateCombinations1({})).toEqual([{}]);
  });

  it('[MEVCUT DAVRANIŞ] bir anahtarın dizisi boşsa TOPLAM sonuç boş olur (kartezyen çarpım kuralı)', () => {
    expect(makeService().generateCombinations1({ renk: [], beden: ['S'] })).toEqual([]);
  });
});

describe('VariantService.prepareCandidateArray [BULGU: DB sorgusu kurulur ama HİÇ ÇALIŞTIRILMAZ]', () => {
  it('[MEVCUT DAVRANIŞ] request.variantChoices AYNEN (hiç filtrelenmeden) döner; hiçbir DB çağrısı yapılmaz', async () => {
    // BACKLOG: şüpheli - `match` Mongo sorgusu inşa ediliyor ama HİÇBİR YERDE kullanılmıyor (`flag` her zaman
    // false, hiç true yapılmıyor); bu metot fiilen "zaten var olan varyant kombinasyonlarını ele" amacını
    // gerçekleştirmiyor, girdiyi olduğu gibi geri veriyor (ölü/eksik kalmış bir kod parçası izlenimi veriyor).
    const variantChoices = [[{ choiceId: 'c1', choiceValueId: 'v1' }], [{ choiceId: 'c1', choiceValueId: 'v2' }]];
    const res = await makeService({ variantChoices }).prepareCandidateArray('PROD-1');
    expect(res).toEqual(variantChoices);
    expect(productModel.findOne).not.toHaveBeenCalled();
    expect(variantModel.find).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] variantChoices boşsa [] döner', async () => {
    await expect(makeService({ variantChoices: [] }).prepareCandidateArray('PROD-1')).resolves.toEqual([]);
  });
});

describe('VariantService.addVariants [DB-07: Variants.insertMany, her aday AYRI belge]', () => {
  const pid = new ObjectId();
  const choicesReq = [[{ choiceId: 'c', choiceValueId: 'a' }], [{ choiceId: 'c', choiceValueId: 'b' }]];
  beforeEach(() => {
    productModel.findOne = jest.fn(() => ({ select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => ({ maincode: 'MC1' })) }));
    variantModel.insertMany = jest.fn(async (docs: any[]) => docs);
  });

  it('$push dizi-içinde-dizi hatası giderildi: her aday productId + benzersiz variantHash ile ayrı belge olarak eklenir; FE için modifiedCount=1', async () => {
    const res = await makeService({ productId: String(pid), variantChoices: choicesReq, singleVariant: { prices: { salePrice: 1 } } }).addVariants();
    const docs = variantModel.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(2);
    expect(docs.every((d: any) => String(d.productId) === String(pid))).toBe(true);
    expect(new Set(docs.map((d: any) => d.variantHash)).size).toBe(2);
    expect(docs[0].stock).toBe(0);
    expect(res).toMatchObject({ insertedCount: 2, modifiedCount: 1 });
    expect(markDirtyFn).toHaveBeenCalled();
  });

  it('singleVariant.choices SİLİNİR (request mutasyonu); isPlatformBasedPrice falsy ise false\'a zorlanır; singleVariant spread varsayılanları ezebilir', async () => {
    const singleVariant: any = { choices: ['x'], stockcode: 'OVR', prices: {} };
    await makeService({ productId: String(pid), variantChoices: [choicesReq[0]], singleVariant }).addVariants();
    expect(singleVariant.choices).toBeUndefined();
    expect(singleVariant.prices.isPlatformBasedPrice).toBe(false);
    expect(variantModel.insertMany.mock.calls[0][0][0].stockcode).toBe('OVR');
  });

  it('ürün yoksa yazma yok; E11000 yutulmaz (DUPLICATE_VARIANT), diğer hatalar fırlatılır', async () => {
    productModel.findOne = jest.fn(() => ({ select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => null) }));
    expect((await makeService({ productId: String(pid), variantChoices: choicesReq, singleVariant: { prices: {} } }).addVariants()).modifiedCount).toBe(0);
    expect(variantModel.insertMany).not.toHaveBeenCalled();

    productModel.findOne = jest.fn(() => ({ select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => ({ maincode: 'MC1' })) }));
    variantModel.insertMany.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await makeService({ productId: String(pid), variantChoices: choicesReq, singleVariant: { prices: {} } }).addVariants())
      .toEqual({ acknowledged: false, modifiedCount: 0, error: 'DUPLICATE_VARIANT' });
    const err = new Error('other');
    variantModel.insertMany.mockRejectedValue(err);
    await expect(makeService({ productId: String(pid), variantChoices: choicesReq, singleVariant: { prices: {} } }).addVariants()).rejects.toBe(err);
  });
});

describe('VariantService.deleteVariant [Variants KOLEKSİYONU — addVariant/updateVariant ile TUTARSIZ]', () => {
  it('[MEVCUT DAVRANIŞ] variantModel.deleteOne({_id:variantId}); deletedCount>0 ise istatistik kirletilir', async () => {
    const variantId = new ObjectId();
    const res = await makeService({ variantId }).deleteVariant();
    expect(variantModel.deleteOne).toHaveBeenCalledWith({ _id: variantId });
    expect(markDirtyFn).toHaveBeenCalled();
    expect(res).toEqual({ deletedCount: 1 });
  });

  it('[MEVCUT DAVRANIŞ] deletedCount 0 ise istatistik kirletilmez', async () => {
    variantModel.deleteOne.mockResolvedValue({ deletedCount: 0 });
    await makeService({ variantId: new ObjectId() }).deleteVariant();
    expect(markDirtyFn).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] hata olduğu gibi yeniden fırlatılır (SWALLOW YOK — addVariant/updateVariant\'ın AKSİNE)', async () => {
    const err = new Error('delete fail');
    variantModel.deleteOne.mockRejectedValue(err);
    await expect(makeService({ variantId: new ObjectId() }).deleteVariant()).rejects.toBe(err);
  });
});

describe('VariantService: tenant izolasyonu (iki farklı tenant)', () => {
  it('her tenant yalnızca KENDİ clientDB\'sindeki Variants koleksiyonuna yazar; hiçbir sorguda clientId YOK', async () => {
    const productIdA = new ObjectId();
    const createA = jest.fn(async (d: any) => d);
    const productModelOf = () => ({ findOne: () => ({ select: function (this: any) { return this; }, lean: async () => ({ maincode: 'M' }) }), updateOne: jest.fn(async () => ({})) });
    const svcA: any = new VariantService(4, { clientId: 999, productId: String(productIdA), variant: { stockcode: 'A' } });
    svcA.clientDB = { getProductModel: productModelOf, getVariantModel: () => ({ create: createA }) };

    const productIdB = new ObjectId();
    const createB = jest.fn(async (d: any) => d);
    const svcB: any = new VariantService(7, { productId: String(productIdB), variant: { stockcode: 'B' } });
    svcB.clientDB = { getProductModel: productModelOf, getVariantModel: () => ({ create: createB }) };

    jest.spyOn(svcA, 'afterVariantWrite').mockResolvedValue(undefined);
    jest.spyOn(svcB, 'afterVariantWrite').mockResolvedValue(undefined);

    await svcA.addVariant();
    await svcB.addVariant();

    expect(createA.mock.calls[0][0]).toMatchObject({ stockcode: 'A', productId: productIdA });
    expect(createB.mock.calls[0][0]).toMatchObject({ stockcode: 'B', productId: productIdB });
    expect(JSON.stringify(createA.mock.calls)).not.toMatch(/999/);
  });
});

/**
 * CHARACTERIZATION: BrandService (backend/src/api/services/brand-service.ts)
 *
 * Kapsam: get, addBrand, saveIntegrationBrand, updateBrand, deleteBrand. DB/Redis/ağ YOK; `clientDB` sahte model
 * nesneleridir (ADR-0016 B-R-T1). Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut davranış sabitlenir.
 *
 * Tenant izolasyonu: BrandService içindeki HİÇBİR sorgu clientId/tenant ile filtrelenmez; izolasyon tamamen
 * `this.clientDB` (tenant başına ayrı Mongo DB) seçimine dayanır (bkz. OrderService/StockService
 * characterization'larında sabitlenen aynı mimari desen, docs/backlog-detail/backlog-1g-t4.md).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

import BrandService from '@api/services/brand-service';

let brandModel: any;

function chainableFind(result: any[]) {
  return {
    collation: jest.fn(function (this: any) { return this; }),
    sort: jest.fn(function (this: any) { return this; }),
    lean: jest.fn(async () => result),
  };
}

function makeService(request: any = {}, clientId: any = 42) {
  const svc: any = new BrandService(clientId, request);
  svc.clientDB = { getBrandModel: () => brandModel };
  return svc;
}

beforeEach(() => {
  brandModel = {
    find: jest.fn(() => chainableFind([{ _id: 'b1', title: 'Marka 1' }])),
    create: jest.fn(async (doc: any) => ({ _id: 'new-brand-id', ...doc })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    deleteOne: jest.fn(async () => ({ deletedCount: 1, acknowledged: true })),
  };
});

afterEach(() => { jest.restoreAllMocks(); });

describe('BrandService.get', () => {
  it('[MEVCUT DAVRANIŞ] parentId parametresi TAMAMEN yok sayılır: filterQuery her zaman {} olur', async () => {
    const svc = makeService();
    await svc.get(999);
    expect(brandModel.find).toHaveBeenCalledWith({});
  });

  it('[MEVCUT DAVRANIŞ] collation({locale:"tr",strength:2}).sort({isMain:-1,title:1}).lean() zinciri kurulur; sonuç aynen döner', async () => {
    const svc = makeService();
    const chain = chainableFind([{ _id: 'x' }]);
    brandModel.find.mockReturnValue(chain);
    const res = await svc.get();
    expect(chain.collation).toHaveBeenCalledWith({ locale: 'tr', strength: 2 });
    expect(chain.sort).toHaveBeenCalledWith({ isMain: -1, title: 1 });
    expect(res).toEqual([{ _id: 'x' }]);
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi (aynı örnek) yeniden fırlatılır', async () => {
    const err = new Error('mongo down');
    const chain = chainableFind([]);
    chain.lean = jest.fn(async () => { throw err; });
    brandModel.find.mockReturnValue(chain);
    await expect(makeService().get()).rejects.toBe(err);
  });

  it('[MEVCUT DAVRANIŞ] $match/$or/clientId gibi tenant alanları sorguya HİÇ eklenmez', async () => {
    await makeService({}, 7).get();
    expect(JSON.stringify(brandModel.find.mock.calls[0][0])).not.toMatch(/clientId/i);
  });
});

describe('BrandService.addBrand', () => {
  it('[MEVCUT DAVRANIŞ] yalnızca request.title alınır (diğer gövde alanları yok sayılır); {_id} döner', async () => {
    const svc = makeService({ title: 'Yeni Marka', extraField: 'ignored', isMain: true });
    const res = await svc.addBrand();
    expect(brandModel.create).toHaveBeenCalledWith({ title: 'Yeni Marka' });
    expect(res).toEqual({ _id: 'new-brand-id' });
  });

  it('[MEVCUT DAVRANIŞ] request.title yoksa create {title: undefined} ile çağrılır (doğrulama yok)', async () => {
    const svc = makeService({});
    await svc.addBrand();
    expect(brandModel.create).toHaveBeenCalledWith({ title: undefined });
  });

  it('[MEVCUT DAVRANIŞ] create hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('duplicate key');
    brandModel.create.mockRejectedValue(err);
    await expect(makeService({ title: 'X' }).addBrand()).rejects.toBe(err);
  });
});

describe('BrandService.saveIntegrationBrand', () => {
  it('[MEVCUT DAVRANIŞ] dinamik alan adı "platforms.<integrationCode>" ile $set kurulur; brandId ObjectId\'ye çevrilir', async () => {
    const brandId = new ObjectId().toString();
    const svc = makeService({ brandId, integrationCode: 'trendyol', integrationBrand: { id: 555, name: 'Nike' } });
    const res = await svc.saveIntegrationBrand();
    const [query, update] = brandModel.updateOne.mock.calls[0];
    expect(query).toEqual({ _id: new ObjectId(brandId) });
    expect(update).toEqual({ $set: { 'platforms.trendyol': { id: 555, name: 'Nike' } } });
    expect(res).toEqual({ result: true });
  });

  it.each([[0], [2], [undefined]])('[MEVCUT DAVRANIŞ] modifiedCount %p (!== 1) -> {result:false}', async (modifiedCount) => {
    brandModel.updateOne.mockResolvedValue({ modifiedCount });
    const res = await makeService({ brandId: new ObjectId().toString(), integrationCode: 'n11', integrationBrand: {} }).saveIntegrationBrand();
    expect(res).toEqual({ result: false });
  });

  it('[MEVCUT DAVRANIŞ] brandId geçersiz ObjectId ise senkron hata fırlatılır, updateOne hiç çağrılmaz', async () => {
    const svc = makeService({ brandId: 'not-a-valid-object-id', integrationCode: 'n11', integrationBrand: {} });
    await expect(svc.saveIntegrationBrand()).rejects.toThrow();
    expect(brandModel.updateOne).not.toHaveBeenCalled();
  });
});

describe('BrandService.updateBrand', () => {
  it('[MEVCUT DAVRANIŞ] request.brandId (request._id DEĞİL) kimlik alanı olarak kullanılır; yalnız title güncellenir', async () => {
    const brandId = new ObjectId().toString();
    const svc = makeService({ brandId, title: 'Güncel Ad', isMain: true });
    const res = await svc.updateBrand();
    const [query, update] = brandModel.updateOne.mock.calls[0];
    expect(query).toEqual({ _id: new ObjectId(brandId) });
    expect(update).toEqual({ $set: { title: 'Güncel Ad' } }); // isMain sessizce yok sayılır
    expect(res).toEqual({ result: true });
  });

  it('[MEVCUT DAVRANIŞ] modifiedCount 0 -> {result:false}', async () => {
    brandModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
    const res = await makeService({ brandId: new ObjectId().toString(), title: 'X' }).updateBrand();
    expect(res).toEqual({ result: false });
  });

  it('[MEVCUT DAVRANIŞ] updateOne hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('write conflict');
    brandModel.updateOne.mockRejectedValue(err);
    await expect(makeService({ brandId: new ObjectId().toString(), title: 'X' }).updateBrand()).rejects.toBe(err);
  });
});

describe('BrandService.deleteBrand', () => {
  it('[MEVCUT DAVRANIŞ] kimlik alanı olarak request._id kullanılır (BACKLOG: updateBrand/saveIntegrationBrand "brandId" okur, deleteBrand "_id" okur — alan adı tutarsızlığı)', async () => {
    // BACKLOG: şüpheli - aynı kaynağın farklı metotları farklı istek alanı adları bekliyor (brandId vs _id);
    // FE doğru alanı her zaman gönderiyor olabilir ama sözleşme tutarsız ve kolayca yanlış kullanılabilir.
    const id = new ObjectId().toString();
    const svc = makeService({ _id: id });
    const res = await svc.deleteBrand();
    expect(brandModel.deleteOne).toHaveBeenCalledWith({ _id: new ObjectId(id) });
    expect(res).toEqual({ deletedCount: 1, acknowledged: true });
  });

  it('[MEVCUT DAVRANIŞ] mongoose yanıtı OLDUĞU GİBİ (sarmalanmadan) döner (create/update {_id}/{result} şeklindeyken delete ham nesne döner)', async () => {
    const raw = { deletedCount: 0, acknowledged: true };
    brandModel.deleteOne.mockResolvedValue(raw);
    const res = await makeService({ _id: new ObjectId().toString() }).deleteBrand();
    expect(res).toBe(raw);
  });

  it('[MEVCUT DAVRANIŞ] request._id geçersiz ObjectId ise senkron hata fırlatılır', async () => {
    await expect(makeService({ _id: 'invalid' }).deleteBrand()).rejects.toThrow();
  });

  it('[MEVCUT DAVRANIŞ] deleteOne hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('cannot delete');
    brandModel.deleteOne.mockRejectedValue(err);
    await expect(makeService({ _id: new ObjectId().toString() }).deleteBrand()).rejects.toBe(err);
  });
});

describe('BrandService: tenant izolasyonu (iki farklı tenant)', () => {
  it('her tenant yalnızca KENDİ clientDB\'sindeki markaları görür; istek gövdesi (ör. clientId) sorguyu etkilemez', async () => {
    const tenantABrands = [{ _id: 'a1', title: 'A Markası' }];
    const tenantBBrands = [{ _id: 'b1', title: 'B Markası' }];

    const svcA: any = new BrandService(4, { clientId: 999 }); // gövdede başka bir tenant id'si olsa bile...
    svcA.clientDB = { getBrandModel: () => ({ find: jest.fn(() => chainableFind(tenantABrands)) }) };

    const svcB: any = new BrandService(7, {});
    svcB.clientDB = { getBrandModel: () => ({ find: jest.fn(() => chainableFind(tenantBBrands)) }) };

    const resA = await svcA.get();
    const resB = await svcB.get();

    expect(resA).toEqual(tenantABrands); // ...yalnızca clientDB seçimi (svcA.clientDB) belirleyicidir
    expect(resB).toEqual(tenantBBrands);
    expect(JSON.stringify(resA)).not.toMatch(/B Markası/);
    expect(JSON.stringify(resB)).not.toMatch(/A Markası/);
  });
});

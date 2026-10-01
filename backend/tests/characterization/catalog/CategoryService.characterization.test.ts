/**
 * CHARACTERIZATION: CategoryService (backend/src/api/services/category-service.ts)
 *
 * Kapsam: get/buildCategory, addCategory, saveIntegrationCategory, updateCategory, moveCategory,
 * changeOrderCategory, deleteCategory. DB/Redis/ağ YOK; `clientDB` sahte model nesneleridir (ADR-0016 B-R-T1).
 * Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut davranış sabitlenir.
 *
 * Tenant izolasyonu: hiçbir sorgu clientId/tenant ile filtrelenmez; izolasyon tamamen `this.clientDB` seçimine dayanır.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

import CategoryService from '@api/services/category-service';

let categoryModel: any;

function makeService(request: any = {}, clientId: any = 42) {
  const svc: any = new CategoryService(clientId, request);
  svc.clientDB = { getCategoryModel: () => categoryModel, getAttributeMappingModel: () => ({ deleteMany: jest.fn(async () => ({ deletedCount: 0 })) }) };
  return svc;
}

function chainableFind(result: any[]) {
  return { sort: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => result) };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  categoryModel = {
    find: jest.fn(() => chainableFind([])),
    findOne: jest.fn(async () => ({ _id: new ObjectId() })),
    create: jest.fn(async (doc: any) => ({ _id: 'new-cat-id', ...doc })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
  };
});

afterEach(() => { jest.restoreAllMocks(); });

describe('CategoryService.get / buildCategory: düz listeden ağaç kurulumu', () => {
  it('[MEVCUT DAVRANIŞ] boş liste -> [] (mainCategory aranmaz)', async () => {
    categoryModel.find.mockReturnValue(chainableFind([]));
    await expect(makeService().get()).resolves.toEqual([]);
  });

  it('[MEVCUT DAVRANIŞ] find().sort({order:1}).lean() zinciri kurulur; parentId argümanı sorguyu ETKİLEMEZ (her zaman {})', async () => {
    const chain = chainableFind([{ _id: new ObjectId(), parentId: 0 }]);
    categoryModel.find.mockReturnValue(chain);
    await makeService().get(777);
    expect(categoryModel.find).toHaveBeenCalledWith({});
    expect(chain.sort).toHaveBeenCalledWith({ order: 1 });
  });

  it('[MEVCUT DAVRANIŞ] tek seviyeli ağaç: mainCategory (parentId==0) + doğrudan çocuklar; her kategoriye UI alanları (menu,isOpen,level,children…) eklenir', async () => {
    const mainId = new ObjectId();
    const child1 = new ObjectId();
    const child2 = new ObjectId();
    const flat = [
      { _id: mainId, parentId: 0, title: 'Ana' },
      { _id: child1, parentId: mainId, title: 'Çocuk 1' },
      { _id: child2, parentId: mainId, title: 'Çocuk 2' },
    ];
    categoryModel.find.mockReturnValue(chainableFind(flat));
    const res = await makeService().get();
    expect(res).toHaveLength(3); // [mainCategory, ...structedCategories]
    expect(res[0]._id).toBe(mainId);
    // BACKLOG: şüpheli - mainCategory'nin KENDİSİ buildCategory döngüsünde HİÇ ziyaret edilmez (yalnızca çocuklarının
    // aranacağı parentId olarak kullanılır); bu yüzden res[0] üzerinde level/children/menu gibi UI alanları YOKTUR
    // (topLevel öğelerinin aksine) — FE ağaç bileşeni ana kategori düğümünü diğerlerinden farklı şekilde ele almalıdır.
    expect(res[0].level).toBeUndefined();
    expect(res[0].children).toBeUndefined();
    const topLevel = res.slice(1);
    expect(topLevel.map((c: any) => c._id)).toEqual([child1, child2]);
    for (const c of topLevel) {
      expect(c).toMatchObject({ menu: false, newTitle: '', isOpen: false, isOrderDropPossible: false, isDropPossible: false, level: 0 });
      expect(c.updateTitle).toBe('0');
      expect(c.children).toEqual([]);
    }
  });

  it('[MEVCUT DAVRANIŞ] derin ağaçta level 0\'dan başlar (mainCategory\'nin doğrudan çocukları level 0); girdi dizisi (kategori nesneleri) YERİNDE MUTASYONA uğratılır', async () => {
    const mainId = new ObjectId();
    const l1 = new ObjectId();
    const l2 = new ObjectId();
    const l1Cat: any = { _id: l1, parentId: mainId, title: 'L1' };
    const flat = [{ _id: mainId, parentId: 0, title: 'Ana' }, l1Cat, { _id: l2, parentId: l1, title: 'L2' }];
    categoryModel.find.mockReturnValue(chainableFind(flat));
    await makeService().get();
    expect(l1Cat.level).toBe(0); // orijinal nesne mutasyona uğradı (return değeri değil, referansın kendisi); mainCategory'nin doğrudan çocuğu -> level 0
    expect((l1Cat as any).children[0].level).toBe(1);
  });

  it('[MEVCUT DAVRANIŞ] hiçbir kategori parentId==0 değilse (mainCategory bulunamaz) TypeError fırlatılır (silinen "ana kategori" durumu)', async () => {
    // BACKLOG: şüpheli - ana kategori (parentId:0) DB'de yoksa metot çöker (mainCategory undefined -> ._id erişimi);
    // kullanıcıya "kategori bulunamadı" gibi anlamlı bir hata yerine ham TypeError döner.
    categoryModel.find.mockReturnValue(chainableFind([{ _id: new ObjectId(), parentId: new ObjectId(), title: 'Yetim' }]));
    await expect(makeService().get()).rejects.toThrow(TypeError);
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('agg fail');
    categoryModel.find.mockReturnValue({ sort: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => { throw err; }) });
    await expect(makeService().get()).rejects.toBe(err);
  });
});

describe('CategoryService.addCategory', () => {
  it('[MEVCUT DAVRANIŞ] parentCategoryId verilmemişse isMain:true kategorisi aranıp onun _id\'si parent yapılır', async () => {
    const mainId = new ObjectId();
    categoryModel.findOne.mockResolvedValue({ _id: mainId });
    const svc = makeService({ title: 'Yeni Kategori' });
    const res = await svc.addCategory();
    expect(categoryModel.findOne).toHaveBeenCalledWith({ isMain: true });
    const doc = categoryModel.create.mock.calls[0][0];
    expect(doc.parentId).toEqual(mainId);
    expect(doc.title).toBe('Yeni Kategori');
    expect(doc.icon).toBe('mdi-shape');
    expect(typeof doc.order).toBe('number');
    expect(res).toEqual({ _id: 'new-cat-id' });
  });

  it('[MEVCUT DAVRANIŞ] parentCategoryId verilmişse isMain sorgusu ATLANIR, doğrudan ObjectId olarak kullanılır', async () => {
    const parentId = new ObjectId().toString();
    await makeService({ parentCategoryId: parentId, title: 'X' }).addCategory();
    expect(categoryModel.findOne).not.toHaveBeenCalled();
    expect(categoryModel.create.mock.calls[0][0].parentId).toEqual(new ObjectId(parentId));
  });

  it('[MEVCUT DAVRANIŞ] isMain kategorisi bulunamazsa (findOne null) TypeError fırlatılır', async () => {
    categoryModel.findOne.mockResolvedValue(null);
    await expect(makeService({ title: 'X' }).addCategory()).rejects.toThrow(TypeError);
  });

  it('[MEVCUT DAVRANIŞ] create hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('create fail');
    categoryModel.create.mockRejectedValue(err);
    await expect(makeService({ parentCategoryId: new ObjectId().toString(), title: 'X' }).addCategory()).rejects.toBe(err);
  });
});

describe('CategoryService.updateCategory', () => {
  it('[MEVCUT DAVRANIŞ] updateCategory: yalnızca title güncellenir, categoryId ObjectId\'ye çevrilir', async () => {
    const categoryId = new ObjectId().toString();
    const res = await makeService({ categoryId, title: 'Yeni Ad', icon: 'ignored' }).updateCategory();
    expect(categoryModel.updateOne).toHaveBeenCalledWith({ _id: new ObjectId(categoryId) }, { $set: { title: 'Yeni Ad' } });
    expect(res).toEqual({ result: true });
  });

  it('[MEVCUT DAVRANIŞ] updateCategory: DB hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('cast error');
    categoryModel.updateOne.mockRejectedValue(err);
    await expect(makeService({ categoryId: new ObjectId().toString(), title: 'X' }).updateCategory()).rejects.toBe(err);
  });
});

describe('CategoryService.moveCategory', () => {
  it('[MEVCUT DAVRANIŞ] parentId, moveInCategoryId HAM (ObjectId\'YE ÇEVRİLMEDEN) $set edilir (diğer metotlardan farklı; BACKLOG adayı)', async () => {
    // BACKLOG: şüpheli - addCategory/saveIntegrationCategory/updateCategory kimlik alanlarını hep `new ObjectId(...)`
    // ile yazarken moveCategory `parentId`'yi ham (string/number) yazıyor; şema tipi ObjectId ise bu bir tip
    // tutarsızlığı olabilir (Mongoose otomatik cast edebilir ama doğrudan $set'te garanti değildir).
    const moveCategoryId = new ObjectId().toString();
    const moveInCategoryId = new ObjectId().toString();
    categoryModel.find.mockReturnValue(chainableFind([]));
    await makeService({ moveCategoryId, moveInCategoryId, parentId: 0 }).moveCategory();
    expect(categoryModel.updateOne).toHaveBeenCalledWith({ _id: new ObjectId(moveCategoryId) }, { $set: { parentId: moveInCategoryId } });
  });

  it('[MEVCUT DAVRANIŞ] işlemden sonra this.get(this.request.parentId) çağrılıp güncel ağaç {result, categories} içinde döner', async () => {
    categoryModel.find.mockReturnValue(chainableFind([]));
    const res = await makeService({ moveCategoryId: new ObjectId().toString(), moveInCategoryId: new ObjectId().toString(), parentId: 5 }).moveCategory();
    expect(res.categories).toEqual([]);
    expect(res.result).toMatchObject({ modifiedCount: 1 });
  });

  it('[MEVCUT DAVRANIŞ] updateOne hatası olduğu gibi yeniden fırlatılır (get() hiç çağrılmaz)', async () => {
    const err = new Error('move fail');
    categoryModel.updateOne.mockRejectedValue(err);
    await expect(makeService({ moveCategoryId: new ObjectId().toString(), moveInCategoryId: new ObjectId().toString() }).moveCategory()).rejects.toBe(err);
    expect(categoryModel.find).not.toHaveBeenCalled();
  });
});

describe('CategoryService.changeOrderCategory', () => {
  it('[MEVCUT DAVRANIŞ] iki kategori bulunursa order alanları TAKAS edilir (from<->to), iki updateOne çağrılır', async () => {
    const fromId = new ObjectId();
    const toId = new ObjectId();
    const fromCat: any = { _id: fromId, order: 1 };
    const toCat: any = { _id: toId, order: 2 };
    categoryModel.find.mockResolvedValue([fromCat, toCat]);
    const res = await makeService({ fromCategoryId: fromId, toCategoryId: toId }).changeOrderCategory();
    expect(categoryModel.updateOne).toHaveBeenNthCalledWith(1, { _id: fromId }, { $set: { order: 2 } });
    expect(categoryModel.updateOne).toHaveBeenNthCalledWith(2, { _id: toId }, { $set: { order: 1 } });
    expect(res.result.fromResp).toBeDefined();
    expect(res.result.toResp).toBeDefined();
  });

  it('[MEVCUT DAVRANIŞ] bulunan kategori sayısı 2 değilse (ör. biri silinmiş) SESSİZCE {result:{fromResp:undefined,toResp:undefined}} döner (hata yok)', async () => {
    // BACKLOG: şüpheli - eksik kategori durumunda kullanıcıya hiçbir hata/uyarı verilmez, işlem sessizce hiçbir şey yapmaz.
    categoryModel.find.mockResolvedValue([{ _id: new ObjectId() }]);
    const res = await makeService({ fromCategoryId: new ObjectId(), toCategoryId: new ObjectId() }).changeOrderCategory();
    expect(res).toEqual({ result: { fromResp: undefined, toResp: undefined } });
    expect(categoryModel.updateOne).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] find $or sorgusu iki _id\'yi de içerir', async () => {
    const fromId = new ObjectId();
    const toId = new ObjectId();
    categoryModel.find.mockResolvedValue([]);
    await makeService({ fromCategoryId: fromId, toCategoryId: toId }).changeOrderCategory();
    expect(categoryModel.find).toHaveBeenCalledWith({ $or: [{ _id: new ObjectId(fromId) }, { _id: new ObjectId(toId) }] });
  });

  it('[MEVCUT DAVRANIŞ] find hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('query fail');
    categoryModel.find.mockRejectedValue(err);
    await expect(makeService({ fromCategoryId: new ObjectId(), toCategoryId: new ObjectId() }).changeOrderCategory()).rejects.toBe(err);
  });
});

describe('CategoryService.deleteCategory', () => {
  it('[WP11] request._id ile silinir; yanıt alanlarıyla döner (+ deletedMappings)', async () => {
    const id = new ObjectId().toString();
    const raw = { deletedCount: 1, acknowledged: true };
    categoryModel.deleteOne.mockResolvedValue(raw);
    const res = await makeService({ _id: id }).deleteCategory();
    expect(categoryModel.deleteOne).toHaveBeenCalledWith({ _id: new ObjectId(id) });
    expect(res).toEqual({ ...raw, deletedMappings: 0 });
  });

  it('[MEVCUT DAVRANIŞ] deleteOne hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('fk violation');
    categoryModel.deleteOne.mockRejectedValue(err);
    await expect(makeService({ _id: new ObjectId().toString() }).deleteCategory()).rejects.toBe(err);
  });
});

describe('CategoryService: tenant izolasyonu (iki farklı tenant)', () => {
  it('her tenant yalnızca KENDİ clientDB\'sindeki ağacı görür; sorgular clientId alanı içermez', async () => {
    const tenantACats = [{ _id: new ObjectId(), parentId: 0, title: 'A-Ana' }];
    const tenantBCats = [{ _id: new ObjectId(), parentId: 0, title: 'B-Ana' }];

    const svcA: any = new CategoryService(4, { clientId: 999 });
    svcA.clientDB = { getCategoryModel: () => ({ find: jest.fn(() => chainableFind(tenantACats)) }) };
    const svcB: any = new CategoryService(7, {});
    svcB.clientDB = { getCategoryModel: () => ({ find: jest.fn(() => chainableFind(tenantBCats)) }) };

    const resA = await svcA.get();
    const resB = await svcB.get();
    expect(JSON.stringify(resA)).toMatch(/A-Ana/);
    expect(JSON.stringify(resA)).not.toMatch(/B-Ana/);
    expect(JSON.stringify(resB)).toMatch(/B-Ana/);
    expect(JSON.stringify(resB)).not.toMatch(/A-Ana/);
  });
});

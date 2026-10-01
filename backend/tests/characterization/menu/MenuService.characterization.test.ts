/**
 * CHARACTERIZATION: MenuService (backend/src/api/rpc/handlers/menu-service.ts) — ADR-0016 B-R-T3.
 * DB/Redis/ağ YOK; `applicationDB`/`clientDB` sahte model nesneleridir. Kod DEĞİŞTİRİLMEDİ, yalnızca
 * mevcut davranış sabitlenir.
 *
 * Tenant izolasyonu notu: `get()` PLATFORM-GENELİ bir kaynağı okur (`applicationDB.getMenuModel()`,
 * sabit `_id: "entegrator"` — tüm tenant'lar için AYNI menü listesi; kural B2 burada UYGULANMAZ, gerekçe:
 * platform-scoped kaynak, tenant'a özgü veri değil). `retrieveFavorites`/`addFavorite`/`deleteFavorite`/
 * `sortFavorites` ise `clientDB` (tenant başına ayrı Mongo DB) kullanır; izolasyon — BrandService/StockService
 * characterization'larında sabitlenen aynı mimari desende — tamamen `this.clientDB` seçimine dayanır,
 * sorgularda hiçbir clientId/tenant alanı yoktur.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import MenuService from '@api/rpc/handlers/menu-service';

let menuModel: any;
let favoriteModel: any;

function chainableFindOne(result: any) {
  return { lean: jest.fn(async () => result) };
}
function chainableFind(result: any[]) {
  return { sort: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => result) };
}

function makeService(request: any = {}, clientId: any = 42) {
  const svc: any = new MenuService(clientId, request);
  svc.applicationDB = { getMenuModel: () => menuModel };
  svc.clientDB = { getFavoriteModel: () => favoriteModel };
  return svc;
}

beforeEach(() => {
  menuModel = { findOne: jest.fn(() => chainableFindOne({ _id: 'entegrator', list: [{ code: 'orders' }] })) };
  favoriteModel = {
    find: jest.fn(() => chainableFind([{ code: 'orders', order: 1 }])),
    findOne: jest.fn(() => ({ sort: jest.fn(function (this: any) { return this; }), exec: jest.fn(async () => ({ order: 5 })) })),
    create: jest.fn(async (doc: any) => ({ _id: 'fav1', ...doc })),
    deleteOne: jest.fn(async () => ({ deletedCount: 1 })),
    bulkWrite: jest.fn(async (ops: any[]) => ({ ok: 1, nModified: ops.length })),
  };
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('MenuService.get (platform-geneli, applicationDB)', () => {
  it('[MEVCUT DAVRANIŞ] filterQuery HER ZAMAN {_id:"entegrator"} olur, request/clientId etkisiz', async () => {
    const svc = makeService({ someField: 'x' }, 777);
    await svc.get();
    expect(menuModel.findOne).toHaveBeenCalledWith({ _id: 'entegrator' });
  });

  it('[MEVCUT DAVRANIŞ] res.list varsa list AYNEN döner (res\'in kendisi değil)', async () => {
    const res = await makeService().get();
    expect(res).toEqual([{ code: 'orders' }]);
  });

  it('[MEVCUT DAVRANIŞ] res var ama list yoksa Error("no list") fırlatılır, console.log ile loglanır', async () => {
    menuModel.findOne.mockReturnValue(chainableFindOne({ _id: 'entegrator' }));
    await expect(makeService().get()).rejects.toThrow('no list');
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] res null ise Error("no list") fırlatılır', async () => {
    menuModel.findOne.mockReturnValue(chainableFindOne(null));
    await expect(makeService().get()).rejects.toThrow('no list');
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi (aynı örnek) loglanıp yeniden fırlatılır', async () => {
    const err = new Error('mongo down');
    menuModel.findOne.mockReturnValue({ lean: jest.fn(async () => { throw err; }) });
    await expect(makeService().get()).rejects.toBe(err);
    expect(console.log).toHaveBeenCalledWith(err);
  });
});

describe('MenuService.retrieveFavorites (clientDB)', () => {
  it('[MEVCUT DAVRANIŞ] find({}).sort({order:1}).lean() zinciri; sonuç aynen döner', async () => {
    const res = await makeService().retrieveFavorites();
    expect(favoriteModel.find).toHaveBeenCalledWith({});
    expect(res).toEqual([{ code: 'orders', order: 1 }]);
  });

  it('[MEVCUT DAVRANIŞ/BACKLOG-adayı] boş dizi [] JS\'te truthy olduğundan hata FIRLATILMAZ, [] aynen döner', async () => {
    // BACKLOG: şüpheli değil ama not edilmeye değer — `if (res) return res` kontrolü [] için de true'dur;
    // "favori yok" durumu ile "sorgu null döndürdü" durumu birbirinden ayırt edilemez.
    favoriteModel.find.mockReturnValue(chainableFind([]));
    const res = await makeService().retrieveFavorites();
    expect(res).toEqual([]);
  });

  it('[MEVCUT DAVRANIŞ] sonuç null/undefined ise Error("favorite menu error") fırlatılır', async () => {
    favoriteModel.find.mockReturnValue({ sort: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => null) });
    await expect(makeService().retrieveFavorites()).rejects.toThrow('favorite menu error');
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi (console.log YOK, sadece rethrow) fırlatılır', async () => {
    const err = new Error('boom');
    favoriteModel.find.mockReturnValue({ sort: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => { throw err; }) });
    await expect(makeService().retrieveFavorites()).rejects.toBe(err);
  });
});

describe('MenuService.addFavorite', () => {
  it('[MEVCUT DAVRANIŞ] mevcut maxOrder varsa yeni order = maxOrder.order + 1; create({code, order}) çağrılır', async () => {
    const res = await makeService({ code: 'claims' }).addFavorite();
    expect(favoriteModel.create).toHaveBeenCalledWith({ code: 'claims', order: 6 });
    expect(res).toEqual({ _id: 'fav1', code: 'claims', order: 6 });
  });

  it('[MEVCUT DAVRANIŞ] hiç favori yoksa (maxOrder null) newOrderValue = 1', async () => {
    favoriteModel.findOne.mockReturnValue({ sort: jest.fn(function (this: any) { return this; }), exec: jest.fn(async () => null) });
    await makeService({ code: 'x' }).addFavorite();
    expect(favoriteModel.create).toHaveBeenCalledWith({ code: 'x', order: 1 });
  });

  it('[MEVCUT DAVRANIŞ] request.code yoksa create({code: undefined, ...}) ile çağrılır — doğrulama yok', async () => {
    await makeService({}).addFavorite();
    expect(favoriteModel.create).toHaveBeenCalledWith({ code: undefined, order: 6 });
  });

  it('[MEVCUT DAVRANIŞ] create hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('duplicate');
    favoriteModel.create.mockRejectedValue(err);
    await expect(makeService({ code: 'x' }).addFavorite()).rejects.toBe(err);
  });
});

describe('MenuService.deleteFavorite', () => {
  it('[MEVCUT DAVRANIŞ] deleteOne({code: request.code}) çağrılır; ham mongoose yanıtı sarmalanmadan döner', async () => {
    const res = await makeService({ code: 'orders' }).deleteFavorite();
    expect(favoriteModel.deleteOne).toHaveBeenCalledWith({ code: 'orders' });
    expect(res).toEqual({ deletedCount: 1 });
  });

  it('[MEVCUT DAVRANIŞ] deleteOne hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('cannot delete');
    favoriteModel.deleteOne.mockRejectedValue(err);
    await expect(makeService({ code: 'x' }).deleteFavorite()).rejects.toBe(err);
  });
});

describe('MenuService.sortFavorites', () => {
  it('[MEVCUT DAVRANIŞ] sortedCodes sırasına göre order 1\'den başlayarak artan bulkWrite updateOne dizisi kurulur', async () => {
    await makeService({ sortedCodes: ['a', 'b', 'c'] }).sortFavorites();
    const ops = favoriteModel.bulkWrite.mock.calls[0][0];
    expect(ops).toEqual([
      { updateOne: { filter: { code: 'a' }, update: { $set: { order: 1 } } } },
      { updateOne: { filter: { code: 'b' }, update: { $set: { order: 2 } } } },
      { updateOne: { filter: { code: 'c' }, update: { $set: { order: 3 } } } },
    ]);
  });

  it('[MEVCUT DAVRANIŞ] bulkWrite sonucu aynen döner', async () => {
    const res = await makeService({ sortedCodes: ['a'] }).sortFavorites();
    expect(res).toEqual({ ok: 1, nModified: 1 });
  });

  it('[MEVCUT DAVRANIŞ] sortedCodes boş dizi ise bulkWrite([]) ile çağrılır', async () => {
    await makeService({ sortedCodes: [] }).sortFavorites();
    expect(favoriteModel.bulkWrite).toHaveBeenCalledWith([]);
  });

  it('[MEVCUT DAVRANIŞ] request.sortedCodes tanımsızsa senkron TypeError (not iterable) fırlatılır, bulkWrite hiç çağrılmaz', async () => {
    await expect(makeService({}).sortFavorites()).rejects.toThrow();
    expect(favoriteModel.bulkWrite).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] bulkWrite hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('bulk failed');
    favoriteModel.bulkWrite.mockRejectedValue(err);
    await expect(makeService({ sortedCodes: ['a'] }).sortFavorites()).rejects.toBe(err);
  });
});

describe('MenuService: tenant izolasyonu (retrieveFavorites, iki farklı tenant)', () => {
  it('her tenant yalnızca KENDİ clientDB\'sindeki favorileri görür; clientId parametresi sorguyu etkilemez', async () => {
    const tenantAFavs = [{ code: 'a-fav' }];
    const tenantBFavs = [{ code: 'b-fav' }];

    const svcA: any = new MenuService(4, {});
    svcA.clientDB = { getFavoriteModel: () => ({ find: jest.fn(() => chainableFind(tenantAFavs)) }) };

    const svcB: any = new MenuService(7, {});
    svcB.clientDB = { getFavoriteModel: () => ({ find: jest.fn(() => chainableFind(tenantBFavs)) }) };

    const resA = await svcA.retrieveFavorites();
    const resB = await svcB.retrieveFavorites();

    expect(resA).toEqual(tenantAFavs);
    expect(resB).toEqual(tenantBFavs);
    expect(JSON.stringify(resA)).not.toMatch(/b-fav/);
    expect(JSON.stringify(resB)).not.toMatch(/a-fav/);
  });
});

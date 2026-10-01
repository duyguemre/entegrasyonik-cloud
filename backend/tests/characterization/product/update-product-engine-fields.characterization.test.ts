/**
 * CHARACTERIZATION (Protokol 13; N6 / ADR-0004): ProductService.updateProduct / saveProduct, motora ait varyant alanları.
 *
 * `retrieveProduct` varyantları TÜM alanlarıyla döndürür (`reserved`, `allocations`, `stockVersion`, `stockDirty` dahil — projeksiyon yok);
 * FE ürün formu bu varyantları aynen `updateProduct`'a geri gönderir ve bu metot her varyantı `$set: v` ile yazar. Sonuç (düzeltme ÖNCESİ):
 * FE'nin bayat okuması, arada gerçekleşen bir rezervasyonu (reserved/allocations/stockDirty) SESSİZCE EZER -> zero-oversell doğruluk
 * kaynağı bozulur (ADR-0004 Karar 1: doğruluk kaynağı Variants.allocations; yalnızca StockAllocator atomik geçişlerle yazar).
 * Düzeltme: bu dört alan FE gövdesinden ATILIR (varolan varyantlarda $set'e girmez; yeni varyantlarda şema varsayılanı geçerli olur).
 * `stock` (kullanıcı düzenlemesi) ve diğer alanlar AYNEN yazılmaya devam eder (regresyon).
 * DB/Redis/ağ YOK; sentetik veri.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

import ProductService from '../../../src/api/rpc/handlers/product-service';

const CLIENT_ID = 42;

let variantModel: any;
let productModel: any;

function makeService(productInfo: any) {
  const svc: any = new (ProductService as any)(CLIENT_ID, { productInfo });
  productModel = {
    findOneAndUpdate: jest.fn(async () => ({ _id: new ObjectId(), maincode: 'MC-1' })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    aggregate: jest.fn(async () => [{ _id: 'p1', variants: [] }]),
  };
  variantModel = {
    bulkWrite: jest.fn(async () => ({})),
    insertMany: jest.fn(async () => ({})),
    aggregate: jest.fn(async () => [{ totalStock: 5 }]),
    find: jest.fn(() => ({ lean: async () => [] })),
  };
  svc.clientDB = {
    getProductModel: () => productModel,
    getVariantModel: () => variantModel,
    getImageModel: () => ({ find: jest.fn(async () => []), bulkWrite: jest.fn(async () => undefined) }),
    getStatisticsModel: () => ({ updateOne: jest.fn(async () => ({})), findOne: jest.fn(() => ({ lean: async () => ({}) })) }),
  };
  return svc;
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

const ENGINE_FIELDS = ['reserved', 'allocations', 'stockVersion', 'stockDirty'];
const staleVariant = (over: any = {}) => ({
  _id: new ObjectId().toString(), stockcode: 'SKU-1', barcode: 'BC-1', stock: 7, shelf: 'A1', choices: [{ choiceId: 'c1', choiceValueId: 'v1' }],
  prices: { salePrice: 10, marketPrice: 12, isPlatformBasedPrice: false },
  reserved: 0, stockDirty: false, stockVersion: 3, allocations: [],
  ...over,
});

describe('ProductService.updateProduct: motor alanları FE gövdesinden yazılmaz', () => {
  it('mevcut varyant: reserved/allocations/stockVersion/stockDirty $set\'e GİRMEZ; stock/shelf/prices/barcode aynen yazılır', async () => {
    const v = staleVariant({ reserved: 0, allocations: [{ key: 'trendyol:E1:L1', qty: 2, state: 'RESERVED', at: new Date() }] });
    const svc = makeService({ _id: new ObjectId().toString(), hasVariant: true, tempId: 't', variants: [v] });
    await svc.updateProduct();

    const ops = variantModel.bulkWrite.mock.calls[0][0] as any[];
    expect(ops).toHaveLength(1);
    const set = ops[0].updateOne.update.$set;
    for (const f of ENGINE_FIELDS) expect([f, f in set]).toEqual([f, false]);
    expect(set).toMatchObject({ stockcode: 'SKU-1', barcode: 'BC-1', stock: 7, shelf: 'A1', prices: v.prices });
    expect(set.variantHash).toEqual(expect.any(String)); // mevcut davranış: hash yeniden hesaplanır
    expect(set.productId).toBeDefined();
  });

  it('yeni varyant (insertOne): motor alanları belgeden atılır (şema varsayılanları: reserved 0, allocations [])', async () => {
    const v = staleVariant({ _id: undefined, reserved: 99, allocations: [{ key: 'x', qty: 1, state: 'RESERVED', at: new Date() }], stockVersion: 50, stockDirty: true });
    const svc = makeService({ _id: new ObjectId().toString(), hasVariant: true, tempId: 't', variants: [v] });
    await svc.updateProduct();
    const doc = (variantModel.bulkWrite.mock.calls[0][0] as any[])[0].insertOne.document;
    for (const f of ENGINE_FIELDS) expect([f, f in doc]).toEqual([f, false]);
    expect(doc.stock).toBe(7);
  });

  it('gövde nesnesi (çağıranın dizisi) MUTASYONA uğratılmaz: yalnızca yazılan kopya temizlenir', async () => {
    const v = staleVariant({ reserved: 4 });
    const svc = makeService({ _id: new ObjectId().toString(), hasVariant: true, tempId: 't', variants: [v] });
    await svc.updateProduct();
    expect(v.reserved).toBe(4);
  });
});

describe('ProductService.saveProduct: yeni ürün varyantlarında motor alanları yazılmaz', () => {
  it('insertMany belgeleri reserved/allocations/stockVersion/stockDirty içermez', async () => {
    const v = staleVariant({ _id: undefined, reserved: 5, allocations: [{ key: 'k', qty: 1, state: 'RESERVED', at: new Date() }], stockVersion: 9, stockDirty: true });
    const svc = makeService({ tempId: new ObjectId().toString(), hasVariant: true, maincode: 'MC-1', variants: [v] });
    await svc.saveProduct();
    const docs = variantModel.insertMany.mock.calls[0][0] as any[];
    expect(docs).toHaveLength(1);
    for (const f of ENGINE_FIELDS) expect([f, f in docs[0]]).toEqual([f, false]);
    expect(docs[0]).toMatchObject({ stockcode: 'SKU-1', stock: 7 });
  });
});

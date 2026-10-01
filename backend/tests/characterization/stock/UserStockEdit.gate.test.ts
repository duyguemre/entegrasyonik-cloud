/**
 * X2 / CROSS_CUTTING_GAP 7b — stok "tek kapısı" (operations/stock/markStockDirty.ts).
 * Karakterizasyon (d9e68ff5) bulguyu teyit etti: kullanıcı stok düzenlemesi `stockDirty` işaretlemiyordu -> trigger görmüyor,
 * pazaryeri eski stoğu satıyordu. Bu dosya o testlerin DÜZELTME SONRASI (kasıtlı ters çevrilmiş) halidir.
 * DB/Redis/ağ YOK.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';
import { observeStockPublishLag } from '../../../src/operations/stock/markStockDirty';
import { metricsRegistry } from '../../../src/platform/runtime/metrics';
import ProductService from '../../../src/api/rpc/handlers/product-service';

let variantModel: any;
let existingVariants: any[] = [];
function makeService(productInfo: any) {
  const svc: any = new (ProductService as any)(42, { productInfo });
  variantModel = {
    bulkWrite: jest.fn(async () => ({})),
    insertMany: jest.fn(async () => ({})),
    aggregate: jest.fn(async () => [{ totalStock: 5 }]),
    find: jest.fn(() => ({ lean: async () => existingVariants })),
  };
  svc.clientDB = {
    getProductModel: () => ({
      findOneAndUpdate: jest.fn(async () => ({ _id: new ObjectId(), maincode: 'MC-1' })),
      updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
      aggregate: jest.fn(async () => [{ _id: 'p1', variants: [] }]),
    }),
    getVariantModel: () => variantModel,
    getImageModel: () => ({ find: jest.fn(async () => []), bulkWrite: jest.fn(async () => undefined) }),
    getStatisticsModel: () => ({ updateOne: jest.fn(async () => ({})), findOne: jest.fn(() => ({ lean: async () => ({}) })) }),
  };
  return svc;
}
beforeEach(() => { existingVariants = []; jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

const v = (over: any = {}) => ({ _id: new ObjectId().toString(), stockcode: 'S1', barcode: 'B1', stock: 0, choices: [], prices: { salePrice: 1, marketPrice: 1, isPlatformBasedPrice: false }, ...over });

describe('kullanıcı stok düzenlemesi stockDirty + stockDirtyAt işaretler', () => {
  it('updateProduct: stoğu DEĞİŞEN mevcut varyant $set içinde stockDirty:true + stockDirtyAt taşır', async () => {
    const id = new ObjectId().toString();
    existingVariants = [{ _id: id, stock: 5 }];
    const svc = makeService({ _id: new ObjectId().toString(), hasVariant: true, tempId: 't', variants: [v({ _id: id, stock: 0 })] });
    await svc.updateProduct();
    const set = (variantModel.bulkWrite.mock.calls[0][0] as any[])[0].updateOne.update.$set;
    expect(set.stock).toBe(0);
    expect(set.stockDirty).toBe(true);
    expect(set.stockDirtyAt).toBeInstanceOf(Date);
  });
  it('updateProduct: stoğu DEĞİŞMEYEN varyant işaretlenmez (FE tüm varyantları geri gönderir)', async () => {
    const id = new ObjectId().toString();
    existingVariants = [{ _id: id, stock: 7 }];
    const svc = makeService({ _id: new ObjectId().toString(), hasVariant: true, tempId: 't', variants: [v({ _id: id, stock: 7 })] });
    await svc.updateProduct();
    const set = (variantModel.bulkWrite.mock.calls[0][0] as any[])[0].updateOne.update.$set;
    expect('stockDirty' in set).toBe(false);
    expect('stockDirtyAt' in set).toBe(false);
  });
  it('updateProduct: FE gövdesindeki stockDirty:false ile bayrak SÖNDÜRÜLEMEZ, değişmeyen varyantta da yazılmaz (motor alanı)', async () => {
    const id = new ObjectId().toString();
    existingVariants = [{ _id: id, stock: 7 }];
    const svc = makeService({ _id: new ObjectId().toString(), hasVariant: true, tempId: 't', variants: [v({ _id: id, stock: 7, stockDirty: false })] });
    await svc.updateProduct();
    expect('stockDirty' in (variantModel.bulkWrite.mock.calls[0][0] as any[])[0].updateOne.update.$set).toBe(false);
  });
  it('updateProduct: yeni varyant (insertOne) işaretlenmez (ilk stok TRANSFER ile gider; dirty trigger taramasını şişirir)', async () => {
    const svc = makeService({ _id: new ObjectId().toString(), hasVariant: true, tempId: 't', variants: [v({ _id: undefined, stock: 3 })] });
    await svc.updateProduct();
    expect('stockDirty' in (variantModel.bulkWrite.mock.calls[0][0] as any[])[0].insertOne.document).toBe(false);
  });
  it('saveProduct: yeni varyant belgesi işaretlenmez', async () => {
    const svc = makeService({ tempId: new ObjectId().toString(), hasVariant: true, maincode: 'M', variants: [v({ _id: undefined, stock: 9 })] });
    await svc.saveProduct();
    expect('stockDirty' in (variantModel.insertMany.mock.calls[0][0] as any[])[0]).toBe(false);
  });
});

describe('stock_publish_lag_ms', () => {
  const T0 = new Date('2026-09-30T10:00:00Z');
  const model = (rows: any[]) => ({ find: jest.fn(() => ({ lean: async () => rows })) });
  const lagSeries = () => metricsRegistry.drain().filter((s: any) => s.metric === 'stock_publish_lag_ms');
  beforeEach(() => { metricsRegistry.resetForTests(); });

  it('düzenleme -> onay gecikmesi (ms) histogramına yazılır', async () => {
    await observeStockPublishLag(model([{ stockDirtyAt: T0, platforms: { trendyol: { stockSync: { lastPublishedAt: new Date('2026-09-30T09:00:00Z') } } } }]),
      'barcode', 'trendyol', ['B1'], new Date(T0.getTime() + 45000));
    const s = lagSeries();
    expect(s).toHaveLength(1);
    expect(s[0].labels).toEqual({ integration: 'trendyol' });
    expect([s[0].count, s[0].sum]).toEqual([1, 45000]);
  });
  it('bayat işaret (stockDirtyAt <= lastPublishedAt) gözlenmez; metrik hatası akışı bozmaz', async () => {
    await observeStockPublishLag(model([{ stockDirtyAt: T0, platforms: { trendyol: { stockSync: { lastPublishedAt: new Date(T0.getTime() + 1) } } } }]), 'barcode', 'trendyol', ['B1']);
    expect(lagSeries()).toHaveLength(0);
    await expect(observeStockPublishLag({ find: () => { throw new Error('x'); } }, 'barcode', 'trendyol', ['B1'])).resolves.toBeUndefined();
  });
});

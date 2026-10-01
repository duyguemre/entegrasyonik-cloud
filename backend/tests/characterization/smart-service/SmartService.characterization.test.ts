/**
 * CHARACTERIZATION: SmartService (backend/src/api/rpc/handlers/smart-service.ts) — Protokol 13.
 * Mock'lu clientDB (DB/Redis/ağ YOK). Bugüne kadar bu serviste test yoktu (audit TB-01: %0).
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));

import SmartService from '@api/rpc/handlers/smart-service';

let orderModel: any, productModel: any, customerModel: any, claimModel: any;

function chain(result: any[] = []) {
  const c: any = {};
  c.sort = jest.fn(() => c);
  c.limit = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

function makeService(request: any) {
  const svc: any = new SmartService(42, request);
  svc.clientDB = {
    getOrderModel: () => orderModel,
    getProductModel: () => productModel,
    getCustomerModel: () => customerModel,
    getClaimModel: () => claimModel,
  };
  return svc;
}

beforeEach(() => {
  orderModel = { find: jest.fn(() => chain([{ _id: 'o1' }])) };
  customerModel = { find: jest.fn(() => chain([{ _id: 'c1' }])) };
  productModel = { aggregate: jest.fn(async () => [{ _id: 'p1' }]) };
  claimModel = { aggregate: jest.fn(async () => [{ _id: 'cl1' }]) };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('SmartService.unifiedSearch', () => {
  it('kısa/boş sorgu: DB sorgusu atılmaz, dört boş dizi döner', async () => {
    for (const q of [undefined, '', ' a ', 'a']) {
      const res = await makeService({ query: q }).unifiedSearch();
      expect(res).toEqual({ orders: [], products: [], customers: [], claims: [] });
    }
    expect(orderModel.find).not.toHaveBeenCalled();
  });

  it('dört koleksiyonda paralel arama; sonuçlar {orders, products, customers, claims} olarak döner', async () => {
    const res = await makeService({ query: 'ali veli' }).unifiedSearch();
    expect(res).toEqual({ orders: [{ _id: 'o1' }], products: [{ _id: 'p1' }], customers: [{ _id: 'c1' }], claims: [{ _id: 'cl1' }] });
  });

  it('kelimeler boşlukla ayrılır ve AND ($and) ile birleşir; her kelime için alan başına $regex (case-insensitive)', async () => {
    await makeService({ query: 'ali veli' }).unifiedSearch();
    const filter = orderModel.find.mock.calls[0][0];
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[0].$or[0]).toEqual({ orderNumber: { $regex: 'ali', $options: 'i' } });
    expect(filter.$and[1].$or[0]).toEqual({ orderNumber: { $regex: 'veli', $options: 'i' } });
  });

  it('[ADR-0021 2026-09-28 / GV-02] sipariş araması `dates.orderDate` ile sıralanır ve onu döndürür (eskiden şemada olmayan üst düzey `orderDate`)', async () => {
    await makeService({ query: 'ali' }).unifiedSearch();
    const [, projection] = orderModel.find.mock.calls[0];
    expect(projection['dates.orderDate']).toBe(1);
    expect(projection.orderDate).toBeUndefined();
    const c = orderModel.find.mock.results[0].value;
    expect(c.sort).toHaveBeenCalledWith({ 'dates.orderDate': -1 });
    expect(c.limit).toHaveBeenCalledWith(10);
  });

  it('[ADR-0021 2026-09-28 / GV-01] regex meta karakterleri kaçırılır (dört koleksiyonda da; eskiden ham girdi)', async () => {
    await makeService({ query: '(a+)+$ x.y' }).unifiedSearch();
    const filter = orderModel.find.mock.calls[0][0];
    expect(filter.$and[0].$or[0].orderNumber.$regex).toBe('\\(a\\+\\)\\+\\$');
    expect(filter.$and[1].$or[0].orderNumber.$regex).toBe('x\\.y');
    const prodMatch = productModel.aggregate.mock.calls[0][0].find((s: any) => s.$match).$match;
    expect(prodMatch.$and[0].$or[0].title.$regex).toBe('\\(a\\+\\)\\+\\$');
    const claimMatch = claimModel.aggregate.mock.calls[0][0].find((s: any) => s.$match).$match;
    expect(claimMatch.$and[1].$or[0].externalClaimId.$regex).toBe('x\\.y');
    expect(customerModel.find.mock.calls[0][0].$and[0].$or[0].firstName.$regex).toBe('\\(a\\+\\)\\+\\$');
  });

  it('[ADR-0021 2026-09-28 / GV-01] ReDoS koruması: sorgu 100 karakterle, kelime sayısı 5 ile sınırlanır; nesne girdisi (operatör enjeksiyonu) boş sonuç', async () => {
    await makeService({ query: 'a'.repeat(500) }).unifiedSearch();
    expect(orderModel.find.mock.calls[0][0].$and[0].$or[0].orderNumber.$regex.length).toBe(100);
    orderModel.find.mockClear();
    await makeService({ query: 'aa bb cc dd ee ff gg' }).unifiedSearch();
    expect(orderModel.find.mock.calls[0][0].$and).toHaveLength(5);
    orderModel.find.mockClear();
    const res = await makeService({ query: { $ne: 'x' } }).unifiedSearch();
    expect(res).toEqual({ orders: [], products: [], customers: [], claims: [] });
    expect(orderModel.find).not.toHaveBeenCalled();
  });

  it('hata loglanır ve yeniden fırlatılır', async () => {
    productModel.aggregate.mockRejectedValue(new Error('boom'));
    await expect(makeService({ query: 'ali' }).unifiedSearch()).rejects.toThrow('boom');
  });
});

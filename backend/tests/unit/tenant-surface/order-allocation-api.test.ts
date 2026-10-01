import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// N6 / ADR-0004: sipariş kalemi `allocationState` ve varyant `reserved/allocations` alanlarının API yüzeyi.
// DB/Redis/ağ YOK: clientDB sahte modellerdir.

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import OrderService from '../../../src/api/rpc/handlers/order-service';
import ProductService from '../../../src/api/rpc/handlers/product-service';
import { ORDER_ITEM_ALLOCATION_STATES } from '../../../src/operations/stock/allocationStates';
import { deriveAvailable } from '../../../src/interfaces/stock';

let orderModel: any;
const make = (request: any): any => {
  const svc: any = new OrderService(4, request);
  svc.clientDB = { getOrderModel: () => orderModel };
  return svc;
};
const facet = (orders: any[]) => [{ totalNumberOfRecords: [{ count: orders.length }], orders }];

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  orderModel = { aggregate: jest.fn(async () => facet([])) };
});
afterEach(() => { jest.restoreAllMocks(); });

const matchOf = () => (orderModel.aggregate.mock.calls[0][0] as any[])[0].$match;

describe('OrderService.getOrders: allocationState (kalem düzeyi) API\'den döner ve filtrelenebilir', () => {
  it('yanıt siparişleri projeksiyonsuz döndürür: items[].allocationState / oversoldEscalatedAt aynen geçer (FE için yeterli)', async () => {
    const order = { _id: 'o1', items: [{ externalLineItemId: 'L1', allocationState: 'OVERSOLD', oversoldEscalatedAt: new Date('2026-09-01') }, { externalLineItemId: 'L2', allocationState: 'RESERVED' }] };
    orderModel.aggregate = jest.fn(async () => facet([order]));
    const res = await make({}).getOrders();
    expect(res.orders[0].items.map((i: any) => i.allocationState)).toEqual(['OVERSOLD', 'RESERVED']);
    expect(res.orders[0].items[0].oversoldEscalatedAt).toEqual(new Date('2026-09-01'));
    // pipeline'da $project/$unset yok -> alanlar kesilmez
    const stages = (orderModel.aggregate.mock.calls[0][0] as any[]).map((s) => Object.keys(s)[0]);
    expect(stages).not.toContain('$project');
  });

  it('allocationStates filtresi: en az bir kalemi bu durumlarda olan siparişler ($elemMatch + $in)', async () => {
    await make({ searchOrderForm: { filter: { allocationStates: ['OVERSOLD', 'UNMAPPED'] } } }).getOrders();
    expect(matchOf()).toEqual({ items: { $elemMatch: { allocationState: { $in: ['OVERSOLD', 'UNMAPPED'] } } } });
  });

  it('diğer filtrelerle birleşir; boş dizi/undefined filtre eklemez (mevcut davranış korunur)', async () => {
    await make({ searchOrderForm: { filter: { integrationCodes: ['n11'], internalStatuses: ['APPROVED'], allocationStates: ['OVERSOLD'] } } }).getOrders();
    expect(matchOf()).toEqual({ integrationCode: { $in: ['n11'] }, internalStatus: { $in: ['APPROVED'] }, items: { $elemMatch: { allocationState: { $in: ['OVERSOLD'] } } } });
    orderModel.aggregate.mockClear();
    await make({ searchOrderForm: { filter: { allocationStates: [] } } }).getOrders();
    expect(matchOf()).toEqual({});
    orderModel.aggregate.mockClear();
    await make({ searchOrderForm: { filter: {} } }).getOrders();
    expect(matchOf()).toEqual({});
  });

  it.each([
    [['nope']], [['oversold']], [[{ $ne: 'x' }]], [['OVERSOLD', 1]], ['OVERSOLD'], [{ $in: ['OVERSOLD'] }], [[null]], [[['OVERSOLD']]],
  ])('geçersiz allocationStates %j => 400 ve sorgu ÇALIŞMAZ (operatör enjeksiyonu yok)', async (bad: any) => {
    await expect(make({ searchOrderForm: { filter: { allocationStates: bad } } }).getOrders()).rejects.toMatchObject({ statusCode: 400 });
    expect(orderModel.aggregate).not.toHaveBeenCalled();
  });

  it('ORDER_ITEM_ALLOCATION_STATES, Order.ts şema enum\'uyla birebir eşit (statik)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../src/database/client/models/Order.ts'), 'utf8');
    const m = src.match(/allocationState:\s*\{\s*type:\s*String,\s*enum:\s*\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const fromSchema = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect([...ORDER_ITEM_ALLOCATION_STATES].sort()).toEqual([...fromSchema].sort());
  });
});

describe('Varyant rezervasyon alanları API yüzeyi (ProductService.retrieveProduct)', () => {
  it('varyantlar Variants koleksiyonundan $lookup ile PROJEKSİYONSUZ gelir: stock/reserved/allocations/stockDirty FE\'ye ulaşır; available türetilir', async () => {
    const svc: any = new (ProductService as any)(4, { _id: '64b64c6f5d1b2c0012345678' });
    const variant = { _id: 'v1', stock: 10, reserved: 3, stockDirty: true, allocations: [{ key: 'trendyol:E1:L1', qty: 3, state: 'RESERVED', at: new Date() }] };
    const aggregate = jest.fn(async (_p: any[]) => [{ _id: 'p', variants: [variant] }]);
    svc.clientDB = { getProductModel: () => ({ aggregate }) };
    const res = await svc.retrieveProduct();
    const pipeline = aggregate.mock.calls[0][0] as any[];
    expect(pipeline[1].$lookup).toMatchObject({ from: 'Variants', foreignField: 'productId', as: 'variants' });
    expect(pipeline.some((s) => '$project' in s)).toBe(false);
    const v = res.product.variants[0];
    expect([v.stock, v.reserved, v.stockDirty, v.allocations.length]).toEqual([10, 3, true, 1]);
    expect(deriveAvailable(v)).toBe(7); // available = stock - reserved (türetilir, saklanmaz; FE hesaplar)
  });
});

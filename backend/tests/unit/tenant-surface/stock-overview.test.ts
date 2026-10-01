import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { aggregate, matchDoc } from './_miniAggregate';

// N6: StockService.getStockOverview — tenant stok sağlığı özeti (YALNIZCA OKUMA). DB/Redis/ağ YOK: bellek-içi sahte tenant DB'leri.

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));

import StockService from '../../../src/api/services/stock-service';
import { sanitizeResponse } from '../../../src/api/responseSanitizer';

const D = (s: string) => new Date(s);

function line(over: any = {}) {
  return { externalLineItemId: 'L', externalItemId: 'I', sku: 'SKU', productName: 'Ürün', quantity: 1, unitPrice: 10, allocationState: 'RESERVED', ...over };
}
function order(over: any = {}) {
  return {
    _id: 'o-' + Math.random().toString(36).slice(2), orderNumber: 'ORD', externalOrderId: 'EXT', integrationCode: 'trendyol', dates: { orderDate: D('2026-09-20') },
    billingAddress: { firstName: 'GIZLI-AD', phone: '0555-GIZLI' }, customer: { email: 'gizli@musteri.invalid' }, invoice: { ettn: 'GIZLI-ETTN' },
    items: [line()], ...over,
  };
}

interface TenantData { orders: any[]; variants: any[] }
function fakeClientDb(t: TenantData) {
  return {
    getOrderModel: () => ({ aggregate: jest.fn(async (p: any[]) => aggregate(t.orders, p)) }),
    getVariantModel: () => ({
      aggregate: jest.fn(async (p: any[]) => aggregate(t.variants, p)),
      countDocuments: jest.fn(async (f: any) => {
        if (f.$expr) return t.variants.filter((v) => (v.reserved ?? 0) > (v.stock ?? 0)).length; // $expr: reserved > stock
        return t.variants.filter((v) => matchDoc(v, f)).length;
      }),
    }),
  };
}

const TENANT_A: TenantData = {
  orders: [
    order({ orderNumber: 'A-1', dates: { orderDate: D('2026-09-27') }, items: [line({ externalLineItemId: 'A1L1', sku: 'S1', quantity: 2, allocationState: 'OVERSOLD', oversoldEscalatedAt: D('2026-09-27T10:00:00Z') }), line({ externalLineItemId: 'A1L2', allocationState: 'RESERVED' })] }),
    order({ orderNumber: 'A-2', dates: { orderDate: D('2026-09-26') }, items: [line({ externalLineItemId: 'A2L1', quantity: 3, allocationState: 'OVERSOLD' }), line({ externalLineItemId: 'A2L2', quantity: 1, allocationState: 'UNMAPPED' })] }),
    order({ orderNumber: 'A-3', dates: { orderDate: D('2026-09-25') }, items: [line({ externalLineItemId: 'A3L1', allocationState: 'COMMITTED' })] }),
    order({ orderNumber: 'A-4', dates: { orderDate: D('2026-09-24') }, items: [line({ externalLineItemId: 'A4L1', allocationState: 'UNMAPPED', quantity: 5 })] }),
  ],
  variants: [
    { _id: 'v1', stock: 10, reserved: 4, stockDirty: true },
    { _id: 'v2', stock: 2, reserved: 3 },        // aşırı rezerve
    { _id: 'v3', stock: 5 },                      // reserved alanı yok (eski kayıt)
    { _id: 'v4', stock: 0, reserved: 0, stockDirty: false },
  ],
};
const TENANT_B: TenantData = {
  orders: [order({ orderNumber: 'B-ONLY', items: [line({ externalLineItemId: 'BL1', allocationState: 'OVERSOLD', quantity: 99, sku: 'B-SKU' })] })],
  variants: [{ _id: 'bv', stock: 1000, reserved: 500, stockDirty: true }],
};

let dbByTenant: Record<number, any>;
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  dbByTenant = { 4: fakeClientDb(TENANT_A), 7: fakeClientDb(TENANT_B) };
});
afterEach(() => { jest.restoreAllMocks(); });

const svc = (tenant: number, request: any = {}): any => {
  const s: any = new StockService(tenant, request);
  s.clientDB = dbByTenant[tenant];
  return s;
};

describe('StockService.getStockOverview', () => {
  it('OVERSOLD/UNMAPPED kalem ve adet sayıları; yalnızca dikkat gerektiren kalemli siparişler (en yeni önce)', async () => {
    const r = await svc(4).getStockOverview();
    expect(r.attention).toEqual({ oversold: { lines: 2, units: 5 }, unmapped: { lines: 2, units: 6 } });
    expect(r.recentOrders.map((o: any) => o.orderNumber)).toEqual(['A-1', 'A-2', 'A-4']); // A-3 (yalnız COMMITTED) yok
    // dikkat gerektirmeyen kalemler (RESERVED) siparişten ayıklanır
    expect(r.recentOrders[0].items).toHaveLength(1);
    expect(r.recentOrders[0].items[0]).toEqual({
      externalLineItemId: 'A1L1', sku: 'S1', barcode: null, productName: 'Ürün', quantity: 2, allocationState: 'OVERSOLD',
      lastAllocationAppliedAt: null, oversoldEscalatedAt: D('2026-09-27T10:00:00Z'),
    });
    expect(r.recentOrders[0]).toMatchObject({ integrationCode: 'trendyol', orderDate: D('2026-09-27') });
  });

  it('varyant toplamları: rezerve/kullanılabilir/aşırı rezerve/yayın bekleyen; reserved alanı olmayan kayıt 0 sayılır', async () => {
    const r = await svc(4).getStockOverview();
    expect(r.variants).toEqual({ total: 4, totalStock: 17, reservedUnits: 7, availableUnits: 10, withReservations: 2, overReserved: 1, publishPending: 1 });
  });

  it('mutabakat sonucu kalıcı olmadığından açıkça "izlenmiyor" döner (uydurma zaman damgası yok)', async () => {
    expect((await svc(4).getStockOverview()).reconciliation).toEqual({ tracked: false, lastRunAt: null });
  });

  it('limit: varsayılan 20; 1..50 tamsayı, aksi halde 400 (sorgu çalışmaz)', async () => {
    const r = await svc(4, { limit: 1 }).getStockOverview();
    expect(r.recentOrders).toHaveLength(1);
    for (const bad of [0, 51, 1.5, '5', -1, NaN, {}, []]) {
      await expect(svc(4, { limit: bad }).getStockOverview()).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('tenant DB yoksa (ör. mağaza seçmemiş süper yönetici) 400', async () => {
    const s: any = new StockService(undefined as any, {});
    await expect(s.getStockOverview()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('boş tenant: sıfırlar (hata değil)', async () => {
    dbByTenant[9] = fakeClientDb({ orders: [], variants: [] });
    const r = await svc(9).getStockOverview();
    expect(r.attention).toEqual({ oversold: { lines: 0, units: 0 }, unmapped: { lines: 0, units: 0 } });
    expect(r.recentOrders).toEqual([]);
    expect(r.variants).toEqual({ total: 0, totalStock: 0, reservedUnits: 0, availableUnits: 0, withReservations: 0, overReserved: 0, publishPending: 0 });
  });
});

describe('StockService.getStockOverview: sızıntı ve tenant izolasyonu', () => {
  it('müşteri/adres/fatura alanları ve ham allocations ASLA dönmez; yanıt sanitizer\'ı tetiklemez', async () => {
    const r = await svc(4).getStockOverview();
    const json = JSON.stringify(r);
    for (const leak of ['GIZLI-AD', '0555-GIZLI', 'gizli@musteri', 'GIZLI-ETTN', 'billingAddress', 'customer', 'invoice', 'unitPrice', 'allocations']) {
      expect([leak, json.includes(leak)]).toEqual([leak, false]);
    }
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(sanitizeResponse(r)).toBe(r);
    expect(warn).not.toHaveBeenCalled();
  });

  it('A tenant\'ı B\'nin siparişini/varyantını/sayısını GÖRMEZ; B yalnızca kendisini görür (istek gövdesi tenant seçemez)', async () => {
    const a = await svc(4, { clientId: 7, order: 7, targetClientId: 7, tid: 7 }).getStockOverview();
    expect(JSON.stringify(a)).not.toMatch(/B-ONLY|B-SKU/);
    expect(a.attention.oversold.units).toBe(5); // B'nin 99'u karışmadı
    expect(a.variants.total).toBe(4);
    const b = await svc(7).getStockOverview();
    expect(b.attention.oversold).toEqual({ lines: 1, units: 99 });
    expect(b.recentOrders.map((o: any) => o.orderNumber)).toEqual(['B-ONLY']);
    expect(b.variants).toMatchObject({ total: 1, totalStock: 1000, reservedUnits: 500 });
  });
});

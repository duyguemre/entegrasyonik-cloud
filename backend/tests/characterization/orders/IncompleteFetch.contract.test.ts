// faz4-int-wp7: ortak eksik cekim sozlesmesi + HB paginateOffset + N11 isaretleme (ag YOK).
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { getIncomplete, markIncomplete, carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { paginateOffset } from '@integration/modules/marketplace/hepsiburada/api/paginateOffset';
import { OrderService } from '@integration/modules/marketplace/n11/services/OrderService';

beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

const page = (n: number, from: number) => Array.from({ length: n }, (_, i) => ({ id: from + i }));

describe('IncompleteFetch sozlesmesi', () => {
  it('isaret non-enumerable: JSON/spread/uzunluk etkilenmez; carry yeni diziye tasir', () => {
    const a = markIncomplete([1, 2], { reason: 'PAGINATION_PAGE_CAP', collected: 2 });
    expect(JSON.stringify(a)).toBe('[1,2]');
    expect(getIncomplete([...a])).toBeUndefined();
    expect(getIncomplete(carryIncomplete(a, [9]))).toMatchObject({ incomplete: true, reason: 'PAGINATION_PAGE_CAP' });
    expect(getIncomplete(carryIncomplete([], [9]))).toBeUndefined();
  });
});

describe('HB paginateOffset isaretleme', () => {
  it('kayit tavani -> incomplete RECORD_CAP, dizi icerigi ayni', async () => {
    const r = await paginateOffset(async (o, l) => ({ items: page(l, o), total: 1000 }), { operation: 't', maxRecords: 200 });
    expect(r).toHaveLength(200);
    expect(getIncomplete(r)).toMatchObject({ reason: 'PAGINATION_RECORD_CAP', collected: 200 });
  });
  it('sayfa tavani -> PAGE_CAP', async () => {
    const r = await paginateOffset(async (o, l) => ({ items: page(l, o) }), { operation: 't', maxPages: 3 });
    expect(getIncomplete(r)?.reason).toBe('PAGINATION_PAGE_CAP');
  });
  it('tekrar eden sayfa -> REPEATED_PAGE', async () => {
    const r = await paginateOffset(async (_o, l) => ({ items: page(l, 0) }), { operation: 't' });
    expect(getIncomplete(r)?.reason).toBe('PAGINATION_REPEATED_PAGE');
  });
  it('normal tamamlanma -> isaret YOK', async () => {
    const r = await paginateOffset(async () => ({ items: page(5, 0) }), { operation: 't' });
    expect(getIncomplete(r)).toBeUndefined();
  });
});

describe('N11 OrderService isaretleme', () => {
  const build = (fn: (p: any) => any) => {
    const svc = new OrderService({ clientId: 5, integrationSettings: { settings: {}, urls: {} } }, {} as any);
    (svc as any).connector = { fetchOrdersRest: jest.fn(async (p: any) => fn(p)), fetchOrdersFromPlatform: jest.fn() };
    return svc;
  };
  it('sayfa tavani -> donen paket dizisi incomplete', async () => {
    const svc = build((p) => ({ totalElements: 999999, content: Array.from({ length: 100 }, (_, i) => ({ id: p.currentPage * 100 + i, orderNumber: `N${p.currentPage * 100 + i}`, lines: [] })) }));
    const r = await svc.fetchOrders();
    expect(getIncomplete(r)?.reason).toBe('PAGINATION_PAGE_CAP');
  });
  it('endDate verilirse istek penceresine gecer', async () => {
    const svc = build(() => ({ totalElements: 0, content: [] }));
    await svc.fetchOrders({ lastSyncTimestamp: '2026-01-01T00:00:00.000Z', endDate: '2026-01-01T06:00:00.000Z' });
    expect(((svc as any).connector.fetchOrdersRest as any).mock.calls[0][0].endDate).toBe(Date.parse('2026-01-01T06:00:00.000Z'));
  });
});

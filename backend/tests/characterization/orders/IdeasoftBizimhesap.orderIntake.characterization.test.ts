/**
 * CHARACTERIZATION (faz4-conf-fix / conformance C9b): Ideasoft + Bizimhesap OrderService ciktisi -> OrderWorker -> siparis kaydi.
 * Kanit: motor `pkg.order` / `pkg.customer.firstName` okur (IOrderPackage). Duz nesne donen adaptorler worker'da patlar
 * ya da siparisi hic kaydetmez. Bu test YERLESIK OrderService'leri (HTTP stub'li Service) gercek OrderWorker'a baglar.
 * DB/Redis/ag YOK; veriler sentetik.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Types } from 'mongoose';

jest.mock('@integration/engine/order/OrderRepository', () => ({ OrderRepository: jest.fn() }));
jest.mock('@integration/engine/order/CustomerRepository', () => ({ CustomerRepository: jest.fn() }));
jest.mock('@integration/engine/order/ClaimRepository', () => ({ ClaimRepository: jest.fn() }));
jest.mock('@integration/engine/order/InvoiceRepository', () => ({ InvoiceRepository: jest.fn() }));
jest.mock('@integration/engine/order/MessageRepository', () => ({ MessageRepository: jest.fn() }));
jest.mock('@integration/engine/order/FinancialRepository', () => ({ FinancialRepository: jest.fn() }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@services/statistics/StatisticsTracker', () => ({
  StatisticsTracker: { track: jest.fn(), trackMany: jest.fn() },
}));
// [ADR-0004 Aşama B] OrderWorker artık saveOrders sonrası PostOrderOperations sürücüsünü tetikliyor;
// bu characterization dosyası OrderWorker'ın KENDİ davranışını sabitler, StockAllocator/PostOrderOperations
// tarafı `tests/characterization/stock/PostOrderOperations.characterization.test.ts`'te AYRICA test edilir.
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getClientDB: jest.fn() } }));
jest.mock('@operations/integration/PostOrderOperations', () => ({ PostOrderOperations: jest.fn() }));

import { OrderWorker } from '@integration/engine/order/OrderWorker';
import { OrderRepository } from '@integration/engine/order/OrderRepository';
import { CustomerRepository } from '@integration/engine/order/CustomerRepository';
import { ClaimRepository } from '@integration/engine/order/ClaimRepository';
import { InvoiceRepository } from '@integration/engine/order/InvoiceRepository';
import { MessageRepository } from '@integration/engine/order/MessageRepository';
import { FinancialRepository } from '@integration/engine/order/FinancialRepository';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { StatisticsTracker } from '@services/statistics/StatisticsTracker';
import { DatabaseManagerInstance } from '@database/index';
import { PostOrderOperations } from '@operations/integration/PostOrderOperations';

import { OrderService as IdeasoftOrderService } from '@integration/modules/ecommerce/ideasoft/services/OrderService';
import { OrderService as BizimhesapOrderService } from '@integration/modules/erp/bizimhesap/services/OrderService';

const anyFn = (): any => jest.fn();
let orderRepo: any;
let customerRepo: any;

const ideasoftRaw = {
  id: 'ID-1', orderNumber: 'IDN-1', status: 'new', createdAt: '2026-09-01T10:00:00Z',
  customer: { name: 'Ayse Demir', email: 'a@example.invalid', phone: '05550000000' },
  shippingAddress: { firstName: 'Ayse', lastName: 'Demir', address: 'Test Mah. 1', city: 'Istanbul', phone: '05550000000' },
  orderLines: [{ id: 'IL-1', product: { name: 'Urun', barcode: 'BC-1', sku: 'SKU-1' }, quantity: 2, price: 10 }],
  totalPrice: 20,
};
const bizimhesapRaw = {
  id: 'BH-1', orderNumber: 'BHN-1', status: 'Created', orderDate: 1780000000000,
  customerFirstName: 'Zeynep', customerLastName: 'Kaya', customerEmail: 'z@example.invalid',
  shipmentAddress: { firstName: 'Zeynep', lastName: 'Kaya', address1: 'Test Mah. 1', city: 'Istanbul', phone: '05550001122' },
  lines: [{ id: 'BL-1', productName: 'Urun', barcode: 'BC-1', quantity: 2, amount: 10 }],
  grossAmount: 20,
};

const cases: Array<[string, string, () => any, string, string]> = [
  ['ideasoft', 'Ideasoft', () => new IdeasoftOrderService({ clientId: 1, integrationSettings: { urls: {} } },
    { get: anyFn().mockResolvedValue({ data: [ideasoftRaw] }) } as any), 'ID-1', 'Ayse'],
  ['bizimhesap', 'Bizimhesap', () => new BizimhesapOrderService({ clientId: 1, integrationSettings: { urls: { orderListUrl: 'http://x/o/<SELLERID>' }, settings: { sellerId: '1' } } },
    { get: anyFn().mockResolvedValue({ data: { content: [bizimhesapRaw], totalPages: 1 } }) } as any), 'BH-1', 'Zeynep'],
];

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  orderRepo = {
    saveOrders: anyFn().mockResolvedValue({ insertedExternalIds: [], updatedExternalIds: [] }),
    updateLastSyncTimestamp: anyFn().mockResolvedValue(undefined),
    updateSourceSyncCursor: anyFn().mockResolvedValue(undefined),
  };
  customerRepo = {
    saveCustomer: anyFn().mockResolvedValue(new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa')),
    updateOrderMetrics: anyFn().mockResolvedValue(undefined),
    updateClaimMetrics: anyFn().mockResolvedValue(undefined),
  };
  (OrderRepository as any).mockImplementation(() => orderRepo);
  (CustomerRepository as any).mockImplementation(() => customerRepo);
  (ClaimRepository as any).mockImplementation(() => ({ saveClaims: anyFn().mockResolvedValue({ insertedExternalIds: [], updatedExternalIds: [] }) }));
  (InvoiceRepository as any).mockImplementation(() => ({ saveInvoices: anyFn().mockResolvedValue({ insertedExternalIds: [] }) }));
  (MessageRepository as any).mockImplementation(() => ({ saveMessages: anyFn().mockResolvedValue(undefined) }));
  (FinancialRepository as any).mockImplementation(() => ({ saveFinancials: anyFn().mockResolvedValue(undefined) }));
  (DatabaseManagerInstance.getClientDB as any).mockReset().mockResolvedValue({});
  (PostOrderOperations as any).mockReset().mockImplementation(() => ({ processOrdersByExternalIds: anyFn().mockResolvedValue(undefined) }));
});
afterEach(() => { jest.restoreAllMocks(); });

describe.each(cases)('%s: OrderService -> OrderWorker -> siparis kaydi (C9b)', (code, _label, makeSvc, extId, first) => {
  it('mock yanit motorda IOrderPackage olarak islenir: siparis kaydedilir (externalOrderId, kalemler, musteri adi)', async () => {
    const svc = makeSvc();
    const integration = { retrieveOrders: (q: any) => svc.fetchOrders(q), retrieveClaims: anyFn(), retrieveMessages: anyFn(), retrieveFinancials: anyFn() };
    (IntegrationFactory as any).mockImplementation(() => ({ getInstance: anyFn().mockResolvedValue(integration) }));

    await new OrderWorker().process({ clientId: 1, integrationCode: code, lastSyncTimestamp: '2026-09-01T00:00:00.000Z' } as any);

    expect(orderRepo.saveOrders).toHaveBeenCalledTimes(1);
    const saved = orderRepo.saveOrders.mock.calls[0][1];
    expect(saved).toHaveLength(1);
    expect(saved[0].externalOrderId).toBe(extId);
    expect(saved[0].integrationCode).toBe(code);
    expect(saved[0].items).toHaveLength(1);
    expect(saved[0].items[0].quantity).toBe(2);
    expect(saved[0].financials.grandTotal).toBe(20);
    expect(customerRepo.saveCustomer.mock.calls[0][1].firstName).toBe(first);
  });
});

describe('Bizimhesap OrderService: kimlik/satir kimligi (C7b + satir) ve checkBatchProduct (C8b)', () => {
  const svc = (content: any[]) => new BizimhesapOrderService(
    { clientId: 1, integrationSettings: { urls: { orderListUrl: 'http://x/o/<SELLERID>' }, settings: { sellerId: '1' } } },
    { get: anyFn().mockResolvedValue({ data: { content, totalPages: 1 } }) } as any);

  it('kimliksiz siparis atlanir; 3+ ve tumu kimliksizse VALIDATION ORDER_SCHEMA_DRIFT', async () => {
    const r = await svc([{ status: 'x', lines: [] }, bizimhesapRaw]).fetchOrders();
    expect(r.map((p: any) => p.order.externalOrderId)).toEqual(['BH-1']);
    await expect(svc([{}, {}, {}]).fetchOrders()).rejects.toMatchObject({ code: 'VALIDATION', platformCode: 'ORDER_SCHEMA_DRIFT' });
    expect(await svc([{}, {}]).fetchOrders()).toEqual([]);
  });

  it('kimliksiz satir atlanir; tum satirlari kimliksiz siparis atlanir', async () => {
    const mixed = { ...bizimhesapRaw, lines: [{ quantity: 1 }, { id: 'L2', quantity: 1, amount: 5 }] };
    const allBad = { ...bizimhesapRaw, id: 'BH-2', lines: [{ quantity: 1 }] };
    const r = await svc([mixed, allBad]).fetchOrders();
    expect(r).toHaveLength(1);
    expect((r[0] as any).order.items.map((i: any) => i.externalLineItemId)).toEqual(['L2']);
  });
});

describe('checkBatchProduct: batch kavrami yok => NOT_SUPPORTED (undefined yalniz "sonuclanmadi" icin)', () => {
  it('Ideasoft ve Bizimhesap NOT_SUPPORTED firlatir', async () => {
    const { ProductService: IdP } = (require('@integration/modules/ecommerce/ideasoft/services/ProductService') as typeof import('@integration/modules/ecommerce/ideasoft/services/ProductService'));
    const { ProductService: BhP } = (require('@integration/modules/erp/bizimhesap/services/ProductService') as typeof import('@integration/modules/erp/bizimhesap/services/ProductService'));
    for (const P of [IdP, BhP] as any[]) {
      const p = new P({ clientId: 1, integrationSettings: { urls: {}, settings: {} } }, {} as any);
      await expect(p.checkBatchProduct({ trackingId: 'T', mode: 'UPDATE_STOCK' })).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    }
  });
});

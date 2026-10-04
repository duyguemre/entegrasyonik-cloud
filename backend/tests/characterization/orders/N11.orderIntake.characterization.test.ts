/**
 * CHARACTERIZATION (faz4-n11-intake / INT-07 bulgusu): N11 OrderService (REST ve SOAP kollari) -> gercek OrderWorker.process -> saveOrders.
 * Soru: N11 OrderMapper ciktisi flags/meta/kargo/currencyCode iskeletinden yoksun; motor bunu guvenle ele aliyor mu?
 * OrderWorker'in pkg/order uzerinde OKUDUGU alanlar: pkg.customer (+firstName/lastName), pkg.order.items[].totalPrice/unitPrice/quantity/sku,
 * pkg.order.financials?.{shippingFee,grandTotal}, pkg.order.externalOrderId, pkg.order.customerId (yazar), pkg.order.fulfillment (|| [] ile tamamlar),
 * pkg.claims/pkg.invoices (opsiyonel, guard'li). flags/meta/currencyCode'u worker HIC OKUMAZ; OrderRepository yalniz existingOrder.flags okur ve
 * mevcut kayitta `flags`i zaten siler; eksik flags/currencyCode sema varsayilanlariyla (Orders semasi) dolar.
 * Bu test bunu (worker + gercek Mongoose sema dogrulamasi, DB'siz) kanitlar. HTTP: Service cephesi stub'li (gercek ag YOK); veriler sentetik.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Types, model } from 'mongoose';

jest.mock('@database/repositories/tenant/OrderRepository', () => ({ OrderRepository: jest.fn() }));
jest.mock('@database/repositories/tenant/CustomerRepository', () => ({ CustomerRepository: jest.fn() }));
jest.mock('@database/repositories/tenant/ClaimRepository', () => ({ ClaimRepository: jest.fn() }));
jest.mock('@database/repositories/tenant/InvoiceRepository', () => ({ InvoiceRepository: jest.fn() }));
jest.mock('@database/repositories/tenant/MessageRepository', () => ({ MessageRepository: jest.fn() }));
jest.mock('@database/repositories/tenant/FinancialRepository', () => ({ FinancialRepository: jest.fn() }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@services/statistics/StatisticsTracker', () => ({ StatisticsTracker: { track: jest.fn(), trackMany: jest.fn() } }));
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getClientDB: jest.fn() } }));
jest.mock('@operations/orders/postOrder', () => ({ PostOrderOperations: jest.fn() }));

import { OrderWorker } from '@integration/engine/order/OrderWorker';
import { OrderRepository } from '@database/repositories/tenant/OrderRepository';
import { CustomerRepository } from '@database/repositories/tenant/CustomerRepository';
import { ClaimRepository } from '@database/repositories/tenant/ClaimRepository';
import { InvoiceRepository } from '@database/repositories/tenant/InvoiceRepository';
import { MessageRepository } from '@database/repositories/tenant/MessageRepository';
import { FinancialRepository } from '@database/repositories/tenant/FinancialRepository';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { DatabaseManagerInstance } from '@database/index';
import { PostOrderOperations } from '@operations/orders/postOrder';
import { OrderService } from '@integration/modules/marketplace/n11/services/OrderService';
import { OrderSchema } from '@database/client/models/Order';

const anyFn = (): any => jest.fn();
let orderRepo: any;
let customerRepo: any;

const restRaw = {
  id: 77, orderNumber: 'N11-REST-1', shipmentPackageStatus: 'Created', lastModifiedDate: 1780000000000,
  customerEmail: 'a@example.invalid', customerfullName: 'Ayse Demir',
  billingAddress: { fullName: 'Ayse Demir', address: 'Test Mah. 1', city: 'Istanbul', district: 'Kadikoy', gsm: '5550000000' },
  shippingAddress: { fullName: 'Ayse Demir', address: 'Test Mah. 1', city: 'Istanbul', district: 'Kadikoy', gsm: '5550000000' },
  totalAmount: '20',
  lines: [{ quantity: 2, productId: 9, productName: 'Urun', stockCode: 'SKU-1', price: '10', orderLineId: 5 }],
};
const soapRaw = {
  orderNumber: 'N11-SOAP-1', status: 'Created', createDate: '10/01/2026 08:30',
  buyer: { fullName: 'Ali Veli', email: 'v@example.invalid' },
  shippingAddress: { address: 'Test Mah. 2', city: 'Ankara', district: 'Cankaya' }, totalAmount: '20',
  orderItemList: { orderItem: { id: 'I1', productId: 'P1', productName: 'Urun', sellerStockCode: 'SKU-1', quantity: '2', price: '10' } },
};

const restSvc = () => ({ rest: { get: anyFn().mockResolvedValue({ content: [restRaw], totalElements: 1 }) }, soapRequest: anyFn() });
// REST beklenen sekilde degil (content[] yok) -> SOAP'a bilincli dusus
const soapSvc = () => ({ rest: { get: anyFn().mockResolvedValue({}) }, soapRequest: anyFn().mockResolvedValue({ orderList: { order: [soapRaw] } }) });

const cases: Array<[string, () => any, string, string, string]> = [
  ['REST', restSvc, 'N11-REST-1', 'Ayse Demir', '77'],
  ['SOAP', soapSvc, 'N11-SOAP-1', 'Ali Veli', 'N11-SOAP-1'],
];

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  orderRepo = {
    saveOrders: anyFn().mockResolvedValue({ insertedExternalIds: [], updatedExternalIds: [] }),
    updateLastSyncTimestamp: anyFn().mockResolvedValue(undefined),
    recordSyncFailure: anyFn().mockResolvedValue(undefined),
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

describe.each(cases)('N11 %s: OrderService -> OrderWorker -> siparis kaydi', (_kol, makeSvc, orderNumber, first, extId) => {
  const run = async () => {
    const svc = new OrderService({ clientId: 1, integrationSettings: { urls: {} } }, makeSvc() as any);
    const integration = { retrieveOrders: (q: any) => svc.fetchOrders(q), retrieveClaims: anyFn(), retrieveMessages: anyFn(), retrieveFinancials: anyFn() };
    (IntegrationFactory as any).mockImplementation(() => ({ getInstance: anyFn().mockResolvedValue(integration) }));
    await new OrderWorker().process({ clientId: 1, integrationCode: 'n11', lastSyncTimestamp: '2026-01-01T00:00:00.000Z' } as any);
    expect(orderRepo.saveOrders).toHaveBeenCalledTimes(1);
    return orderRepo.saveOrders.mock.calls[0][1][0];
  };

  it('siparis patlamadan saveOrders a ulasir: externalOrderId, kalem, toplam, musteri adi', async () => {
    const saved = await run();
    expect(saved.externalOrderId).toBe(extId);
    expect(saved.orderNumber).toBe(orderNumber);
    expect(saved.integrationCode).toBe('n11');
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0].quantity).toBe(2);
    expect(saved.items[0].totalPrice).toBe(20);
    expect(saved.financials.grandTotal).toBe(20);
    expect(saved.platformDiscrepancy).toBeUndefined(); // kalem toplami == platform toplami
    expect(saved.customerFirstName).toBe(first);
    expect(saved.customerId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(customerRepo.saveCustomer.mock.calls[0][1].firstName).toBe(first);
    expect(saved.fulfillment).toEqual([]); // worker tamamlar
  });

  it('iskelet alanlari (flags/currencyCode) mapper ciktisinda YOK ama kalici sema bunlari varsayilanlarla doldurur ve dokuman gecerlidir', async () => {
    const saved = await run();
    expect(saved.flags).toBeUndefined();
    expect(saved.financials.currencyCode).toBeUndefined();
    expect(saved.meta).toBeDefined();
    const Doc = model(`N11IntakeProbe_${Date.now()}_${Math.random()}`, OrderSchema);
    const doc: any = new Doc(saved);
    expect(doc.validateSync()).toBeUndefined(); // zorunlu alanlar (adres, kalem, finans, tarih) tam
    expect(doc.flags.isAllocated).toBe(false);
    expect(doc.flags.isInvoiceGenerated).toBe(false);
    expect(doc.financials.currencyCode).toBe('TRY');
    expect(doc.internalStatus).toBe('UNAPPROVED');
  });
});

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// API_TENANT_SURFACE §6: politika kaydına alınan (salt-okunur / düşük riskli) mevcut servis metotlarının davranışı + eklenen sertleştirmeler.
// DB/Redis/ağ YOK: clientDB sahte modellerdir.

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import FinancialService, { CARGO_INVOICES_MAX_ROWS } from '../../../src/api/rpc/handlers/financial-service';
import ShipmentService, { MAX_SHIPMENTS_PAGE_LIMIT } from '../../../src/api/rpc/handlers/shipment-service';
import NotificationService from '../../../src/api/rpc/handlers/notification-service';
import ClaimService from '../../../src/api/rpc/handlers/claim-service';
import OrderService from '../../../src/api/rpc/handlers/order-service';

function chain(result: any) {
  const c: any = {};
  for (const m of ['sort', 'skip', 'limit', 'select', 'populate']) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  c.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
  return c;
}
const withDb = (svc: any, db: any) => { svc.clientDB = db; return svc; };

beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => undefined); jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

describe('FinancialService.getCargoInvoices / getPayoutDetails / getFinancialSummary', () => {
  it('getCargoInvoices: filtreler aynen uygulanır (mevcut davranış), sonuç en yeni önce ve ÜST SINIRLI (eskiden sınırsız)', async () => {
    const c = chain([{ _id: 1 }]);
    const find = jest.fn(() => c);
    const svc = withDb(new (FinancialService as any)(4, { integrationCode: 'trendyol', invoiceNumber: 'INV1', orderNumber: 'O1', startDate: '2026-09-01', endDate: '2026-09-30' }), { getCargoInvoiceModel: () => ({ find }) });
    expect(await svc.getCargoInvoices()).toEqual([{ _id: 1 }]);
    expect(find).toHaveBeenCalledWith({ integrationCode: 'trendyol', invoiceNumber: 'INV1', orderNumber: 'O1', transactionDate: { $gte: new Date('2026-09-01'), $lte: new Date('2026-09-30') } });
    expect(c.sort).toHaveBeenCalledWith({ transactionDate: -1 });
    expect(c.limit).toHaveBeenCalledWith(CARGO_INVOICES_MAX_ROWS);
    expect(CARGO_INVOICES_MAX_ROWS).toBe(5000);
  });

  it('getPayoutDetails: skaler paymentOrderId ile sorgular (mevcut davranış); eksik => hata; nesne/operatör => 400 ve sorgu ATILMAZ', async () => {
    const find = jest.fn(() => chain([{ paymentOrderId: 'P1' }]));
    const mk = (req: any) => withDb(new (FinancialService as any)(4, req), { getFinancialTransactionModel: () => ({ find }) });
    expect(await mk({ paymentOrderId: 'P1' }).getPayoutDetails()).toEqual([{ paymentOrderId: 'P1' }]);
    expect(find).toHaveBeenCalledWith({ paymentOrderId: 'P1' });
    await mk({ paymentOrderId: 123 }).getPayoutDetails();
    find.mockClear();
    await expect(mk({}).getPayoutDetails()).rejects.toThrow('paymentOrderId');
    for (const bad of [{ $ne: null }, ['a'], true]) {
      await expect(mk({ paymentOrderId: bad }).getPayoutDetails()).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(find).not.toHaveBeenCalled();
  });

  it('getFinancialSummary: yalnızca tenant DB\'sinde toplulaştırır; sonuç yoksa sıfırlar (mevcut davranış)', async () => {
    const aggregate = jest.fn(async (_p: any[]) => [] as any[]);
    const svc = withDb(new (FinancialService as any)(4, { integrationCodes: ['trendyol'], transactionTypes: ['SALE'] }), { getFinancialTransactionModel: () => ({ aggregate }) });
    expect(await svc.getFinancialSummary()).toEqual({ totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 });
    expect((aggregate.mock.calls[0][0] as any[])[0].$match).toEqual({ integrationCode: { $in: ['trendyol'] }, transactionType: { $in: ['SALE'] } });
  });
});

describe('ShipmentService.getShipments', () => {
  const facet = [{ totalNumberOfRecords: [{ count: 30 }], orders: [{ _id: 'o1' }, { _id: 'o2' }] }];
  const mk = (req: any) => {
    const aggregate = jest.fn(async (_p: any[]) => facet);
    return { svc: withDb(new (ShipmentService as any)(4, req), { getOrderModel: () => ({ aggregate }) }), aggregate };
  };

  it('geçerli sayfalama: $sort(varsayılan _id)/$skip/$limit uygulanır, fromTo hesaplanır (mevcut davranış korundu)', async () => {
    const { svc, aggregate } = mk({ pagination: { page: 2, limit: 10 } });
    const r = await svc.getShipments();
    const facetStage = (aggregate.mock.calls[0][0] as any[])[2].$facet;
    expect((aggregate.mock.calls[0][0] as any[])[1]).toEqual({ $sort: { _id: 1 } }); // [DB-02] $facet dışında
    expect(facetStage.orders).toEqual([{ $skip: 10 }, { $limit: 10 }]);
    expect(r).toMatchObject({ totalNumberOfRecords: 30, fromTo: { from: 11, to: 12 } });
  });

  it('pagination eksikse varsayılan {1,15} (eskiden TypeError/500)', async () => {
    const { svc, aggregate } = mk({});
    await svc.getShipments();
    expect((aggregate.mock.calls[0][0] as any[])[1]).toEqual({ $sort: { _id: 1 } });
    expect((aggregate.mock.calls[0][0] as any[])[2].$facet.orders).toEqual([{ $skip: 0 }, { $limit: 15 }]);
  });

  it.each([
    [{ pagination: { page: 0, limit: 10 } }], [{ pagination: { page: 1.5, limit: 10 } }], [{ pagination: { page: '1', limit: 10 } }],
    [{ pagination: { page: 1, limit: 0 } }], [{ pagination: { page: 1, limit: 101 } }], [{ pagination: { page: 1, limit: 1e9 } }], [{ pagination: { page: 1, limit: '10' } }],
    [{ pagination: { page: 1e9, limit: 10 } }],
  ])('geçersiz/sınırsız sayfalama %j => 400 ve sorgu atılmaz', async (req: any) => {
    const { svc, aggregate } = mk(req);
    await expect(svc.getShipments()).rejects.toMatchObject({ statusCode: 400 });
    expect(aggregate).not.toHaveBeenCalled();
    expect(MAX_SHIPMENTS_PAGE_LIMIT).toBe(100);
  });

  // [MM-08 / ADR-0021 aynı desen] `sortBy.key` DOĞRULAMASIZ bir nesneye yazılıyordu; `ShipmentService/getShipments`
  // capabilities registry ile DIŞARIYA AÇIK bir RPC'dir (shipments.ts) — keyfi alan adı enjeksiyon riski.
  it('[DÜZELTME, MM-08, KASITLI TERS ÇEVRİLDİ] sortBy.key artık İZİN LİSTESİYLE doğrulanır — bilinmeyen alan 400 fırlatır (eskiden doğrulamasız bir nesneye yazılıyordu)', async () => {
    // OrderService.getOrders'ın ADR-0021/GV-01 ile kapattığı AYNI riski (keyfi alan adı doğrulamasız yazılabiliyordu) kapatır.
    for (const key of ['$where', 'password', 'billingAddress.phone', { $gt: 1 }]) {
      const { svc, aggregate } = mk({ sortBy: { key, order: 'asc' } });
      await expect(svc.getShipments()).rejects.toMatchObject({ statusCode: 400 });
      expect(aggregate).not.toHaveBeenCalled();
    }
  });

  it('[DÜZELTME, MM-08 + $sort ölü-kod düzeltmesi, 2026-09-29] izin listesindeki alanlar (price dahil, "prices.price"e eşlenir — MEVCUT eşleme KORUNDU) 400 FIRLATMAZ; facet.orders dalına artık $sort UYGULANIR', async () => {
    for (const key of ['price', 'orderNumber', 'externalOrderId', 'internalStatus', 'integrationCode', '_id']) {
      const { svc, aggregate } = mk({ sortBy: { key, order: 'asc' } });
      await expect(svc.getShipments()).resolves.toMatchObject({ totalNumberOfRecords: 30 });
      const field = key === 'price' ? 'prices.price' : key;
      expect((aggregate.mock.calls[0][0] as any[])[1]).toEqual({ $sort: { [field]: 1 } });
    }
  });

  it('[DÜZELTİLDİ, 2026-09-29] sortBy verilmezse varsayılan {_id:1} ile $sort uygulanır (ÖNCEDEN $sort hiç yoktu, sıralama sessizce yok sayılıyordu)', async () => {
    const { svc, aggregate } = mk({});
    await expect(svc.getShipments()).resolves.toMatchObject({ totalNumberOfRecords: 30 });
    expect((aggregate.mock.calls[0][0] as any[])[1]).toEqual({ $sort: { _id: 1 } });
  });
});

describe('NotificationService.getUnreadCount', () => {
  it('yalnızca okunmamış + silinmemiş bildirimleri sayar', async () => {
    const countDocuments = jest.fn(async () => 7);
    const svc = withDb(new (NotificationService as any)(4, { principal: { sub: 'u1', tid: 4 } }), { getNotificationModel: () => ({ countDocuments }) });
    expect(await svc.getUnreadCount()).toEqual({ result: true, unreadCount: 7 });
    // [ADR-0029 NB4 / N-01] kullanıcı kapsamlı + arşivsiz
    expect(countDocuments).toHaveBeenCalledWith({ userId: 'u1', isRead: false, isDeleted: false, isArchived: { $ne: true } });
  });
});

describe('ClaimService.getClaimById', () => {
  it('tenant DB\'sinde id ile tek talep; müşteri ve sipariş özeti populate edilir; yoksa hata', async () => {
    const populate2 = jest.fn(async () => ({ _id: 'c1' }));
    const populate1 = jest.fn(() => ({ populate: populate2 }));
    const findById = jest.fn(() => ({ populate: populate1 }));
    const svc = withDb(new (ClaimService as any)(4, { claimId: 'c1' }), { getClaimModel: () => ({ findById }) });
    expect(await svc.getClaimById()).toEqual({ _id: 'c1' });
    expect(findById).toHaveBeenCalledWith('c1');
    expect(populate1).toHaveBeenCalledWith('customerId');
    expect(populate2).toHaveBeenCalledWith('orderId', 'orderNumber status');

    const none = jest.fn(async () => null);
    const svc2 = withDb(new (ClaimService as any)(4, { claimId: 'zz' }), { getClaimModel: () => ({ findById: () => ({ populate: () => ({ populate: none }) }) }) });
    await expect(svc2.getClaimById()).rejects.toThrow('Talep bulunamadı.');
  });
});

describe('OrderService.markAsPrinted', () => {
  it('yalnızca yerel bayrak + platformActions kaydı yazar (dış çağrı YOK); IntegrationFactory kullanılmaz', async () => {
    const findByIdAndUpdate = jest.fn(async () => ({ _id: 'o1', flags: { isBarcodePrinted: true } }));
    const svc = withDb(new (OrderService as any)(4, { orderId: 'o1' }), { getOrderModel: () => ({ findByIdAndUpdate }) });
    const r = await svc.markAsPrinted();
    expect(r.success).toBe(true);
    const [id, update] = findByIdAndUpdate.mock.calls[0] as any[];
    expect(id).toBe('o1');
    expect(update.$set).toEqual({ 'flags.isBarcodePrinted': true });
    expect(update.$push.platformActions).toMatchObject({ actionType: 'BARCODE_PRINT', platform: 'SYSTEM', status: 'SUCCESS' });
    expect(Object.keys(update).sort()).toEqual(['$push', '$set']);
    expect(require('@integration/modules/IntegrationFactory').default).not.toHaveBeenCalled();
  });
});

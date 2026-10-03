/**
 * CHARACTERIZATION: OrderWorker.process (sipariş sync bütünlüğü)
 * Kaynak: backend/src/integration/engine/order/OrderWorker.ts
 *
 * Bağımlılıkların hepsi jest.mock ile değiştirilir: repository'ler, IntegrationFactory (dolayısıyla
 * pazaryeri bağlayıcıları + DatabaseManager zinciri) ve StatisticsTracker. DB/Redis/ağ YOK.
 * Veriler sentetiktir.
 *
 * [ADR-0005 adım 2/3] BACKLOG C7 kapandı + Karar 7 (kaynak başına ayrı imleç + gating) uygulandı:
 *  - Sipariş çekim HATASI artık işi FAIL ETTİRİR (throw) -- eskiden yutulup lastSync YİNE DE ilerletiliyordu.
 *  - Sipariş imleci artık `syncStartAt - 5 dk` (300 sn örtüşme) ile yazılır, `new Date()` DEĞİL.
 *  - İade/finans/mesaj pencereleri artık `OrderQueueProducer`'da hesaplanıp jobData ile TAŞINIR; OrderWorker
 *    bu pencereleri OLDUĞU GİBİ ilgili retrieve çağrılarına geçirir (kendi hesaplama mantığı KALDIRILDI).
 *    `jobData.claimSync`/`financeSync`/`messageSync` alanı YOKSA o kaynak bu turda hiç ÇAĞRILMAZ (gating).
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

const CUSTOMER_OID = new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

const anyFn = (): any => jest.fn();
let integration: any;
let orderRepo: any;
let customerRepo: any;
let claimRepo: any;
let invoiceRepo: any;
let messageRepo: any;
let financialRepo: any;
let postOrderOpsInstance: any;

function makePkg(externalOrderId: string, opts: { items?: number[]; shipping?: number; grandTotal?: number } = {}) {
  const prices = opts.items ?? [100];
  const items = prices.map((p, i) => ({ sku: `SKU${i}`, unitPrice: p, quantity: 1, totalPrice: p }));
  const shipping = opts.shipping ?? 0;
  return {
    customer: { firstName: 'Ayse', lastName: 'Test' },
    order: {
      externalOrderId,
      integrationCode: 'trendyol',
      items,
      financials: { shippingFee: shipping, grandTotal: opts.grandTotal ?? prices.reduce((a, b) => a + b, 0) + shipping },
    } as any,
    claims: [] as any[],
    invoices: [] as any[],
  };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);

  integration = {
    retrieveOrders: anyFn().mockResolvedValue([]),
    retrieveClaims: anyFn().mockResolvedValue([]),
    retrieveMessages: anyFn().mockResolvedValue([]),
    retrieveFinancials: anyFn().mockResolvedValue([]),
  };
  (IntegrationFactory as any).mockImplementation(() => ({ getInstance: anyFn().mockResolvedValue(integration) }));

  orderRepo = {
    saveOrders: anyFn().mockResolvedValue({ insertedExternalIds: [], updatedExternalIds: [] }),
    updateLastSyncTimestamp: anyFn().mockResolvedValue(undefined),
    updateSourceSyncCursor: anyFn().mockResolvedValue(undefined),
  };
  customerRepo = {
    saveCustomer: anyFn().mockResolvedValue(CUSTOMER_OID),
    updateOrderMetrics: anyFn().mockResolvedValue(undefined),
    updateClaimMetrics: anyFn().mockResolvedValue(undefined),
  };
  claimRepo = { saveClaims: anyFn().mockResolvedValue({ insertedExternalIds: [], updatedExternalIds: [] }) };
  invoiceRepo = { saveInvoices: anyFn().mockResolvedValue({ insertedExternalIds: [] }) };
  messageRepo = { saveMessages: anyFn().mockResolvedValue(undefined) };
  financialRepo = { saveFinancials: anyFn().mockResolvedValue(undefined) };

  (OrderRepository as any).mockImplementation(() => orderRepo);
  (CustomerRepository as any).mockImplementation(() => customerRepo);
  (ClaimRepository as any).mockImplementation(() => claimRepo);
  (InvoiceRepository as any).mockImplementation(() => invoiceRepo);
  (MessageRepository as any).mockImplementation(() => messageRepo);
  (FinancialRepository as any).mockImplementation(() => financialRepo);
  (StatisticsTracker.track as any).mockClear();
  (StatisticsTracker.trackMany as any).mockClear();

  // [ADR-0004 Aşama B] varsayılan: clientDB bulunur, PostOrderOperations sürücüsü no-op başarıyla döner.
  postOrderOpsInstance = { processOrdersByExternalIds: anyFn().mockResolvedValue(undefined) };
  (DatabaseManagerInstance.getClientDB as any).mockReset().mockResolvedValue({});
  (PostOrderOperations as any).mockReset().mockImplementation(() => postOrderOpsInstance);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const CLAIM_WINDOW = { due: true as const, startDate: new Date('2026-01-09T10:00:00.000Z'), endDate: new Date('2026-01-10T10:00:00.000Z'), isFullSweep: false };
const FINANCE_WINDOW = { due: true as const, startDate: new Date('2025-12-11T10:00:00.000Z'), endDate: new Date('2026-01-10T10:00:00.000Z'), isFullSweep: false };
const MESSAGE_WINDOW = { due: true as const, startDate: new Date('2026-01-10T05:00:00.000Z'), isFullSweep: false };

// [ADR-0005 Karar 7] JOB varsayılan olarak her üç kaynağın da "sırası gelmiş" (due) sayıldığı bir tur
// temsil eder -- gating'e özgü testler bu alanları kasıtlı olarak ÇIKARIR.
const JOB = {
  clientId: 7 as any,
  integrationCode: 'trendyol',
  lastSyncTimestamp: '2026-01-10T10:00:00.000Z',
  claimSync: CLAIM_WINDOW,
  financeSync: FINANCE_WINDOW,
  messageSync: MESSAGE_WINDOW,
};
const trackedOps = () => (StatisticsTracker.trackMany as any).mock.calls[0][0] as any[];

describe('OrderWorker.process - başarılı akış', () => {
  it('[MEVCUT DAVRANIŞ] yeni sipariş kaydeder, müşteri metriğini yalnızca inserted için artırır, lastSync ilerletir', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1', { items: [100], shipping: 20 }), makePkg('ORD-2', { items: [50] })]);
    // ORD-1 yeni, ORD-2 yalnızca güncelleme
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: ['ORD-2'] });

    const res = await new OrderWorker().process(JOB);

    expect(res).toEqual({
      clientId: 7,
      integrationCode: 'trendyol',
      processedOrderCount: 2, // inserted + updated
      insertedIds: ['ORD-1'],
      updatedIds: ['ORD-2'],
    });
    expect(orderRepo.saveOrders).toHaveBeenCalledTimes(1);
    expect(orderRepo.saveOrders.mock.calls[0][0]).toBe(7); // clientId Number'a çevrilir
    // Yalnızca inserted olan ORD-1 (120 TL, 1 sipariş) metrik olarak sayılır; ORD-2 sayılmaz
    expect(customerRepo.updateOrderMetrics).toHaveBeenCalledTimes(1);
    expect(customerRepo.updateOrderMetrics).toHaveBeenCalledWith(7, CUSTOMER_OID, 120, 1);
    expect(orderRepo.updateLastSyncTimestamp).toHaveBeenCalledTimes(1);
    expect(orderRepo.updateLastSyncTimestamp.mock.calls[0].slice(0, 2)).toEqual([7, 'trendyol']);
    expect(StatisticsTracker.track).not.toHaveBeenCalled();
    expect(trackedOps().map((o) => [o.operationType, o.status])).toEqual([
      ['ORDER_SYNC', 'SUCCESS'], ['CLAIM_SYNC', 'SUCCESS'], ['MESSAGE_SYNC', 'SUCCESS'], ['FINANCIAL_SYNC', 'SUCCESS'],
    ]);
  });

  it('[MEVCUT DAVRANIŞ] sipariş aktarımı müşteri alanlarını order üzerine yazar ve fulfillment dizisini garanti eder', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1')]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: [] });

    await new OrderWorker().process(JOB);

    const saved = orderRepo.saveOrders.mock.calls[0][1][0];
    expect(saved.customerId).toBe(CUSTOMER_OID.toString());
    expect(saved.customerFirstName).toBe('Ayse');
    expect(saved.customerLastName).toBe('Test');
    expect(saved.fulfillment).toEqual([]);
  });

  it('[ADR-0005 adım 3] jobData.claimSync/financeSync/messageSync pencereleri OLDUĞU GİBİ ilgili retrieve çağrılarına geçirilir (pencere hesabı artık OrderQueueProducer\'da -- bkz. OrderQueueProducer.characterization.test.ts)', async () => {
    await new OrderWorker().process(JOB);

    expect(integration.retrieveOrders).toHaveBeenCalledWith({ lastSyncTimestamp: JOB.lastSyncTimestamp });
    expect(integration.retrieveClaims).toHaveBeenCalledWith({ startDate: CLAIM_WINDOW.startDate, endDate: CLAIM_WINDOW.endDate });
    expect(integration.retrieveMessages).toHaveBeenCalledWith({ startDate: MESSAGE_WINDOW.startDate });
    expect(integration.retrieveFinancials).toHaveBeenCalledWith({ startDate: FINANCE_WINDOW.startDate, endDate: FINANCE_WINDOW.endDate });
  });

  it('[ADR-0005 adım 2] sipariş imleci `syncStartAt - 5 dk` (300 sn örtüşme) ile yazılır -- `Date.now()`/`new Date()` DEĞİL (BACKLOG C7)', async () => {
    const now = Date.parse('2026-02-01T12:00:00.000Z');
    jest.useFakeTimers({ now });

    await new OrderWorker().process(JOB);

    const written = orderRepo.updateLastSyncTimestamp.mock.calls[0][2] as Date;
    expect(written.getTime()).toBe(now - 5 * 60 * 1000);
  });
});

describe('OrderWorker.process - kaynak başına gating (ADR-0005 Karar 7 — YENİ)', () => {
  it('[YENİ DAVRANIŞ] jobData.claimSync/financeSync/messageSync alanları YOKSA o kaynaklar HİÇ ÇAĞRILMAZ (dış çağrı yapılmaz, kota tasarrufu)', async () => {
    const jobNoGating = { clientId: 7, integrationCode: 'trendyol', lastSyncTimestamp: '2026-01-10T10:00:00.000Z' };

    await new OrderWorker().process(jobNoGating as any);

    expect(integration.retrieveOrders).toHaveBeenCalledTimes(1);
    expect(integration.retrieveClaims).not.toHaveBeenCalled();
    expect(integration.retrieveMessages).not.toHaveBeenCalled();
    expect(integration.retrieveFinancials).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] atlanan kaynaklar için StatisticsTracker.trackMany kaydı OLUŞTURULMAZ (yalnızca ORDER_SYNC)', async () => {
    const jobNoGating = { clientId: 7, integrationCode: 'trendyol', lastSyncTimestamp: '2026-01-10T10:00:00.000Z' };
    await new OrderWorker().process(jobNoGating as any);
    expect(trackedOps().map((o) => o.operationType)).toEqual(['ORDER_SYNC']);
  });

  it('[YENİ DAVRANIŞ] atlanan kaynaklar için per-source imleç güncellenmez (updateSourceSyncCursor hiç çağrılmaz)', async () => {
    const jobNoGating = { clientId: 7, integrationCode: 'trendyol', lastSyncTimestamp: '2026-01-10T10:00:00.000Z' };
    await new OrderWorker().process(jobNoGating as any);
    expect(orderRepo.updateSourceSyncCursor).not.toHaveBeenCalled();
    // Sipariş imleci gating'den BAĞIMSIZDIR, her turda ilerler
    expect(orderRepo.updateLastSyncTimestamp).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ] claimSync DENENDİ ve BAŞARILIYSA lastClaimSync = syncStartAt ile ilerletilir', async () => {
    const now = Date.parse('2026-02-01T12:00:00.000Z');
    jest.useFakeTimers({ now });

    await new OrderWorker().process(JOB);

    expect(orderRepo.updateSourceSyncCursor).toHaveBeenCalledWith(7, 'trendyol', 'lastClaimSync', new Date(now));
    expect(orderRepo.updateSourceSyncCursor).toHaveBeenCalledWith(7, 'trendyol', 'lastFinanceSync', new Date(now));
    expect(orderRepo.updateSourceSyncCursor).toHaveBeenCalledWith(7, 'trendyol', 'lastMessageSync', new Date(now));
    // Full sweep DEĞİL -> lastClaimFullSweepAt/lastFinanceFullSweepAt YAZILMAZ
    expect(orderRepo.updateSourceSyncCursor).not.toHaveBeenCalledWith(7, 'trendyol', 'lastClaimFullSweepAt', expect.anything());
  });

  it('[YENİ DAVRANIŞ] claimSync.isFullSweep=true ise lastClaimFullSweepAt de syncStartAt ile ayrıca yazılır', async () => {
    const now = Date.parse('2026-02-01T12:00:00.000Z');
    jest.useFakeTimers({ now });
    const jobFullSweep = { ...JOB, claimSync: { ...CLAIM_WINDOW, isFullSweep: true } };

    await new OrderWorker().process(jobFullSweep);

    expect(orderRepo.updateSourceSyncCursor).toHaveBeenCalledWith(7, 'trendyol', 'lastClaimSync', new Date(now));
    expect(orderRepo.updateSourceSyncCursor).toHaveBeenCalledWith(7, 'trendyol', 'lastClaimFullSweepAt', new Date(now));
  });

  it('[YENİ DAVRANIŞ] claimSync DENENDİ ama retrieveClaims REDDEDİLDİYSE lastClaimSync İLERLEMEZ (diğer imleçler etkilenmez)', async () => {
    integration.retrieveClaims.mockRejectedValue(new Error('claims 500'));

    await new OrderWorker().process(JOB);

    expect(orderRepo.updateSourceSyncCursor).not.toHaveBeenCalledWith(7, 'trendyol', 'lastClaimSync', expect.anything());
    expect(orderRepo.updateSourceSyncCursor).toHaveBeenCalledWith(7, 'trendyol', 'lastFinanceSync', expect.anything());
    expect(orderRepo.updateSourceSyncCursor).toHaveBeenCalledWith(7, 'trendyol', 'lastMessageSync', expect.anything());
  });
});

describe('OrderWorker.process - webhook sağlık sinyali: lastOrderDetectedAt (ADR-0005 Karar 8 — YENİ)', () => {
  it('[YENİ DAVRANIŞ] GERÇEKTEN yeni sipariş bulunduysa (insertedExternalIds.length>0) lastOrderDetectedAt = syncStartAt ile ilerletilir', async () => {
    const now = Date.parse('2026-02-01T12:00:00.000Z');
    jest.useFakeTimers({ now });
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1')]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: [] });

    await new OrderWorker().process(JOB);

    expect(orderRepo.updateSourceSyncCursor).toHaveBeenCalledWith(7, 'trendyol', 'lastOrderDetectedAt', new Date(now));
  });

  it('[YENİ DAVRANIŞ] yalnızca GÜNCELLENEN (insertedExternalIds boş) sipariş varsa lastOrderDetectedAt İLERLEMEZ', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1')]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: [], updatedExternalIds: ['ORD-1'] });

    await new OrderWorker().process(JOB);

    expect(orderRepo.updateSourceSyncCursor).not.toHaveBeenCalledWith(7, 'trendyol', 'lastOrderDetectedAt', expect.anything());
  });

  it('[YENİ DAVRANIŞ] hiç sipariş yoksa (dört kaynak da boş) lastOrderDetectedAt İLERLEMEZ', async () => {
    await new OrderWorker().process(JOB);
    expect(orderRepo.updateSourceSyncCursor).not.toHaveBeenCalledWith(7, 'trendyol', 'lastOrderDetectedAt', expect.anything());
  });
});

describe('OrderWorker.process - fiyat tutarsızlığı (gizli iş kuralı)', () => {
  it('[MEVCUT DAVRANIŞ] |hesaplanan-platform| > 0.1 ise platformDiscrepancy PRICE_MISMATCH işaretlenir, sipariş yine de kaydedilir', async () => {
    const pkg = makePkg('ORD-1', { items: [100], shipping: 10, grandTotal: 115 }); // hesap 110, platform 115
    integration.retrieveOrders.mockResolvedValue([pkg]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: [] });

    await new OrderWorker().process(JOB);

    const saved = orderRepo.saveOrders.mock.calls[0][1][0];
    expect(saved.platformDiscrepancy).toMatchObject({ hasDiscrepancy: true, reason: 'PRICE_MISMATCH', differenceAmount: 5 });
  });

  it('[MEVCUT DAVRANIŞ] fark eşiğin (0.1) altındaysa (0.05) tutarsızlık işaretlenmez', async () => {
    // eşik: Math.abs(hesaplanan - platform) > 0.1
    const pkg = makePkg('ORD-1', { items: [100], shipping: 0, grandTotal: 100.05 });
    integration.retrieveOrders.mockResolvedValue([pkg]);
    await new OrderWorker().process(JOB);
    expect(orderRepo.saveOrders.mock.calls[0][1][0].platformDiscrepancy).toBeUndefined();
  });
});

describe('OrderWorker.process - C7: sipariş çekimi başarısız -> iş FAIL EDER (ADR-0005 adım 2, BACKLOG C7 kapandı)', () => {
  it('[ADR-0005 adım 2 — TERS ÇEVRİLDİ] retrieveOrders reddedilirse process() de REDDEDİLİR (BullMQ retry/DLQ tetiklenir) -- ÖNCEKİ DAVRANIŞ: hata yutulup lastSync YİNE DE ilerletiliyordu (siparişler sessizce kayboluyordu)', async () => {
    integration.retrieveOrders.mockRejectedValue(new Error('Trendyol 500'));
    integration.retrieveMessages.mockResolvedValue([{ externalMessageId: 'M1' }]);

    await expect(new OrderWorker().process(JOB)).rejects.toThrow('Trendyol 500');

    expect(orderRepo.saveOrders).not.toHaveBeenCalled();
    expect(messageRepo.saveMessages).not.toHaveBeenCalled();
    expect(orderRepo.updateLastSyncTimestamp).not.toHaveBeenCalled();
    expect(orderRepo.updateSourceSyncCursor).not.toHaveBeenCalled();
    expect(StatisticsTracker.track).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 7, integrationCode: 'trendyol', operationType: 'ORDER_SYNC', status: 'FAILED', errorMessage: 'Trendyol 500',
    }));
    expect(StatisticsTracker.trackMany).not.toHaveBeenCalled();
  });

  it('[ADR-0005 adım 2] IntegrationError\'ın `[CODE] ...` mesaj öneki korunur (worker-runner/OrderErrorHandler sınıflandırması buna dayanır)', async () => {
    integration.retrieveOrders.mockRejectedValue(new Error('[UNAVAILABLE] Trendyol 503'));
    await expect(new OrderWorker().process(JOB)).rejects.toThrow('[UNAVAILABLE] Trendyol 503');
  });

  it('[ADR-0005 adım 2 — TERS ÇEVRİLDİ] dört kaynağın hepsi reddedilse de öncelik SİPARİŞ hatasınındır: process() REDDEDİLİR -- ÖNCEKİ DAVRANIŞ: hepsi boş sonuçla "başarıyla" resolve olurdu', async () => {
    for (const m of ['retrieveOrders', 'retrieveClaims', 'retrieveMessages', 'retrieveFinancials']) integration[m].mockRejectedValue(new Error('down'));

    await expect(new OrderWorker().process(JOB)).rejects.toThrow('down');
    expect(orderRepo.updateLastSyncTimestamp).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ, korunuyor] retrieveOrders BAŞARILI ([] döner) ama diğerleri hata verirse iş FAIL ETMEZ (yalnızca sipariş çekim HATASI işi fail ettirir, boş sonuç değil)', async () => {
    integration.retrieveOrders.mockResolvedValue([]);
    integration.retrieveFinancials.mockResolvedValue([{ id: 'F1' }]);

    await new OrderWorker().process(JOB);

    expect(orderRepo.updateLastSyncTimestamp).toHaveBeenCalledTimes(1);
    expect(trackedOps().find((o) => o.operationType === 'ORDER_SYNC')).toMatchObject({ status: 'SUCCESS' });
  });
});

describe('OrderWorker.process - kısmi hata ve kalıcılık hatası', () => {
  it('[MEVCUT DAVRANIŞ] iade çekimi reddedilirse siparişler yine işlenir; CLAIM_SYNC FAILED, ORDER_SYNC SUCCESS, lastClaimSync İLERLEMEZ', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1')]);
    integration.retrieveClaims.mockRejectedValue(new Error('claims 500'));
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: [] });

    const res = await new OrderWorker().process(JOB);

    expect(res.processedOrderCount).toBe(1);
    expect(orderRepo.updateLastSyncTimestamp).toHaveBeenCalledTimes(1);
    const ops = trackedOps();
    expect(ops.find((o) => o.operationType === 'CLAIM_SYNC')).toMatchObject({ status: 'FAILED', errorMessage: 'claims 500' });
    expect(ops.find((o) => o.operationType === 'ORDER_SYNC')).toMatchObject({ status: 'SUCCESS', inserted: 1, updated: 0, fetched: 1 });
    expect(orderRepo.updateSourceSyncCursor).not.toHaveBeenCalledWith(7, 'trendyol', 'lastClaimSync', expect.anything());
  });

  it('[MEVCUT DAVRANIŞ] saveOrders fırlatırsa: hata yeniden fırlatılır (BullMQ retry mümkün), lastSync ilerlemez, ORDER_SYNC FAILED izlenir', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1')]);
    orderRepo.saveOrders.mockRejectedValue(new Error('db yazma hatası'));

    await expect(new OrderWorker().process(JOB)).rejects.toThrow('db yazma hatası');

    expect(orderRepo.updateLastSyncTimestamp).not.toHaveBeenCalled();
    expect(StatisticsTracker.track).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 7, integrationCode: 'trendyol', operationType: 'ORDER_SYNC', status: 'FAILED', errorMessage: 'db yazma hatası',
    }));
  });

  it('[MEVCUT DAVRANIŞ] getInstance (factory) fırlatırsa süreç fırlatır ve FAILED izlenir', async () => {
    (IntegrationFactory as any).mockImplementation(() => ({ getInstance: anyFn().mockRejectedValue(new Error('entegrasyon yok')) }));
    await expect(new OrderWorker().process(JOB)).rejects.toThrow('entegrasyon yok');
    expect(StatisticsTracker.track).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
    expect(orderRepo.updateLastSyncTimestamp).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] sipariş içi fatura ve iadeler ayrı repository çağrılarına gider; müşteri kimliği atanır; güncellenen iade metrik artırmaz', async () => {
    const pkg = makePkg('ORD-1');
    pkg.claims = [{ externalClaimId: 'C9', totalRefundAmount: 10 }];
    pkg.invoices = [{ invoiceNumber: 'INV1' }];
    integration.retrieveOrders.mockResolvedValue([pkg]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: [] });
    invoiceRepo.saveInvoices.mockResolvedValue({ insertedExternalIds: ['INV1'] });
    claimRepo.saveClaims.mockResolvedValue({ insertedExternalIds: [], updatedExternalIds: ['C9'] });

    await new OrderWorker().process(JOB);

    expect(invoiceRepo.saveInvoices).toHaveBeenCalledWith(7, [{ invoiceNumber: 'INV1', customerId: CUSTOMER_OID }]);
    expect(claimRepo.saveClaims).toHaveBeenCalledWith(7, [{ externalClaimId: 'C9', totalRefundAmount: 10, customerId: CUSTOMER_OID }]);
    expect(customerRepo.updateClaimMetrics).not.toHaveBeenCalled();
  });

  it('[ADR-0005 adım 3 — TERS ÇEVRİLDİ] dört kaynak da BAŞARIYLA boş dönerse (gerçekten yeni veri yok): erken dönüş YOK, sipariş imleci YİNE DE ilerler -- ÖNCEKİ DAVRANIŞ: bu durumda updateLastSyncTimestamp HİÇ ÇAĞRILMAZDI (imleç sonsuza dek ilerlemezdi)', async () => {
    const res = await new OrderWorker().process(JOB);
    expect(res.processedOrderCount).toBe(0);
    expect(orderRepo.updateLastSyncTimestamp).toHaveBeenCalledTimes(1);
    expect(orderRepo.saveOrders).toHaveBeenCalledWith(7, []); // boş dizi ile çağrılır (repository içeride no-op)
  });
});

describe('OrderWorker.process - ADR-0004 Aşama B (PostOrderOperations tetikleme)', () => {
  it('[YENİ DAVRANIŞ] saveOrders sonrası inserted+updated ID\'leriyle PostOrderOperations.processOrdersByExternalIds çağrılır', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1'), makePkg('ORD-2')]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: ['ORD-2'] });
    const fakeClientDb = { marker: 'client-db' };
    (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(fakeClientDb);

    await new OrderWorker().process(JOB);

    expect(DatabaseManagerInstance.getClientDB).toHaveBeenCalledWith(7);
    expect(PostOrderOperations).toHaveBeenCalledWith(fakeClientDb);
    expect(postOrderOpsInstance.processOrdersByExternalIds).toHaveBeenCalledWith(7, 'trendyol', ['ORD-1', 'ORD-2']);
  });

  it('[YENİ DAVRANIŞ] inserted/updated ID yoksa (bu turda yeni/değişen sipariş yok) PostOrderOperations HİÇ örneklenmez', async () => {
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: [], updatedExternalIds: [] });

    await new OrderWorker().process(JOB);

    expect(DatabaseManagerInstance.getClientDB).not.toHaveBeenCalled();
    expect(PostOrderOperations).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] clientDB bulunamazsa (null/undefined) PostOrderOperations ÖRNEKLENMEZ, sync yine de başarıyla tamamlanır', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1')]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: [] });
    (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(null);

    const res = await new OrderWorker().process(JOB);

    expect(PostOrderOperations).not.toHaveBeenCalled();
    expect(res.processedOrderCount).toBe(1);
  });

  it('[YENİ DAVRANIŞ] allocation sürücüsü hata fırlatırsa İZOLE edilir: sync YİNE DE başarıyla tamamlanır, imleç YİNE DE ilerler (15dk süpürme telafi eder)', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1')]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: [] });
    postOrderOpsInstance.processOrdersByExternalIds.mockRejectedValue(new Error('allocation boom'));

    const res = await new OrderWorker().process(JOB);

    expect(res.processedOrderCount).toBe(1);
    expect(orderRepo.updateLastSyncTimestamp).toHaveBeenCalledTimes(1);
    expect(StatisticsTracker.track).not.toHaveBeenCalled(); // FAILED olarak izlenmez, sync başarılı sayılır
  });

  it('[YENİ DAVRANIŞ] DatabaseManagerInstance.getClientDB fırlatırsa da İZOLE edilir (sync FAIL ETMEZ)', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('ORD-1')]);
    orderRepo.saveOrders.mockResolvedValue({ insertedExternalIds: ['ORD-1'], updatedExternalIds: [] });
    (DatabaseManagerInstance.getClientDB as any).mockRejectedValue(new Error('db down'));

    await expect(new OrderWorker().process(JOB)).resolves.toEqual(expect.objectContaining({ processedOrderCount: 1 }));
  });
});

// faz4-int-wp7: OrderWorker eksik cekim (incomplete) davranisi. Bkz. contracts/IncompleteFetch.ts
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Types } from 'mongoose';

// [ADR-0029 NB3] NOTIFY_V2_ENABLED bayragi test-icinde acilip kapatilir (varsayilan kapali = eski yol).
let mockV2 = false;
jest.mock('@config', () => {
  const actual: any = jest.requireActual('@config');
  const notify = { get v2Enabled() { return mockV2; }, emailEnabled: false };
  return { ...actual, config: new Proxy(actual.config, { get: (t, k) => (k === 'notify' ? notify : t[k]) }) };
});
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

import { OrderWorker, resetOrderWindowOverflowState, OVERFLOW_BACKOFF_AFTER, OVERFLOW_BACKOFF_BASE_MS, OVERFLOW_NOTIFY_INTERVAL_MS } from '@integration/engine/order/OrderWorker';
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
  resetOrderWindowOverflowState();
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


import { markIncomplete } from '@integration/contracts/IncompleteFetch';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { NotificationService } from '@services/notification/NotificationService';
import { getDefinition } from '@operations/notifications/catalog';

const trackedOps = () => (StatisticsTracker.trackMany as any).mock.calls[0][0] as any[];
const JOB = { clientId: 7 as any, integrationCode: 'hepsiburada', lastSyncTimestamp: new Date(Date.now() - 6 * 3600_000).toISOString() };
const incompleteList = (n: number, reason: any = 'PAGINATION_RECORD_CAP') => markIncomplete(Array.from({ length: n }, (_, i) => makePkg(`O${i}`)), { reason, collected: n });

describe('[faz4-int-wp7] OrderWorker - eksik cekim sozlesmesi', () => {
  let notify: jest.SpiedFunction<typeof NotificationService.sendClientNotification>;
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    notify = jest.spyOn(NotificationService, 'sendClientNotification').mockResolvedValue(undefined as any);
  });

  it('normal (isaretsiz) sonuc: imec ilerler, uyari yok, retrieveOrders tek cagri', async () => {
    integration.retrieveOrders.mockResolvedValue([makePkg('A')]);
    await new OrderWorker().process(JOB);
    expect(orderRepo.updateLastSyncTimestamp).toHaveBeenCalledTimes(1);
    expect(integration.retrieveOrders).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('tavan ve daraltmalarla da tam cekilemezse: imec ILERLEMEZ, kismi veri kaydedilir, uyari gider, tur basi tavan', async () => {
    integration.retrieveOrders.mockImplementation(async () => incompleteList(2));
    await new OrderWorker().process(JOB);
    // 6 saatlik pencere: 3h, 1.5h, 45dk(<minWindow 1h) -> 1 + 2 daraltma
    expect(integration.retrieveOrders.mock.calls.length).toBe(3);
    expect(orderRepo.saveOrders).toHaveBeenCalledTimes(1);
    expect(orderRepo.updateLastSyncTimestamp).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect((notify.mock.calls[0][0] as any).notificationData.metaData).toMatchObject({ code: 'ORDER_WINDOW_OVERFLOW', reason: 'PAGINATION_RECORD_CAP', failed: false });
    expect(trackedOps().find((o) => o.operationType === 'ORDER_SYNC')).toMatchObject({ status: 'SUCCESS' });
  });

  it('tekrar eden sayfa (REPEATED_PAGE) da imeci ilerletmez', async () => {
    integration.retrieveOrders.mockImplementation(async () => incompleteList(1, 'PAGINATION_REPEATED_PAGE'));
    await new OrderWorker().process(JOB);
    expect(orderRepo.updateLastSyncTimestamp).not.toHaveBeenCalled();
  });

  it('ilk cekim eksik, daraltilmis pencere TAM ise: imec pencere sonu - ortusme ile ilerler (now degil), endDate gecirilir', async () => {
    integration.retrieveOrders
      .mockResolvedValueOnce(incompleteList(3))
      .mockResolvedValueOnce([makePkg('B')]);
    const t0 = new Date(JOB.lastSyncTimestamp).getTime();
    await new OrderWorker().process(JOB);
    expect(integration.retrieveOrders).toHaveBeenCalledTimes(2);
    const q = integration.retrieveOrders.mock.calls[1][0];
    const end = new Date(q.endDate).getTime();
    expect(end).toBeGreaterThan(t0);
    expect(end).toBeLessThan(Date.now() - 3600_000);
    const written = orderRepo.updateLastSyncTimestamp.mock.calls[0][2] as Date;
    expect(written.getTime()).toBe(end - 300_000);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('Trendyol ORDER_WINDOW_OVERFLOW (firlatma) mevcut davranis: is FAIL, imec ilerlemez; ek olarak bildirim', async () => {
    const err = new IntegrationError('VALIDATION', 'tasti', { integrationCode: 'trendyol', clientId: 7, operation: 'fetchOrdersFromPlatform', platformCode: 'ORDER_WINDOW_OVERFLOW' });
    integration.retrieveOrders.mockRejectedValue(err);
    await expect(new OrderWorker().process({ ...JOB, integrationCode: 'trendyol' })).rejects.toBe(err);
    expect(orderRepo.updateLastSyncTimestamp).not.toHaveBeenCalled();
    expect((notify.mock.calls[0][0] as any).notificationData.metaData).toMatchObject({ failed: true });
  });

  it('eksik iade cekimi: lastClaimSync ilerlemez, siparis imeci etkilenmez', async () => {
    const W = { due: true as const, startDate: new Date('2026-01-09T10:00:00.000Z'), endDate: new Date('2026-01-10T10:00:00.000Z'), isFullSweep: false };
    integration.retrieveClaims.mockResolvedValue(markIncomplete([], { reason: 'PAGINATION_PAGE_CAP', collected: 5000 }));
    await new OrderWorker().process({ ...JOB, claimSync: W } as any);
    expect(orderRepo.updateSourceSyncCursor).not.toHaveBeenCalledWith(7, 'hepsiburada', 'lastClaimSync', expect.anything());
    expect(orderRepo.updateLastSyncTimestamp).toHaveBeenCalledTimes(1);
  });
});

describe('[faz4-int-qa1] OrderWorker - kalici tasma: bildirim siniri + geri cekilme', () => {
  let notify: jest.SpiedFunction<typeof NotificationService.sendClientNotification>;
  let now: number;
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    notify = jest.spyOn(NotificationService, 'sendClientNotification').mockResolvedValue(undefined as any);
    now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  const job = () => ({ ...JOB, lastSyncTimestamp: new Date(now - 6 * 3600_000).toISOString() });

  it('ayni tenant+entegrasyon+neden icin bildirim saatte en fazla bir kez; sure dolunca tekrar gider', async () => {
    integration.retrieveOrders.mockImplementation(async () => incompleteList(2));
    await new OrderWorker().process(job());
    await new OrderWorker().process(job());
    expect(notify).toHaveBeenCalledTimes(1);
    now += OVERFLOW_NOTIFY_INTERVAL_MS + 1;
    await new OrderWorker().process(job());
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('farkli tenant icin sinir ayri islenir', async () => {
    integration.retrieveOrders.mockImplementation(async () => incompleteList(2));
    await new OrderWorker().process(job());
    await new OrderWorker().process({ ...job(), clientId: 8 as any });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it(`art arda ${OVERFLOW_BACKOFF_AFTER} cozulemeyen turdan sonra daraltma denenmez (tur basi tek cagri); bekleme dolunca yeniden denenir`, async () => {
    integration.retrieveOrders.mockImplementation(async () => incompleteList(2));
    for (let i = 0; i < OVERFLOW_BACKOFF_AFTER; i++) await new OrderWorker().process(job());
    integration.retrieveOrders.mockClear();
    await new OrderWorker().process(job());
    expect(integration.retrieveOrders).toHaveBeenCalledTimes(1);
    expect(orderRepo.updateLastSyncTimestamp).not.toHaveBeenCalled();

    now += OVERFLOW_BACKOFF_BASE_MS + 1;
    integration.retrieveOrders.mockClear();
    await new OrderWorker().process(job());
    expect(integration.retrieveOrders.mock.calls.length).toBeGreaterThan(1);
  });

  it('tasmasiz tur geri cekilme durumunu sifirlar', async () => {
    integration.retrieveOrders.mockImplementation(async () => incompleteList(2));
    for (let i = 0; i < OVERFLOW_BACKOFF_AFTER; i++) await new OrderWorker().process(job());
    integration.retrieveOrders.mockResolvedValue([makePkg('OK')]);
    await new OrderWorker().process(job());
    integration.retrieveOrders.mockImplementation(async () => incompleteList(2));
    integration.retrieveOrders.mockClear();
    await new OrderWorker().process(job());
    expect(integration.retrieveOrders.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('[ADR-0029 NB3] OrderWorker tasma bildirimi: bayrak ACIK -> katalog + defter (surec ici Map YOK)', () => {
  let sinkNotify: jest.Mock<any>;
  let legacy: jest.SpiedFunction<typeof NotificationService.sendClientNotification>;
  beforeEach(() => {
    mockV2 = true;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    legacy = jest.spyOn(NotificationService, 'sendClientNotification').mockResolvedValue(undefined as any);
    sinkNotify = jest.fn(async () => ({ status: 'created' }));
    NotificationService.setSink({ notify: sinkNotify, notifyLegacy: jest.fn() } as any);
  });
  afterEach(() => { mockV2 = false; NotificationService.setSink(undefined); });

  it('her tur notify(ORDER_SYNC_WINDOW_OVERFLOW, tid, {integ, reason}) cagrilir (kisma defterin isi); eski yol KULLANILMAZ; corrId tasinir', async () => {
    integration.retrieveOrders.mockImplementation(async () => incompleteList(2));
    await new OrderWorker().process(JOB);
    await new OrderWorker().process(JOB);
    expect(legacy).not.toHaveBeenCalled();
    expect(sinkNotify).toHaveBeenCalledTimes(2); // cephede sureç ici kisma YOK: ayni bucket'ta ledger 'grouped' doner
    const [code, tid, params, opts] = sinkNotify.mock.calls[0] as any[];
    expect(code).toBe('ORDER_SYNC_WINDOW_OVERFLOW');
    expect(tid).toBe(7);
    expect(params).toEqual({ integ: 'hepsiburada', reason: 'PAGINATION_RECORD_CAP' });
    expect(opts).toMatchObject({ module: 'OrderWorker' });
    expect(getDefinition('ORDER_SYNC_WINDOW_OVERFLOW')!.params.safeParse(params).success).toBe(true);
  });
});

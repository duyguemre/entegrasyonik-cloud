/**
 * CHARACTERIZATION: OrderOrchestrator (start/scheduler/event listener kurulumu)
 * Kaynak: backend/src/integration/engine/order/OrderOrchestrator.ts
 *
 * %0 kapsam, dokunulmaz listesindeydi (docs/QA_FAZ2.md madde 7/12, MASTER_STATE.md); ilk yazıldığında
 * kod DEĞİŞTİRİLMEMİŞTİ. [OrderOrchestrator başlatma izolasyonu düzeltmesi, 2026-09-27] BACKLOG
 * "%0-kapsamlı orkestrasyon sınıfları" madde 2 (KRİTİK) kapsamında `startScheduler()`'daki İLK
 * `scheduleJobs()` çağrısı artık periyodik tekrar çağrıyla AYNI try/catch deseniyle (`runScheduleJobsSafely`)
 * korunuyor; ilgili describe bloğu KASITLI OLARAK ters çevrildi (bkz. aşağıdaki blok).
 *
 * bullmq (QueueEvents), OrderQueueProducer, OrderErrorHandler, RedisService, worker-runner, PostOrderOperations
 * jest.mock ile değiştirilir (PostOrderOperations kaynak dosyada import EDİLİYOR ama HİÇ kullanılmıyor —
 * ölü import; yine de gerçek modülün yan etkili bağımlılıklarını (StockAllocator vb.) tetiklememek için
 * mock'landı). DB/Redis/ağ YOK.
 *
 * [eslesme-fiyat WP7a, F-02/F-04 — BİLİNÇLİ TERS ÇEVRİLDİ] Orkestratör artık üreticiyi ÇALIŞTIRMAZ (setInterval kalktı; üretici
 * `bootstrap/schedules.ts` → `order.produce`, lease + JobState) ve QueueEvents dinlemez ('failed' her pod'da tetikleniyordu → çift DLQ).
 * Tüketiciler Worker olay kancalarıyla başlar: onFailed → errorHandler.handleFailedJob(job, err), onCompleted → handleCompletedJob + downstream.
 *
 * ANA SORULAR (görev tanımından): zamanlayıcı döngüsü, BullMQ worker/queue kurulumu, hata izolasyonu (bir
 * tenant/entegrasyonun hatası diğerini etkiliyor mu).
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('bullmq', () => ({ QueueEvents: jest.fn() }));
jest.mock('@services/redis/RedisService', () => ({
  RedisService: { getConnectionConfig: jest.fn(() => ({ host: 'fake-redis', port: 0 })) },
}));
jest.mock('@integration/engine/order/OrderQueueProducer', () => ({ OrderQueueProducer: jest.fn() }));
jest.mock('@integration/engine/order/OrderErrorHandler', () => ({ OrderErrorHandler: jest.fn() }));
jest.mock('@integration/engine/order/worker-runner', () => ({ startOrderWorkerConsumer: jest.fn() }));
jest.mock('@operations/orders/postOrder', () => ({ PostOrderOperations: jest.fn() }));

import { QueueEvents } from 'bullmq';
import { OrderOrchestrator } from '@integration/engine/order/OrderOrchestrator';
import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { OrderErrorHandler } from '@integration/engine/order/OrderErrorHandler';
import { startOrderWorkerConsumer } from '@integration/engine/order/worker-runner';

let errorHandlerInstance: any;
let hooks: any;

beforeEach(() => {
  errorHandlerInstance = {
    handleFailedJob: jest.fn(async () => undefined),
    handleCompletedJob: jest.fn(async () => undefined),
    handleJobFailure: jest.fn(async () => undefined),
  };
  (OrderErrorHandler as any).mockReset().mockImplementation(() => errorHandlerInstance);
  (OrderQueueProducer as any).mockReset();
  (QueueEvents as any).mockReset();
  (startOrderWorkerConsumer as any).mockReset().mockImplementation((h: any) => { hooks = h; });
  cap = captureLogs();
});

afterEach(() => {
  cap.restore();
  jest.restoreAllMocks();
});

const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const job = (over: any = {}) => ({ id: 'j1', data: { clientId: 7, integrationCode: 'trendyol', kind: 'orders' }, returnvalue: undefined, ...over });

describe('OrderOrchestrator.start() — [WP7a] yalnız tüketiciler', () => {
  it('ÖNCEKİ: constructor OrderQueueProducer + QueueEvents("order-sync-queue") kurar, start() ilk scheduleJobs + setInterval. ŞİMDİ: üretici/QueueEvents YOK; startOrderWorkerConsumer kancalarla çağrılır', async () => {
    OrderOrchestrator.start();
    await flush();
    expect(OrderErrorHandler).toHaveBeenCalledTimes(1);
    expect(OrderQueueProducer).not.toHaveBeenCalled();
    expect(QueueEvents).not.toHaveBeenCalled();
    expect(startOrderWorkerConsumer).toHaveBeenCalledTimes(1);
    expect(Object.keys(hooks).sort()).toEqual(['onCompleted', 'onFailed']);
  });

  it('static start() senkron döner (await/catch YOK)', () => {
    expect(OrderOrchestrator.start()).toBeUndefined();
  });
});

describe('OrderOrchestrator — Worker "completed" kancası', () => {
  it('processedOrderCount>0 ise downstream tetiklenir; =0 ise tetiklenmez; her iki durumda AUTH sayacı sıfırlama (handleCompletedJob) çağrılır', async () => {
    OrderOrchestrator.start(); await flush();
    await hooks.onCompleted(job({ returnvalue: { clientId: '7', marketplace: 'trendyol', processedOrderCount: 3, insertedIds: ['a'] } }));
    expect(cap.lines).toContainEqual(expect.objectContaining({ code: 'ORDERORCHESTRATOR_DOWNSTREAM_SURECLER_TETIKLENIYOR_CLIEN' }));
    cap.clear();
    await hooks.onCompleted(job({ id: 'j2', returnvalue: { clientId: '7', marketplace: 'trendyol', processedOrderCount: 0, insertedIds: [] } }));
    expect(cap.lines).not.toContainEqual(expect.objectContaining({ code: 'ORDERORCHESTRATOR_DOWNSTREAM_SURECLER_TETIKLENIYOR_CLIEN' }));
    expect(errorHandlerInstance.handleCompletedJob).toHaveBeenCalledTimes(2);
  });

  it('[MEVCUT DAVRANIŞ — GİZLİ/ŞÜPHELİ] triggerDownstreamWorkflows hiçbir iş yapmaz (Promise.all([]), TODO); PostOrderOperations çağrılmaz', async () => {
    OrderOrchestrator.start(); await flush();
    await hooks.onCompleted(job({ returnvalue: { clientId: '7', marketplace: 'trendyol', processedOrderCount: 5, insertedIds: ['a'] } }));
    const { PostOrderOperations } = require('@operations/orders/postOrder');
    expect(PostOrderOperations).not.toHaveBeenCalled();
  });

  it('returnvalue yoksa (iade/mesaj/finans işi ya da bozuk) hata yutulur, sayaç sıfırlama yine çağrılır', async () => {
    OrderOrchestrator.start(); await flush();
    await expect(hooks.onCompleted(job({ returnvalue: null }))).resolves.toBeUndefined();
    expect(errorHandlerInstance.handleCompletedJob).toHaveBeenCalledTimes(1);
  });

  it('handleCompletedJob reddederse hata try/catch ile loglanır (süreç etkilenmez)', async () => {
    OrderOrchestrator.start(); await flush();
    errorHandlerInstance.handleCompletedJob.mockRejectedValueOnce(new Error('mongo down'));
    await expect(hooks.onCompleted(job({ returnvalue: { clientId: '7', processedOrderCount: 0 } }))).resolves.toBeUndefined();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'ORDERORCHESTRATOR_COMPLETED_EVENT_ISLENIRKEN_HATA' }));
  });
});

describe('OrderOrchestrator — Worker "failed" kancası (F-04: yalnız işi işleyen pod)', () => {
  it('ÖNCEKİ: QueueEvents failed → handleJobFailure(jobId, failedReason) (her pod). ŞİMDİ: handleFailedJob(job, err) + uyarı logu', async () => {
    OrderOrchestrator.start(); await flush();
    const j = job();
    const err = new Error('[AUTH] reddedildi');
    await hooks.onFailed(j, err);
    expect(errorHandlerInstance.handleFailedJob).toHaveBeenCalledWith(j, err);
    expect(errorHandlerInstance.handleJobFailure).not.toHaveBeenCalled();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'warn', code: 'ORDERORCHESTRATOR_JOB_BASARISIZ_OLDU_NEDEN', msg: expect.stringContaining('Job j1 başarısız oldu') }));
  });
});

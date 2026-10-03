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
 * ANA SORULAR (görev tanımından): zamanlayıcı döngüsü, BullMQ worker/queue kurulumu, hata izolasyonu (bir
 * tenant/entegrasyonun hatası diğerini etkiliyor mu).
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const queueEventsInstances: any[] = [];
class FakeQueueEvents {
  public handlers: Record<string, Function[]> = {};
  public queueName: any;
  public opts: any;
  constructor(queueName: any, opts: any) {
    this.queueName = queueName;
    this.opts = opts;
    queueEventsInstances.push(this);
  }
  on(event: string, handler: Function) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }
  async emit(event: string, payload: any) {
    for (const h of this.handlers[event] || []) await h(payload);
  }
}

jest.mock('bullmq', () => ({ QueueEvents: FakeQueueEvents }));
jest.mock('@services/redis/RedisService', () => ({
  RedisService: { getConnectionConfig: jest.fn(() => ({ host: 'fake-redis', port: 0 })) },
}));
jest.mock('@integration/engine/order/OrderQueueProducer', () => ({ OrderQueueProducer: jest.fn() }));
jest.mock('@integration/engine/order/OrderErrorHandler', () => ({ OrderErrorHandler: jest.fn() }));
jest.mock('@integration/engine/order/worker-runner', () => ({ startOrderWorkerConsumer: jest.fn() }));
jest.mock('@operations/integration/PostOrderOperations', () => ({ PostOrderOperations: jest.fn() }));

import { OrderOrchestrator } from '@integration/engine/order/OrderOrchestrator';
import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { OrderErrorHandler } from '@integration/engine/order/OrderErrorHandler';
import { startOrderWorkerConsumer } from '@integration/engine/order/worker-runner';
import orderConfig from '@integration/engine/order/order.config.json';

let producerInstance: any;
let errorHandlerInstance: any;
const callOrder: string[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  queueEventsInstances.length = 0;
  callOrder.length = 0;

  producerInstance = { scheduleJobs: jest.fn(async () => { callOrder.push('producer.scheduleJobs'); }) };
  errorHandlerInstance = { handleJobFailure: jest.fn(async () => { callOrder.push('errorHandler.handleJobFailure'); }) };

  (OrderQueueProducer as any).mockReset().mockImplementation(() => producerInstance);
  (OrderErrorHandler as any).mockReset().mockImplementation(() => errorHandlerInstance);
  (startOrderWorkerConsumer as any).mockReset().mockImplementation(() => { callOrder.push('startOrderWorkerConsumer'); });

  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  cap = captureLogs();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('OrderOrchestrator constructor - BullMQ QueueEvents kurulumu', () => {
  it('[MEVCUT DAVRANIŞ] static start() yeni bir instance oluşturur; constructor OrderQueueProducer + OrderErrorHandler + QueueEvents("order-sync-queue", {connection}) kurar', async () => {
    OrderOrchestrator.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(OrderQueueProducer).toHaveBeenCalledTimes(1);
    expect(OrderErrorHandler).toHaveBeenCalledTimes(1);
    expect(queueEventsInstances).toHaveLength(1);
    expect(queueEventsInstances[0].queueName).toBe('order-sync-queue');
    expect(queueEventsInstances[0].opts).toEqual({ connection: { host: 'fake-redis', port: 0 } });
  });

  it('[MEVCUT DAVRANIŞ] static start() örneğin start()\'ının dönüşünü BEKLEMEZ (await/catch YOK) — senkron olarak döner', () => {
    const result = OrderOrchestrator.start();
    expect(result).toBeUndefined();
  });
});

describe('OrderOrchestrator.start() - sıralama', () => {
  it('[MEVCUT DAVRANIŞ] adım sırası: setupEventListeners (queueEvents.on x3) -> startScheduler (ilk scheduleJobs + setInterval kurulumu) -> startOrderWorkerConsumer()', async () => {
    OrderOrchestrator.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const qe = queueEventsInstances[0];
    expect(Object.keys(qe.handlers).sort()).toEqual(['completed', 'error', 'failed']);
    expect(callOrder).toEqual(['producer.scheduleJobs', 'startOrderWorkerConsumer']);
  });

  it('[MEVCUT DAVRANIŞ] scheduler aralığı order.config.json > syncIntervalMs (=60000ms) ile kurulur; ileri sarınca scheduleJobs TEKRAR çağrılır', async () => {
    expect(orderConfig.syncIntervalMs).toBe(60000);
    OrderOrchestrator.start();
    await Promise.resolve();
    await Promise.resolve();
    producerInstance.scheduleJobs.mockClear();

    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    await Promise.resolve();

    expect(producerInstance.scheduleJobs).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] periyodik scheduleJobs() hatası try/catch İLE yutulur (console.error), zamanlayıcı durmaz', async () => {
    OrderOrchestrator.start();
    await Promise.resolve();
    await Promise.resolve();

    producerInstance.scheduleJobs.mockRejectedValueOnce(new Error('mongo down'));
    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    await Promise.resolve();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'ORDERORCHESTRATOR_SCHEDULER_CALISIRKEN_HATA_OLUSTU' }));

    producerInstance.scheduleJobs.mockClear();
    jest.advanceTimersByTime(60000);
    await Promise.resolve();
    await Promise.resolve();
    expect(producerInstance.scheduleJobs).toHaveBeenCalledTimes(1); // sonraki tur yine çalıştı
  });
});

describe('OrderOrchestrator.start() - [OrderOrchestrator başlatma izolasyonu düzeltmesi, 2026-09-27] ilk scheduleJobs() hatası artık periyodik çağrılarla TUTARLI şekilde korunuyor', () => {
  it('[MEVCUT DAVRANIŞ - DÜZELTİLDİ] startScheduler() içindeki İLK (döngü öncesi) `scheduleJobs()` çağrısı artık `runScheduleJobsSafely()` üzerinden try/catch İLE KORUNUYOR: reddederse console.error ile loglanır (periyodik çağrıyla AYNI mesaj), start() REJECT OLMAZ, startOrderWorkerConsumer() YİNE DE ÇAĞRILIR (BullMQ worker/tüketici normal şekilde başlar).', async () => {
    // DÜZELTME ÖNCESİ bu test tam tersini (kritik bulgu: startOrderWorkerConsumer HİÇ çağrılmaz, start()
    // reddeder) sabitliyordu (bkz. git geçmişi / BACKLOG "%0-kapsamlı orkestrasyon sınıfları" madde 2).
    producerInstance.scheduleJobs.mockRejectedValueOnce(new Error('ilk tur mongo down'));

    const orchestrator = new (OrderOrchestrator as any)();
    await expect(orchestrator.start()).resolves.toBeUndefined();

    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'ORDERORCHESTRATOR_SCHEDULER_CALISIRKEN_HATA_OLUSTU' }));
    expect(startOrderWorkerConsumer).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] setupEventListeners İLK çağrılan adımdır -> event dinleyicileri startScheduler\'ın ilk scheduleJobs() hatası verdiği durumda da ZATEN kurulmuş olur (queueEvents.on çağrıları etkilenmez)', async () => {
    producerInstance.scheduleJobs.mockRejectedValueOnce(new Error('ilk tur mongo down'));
    const orchestrator = new (OrderOrchestrator as any)();
    await expect(orchestrator.start()).resolves.toBeUndefined();
    const qe = queueEventsInstances[0];
    expect(Object.keys(qe.handlers).sort()).toEqual(['completed', 'error', 'failed']);
  });

  it('[MEVCUT DAVRANIŞ] ilk çağrı başarısız olsa bile periyodik (setInterval) tekrar çağrı NORMAL şekilde kurulur ve bir sonraki turda scheduleJobs tekrar denenir', async () => {
    producerInstance.scheduleJobs.mockRejectedValueOnce(new Error('ilk tur mongo down'));
    const orchestrator = new (OrderOrchestrator as any)();
    await orchestrator.start();

    producerInstance.scheduleJobs.mockClear();
    jest.advanceTimersByTime(orderConfig.syncIntervalMs || 600000);
    await Promise.resolve();
    await Promise.resolve();

    expect(producerInstance.scheduleJobs).toHaveBeenCalledTimes(1);
  });
});

describe('OrderOrchestrator - queueEvents "completed" olayı', () => {
  async function startAndGetQueueEvents() {
    OrderOrchestrator.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    return queueEventsInstances[0];
  }

  it('[MEVCUT DAVRANIŞ] processedOrderCount>0 ise triggerDownstreamWorkflows tetiklenir (loglanır); processedOrderCount=0 ise HİÇ tetiklenmez', async () => {
    const qe = await startAndGetQueueEvents();

    await qe.emit('completed', { jobId: 'j1', returnvalue: { clientId: '7', marketplace: 'trendyol', processedOrderCount: 3, insertedIds: ['a', 'b'] } });
    expect(cap.lines).toContainEqual(expect.objectContaining({ code: 'ORDERORCHESTRATOR_DOWNSTREAM_SURECLER_TETIKLENIYOR_CLIEN' }));

    cap.clear();
    await qe.emit('completed', { jobId: 'j2', returnvalue: { clientId: '7', marketplace: 'trendyol', processedOrderCount: 0, insertedIds: [] } });
    expect(cap.lines).not.toContainEqual(expect.objectContaining({ code: 'ORDERORCHESTRATOR_DOWNSTREAM_SURECLER_TETIKLENIYOR_CLIEN' }));
  });

  it('[MEVCUT DAVRANIŞ — GİZLİ/ŞÜPHELİ] triggerDownstreamWorkflows GERÇEKTE hiçbir iş yapmaz: Promise.all([]) BOŞ bir dizi üzerinde çalışır (downstream operasyon çağrısı YORUM SATIRI olarak bırakılmış, TODO). Stok düşme/fatura gibi işler bu yoldan TETİKLENMEZ.', async () => {
    // BACKLOG: şüpheli/ölü kod - triggerDownstreamWorkflows'daki Promise.all dizisi boş; asıl tahsis mantığı
    // artık OrderWorker.process() içinde (ADR-0004 Aşama B, PostOrderOperations) AYRI bir yoldan çalışıyor.
    // Bu metot muhtemelen ARTIK ANLAMSIZ (dead code) ama OrderOrchestrator dokunulmaz olduğu için değiştirilmedi.
    const qe = await startAndGetQueueEvents();
    await qe.emit('completed', { jobId: 'j1', returnvalue: { clientId: '7', marketplace: 'trendyol', processedOrderCount: 5, insertedIds: ['a'] } });
    // PostOrderOperations HİÇ örneklenmedi/çağrılmadı (OrderOrchestrator seviyesinde iş yapılmıyor)
    const { PostOrderOperations } = require('@operations/integration/PostOrderOperations');
    expect(PostOrderOperations).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] returnvalue eksik/bozuksa (ör. clientId erişimi patlar) hata try/catch İLE yutulur, süreç etkilenmez', async () => {
    const qe = await startAndGetQueueEvents();
    await expect(qe.emit('completed', { jobId: 'j-bad', returnvalue: null })).resolves.toBeUndefined();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'ORDERORCHESTRATOR_COMPLETED_EVENT_ISLENIRKEN_HATA', msg: expect.stringContaining('Completed event işlenirken hata'), err: expect.objectContaining({ type: 'TypeError' }) }));
  });

  it('[MEVCUT DAVRANIŞ — İZOLASYON] BİR job\'un "completed" işleyicisi hata verse bile SONRAKİ farklı bir job\'un "completed" olayı BAĞIMSIZ işlenir (her emit ayrı bir async çağrı)', async () => {
    const qe = await startAndGetQueueEvents();
    await qe.emit('completed', { jobId: 'bad', returnvalue: null }); // n11 patlıyor
    cap.clear();
    await qe.emit('completed', { jobId: 'ok', returnvalue: { clientId: '9', marketplace: 'trendyol', processedOrderCount: 1, insertedIds: ['x'] } }); // trendyol etkilenmedi
    expect(cap.lines).toContainEqual(expect.objectContaining({ code: 'ORDERORCHESTRATOR_JOB_BASARIYLA_TAMAMLANDI_CLIENT', msg: expect.stringContaining('başarıyla tamamlandı') }));
  });
});

describe('OrderOrchestrator - queueEvents "failed"/"error" olayları', () => {
  async function startAndGetQueueEvents() {
    OrderOrchestrator.start();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    return queueEventsInstances[0];
  }

  it('[MEVCUT DAVRANIŞ] "failed" olayında errorHandler.handleJobFailure(jobId, failedReason) çağrılır', async () => {
    const qe = await startAndGetQueueEvents();
    await qe.emit('failed', { jobId: 'j1', failedReason: 'boom' });
    expect(errorHandlerInstance.handleJobFailure).toHaveBeenCalledWith('j1', 'boom');
  });

  it('[MEVCUT DAVRANIŞ — KRİTİK BULGU] "failed" işleyicisinde try/catch YOK: errorHandler.handleJobFailure REDDEDERSE bu callback\'in promise\'i sessizce reddeder (unhandled rejection); YİNE DE sonraki BAĞIMSIZ bir "failed" olayı normal işlenir (her emit ayrı invoke, bir job\'un hata-işleme hatası diğerini BLOKE ETMEZ).', async () => {
    // BACKLOG: kritik bulgu - handleJobFailure() hata verirse hiçbir yerde yakalanmıyor (ör. bir tenant'ın
    // hata sınıflandırması sırasında beklenmedik bir istisna at ederse bu iz kaybolur, yalnızca process-level
    // unhandledRejection log'una düşer). Düzeltilirse bu test kasıtlı olarak güncellenecek.
    const qe = await startAndGetQueueEvents();
    errorHandlerInstance.handleJobFailure.mockRejectedValueOnce(new Error('dlq write fail'));

    const p1 = qe.emit('failed', { jobId: 'n11-job', failedReason: '[UNAVAILABLE] n11 down' });
    await expect(p1).rejects.toThrow('dlq write fail'); // callback'in kendi promise'i reddediyor (FakeQueueEvents.emit bunu bekliyor)

    // Bağımsız ikinci olay (farklı entegrasyon) normal işlenir
    await qe.emit('failed', { jobId: 'trendyol-job', failedReason: 'transient' });
    expect(errorHandlerInstance.handleJobFailure).toHaveBeenCalledWith('trendyol-job', 'transient');
  });

  it('[MEVCUT DAVRANIŞ] "failed" olayında console.warn ile failedReason loglanır', async () => {
    const qe = await startAndGetQueueEvents();
    await qe.emit('failed', { jobId: 'j2', failedReason: 'rate limited' });
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'warn', code: 'ORDERORCHESTRATOR_JOB_BASARISIZ_OLDU_NEDEN', msg: expect.stringContaining('Job j2 başarısız oldu') }));
  });

  it('[MEVCUT DAVRANIŞ] "error" olayı (QueueEvents Redis bağlantı hatası) yalnızca loglanır, başka bir işlem yapılmaz', async () => {
    const qe = await startAndGetQueueEvents();
    const err = new Error('ECONNRESET');
    await qe.emit('error', err);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'ORDERORCHESTRATOR_QUEUEEVENTS_REDIS_BAGLANTI_HATASI' }));
    expect(errorHandlerInstance.handleJobFailure).not.toHaveBeenCalled();
  });
});

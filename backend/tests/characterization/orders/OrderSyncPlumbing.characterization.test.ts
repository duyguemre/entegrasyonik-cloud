/**
 * CHARACTERIZATION: sipariş sync "tesisatı"
 *  - worker-runner.ts: BullMQ Worker işleyicisi OrderWorker.process sonucunu/hatasını olduğu gibi geçirir;
 *    job seçeneklerinde (attempts/backoff) bir retry tanımı YOKTUR (order.config.json'daki retryLimits kullanılmaz).
 *  - OrderRepository.updateLastSyncTimestamp: kendi hatasını yutar (fırlatmaz), filtre clientId + integrationCode.
 *
 * bullmq, RedisService ve DatabaseManager jest.mock ile değiştirilir. Gerçek Redis/Mongo YOK.
 * BACKLOG C7: düzeltilince işaretli testler kasıtlı olarak güncellenecek.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

class FakeUnrecoverableError extends Error {
  constructor(message: string) { super(message); this.name = 'UnrecoverableError'; }
}
jest.mock('bullmq', () => ({ Worker: jest.fn(), UnrecoverableError: FakeUnrecoverableError }));
jest.mock('@services/redis/RedisService', () => ({
  RedisService: { getConnectionConfig: jest.fn(() => ({ host: 'fake-redis', port: 0 })) },
}));
jest.mock('@integration/engine/order/OrderWorker', () => ({ OrderWorker: jest.fn() }));
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));

import { Worker } from 'bullmq';
import { startOrderWorkerConsumer, closeOrderWorkerConsumer } from '@integration/engine/order/worker-runner';
import { OrderWorker } from '@integration/engine/order/OrderWorker';
import { OrderRepository } from '@database/repositories/tenant/OrderRepository';
import { DatabaseManagerInstance } from '@database/index';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (Worker as any).mockReset();
  (Worker as any).mockImplementation(() => ({ on: jest.fn(), close: (jest.fn() as any).mockResolvedValue(undefined) }));
  (OrderWorker as any).mockReset();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('worker-runner (BullMQ tüketicisi)', () => {
  it('[ADR-0005 adım 4 — TERS ÇEVRİLDİ] kuyruk adı order-sync-queue; concurrency 5; removeOnComplete/removeOnFail artık Queue (OrderQueueProducer) ile TEKİL (order.config.json > memoryManagement) -- ÖNCEKİ DAVRANIŞ: {count:100}/{count:500} sabit değerleri burada AYRICA tanımlıydı (Queue tarafındaki removeOnComplete:true/removeOnFail:false ile ÇELİŞİYORDU)', () => {
    startOrderWorkerConsumer();
    const [queueName, , opts] = (Worker as any).mock.calls[0];
    expect(queueName).toBe('order-sync-queue');
    expect(opts.concurrency).toBe(5);
    expect(opts.removeOnComplete).toEqual({ age: 86400, count: 1000 });
    expect(opts.removeOnFail).toEqual({ count: 500 });
    expect(opts).not.toHaveProperty('attempts');
    expect(opts).not.toHaveProperty('backoff');
    expect(opts).not.toHaveProperty('settings');
  });

  it('[MEVCUT DAVRANIŞ] işleyici OrderWorker.process sonucunu aynen döndürür (kısmi hata sonrası bile "başarılı" job -> retry/DLQ yok)', async () => {
    const processed = { clientId: 1, integrationCode: 'trendyol', processedOrderCount: 0, insertedIds: [], updatedIds: [] };
    (OrderWorker as any).mockImplementation(() => ({ process: (jest.fn() as any).mockResolvedValue(processed) }));
    startOrderWorkerConsumer();
    const processor = (Worker as any).mock.calls[0][1];
    await expect(processor({ data: { clientId: 1 } })).resolves.toBe(processed);
  });

  it('[MEVCUT DAVRANIŞ, korunuyor] OrderWorker.process sıradan bir Error ile fırlatırsa işleyici de AYNI hatayı fırlatır (normal BullMQ retry/backoff akışına girer)', async () => {
    (OrderWorker as any).mockImplementation(() => ({ process: (jest.fn() as any).mockRejectedValue(new Error('boom')) }));
    startOrderWorkerConsumer();
    const processor = (Worker as any).mock.calls[0][1];
    await expect(processor({ data: {} })).rejects.toThrow('boom');
    await expect(processor({ data: {} })).rejects.not.toBeInstanceOf(FakeUnrecoverableError);
  });

  it('[YENİ DAVRANIŞ, ADR-0005 Karar 3] OrderWorker.process IntegrationError(retryable:false) ile fırlatırsa işleyici bunu UnrecoverableError\'a SARAR (BullMQ attempts/backoff TÜKETMEDEN direkt failed\'e geçer)', async () => {
    const fatal = new IntegrationError('AUTH', 'Kimlik doğrulama başarısız', { integrationCode: 'trendyol', operation: 'retrieveOrders', clientId: 1 });
    expect(fatal.retryable).toBe(false); // AUTH retryable değildir (ADR-0006 sözleşmesi)
    (OrderWorker as any).mockImplementation(() => ({ process: (jest.fn() as any).mockRejectedValue(fatal) }));
    startOrderWorkerConsumer();
    const processor = (Worker as any).mock.calls[0][1];

    await expect(processor({ data: {} })).rejects.toBeInstanceOf(FakeUnrecoverableError);
    await expect(processor({ data: {} })).rejects.toThrow(fatal.message);
  });

  it('[YENİ DAVRANIŞ, ADR-0005 Karar 3] OrderWorker.process IntegrationError(retryable:true) ile fırlatırsa SARILMAZ (normal retry/backoff devam eder)', async () => {
    const transient = new IntegrationError('RATE_LIMITED', 'Çok fazla istek', { integrationCode: 'trendyol', operation: 'retrieveOrders', clientId: 1 });
    expect(transient.retryable).toBe(true);
    (OrderWorker as any).mockImplementation(() => ({ process: (jest.fn() as any).mockRejectedValue(transient) }));
    startOrderWorkerConsumer();
    const processor = (Worker as any).mock.calls[0][1];

    await expect(processor({ data: {} })).rejects.not.toBeInstanceOf(FakeUnrecoverableError);
    await expect(processor({ data: {} })).rejects.toBe(transient);
  });

  it('[YENİ DAVRANIŞ, ADR-0006 Karar 6] closeOrderWorkerConsumer: başlatılmış Worker\'ın close()\'unu çağırır (graceful shutdown adım 4)', async () => {
    const worker = startOrderWorkerConsumer();
    await closeOrderWorkerConsumer();
    expect((worker as any).close).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ, ADR-0006 Karar 6] closeOrderWorkerConsumer: hiç başlatılmadıysa no-op (hata fırlatmaz)', async () => {
    await expect(closeOrderWorkerConsumer()).resolves.toBeUndefined();
  });
});

describe('OrderRepository.updateLastSyncTimestamp', () => {
  it('[MEVCUT DAVRANIŞ] ClientModel.updateOne filtresi clientId+integrationCode; $set lastSuccessfulOrderSync', async () => {
    const updateOne = (jest.fn() as any).mockResolvedValue({});
    (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({ getClientModel: () => ({ updateOne }) });
    const d = new Date('2026-03-01T00:00:00.000Z');

    await new OrderRepository().updateLastSyncTimestamp(7, 'trendyol', d);

    expect(updateOne).toHaveBeenCalledWith(
      { clientId: 7, 'integrations.integrationCode': 'trendyol' },
      { $set: { 'integrations.$.lastSuccessfulOrderSync': d } },
    );
  });

  it('[MEVCUT DAVRANIŞ] DB hatasında hata YUTULUR (fırlatmaz) -> çağıran zaman damgasının yazılıp yazılmadığını bilemez', async () => {
    // BACKLOG C7: düzeltilince bu test kasıtlı olarak güncellenecek
    (DatabaseManagerInstance.getApplicationDB as any).mockRejectedValue(new Error('mongo down'));
    await expect(new OrderRepository().updateLastSyncTimestamp(7, 'trendyol', new Date())).resolves.toBeUndefined();
  });
});

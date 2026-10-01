/**
 * ADR-0030 X6: kill-switch (`intake`) motor tüketicilerine bağlı. Kapalıyken (drain/off) dış çağrı/yeni iş YOK,
 * iş kaybolmaz (ertelenir), açılınca devam eder. Bağımlılıklar mock; DB/Redis/ağ YOK.
 * (Dispatcher testleri: catalog/Dispatcher.characterization.test.ts sonu.)
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const queueInstances: any[] = [];
const workerProcessors: any[] = [];
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => {
    const q: any = { add: jest.fn(async () => undefined), getJobs: jest.fn(async () => []) };
    queueInstances.push(q);
    return q;
  }),
  Worker: jest.fn().mockImplementation((_n: any, processor: any) => { workerProcessors.push(processor); return { on: jest.fn(), close: jest.fn() }; }),
  UnrecoverableError: class UnrecoverableError extends Error {},
  DelayedError: class DelayedError extends Error {},
}));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getConnectionConfig: jest.fn(() => ({})), isReady: jest.fn(() => true) } }));
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));
jest.mock('@services/billing/EntitlementService', () => ({ EntitlementService: { checkAccess: jest.fn() } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
const orderWorkerProcess = jest.fn(async () => ({ ok: true }));
jest.mock('@integration/engine/order/OrderWorker', () => ({ OrderWorker: jest.fn().mockImplementation(() => ({ process: orderWorkerProcess })) }));

import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { startOrderWorkerConsumer, INTAKE_OFF_DEFER_MS } from '@integration/engine/order/worker-runner';
import { StockPublishTrigger } from '@operations/stock/StockPublishTrigger';
import { ExternalReconciliationJob } from '@operations/stock/ExternalReconciliationJob';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { DatabaseManagerInstance as DbIdx } from '@database/index';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { setTargetIntake, resetPlatformOverrideStoreForTests } from '@integration/config/platformOverrideStore';
import { effectiveIntake, allowNewWork, allowInFlightWork, inFlightBlocked } from '@integration/config/intakeGate';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;
const lean = (r: any) => ({ lean: jest.fn(async () => r) });

beforeEach(() => {
  queueInstances.length = 0; workerProcessors.length = 0; orderWorkerProcess.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(metricsRegistry, 'incCounter');
});
afterEach(() => { resetPlatformOverrideStoreForTests(); jest.restoreAllMocks(); });

describe('intakeGate - karar', () => {
  it('varsayılan on; entegrasyon/global en kısıtlayıcı kazanır; drain in-flight işi durdurmaz, off durdurur', () => {
    expect(effectiveIntake('trendyol')).toBe('on');
    setTargetIntake('trendyol', 'drain');
    expect(allowNewWork('trendyol')).toBe(false);
    expect(allowInFlightWork('trendyol')).toBe(true);
    expect(allowNewWork('n11')).toBe(true);
    setTargetIntake('_engine', 'off');
    expect(effectiveIntake('trendyol')).toBe('off');
    expect(effectiveIntake('n11')).toBe('off');
    expect(inFlightBlocked()).toEqual({ all: true, codes: [] });
    setTargetIntake('_engine', 'on'); setTargetIntake('trendyol', 'off');
    expect(inFlightBlocked()).toEqual({ all: false, codes: ['trendyol'] });
  });
});

describe('OrderQueueProducer - kill-switch', () => {
  const clients = [{ clientId: 1, integrations: [
    { status: true, type: 'marketplace', integrationCode: 'trendyol' },
    { status: true, type: 'marketplace', integrationCode: 'n11' },
  ] }];
  beforeEach(() => {
    (DbIdx.getApplicationDB as any).mockResolvedValue({ getClientModel: () => ({ find: jest.fn(() => lean(clients)), updateOne: jest.fn(async () => ({})) }) });
  });

  it.each(['drain', 'off'])('%s: kapalı entegrasyon için iş eklenmez, diğeri etkilenmez; metrik artar; açılınca eklenir', async (intake) => {
    setTargetIntake('trendyol', intake as any);
    const p = new OrderQueueProducer(); const q = queueInstances[0];
    await p.scheduleJobs();
    expect(q.add.mock.calls.map((c: any[]) => c[0])).toEqual(['fetch-orders-n11']);
    expect(metricsRegistry.incCounter).toHaveBeenCalledWith('integration_intake_skipped', expect.objectContaining({ consumer: 'OrderQueueProducer', integration: 'trendyol' }));

    q.add.mockClear(); setTargetIntake('trendyol', 'on');
    await p.scheduleJobs();
    expect(q.add).toHaveBeenCalledTimes(2);
  });

  it('global off: hiçbir iş eklenmez; webhook tetiklemesi de atlanır', async () => {
    setTargetIntake('_engine', 'off');
    const p = new OrderQueueProducer(); const q = queueInstances[0];
    await p.scheduleJobs();
    expect(q.add).not.toHaveBeenCalled();
    expect(await p.enqueueWebhookTriggeredSync(1, 'trendyol', new Date())).toEqual({ jobId: '', skipped: true });
    expect(q.add).not.toHaveBeenCalled();
  });
});

describe('worker-runner (OrderWorker tüketicisi) - kill-switch', () => {
  it('off: iş işlenmez (dış çağrı yok), silinmez/başarısız sayılmaz, ertelenir (DelayedError); on: normal işlenir; drain: süren iş biter', async () => {
    startOrderWorkerConsumer();
    const processor = workerProcessors[0];
    const job: any = { data: { clientId: 1, integrationCode: 'trendyol' }, moveToDelayed: jest.fn(async () => undefined) };

    setTargetIntake('trendyol', 'off');
    await expect(processor(job, 'tok')).rejects.toThrow();
    expect(orderWorkerProcess).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok');
    expect(job.moveToDelayed.mock.calls[0][0]).toBeGreaterThanOrEqual(Date.now() + INTAKE_OFF_DEFER_MS - 5000);

    setTargetIntake('trendyol', 'drain');
    await processor(job, 'tok');
    expect(orderWorkerProcess).toHaveBeenCalledTimes(1);

    setTargetIntake('trendyol', 'on');
    await processor(job, 'tok');
    expect(orderWorkerProcess).toHaveBeenCalledTimes(2);
  });
});

describe('StockPublishTrigger - kill-switch', () => {
  it('kanal kapalıyken yayın kaydı açılmaz ve stockDirty TEMİZLENMEZ; açılınca yayınlanır', async () => {
    const dirty = [{ _id: 'v1', barcode: 'B1', stock: 5, reserved: 0, platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } } } } }];
    const variantModel = { find: jest.fn(() => ({ limit: () => lean(dirty) })), bulkWrite: jest.fn(async () => ({})) };
    const stagedModel = { countDocuments: jest.fn(async () => 0), updateOne: jest.fn(async () => ({})) };
    const clientDB = {
      getClientIntegrationModel: () => ({ findOne: () => lean({ marketplace: [{ code: 'trendyol', status: true, order: 1 }] }) }),
      getVariantModel: () => variantModel, getExportStagedProductModel: () => stagedModel,
    };
    const appDB = { getClientModel: () => ({ find: () => lean([{ order: 1 }]) }), getExportFlagModel: () => ({ updateOne: jest.fn(async () => ({})) }) };
    (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(appDB);
    (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(clientDB);
    factoryCtor.mockImplementation(() => ({ getInstance: async () => ({ getMatchKey: () => 'barcode' }) }));

    setTargetIntake('trendyol', 'off');
    const r1 = await new StockPublishTrigger().run();
    expect(r1.staged).toBe(0);
    expect(stagedModel.updateOne).not.toHaveBeenCalled();
    expect(variantModel.bulkWrite).not.toHaveBeenCalled(); // dirty korunur -> iş kaybolmaz

    setTargetIntake('trendyol', 'on');
    const r2 = await new StockPublishTrigger().run();
    expect(r2.staged).toBe(1);
    expect(variantModel.bulkWrite).toHaveBeenCalledTimes(1);
  });
});

describe('ExternalReconciliationJob - kill-switch', () => {
  it('kanal kapalıyken pazaryerine dış çağrı (streamProducts) yapılmaz; açılınca yapılır', async () => {
    const streamProducts = jest.fn(async () => undefined);
    const clientDB = {
      getClientIntegrationModel: () => ({ findOne: () => lean({ marketplace: [{ code: 'trendyol', status: true }] }) }),
      getVariantModel: () => ({}),
    };
    (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({ getClientModel: () => ({ find: () => lean([{ order: 1 }]) }) });
    (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(clientDB);
    factoryCtor.mockImplementation(() => ({ getInstance: async () => ({ getMatchKey: () => 'barcode', streamProducts }) }));

    setTargetIntake('trendyol', 'drain');
    await new ExternalReconciliationJob().run();
    expect(streamProducts).not.toHaveBeenCalled();

    setTargetIntake('trendyol', 'on');
    await new ExternalReconciliationJob().run();
    expect(streamProducts).toHaveBeenCalledTimes(1);
  });
});

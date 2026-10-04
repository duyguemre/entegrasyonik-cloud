// [eslesme-fiyat WP7a] Sipariş kuyruk çekirdeği: kanal kuyrukları (F-01), RATE_LIMITED erteleme (F-12), AUTH duraklatma + DLQ (F-04).
// bullmq / Redis / Mongo sahte; ağ YOK.
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

class FakeUnrecoverableError extends Error { constructor(m: string) { super(m); this.name = 'UnrecoverableError'; } }
class FakeDelayedError extends Error { constructor() { super('delayed'); this.name = 'DelayedError'; } }
const workers: Array<{ name: string; processor: any; opts: any; handlers: Record<string, any> }> = [];
jest.mock('bullmq', () => ({
    Worker: jest.fn().mockImplementation((name: any, processor: any, opts: any) => {
        const w = { name, processor, opts, handlers: {} as Record<string, any> };
        workers.push(w);
        return { on: (e: string, f: any) => { w.handlers[e] = f; }, close: jest.fn(async () => undefined) };
    }),
    Queue: jest.fn().mockImplementation(() => ({})),
    Job: { fromId: jest.fn() },
    UnrecoverableError: FakeUnrecoverableError,
    DelayedError: FakeDelayedError,
}));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getConnectionConfig: jest.fn(() => ({})) } }));
const orderWorkerProcess = jest.fn<any>();
jest.mock('@integration/engine/order/OrderWorker', () => ({ OrderWorker: jest.fn(() => ({ process: orderWorkerProcess })) }));
const clientModel = { findOneAndUpdate: jest.fn<any>(), updateOne: jest.fn<any>() };
const dlqInsertOne = jest.fn<any>();
jest.mock('@database/index', () => ({
    DatabaseManagerInstance: { getApplicationDB: jest.fn(async () => ({ getClientModel: () => clientModel, getDeadLetterQueueModel: () => ({ insertOne: dlqInsertOne }) })) },
}));
const notify = jest.fn<any>(async () => ({ status: 'sent' }));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: { notify: (...a: any[]) => notify(...a) } }));

import {
    orderQueueName, ORDER_QUEUE_NAMES, LEGACY_ORDER_QUEUE, concurrencyFor, orderDedupId, sliceDelayMs, ORDER_QUEUE_FALLBACK,
} from '@integration/contracts/orderQueues';
import { startOrderWorkerConsumer, closeOrderWorkerConsumer, rateLimitDeferMs, RATE_LIMIT_MAX_DEFERRALS, RATE_LIMIT_DEFAULT_DEFER_MS } from '@integration/engine/order/worker-runner';
import { OrderErrorHandler, AUTH_FAILURE_THRESHOLD } from '@integration/engine/order/OrderErrorHandler';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { ENGINE_QUEUES } from '@api/admin/engineOps';
import { BACKOFFICE_ENGINE_RPC_INPUT } from '../../../src/capabilities/rpc-input/backoffice-engine';

beforeEach(async () => {
    await closeOrderWorkerConsumer();
    workers.length = 0;
    orderWorkerProcess.mockReset();
    clientModel.findOneAndUpdate.mockReset();
    clientModel.updateOne.mockReset();
    dlqInsertOne.mockReset();
    notify.mockClear();
});

describe('orderQueues (saf)', () => {
    it('kanal başına kuyruk adı (`:` YOK — BullMQ yasaklar); bilinmeyen kod ortak kuyruğa', () => {
        expect(orderQueueName('trendyol')).toBe('order-sync-trendyol');
        expect(orderQueueName('HepsiBurada')).toBe('order-sync-hepsiburada');
        expect(orderQueueName('yeni')).toBe(ORDER_QUEUE_FALLBACK);
        for (const n of [...ORDER_QUEUE_NAMES, LEGACY_ORDER_QUEUE]) expect(n).not.toContain(':');
    });
    it('kanal eşzamanlılığı PLAN §3.5 (TY 5, HB 3, N11 3, PZ 3, IS 2, BH 1; ortak 1)', () => {
        expect(['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'].map(c => concurrencyFor(orderQueueName(c)))).toEqual([5, 3, 3, 3, 2, 1]);
        expect(concurrencyFor(ORDER_QUEUE_FALLBACK)).toBe(1);
    });
    it('tekilleştirme kimliği çift+kind sabit; dilim gecikmesi order % 60 sn', () => {
        expect(orderDedupId(7, 'n11', 'claims')).toBe('sync_7_n11_claims');
        expect(sliceDelayMs(0)).toBe(0);
        expect(sliceDelayMs(61)).toBe(1000);
        expect(sliceDelayMs(undefined)).toBe(0);
    });
    it('backoffice kuyruk listesi ve RPC şeması aynı kümeyi taşır (eski kuyruk ilk sırada)', () => {
        expect(ENGINE_QUEUES[0]).toBe(LEGACY_ORDER_QUEUE);
        const schema: any = BACKOFFICE_ENGINE_RPC_INPUT['BackofficeEngineService/discardJob' as any];
        for (const q of ENGINE_QUEUES) expect(schema.safeParse({ queue: q, jobId: 'j1', reason: 'gerekçe metni' }).success).toBe(true);
        expect(schema.safeParse({ queue: 'order-sync:trendyol', jobId: 'j1', reason: 'gerekçe metni' }).success).toBe(false);
    });
});

describe('worker-runner — kanal başına Worker (F-01)', () => {
    it('eski kuyruk (boşaltma, ayar eşzamanlılığı 5) + kanal kuyrukları kendi eşzamanlılığıyla', () => {
        startOrderWorkerConsumer();
        expect(workers.map(w => w.name)).toEqual([LEGACY_ORDER_QUEUE, ...ORDER_QUEUE_NAMES]);
        expect(workers[0].opts.concurrency).toBe(5);
        expect(workers.find(w => w.name === 'order-sync-bizimhesap')!.opts.concurrency).toBe(1);
    });
    it('failed/completed kancaları Worker olayından çağrılır (yalnız işleyen pod)', async () => {
        const onFailed = jest.fn<any>(async () => undefined);
        const onCompleted = jest.fn<any>(async () => undefined);
        startOrderWorkerConsumer({ onFailed, onCompleted });
        const w = workers.find(x => x.name === 'order-sync-n11')!;
        const job = { id: '1', data: { integrationCode: 'n11' }, opts: {} };
        w.handlers.failed(job, new Error('x'));
        w.handlers.completed(job);
        await new Promise(r => setImmediate(r));
        expect(onFailed).toHaveBeenCalledWith(job, expect.any(Error));
        expect(onCompleted).toHaveBeenCalledWith(job);
    });
});

describe('worker-runner — RATE_LIMITED erteleme (F-12)', () => {
    const rl = (retryAfterMs?: number) => new IntegrationError('RATE_LIMITED', '429', { integrationCode: 'trendyol', operation: 'GET /orders', clientId: 1, retryAfterMs } as any);
    const mkJob = (deferrals = 0) => ({ data: { clientId: 1, integrationCode: 'trendyol', kind: 'orders', rateLimitDeferrals: deferrals }, moveToDelayed: jest.fn<any>(async () => undefined), updateData: jest.fn<any>(async () => undefined) });

    it('rateLimitDeferMs: Retry-After varsa o (1 sn–15 dk arası), yoksa 60 sn', () => {
        expect(rateLimitDeferMs({ retryAfterMs: 90_000 })).toBe(90_000);
        expect(rateLimitDeferMs({ retryAfterMs: 10 })).toBe(1000);
        expect(rateLimitDeferMs({ retryAfterMs: 10 * 3600_000 })).toBe(15 * 60_000);
        expect(rateLimitDeferMs({})).toBe(RATE_LIMIT_DEFAULT_DEFER_MS);
    });

    it('RATE_LIMITED → iş retryAfterMs kadar ertelenir (DelayedError; deneme hakkı tüketilmez), sayaç artar', async () => {
        startOrderWorkerConsumer();
        orderWorkerProcess.mockRejectedValueOnce(rl(120_000));
        const job = mkJob(0);
        const t0 = Date.now();
        await expect(workers[1].processor(job, 'tok')).rejects.toMatchObject({ name: 'DelayedError' });
        expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok');
        expect(job.moveToDelayed.mock.calls[0][0]).toBeGreaterThanOrEqual(t0 + 120_000);
        expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ rateLimitDeferrals: 1 }));
    });

    it('tavan aşılınca normal akış: RATE_LIMITED retryable → hata aynen fırlar (BullMQ retry/DLQ)', async () => {
        startOrderWorkerConsumer();
        const err = rl(1000);
        orderWorkerProcess.mockRejectedValueOnce(err);
        const job = mkJob(RATE_LIMIT_MAX_DEFERRALS);
        await expect(workers[1].processor(job, 'tok')).rejects.toBe(err);
        expect(job.moveToDelayed).not.toHaveBeenCalled();
    });

    it('AUTH (retryable:false) → UnrecoverableError, mesaj [AUTH] önekini korur', async () => {
        startOrderWorkerConsumer();
        orderWorkerProcess.mockRejectedValueOnce(new IntegrationError('AUTH', 'kimlik reddedildi', { integrationCode: 'trendyol', operation: 'GET /orders', clientId: 1 } as any));
        await expect(workers[1].processor(mkJob(), 'tok')).rejects.toMatchObject({ name: 'UnrecoverableError', message: expect.stringMatching(/^\[AUTH\]/) });
    });
});

describe('OrderErrorHandler — AUTH duraklatma + DLQ (F-04)', () => {
    const job = (over: any = {}) => ({ id: 'q1', queueName: 'order-sync-trendyol', data: { clientId: '5', integrationCode: 'trendyol', kind: 'orders' }, attemptsMade: 1, opts: { attempts: 5 }, remove: jest.fn<any>(async () => undefined), ...over });
    const withCount = (n: number, needsAttention?: any) => clientModel.findOneAndUpdate.mockReturnValue({ lean: async () => ({ integrations: [{ integrationCode: 'trendyol', authFailureCount: n, ...(needsAttention ? { needsAttention } : {}) }] }) });

    it(`eşik altı (${AUTH_FAILURE_THRESHOLD - 1}) AUTH: sayaç artar, needsAttention YAZILMAZ; iş FATAL → DLQ (kuyruk adıyla)`, async () => {
        withCount(AUTH_FAILURE_THRESHOLD - 1);
        dlqInsertOne.mockResolvedValue(undefined);
        await new OrderErrorHandler().handleFailedJob(job() as any, new Error('[AUTH] reddedildi'));
        expect(clientModel.findOneAndUpdate).toHaveBeenCalledWith({ clientId: 5, 'integrations.integrationCode': 'trendyol' }, { $inc: { 'integrations.$.authFailureCount': 1 } }, expect.anything());
        expect(clientModel.updateOne).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
        expect(dlqInsertOne).toHaveBeenCalledWith(expect.objectContaining({ originalJobId: 'q1', queueName: 'order-sync-trendyol', dlqType: 'FATAL_ERROR' }));
    });

    it('eşikte: needsAttention (koşullu, ilk yazan) + INTEGRATION_AUTH_FAILED bildirimi', async () => {
        withCount(AUTH_FAILURE_THRESHOLD);
        clientModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
        await new OrderErrorHandler().handleFailedJob(job() as any, '[AUTH] reddedildi');
        expect(clientModel.updateOne).toHaveBeenCalledWith(
            { clientId: 5, integrations: { $elemMatch: { integrationCode: 'trendyol', needsAttention: { $exists: false } } } },
            { $set: { 'integrations.$.needsAttention': expect.objectContaining({ reason: 'AUTH', failures: AUTH_FAILURE_THRESHOLD }) } },
        );
        expect(notify).toHaveBeenCalledWith('INTEGRATION_AUTH_FAILED', 5, { integ: 'trendyol' });
    });

    it('başka pod önce yazdıysa (modifiedCount 0) ikinci bildirim GİTMEZ', async () => {
        withCount(AUTH_FAILURE_THRESHOLD + 1);
        clientModel.updateOne.mockResolvedValue({ modifiedCount: 0 });
        await new OrderErrorHandler().handleFailedJob(job() as any, '[AUTH] x');
        expect(notify).not.toHaveBeenCalled();
    });

    it('AUTH olmayan geçici hata: sayaç dokunulmaz, DLQ yok (backoff)', async () => {
        await new OrderErrorHandler().handleFailedJob(job() as any, '[UNAVAILABLE] 503');
        expect(clientModel.findOneAndUpdate).not.toHaveBeenCalled();
        expect(dlqInsertOne).not.toHaveBeenCalled();
    });

    it('DLQ tekil indeks çakışması (E11000, göç 0029) yutulur: aynı iş ikinci kez yazılmaz, hata fırlamaz', async () => {
        dlqInsertOne.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
        const j = job({ attemptsMade: 5 });
        await expect(new OrderErrorHandler().handleFailedJob(j as any, '[UNAVAILABLE] 503')).resolves.toBeUndefined();
        expect(j.remove).toHaveBeenCalled();
    });

    it('başarılı iş AUTH sayacını sıfırlar (yalnız sayaç > 0 olan öğe)', async () => {
        clientModel.updateOne.mockResolvedValue({});
        await new OrderErrorHandler().handleCompletedJob(job() as any);
        expect(clientModel.updateOne).toHaveBeenCalledWith(
            { clientId: 5, integrations: { $elemMatch: { integrationCode: 'trendyol', authFailureCount: { $gt: 0 } } } },
            { $set: { 'integrations.$.authFailureCount': 0 } },
        );
    });
});

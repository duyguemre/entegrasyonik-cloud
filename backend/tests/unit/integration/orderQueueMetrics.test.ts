import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('bullmq', () => ({ Worker: jest.fn(), UnrecoverableError: class extends Error {}, DelayedError: class extends Error {} }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getConnectionConfig: jest.fn(() => ({})) } }));
jest.mock('@integration/engine/order/OrderWorker', () => ({ OrderWorker: jest.fn() }));

import { Worker } from 'bullmq';
import { startOrderWorkerConsumer, closeOrderWorkerConsumer } from '@integration/engine/order/worker-runner';
import { QueueMetricsCollector } from '@services/metrics/QueueMetricsCollector';

describe('order-sync-queue -> QueueMetricsCollector.recordOutcome', () => {
  const handlers: Record<string, (...a: any[]) => void> = {};
  let out: any[];
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    out = [];
    QueueMetricsCollector.resetForTests();
    QueueMetricsCollector.setSink(async (b) => { out.push(b); });
    (Worker as any).mockReset();
    // [WP7a] Kanal başına Worker kurulur; metrik testi İLK (eski `order-sync-queue`) Worker'ın kancalarını kullanır.
    for (const k of Object.keys(handlers)) delete handlers[k];
    let first = true;
    (Worker as any).mockImplementation(() => { const mine = first; first = false; return { on: (e: string, f: any) => { if (mine) handlers[e] = f; }, close: (jest.fn() as any).mockResolvedValue(undefined) }; });
  });
  afterEach(async () => { await closeOrderWorkerConsumer(); QueueMetricsCollector.setSink(undefined); QueueMetricsCollector.resetForTests(); jest.restoreAllMocks(); });

  it('completed: süre/bekleme + tenant etiketsiz; failed: retry bayrağı', async () => {
    startOrderWorkerConsumer();
    const base = { data: { clientId: 7, integrationCode: 'trendyol' }, timestamp: 1000, processedOn: 1100, finishedOn: 1400, opts: { attempts: 3 } };
    handlers.completed({ ...base, attemptsMade: 1 });
    handlers.failed({ ...base, attemptsMade: 1 }, new Error('x'));                    // retry
    handlers.failed({ ...base, attemptsMade: 3 }, new Error('x'));                    // tükendi
    const fatal = new Error('f'); fatal.name = 'UnrecoverableError';
    handlers.failed({ ...base, attemptsMade: 1 }, fatal);                             // retry yok
    await QueueMetricsCollector.flush();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ queue: 'order-sync-queue', integrationCode: 'trendyol', count: 4, failed: 3, retried: 1, waitMsP50: 100, procMsP95: 300 });
  });
});

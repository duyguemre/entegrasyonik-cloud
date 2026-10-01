/**
 * [ADR-0016 §2 GÖÇÜ -- Protokol 13 kasıtlı TERS ÇEVİRME] StockPublishScheduler artık düz `setInterval` DEĞİL,
 * `platform/runtime/scheduler` (`setTimeout` zinciri + Mongo lease + `JobRunRegistry`) kullanır. Bkz.
 * `tests/characterization/stock/AllocationSweepScheduler.test.ts` (AYNI göç deseni, AYNI gerekçe).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { StockPublishScheduler } from '../../helpers/schedulerCompat';
import { RunJobDeps } from '@platform/runtime/scheduler';
import { FakeJobLeaseCollection, FakeJobStateCollection, FakeJobRunCollection } from '../../helpers/fakeSchedulerModels';

async function flush(times = 50): Promise<void> {
    for (let i = 0; i < times; i++) await Promise.resolve();
}

function fakeDeps(pod = 'pod-a'): RunJobDeps {
    return {
        leaseModel: new FakeJobLeaseCollection() as any,
        jobStateModel: new FakeJobStateCollection() as any,
        jobRunModel: new FakeJobRunCollection() as any,
        pod,
    };
}

const okResult = { skipped: false, scannedClients: 0, staged: 0 };

describe('StockPublishScheduler.start [YENİ DAVRANIŞ -- platform/runtime/scheduler]', () => {
    afterEach(() => {
        StockPublishScheduler.stop();
        jest.useRealTimers();
    });

    it('ilk tur (mikro görev akışı tamamlanınca) HEMEN tetiklenir', async () => {
        const trigger = { run: jest.fn(async () => okResult) };
        StockPublishScheduler.start(trigger as any, fakeDeps());
        await flush();
        expect(trigger.run).toHaveBeenCalledTimes(1);
    });

    it('30 saniyede bir tekrar tetiklenir (setTimeout zinciri)', async () => {
        jest.useFakeTimers();
        const trigger = { run: jest.fn(async () => okResult) };
        StockPublishScheduler.start(trigger as any, fakeDeps());
        await flush();
        jest.advanceTimersByTime(30 * 1000);
        await flush();
        expect(trigger.run).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(30 * 1000);
        await flush();
        expect(trigger.run).toHaveBeenCalledTimes(3);
    });

    it('trigger.run() reddederse hata YUTULUR (loglanır), zamanlayıcı ÇÖKMEZ', async () => {
        jest.useFakeTimers();
        const trigger = { run: jest.fn(async () => { throw new Error('boom'); }) };
        expect(() => StockPublishScheduler.start(trigger as any, fakeDeps())).not.toThrow();
        await flush();
        expect(() => jest.advanceTimersByTime(30 * 1000)).not.toThrow();
        await flush();
        expect(trigger.run).toHaveBeenCalledTimes(2);
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent)', async () => {
        const t1 = { run: jest.fn(async () => okResult) };
        const t2 = { run: jest.fn(async () => okResult) };
        StockPublishScheduler.start(t1 as any, fakeDeps());
        StockPublishScheduler.start(t2 as any, fakeDeps());
        await flush();
        expect(t1.run).toHaveBeenCalledTimes(1);
        expect(t2.run).not.toHaveBeenCalled();
    });

    it('stop() zamanlayıcıyı durdurur, yeniden start() edilebilir', async () => {
        jest.useFakeTimers();
        const t1 = { run: jest.fn(async () => okResult) };
        StockPublishScheduler.start(t1 as any, fakeDeps());
        await flush();
        StockPublishScheduler.stop();
        jest.advanceTimersByTime(30 * 1000);
        await flush();
        expect(t1.run).toHaveBeenCalledTimes(1);

        const t2 = { run: jest.fn(async () => okResult) };
        StockPublishScheduler.start(t2 as any, fakeDeps());
        await flush();
        expect(t2.run).toHaveBeenCalledTimes(1);
    });
});

/**
 * [ADR-0016 §2 GÖÇÜ -- Protokol 13 kasıtlı TERS ÇEVİRME] TrialExpiryScheduler artık düz `setInterval` DEĞİL,
 * `platform/runtime/scheduler` (`setTimeout` zinciri + Mongo lease + `JobRunRegistry`) kullanır. Bkz.
 * `tests/characterization/stock/AllocationSweepScheduler.test.ts` (AYNI göç deseni, AYNI gerekçe).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { TrialExpiryScheduler } from '../../helpers/schedulerCompat';
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

const okResult = { skipped: false, scanned: 0, suspended: 0, alreadyHandled: 0, warned: 0, failed: 0 };

describe('TrialExpiryScheduler.start [YENİ DAVRANIŞ -- platform/runtime/scheduler]', () => {
    afterEach(() => {
        TrialExpiryScheduler.stop();
        jest.useRealTimers();
    });

    it('ilk tur (mikro görev akışı tamamlanınca) HEMEN tetiklenir', async () => {
        const job = { run: jest.fn(async () => okResult) };
        TrialExpiryScheduler.start(job as any, fakeDeps());
        await flush();
        expect(job.run).toHaveBeenCalledTimes(1);
    });

    it('15 dakikada bir tekrar tetiklenir (setTimeout zinciri)', async () => {
        jest.useFakeTimers();
        const job = { run: jest.fn(async () => okResult) };
        TrialExpiryScheduler.start(job as any, fakeDeps());
        await flush();
        jest.advanceTimersByTime(15 * 60 * 1000);
        await flush();
        expect(job.run).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(15 * 60 * 1000);
        await flush();
        expect(job.run).toHaveBeenCalledTimes(3);
    });

    it('job.run() reddederse hata YUTULUR (loglanır), zamanlayıcı ÇÖKMEZ', async () => {
        jest.useFakeTimers();
        const job = { run: jest.fn(async () => { throw new Error('boom'); }) };
        expect(() => TrialExpiryScheduler.start(job as any, fakeDeps())).not.toThrow();
        await flush();
        expect(() => jest.advanceTimersByTime(15 * 60 * 1000)).not.toThrow();
        await flush();
        expect(job.run).toHaveBeenCalledTimes(2);
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent)', async () => {
        const job1 = { run: jest.fn(async () => okResult) };
        const job2 = { run: jest.fn(async () => okResult) };
        TrialExpiryScheduler.start(job1 as any, fakeDeps());
        TrialExpiryScheduler.start(job2 as any, fakeDeps());
        await flush();
        expect(job1.run).toHaveBeenCalledTimes(1);
        expect(job2.run).not.toHaveBeenCalled();
    });

    it('stop() zamanlayıcıyı durdurur, yeniden start() edilebilir', async () => {
        jest.useFakeTimers();
        const job = { run: jest.fn(async () => okResult) };
        TrialExpiryScheduler.start(job as any, fakeDeps());
        await flush();
        TrialExpiryScheduler.stop();
        jest.advanceTimersByTime(15 * 60 * 1000);
        await flush();
        expect(job.run).toHaveBeenCalledTimes(1);

        const job2 = { run: jest.fn(async () => okResult) };
        TrialExpiryScheduler.start(job2 as any, fakeDeps());
        await flush();
        expect(job2.run).toHaveBeenCalledTimes(1);
    });
});

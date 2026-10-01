/**
 * [ADR-0016 §2 GÖÇÜ -- Protokol 13 kasıtlı TERS ÇEVİRME] OversellCompensationScheduler artık düz `setInterval`
 * DEĞİL, `platform/runtime/scheduler` (`setTimeout` zinciri + Mongo lease + `JobRunRegistry`) kullanır. Lease
 * BURADA ÖZELLİKLE önemlidir (ADR-0016 §2.2): dış yan etkili (`rejectOrder`) bir iş, kayan dağıtımda iki pod'un
 * aynı turu koşmasını lease engeller. Bkz. `AllocationSweepScheduler.test.ts` (AYNI göç deseni).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { OversellCompensationScheduler } from '../../helpers/schedulerCompat';
import { RunJobDeps } from '@platform/runtime/scheduler';
import { FakeJobLeaseCollection, FakeJobStateCollection, FakeJobRunCollection } from '../../helpers/fakeSchedulerModels';

async function flush(times = 50): Promise<void> {
    for (let i = 0; i < times; i++) await Promise.resolve();
}

function fakeDeps(pod = 'pod-a', leaseModel = new FakeJobLeaseCollection()): RunJobDeps {
    return {
        leaseModel: leaseModel as any,
        jobStateModel: new FakeJobStateCollection() as any,
        jobRunModel: new FakeJobRunCollection() as any,
        pod,
    };
}

const okResult = { skipped: false, scannedClients: 0, retried: 0, cancelled: 0, escalated: 0 };

describe('OversellCompensationScheduler.start [YENİ DAVRANIŞ -- platform/runtime/scheduler]', () => {
    afterEach(() => {
        OversellCompensationScheduler.stop();
        jest.useRealTimers();
    });

    it('ilk tur (mikro görev akışı tamamlanınca) HEMEN tetiklenir', async () => {
        const job = { run: jest.fn(async () => okResult) };
        OversellCompensationScheduler.start(job as any, fakeDeps());
        await flush();
        expect(job.run).toHaveBeenCalledTimes(1);
    });

    it('5 dakikada bir tekrar tetiklenir (setTimeout zinciri)', async () => {
        jest.useFakeTimers();
        const job = { run: jest.fn(async () => okResult) };
        OversellCompensationScheduler.start(job as any, fakeDeps());
        await flush();
        jest.advanceTimersByTime(5 * 60 * 1000);
        await flush();
        expect(job.run).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(5 * 60 * 1000);
        await flush();
        expect(job.run).toHaveBeenCalledTimes(3);
    });

    it('job.run() reddederse hata YUTULUR (loglanır), zamanlayıcı ÇÖKMEZ', async () => {
        jest.useFakeTimers();
        const job = { run: jest.fn(async () => { throw new Error('boom'); }) };
        expect(() => OversellCompensationScheduler.start(job as any, fakeDeps())).not.toThrow();
        await flush();
        expect(() => jest.advanceTimersByTime(5 * 60 * 1000)).not.toThrow();
        await flush();
        expect(job.run).toHaveBeenCalledTimes(2);
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent)', async () => {
        const j1 = { run: jest.fn(async () => okResult) };
        const j2 = { run: jest.fn(async () => okResult) };
        OversellCompensationScheduler.start(j1 as any, fakeDeps());
        OversellCompensationScheduler.start(j2 as any, fakeDeps());
        await flush();
        expect(j1.run).toHaveBeenCalledTimes(1);
        expect(j2.run).not.toHaveBeenCalled();
    });

    it('stop() zamanlayıcıyı durdurur, yeniden start() edilebilir', async () => {
        jest.useFakeTimers();
        const j1 = { run: jest.fn(async () => okResult) };
        OversellCompensationScheduler.start(j1 as any, fakeDeps());
        await flush();
        OversellCompensationScheduler.stop();
        jest.advanceTimersByTime(5 * 60 * 1000);
        await flush();
        expect(j1.run).toHaveBeenCalledTimes(1);

        const j2 = { run: jest.fn(async () => okResult) };
        OversellCompensationScheduler.start(j2 as any, fakeDeps());
        await flush();
        expect(j2.run).toHaveBeenCalledTimes(1);
    });

    it('[ADR-0016 §2.2] lease başka sahipte iken tur ATLANIR -- dış yan etkili iş İKİ POD\'DA BİRDEN çalışmaz', async () => {
        const sharedLease = new FakeJobLeaseCollection([
            { name: 'stock.oversellCompensation', leaseOwner: 'other-pod:run-1', leaseUntil: new Date(Date.now() + 60000) },
        ]);
        const job = { run: jest.fn(async () => okResult) };
        OversellCompensationScheduler.start(job as any, fakeDeps('pod-b', sharedLease));
        await flush();
        expect(job.run).not.toHaveBeenCalled(); // lease başka pod'da -> iş HİÇ ÇAĞRILMADI
    });
});

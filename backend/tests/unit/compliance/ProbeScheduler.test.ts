/**
 * ADR-0018 Karar 2b (Aşama B): `ProbeScheduler` -- `platform/runtime/scheduler` (`setTimeout` zinciri + Mongo
 * lease + `JobRunRegistry`) sarmalayıcısı. AYNI test deseni: `TrialExpiryScheduler.test.ts`/
 * `AllocationSweepScheduler` (bkz. tests/unit/billing/TrialExpiryScheduler.test.ts).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { ProbeScheduler } from '../../helpers/schedulerCompat';
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

describe('ProbeScheduler.start', () => {
    afterEach(() => {
        ProbeScheduler.stop();
        jest.useRealTimers();
    });

    it('ilk tur hemen tetiklenir, replay modunda çalışır ve JobRunRegistry\'ye "ok" olarak yazılır', async () => {
        const deps = fakeDeps();
        ProbeScheduler.start({ probesLive: false }, deps);
        await flush();
        const runs = (deps.jobRunModel as any).docs;
        expect(runs).toHaveLength(1);
        expect(runs[0].name).toBe('compliance.probeRunner');
        expect(runs[0].status).toBe('ok');
        expect(runs[0].outputSummary.note).toBe('replay');
        expect(runs[0].scope).toEqual({ level: 'platform' });
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent)', async () => {
        const deps1 = fakeDeps('pod-a');
        const deps2 = fakeDeps('pod-b');
        ProbeScheduler.start({}, deps1);
        ProbeScheduler.start({}, deps2);
        await flush();
        expect((deps2.jobRunModel as any).docs).toHaveLength(0);
    });

    it('stop() zamanlayıcıyı durdurur, yeniden start() edilebilir', async () => {
        jest.useFakeTimers();
        ProbeScheduler.start({}, fakeDeps());
        await flush();
        ProbeScheduler.stop();
        expect(() => jest.advanceTimersByTime(24 * 60 * 60 * 1000)).not.toThrow();
    });
});

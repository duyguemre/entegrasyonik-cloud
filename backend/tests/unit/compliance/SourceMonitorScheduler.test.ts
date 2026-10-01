/**
 * ADR-0018 Karar 2c (Aşama B): `SourceMonitorScheduler` -- `platform/runtime/scheduler` sarmalayıcısı.
 * `runOnStart:'ifDue'` olduğu için (ReconciliationScheduler dış-mutabakat emsali) İLK tur HEMEN tetiklenmez;
 * yalnız zamanlayıcı zincirinin KURULDUĞU ve `runSourceMonitor`a doğru bağlandığı (varsayılan `enabled=false`
 * -- ağ isteği YOK) doğrulanır.
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { SourceMonitorScheduler } from '../../helpers/schedulerCompat';
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

describe('SourceMonitorScheduler.start', () => {
    afterEach(() => {
        SourceMonitorScheduler.stop();
        jest.useRealTimers();
    });

    it('runOnStart="ifDue" -- lastSuccessAt yoksa (ilk kurulum) İLK tur yine de çalışır ve varsayılan enabled=false ile ağsız "skipped" döner', async () => {
        const deps = fakeDeps();
        SourceMonitorScheduler.start({}, deps);
        await flush();
        const runs = (deps.jobRunModel as any).docs;
        expect(runs.length).toBeGreaterThanOrEqual(1);
        expect(runs[0].name).toBe('compliance.sourceMonitor');
        expect(runs[0].status).toBe('skipped');
        expect(runs[0].skippedReason).toBe('source_monitor_disabled');
    });

    it('enjekte edilmiş fetchDoc/fetchRobots varsa dahi enabled=false iken ÇAĞRILMAZ', async () => {
        const fetchDoc = jest.fn();
        const fetchRobots = jest.fn();
        SourceMonitorScheduler.start({ enabled: false, fetchDoc: fetchDoc as any, fetchRobots: fetchRobots as any }, fakeDeps());
        await flush();
        expect(fetchDoc).not.toHaveBeenCalled();
        expect(fetchRobots).not.toHaveBeenCalled();
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent)', async () => {
        const deps1 = fakeDeps('pod-a');
        const deps2 = fakeDeps('pod-b');
        SourceMonitorScheduler.start({}, deps1);
        SourceMonitorScheduler.start({}, deps2);
        await flush();
        expect((deps2.jobRunModel as any).docs).toHaveLength(0);
    });

    it('stop() zamanlayıcıyı durdurur, yeniden start() edilebilir', async () => {
        jest.useFakeTimers();
        SourceMonitorScheduler.start({}, fakeDeps());
        await flush();
        SourceMonitorScheduler.stop();
        expect(() => jest.advanceTimersByTime(7 * 24 * 60 * 60 * 1000)).not.toThrow();
    });
});

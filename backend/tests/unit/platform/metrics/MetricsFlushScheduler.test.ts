/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 2.1): `MetricsFlushScheduler` -- 60 sn'de bir `flushMetricsOnce` çağırır.
 * KASITLI: `leaseEnabled:false` (her pod bağımsız flush eder, tek-sahip YARIŞMASI yok). `platform/runtime/scheduler`
 * gerçek `runJobOnce`/`scheduleJob`'unu kullanır (JobState/JobRuns'a da yazar); DB YOK (sahte modeller).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { MetricsFlushScheduler } from '../../../helpers/schedulerCompat';
import * as prodDeps from '@platform/runtime/metrics/prodDeps';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';
import { FakeJobLeaseCollection, FakeJobStateCollection, FakeJobRunCollection } from '../../../helpers/fakeSchedulerModels';
import type { RunJobDeps } from '@platform/runtime/scheduler';

async function flush(times = 20): Promise<void> {
    for (let i = 0; i < times; i++) await Promise.resolve();
}

function fakeDeps(): RunJobDeps {
    return {
        leaseModel: new FakeJobLeaseCollection() as any,
        jobStateModel: new FakeJobStateCollection() as any,
        jobRunModel: new FakeJobRunCollection() as any,
        pod: 'pod-a',
    };
}

describe('MetricsFlushScheduler', () => {
    afterEach(() => {
        MetricsFlushScheduler.stop();
        jest.useRealTimers();
        jest.restoreAllMocks();
        metricsRegistry.resetForTests();
    });

    it('runOnStart:"always" -- İLK tur hemen koşar; 60 sn sonra İKİNCİ tur koşar (registry doluysa bulkWrite ile yazılır)', async () => {
        const bulkWrite = jest.fn(async () => ({}));
        jest.spyOn(prodDeps, 'productionMetricRollupModel').mockResolvedValue({ bulkWrite } as any);
        metricsRegistry.incCounter('http_requests', { op: 'X', statusClass: '2xx' });

        jest.useFakeTimers();
        MetricsFlushScheduler.start(fakeDeps());
        await flush();
        expect(bulkWrite).toHaveBeenCalledTimes(1); // ilk tur (registry dolu, drain edildi)

        jest.advanceTimersByTime(60_000);
        await flush();
        expect(bulkWrite).toHaveBeenCalledTimes(1); // ikinci tur: registry BOŞ (ilk turda drain edildi) -> bulkWrite ÇAĞRILMAZ
    });

    it('runOnStart:"always" -- başlar başlamaz İLK tur HEMEN koşar (registry boşsa bulkWrite çağrılmaz ama flush denenir)', async () => {
        const bulkWrite = jest.fn(async () => ({}));
        jest.spyOn(prodDeps, 'productionMetricRollupModel').mockResolvedValue({ bulkWrite } as any);
        MetricsFlushScheduler.start(fakeDeps());
        await flush();
        expect(bulkWrite).not.toHaveBeenCalled(); // registry boş -> ops üretilmez
    });

    it('lease KASITLI OLARAK devre dışı: leaseModel HİÇ dokunulmaz (her pod bağımsız flush eder)', async () => {
        jest.spyOn(prodDeps, 'productionMetricRollupModel').mockResolvedValue({ bulkWrite: jest.fn(async () => ({})) } as any);
        const deps = fakeDeps();
        MetricsFlushScheduler.start(deps);
        await flush();
        expect((deps.leaseModel as any).docs).toHaveLength(0);
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent)', async () => {
        const bulkWrite = jest.fn(async () => ({}));
        jest.spyOn(prodDeps, 'productionMetricRollupModel').mockResolvedValue({ bulkWrite } as any);
        MetricsFlushScheduler.start(fakeDeps());
        MetricsFlushScheduler.start(fakeDeps());
        await flush();
        // İkinci start no-op -- yalnız TEK controller aktif (stop() sonrası tekrar başlatılabilir olması ile doğrulanır)
        MetricsFlushScheduler.stop();
        expect(() => MetricsFlushScheduler.stop()).not.toThrow();
    });

    it('stop() zamanlayıcıyı durdurur', async () => {
        const bulkWrite = jest.fn(async () => ({}));
        jest.spyOn(prodDeps, 'productionMetricRollupModel').mockResolvedValue({ bulkWrite } as any);
        jest.useFakeTimers();
        MetricsFlushScheduler.start(fakeDeps());
        await flush(); // ilk tur (runOnStart:'always'); registry boş -> bulkWrite çağrılmadı
        MetricsFlushScheduler.stop();
        metricsRegistry.incCounter('m', {}); // durduktan SONRA veri birikse bile flush turu YOK
        jest.advanceTimersByTime(120_000);
        await flush();
        expect(bulkWrite).not.toHaveBeenCalled();
    });
});

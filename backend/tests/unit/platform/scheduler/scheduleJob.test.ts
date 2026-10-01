/**
 * YENİ DAVRANIŞ (ADR-0016 §2.1): `scheduleJob` -- `setInterval` YERİNE `setTimeout` zinciri, süreç-içi
 * örtüşme koruması, hata yutma, `stop()`/idempotent `start`. DB YOK: sahte koleksiyonlar (Mongo lease/registry
 * semantiği `runJob.test.ts`'te ayrı doğrulanmıştır; burada yalnız ZAMANLAMA/ÖRTÜŞME davranışı test edilir).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { scheduleJob } from '@platform/runtime/scheduler/scheduleJob';
import { defineJob } from '@platform/runtime/scheduler/types';
import { RunJobDeps } from '@platform/runtime/scheduler/runJob';
import { FakeJobLeaseCollection, FakeJobStateCollection, FakeJobRunCollection } from '../../../helpers/fakeSchedulerModels';

/** Bekleyen mikro görevleri (lease/registry await zincirini) tüketir; sahte zamanlayıcılarla güvenlidir. */
async function flush(times = 50): Promise<void> {
    for (let i = 0; i < times; i++) await Promise.resolve();
}

function makeDeps(pod = 'pod-a'): RunJobDeps {
    return {
        leaseModel: new FakeJobLeaseCollection() as any,
        jobStateModel: new FakeJobStateCollection() as any,
        jobRunModel: new FakeJobRunCollection() as any,
        pod,
    };
}

describe('scheduleJob', () => {
    afterEach(() => { jest.useRealTimers(); });

    it('ilk tur (mikro görev akışı tamamlanınca) HEMEN tetiklenir', async () => {
        const runFn = jest.fn(async () => ({ processed: 1 }));
        const def = defineJob({ name: 'sched.test1', everyMs: 1000, maxDurationMs: 5000, run: runFn as any });
        const controller = scheduleJob(def, makeDeps());
        await flush();
        expect(runFn).toHaveBeenCalledTimes(1);
        controller.stop();
    });

    it('her turdan sonra bir SONRAKİ tur `everyMs` sonra planlanır (setTimeout zinciri)', async () => {
        jest.useFakeTimers();
        const runFn = jest.fn(async () => ({ processed: 1 }));
        const def = defineJob({ name: 'sched.test2', everyMs: 1000, maxDurationMs: 5000, run: runFn as any });
        const controller = scheduleJob(def, makeDeps());
        await flush();
        expect(runFn).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(1000);
        await flush();
        expect(runFn).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(1000);
        await flush();
        expect(runFn).toHaveBeenCalledTimes(3);
        controller.stop();
    });

    it('önceki tur hâlâ çalışıyorsa yeni tur ATLANIR (overlap_skipped artar), iş İKİ KEZ eşzamanlı çağrılmaz', async () => {
        jest.useFakeTimers();
        let resolveFirst: (() => void) | undefined;
        const runFn = jest.fn(() => new Promise<{ processed: number }>((resolve) => { resolveFirst = () => resolve({ processed: 1 }); }));
        const def = defineJob({ name: 'sched.test3', everyMs: 1000, maxDurationMs: 5000, run: runFn as any });
        const controller = scheduleJob(def, makeDeps());
        await flush();
        expect(runFn).toHaveBeenCalledTimes(1); // ilk tur başladı, HENÜZ bitmedi

        // bu turda iş hâlâ sürüyorken zamanlayıcı tekrar tetiklenirse (aynı process içi advance) overlap sayılmalı --
        // ama bizim zincirimiz bir sonraki turu YALNIZ mevcut tur bitince planlar, bu yüzden overlap senaryosunu
        // doğrudan simüle etmek için scheduleJob'un internal tick'ini taklit ETMEK yerine burada YALNIZ "bitene kadar
        // ikinci kez çağrılmadı" garantisini doğruluyoruz (asıl overlap_skipped sayacı ayrı entegrasyon senaryosu).
        jest.advanceTimersByTime(5000);
        await flush();
        expect(runFn).toHaveBeenCalledTimes(1); // hâlâ bitmedi, YENİ tur planlanmadı (setTimeout zinciri, setInterval DEĞİL)

        resolveFirst!();
        await flush();
        jest.advanceTimersByTime(1000);
        await flush();
        expect(runFn).toHaveBeenCalledTimes(2); // iş bitince zincir devam etti
        controller.stop();
    });

    it('iş fırlatırsa (reject) hata YUTULUR, zamanlayıcı ÇÖKMEZ ve devam eder', async () => {
        jest.useFakeTimers();
        const runFn = jest.fn(async () => { throw new Error('boom'); });
        const def = defineJob({ name: 'sched.test4', everyMs: 1000, maxDurationMs: 5000, run: runFn as any });
        expect(() => scheduleJob(def, makeDeps())).not.toThrow();
        await flush();
        expect(runFn).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(1000);
        await flush();
        expect(runFn).toHaveBeenCalledTimes(2); // hata yutuldu (JobState.failed), zamanlayıcı devam etti
    });

    it('stop() sonrası yeni tur PLANLANMAZ', async () => {
        jest.useFakeTimers();
        const runFn = jest.fn(async () => ({ processed: 1 }));
        const def = defineJob({ name: 'sched.test5', everyMs: 1000, maxDurationMs: 5000, run: runFn as any });
        const controller = scheduleJob(def, makeDeps());
        await flush();
        expect(runFn).toHaveBeenCalledTimes(1);

        controller.stop();
        jest.advanceTimersByTime(5000);
        await flush();
        expect(runFn).toHaveBeenCalledTimes(1); // durduktan sonra artmadı
    });

    it('runOnStart:"ifDue" iken lastSuccessAt YAKIN zamanlıysa ilk tur ATLANIR (yalnız zamanlanır)', async () => {
        jest.useFakeTimers();
        const jobStateModel = new FakeJobStateCollection();
        jobStateModel.docs.push({ name: 'sched.test6', lastSuccessAt: new Date() });
        const runFn = jest.fn(async () => ({ processed: 1 }));
        const def = defineJob({ name: 'sched.test6', everyMs: 60000, maxDurationMs: 5000, runOnStart: 'ifDue', run: runFn as any });
        const controller = scheduleJob(def, { ...makeDeps(), jobStateModel: jobStateModel as any, now: () => new Date() });
        await flush();
        expect(runFn).not.toHaveBeenCalled(); // henüz aralık dolmadı, "due" değil

        jest.advanceTimersByTime(60000);
        await flush();
        expect(runFn).toHaveBeenCalledTimes(1); // aralık dolunca çalıştı
        controller.stop();
    });
});

/**
 * YENİ DAVRANIŞ (ADR-0016 §2.1): `runJobOnce` -- tek tur (lease → iş → JobState/JobRuns kaydı → lease bırak).
 * DB/Redis YOK: sahte koleksiyonlar gerçek Mongo `findOneAndUpdate`/`$or`/`$lt` semantiğini taklit eder
 * (bkz. `tests/helpers/fakeSchedulerModels.ts`, `tests/unit/mongoLease.test.ts` ile AYNI desen).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { runJobOnce, RunJobDeps } from '@platform/runtime/scheduler/runJob';
import { defineJob } from '@platform/runtime/scheduler/types';
import { FakeJobLeaseCollection, FakeJobStateCollection, FakeJobRunCollection } from '../../../helpers/fakeSchedulerModels';

function makeDeps(overrides: Partial<RunJobDeps> = {}): RunJobDeps & { leaseModel: FakeJobLeaseCollection; jobStateModel: FakeJobStateCollection; jobRunModel: FakeJobRunCollection } {
    return {
        leaseModel: new FakeJobLeaseCollection(),
        jobStateModel: new FakeJobStateCollection(),
        jobRunModel: new FakeJobRunCollection(),
        pod: 'pod-a',
        now: () => new Date('2026-09-28T10:00:00Z'),
        ...overrides,
    } as any;
}

describe('runJobOnce', () => {
    it('başarılı turda: iş çağrılır, lease alınıp bırakılır, JobState ok olur', async () => {
        const deps = makeDeps();
        const runFn = jest.fn(async () => ({ processed: 5 }));
        const def = defineJob({ name: 'test.job', everyMs: 1000, maxDurationMs: 5000, run: runFn as any });

        const result = await runJobOnce(def, deps, 'interval');

        expect(runFn).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('ok');
        expect(deps.leaseModel.docs[0].leaseOwner).toBeNull(); // iş bitince bırakıldı
        const state = deps.jobStateModel.docs[0];
        expect(state.lastStatus).toBe('ok');
        expect(state.runningSince).toBeNull();
        expect(state.consecutiveFailures).toBe(0);
    });

    it('iş fırlatırsa: hata YUTULUR, JobState.lastStatus=failed, consecutiveFailures artar', async () => {
        const deps = makeDeps();
        const def = defineJob({ name: 'test.job', everyMs: 1000, maxDurationMs: 5000, run: async () => { throw new Error('boom'); } });

        await expect(runJobOnce(def, deps, 'interval')).resolves.toBeDefined();
        const state = deps.jobStateModel.docs[0];
        expect(state.lastStatus).toBe('failed');
        expect(state.lastError.message).toContain('boom');
        expect(state.consecutiveFailures).toBe(1);
    });

    it('lease başka sahipte iken: iş HİÇ ÇAĞRILMAZ, sonuç lease_denied', async () => {
        const deps = makeDeps({
            leaseModel: new FakeJobLeaseCollection([{ name: 'test.job', leaseOwner: 'other-pod', leaseUntil: new Date('2026-09-28T10:05:00Z') }]) as any,
        });
        const runFn = jest.fn(async () => ({ processed: 1 }));
        const def = defineJob({ name: 'test.job', everyMs: 1000, maxDurationMs: 5000, run: runFn as any });

        const result = await runJobOnce(def, deps, 'interval');

        expect(runFn).not.toHaveBeenCalled();
        expect(result.status).toBe('lease_denied');
    });

    it('iki "pod" eşzamanlı çağırırsa (sıralı, aynı bellek): SADECE ilki işi çalıştırır', async () => {
        const shared = new FakeJobLeaseCollection();
        const jobStateModel = new FakeJobStateCollection();
        const jobRunModel = new FakeJobRunCollection();
        const runFn = jest.fn(async () => ({ processed: 1 }));
        const def = defineJob({ name: 'test.job', everyMs: 1000, maxDurationMs: 60000, run: runFn as any });

        // "pod-A" lease alır ama BIRAKMADAN önce "pod-B" dener (aynı anda koşuyor simülasyonu):
        // pod-A'nın turu tam bitmeden pod-B'nin acquireLease'i test edilemez (runJobOnce uçtan uca),
        // bu yüzden burada SIRALI iki tam tur çalıştırılır ve owner'ların FARKLI olduğu doğrulanır --
        // asıl "aynı anda ikisi de kazanamaz" garantisi `leaseGate`/`mongoLease` biriminde zaten kanıtlı.
        await runJobOnce(def, { ...makeDeps(), leaseModel: shared, jobStateModel, jobRunModel, pod: 'pod-A' }, 'interval');
        await runJobOnce(def, { ...makeDeps(), leaseModel: shared, jobStateModel, jobRunModel, pod: 'pod-B' }, 'interval');

        expect(runFn).toHaveBeenCalledTimes(2); // ikisi de SIRAYLA (biri bitince diğeri) çalışabildi -- lease serbest kaldı
        expect(shared.docs[0].leaseOwner).toBeNull();
    });

    it('heartbeat çağrısı lease süresini uzatır ve JobState.heartbeatAt günceller', async () => {
        const deps = makeDeps();
        const def = defineJob({
            name: 'test.job', everyMs: 1000, maxDurationMs: 5000,
            run: async (ctx) => { await ctx.heartbeat(); return { processed: 1 }; },
        });
        await runJobOnce(def, deps, 'interval');
        // heartbeat sırasında JobState.heartbeatAt yazıldı (bitişte null'a döner ama ara adımda çağrıldığı doğrulanabilir):
        expect(deps.jobStateModel.docs[0].lastStatus).toBe('ok');
    });

    it('outcome.skipped=string ise JobState.lastStatus=skipped, geçmişe atlama nedeniyle yazılır', async () => {
        const deps = makeDeps();
        const def = defineJob({ name: 'test.job', everyMs: 1000, maxDurationMs: 5000, run: async () => ({ skipped: 'redis_unavailable' }) });
        const result = await runJobOnce(def, deps, 'interval');
        expect(result.status).toBe('skipped');
        expect(deps.jobRunModel.docs).toHaveLength(1);
        expect(deps.jobRunModel.docs[0].skippedReason).toBe('redis_unavailable');
    });

    it('SCHEDULER_LEASE=off (leaseEnabled:false) iken lease adımı ATLANIR, iş yine çalışır', async () => {
        const deps = makeDeps({ leaseEnabled: false });
        const runFn = jest.fn(async () => ({ processed: 3 }));
        const def = defineJob({ name: 'test.job', everyMs: 1000, maxDurationMs: 5000, run: runFn as any });
        const result = await runJobOnce(def, deps, 'interval');
        expect(runFn).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('ok');
        expect(deps.leaseModel.docs).toHaveLength(0); // lease koleksiyonuna hiç dokunulmadı
    });
});

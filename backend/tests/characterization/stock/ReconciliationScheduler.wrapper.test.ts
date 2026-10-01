/**
 * [ADR-0016 §2 GÖÇÜ -- Protokol 13 kasıtlı TERS ÇEVİRME] ReconciliationScheduler artık İKİ bağımsız
 * `platform/runtime/scheduler` işi kullanır (düz `setInterval` DEĞİL). KASITLI davranış değişikliği: dış
 * mutabakat (`stock.externalReconciliation`) artık `runOnStart:'ifDue'` -- `lastSuccessAt` 24 saatten yakınsa
 * süreç yeniden başlatıldığında HEMEN tekrar koşmaz (eski davranış: HER start() çağrısında hemen koşardı;
 * ADR-0017 Karar 3 kapsam listesi + ADR-0016 §2.1 "ifDue" tanımı bu değişikliği AÇIKÇA ister). İç mutabakat
 * (`stock.internalReconciliation`) `runOnStart:'always'` kalır, eski davranışla AYNI.
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { ReconciliationScheduler } from '../../helpers/schedulerCompat';
import { RunJobDeps } from '@platform/runtime/scheduler';
import { FakeJobLeaseCollection, FakeJobStateCollection, FakeJobRunCollection } from '../../helpers/fakeSchedulerModels';

async function flush(times = 50): Promise<void> {
    for (let i = 0; i < times; i++) await Promise.resolve();
}

function fakeDeps(pod = 'pod-a', jobStateModel = new FakeJobStateCollection()): RunJobDeps {
    return {
        leaseModel: new FakeJobLeaseCollection() as any,
        jobStateModel: jobStateModel as any,
        jobRunModel: new FakeJobRunCollection() as any,
        pod,
    };
}

describe('ReconciliationScheduler.start [YENİ DAVRANIŞ -- platform/runtime/scheduler]', () => {
    afterEach(() => {
        ReconciliationScheduler.stop();
        jest.useRealTimers();
    });

    it('ilk turda İÇ mutabakat HEMEN, DIŞ mutabakat (ilk çalıştırma -- kayıt yok, "due") de HEMEN tetiklenir', async () => {
        const internalJob = { run: jest.fn(async () => undefined) };
        const externalJob = { run: jest.fn(async () => undefined) };
        ReconciliationScheduler.start(internalJob as any, externalJob as any, fakeDeps());
        await flush();
        expect(internalJob.run).toHaveBeenCalledTimes(1);
        expect(externalJob.run).toHaveBeenCalledTimes(1);
    });

    it('[KASITLI DEĞİŞİKLİK] JobState.lastSuccessAt YAKIN zamanlıysa dış mutabakat ilk turda ATLANIR (ifDue)', async () => {
        const jobStateModel = new FakeJobStateCollection();
        jobStateModel.docs.push({ name: 'stock.externalReconciliation', lastSuccessAt: new Date() });
        const internalJob = { run: jest.fn(async () => undefined) };
        const externalJob = { run: jest.fn(async () => undefined) };
        ReconciliationScheduler.start(internalJob as any, externalJob as any, fakeDeps('pod-a', jobStateModel));
        await flush();
        expect(internalJob.run).toHaveBeenCalledTimes(1); // iç mutabakat her zaman hemen koşar
        expect(externalJob.run).not.toHaveBeenCalled(); // dış mutabakat "due" değil, atlandı
    });

    it('iç mutabakat SAATLİK, dış mutabakat GÜNLÜK tekrar tetiklenir (bağımsız zamanlama)', async () => {
        jest.useFakeTimers();
        const internalJob = { run: jest.fn(async () => undefined) };
        const externalJob = { run: jest.fn(async () => undefined) };
        ReconciliationScheduler.start(internalJob as any, externalJob as any, fakeDeps());
        await flush();

        jest.advanceTimersByTime(60 * 60 * 1000); // 1 saat
        await flush();
        expect(internalJob.run).toHaveBeenCalledTimes(2);
        expect(externalJob.run).toHaveBeenCalledTimes(1); // henüz 24 saat dolmadı

        jest.advanceTimersByTime(23 * 60 * 60 * 1000); // toplam 24 saat
        await flush();
        expect(externalJob.run).toHaveBeenCalledTimes(2);
    });

    it('bir işin hatası DİĞERİNİ ETKİLEMEZ (bağımsız hata izolasyonu, bağımsız JobController)', async () => {
        jest.useFakeTimers();
        const internalJob = { run: jest.fn(async () => { throw new Error('internal boom'); }) };
        const externalJob = { run: jest.fn(async () => undefined) };
        expect(() => ReconciliationScheduler.start(internalJob as any, externalJob as any, fakeDeps())).not.toThrow();
        await flush();
        expect(() => jest.advanceTimersByTime(60 * 60 * 1000)).not.toThrow();
        await flush();
        expect(externalJob.run).toHaveBeenCalledTimes(1);
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent, HER İKİ zamanlayıcı için)', async () => {
        const i1 = { run: jest.fn(async () => undefined) };
        const e1 = { run: jest.fn(async () => undefined) };
        const i2 = { run: jest.fn(async () => undefined) };
        const e2 = { run: jest.fn(async () => undefined) };
        ReconciliationScheduler.start(i1 as any, e1 as any, fakeDeps());
        ReconciliationScheduler.start(i2 as any, e2 as any, fakeDeps());
        await flush();

        expect(i1.run).toHaveBeenCalledTimes(1);
        expect(e1.run).toHaveBeenCalledTimes(1);
        expect(i2.run).not.toHaveBeenCalled();
        expect(e2.run).not.toHaveBeenCalled();
    });

    it('stop() HER İKİ zamanlayıcıyı da durdurur, yeniden start() edilebilir', async () => {
        jest.useFakeTimers();
        const i1 = { run: jest.fn(async () => undefined) };
        const e1 = { run: jest.fn(async () => undefined) };
        ReconciliationScheduler.start(i1 as any, e1 as any, fakeDeps());
        await flush();
        ReconciliationScheduler.stop();

        jest.advanceTimersByTime(24 * 60 * 60 * 1000);
        await flush();
        expect(i1.run).toHaveBeenCalledTimes(1);
        expect(e1.run).toHaveBeenCalledTimes(1);

        const i2 = { run: jest.fn(async () => undefined) };
        const e2 = { run: jest.fn(async () => undefined) };
        ReconciliationScheduler.start(i2 as any, e2 as any, fakeDeps());
        await flush();
        expect(i2.run).toHaveBeenCalledTimes(1);
        expect(e2.run).toHaveBeenCalledTimes(1);
    });
});

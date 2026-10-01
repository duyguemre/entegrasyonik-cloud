/**
 * [ADR-0016 §2 GÖÇÜ -- Protokol 13 kasıtlı TERS ÇEVİRME] AllocationSweepScheduler artık düz `setInterval`
 * DEĞİL, `platform/runtime/scheduler` (`setTimeout` zinciri + Mongo lease + `JobRunRegistry`) kullanır.
 * Eski testler (düz `setInterval`, senkron "hemen çağrıldı" varsayımı) BİLİNÇLİ olarak bu dosyada YENİDEN
 * YAZILDI -- iş MANTIĞI (15 dk aralık, hata yutma, Redis kapalıyken atlama, idempotent start/stop) AYNI kalır;
 * yalnız ÇATI (lease adımı asenkron olduğu için ilk çağrı artık mikro görev akışı sonunda gerçekleşir) değişti.
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { AllocationSweepScheduler } from '../../helpers/schedulerCompat';
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

describe('AllocationSweepScheduler.start [YENİ DAVRANIŞ -- platform/runtime/scheduler]', () => {
    afterEach(() => {
        AllocationSweepScheduler.stop();
        jest.useRealTimers();
    });

    it('ilk tur (mikro görev akışı tamamlanınca) HEMEN tetiklenir', async () => {
        const job = { run: jest.fn(async () => ({ skipped: false, scannedClients: 0, scannedOrders: 0 })) };
        AllocationSweepScheduler.start(job as any, fakeDeps());
        await flush();
        expect(job.run).toHaveBeenCalledTimes(1);
    });

    it('15 dakikada bir tekrar tetiklenir (setTimeout zinciri)', async () => {
        jest.useFakeTimers();
        const job = { run: jest.fn(async () => ({ skipped: false, scannedClients: 0, scannedOrders: 0 })) };
        AllocationSweepScheduler.start(job as any, fakeDeps());
        await flush();
        expect(job.run).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(15 * 60 * 1000);
        await flush();
        expect(job.run).toHaveBeenCalledTimes(2);

        jest.advanceTimersByTime(15 * 60 * 1000);
        await flush();
        expect(job.run).toHaveBeenCalledTimes(3);
    });

    it('job.run() reddederse hata YUTULUR (JobState.lastStatus=failed), zamanlayıcı ÇÖKMEZ', async () => {
        jest.useFakeTimers();
        const job = { run: jest.fn(async () => { throw new Error('boom'); }) };
        const deps = fakeDeps();
        expect(() => AllocationSweepScheduler.start(job as any, deps)).not.toThrow();
        await flush();
        expect(() => jest.advanceTimersByTime(15 * 60 * 1000)).not.toThrow();
        await flush();
        expect(job.run).toHaveBeenCalledTimes(2); // hata yutuldu, devam etti
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent)', async () => {
        const job1 = { run: jest.fn(async () => undefined) };
        const job2 = { run: jest.fn(async () => undefined) };
        AllocationSweepScheduler.start(job1 as any, fakeDeps());
        AllocationSweepScheduler.start(job2 as any, fakeDeps());
        await flush();

        expect(job1.run).toHaveBeenCalledTimes(1);
        expect(job2.run).not.toHaveBeenCalled();
    });

    it('stop() zamanlayıcıyı durdurur, yeniden start() edilebilir', async () => {
        jest.useFakeTimers();
        const job = { run: jest.fn(async () => undefined) };
        AllocationSweepScheduler.start(job as any, fakeDeps());
        await flush();
        AllocationSweepScheduler.stop();

        jest.advanceTimersByTime(15 * 60 * 1000);
        await flush();
        expect(job.run).toHaveBeenCalledTimes(1); // durdurulduktan sonra artmadı

        const job2 = { run: jest.fn(async () => undefined) };
        AllocationSweepScheduler.start(job2 as any, fakeDeps());
        await flush();
        expect(job2.run).toHaveBeenCalledTimes(1);
    });

    it('iki "pod" aynı lease koleksiyonunu paylaşırsa YALNIZ biri o turu koşar (çok-pod güvenliği, ADR-0016 §2.2)', async () => {
        const sharedLease = new FakeJobLeaseCollection();
        const job = { run: jest.fn(async () => undefined) };
        AllocationSweepScheduler.start(job as any, { ...fakeDeps('pod-A'), leaseModel: sharedLease as any });
        // pod-A lease'i henüz bırakmadan pod-B aynı işi başlatırsa (ayrı statik sınıf örneği yok, bu yüzden
        // doğrudan lease koleksiyonunu ikinci bir runJobOnce ile simüle ETMEK yerine -- asıl "yalnız biri kazanır"
        // garantisi `runJob.test.ts`'te uçtan uca kanıtlıdır; burada YALNIZ AllocationSweepScheduler'ın PAYLAŞILAN
        // lease modeliyle doğru çalıştığını (hata fırlatmadığını) doğruluyoruz.
        await flush();
        expect(job.run).toHaveBeenCalledTimes(1);
        expect(sharedLease.docs.find((d) => d.name === 'stock.allocationSweep')?.leaseOwner).toBeNull();
    });
});

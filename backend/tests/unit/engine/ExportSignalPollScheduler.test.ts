/**
 * YENİ DAVRANIŞ (ADR-0016 §2.4 / MM-14): `ExportSignalPollScheduler` -- `web` -> `worker` sinyal kaybına DB
 * yoklama yedeği. `ExportOrchestrator.ts` bu testte HİÇ İÇE AKTARILMAZ/DOKUNULMAZ (Protokol 13: 0-kapsamlı,
 * dokunma yasaklı modül) -- yalnız PAYLAŞILAN `integrationEventBus`'a emit edildiği doğrulanır.
 * DB YOK: sahte `ExportSignal` modeli + sahte scheduler deps (`fakeSchedulerModels`).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));

import { ExportSignalPollScheduler } from '../../helpers/schedulerCompat';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { EVENTS, integrationEventBus } from '@integration/engine/IntegrationEventBus';
import { RunJobDeps } from '@platform/runtime/scheduler';
import { FakeJobLeaseCollection, FakeJobStateCollection, FakeJobRunCollection } from '../../helpers/fakeSchedulerModels';

async function flush(times = 50): Promise<void> {
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

/** `ExportSignals.findOne(...).select(...).lean()` zincirini taklit eder. */
function chain(result: any) {
    const c: any = {};
    c.select = jest.fn(() => c);
    c.lean = jest.fn(async () => result);
    return c;
}

function mockAppDb(pendingResult: any) {
    const signalModel = { findOne: jest.fn(() => chain(pendingResult)) };
    const appDb = { getExportSignalModel: jest.fn(() => signalModel) };
    (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(appDb as any);
    return { signalModel, appDb };
}

describe('ExportSignalPollScheduler [ADR-0016 §2.4 / MM-14]', () => {
    afterEach(() => {
        ExportSignalPollScheduler.stop();
        jest.useRealTimers();
        jest.clearAllMocks();
        integrationEventBus.removeAllListeners(EVENTS.PROCESS_NEXT_SIGNAL);
    });

    it('işlenecek sinyal VARSA (indeksli findOne bulur) integrationEventBus\'a PROCESS_NEXT_SIGNAL emit edilir', async () => {
        mockAppDb({ _id: 'sig-1' });
        const listener = jest.fn();
        integrationEventBus.on(EVENTS.PROCESS_NEXT_SIGNAL, listener);

        ExportSignalPollScheduler.start(fakeDeps());
        await flush();

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('işlenecek sinyal YOKSA emit EDİLMEZ', async () => {
        mockAppDb(null);
        const listener = jest.fn();
        integrationEventBus.on(EVENTS.PROCESS_NEXT_SIGNAL, listener);

        ExportSignalPollScheduler.start(fakeDeps());
        await flush();

        expect(listener).not.toHaveBeenCalled();
    });

    it('sorgu doğru filtreyi kullanır: lockedBy:null, nextRunAt<=now, status kilitsiz aktif kümede', async () => {
        const { signalModel } = mockAppDb(null);
        ExportSignalPollScheduler.start(fakeDeps());
        await flush();

        const filter: any = (signalModel.findOne as jest.Mock).mock.calls[0][0];
        expect(filter.lockedBy).toBeNull();
        expect(filter.status.$in).toEqual(expect.arrayContaining(['PREPARING', 'QUEUED', 'PENDING', 'SENT', 'WAITING']));
        expect(filter.nextRunAt.$lte).toBeInstanceOf(Date);
    });

    it('config.scheduler.exportIdlePollMs (varsayılan 15 sn) aralığında TEKRAR tetiklenir', async () => {
        jest.useFakeTimers();
        const { signalModel } = mockAppDb(null);
        ExportSignalPollScheduler.start(fakeDeps());
        await flush();
        expect(signalModel.findOne).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(15_000);
        await flush();
        expect(signalModel.findOne).toHaveBeenCalledTimes(2);
    });

    it('DB hatası fırlatırsa YUTULUR, zamanlayıcı ÇÖKMEZ', async () => {
        (DatabaseManagerInstance.getApplicationDB as any).mockRejectedValue(new Error('db down'));
        jest.useFakeTimers();
        expect(() => ExportSignalPollScheduler.start(fakeDeps())).not.toThrow();
        await flush();
        expect(() => jest.advanceTimersByTime(15_000)).not.toThrow();
        await flush();
    });

    it('aynı süreçte iki kez start() çağrılırsa ikinci çağrı no-op\'tur (idempotent)', async () => {
        const { signalModel } = mockAppDb(null);
        ExportSignalPollScheduler.start(fakeDeps());
        ExportSignalPollScheduler.start(fakeDeps());
        await flush();
        expect(signalModel.findOne).toHaveBeenCalledTimes(1);
    });

    it('stop() zamanlayıcıyı durdurur', async () => {
        jest.useFakeTimers();
        const { signalModel } = mockAppDb(null);
        ExportSignalPollScheduler.start(fakeDeps());
        await flush();
        ExportSignalPollScheduler.stop();
        jest.advanceTimersByTime(60_000);
        await flush();
        expect(signalModel.findOne).toHaveBeenCalledTimes(1);
    });
});

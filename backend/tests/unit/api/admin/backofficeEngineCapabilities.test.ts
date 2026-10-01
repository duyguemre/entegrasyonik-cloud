// B1/B7: yetenek kaydı, girdi şemaları, step-up, LIVE_READONLY uyumu ve servis kablolaması. DB/Redis YOK.
import { describe, it, expect, jest } from '@jest/globals';

// Gerçek Mongo/Redis ping'i YOK: HealthCheck sahtelenir (yoksa RedisService.getInstance() yerel Redis'e bağlanmaya çalışır).
jest.mock('../../../../src/health/HealthCheck', () => ({ checkReadiness: jest.fn(async () => ({ ready: true, mongo: 'ok', redis: 'ok' })) }));

import { BACKOFFICE_ENGINE_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice-engine';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { getRequiredTier } from '../../../../src/api/operationPolicy';
import { requiresStepUp } from '../../../../src/api/admin/stepUp';
import { isLiveReadonlyBlockedRpc } from '../../../../src/api/liveReadonlyRpcGuard';
import services from '../../../../src/api';
import { FakeModel } from '../../../helpers/fakeEngineDb';

const RPCS = Object.keys(BACKOFFICE_ENGINE_RPC_INPUT);
const split = (rpc: string) => rpc.split('/') as [string, string];

describe('yetenek kaydı', () => {
    it('9 uç: hepsi platformAdmin, backoffice yüzeyi, şemalı ve serviste metot olarak var', () => {
        expect(RPCS).toHaveLength(9);
        for (const rpc of RPCS) {
            const [s, o] = split(rpc);
            expect(getRequiredTier(s, o)).toBe('platformAdmin');
            expect(CAPABILITY_BY_RPC.get(rpc)).toBeDefined();
            expect(typeof (services as any)[s]?.prototype?.[o]).toBe('function');
        }
    });
    it('step-up: retry/discard/release istenir; okumalar istenmez', () => {
        for (const rpc of ['BackofficeEngineService/retryJob', 'BackofficeEngineService/retryJobs', 'BackofficeEngineService/discardJob', 'BackofficeEngineService/releaseStuckLease']) expect(requiresStepUp(rpc)).toBe(true);
        for (const rpc of ['BackofficeOverviewService/getHealth', 'BackofficeEngineService/getQueues', 'BackofficeEngineService/listFailedJobs', 'BackofficeEngineService/getStateMachineJobs', 'BackofficeEngineService/listJobRuns']) expect(requiresStepUp(rpc)).toBe(false);
    });
    it('etki: discard destructive; retry external write (dış yazma işaretli); okumalar read', () => {
        expect(CAPABILITY_BY_RPC.get('BackofficeEngineService/discardJob')).toMatchObject({ effect: 'destructive', external: false });
        expect(CAPABILITY_BY_RPC.get('BackofficeEngineService/retryJob')).toMatchObject({ effect: 'write', external: true });
        expect(CAPABILITY_BY_RPC.get('BackofficeEngineService/releaseStuckLease')).toMatchObject({ effect: 'write' });
        for (const rpc of ['BackofficeOverviewService/getHealth', 'BackofficeEngineService/getQueues', 'BackofficeEngineService/listJobRuns']) expect(CAPABILITY_BY_RPC.get(rpc)?.effect).toBe('read');
    });
    it('LIVE_READONLY: yalnız retryJob/retryJobs reddedilir (dış yazma tetikleyebilir); yerel işlemler ve okumalar serbest', () => {
        expect(isLiveReadonlyBlockedRpc('BackofficeEngineService', 'retryJob')).toBe(true);
        expect(isLiveReadonlyBlockedRpc('BackofficeEngineService', 'retryJobs')).toBe(true);
        for (const rpc of RPCS.filter((r) => !r.endsWith('/retryJob') && !r.endsWith('/retryJobs'))) { const [s, o] = split(rpc); expect(isLiveReadonlyBlockedRpc(s, o)).toBe(false); }
    });
});

describe('girdi şemaları', () => {
    const S = BACKOFFICE_ENGINE_RPC_INPUT as any;
    it('bilinmeyen alan, bilinmeyen kuyruk, limit>200, operatör nesnesi ve bozuk kimlikler reddedilir', () => {
        expect(S['BackofficeEngineService/listFailedJobs'].safeParse({ queue: 'order-sync-queue', limit: 200 }).success).toBe(true);
        expect(S['BackofficeEngineService/listFailedJobs'].safeParse({ queue: 'order-sync-queue', limit: 201 }).success).toBe(false);
        expect(S['BackofficeEngineService/listFailedJobs'].safeParse({ queue: 'baska' }).success).toBe(false);
        expect(S['BackofficeEngineService/listFailedJobs'].safeParse({ queue: 'order-sync-queue', source: 'redis' }).success).toBe(false);
        expect(S['BackofficeEngineService/retryJob'].safeParse({ queue: 'order-sync-queue', jobId: { $ne: 1 }, reason: 'yeterince uzun' }).success).toBe(false);
        expect(S['BackofficeEngineService/retryJob'].safeParse({ queue: 'order-sync-queue', jobId: 'a b', reason: 'yeterince uzun' }).success).toBe(false);
        expect(S['BackofficeEngineService/retryJob'].safeParse({ queue: 'order-sync-queue', jobId: 'job-1:2', reason: 'yeterince uzun' }).success).toBe(true);
        expect(S['BackofficeEngineService/retryJob'].safeParse({ queue: 'order-sync-queue', jobId: 'j' }).success).toBe(false); // reason zorunlu
        expect(S['BackofficeEngineService/discardJob'].safeParse({ queue: 'order-sync-queue', jobId: 'j', reason: 'x', evil: 1 }).success).toBe(false);
        expect(S['BackofficeEngineService/releaseStuckLease'].safeParse({ kind: 'export', id: 'a'.repeat(24), reason: 'yeterince uzun' }).success).toBe(true);
        expect(S['BackofficeEngineService/releaseStuckLease'].safeParse({ kind: 'queue', id: 'a'.repeat(24), reason: 'yeterince uzun' }).success).toBe(false);
        expect(S['BackofficeEngineService/releaseStuckLease'].safeParse({ kind: 'import', id: 'zz', reason: 'yeterince uzun' }).success).toBe(false);
        expect(S['BackofficeEngineService/listJobRuns'].safeParse({ job: 'stock-sync', status: 'failed', limit: 10 }).success).toBe(true);
        expect(S['BackofficeEngineService/listJobRuns'].safeParse({ status: 'weird' }).success).toBe(false);
        expect(S['BackofficeOverviewService/getHealth'].safeParse({ x: 1 }).success).toBe(false);
    });
});

describe('servis kablolaması (Redis yok)', () => {
    const db = () => ({
        getQueueMetricsModel: () => new FakeModel(), getDeadLetterQueueModel: () => new FakeModel(), getExportSignalModel: () => new FakeModel(), getImportJobModel: () => new FakeModel(),
        getJobStateModel: () => new FakeModel(), getJobRunModel: () => new FakeModel(), getMetricRollupModel: () => new FakeModel(), getErrorEventModel: () => new FakeModel(),
    });
    it('getQueues: Redis hazır değilken uç düşmez (available:false); retryJob 503 QUEUE_UNAVAILABLE', async () => {
        const Svc: any = (services as any).BackofficeEngineService;
        const svc = new Svc(undefined, { principal: { sub: 'a' }, queue: 'order-sync-queue', jobId: 'j1', reason: 'yeterince uzun gerekçe' });
        svc.applicationDB = db();
        expect((await svc.getQueues()).queues[0]).toMatchObject({ available: false, counts: null });
        await expect(svc.retryJob()).rejects.toMatchObject({ statusCode: 503, code: 'QUEUE_UNAVAILABLE' });
    });
    it('BackofficeOverviewService.getHealth: bölümleri toplar, yük sızdırmaz', async () => {
        const Svc: any = (services as any).BackofficeOverviewService;
        const svc = new Svc(undefined, {});
        svc.applicationDB = db();
        const out = await svc.getHealth();
        expect(Object.keys(out)).toEqual(expect.arrayContaining(['generatedAt', 'status', 'degradedSections', 'dependencies', 'pods', 'red', 'queues', 'intake', 'issues']));
        expect(out.queues.items[0].available).toBe(false);
    });
});

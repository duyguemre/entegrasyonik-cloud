// BE-03/BE-04 (K51): listFailedJobs süzgeçleri + reqId/traceId, retryJobs (toplu, idempotent, denetim, LIVE_READONLY, step-up) + BE-06 şema. Redis/Mongo/ağ YOK.
import { describe, it, expect, beforeEach } from '@jest/globals';
import { EngineOps } from '../../../../src/api/admin/engineOps';
import { AuditLogger } from '../../../../src/services/audit/AuditLogger';
import { BACKOFFICE_ENGINE_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice-engine';
import { BACKOFFICE_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { requiresStepUp } from '../../../../src/api/admin/stepUp';
import { isLiveReadonlyBlockedRpc } from '../../../../src/api/liveReadonlyRpcGuard';
import { FakeModel, FakeQueue, FakeJob } from '../../../helpers/fakeEngineDb';

const NOW = Date.parse('2026-10-01T12:00:00Z');
let audits: any[];
beforeEach(() => { audits = []; AuditLogger.setSink(async (r: any) => { audits.push(r); }); });
const settle = () => new Promise((r) => setTimeout(r, 5));
const actor = { sub: 'adm1', ip: '1.2.3.4' };

function build(queue: FakeQueue | null, dlq: any[] = []) {
    const m = { dlq: new FakeModel(dlq), other: new FakeModel() };
    const ops = new EngineOps({
        applicationDB: { getQueueMetricsModel: () => m.other, getDeadLetterQueueModel: () => m.dlq, getExportSignalModel: () => m.other, getImportJobModel: () => m.other, getJobStateModel: () => m.other, getJobRunModel: () => m.other },
        queues: () => queue as any, now: () => NOW,
    });
    return { ops, m };
}
const job = (id: string, clientId: number, integ: string, reason: string, extra: Record<string, unknown> = {}) => new FakeJob(id, 'fetch-orders-' + integ, { clientId, integrationCode: integ, secret: 'GIZLI', ...extra }, 'failed', reason);

describe('BE-03 listFailedJobs süzgeçleri', () => {
    const jobs = [job('a', 7, 'trendyol', '[UNAVAILABLE] x'), job('b', 7, 'hepsiburada', '[AUTH] y'), job('c', 8, 'trendyol', '[UNAVAILABLE] z'), job('d', 8, 'trendyol', 'düz metin')];
    it('tid / integrationCode / errorCode birlikte AND; total kesin; filter yansır; yük sızmaz', async () => {
        const { ops } = build(new FakeQueue(jobs));
        const r = await ops.listFailedJobs({ queue: 'order-sync-queue', tid: 8, integrationCode: 'trendyol', errorCode: 'UNAVAILABLE' });
        expect(r.items.map((i: any) => i.id)).toEqual(['c']);
        expect(r.total).toBe(1);
        expect(r.filter).toEqual({ tid: 8, integrationCode: 'trendyol', errorCode: 'UNAVAILABLE' });
        expect(JSON.stringify(r)).not.toContain('GIZLI');
        expect((await ops.listFailedJobs({ queue: 'order-sync-queue', errorCode: 'UNKNOWN' })).items.map((i: any) => i.id)).toEqual(['d']);
        expect((await ops.listFailedJobs({ queue: 'order-sync-queue', tid: 7 })).total).toBe(2);
    });
    it('süzgeçli sonuç ofset imleciyle sayfalanır; süzgeçsiz çağrı eski davranış (total yok, filter hepsi null)', async () => {
        const { ops } = build(new FakeQueue(jobs));
        const p1 = await ops.listFailedJobs({ queue: 'order-sync-queue', integrationCode: 'trendyol', limit: 2 });
        expect(p1.items).toHaveLength(2);
        expect(p1.nextCursor).not.toBeNull();
        const p2 = await ops.listFailedJobs({ queue: 'order-sync-queue', integrationCode: 'trendyol', limit: 2, cursor: p1.nextCursor });
        expect(p2.items).toHaveLength(1);
        expect(p2.nextCursor).toBeNull();
        const plain = await ops.listFailedJobs({ queue: 'order-sync-queue' });
        expect(plain.total).toBeUndefined();
        expect(plain.filter).toEqual({ tid: null, integrationCode: null, errorCode: null });
    });
    it('dlq kaynağında süzgeç Mongo sorgusuna iner (clientId, integrationCode, [KOD] öneki); UNKNOWN = öneksiz', async () => {
        const { ops, m } = build(new FakeQueue(), []);
        await ops.listFailedJobs({ queue: 'order-sync-queue', source: 'dlq', tid: 7, integrationCode: 'n11', errorCode: 'AUTH' });
        const q = m.dlq.calls[0].arg;
        expect(q).toMatchObject({ queueName: 'order-sync-queue', clientId: 7, integrationCode: 'n11' });
        expect(q.failedReason.$regex).toBe('^\\[AUTH\\]');
        await ops.listFailedJobs({ queue: 'order-sync-queue', source: 'dlq', errorCode: 'UNKNOWN' });
        expect(m.dlq.calls[1].arg.failedReason.$not).toBeInstanceOf(RegExp);
    });
});

describe('BE-04 işten loga iz', () => {
    it('reqId = correlationId (desen dışı/yoksa null), traceId yoksa null; iş yükünün başka alanı dönmez', async () => {
        const { ops } = build(new FakeQueue([job('a', 7, 'trendyol', '[X] a', { correlationId: 'ord_ab12' }), job('b', 7, 'trendyol', '[X] b', { correlationId: 'kötü id <script>' }), job('c', 7, 'trendyol', '[X] c', { correlationId: 'wh_1', traceId: 'tr-9' })]));
        const r = await ops.listFailedJobs({ queue: 'order-sync-queue' });
        expect(r.items.map((i: any) => [i.reqId, i.traceId])).toEqual([['ord_ab12', null], [null, null], ['wh_1', 'tr-9']]);
        expect(JSON.stringify(r)).not.toContain('GIZLI');
    });
    it('dlq öğesinde de jobData.correlationId', async () => {
        const { ops } = build(new FakeQueue(), [{ queueName: 'order-sync-queue', clientId: 7, integrationCode: 'n11', failedReason: '[AUTH] q', dlqType: 'FATAL_ERROR', status: 'PENDING_MANUAL_REVIEW', failedAt: new Date(NOW), originalJobId: 'o1', jobData: { correlationId: 'ord_zz', secret: 'GIZLI' } }]);
        const r = await ops.listFailedJobs({ queue: 'order-sync-queue', source: 'dlq' });
        expect(r.items[0]).toMatchObject({ reqId: 'ord_zz', traceId: null, errorCode: 'AUTH' });
        expect(JSON.stringify(r)).not.toContain('GIZLI');
    });
});

describe('BE-03 retryJobs', () => {
    it('iş başına sonuç: başarısız olmayan/yok iş ok:false (çağrı düşmez); aynı çağrı tekrarı güvenli (idempotent); tekil kimlikler', async () => {
        const j1 = job('j1', 9, 'trendyol', '[X] a');
        const active = new FakeJob('j2', 'x', { clientId: 9 }, 'active');
        const { ops } = build(new FakeQueue([j1, active]));
        const input = { queue: 'order-sync-queue' as const, jobIds: ['j1', 'j1', 'j2', 'yok'], reason: 'pazaryeri düzeldi' };
        const r1 = await ops.retryJobs(actor, input);
        expect(r1).toEqual({ queue: 'order-sync-queue', requested: 3, succeeded: 1, failed: 2, results: [{ jobId: 'j1', ok: true }, { jobId: 'j2', ok: false, error: 'JOB_NOT_FAILED' }, { jobId: 'yok', ok: false, error: 'JOB_NOT_FOUND' }] });
        expect(j1.retried).toBe(true);
        // tekrar: j1 artık failed değil -> ok:false JOB_NOT_FAILED, yan etki yok
        const r2 = await ops.retryJobs(actor, input);
        expect(r2.succeeded).toBe(0);
        expect(r2.results[0]).toEqual({ jobId: 'j1', ok: false, error: 'JOB_NOT_FAILED' });
    });
    it('denetim: özet kayıt + başarılı iş başına alt kayıt (batch:true), gerekçe ve tenant', async () => {
        const { ops } = build(new FakeQueue([job('j1', 9, 'trendyol', '[X] a'), job('j2', 10, 'n11', '[X] b')]));
        await ops.retryJobs(actor, { queue: 'order-sync-queue', jobIds: ['j1', 'j2', 'zz'], reason: 'toplu deneme gerekçesi' });
        await settle();
        const sub = audits.filter((a) => a.event === 'backoffice.engine.retry_job');
        expect(sub.map((a) => a.meta.jobId).sort()).toEqual(['j1', 'j2']);
        expect(sub[0]).toMatchObject({ result: 'ok', sub: 'adm1', surface: 'backoffice', meta: { queue: 'order-sync-queue', batch: true, reason: 'toplu deneme gerekçesi' } });
        const summary = audits.find((a) => a.event === 'backoffice.engine.retry_jobs');
        expect(summary).toMatchObject({ result: 'fail', meta: { requested: 3, succeeded: 2, failed: 1, reason: 'toplu deneme gerekçesi' } });
    });
    it('kuyruk yok -> 503 QUEUE_UNAVAILABLE (tüm çağrı); iş başına beklenmeyen hata RETRY_FAILED ve diğerleri etkilenmez', async () => {
        await expect(build(null).ops.retryJobs(actor, { queue: 'order-sync-queue', jobIds: ['a'], reason: 'xxxxxxxxxx' })).rejects.toMatchObject({ statusCode: 503, code: 'QUEUE_UNAVAILABLE' });
        const bad = job('bad', 1, 'n11', '[X] a'); bad.retry = async () => { throw new Error('redis koptu'); };
        const ok = job('ok', 1, 'n11', '[X] b');
        const r = await build(new FakeQueue([bad, ok])).ops.retryJobs(actor, { queue: 'order-sync-queue', jobIds: ['bad', 'ok'], reason: 'xxxxxxxxxx' });
        expect(r.results).toEqual([{ jobId: 'bad', ok: false, error: 'RETRY_FAILED' }, { jobId: 'ok', ok: true }]);
    });
});

describe('BE-03/BE-06 şema + politika', () => {
    const S = BACKOFFICE_ENGINE_RPC_INPUT as any;
    it('retryJobs: 1..50 tekil biçimli kimlik, gerekçe zorunlu, bilinmeyen alan reddedilir', () => {
        const ok = { queue: 'order-sync-queue', jobIds: ['a'], reason: 'yeterince uzun' };
        expect(S['BackofficeEngineService/retryJobs'].safeParse(ok).success).toBe(true);
        expect(S['BackofficeEngineService/retryJobs'].safeParse({ ...ok, jobIds: Array.from({ length: 51 }, (_, i) => 'j' + i) }).success).toBe(false);
        expect(S['BackofficeEngineService/retryJobs'].safeParse({ ...ok, jobIds: [] }).success).toBe(false);
        expect(S['BackofficeEngineService/retryJobs'].safeParse({ ...ok, jobIds: [{ $ne: 1 }] }).success).toBe(false);
        expect(S['BackofficeEngineService/retryJobs'].safeParse({ queue: 'order-sync-queue', jobIds: ['a'] }).success).toBe(false);
        expect(S['BackofficeEngineService/retryJobs'].safeParse({ ...ok, evil: 1 }).success).toBe(false);
    });
    it('listFailedJobs süzgeç şeması: tid pozitif tamsayı, errorCode büyük harf kodu (regex enjeksiyonu yok)', () => {
        const q = 'order-sync-queue';
        expect(S['BackofficeEngineService/listFailedJobs'].safeParse({ queue: q, tid: 7, integrationCode: 'trendyol', errorCode: 'UNAVAILABLE' }).success).toBe(true);
        expect(S['BackofficeEngineService/listFailedJobs'].safeParse({ queue: q, errorCode: '.*' }).success).toBe(false);
        expect(S['BackofficeEngineService/listFailedJobs'].safeParse({ queue: q, tid: -1 }).success).toBe(false);
        expect(S['BackofficeEngineService/listFailedJobs'].safeParse({ queue: q, tid: { $gt: 0 } }).success).toBe(false);
    });
    it('retryJobs: step-up + external write (LIVE_READONLY 423)', () => {
        expect(requiresStepUp('BackofficeEngineService/retryJobs')).toBe(true);
        expect(CAPABILITY_BY_RPC.get('BackofficeEngineService/retryJobs')).toMatchObject({ effect: 'write', external: true, minTier: 'platformAdmin' });
        expect(isLiveReadonlyBlockedRpc('BackofficeEngineService', 'retryJobs')).toBe(true);
    });
    it('BE-06: issueGroups tid şeması', () => {
        const S2 = BACKOFFICE_RPC_INPUT as any;
        expect(S2['BackofficeLogService/issueGroups'].safeParse({ tid: 7 }).success).toBe(true);
        expect(S2['BackofficeLogService/issueGroups'].safeParse({ tid: 0 }).success).toBe(false);
        expect(S2['BackofficeLogService/issueGroups'].safeParse({ tid: '7' }).success).toBe(false);
    });
});

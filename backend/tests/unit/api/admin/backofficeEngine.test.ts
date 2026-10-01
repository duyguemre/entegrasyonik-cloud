// B7a-d: EngineOps (kuyruk sayaçları/seri, başarısız işler, retry/discard, durum makinesi + takılı kira, iş koşuları). Redis/Mongo/ağ YOK (sahte kuyruk + bellek-içi model).
import { describe, it, expect, beforeEach } from '@jest/globals';
import { EngineOps, errorCodeOf, encodeOffsetCursor } from '../../../../src/api/admin/engineOps';
import { AuditLogger } from '../../../../src/services/audit/AuditLogger';
import { FakeModel, FakeQueue, FakeJob } from '../../../helpers/fakeEngineDb';

const NOW = Date.parse('2026-09-30T12:30:00Z');
const min = (n: number) => new Date(NOW - n * 60_000);
const oid = (n: number) => n.toString(16).padStart(24, '0');

let audits: any[];
beforeEach(() => { audits = []; AuditLogger.setSink(async (r: any) => { audits.push(r); }); });
const settle = () => new Promise((r) => setTimeout(r, 5));

function build(opts: { queue?: FakeQueue | null; dlq?: any[]; exp?: any[]; imp?: any[]; runs?: any[]; states?: any[]; series?: any[] } = {}) {
    const m = {
        qm: new FakeModel(), dlq: new FakeModel(opts.dlq ?? []), exp: new FakeModel(opts.exp ?? []), imp: new FakeModel(opts.imp ?? []),
        states: new FakeModel(opts.states ?? []), runs: new FakeModel(opts.runs ?? []),
    };
    m.qm.aggregateResult = opts.series ?? [];
    const queue = opts.queue === undefined ? new FakeQueue() : opts.queue;
    const ops = new EngineOps({
        applicationDB: { getQueueMetricsModel: () => m.qm, getDeadLetterQueueModel: () => m.dlq, getExportSignalModel: () => m.exp, getImportJobModel: () => m.imp, getJobStateModel: () => m.states, getJobRunModel: () => m.runs },
        queues: () => queue as any, now: () => NOW, exportLockTimeoutMs: 30 * 60_000, importLockTimeoutMs: 30 * 60_000,
    });
    return { ops, m, queue };
}

describe('getQueues (B7a)', () => {
    it('BullMQ sayaçları + DLQ bekleyen + 25 noktalı saatlik seri (boş saatler 0)', async () => {
        const hour = Math.floor(NOW / 3_600_000) * 3_600_000;
        const { ops } = build({
            queue: new FakeQueue([], { wait: 3, active: 1, failed: 2, completed: 40 }),
            dlq: [{ queueName: 'order-sync-queue', status: 'PENDING_MANUAL_REVIEW' }, { queueName: 'order-sync-queue', status: 'RESOLVED' }],
            series: [{ _id: { queue: 'order-sync-queue', t: hour }, count: 10, failed: 2, retried: 1, waitMsP95: 300, procMsP95: 900 }],
        });
        const out = await ops.getQueues();
        const q = out.queues[0];
        expect(q).toMatchObject({ name: 'order-sync-queue', available: true, counts: { wait: 3, active: 1, delayed: 0, failed: 2, completed: 40, paused: 0 }, dlq: { pendingReview: 1 } });
        expect(q.metrics.series).toHaveLength(25);
        expect(q.metrics.series[24]).toMatchObject({ count: 10, failed: 2, retried: 1, waitMsP95Max: 300, procMsP95Max: 900 });
        expect(q.metrics.series[0]).toMatchObject({ count: 0, waitMsP95Max: null });
    });
    it('Redis yok: available:false, counts null, uç DÜŞMEZ; ölçüm sorgusu hata verirse seri boş', async () => {
        const { ops, m } = build({ queue: null });
        m.qm.failWith = new Error('boom');
        const out = await ops.getQueues();
        expect(out.queues[0]).toMatchObject({ available: false, counts: null });
        expect(out.queues[0].metrics.series.every((p: any) => p.count === 0)).toBe(true);
    });
});

describe('listFailedJobs (B7b)', () => {
    const jobs = Array.from({ length: 5 }, (_, i) => new FakeJob(`j${i}`, 'fetch-orders-trendyol', { clientId: 7 + i, integrationCode: 'trendyol', secretPayload: 'ÇOK-GİZLİ' }, 'failed', i === 0 ? 'plain text boom' : '[AUTH] token abc123 geçersiz'));
    it('yük ve hata MESAJI dönmez; kod/tenant/operasyon/deneme döner; ofset imleci ile sayfalar', async () => {
        const { ops } = build({ queue: new FakeQueue(jobs) });
        const p1 = await ops.listFailedJobs({ queue: 'order-sync-queue', limit: 2 });
        expect(p1.items).toHaveLength(2);
        expect(p1.items[0]).toMatchObject({ id: 'j0', operation: 'fetch-orders-trendyol', tenantId: 7, integrationCode: 'trendyol', errorCode: 'UNKNOWN', attemptsMade: 5, maxAttempts: 5 });
        expect(p1.items[1].errorCode).toBe('AUTH');
        expect(JSON.stringify(p1)).not.toMatch(/GİZLİ|abc123|token/);
        expect(p1.nextCursor).toBe(encodeOffsetCursor(2));
        const p3 = await ops.listFailedJobs({ queue: 'order-sync-queue', limit: 2, cursor: encodeOffsetCursor(4) });
        expect(p3.items).toHaveLength(1);
        expect(p3.nextCursor).toBeNull();
    });
    it('limit 200 ile sınırlanır; bozuk imleç 400 VALIDATION; Redis yok 503', async () => {
        const { ops } = build({ queue: new FakeQueue(jobs) });
        await expect(ops.listFailedJobs({ queue: 'order-sync-queue', cursor: '###' })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        await expect(build({ queue: null }).ops.listFailedJobs({ queue: 'order-sync-queue' })).rejects.toMatchObject({ statusCode: 503, code: 'QUEUE_UNAVAILABLE' });
    });
    it('source:dlq -> Mongo DLQ kayıtları (jobData/failedReason dönmez), keyset imleç', async () => {
        const dlq = [1, 2, 3].map((i) => ({ _id: oid(i), queueName: 'order-sync-queue', originalJobId: `o${i}`, clientId: i, integrationCode: 'n11', failedReason: '[VALIDATION] gizli', jobData: { secret: 'X' }, dlqType: 'FATAL_ERROR', status: 'PENDING_MANUAL_REVIEW', failedAt: min(i) }));
        const { ops } = build({ dlq });
        const p1 = await ops.listFailedJobs({ queue: 'order-sync-queue', source: 'dlq', limit: 2 });
        expect(p1.items.map((x: any) => x.originalJobId)).toEqual(['o1', 'o2']);
        expect(p1.items[0]).toMatchObject({ errorCode: 'VALIDATION', tenantId: 1, status: 'PENDING_MANUAL_REVIEW' });
        expect(JSON.stringify(p1)).not.toMatch(/gizli|secret/);
        const p2 = await ops.listFailedJobs({ queue: 'order-sync-queue', source: 'dlq', limit: 2, cursor: p1.nextCursor });
        expect(p2.items.map((x: any) => x.originalJobId)).toEqual(['o3']);
        expect(p2.nextCursor).toBeNull();
    });
    it('errorCodeOf yalnız [KOD] önekini okur', () => {
        expect(errorCodeOf('[RATE_LIMITED] 429')).toBe('RATE_LIMITED');
        expect(errorCodeOf('hata [AUTH]')).toBe('UNKNOWN');
        expect(errorCodeOf(undefined)).toBe('UNKNOWN');
    });
});

describe('retryJob / discardJob (B7b)', () => {
    const actor = { sub: 'adm1', ip: '1.2.3.4' };
    it('retry: yalnız failed iş; audit gerekçeyle yazılır', async () => {
        const job = new FakeJob('j1', 'x', { clientId: 9 }, 'failed');
        const { ops } = build({ queue: new FakeQueue([job, new FakeJob('j2', 'x', {}, 'active'), new FakeJob('j3', 'x', {}, 'completed')]) });
        expect(await ops.retryJob(actor, { queue: 'order-sync-queue', jobId: 'j1', reason: 'pazaryeri düzeldi' })).toEqual({ queue: 'order-sync-queue', jobId: 'j1', retried: true });
        expect(job.retried).toBe(true);
        await settle();
        expect(audits[0]).toMatchObject({ event: 'backoffice.engine.retry_job', result: 'ok', sub: 'adm1', surface: 'backoffice', meta: { queue: 'order-sync-queue', jobId: 'j1', tenantId: 9, reason: 'pazaryeri düzeldi' } });
        await expect(ops.retryJob(actor, { queue: 'order-sync-queue', jobId: 'j2', reason: 'xxxxxxxxxx' })).rejects.toMatchObject({ statusCode: 409, code: 'JOB_NOT_FAILED' });
        await expect(ops.retryJob(actor, { queue: 'order-sync-queue', jobId: 'yok', reason: 'xxxxxxxxxx' })).rejects.toMatchObject({ statusCode: 404, code: 'JOB_NOT_FOUND' });
    });
    it('discard: failed iş silinir; aktif iş 409 ve silinmez; bilinmeyen kuyruk 400', async () => {
        const failed = new FakeJob('j1', 'x', { clientId: 9 }, 'failed');
        const active = new FakeJob('j2', 'x', {}, 'active');
        const { ops } = build({ queue: new FakeQueue([failed, active]) });
        await ops.discardJob(actor, { queue: 'order-sync-queue', jobId: 'j1', reason: 'kalıcı hata, veri yok' });
        expect(failed.removed).toBe(true);
        await expect(ops.discardJob(actor, { queue: 'order-sync-queue', jobId: 'j2', reason: 'xxxxxxxxxx' })).rejects.toMatchObject({ code: 'JOB_NOT_FAILED' });
        expect(active.removed).toBe(false);
        await expect(ops.discardJob(actor, { queue: 'baska' as any, jobId: 'j1', reason: 'xxxxxxxxxx' })).rejects.toMatchObject({ statusCode: 400 });
        await settle();
        expect(audits.find((a) => a.event === 'backoffice.engine.discard_job')).toMatchObject({ meta: { jobId: 'j1' } });
    });
});

describe('getStateMachineJobs + releaseStuckLease (B7c)', () => {
    const exp = [
        { _id: oid(1), clientId: 1, integrationCode: 'trendyol', status: 'PENDING', lockedBy: 'pod-a', updatedAt: min(45), lockExpiry: null },   // takılı (updatedAt eski)
        { _id: oid(2), clientId: 2, integrationCode: 'n11', status: 'SENT', lockedBy: 'pod-b', updatedAt: min(1), lockExpiry: null },            // sağlıklı
        { _id: oid(3), clientId: 3, integrationCode: 'n11', status: 'QUEUED', lockedBy: 'pod-c', updatedAt: min(1), lockExpiry: min(2) },        // kira süresi dolmuş
        { _id: oid(4), clientId: 4, integrationCode: 'n11', status: 'COMPLETED', lockedBy: null, updatedAt: min(500), lockExpiry: null },       // kilitsiz
    ];
    const imp = [
        { _id: oid(10), clientId: 5, integrationCode: 'hb', status: 'PROCESSING', lockedBy: 'pod-a', lastCheckedAt: min(60) },                   // takılı
        { _id: oid(11), clientId: 6, integrationCode: 'hb', status: 'FETCHING', lockedBy: 'pod-b', lastCheckedAt: min(3) },                      // sağlıklı
    ];
    it('dağılım + takılı kiralar (yalnız süresi dolmuş) + tenant iş verisi/hata metni yok', async () => {
        const { ops, m } = build({ exp, imp });
        m.exp.aggregateResult = [{ _id: 'PENDING', count: 1 }, { _id: 'SENT', count: 1 }];
        m.imp.aggregateResult = [{ _id: 'PROCESSING', count: 1 }];
        const out = await ops.getStateMachineJobs();
        expect(out.exportSignals).toEqual({ byStatus: { PENDING: 1, SENT: 1 }, locked: 3 });
        expect(out.importJobs.locked).toBe(2);
        expect(out.stuckLeases.map((s: any) => `${s.kind}:${s.id.slice(-2)}`).sort()).toEqual(['export:01', 'export:03', 'import:0a']);
        expect(out.stuckLeaseCount).toBe(3);
        expect(out.stuckLeases.find((s: any) => s.id === oid(1))).toMatchObject({ tenantId: 1, lockedBy: 'pod-a', staleForMs: 45 * 60_000 });
        expect(out.leaseTimeoutMs).toEqual({ export: 1_800_000, import: 1_800_000 });
    });
    it('release: takılı kira bırakılır; import PROCESSING -> FAILED (clearZombies ile aynı); audit yazılır', async () => {
        const { ops, m } = build({ exp, imp });
        const a = await ops.releaseStuckLease({ sub: 'adm' }, { kind: 'export', id: oid(1), reason: 'pod öldü, kira takıldı' });
        expect(a).toMatchObject({ released: true, previousOwner: 'pod-a' });
        expect(m.exp.docs[0].lockedBy).toBeNull();
        await ops.releaseStuckLease({ sub: 'adm' }, { kind: 'import', id: oid(10), reason: 'pod öldü, kira takıldı' });
        expect(m.imp.docs[0]).toMatchObject({ lockedBy: null, status: 'FAILED' });
        await settle();
        expect(audits.filter((x) => x.event === 'backoffice.engine.release_lease' && x.result === 'ok')).toHaveLength(2);
    });
    it('release: sağlıklı kira 409 LEASE_NOT_STUCK ve DOKUNULMAZ; olmayan kayıt 404', async () => {
        const { ops, m } = build({ exp, imp });
        await expect(ops.releaseStuckLease({ sub: 'adm' }, { kind: 'export', id: oid(2), reason: 'xxxxxxxxxx' })).rejects.toMatchObject({ statusCode: 409, code: 'LEASE_NOT_STUCK' });
        expect(m.exp.docs[1].lockedBy).toBe('pod-b');
        await expect(ops.releaseStuckLease({ sub: 'adm' }, { kind: 'import', id: oid(99), reason: 'xxxxxxxxxx' })).rejects.toMatchObject({ statusCode: 404 });
        await settle();
        expect(audits.find((x) => x.result === 'fail')).toMatchObject({ event: 'backoffice.engine.release_lease', meta: { why: 'not_stuck' } });
    });
});

describe('listJobRuns (B7d)', () => {
    const runs = [1, 2, 3].map((i) => ({ _id: oid(i), name: i === 3 ? 'other-job' : 'stock-sync', runType: 'scheduler', trigger: 'interval', startedAt: min(i * 10 + 1), finishedAt: min(i * 10), durationMs: 1000, status: i === 2 ? 'failed' : 'ok', counts: { processed: 5, nested: { x: 1 }, bad: 'x' }, outputSummary: { secret: 'S' }, error: i === 2 ? { code: 'E1', message: 'kısa' } : null, corrId: `c${i}`, pod: 'pod-a', scope: { level: 'platform' } }));
    const states = [{ name: 'stock-sync', lastStatus: 'ok', lastFinishedAt: min(10), expectedIntervalMs: 60_000, consecutiveFailures: 0 }, { name: 'other-job', lastStatus: 'ok', lastFinishedAt: min(1), expectedIntervalMs: 3_600_000 }];
    it('ilk sayfa JobState özeti (overdue) + koşular; outputSummary/ham counts yok; filtre + keyset imleç', async () => {
        const { ops } = build({ runs, states });
        const p1 = await ops.listJobRuns({ limit: 2 });
        expect(p1.items.map((x: any) => x.id)).toEqual([oid(1), oid(2)]);
        expect(p1.items[0].counts).toEqual({ processed: 5 });
        expect(JSON.stringify(p1)).not.toContain('secret');
        expect(p1.states.find((s: any) => s.job === 'stock-sync').overdue).toBe(true); // 10 dk > 3 x 1 dk
        expect(p1.states.find((s: any) => s.job === 'other-job').overdue).toBe(false);
        expect(p1.retentionDays).toBe(14);
        const p2 = await ops.listJobRuns({ limit: 2, cursor: p1.nextCursor });
        expect(p2.items.map((x: any) => x.id)).toEqual([oid(3)]);
        expect(p2.states).toBeUndefined();
        expect(p2.nextCursor).toBeNull();
        expect((await ops.listJobRuns({ job: 'stock-sync' })).items).toHaveLength(2);
        expect((await ops.listJobRuns({ status: 'failed' })).items.map((x: any) => x.error.code)).toEqual(['E1']);
    });
    it('boş durum: items [] ve nextCursor null', async () => {
        const out = await build().ops.listJobRuns({});
        expect(out).toMatchObject({ items: [], nextCursor: null, states: [] });
    });
});

// B1: OverviewOps.getHealth -- bölüm bölüm degraded (2 sn zaman aşımı), RED özeti, pod birleşimi, kuyruk/intake/sorun. DB/Redis YOK (bellek-içi sahteler).
import { describe, it, expect } from '@jest/globals';
import { OverviewOps, histogramPercentile } from '../../../../src/api/admin/overviewOps';
import { FakeModel, FakeQueue } from '../../../helpers/fakeEngineDb';

const NOW = Date.parse('2026-09-30T12:30:00Z');
const min = (n: number) => new Date(NOW - n * 60_000);

function build(over: Record<string, any> = {}) {
    const m = { exp: new FakeModel(), imp: new FakeModel(), states: new FakeModel(), roll: new FakeModel(), err: new FakeModel(), dlq: new FakeModel(), ...over.models };
    const ops = new OverviewOps({
        applicationDB: { getExportSignalModel: () => m.exp, getImportJobModel: () => m.imp, getJobStateModel: () => m.states, getMetricRollupModel: () => m.roll, getErrorEventModel: () => m.err, getDeadLetterQueueModel: () => m.dlq },
        readiness: over.readiness ?? (async () => ({ ready: true, mongo: 'ok', redis: 'ok' })),
        role: 'all', queues: over.queues ?? (() => new FakeQueue([], { wait: 4, delayed: 1, active: 2, failed: 3 }) as any),
        intake: over.intake ?? (() => []), podName: 'pod-self', now: () => NOW, sectionTimeoutMs: over.timeout ?? 50,
    });
    return { ops, m };
}

describe('getHealth (B1)', () => {
    it('sağlıklı durum: tüm bölümler ok, status ok', async () => {
        const { ops } = build();
        const out = await ops.getHealth();
        expect(out.status).toBe('ok');
        expect(out.degradedSections).toEqual([]);
        expect(out.dependencies).toMatchObject({ status: 'ok', ready: true, role: 'all', mongo: 'ok', redis: 'ok' });
        expect(out.queues.items[0]).toMatchObject({ name: 'order-sync-queue', available: true, backlog: 5, active: 2, failed: 3 });
        expect(out.intake).toMatchObject({ status: 'ok', allOpen: true, restricted: [] });
        expect(out.issues).toMatchObject({ status: 'ok', open: 0, newLast24h: 0 });
        expect(out.red).toMatchObject({ requests: 0, errorRate: null, durationP95Ms: null });
    });
    it('hazır değil (mongo fail) -> status degraded ama bölüm ok; Redis yok -> kuyruk available:false', async () => {
        const { ops } = build({ readiness: async () => ({ ready: false, mongo: 'fail', redis: 'ok' }), queues: () => null });
        const out = await ops.getHealth();
        expect(out.status).toBe('degraded');
        expect(out.dependencies).toMatchObject({ status: 'ok', ready: false, mongo: 'fail' });
        expect(out.queues.items[0]).toMatchObject({ available: false, backlog: null });
    });
    it('bir bölüm hata verirse yalnız o bölüm degraded; diğerleri yine dolu', async () => {
        const { ops, m } = build();
        m.err.failWith = new Error('mongo down');
        const out = await ops.getHealth();
        expect(out.issues).toEqual({ status: 'degraded', error: 'error' });
        expect(out.degradedSections).toEqual(['issues']);
        expect(out.status).toBe('degraded');
        expect(out.dependencies.status).toBe('ok');
    });
    it('zaman aşımı: takılı bir bölüm sınır sonunda degraded:timeout olur, uç beklemez', async () => {
        const { ops } = build({ readiness: () => new Promise(() => { /* asla bitmez */ }), timeout: 30 });
        const t0 = Date.now();
        const out = await ops.getHealth();
        expect(Date.now() - t0).toBeLessThan(1000);
        expect(out.dependencies).toEqual({ status: 'degraded', error: 'timeout' });
    });
    it('RED: son 1 sa 5dk kovaları toplanır (5xx oranı, p95 kova üst sınırı); histogram +Inf -> overflow', async () => {
        const { ops, m } = build();
        const bucketStart = new Date(Math.floor((NOW - 10 * 60_000) / 300_000) * 300_000);
        m.roll.docs = [
            { metric: 'http_requests', resolution: '5m', bucketStart, series: { a: { labels: { op: 'X/y', statusClass: '2xx' }, c: 90 }, b: { labels: { op: 'X/y', statusClass: '5xx' }, c: 10 } } },
            { metric: 'http_request_duration_ms', resolution: '5m', bucketStart, series: { a: { labels: { op: 'X/y', statusClass: '2xx' }, c: 100, sum: 10000, h: { 0: 50, 2: 45, 4: 5 } } } },
            { metric: 'http_requests', resolution: '5m', bucketStart: min(120), series: { z: { labels: { statusClass: '5xx' }, c: 999 } } }, // pencere dışı
        ];
        const out = await ops.getHealth();
        expect(out.red).toMatchObject({ requests: 100, errors5xx: 10, errorRate: 0.1, byStatusClass: { '2xx': 90, '5xx': 10 }, durationAvgMs: 100, durationP95Ms: 250, requestsPerMinute: 1.67 });
        expect(histogramPercentile([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000], 0.95)).toEqual({ valueMs: null, overflow: true });
    });
    it('podlar: kira sahipleri + zamanlayıcı heartbeat birleşir; self işaretli; 15 dk dışı pod gelmez', async () => {
        const { ops, m } = build();
        m.exp.aggregateResult = [{ _id: 'pod-a', leases: 2, lastActivityAt: min(1) }];
        m.imp.aggregateResult = [{ _id: 'pod-a', leases: 1, lastActivityAt: min(3) }, { _id: 'pod-self', leases: 1, lastActivityAt: min(2) }];
        m.states.docs = [
            { pod: 'pod-b', heartbeatAt: min(1), runningSince: min(2) }, { pod: 'pod-self', lastStartedAt: min(5), runningSince: null },
            { pod: 'pod-old', heartbeatAt: min(60), lastStartedAt: min(60) },
        ];
        const out = await ops.getHealth();
        const byPod = Object.fromEntries(out.pods.items.map((p: any) => [p.pod, p]));
        expect(Object.keys(byPod).sort()).toEqual(['pod-a', 'pod-b', 'pod-self']);
        expect(byPod['pod-a']).toMatchObject({ activeLeases: 3, runningJobs: 0, self: false });
        expect(byPod['pod-b']).toMatchObject({ runningJobs: 1 });
        expect(byPod['pod-self']).toMatchObject({ self: true, activeLeases: 1 });
        expect(out.pods.self).toBe('pod-self');
    });
    it('intake kısıtlı hedefler ve açık sorun sayıları yansır', async () => {
        const { ops, m } = build({ intake: () => [{ target: 'platform:trendyol', intake: 'drain' }] });
        m.err.docs = [{ status: 'open', firstSeen: min(30) }, { status: 'open', firstSeen: min(60 * 48) }, { status: 'resolved', firstSeen: min(1) }];
        const out = await ops.getHealth();
        expect(out.intake).toMatchObject({ allOpen: false, restricted: [{ target: 'platform:trendyol', intake: 'drain' }] });
        expect(out.issues).toMatchObject({ open: 2, newLast24h: 1 });
    });
});

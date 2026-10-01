// K51 (BO1): getAttention (kontrol kataloğu, eşikler, sıralama, grup/limit, degraded, gizlilik) + getPulse (hesaplanamadı) + yetenek/şema kaydı. Kaynaklar enjekte; DB/Redis YOK.
import { describe, it, expect } from '@jest/globals';
import { AttentionOps, type AttentionSources, T } from '../../../../src/api/admin/attentionOps';
import { PulseOps } from '../../../../src/api/admin/pulseOps';
import { BACKOFFICE_ATTENTION_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice-attention';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { getRequiredTier } from '../../../../src/api/rpc/operationPolicy';
import { requiresStepUp } from '../../../../src/api/admin/stepUp';
import { FakeModel } from '../../../helpers/fakeEngineDb';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3_600_000);
const ahead = (d: number) => new Date(NOW + d * 86_400_000);

const calm: AttentionSources = {
    queues: async () => [{ name: 'order-sync-queue', available: true, backlog: 0, failed: 0, dlqPending: 0 }],
    circuits: async () => [], apiHealth: async () => [], leases: async () => ({ count: 0, oldestAt: null }),
    infra: async () => ({ ready: true, mongo: 'ok', redis: 'ok', degradedSections: [], red: { requests: 1000, errors5xx: 1, errorRate: 0.001 } }),
    alerts: async () => [], slowQueries: async () => ({ last1h: 3, prev23hAvgPerHour: 2 }),
    orderSync: async () => [], trialEnding: async () => [], suspended: async () => [], pastDue: async () => [], deletionPending: async () => [], lifecycleFailed: async () => [], tickets: async () => [],
    tenantNames: async (tids) => new Map(tids.map((t) => [t, 'Mağaza ' + t])),
};
const run = (over: Partial<AttentionSources> = {}, limit?: number, ms?: number) => new AttentionOps({ sources: { ...calm, ...over }, now: () => NOW, sectionTimeoutMs: ms }).getAttention(limit);
const find = (r: any, id: string) => [...r.groups.system.items, ...r.groups.customers.items].find((i: any) => i.id === id);

describe('getAttention: sakin sistem', () => {
    it('hiçbir koşul yoksa status ok, boş gruplar, summary 0', async () => {
        const r = await run();
        expect(r).toMatchObject({ status: 'ok', summary: { critical: 0, warning: 0, info: 0 }, degradedSections: [], groups: { system: { total: 0, truncated: false, items: [] }, customers: { total: 0, truncated: false, items: [] } } });
        expect(r.generatedAt).toBe(new Date(NOW).toISOString());
    });
});

describe('getAttention: SİSTEM kontrolleri', () => {
    it('kuyruk birikimi/başarısız/DLQ eşikleri: warning ve critical; eylemler navigate + action', async () => {
        const r = await run({ queues: async () => [{ name: 'order-sync-queue', available: true, backlog: T.queueBacklogCrit, failed: 3, dlqPending: T.dlqCrit }] });
        expect(find(r, 'sys.queue.backlog:order-sync-queue')).toMatchObject({ severity: 'critical', count: 1000, countUnit: 'iş', group: 'system', actions: [{ kind: 'navigate', target: { route: '/motor', query: { tab: 'queues' } } }] });
        const failed = find(r, 'sys.queue.failed:order-sync-queue');
        expect(failed).toMatchObject({ severity: 'warning', count: 3 });
        expect(failed.actions.map((a: any) => a.kind)).toEqual(['navigate', 'action']);
        expect(failed.actions[1].capabilityId).toBe('platform.engine.retry_jobs');
        expect(find(r, 'sys.queue.dlq:order-sync-queue')).toMatchObject({ severity: 'critical', actions: [{ target: { route: '/motor', query: { tab: 'failed', source: 'dlq' } } }] });
        const warn = await run({ queues: async () => [{ name: 'order-sync-queue', available: true, backlog: T.queueBacklogWarn, failed: 0, dlqPending: 0 }] });
        expect(find(warn, 'sys.queue.backlog:order-sync-queue').severity).toBe('warning');
        expect(warn.status).toBe('attention');
    });
    it('Redis yok (available:false) -> critical "kuyruk okunamıyor"', async () => {
        const r = await run({ queues: async () => [{ name: 'order-sync-queue', available: false, backlog: null, failed: null, dlqPending: null }] });
        expect(find(r, 'sys.queue.unavailable')).toMatchObject({ severity: 'critical' });
    });
    it('devre kesici: open critical, yalnız half_open warning, kapalı atlanır', async () => {
        const r = await run({ circuits: async () => [
            { integrationCode: 'trendyol', open: 2, halfOpen: 0, lastOpenedAt: ago(1).toISOString() }, { integrationCode: 'n11', open: 0, halfOpen: 1, lastOpenedAt: null }, { integrationCode: 'pazarama', open: 0, halfOpen: 0, lastOpenedAt: null },
        ] });
        expect(find(r, 'sys.circuit.open:trendyol')).toMatchObject({ severity: 'critical', count: 2, since: ago(1).toISOString(), actions: [{ target: { route: '/entegrasyonlar', query: { tab: 'resilience', integrationCode: 'trendyol' } } }] });
        expect(find(r, 'sys.circuit.open:n11').severity).toBe('warning');
        expect(find(r, 'sys.circuit.open:pazarama')).toBeUndefined();
    });
    it('entegrasyon API hata oranı: min çağrı altı sessiz, %20 warning, %50 critical', async () => {
        const r = await run({ apiHealth: async () => [
            { integrationCode: 'trendyol', total: 100, errors: 25, errorRate: 0.25 }, { integrationCode: 'hepsiburada', total: 100, errors: 60, errorRate: 0.6 },
            { integrationCode: 'n11', total: 10, errors: 10, errorRate: 1 }, { integrationCode: 'pazarama', total: 100, errors: 5, errorRate: 0.05 },
        ] });
        expect(find(r, 'sys.api.errorrate:trendyol').severity).toBe('warning');
        expect(find(r, 'sys.api.errorrate:hepsiburada').severity).toBe('critical');
        expect(find(r, 'sys.api.errorrate:n11')).toBeUndefined();
        expect(find(r, 'sys.api.errorrate:pazarama')).toBeUndefined();
    });
    it('takılı kira, altyapı, 5xx, yavaş sorgu patlaması', async () => {
        const r = await run({
            leases: async () => ({ count: 12, oldestAt: ago(5).toISOString() }),
            infra: async () => ({ ready: false, mongo: 'ok', redis: 'down', degradedSections: ['pods'], red: { requests: 200, errors5xx: 60, errorRate: 0.3 } }),
            slowQueries: async () => ({ last1h: 600, prev23hAvgPerHour: 10 }),
        });
        expect(find(r, 'sys.lease.stuck')).toMatchObject({ severity: 'critical', count: 12, since: ago(5).toISOString() });
        expect(find(r, 'sys.infra.degraded')).toMatchObject({ severity: 'critical' });
        expect(find(r, 'sys.infra.degraded').why).toContain('Redis');
        expect(find(r, 'sys.http.5xx')).toMatchObject({ severity: 'critical', count: 60 });
        expect(find(r, 'sys.slowquery.burst')).toMatchObject({ severity: 'critical', count: 600 });
        // yalnız bölüm degraded -> warning; yavaş sorgu normal seyir -> yok
        const w = await run({ infra: async () => ({ ready: true, mongo: 'ok', redis: 'ok', degradedSections: ['pods'], red: null }), slowQueries: async () => ({ last1h: 80, prev23hAvgPerHour: 60 }) });
        expect(find(w, 'sys.infra.degraded').severity).toBe('warning');
        expect(find(w, 'sys.slowquery.burst')).toBeUndefined();
    });
    it('platform uyarıları: tid taşıyan, circuit:* ve R4 tekrarlanmaz; kural başına tek öğe; en yüksek seviye', async () => {
        const mk = (ruleId: string, scopeKey: string, level: 'warning' | 'critical', detail: any = {}) => ({ ruleId, scopeKey, level, detail, firstFiredAt: ago(2) });
        const r = await run({ alerts: async () => [mk('R7', 'notification-outbox', 'warning', { dead: 12 }), mk('R7', 'x', 'critical'), mk('R4', 'order-sync-queue', 'warning'), mk('R2', 'circuit:n11', 'warning', { integ: 'n11' }), mk('R1', 'trendyol:7', 'warning', { tid: 7, integ: 'trendyol' })] });
        const sys = r.groups.system.items.map((i: any) => i.id);
        expect(sys).toEqual(['sys.alert.firing:R7']);
        expect(find(r, 'sys.alert.firing:R7')).toMatchObject({ severity: 'critical', count: 2, countUnit: 'uyarı' });
        expect(find(r, 'sys.alert.firing:R7').actions.map((a: any) => a.capabilityId ?? a.target.route)).toEqual(['/bildirimler/uyarilar', 'platform.alerts.mute']);
    });
});

describe('getAttention: MÜŞTERİLER kontrolleri', () => {
    it('R1/R2 uyarıları entegrasyon bazında gruplanır; tenant adı toplu aranır; tek müşteride müşteri sayfasına gider', async () => {
        const mk = (ruleId: string, scopeKey: string, level: 'warning' | 'critical', tid: number, integ: string) => ({ ruleId, scopeKey, level, detail: { tid, integ }, firstFiredAt: ago(tid) });
        const r = await run({ alerts: async () => [mk('R1', 'trendyol:7', 'warning', 7, 'trendyol'), mk('R1', 'trendyol:8', 'critical', 8, 'trendyol'), mk('R2', 'auth:n11:9', 'critical', 9, 'n11')] });
        const err = find(r, 'cus.integration.error:trendyol');
        expect(err).toMatchObject({ group: 'customers', severity: 'critical', count: 2, countUnit: 'müşteri', since: ago(8).toISOString() });
        expect(err.subjects).toEqual([{ tid: 7, name: 'Mağaza 7' }, { tid: 8, name: 'Mağaza 8' }]);
        expect(err.actions[0]).toMatchObject({ kind: 'navigate', target: { route: '/musteriler', query: { hasIssues: '1' } } });
        const auth = find(r, 'cus.integration.auth:n11');
        expect(auth).toMatchObject({ severity: 'critical', count: 1 });
        expect(auth.actions[0].target.route).toBe('/musteriler/9');
    });
    it('senkron gecikmesi (≥6 sa warning, ≥24 sa critical), hiç eşiğe girmeyenler yok sayılır; subjects ≤5 en eski önce', async () => {
        const rows = Array.from({ length: 8 }, (_, i) => ({ tid: i + 1, name: 'M' + (i + 1), at: ago(7 + i) }));
        const r = await run({ orderSync: async () => [...rows, { tid: 99, name: 'Taze', at: ago(1) }] });
        const it_ = find(r, 'cus.sync.lag');
        expect(it_).toMatchObject({ severity: 'warning', count: 8 });
        expect(it_.subjects).toHaveLength(5);
        expect(it_.subjects[0].tid).toBe(8); // en eski
        expect(find(await run({ orderSync: async () => [{ tid: 1, name: 'A', at: ago(30) }] }), 'cus.sync.lag').severity).toBe('critical');
        expect(find(await run({ orderSync: async () => [{ tid: 99, name: 'Taze', at: ago(1) }] }), 'cus.sync.lag')).toBeUndefined();
    });
    it('abonelik: deneme bitiyor (≤3 gün warning, ≤1 gün critical), askıda, ödeme sorunu (grace ≤2 gün critical)', async () => {
        const r = await run({
            trialEnding: async () => [{ tid: 1, name: 'A', at: ahead(2) }, { tid: 2, name: 'B', at: ahead(10) }],
            suspended: async () => [{ tid: 3, name: 'C', at: ago(5) }],
            pastDue: async () => [{ tid: 4, name: 'D', at: ago(2), graceUntil: ahead(1) }, { tid: 5, name: 'E', at: ago(3), graceUntil: ahead(6) }],
        });
        expect(find(r, 'cus.trial.ending')).toMatchObject({ severity: 'warning', count: 1 });
        expect(find(r, 'cus.trial.ending').actions.map((a: any) => a.capabilityId ?? a.target.query.status)).toEqual(['trialing', 'platform.subscriptions.extend_trial']);
        expect(find(r, 'cus.sub.suspended')).toMatchObject({ severity: 'warning', count: 1 });
        expect(find(r, 'cus.payment.problem')).toMatchObject({ severity: 'critical', count: 2 });
        expect(find(await run({ trialEnding: async () => [{ tid: 1, name: 'A', at: ahead(0.5) }] }), 'cus.trial.ending').severity).toBe('critical');
        expect(find(await run({ pastDue: async () => [{ tid: 5, name: 'E', at: ago(3), graceUntil: ahead(6) }] }), 'cus.payment.problem').severity).toBe('warning');
    });
    it('silme talebi (info; ≤3 gün warning), yaşam döngüsü hatası critical, yaşlanan destek talebi (24/72 sa)', async () => {
        const r = await run({
            deletionPending: async () => [{ tid: 1, name: 'A', at: ahead(20) }],
            lifecycleFailed: async () => [{ tid: 2, name: 'B', at: ago(3), status: 'PURGE_FAILED' }],
            tickets: async () => [{ tid: 3, name: 'C', at: ago(30) }, { tid: 4, name: 'D', at: ago(10) }],
        });
        expect(find(r, 'cus.deletion.pending')).toMatchObject({ severity: 'info', count: 1 });
        expect(find(r, 'cus.lifecycle.failed')).toMatchObject({ severity: 'critical', count: 1 });
        expect(find(r, 'cus.ticket.aging')).toMatchObject({ severity: 'warning', count: 1 });
        expect(find(await run({ deletionPending: async () => [{ tid: 1, name: 'A', at: ahead(2) }] }), 'cus.deletion.pending').severity).toBe('warning');
        expect(find(await run({ tickets: async () => [{ tid: 3, name: 'C', at: ago(80) }] }), 'cus.ticket.aging').severity).toBe('critical');
    });
});

describe('getAttention: sıralama, limit, degraded, gizlilik', () => {
    it('öncelik: critical > warning > info; eşit ciddiyette etkilenen sayı büyük olan önce; id kararlı', async () => {
        const r = await run({
            queues: async () => [{ name: 'order-sync-queue', available: true, backlog: 300, failed: 30, dlqPending: 1 }],
            leases: async () => ({ count: 2, oldestAt: null }),
        });
        expect(r.groups.system.items.map((i: any) => [i.id, i.severity])).toEqual([
            ['sys.queue.failed:order-sync-queue', 'critical'], ['sys.queue.backlog:order-sync-queue', 'warning'], ['sys.lease.stuck', 'warning'], ['sys.queue.dlq:order-sync-queue', 'warning'],
        ]);
        const info = await run({ deletionPending: async () => [{ tid: 1, name: 'A', at: ahead(20) }], suspended: async () => [{ tid: 2, name: 'B', at: ago(1) }] });
        expect(info.groups.customers.items.map((i: any) => i.severity)).toEqual(['warning', 'info']);
    });
    it('limit grup başına; total kesmeden önceki sayı; truncated; summary kesmeden ÖNCE', async () => {
        const many = Array.from({ length: 8 }, (_, i) => ({ integrationCode: 'int' + i, open: 1, halfOpen: 0, lastOpenedAt: null }));
        const r = await run({ circuits: async () => many }, 3);
        expect(r.groups.system).toMatchObject({ total: 8, truncated: true });
        expect(r.groups.system.items).toHaveLength(3);
        expect(r.summary.critical).toBe(8);
        expect((await run({ circuits: async () => many })).groups.system.items).toHaveLength(8);
    });
    it('bir kontrol hata verir/zaman aşımına uğrar: degraded, diğerleri gelir; okunamayan "sorun yok" sayılmaz', async () => {
        const r = await run({
            circuits: async () => { throw new Error('redis kapalı: gizli-ayrıntı'); },
            apiHealth: () => new Promise(() => undefined),
            queues: async () => [{ name: 'order-sync-queue', available: true, backlog: 500, failed: 0, dlqPending: 0 }],
        }, undefined, 30);
        expect(r.status).toBe('degraded');
        expect(r.degradedSections).toEqual(expect.arrayContaining([{ section: 'circuits', error: 'error' }, { section: 'apiHealth', error: 'timeout' }]));
        expect(find(r, 'sys.queue.backlog:order-sync-queue')).toBeDefined();
        expect(JSON.stringify(r)).not.toContain('gizli-ayrıntı');
    });
    it('ad araması düşerse subject adı null kalır (uç düşmez); yanıtta yalnız tid+ad; sözleşme alanları tam', async () => {
        const r = await run({
            alerts: async () => [{ ruleId: 'R2', scopeKey: 'auth:n11:9', level: 'critical', detail: { tid: 9, integ: 'n11', apiKey: 'SIR' }, firstFiredAt: ago(1) }],
            tenantNames: async () => { throw new Error('x'); },
        });
        const it_ = find(r, 'cus.integration.auth:n11');
        expect(it_.subjects).toEqual([{ tid: 9, name: null }]);
        expect(Object.keys(it_).sort()).toEqual(['actions', 'count', 'countUnit', 'group', 'id', 'impact', 'severity', 'since', 'subjects', 'title', 'why']);
        expect(JSON.stringify(r)).not.toContain('SIR');
        for (const a of it_.actions) expect(a.kind === 'navigate' ? !!a.target?.route : !!a.capabilityId).toBe(true);
    });
});

describe('getPulse', () => {
    const rollup = (h: number, series: Record<string, any>) => ({ metric: 'http_requests', resolution: '1h', bucketStart: new Date(Math.floor((NOW - h * 3_600_000) / 3_600_000) * 3_600_000), series });
    function build(over: { rollups?: any[]; calls?: any[]; failClients?: boolean; revenue?: () => Promise<any> } = {}) {
        const clients = new FakeModel(); clients.aggregateResult = [{ _id: 'ACTIVE', n: 41 }, { _id: 'DELETION_PENDING', n: 2 }]; if (over.failClients) clients.failWith = new Error('x');
        const rollups = new FakeModel(over.rollups ?? []);
        const calls = new FakeModel(); calls.aggregateResult = over.calls ?? [{ _id: null, c7: 1000, c24: 200, e7: 50, e24: 10 }];
        return new PulseOps({ clientModel: clients, metricRollupModel: rollups, callMetricModel: calls, revenue: over.revenue ?? (async () => ({ mrr: { byCurrency: { TRY: 123400 }, billedSubscriptions: 30 }, statusDistribution: { trialing: 8 }, churn: { count: 2 } })), now: () => NOW });
    }
    it('tenant, çağrı hacmi (24 sa saatlik + 7 g), 5xx oranı, MRR; sipariş kovası yoksa -> hesaplanamadı', async () => {
        const r = await build({ rollups: [
            rollup(1, { a: { c: 900, labels: { statusClass: '2xx' } }, b: { c: 100, labels: { statusClass: '5xx' } } }), rollup(30, { a: { c: 500, labels: { statusClass: '2xx' } } }), rollup(100, { a: { c: 400, labels: { statusClass: '2xx' } } }),
        ] }).getPulse();
        expect(r.tenants).toEqual({ status: 'ok', active: 41, total: 43, byStatus: { ACTIVE: 41, DELETION_PENDING: 2 } });
        expect(r.orders).toMatchObject({ computable: false, last24h: null, last7d: null, previous24h: null, hourly: [], note: 'hesaplanamadı' });
        expect(r.calls.http).toMatchObject({ computable: true, last24h: 1000, last7d: 1900 });
        expect(r.calls.http.hourly).toEqual([{ t: new Date(Math.floor((NOW - 3_600_000) / 3_600_000) * 3_600_000).toISOString(), count: 1000 }]);
        expect(r.calls.integration).toEqual({ computable: true, last24h: 200, last7d: 1000 });
        expect(r.errorRate.http.hourly[0]).toMatchObject({ requests: 1000, errors5xx: 100, rate: 0.1 });
        expect(r.errorRate.integration).toEqual({ computable: true, last24h: 0.05, last7d: 0.05 });
        expect(r.mrr).toEqual({ status: 'ok', computable: true, unit: 'minor', currency: { TRY: 123400 }, activeSubscriptions: 30, trialing: 8, lostLast30d: 2 });
    });
    it('siparişler: orders_ingested_total kovalarından 24s/7g/önceki 24s + değişim yüzdesi', async () => {
        const o = (h: number, c: number) => ({ ...rollup(h, { a: { c, labels: { channel: 'trendyol' } } }), metric: 'orders_ingested_total' });
        const r = await build({ rollups: [o(1, 30), o(2, 10), o(30, 20), o(100, 5)] }).getPulse();
        expect(r.orders).toMatchObject({ status: 'ok', computable: true, last24h: 40, last7d: 65, previous24h: 20, changePct: 100 });
        expect(r.orders.hourly).toHaveLength(2);
        expect(r.orders.hourly[0].count).toBe(10);
    });
    it('siparişler: yalnız son 24 sa verisi varsa önceki dönem/değişim null (uydurma yok)', async () => {
        const o = { ...rollup(1, { a: { c: 7, labels: { channel: 'n11' } } }), metric: 'orders_ingested_total' };
        const r = await build({ rollups: [o] }).getPulse();
        expect(r.orders).toMatchObject({ computable: true, last24h: 7, last7d: 7, previous24h: null, changePct: null });
    });
    it('veri yok: uydurma 0 yok (computable:false, null); bir blok düşerse yalnız o blok degraded', async () => {
        const r = await build({ rollups: [], calls: [], failClients: true, revenue: async () => { throw new Error('x'); } }).getPulse();
        expect(r.calls.http).toMatchObject({ computable: false, last24h: null, hourly: [], note: 'hesaplanamadı' });
        expect(r.calls.integration).toMatchObject({ computable: false, last24h: null });
        expect(r.errorRate.http).toMatchObject({ computable: false, hourly: [] });
        expect(r.orders).toMatchObject({ computable: false, last24h: null, changePct: null });
        expect(r.tenants).toEqual({ status: 'degraded', error: 'error' });
        expect(r.mrr).toEqual({ status: 'degraded', error: 'error' });
    });
});

describe('kayıt', () => {
    it('getAttention/getPulse: platformAdmin, read, step-up yok, girdi sıkı (limit ≤ 50)', () => {
        for (const rpc of ['BackofficeOverviewService/getAttention', 'BackofficeOverviewService/getPulse']) {
            const [s, o] = rpc.split('/');
            expect(getRequiredTier(s, o)).toBe('platformAdmin');
            expect(CAPABILITY_BY_RPC.get(rpc)).toMatchObject({ effect: 'read', minTier: 'platformAdmin' });
            expect(requiresStepUp(rpc)).toBe(false);
        }
        const S = BACKOFFICE_ATTENTION_RPC_INPUT as any;
        expect(S['BackofficeOverviewService/getAttention'].safeParse({ limit: 50 }).success).toBe(true);
        for (const bad of [{ limit: 51 }, { limit: 0 }, { limit: '5' }, { x: 1 }]) expect(S['BackofficeOverviewService/getAttention'].safeParse(bad).success).toBe(false);
        expect(S['BackofficeOverviewService/getPulse'].safeParse({ a: 1 }).success).toBe(false);
    });
    it('eylem kimlikleri gerçek yetenek kayıtlarına bağlıdır (action.capabilityId var olan yetenek)', async () => {
        const r = await run({
            queues: async () => [{ name: 'order-sync-queue', available: true, backlog: 0, failed: 5, dlqPending: 0 }], leases: async () => ({ count: 1, oldestAt: null }),
            alerts: async () => [{ ruleId: 'R7', scopeKey: 'x', level: 'warning', detail: {}, firstFiredAt: null }], trialEnding: async () => [{ tid: 1, name: 'A', at: ahead(1) }],
        });
        const caps = new Set<string>();
        for (const g of [r.groups.system, r.groups.customers]) for (const i of g.items) for (const a of i.actions) if (a.kind === 'action') caps.add(a.capabilityId);
        expect(caps.size).toBeGreaterThanOrEqual(4);
        const { CAPABILITIES } = require('../../../../src/capabilities');
        const ids = new Set(CAPABILITIES.map((c: any) => c.id));
        for (const id of caps) expect([id, ids.has(id)]).toEqual([id, true]);
    });
});

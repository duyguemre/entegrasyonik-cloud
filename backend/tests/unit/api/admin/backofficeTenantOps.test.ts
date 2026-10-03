// BE-01/BE-02 (K51): listTenants (operasyon özeti, süzgeç, sıralama, imleç, degraded) + getHealthSummary. Bellek-içi sahte modeller; DB/Redis YOK.
import { describe, it, expect } from '@jest/globals';
import { listTenants, getHealthSummary, type TenantOpsDeps } from '../../../../src/operations/backoffice/tenantOps';
import { tenantBucketOf } from '../../../../src/platform/runtime/metrics/errorEvents';
import { BACKOFFICE_ATTENTION_RPC_INPUT } from '../../../../src/capabilities/rpc-input/backoffice-attention';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { getRequiredTier } from '../../../../src/api/operationPolicy';
import { requiresStepUp } from '../../../../src/api/admin/stepUp';
import { FakeModel } from '../../../helpers/fakeEngineDb';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3_600_000);

/** tid'ler kova çakışmasından uzak seçilir ki "yaklaşık" sayımda ek sürpriz olmasın. */
function distinctBucketTids(n: number): number[] {
    const out: number[] = []; const seen = new Set<number>();
    for (let t = 1; out.length < n; t++) { const b = tenantBucketOf(t); if (!seen.has(b)) { seen.add(b); out.push(t); } }
    return out;
}
const [T1, T2, T3] = distinctBucketTids(3);

function build(o: { bull?: Array<{ tid: number | null; finishedOn?: number }> | null; failAgg?: Array<'sub' | 'issues' | 'dlq' | 'metric'> } = {}) {
    const clients = new FakeModel([
        { clientId: T1, order: 1, title: 'Alfa Mağaza', status: 'ACTIVE' }, { clientId: T2, order: 2, title: 'Beta Ticaret', status: 'ACTIVE' },
        { clientId: T3, order: 3, title: 'Çelik Market', status: 'DELETION_PENDING' }, { clientId: 99, order: 4, title: 'Silinmiş', status: 'PURGED' },
    ]);
    const subs = new FakeModel([{ clientId: T1, planCode: 'growth', status: 'active' }, { clientId: T2, planCode: 'starter', status: 'trialing' }]);
    const issues = new FakeModel([
        { fp: 'a', status: 'open', tenantBuckets: [tenantBucketOf(T1), tenantBucketOf(T3)], lastSeen: ago(1), count: 3, module: 'adapter', code: 'UNAVAILABLE', integrationCode: 'trendyol' },
        { fp: 'b', status: 'open', tenantBuckets: [tenantBucketOf(T1)], lastSeen: ago(2), count: 1 },
        { fp: 'c', status: 'resolved', tenantBuckets: [tenantBucketOf(T2)], lastSeen: ago(2), count: 1 },
    ]);
    const dlq = new FakeModel([{ clientId: T2, status: 'PENDING_MANUAL_REVIEW' }, { clientId: T2, status: 'RESOLVED' }]);
    dlq.aggregateResult = [{ _id: T2, n: 2 }];
    const metrics = new FakeModel();
    metrics.aggregateResult = (p: any[]) => (p[1]?.$group?._id === '$clientId'
        ? [{ _id: String(T1), at: ago(2) }, { _id: String(T2), at: ago(50) }]
        : [{ _id: 'trendyol', lastOk: ago(1) }, { _id: 'hepsiburada', lastOk: null }]);
    const alerts = new FakeModel([
        { ruleId: 'R1', scopeKey: `trendyol:${T1}`, level: 'warning', status: 'firing', detail: { tid: T1, integ: 'trendyol' }, firstFiredAt: ago(3), lastSeenAt: ago(1) },
        { ruleId: 'R2', scopeKey: `auth:n11:${T2}`, level: 'critical', status: 'firing', detail: { tid: T2 }, firstFiredAt: ago(3), lastSeenAt: ago(1) },
        { ruleId: 'R1', scopeKey: `trendyol:${T1}`, level: 'warning', status: 'resolved', detail: { tid: T1 }, firstFiredAt: ago(30), lastSeenAt: ago(20) },
    ]);
    for (const k of o.failAgg ?? []) ({ sub: subs, issues, dlq, metric: metrics } as any)[k].failWith = new Error('boom');
    const deps: TenantOpsDeps = {
        clientModel: clients, subscriptionModel: subs, errorEventModel: issues, dlqModel: dlq, callMetricModel: metrics, alertModel: alerts,
        failedBullJobs: async () => (o.bull === undefined ? [{ tid: T1, finishedOn: NOW - 3_600_000 }, { tid: T1, finishedOn: NOW - 40 * 3_600_000 }, { tid: null, finishedOn: NOW }] : o.bull),
        now: () => NOW,
    };
    return { deps, clients };
}

describe('BE-01 listTenants', () => {
    it('satır başına ops: plan, abonelik, açık sorun (yaklaşık), 24 sa başarısız iş (DLQ + BullMQ), son hata; PURGED hariç', async () => {
        const { deps } = build();
        const r = await listTenants(deps, {});
        expect(r.items.map((i: any) => i.tid)).toEqual([T1, T2, T3]);
        const byTid = Object.fromEntries(r.items.map((i: any) => [i.tid, i]));
        expect(byTid[T1]).toMatchObject({ name: 'Alfa Mağaza', status: 'ACTIVE', ops: { planCode: 'growth', subscriptionStatus: 'active', openIssues: 2, openIssuesApprox: true, failedJobs24h: 1, lastErrorAt: ago(2).toISOString() } });
        expect(byTid[T2].ops).toMatchObject({ planCode: 'starter', subscriptionStatus: 'trialing', openIssues: 0, failedJobs24h: 2 });
        expect(byTid[T3].ops).toMatchObject({ planCode: null, subscriptionStatus: null, openIssues: 1, failedJobs24h: 0, lastErrorAt: null });
        expect(r).toMatchObject({ scanned: 3, scanTruncated: false, opsDegraded: [], nextCursor: null });
        expect(JSON.stringify(r)).not.toMatch(/email|password|dbConfig/i);
    });
    it('hasIssues: açık sorun / başarısız iş / son 24 sa hata; false = sorunsuzlar', async () => {
        const { deps } = build();
        expect((await listTenants(deps, { hasIssues: true })).items.map((i: any) => i.tid)).toEqual([T1, T2, T3]);
        // T2: 50 saat önceki hata 24 sa dışında ama failedJobs24h=2 -> yine sorunlu. Başarısız işi/DLQ'yu kaldır:
        const { deps: d2 } = build({ bull: [] });
        (d2.dlqModel as FakeModel).aggregateResult = [];
        const t2 = (await listTenants(d2, { hasIssues: true })).items.map((i: any) => i.tid);
        expect(t2).toEqual([T1, T3]);
        expect((await listTenants(d2, { hasIssues: false })).items.map((i: any) => i.tid)).toEqual([T2]);
    });
    it('abonelik durumu / başlık araması / durum süzgeci', async () => {
        const { deps } = build();
        expect((await listTenants(deps, { subscriptionStatus: ['trialing'] })).items.map((i: any) => i.tid)).toEqual([T2]);
        expect((await listTenants(deps, { q: 'çelik' })).items.map((i: any) => i.tid)).toEqual([T3]);
        expect((await listTenants(deps, { status: ['PURGED'] })).items.map((i: any) => i.tid)).toEqual([99]);
    });
    it('sıralama: openIssues azalan, lastErrorAt (boşlar sonda), name; imleçle sayfalama', async () => {
        const { deps } = build();
        expect((await listTenants(deps, { sortBy: 'openIssues' })).items.map((i: any) => i.tid)).toEqual([T1, T3, T2]);
        expect((await listTenants(deps, { sortBy: 'lastErrorAt' })).items.map((i: any) => i.tid)).toEqual([T1, T2, T3]);
        expect((await listTenants(deps, { sortBy: 'lastErrorAt', sortDir: 'asc' })).items.map((i: any) => i.tid)).toEqual([T2, T1, T3]);
        expect((await listTenants(deps, { sortBy: 'name', sortDir: 'desc' })).items.map((i: any) => i.name)).toEqual(['Çelik Market', 'Beta Ticaret', 'Alfa Mağaza']);
        const p1 = await listTenants(deps, { limit: 2 });
        expect(p1.items).toHaveLength(2); expect(p1.nextCursor).toBeTruthy();
        const p2 = await listTenants(deps, { limit: 2, cursor: p1.nextCursor });
        expect(p2.items.map((i: any) => i.tid)).toEqual([T3]); expect(p2.nextCursor).toBeNull();
        await expect(listTenants(deps, { cursor: 'bozuk' })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });
    it('degraded: bir kaynak düşerse uç düşmez; ilgili alan varsayılan + opsDegraded; Redis yoksa yalnız DLQ ve failedJobs işaretlenir', async () => {
        const { deps } = build({ failAgg: ['issues', 'metric'], bull: null });
        const r = await listTenants(deps, {});
        expect(r.opsDegraded.sort()).toEqual(['failedJobs', 'lastErrorAt', 'openIssues']);
        expect(r.items.find((i: any) => i.tid === T2).ops).toMatchObject({ openIssues: 0, lastErrorAt: null, failedJobs24h: 2 });
    });
    it('zaman aşımı: yavaş kaynak sectionTimeoutMs sonrası degraded', async () => {
        const { deps } = build();
        deps.sectionTimeoutMs = 20;
        deps.failedBullJobs = () => new Promise(() => undefined);
        const r = await listTenants(deps, {});
        expect(r.opsDegraded).toContain('failedJobs');
    });
    it('tarama sınırı: 1000+ tenant -> scanTruncated', async () => {
        const { deps, clients } = build();
        clients.docs = Array.from({ length: 1001 }, (_, i) => ({ clientId: i + 1, order: i + 1, title: 'T' + i, status: 'ACTIVE' }));
        const r = await listTenants(deps, { limit: 200 });
        expect(r).toMatchObject({ scanned: 1000, scanTruncated: true });
    });
});

describe('BE-02 getHealthSummary', () => {
    it('açık sorun grupları (örnek mesaj yok), iş sayaçları, entegrasyon başına son başarılı çağrı, firing uyarılar', async () => {
        const { deps } = build();
        const r = await getHealthSummary(deps, T1);
        expect(r.tid).toBe(T1);
        expect(r.openIssues.approx).toBe(true);
        expect(r.openIssues.items.map((i: any) => i.fp)).toEqual(['a', 'b']);
        expect(r.openIssues.items[0]).toEqual({ fp: 'a', module: 'adapter', code: 'UNAVAILABLE', integrationCode: 'trendyol', lastSeen: ago(1).toISOString(), count: 3, status: 'open' });
        expect(r.failedJobs).toEqual({ bullmq: 2, dlq: 0, bullmqAvailable: true });
        expect(r.lastSyncAt).toEqual({ trendyol: ago(1).toISOString(), hepsiburada: null });
        expect(r.alerts).toHaveLength(1);
        expect(r.alerts[0]).toMatchObject({ ruleId: 'R1', level: 'warning', status: 'firing' });
        expect(r.degradedSections).toEqual([]);
        expect(r.lastOrderSyncAt).toBeNull();
    });
    it('yok -> 404; geçersiz tid -> 400; order ile de bulunur; Redis yok -> bullmq null; bölüm hatası degradedSections', async () => {
        const { deps } = build({ bull: null, failAgg: ['issues'] });
        await expect(getHealthSummary(deps, 4242)).rejects.toMatchObject({ statusCode: 404 });
        await expect(getHealthSummary(deps, 0)).rejects.toMatchObject({ statusCode: 400 });
        const r = await getHealthSummary(deps, 2); // order=2 -> clientId T2
        expect(r.tid).toBe(T2);
        expect(r.failedJobs).toMatchObject({ bullmq: null, bullmqAvailable: false });
        expect(r.openIssues.items).toEqual([]);
        expect(r.degradedSections).toEqual([{ section: 'openIssues', error: 'error' }]);
    });
});

describe('BE-01/02 kayıt', () => {
    it('yetenekler platformAdmin + read, step-up yok; şemalar sıkı', () => {
        for (const rpc of ['BackofficeTenantService/listTenants', 'BackofficeTenantService/getHealthSummary']) {
            const [s, o] = rpc.split('/');
            expect(getRequiredTier(s, o)).toBe('platformAdmin');
            expect(CAPABILITY_BY_RPC.get(rpc)).toMatchObject({ effect: 'read', minTier: 'platformAdmin' });
            expect(requiresStepUp(rpc)).toBe(false);
        }
        const S = BACKOFFICE_ATTENTION_RPC_INPUT as any;
        expect(S['BackofficeTenantService/listTenants'].safeParse({ hasIssues: true, subscriptionStatus: ['past_due'], sortBy: 'openIssues', limit: 50 }).success).toBe(true);
        for (const bad of [{ sortBy: 'password' }, { subscriptionStatus: ['x'] }, { limit: 201 }, { hasIssues: 'yes' }, { q: '' }, { evil: 1 }, { status: [{ $ne: 1 }] }]) expect(S['BackofficeTenantService/listTenants'].safeParse(bad).success).toBe(false);
        expect(S['BackofficeTenantService/getHealthSummary'].safeParse({ tid: 7 }).success).toBe(true);
        for (const bad of [{}, { tid: 0 }, { tid: '7' }, { tid: 7, x: 1 }]) expect(S['BackofficeTenantService/getHealthSummary'].safeParse(bad).success).toBe(false);
    });
});

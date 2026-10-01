// ADR-0017 Karar 4 / ADR-0029 NB8: platform kural kaynakları R5 (katalog birikmesi), R6 (iş sağlığı), R9 (süreç/bağımlılık),
// R10 (stok yayın gecikmesi), R11 (yeni hata türü) — saf kurallar + eşiklerin `_platform` ayarından okunması. DB/Redis YOK.
import { describe, it, expect, jest } from '@jest/globals';
import { evaluateRules, DEFAULT_THRESHOLDS, type RuleSources } from '../../../src/operations/alerts/alertRules';
import { readAlertThresholds } from '../../../src/operations/alerts/alertThresholds';
import { AlertEvaluator, type AlertEvaluatorDeps } from '../../../src/operations/alerts/AlertEvaluator';
import { getSettingDef } from '../../../src/integration/config/catalog';
import { AttentionOps, type AttentionSources } from '../../../src/api/admin/attentionOps';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

const T0 = Date.parse('2026-10-01T10:00:00Z');
const MIN = 60_000;
const base = (over: Partial<RuleSources> = {}): RuleSources => ({
    integrationCalls: async () => [], openCircuits: async () => [], queueBacklog: async () => null, deadDeliveries: async () => 0, ...over,
});
const ids = (f: Array<{ ruleId: string; scopeKey: string; level: string }>) => f.map((x) => [x.ruleId, x.scopeKey, x.level]);

describe('NB8 platform kuralları (saf)', () => {
    it('R5: en eski ertelenmemiş PENDING > 30 dk uyarı; sınırda/yoksa sessiz', async () => {
        const f = await evaluateRules(base({ catalogBacklog: async () => ({ oldestAt: T0 - 31 * MIN, count: 4 }) }), DEFAULT_THRESHOLDS, T0);
        expect(ids(f)).toEqual([['R5', 'catalog-pending', 'warning']]);
        expect(f[0].detail).toEqual({ oldestPendingMinutes: 31, pending: 4 });
        expect(f[0].tenant).toBeUndefined();
        expect(await evaluateRules(base({ catalogBacklog: async () => ({ oldestAt: T0 - 30 * MIN, count: 1 }) }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
        expect(await evaluateRules(base({ catalogBacklog: async () => null }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
    });

    it('R6: stale/hung/never-ran ya da >= 3 ardışık hata; kritik işte kritik; unknown/ok ve güvensiz ad sessiz', async () => {
        const f = await evaluateRules(base({ jobHealth: async () => [
            { name: 'stock.sweep', health: 'stale', consecutiveFailures: 0, critical: true },
            { name: 'billing.trial', health: 'ok', consecutiveFailures: 3, critical: false },
            { name: 'reports.hung', health: 'hung', consecutiveFailures: 0, critical: false },
            { name: 'ok.job', health: 'ok', consecutiveFailures: 2, critical: true },
            { name: 'unknown.job', health: 'unknown', consecutiveFailures: 0, critical: true },
            { name: 'kötü ad', health: 'stale', consecutiveFailures: 9, critical: true },
        ] }), DEFAULT_THRESHOLDS, T0);
        expect(ids(f)).toEqual([['R6', 'job:stock.sweep', 'critical'], ['R6', 'job:billing.trial', 'warning'], ['R6', 'job:reports.hung', 'warning']]);
    });

    it('R9: yakalanmamış red > 0/sa uyarı; hazırlık hatası > 2 dk kritik', async () => {
        const f = await evaluateRules(base({ processHealth: async () => ({ unhandledLastHour: 1, notReadySince: T0 - 3 * MIN, failing: ['redis'] }) }), DEFAULT_THRESHOLDS, T0);
        expect(ids(f)).toEqual([['R9', 'unhandled-rejections', 'warning'], ['R9', 'readiness', 'critical']]);
        expect(f[1].detail).toEqual({ notReadyForSec: 180, failing: 'redis' });
        expect(await evaluateRules(base({ processHealth: async () => ({ unhandledLastHour: 0, notReadySince: T0 - MIN, failing: ['redis'] }) }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
    });

    it('R10: p95 > 5 dk ve en az 20 gözlem (aşım = Infinity)', async () => {
        expect(ids(await evaluateRules(base({ publishLag: async () => ({ p95Ms: Number.POSITIVE_INFINITY, count: 25 }) }), DEFAULT_THRESHOLDS, T0))).toEqual([['R10', 'stock-publish-lag', 'warning']]);
        expect(await evaluateRules(base({ publishLag: async () => ({ p95Ms: 10 * MIN, count: 19 }) }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
        expect(await evaluateRules(base({ publishLag: async () => ({ p95Ms: 5 * MIN, count: 50 }) }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
        expect(await evaluateRules(base({ publishLag: async () => null }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
    });

    it('R11: ilk kez görülen ve >= 5 tekrarlı hata; kapsam anahtarı yalnız belge kimliği (mesaj/parmak izi girmez)', async () => {
        const id = 'a'.repeat(24);
        const seen: Array<[number, number]> = [];
        const f = await evaluateRules(base({ newErrors: async (since, min) => { seen.push([since, min]); return [
            { id, source: 'server', code: 'DB_TIMEOUT', count: 6 }, { id: 'srv::mod::mesaj 12', source: 'server', code: null, count: 50 }, { id: 'b'.repeat(24), source: 'server', code: 'X', count: 4 },
        ]; } }), DEFAULT_THRESHOLDS, T0);
        expect(seen).toEqual([[T0 - 60 * MIN, 5]]);
        expect(ids(f)).toEqual([['R11', `error:${id}`, 'warning']]);
        expect(f[0].detail).toEqual({ errorId: id, source: 'server', code: 'DB_TIMEOUT', count: 6 });
    });
});

describe('R5/R10/R11 eşikleri platform ayarından', () => {
    it('varsayılanlar katalogla aynı; yayınlanan değer yansır', () => {
        const fromDefaults = readAlertThresholds((k) => getSettingDef(k)?.default);
        expect(fromDefaults).toEqual(DEFAULT_THRESHOLDS);
        const t = readAlertThresholds((k) => ({ 'alerts.r5.pendingMin': 60, 'alerts.r10.p95Min': 10, 'alerts.r11.minCount': 20 } as Record<string, number>)[k]);
        expect([t.r5PendingMs, t.r10P95Ms, t.r11MinCount]).toEqual([60 * MIN, 10 * MIN, 20]);
        expect([t.r6Failures, t.r9NotReadyMs]).toEqual([DEFAULT_THRESHOLDS.r6Failures, DEFAULT_THRESHOLDS.r9NotReadyMs]); // ADR sabitleri kodda
    });

    it('platform kuralları tenant bildirimi üretmez; değerlendirici gölge modda yalnız defter', async () => {
        const model = new FakeNotifyModel([], { unique: [['ruleId', 'scopeKey']] });
        const platformNotify = jest.fn(async (..._a: any[]) => ({ status: 'suppressed' as const }));
        const tenantNotify = jest.fn(async (..._a: any[]) => ({ status: 'created' as const }));
        const deps: AlertEvaluatorDeps = {
            model: model as any,
            sources: base({ catalogBacklog: async () => ({ oldestAt: T0 - 40 * MIN, count: 2 }), jobHealth: async () => [{ name: 'a.job', health: 'stale', consecutiveFailures: 0, critical: false }] }),
            platformNotify: platformNotify as any, tenantNotify: tenantNotify as any,
            flags: () => ({ enabled: true, shadowUntil: new Date(T0 + 3_600_000) }), isMaintenance: () => false, now: () => new Date(T0),
        };
        const r = await new AlertEvaluator(deps).runOnce();
        expect(r.newFirings).toBe(2);
        expect(tenantNotify).not.toHaveBeenCalled();
        for (const c of platformNotify.mock.calls) expect((c[2] as any).shadow).toBe(true);
    });
});

describe('dikkat özeti: tenant devre uyarısı kimlik hatası sayılmaz', () => {
    it('R2 `circuit:*:tid` -> "Müşteri uyarısı"; R2 `auth:*` -> kimlik hatası', async () => {
        const empty = async () => [] as any[];
        const sources: AttentionSources = {
            queues: empty, circuits: empty, apiHealth: empty, leases: async () => ({ count: 0, oldestAt: null }),
            infra: async () => ({ ready: true, mongo: 'ok', redis: 'ok', degradedSections: [], red: null }),
            alerts: async () => [
                { ruleId: 'R2', scopeKey: 'circuit:n11:5', level: 'warning', detail: { integ: 'n11', tid: 5 }, firstFiredAt: new Date(T0) },
                { ruleId: 'R2', scopeKey: 'auth:n11:6', level: 'critical', detail: { integ: 'n11', tid: 6 }, firstFiredAt: new Date(T0) },
            ],
            slowQueries: async () => ({ last1h: 0, prev23hAvgPerHour: 0 }), orderSync: empty, trialEnding: empty, suspended: empty, pastDue: empty,
            deletionPending: empty, lifecycleFailed: empty, tickets: empty, tenantNames: async () => new Map(),
        };
        const res = await new AttentionOps({ sources, now: () => T0 }).getAttention();
        const items = res.groups.customers.items.map((i: any) => [i.id, i.subjects.map((s: any) => s.tid)]);
        expect(items).toEqual(expect.arrayContaining([['cus.integration.auth:n11', [6]], ['cus.alert:R2', [5]]]));
        expect(items).toHaveLength(2);
    });
});

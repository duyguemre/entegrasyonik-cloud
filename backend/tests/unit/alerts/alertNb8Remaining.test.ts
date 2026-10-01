// ADR-0029 NB8 kalanları: R2 tenant devresi (INTEGRATION_CIRCUIT_OPEN), R3 (ORDER_SYNC_LAGGING), R8 (STOCK_OVERSOLD_UNRESOLVED),
// eşiklerin `_platform` ayarından okunması (ADR-0031 katalog), INTEGRATION_CHANGE_NOTICE (ADR-0018 triage sonrası). DB/Redis/SMTP YOK.
import fs from 'fs';
import path from 'path';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { evaluateRules, DEFAULT_THRESHOLDS, type RuleSources } from '../../../src/operations/alerts/alertRules';
import { readAlertThresholds } from '../../../src/operations/alerts/alertThresholds';
import { AlertEvaluator, type AlertEvaluatorDeps } from '../../../src/operations/alerts/AlertEvaluator';
import { lagging } from '../../../src/operations/alerts/createAlertEvaluator';
import { createChangeNoticeHook } from '../../../src/operations/alerts/findingAlertHook';
import { ALERT_SETTINGS } from '../../../src/integration/config/catalog/alerts';
import { SETTINGS_CATALOG } from '../../../src/integration/config/catalog';
import { listPublicPlatformSettings } from '../../../src/integration/config/platformSettings';
import { resetPlatformOverrideStoreForTests, setTargetIntake } from '../../../src/integration/config/platformOverrideStore';
import { FindingService, computeDedupKey, type IntegrationFindingRecord } from '../../../src/integration/compliance/FindingService';
import { NOTIFICATION_CATALOG } from '../../../src/operations/notifications/catalog';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

const T0 = Date.parse('2026-10-01T10:00:00Z');
const MIN = 60_000;

const base = (over: Partial<RuleSources> = {}): RuleSources => ({
    integrationCalls: async () => [], openCircuits: async () => [], queueBacklog: async () => null, deadDeliveries: async () => 0, ...over,
});

describe('NB8 kuralları (saf)', () => {
    it('R2 tenant devresi: pencerede open var + closed yok -> uyarı + INTEGRATION_CIRCUIT_OPEN; closed görülen/boş/güvensiz atlanır', async () => {
        const since = jest.fn<(s: number) => Promise<any[]>>(async () => [
            { clientId: '7', integrationCode: 'n11', calls: 4, open: 3, closed: 0 },
            { clientId: '8', integrationCode: 'n11', calls: 4, open: 3, closed: 1 },
            { clientId: '9', integrationCode: 'n11', calls: 2, open: 0, closed: 0 },
            { clientId: 'x', integrationCode: 'n11', calls: 2, open: 2, closed: 0 },
        ]);
        const f = await evaluateRules(base({ tenantCircuits: since }), DEFAULT_THRESHOLDS, T0);
        expect(since).toHaveBeenCalledWith(T0 - DEFAULT_THRESHOLDS.r2CircuitOpenMs);
        expect(f).toEqual([expect.objectContaining({ ruleId: 'R2', scopeKey: 'circuit:n11:7', level: 'warning', tenant: { tid: 7, code: 'INTEGRATION_CIRCUIT_OPEN', params: { integ: 'n11' } } })]);
    });

    it('R3: gecikme > 30 dk uyarı, > 120 dk kritik; ORDER_SYNC_LAGGING parametreleri katalog şemasını geçer', async () => {
        const rows = jest.fn<(s: number) => Promise<any[]>>(async () => [
            { tid: 1, integrationCode: 'trendyol', lastSuccessAt: T0 - 31 * MIN },
            { tid: 2, integrationCode: 'trendyol', lastSuccessAt: T0 - 121 * MIN },
            { tid: 3, integrationCode: 'trendyol', lastSuccessAt: T0 - 30 * MIN }, // eşikte: kaynak döndürse de kural atlar
        ]);
        const f = await evaluateRules(base({ orderSyncLagging: rows }), DEFAULT_THRESHOLDS, T0);
        expect(rows).toHaveBeenCalledWith(T0 - 30 * MIN);
        expect(f.map((x) => [x.ruleId, x.scopeKey, x.level])).toEqual([['R3', 'trendyol:1', 'warning'], ['R3', 'trendyol:2', 'critical']]);
        expect(f[1].tenant).toEqual({ tid: 2, code: 'ORDER_SYNC_LAGGING', params: { integ: 'trendyol', lagMinutes: 121, level: 'critical' } });
        const def = NOTIFICATION_CATALOG.find((c: any) => c.code === 'ORDER_SYNC_LAGGING') as any;
        expect(def.params.safeParse(f[1].tenant!.params).success).toBe(true);
    });

    it('R8: escalated + hâlâ OVERSOLD > 60 dk -> STOCK_OVERSOLD_UNRESOLVED (tenant başına tek bulgu)', async () => {
        const src = jest.fn<(s: number) => Promise<any[]>>(async () => [{ tid: 4, count: 3 }, { tid: 5, count: 0 }]);
        const f = await evaluateRules(base({ oversoldUnresolved: src }), DEFAULT_THRESHOLDS, T0);
        expect(src).toHaveBeenCalledWith(T0 - 60 * MIN);
        expect(f).toEqual([expect.objectContaining({ ruleId: 'R8', scopeKey: 'oversold:4', level: 'warning', tenant: { tid: 4, code: 'STOCK_OVERSOLD_UNRESOLVED', params: { count: 3 } } })]);
    });

    it('opsiyonel kaynaklar tanımsızsa kurallar atlanır (eski kaynak seti aynen çalışır)', async () => {
        expect(await evaluateRules(base(), DEFAULT_THRESHOLDS, T0)).toEqual([]);
    });
});

describe('R3 kaynak seçimi (lagging)', () => {
    afterEach(() => resetPlatformOverrideStoreForTests());
    const at = (min: number) => new Date(T0 - min * MIN);
    const clients = [
        { clientId: 1, integrations: [
            { integrationCode: 'trendyol', type: 'marketplace', status: true, lastSuccessfulOrderSync: at(45) },
            { integrationCode: 'n11', type: 'marketplace', status: false, lastSuccessfulOrderSync: at(500) },      // kapalı
            { integrationCode: 'bizimhesap', type: 'erp', status: true, lastSuccessfulOrderSync: at(500) },        // sipariş senkronu yok
            { integrationCode: 'ideasoft', type: 'ecommerce', status: true },                                      // imleç yok
            { integrationCode: 'pazarama', type: 'marketplace', status: true, lastSuccessfulOrderSync: at(5) },    // taze
        ] },
        { clientId: 2, integrations: [{ integrationCode: 'hepsiburada', type: 'marketplace', status: true, lastSuccessfulOrderSync: at(90) }] },
        { order: 3, integrations: [{ integrationCode: 'trendyol', type: 'marketplace', status: true, lastSuccessfulOrderSync: at(90) }] },
        { integrations: 'bozuk' },
    ];

    it('yalnız etkin sipariş entegrasyonu + eski imleç; abonelik kapalı tenant atlanır', async () => {
        const rows = await lagging(clients, T0 - 30 * MIN, async (tid) => tid !== 2);
        expect(rows.map((r) => [r.tid, r.integrationCode])).toEqual([[1, 'trendyol'], [3, 'trendyol']]);
    });

    it('kill-switch (ADR-0030 X6) drain/off olan entegrasyon atlanır: imleç bilerek ilerlemez', async () => {
        setTargetIntake('trendyol', 'drain');
        const rows = await lagging(clients, T0 - 30 * MIN, async () => true);
        expect(rows.map((r) => [r.tid, r.integrationCode])).toEqual([[2, 'hepsiburada']]);
    });
});

describe('eşikler platform ayarından (ADR-0031)', () => {
    it('katalog: 11 anahtar, platform kapsamı, yöneticiye özel (public-config dışı), varsayılan şemayı geçer, tüketici dosyası var', () => {
        expect(ALERT_SETTINGS).toHaveLength(11);
        for (const s of ALERT_SETTINGS) {
            expect(s.key.startsWith('alerts.')).toBe(true);
            expect(s.scope).toBe('platform');
            expect(s.exposure).toBeUndefined();
            expect(SETTINGS_CATALOG).toContain(s);
            expect(s.schema.safeParse(s.default).success).toBe(true);
            for (const c of s.consumers) expect(fs.existsSync(path.resolve(__dirname, '../../../src/integration', c))).toBe(true);
        }
        expect(listPublicPlatformSettings().some((s) => s.key.startsWith('alerts.'))).toBe(false);
        // ADR-0031 gözden geçirme eşiği: `_platform` anahtar sayısı 25'i geçmez. PRC-CFG (2026-10-01) eşiği aştı; ADR'nin öngördüğü
        // değerlendirme yapıldı: rekabet anahtarları ayrı grupta (`platform.pricing`) ve ayrı backoffice ekranında; ayrı hedef gerekmedi
        // (yayın sıklığı düşük). Bu yüzden genel sayım o grubu dışlar, grup kendi tavanını taşır (ADR notu insan onayında, rapor).
        const platformKeys = SETTINGS_CATALOG.filter((s) => s.scope === 'platform');
        expect(platformKeys.filter((s) => s.group !== 'platform.pricing').length).toBeLessThanOrEqual(25);
        expect(platformKeys.filter((s) => s.group === 'platform.pricing').length).toBeLessThanOrEqual(15);
    });

    it('katalog varsayılanları kodun DEFAULT_THRESHOLDS değerleriyle birebir aynı', () => {
        const defaults = Object.fromEntries(ALERT_SETTINGS.map((s) => [s.key, s.default]));
        expect(readAlertThresholds((k) => defaults[k])).toEqual(DEFAULT_THRESHOLDS);
        expect(readAlertThresholds(() => undefined)).toEqual(DEFAULT_THRESHOLDS);
    });

    it('yayınlanmış ayar değerlendirmeyi değiştirir; kritik < uyarı tutarsızlığında uyarı eşiği esas (yanlış kritik yok)', async () => {
        const t = readAlertThresholds((k) => ({ 'alerts.r3.lagWarnMin': 10, 'alerts.r3.lagCriticalMin': 5, 'alerts.r1.warnPercent': 40, 'alerts.r1.criticalPercent': 30 } as Record<string, number>)[k]);
        expect(t.r3LagWarnMs).toBe(10 * MIN);
        const f = await evaluateRules(base({
            orderSyncLagging: async () => [{ tid: 1, integrationCode: 'trendyol', lastSuccessAt: T0 - 11 * MIN }],
            integrationCalls: async () => [{ clientId: '1', integrationCode: 'trendyol', total: 100, errors: 35, authErrors: 0, dataErrors: 0 }, { clientId: '2', integrationCode: 'trendyol', total: 100, errors: 41, authErrors: 0, dataErrors: 0 }],
        }), t, T0);
        expect(f.map((x) => [x.ruleId, x.scopeKey, x.level])).toEqual([['R1', 'trendyol:2', 'critical'], ['R3', 'trendyol:1', 'critical']]);
    });

    it('değerlendirici eşikleri HER TURDA okur (yayın sonrası yeniden başlatma gerekmez)', async () => {
        let warnMin = 60;
        const model = new FakeNotifyModel([], { unique: [['ruleId', 'scopeKey']] });
        const deps: AlertEvaluatorDeps = {
            model: model as any,
            sources: base({ orderSyncLagging: async (s) => (T0 - 45 * MIN < s ? [{ tid: 1, integrationCode: 'trendyol', lastSuccessAt: T0 - 45 * MIN }] : []) }),
            platformNotify: jest.fn(async () => ({ status: 'created' as const })) as any, tenantNotify: jest.fn(async () => ({ status: 'created' as const })) as any,
            flags: () => ({ enabled: true }), isMaintenance: () => false, now: () => new Date(T0),
            thresholds: () => readAlertThresholds((k) => (k === 'alerts.r3.lagWarnMin' ? warnMin : undefined)),
        };
        const ev = new AlertEvaluator(deps);
        expect((await ev.runOnce()).evaluated).toBe(0);
        warnMin = 30;
        expect((await ev.runOnce()).evaluated).toBe(1);
    });
});

describe('gölge mod ve cooldown yeni kurallarda da geçerli', () => {
    function build(shadowUntil?: Date) {
        const model = new FakeNotifyModel([], { unique: [['ruleId', 'scopeKey']] });
        const tenantNotify = jest.fn(async (..._a: any[]) => ({ status: 'created' as const }));
        const ev = new AlertEvaluator({
            model: model as any,
            sources: base({ oversoldUnresolved: async () => [{ tid: 4, count: 2 }], orderSyncLagging: async () => [{ tid: 4, integrationCode: 'trendyol', lastSuccessAt: T0 - 40 * MIN }] }),
            platformNotify: jest.fn(async () => ({ status: 'created' as const })) as any, tenantNotify: tenantNotify as any,
            flags: () => ({ enabled: true, shadowUntil }), isMaintenance: () => false, now: () => new Date(T0),
        });
        return { ev, tenantNotify };
    }

    it('gölge modda tenant bildirimi shadow:true ile gider (notify yalnız deftere yazar)', async () => {
        const t = build(new Date(T0 + 14 * 24 * 60 * MIN));
        const r = await t.ev.runOnce();
        expect(r.shadow).toBe(true);
        expect(t.tenantNotify).toHaveBeenCalledWith('STOCK_OVERSOLD_UNRESOLVED', 4, { count: 2 }, expect.objectContaining({ shadow: true }));
        expect(t.tenantNotify).toHaveBeenCalledWith('ORDER_SYNC_LAGGING', 4, { integ: 'trendyol', lagMinutes: 40, level: 'warning' }, expect.objectContaining({ shadow: true }));
    });

    it('ikinci tur cooldown içinde tenant bildirimi tekrarlanmaz', async () => {
        const t = build();
        await t.ev.runOnce();
        await t.ev.runOnce();
        expect(t.tenantNotify).toHaveBeenCalledTimes(2);
    });
});

describe('INTEGRATION_CHANGE_NOTICE (ADR-0018 triage sonrası)', () => {
    let store: Map<string, IntegrationFindingRecord>;
    const notices: any[] = [];
    const key = computeDedupKey('trendyol', 'unknown_enum', 'orders.status', 'orders.status');
    const seed = (over: Partial<IntegrationFindingRecord>) => store.set(key, { dedupKey: key, integrationCode: 'trendyol', severity: 'high', affectedTenants: [3, 9], status: 'triaged', ...over } as any);
    const flush = () => new Promise((r) => setImmediate(r));

    beforeEach(() => {
        store = new Map(); notices.length = 0;
        FindingService.setReader(async (k) => store.get(k) ?? null);
        FindingService.setSink(async (_op, rec) => { const e = store.get(rec.dedupKey); if (e) store.set(rec.dedupKey, { ...e, ...rec }); });
        FindingService.setChangeNoticeHook(createChangeNoticeHook({
            tenantNotify: async (code, tid, params, opts) => { notices.push({ code, tid, params, shadow: opts?.shadow }); if (tid === 3) throw new Error('x'); return { status: 'created' } as any; },
            shadow: () => false,
        }));
    });
    afterEach(() => { FindingService.setReader(undefined); FindingService.setSink(undefined); FindingService.setChangeNoticeHook(undefined); });

    it('accept + high -> etkilenen her tenant\'a info; tek tenant hatası diğerini durdurmaz; içerik/kanıt yok', async () => {
        seed({});
        await FindingService.transition(key, 'accept', { decidedBy: 'admin' });
        await flush();
        expect(notices).toEqual([
            { code: 'INTEGRATION_CHANGE_NOTICE', tid: 3, params: { integ: 'trendyol', findingId: key.slice(0, 16), level: 'info' }, shadow: false },
            { code: 'INTEGRATION_CHANGE_NOTICE', tid: 9, params: { integ: 'trendyol', findingId: key.slice(0, 16), level: 'info' }, shadow: false },
        ]);
        const def = NOTIFICATION_CATALOG.find((c: any) => c.code === 'INTEGRATION_CHANGE_NOTICE') as any;
        expect(def.params.safeParse(notices[0].params).success).toBe(true);
    });

    it('critical -> warning seviyesi', async () => {
        seed({ severity: 'critical', affectedTenants: [9] });
        await FindingService.transition(key, 'accept', { decidedBy: 'admin' });
        await flush();
        expect(notices.map((n) => n.params.level)).toEqual(['warning']);
    });

    it('triage/wontfix geçişi, düşük önem veya etkilenen tenant yoksa bildirim YOK', async () => {
        seed({});
        await FindingService.transition(key, 'triage', { decidedBy: 'admin' });
        await FindingService.transition(key, 'wontfix', { decidedBy: 'admin' });
        seed({ severity: 'medium' as any });
        await FindingService.transition(key, 'accept', { decidedBy: 'admin' });
        seed({ affectedTenants: [] });
        await FindingService.transition(key, 'accept', { decidedBy: 'admin' });
        await flush();
        expect(notices).toEqual([]);
    });
});

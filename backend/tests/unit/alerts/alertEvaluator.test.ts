// ADR-0017 Aşama C / NB8: alarm kuralları (saf) + değerlendirici yaşam döngüsü (cooldown, histerezis, yükseltme, susturma, bakım, gölge, fırtına). DB/Redis/SMTP YOK.
import { describe, it, expect, jest } from '@jest/globals';
import { evaluateRules, DEFAULT_THRESHOLDS, type RuleSources, type CallAggregate } from '../../../src/operations/alerts/alertRules';
import { AlertEvaluator, COOLDOWN_MS, STORM_THRESHOLD, type AlertEvaluatorDeps } from '../../../src/operations/alerts/AlertEvaluator';
import { AlertAdmin } from '../../../src/operations/alerts/alertAdmin';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';

const T0 = Date.parse('2026-10-01T10:00:00Z');
const MIN = 60_000, HOUR = 3_600_000;

const call = (over: Partial<CallAggregate> = {}): CallAggregate => ({ clientId: '7', integrationCode: 'trendyol', total: 100, errors: 0, authErrors: 0, dataErrors: 0, ...over });
const src = (over: Partial<{ calls: CallAggregate[]; circuits: any[]; queue: any; dead: number }> = {}): RuleSources => ({
    integrationCalls: async () => over.calls ?? [], openCircuits: async () => over.circuits ?? [],
    queueBacklog: async () => (over.queue === undefined ? { wait: 0, oldestWaitSec: 0 } : over.queue), deadDeliveries: async () => over.dead ?? 0,
});

describe('alertRules (saf)', () => {
    it('R1: hata oranı >= %20 uyarı, >= %50 kritik; az çağrı (<20) ve veri hataları (VALIDATION/NOT_SUPPORTED) orana girmez', async () => {
        const f = await evaluateRules(src({ calls: [
            call({ clientId: '1', errors: 20 }),                               // %20 -> warning
            call({ clientId: '2', errors: 50 }),                               // %50 -> critical
            call({ clientId: '3', total: 19, errors: 19 }),                    // az çağrı
            call({ clientId: '4', errors: 60, dataErrors: 60 }),               // tümü veri hatası
            call({ clientId: '5', errors: 10 }),                               // %10 altında
        ] }), DEFAULT_THRESHOLDS, T0);
        expect(f.map((x) => [x.ruleId, x.scopeKey, x.level])).toEqual([['R1', 'trendyol:1', 'warning'], ['R1', 'trendyol:2', 'critical']]);
        expect(f[1].tenant).toEqual({ tid: 2, code: 'INTEGRATION_ERROR_RATE_HIGH', params: { integ: 'trendyol', ratePercent: 50, level: 'critical' } });
        expect(f[0].detail).toMatchObject({ integ: 'trendyol', tid: 1, total: 100, errors: 20, rate: 0.2 });
    });
    it('R2: AUTH hatası >= 3 kritik (tenant: INTEGRATION_AUTH_FAILED); devre açık > 10 dk uyarı (yalnız platform)', async () => {
        const f = await evaluateRules(src({
            calls: [call({ clientId: '9', errors: 3, authErrors: 3, total: 10 })],
            circuits: [{ integrationCode: 'n11', open: 2, lastOpenedAt: T0 - 11 * MIN }, { integrationCode: 'pazarama', open: 1, lastOpenedAt: T0 - 2 * MIN }, { integrationCode: 'hb', open: 0, lastOpenedAt: null }],
        }), DEFAULT_THRESHOLDS, T0);
        expect(f.map((x) => [x.ruleId, x.scopeKey, x.level])).toEqual([['R2', 'auth:trendyol:9', 'critical'], ['R2', 'circuit:n11', 'warning']]);
        expect(f[0].tenant).toEqual({ tid: 9, code: 'INTEGRATION_AUTH_FAILED', params: { integ: 'trendyol' } });
        expect(f[1].tenant).toBeUndefined();
    });
    it('R4: bekleyen > 200 ya da en eski > 10 dk; Redis yok (null) atlanır. R7: olu teslim >= 10 kendi koduyla', async () => {
        expect((await evaluateRules(src({ queue: { wait: 201, oldestWaitSec: 1 } }), DEFAULT_THRESHOLDS, T0)).map((x) => x.ruleId)).toEqual(['R4']);
        expect((await evaluateRules(src({ queue: { wait: 1, oldestWaitSec: 601 } }), DEFAULT_THRESHOLDS, T0)).map((x) => x.ruleId)).toEqual(['R4']);
        expect(await evaluateRules(src({ queue: { wait: 200, oldestWaitSec: 600 } }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
        expect(await evaluateRules(src({ queue: null }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
        const f = await evaluateRules(src({ dead: 12 }), DEFAULT_THRESHOLDS, T0);
        expect(f[0]).toMatchObject({ ruleId: 'R7', scopeKey: 'notification-outbox', platformCode: 'PLATFORM_DELIVERY_DEAD_LETTERS', platformParams: { deadCount: 12 } });
        expect(await evaluateRules(src({ dead: 9 }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
    });
    it('güvensiz kimlik/entegrasyon kodu atlanır (PII/enjeksiyon)', async () => {
        expect(await evaluateRules(src({ calls: [call({ clientId: 'abc', errors: 90 }), call({ integrationCode: 'a b;c', errors: 90 })] }), DEFAULT_THRESHOLDS, T0)).toEqual([]);
    });
});

describe('AlertEvaluator yaşam döngüsü', () => {
    function build(over: Partial<AlertEvaluatorDeps> & { state?: { calls?: CallAggregate[]; dead?: number; circuits?: any[] }; now?: () => Date } = {}) {
        const model = new FakeNotifyModel([], { unique: [['ruleId', 'scopeKey']] });
        const state = over.state ?? {};
        let clock = T0;
        const platformNotify = jest.fn(async (..._a: any[]) => ({ status: 'created' as const }));
        const tenantNotify = jest.fn(async (..._a: any[]) => ({ status: 'created' as const }));
        const deps: AlertEvaluatorDeps = {
            model: model as any,
            sources: { integrationCalls: async () => state.calls ?? [], openCircuits: async () => state.circuits ?? [], queueBacklog: async () => null, deadDeliveries: async () => state.dead ?? 0 },
            platformNotify: platformNotify as any, tenantNotify: tenantNotify as any,
            flags: () => ({ enabled: true }), isMaintenance: () => false, now: () => new Date(clock), ...over,
        };
        const ev = new AlertEvaluator(deps);
        return { ev, model, state, platformNotify, tenantNotify, advance: (ms: number) => { clock += ms; } };
    }

    it('devre dışı: hiçbir modele dokunmaz', async () => {
        const { ev, model } = build({ flags: () => ({ enabled: false }) });
        const find = jest.spyOn(model, 'find');
        expect(await ev.runOnce()).toMatchObject({ skipped: 'disabled' });
        expect(find).not.toHaveBeenCalled();
    });

    it('yeni uyarı: firing kaydı + platform bildirimi (+ tenant bildirimi); ikinci tur cooldown içinde sessiz', async () => {
        const t = build({ state: { calls: [call({ errors: 30 })] } });
        const r1 = await t.ev.runOnce();
        expect(r1).toMatchObject({ newFirings: 1, platformNotified: 1, tenantNotified: 1 });
        expect(t.model.docs[0]).toMatchObject({ ruleId: 'R1', scopeKey: 'trendyol:7', status: 'firing', level: 'warning', lastNotifiedAt: new Date(T0) });
        expect(t.platformNotify).toHaveBeenCalledWith('PLATFORM_ALERT_FIRING', { ruleId: 'R1', alertId: String(t.model.docs[0]._id), level: 'warning' }, expect.objectContaining({ shadow: false }));
        expect(t.tenantNotify).toHaveBeenCalledWith('INTEGRATION_ERROR_RATE_HIGH', 7, { integ: 'trendyol', ratePercent: 30, level: 'warning' }, expect.objectContaining({ module: 'alerts', shadow: false }));
        t.advance(MIN);
        const r2 = await t.ev.runOnce();
        expect(r2).toMatchObject({ newFirings: 0, platformNotified: 0, tenantNotified: 0, renotified: 0 });
        expect(t.platformNotify).toHaveBeenCalledTimes(1);
    });

    it('tekrar bastırma: uyarıda 24 sa, kritikte 4 sa sonra yeniden bildirim', async () => {
        const w = build({ state: { calls: [call({ errors: 30 })] } });
        await w.ev.runOnce();
        w.advance(COOLDOWN_MS.warning - MIN); await w.ev.runOnce();
        expect(w.platformNotify).toHaveBeenCalledTimes(1);
        w.advance(2 * MIN); const r = await w.ev.runOnce();
        expect(r.renotified).toBe(1);
        expect(w.platformNotify).toHaveBeenCalledTimes(2);

        const c = build({ state: { calls: [call({ errors: 80 })] } });
        await c.ev.runOnce();
        c.advance(COOLDOWN_MS.critical - MIN); await c.ev.runOnce();
        expect(c.platformNotify).toHaveBeenCalledTimes(1);
        c.advance(2 * MIN); await c.ev.runOnce();
        expect(c.platformNotify).toHaveBeenCalledTimes(2);
    });

    it('uyarı kritiğe yükselince cooldown beklenmeden bildirilir', async () => {
        const t = build({ state: { calls: [call({ errors: 30 })] } });
        await t.ev.runOnce();
        t.state.calls = [call({ errors: 70 })];
        t.advance(MIN);
        const r = await t.ev.runOnce();
        expect(r.renotified).toBe(1);
        expect(t.platformNotify).toHaveBeenLastCalledWith('PLATFORM_ALERT_FIRING', expect.objectContaining({ level: 'critical' }), expect.anything());
        expect(t.model.docs[0].level).toBe('critical');
    });

    it('histerezis: 2 ardışık temiz değerlendirmeden sonra resolved + tek "çözüldü" iletisi; temizlik arasında yeniden görülürse sayaç sıfırlanır', async () => {
        const t = build({ state: { calls: [call({ errors: 30 })] } });
        await t.ev.runOnce();
        t.state.calls = []; t.advance(MIN);
        await t.ev.runOnce();
        expect(t.model.docs[0]).toMatchObject({ status: 'firing', cleanStreak: 1 });
        t.state.calls = [call({ errors: 30 })]; t.advance(MIN);
        await t.ev.runOnce();
        expect(t.model.docs[0]).toMatchObject({ status: 'firing', cleanStreak: 0 });
        t.state.calls = [];
        t.advance(MIN); await t.ev.runOnce();
        t.advance(MIN); const r = await t.ev.runOnce();
        expect(r.resolved).toBe(1);
        expect(t.model.docs[0]).toMatchObject({ status: 'resolved', resolvedAt: expect.any(Date), expAt: expect.any(Date) });
        expect(t.platformNotify).toHaveBeenLastCalledWith('PLATFORM_ALERT_RESOLVED', { ruleId: 'R1', alertId: String(t.model.docs[0]._id) }, expect.anything());
        // çözülmüş uyarı yeniden tetiklenirse yeni firing sayılır ve yeniden bildirilir
        t.state.calls = [call({ errors: 30 })]; t.advance(MIN);
        const again = await t.ev.runOnce();
        expect(again.newFirings).toBe(1);
        expect(t.model.docs[0]).toMatchObject({ status: 'firing' });
        expect(t.model.docs[0].resolvedAt).toBeUndefined();
        expect(t.model.docs[0].expAt).toBeUndefined();
    });

    it('susturma: mutedUntil süresince bildirim yok (kayıt sürer); süre bitince cooldown koşuluyla yeniden bildirir', async () => {
        const t = build({ state: { calls: [call({ errors: 80 })] } });
        await t.ev.runOnce();
        t.model.docs[0].mutedUntil = new Date(T0 + 10 * HOUR);
        t.advance(5 * HOUR);
        const r = await t.ev.runOnce();
        expect(r.renotified).toBe(0);
        expect(t.platformNotify).toHaveBeenCalledTimes(1);
        expect(t.model.docs[0].lastSeenAt).toEqual(new Date(T0 + 5 * HOUR));
        t.advance(6 * HOUR);
        await t.ev.runOnce();
        expect(t.platformNotify).toHaveBeenCalledTimes(2);
    });

    it('bakım penceresi: bildirim yok, cooldown başlamaz; bakım bitince ilk turda bildirilir', async () => {
        let maint = true;
        const t = build({ state: { calls: [call({ errors: 30 })] }, isMaintenance: () => maint });
        const r = await t.ev.runOnce();
        expect(r).toMatchObject({ newFirings: 1, maintenance: true, platformNotified: 0, tenantNotified: 0 });
        expect(t.model.docs[0].lastNotifiedAt).toBeUndefined();
        expect(t.platformNotify).not.toHaveBeenCalled();
        maint = false; t.advance(MIN);
        await t.ev.runOnce();
        expect(t.platformNotify).toHaveBeenCalledTimes(1);
    });

    it('gölge mod: kayıt + defter (shadow:true); "çözüldü" da gölge; gölge bitince normal', async () => {
        const t = build({ state: { calls: [call({ errors: 30 })] }, flags: () => ({ enabled: true, shadowUntil: new Date(T0 + 14 * 24 * HOUR) }) });
        const r = await t.ev.runOnce();
        expect(r.shadow).toBe(true);
        expect(t.model.docs[0].shadow).toBe(true);
        expect(t.platformNotify).toHaveBeenCalledWith('PLATFORM_ALERT_FIRING', expect.anything(), expect.objectContaining({ shadow: true }));
        expect(t.tenantNotify).toHaveBeenCalledWith('INTEGRATION_ERROR_RATE_HIGH', 7, expect.anything(), expect.objectContaining({ shadow: true }));
        const n = build({ state: { calls: [call({ errors: 30 })] }, flags: () => ({ enabled: true, shadowUntil: new Date(T0 - HOUR) }) });
        await n.ev.runOnce();
        expect(n.platformNotify).toHaveBeenCalledWith('PLATFORM_ALERT_FIRING', expect.anything(), expect.objectContaining({ shadow: false }));
    });

    it('fırtına: 100 yeni uyarı -> 1 özet (platform); tenant bildirimleri kendi kapsamında gider', async () => {
        const calls = Array.from({ length: 100 }, (_, i) => call({ clientId: String(1000 + i), errors: 30 }));
        const t = build({ state: { calls } });
        const r = await t.ev.runOnce();
        expect(r).toMatchObject({ newFirings: 100, digest: true, platformNotified: 1, tenantNotified: 100 });
        expect(t.platformNotify).toHaveBeenCalledTimes(1);
        expect(t.platformNotify).toHaveBeenCalledWith('PLATFORM_ALERT_DIGEST', { newAlertCount: 100 }, expect.anything());
        expect(t.model.docs).toHaveLength(100);
        // eşik: tam 5 yeni uyarı özetlenmez
        const five = build({ state: { calls: calls.slice(0, STORM_THRESHOLD) } });
        expect(await five.ev.runOnce()).toMatchObject({ digest: false, platformNotified: 5 });
    });

    it('R7 kendi platform koduyla (PLATFORM_DELIVERY_DEAD_LETTERS) bildirilir; tek bir bulgu hatası diğerlerini durdurmaz', async () => {
        const t = build({ state: { dead: 11 } });
        await t.ev.runOnce();
        expect(t.platformNotify).toHaveBeenCalledWith('PLATFORM_DELIVERY_DEAD_LETTERS', { deadCount: 11 }, expect.anything());
        const u = build({ state: { calls: [call({ clientId: '1', errors: 30 }), call({ clientId: '2', errors: 30 })] } });
        const real = u.model.create.bind(u.model);
        let n = 0;
        jest.spyOn(u.model, 'create').mockImplementation(async (d: any) => { if (n++ === 0) throw new Error('boom'); return real(d); });
        const r = await u.ev.runOnce();
        expect(r.newFirings).toBe(1);
    });

    it('bildirim motoru hata verirse (notify throw etmez ama failed döner) uyarı kaydı korunur', async () => {
        const t = build({ state: { calls: [call({ errors: 30 })] }, platformNotify: async () => ({ status: 'failed' as const }), tenantNotify: async () => ({ status: 'skipped' as const }) });
        const r = await t.ev.runOnce();
        expect(r).toMatchObject({ newFirings: 1, platformNotified: 0, tenantNotified: 0 });
        expect(t.model.docs).toHaveLength(1);
    });
});

describe('AlertAdmin', () => {
    const audits: any[] = [];
    AuditLogger.setSink(async (r: any) => { audits.push(r); });
    const settle = () => new Promise((r) => setTimeout(r, 5));
    const seed = () => new FakeNotifyModel([
        { ruleId: 'R1', scopeKey: 'trendyol:7', level: 'warning', status: 'firing', detail: { tid: 7 }, firstFiredAt: new Date(T0), lastSeenAt: new Date(T0) },
        { ruleId: 'R4', scopeKey: 'order-sync-queue', level: 'warning', status: 'resolved', detail: {}, firstFiredAt: new Date(T0), lastSeenAt: new Date(T0) },
    ]);
    it('liste: durum/önem/kural filtresi, imleç sayfalama, yalnız beyaz listeli alanlar', async () => {
        const a = new AlertAdmin({ model: seed() as any });
        expect((await a.list({ status: 'firing' })).items.map((x: any) => x.ruleId)).toEqual(['R1']);
        const p1 = await a.list({ limit: 1 });
        expect(p1.items).toHaveLength(1);
        expect(p1.nextCursor).toEqual(expect.any(String));
        const p2 = await a.list({ limit: 1, cursor: p1.nextCursor });
        expect(p2.items).toHaveLength(1);
        expect(p2.nextCursor).toBeNull();
        expect(Object.keys(p1.items[0]).sort()).toEqual(['detail', 'firstFiredAt', 'id', 'lastNotifiedAt', 'lastSeenAt', 'level', 'mutedUntil', 'resolvedAt', 'ruleId', 'scopeKey', 'shadow', 'status']);
        await expect(a.list({ cursor: '###' })).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    });
    it('susturma: firing uyarıyı süreli susturur (audit), 0 saat kaldırır; olmayan/çözülmüş 404; sınır dışı süre 400', async () => {
        const m = seed();
        const a = new AlertAdmin({ model: m as any, now: () => new Date(T0) });
        const r = await a.mute({ sub: 'adm1', ip: '1.2.3.4' }, { ruleId: 'R1', scopeKey: 'trendyol:7', hours: 6, reason: 'planlı bakım çalışması' });
        expect(r.mutedUntil).toEqual(new Date(T0 + 6 * HOUR));
        expect(m.docs[0]).toMatchObject({ mutedUntil: new Date(T0 + 6 * HOUR), mutedBy: 'adm1' });
        await settle();
        expect(audits.find((x) => x.event === 'backoffice.alerts.mute')).toMatchObject({ sub: 'adm1', surface: 'backoffice', actorType: 'platform', meta: { ruleId: 'R1', hours: 6, reason: 'planlı bakım çalışması' } });
        await a.mute({ sub: 'adm1' }, { ruleId: 'R1', scopeKey: 'trendyol:7', hours: 0, reason: 'susturma kaldırıldı ok' });
        expect(m.docs[0].mutedUntil).toBeUndefined();
        await expect(a.mute({ sub: 'adm1' }, { ruleId: 'R4', scopeKey: 'order-sync-queue', hours: 1, reason: 'çözülmüş olan' })).rejects.toMatchObject({ statusCode: 404, code: 'ALERT_NOT_FOUND' });
        await expect(a.mute({ sub: 'adm1' }, { ruleId: 'R1', scopeKey: 'trendyol:7', hours: 337, reason: 'çok uzun süre' })).rejects.toMatchObject({ statusCode: 400 });
    });
});

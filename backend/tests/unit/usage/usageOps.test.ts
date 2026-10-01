// MOB-08 / K55: kullanım okumaları -- masaüstü/mobil kırılımı, tekil sayım, süzgeç, hesaplanamadı, giriş kırılımı (eski kayıt = unknown).
import { describe, it, expect } from '@jest/globals';
import { FakeModel } from '../../helpers/fakeEngineDb';
import { pulseActiveUsers, tenantUsage, dayKeysBack } from '../../../src/operations/backoffice/usageOps';
import { PulseOps } from '../../../src/api/admin/pulseOps';

const NOW = Date.parse('2026-10-01T09:00:00Z');   // İstanbul 12:00
const doc = (day: string, tid: number, platform: string, u: string[]) => ({ day, tid, platform, u });

const USAGE = [
    doc('2026-10-01', 7, 'desktop_web', ['a', 'b']),
    doc('2026-10-01', 7, 'android_app', ['a']),            // a iki sınıfta: toplamda 1
    doc('2026-10-01', 9, 'mobile_web', ['a']),             // farklı tenant'ta aynı takma → ayrı kullanıcı
    doc('2026-09-28', 7, 'pwa', ['c']),
    doc('2026-09-20', 7, 'electron', ['d']),               // 7 g dışında, 30 g içinde
    doc('2026-08-01', 7, 'desktop_web', ['e']),            // 30 g dışında (sorgu dışı)
];

describe('pulseActiveUsers', () => {
    it('bugün / 7 g / 30 g tekil kullanıcı + müşteri; 7 g sınıf ve alt tür kırılımı; mobil pay', async () => {
        const r = await pulseActiveUsers({ usageModel: new FakeModel(USAGE), now: () => NOW });
        expect(r.computable).toBe(true);
        expect(r.today).toEqual({ users: 3, tenants: 2 });
        expect(r.last7d).toEqual({ users: 4, tenants: 2 });
        expect(r.last30d).toEqual({ users: 5, tenants: 2 });
        expect(r.byClass).toEqual({ desktop: 2, mobile: 3, unknown: 0 });
        expect(r.byPlatform).toEqual({ desktop_web: 2, electron: 0, mobile_web: 1, pwa: 1, android_app: 1, unknown: 0 });
        expect(r.mobileShare).toBe(0.75);   // 3 mobil / 4 sınıfı bilinen
        expect(r.daily).toHaveLength(14);
        expect(r.daily[13]).toEqual({ day: '2026-10-01', desktop: 2, mobile: 2, unknown: 0 });
        expect(JSON.stringify(r)).not.toMatch(/"a"|"b"/);   // takma kimlik yanıtta yok
    });

    it('platform süzgeci: mobile → yalnız mobil alt türler okunur', async () => {
        const m = new FakeModel(USAGE);
        const r = await pulseActiveUsers({ usageModel: m, now: () => NOW }, 'mobile');
        expect(m.calls[0]!.arg.platform).toEqual({ $in: ['mobile_web', 'pwa', 'android_app'] });
        expect(r.platform).toBe('mobile');
        expect(r.byClass).toEqual({ desktop: 0, mobile: 3, unknown: 0 });
    });

    it('veri yoksa hesaplanamadı (uydurma 0 yok)', async () => {
        const r = await pulseActiveUsers({ usageModel: new FakeModel([]), now: () => NOW });
        expect(r).toMatchObject({ computable: false, today: null, last7d: null, byClass: null, daily: [], note: 'hesaplanamadı' });
    });

    it('getPulse activeUsers bloğu: okuma hatasında yalnız o blok degraded', async () => {
        const ok = new FakeModel(); const usage = new FakeModel(USAGE); usage.failWith = new Error('x');
        const p = new PulseOps({ clientModel: ok, metricRollupModel: ok, callMetricModel: ok, usageModel: usage, revenue: async () => ({}), now: () => NOW });
        const r = await p.getPulse();
        expect(r.activeUsers).toEqual({ status: 'degraded', error: 'error' });
        expect(r.tenants.status).toBe('ok');
    });
});

describe('tenantUsage', () => {
    const audit = (rows: any[]) => { const m = new FakeModel(); m.aggregateResult = rows; return m; };
    it('aralıkta tekil kullanıcı, sınıf/alt tür, günlük seri, son aktif gün; girişler (platformsuz eski kayıt → unknown)', async () => {
        const a = audit([{ _id: 'android_app', n: 4 }, { _id: 'desktop_web', n: 6 }, { _id: null, n: 3 }]);
        const r = await tenantUsage({ usageModel: new FakeModel(USAGE), auditModel: a, now: () => NOW }, 7, 7);
        expect(r).toMatchObject({ tid: 7, days: 7, platform: null, from: '2026-09-25', to: '2026-10-01' });
        expect(r.activeUsers).toMatchObject({ computable: true, users: 3, byClass: { desktop: 2, mobile: 2, unknown: 0 }, lastActiveDay: '2026-10-01' });
        expect(r.activeUsers.daily).toHaveLength(7);
        expect(r.logins).toEqual({
            computable: true, total: 13, byClass: { desktop: 6, mobile: 4, unknown: 3 },
            byPlatform: { desktop_web: 6, electron: 0, mobile_web: 0, pwa: 0, android_app: 4, unknown: 3 },
        });
        const match = (a.calls[0]!.arg as any[])[0].$match;
        expect(match).toMatchObject({ tid: 7, event: 'login', result: 'ok' });
        expect(match.platform).toBeUndefined();
    });

    it('süzgeç girişlere de uygulanır; unknown süzgeci alanı olmayan eski kayıtları da kapsar', async () => {
        const a = audit([]);
        await tenantUsage({ usageModel: new FakeModel(USAGE), auditModel: a, now: () => NOW }, 7, 30, 'unknown');
        expect((a.calls[0]!.arg as any[])[0].$match.platform).toEqual({ $in: ['unknown', null] });
        const b = audit([]);
        await tenantUsage({ usageModel: new FakeModel(USAGE), auditModel: b, now: () => NOW }, 7, 30, 'desktop');
        expect((b.calls[0]!.arg as any[])[0].$match.platform).toEqual({ $in: ['desktop_web', 'electron'] });
    });

    it('kullanım verisi yoksa aktif kullanıcı hesaplanamadı; girişler yine döner', async () => {
        const r = await tenantUsage({ usageModel: new FakeModel([]), auditModel: audit([]), now: () => NOW }, 42, 30);
        expect(r.activeUsers).toMatchObject({ computable: false, users: null, note: 'hesaplanamadı' });
        expect(r.logins.total).toBe(0);
    });

    it('dayKeysBack: eskiden yeniye, bugün dahil', () => {
        expect(dayKeysBack(new Date(NOW), 3)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    });
});

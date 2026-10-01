// MOB-08 / K55: günlük aktif kullanım kaydı -- tekilleştirme, takma kimlik, fail-open, kim sayılmaz.
import { describe, it, expect, afterEach } from '@jest/globals';
import { UsageRecorder, pseudonymOf } from '../../../src/operations/usage/usageRecorder';
import { recordUsageActivity, setUsageRecorderForTests } from '@api/usageActivity';
import { AuditLogger } from '@services/audit/AuditLogger';
import { withTestContext } from '@platform/core/context';

class UpsertModel {
    docs: any[] = [];
    calls = 0;
    fail = false;
    async updateOne(f: any, u: any, opts: any) {
        this.calls++;
        if (this.fail) throw new Error('mongo kapalı');
        let d = this.docs.find((x) => x.day === f.day && x.tid === f.tid && x.platform === f.platform);
        if (!d) { if (!opts?.upsert) return; d = { ...f, u: [], ...u.$setOnInsert }; this.docs.push(d); }
        if (!d.u.includes(u.$addToSet.u)) d.u.push(u.$addToSet.u);
    }
}

const at = (iso: string) => () => new Date(iso);

describe('UsageRecorder', () => {
    it('aynı gün/tenant/platform/kullanıcı için tek upsert; takma kimlik ham sub içermez; gün Europe/Istanbul', async () => {
        const m = new UpsertModel();
        const r = new UsageRecorder({ model: async () => m, now: at('2026-09-30T22:30:00Z') });   // İstanbul'da 1 Ekim 01:30
        await r.record({ tid: 7, sub: 'user-abc', platform: 'android_app' });
        await r.record({ tid: 7, sub: 'user-abc', platform: 'android_app' });
        await r.record({ tid: 7, sub: 'user-xyz', platform: 'android_app' });
        await r.record({ tid: 7, sub: 'user-abc', platform: 'desktop_web' });
        expect(m.calls).toBe(3);
        const doc = m.docs.find((d) => d.platform === 'android_app');
        expect(doc.day).toBe('2026-10-01');
        expect(doc.u).toEqual([pseudonymOf('user-abc'), pseudonymOf('user-xyz')]);
        expect(JSON.stringify(m.docs)).not.toContain('user-abc');
        expect(pseudonymOf('user-abc')).toMatch(/^[0-9a-f]{16}$/);
        expect(doc.expAt).toBeInstanceOf(Date);
    });

    it('gün değişince tekilleştirme sıfırlanır', async () => {
        const m = new UpsertModel();
        let now = new Date('2026-10-01T10:00:00Z');
        const r = new UsageRecorder({ model: async () => m, now: () => now });
        await r.record({ tid: 7, sub: 'a', platform: 'pwa' });
        now = new Date('2026-10-02T10:00:00Z');
        await r.record({ tid: 7, sub: 'a', platform: 'pwa' });
        expect(m.docs.map((d) => d.day)).toEqual(['2026-10-01', '2026-10-02']);
    });

    it('fail-open: hata fırlatmaz/reddetmez; sonraki istekte yeniden dener', async () => {
        const m = new UpsertModel(); m.fail = true;
        const r = new UsageRecorder({ model: async () => m, now: at('2026-10-01T10:00:00Z') });
        await expect(r.record({ tid: 7, sub: 'a', platform: 'mobile_web' })).resolves.toBeUndefined();
        m.fail = false;
        await r.record({ tid: 7, sub: 'a', platform: 'mobile_web' });
        expect(m.calls).toBe(2);
        expect(m.docs).toHaveLength(1);
    });

    it('geçersiz girdi yazılmaz (tid/sub/platform)', async () => {
        const m = new UpsertModel();
        const r = new UsageRecorder({ model: async () => m });
        await r.record({ tid: 0, sub: 'a', platform: 'pwa' });
        await r.record({ tid: 7, sub: '', platform: 'pwa' });
        await r.record({ tid: 7, sub: 'a', platform: 'tablet' as any });
        expect(m.calls).toBe(0);
    });
});

describe('recordUsageActivity (müşteri yüzeyi)', () => {
    afterEach(() => setUsageRecorderForTests(undefined));
    it('yalnız tenant\'lı, impersonation olmayan, platform yöneticisi olmayan oturum sayılır', async () => {
        const m = new UpsertModel();
        setUsageRecorderForTests(new UsageRecorder({ model: async () => m, now: at('2026-10-01T10:00:00Z') }));
        recordUsageActivity({ sub: 'u1', tid: 7, imp: false, ga: false }, 'pwa');
        recordUsageActivity({ sub: 'u2', tid: 7, imp: true, ga: true }, 'pwa');      // destek oturumu
        recordUsageActivity({ sub: 'u3', tid: 7, imp: false, ga: true }, 'pwa');     // platform yöneticisi
        recordUsageActivity({ sub: 'u4', imp: false, ga: false }, 'pwa');            // mağaza seçilmemiş
        recordUsageActivity({ sub: 'u5', tid: 7, imp: false, ga: false }, 'ios');   // geçersiz platform
        recordUsageActivity(undefined, 'pwa');
        await new Promise((r) => setImmediate(r));
        expect(m.calls).toBe(1);
        expect(m.docs[0].u).toEqual([pseudonymOf('u1')]);
    });
});

describe('AuditLogger platform alanı', () => {
    afterEach(() => AuditLogger.setSink(undefined));
    it('istek bağlamındaki platform kayda girer; bağlam yoksa alan yazılmaz; açıkça verilen kazanır', async () => {
        const out: any[] = [];
        AuditLogger.setSink(async (r) => { out.push(r); });
        await withTestContext({ clientPlatform: 'android_app' }, () => AuditLogger.log({ event: 'login', result: 'ok', sub: 's', tid: 7 }));
        await AuditLogger.log({ event: 'system.job', result: 'ok' });
        await withTestContext({ clientPlatform: 'pwa' }, () => AuditLogger.log({ event: 'login', result: 'ok', platform: 'electron' }));
        expect(out.map((r) => r.platform)).toEqual(['android_app', undefined, 'electron']);
        expect(Object.keys(out[1])).not.toContain('platform');
    });
});

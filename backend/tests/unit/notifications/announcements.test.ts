// ADR-0029 NB7: duyuru saf mantığı (normalleştirme, durum geçişleri, görünürlük, hedef çözümü) + fan-out işi (sahte model/notify). DB/Redis/ağ YOK.
import { describe, it, expect, jest } from '@jest/globals';
import {
    normalizeAnnouncement, scheduleDecision, assertEditable, assertCancellable, visibleTo, toTenantDto, sortBySeverity, iterateTargetTenants, runAnnouncementFanout,
    type AnnouncementDoc, type AnnouncementInput, type TargetPorts,
} from '../../../src/operations/notifications/announcements';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

const NOW = new Date('2026-10-01T10:00:00Z');
const base = (over: Partial<AnnouncementInput> = {}): AnnouncementInput => ({
    kind: 'info', title: { tr: 'Başlık' }, body: { tr: 'Gövde' }, target: { mode: 'all' }, channels: { banner: true, inApp: false, email: false },
    startsAt: '2026-10-01T09:00:00Z', ...over,
});
const doc = (over: Partial<AnnouncementDoc> = {}): AnnouncementDoc => ({ ...normalizeAnnouncement(base()), status: 'active', _id: 'A1', ...over } as AnnouncementDoc);

describe('normalizeAnnouncement', () => {
    it('TR zorunlu, EN isteğe bağlı; önem türden türetilir; maintenance/incident kapatılamaz', () => {
        expect(() => normalizeAnnouncement(base({ title: { tr: '  ' } }))).toThrow(/title\.tr/);
        const m = normalizeAnnouncement(base({ kind: 'maintenance', dismissible: true }));
        expect(m).toMatchObject({ severity: 'warning', dismissible: false });
        expect(normalizeAnnouncement(base({ kind: 'incident' }))).toMatchObject({ severity: 'critical', dismissible: false });
        expect(normalizeAnnouncement(base({ kind: 'release', dismissible: false }))).toMatchObject({ severity: 'info', dismissible: false });
        expect(normalizeAnnouncement(base({ title: { tr: 'a', en: ' ' } })).title).toEqual({ tr: 'a' });
    });
    it('hedef tutarlılığı: plans/tenants boş olamaz; yinelenenler tekilleşir', () => {
        expect(() => normalizeAnnouncement(base({ target: { mode: 'plans', planCodes: [] } }))).toThrow(/planCodes/);
        expect(() => normalizeAnnouncement(base({ target: { mode: 'tenants' } }))).toThrow(/tids/);
        expect(normalizeAnnouncement(base({ target: { mode: 'tenants', tids: [7, 7, 9] } })).target).toEqual({ mode: 'tenants', tids: [7, 9] });
        expect(normalizeAnnouncement(base({ target: { mode: 'all', tids: [1] } })).target).toEqual({ mode: 'all' });
    });
    it('kanal kuralları: en az bir kanal; e-posta uygulama içi olmadan olmaz; bitiş başlangıçtan sonra', () => {
        expect(() => normalizeAnnouncement(base({ channels: { banner: false, inApp: false, email: false } }))).toThrow(/kanal/);
        expect(() => normalizeAnnouncement(base({ channels: { banner: true, inApp: false, email: true } }))).toThrow(/uygulama içi/);
        expect(() => normalizeAnnouncement(base({ endsAt: '2026-10-01T08:00:00Z' }))).toThrow(/endsAt/);
        expect(() => normalizeAnnouncement(base({ startsAt: 'yarın' }))).toThrow(/startsAt/);
    });
});

describe('durum geçişleri', () => {
    it('yalnız taslak düzenlenir/zamanlanır; geçmiş başlangıç doğrudan active; gelecek scheduled', () => {
        expect(() => assertEditable({ status: 'active' })).toThrow(expect.objectContaining({ statusCode: 409, code: 'ANNOUNCEMENT_STATE' }));
        expect(scheduleDecision(doc({ status: 'draft' }), false, NOW)).toBe('active');
        expect(scheduleDecision(doc({ status: 'draft', startsAt: new Date('2026-10-02T00:00:00Z') }), false, NOW)).toBe('scheduled');
        expect(() => scheduleDecision(doc({ status: 'scheduled' }), false, NOW)).toThrow(expect.objectContaining({ code: 'ANNOUNCEMENT_STATE' }));
        expect(() => scheduleDecision(doc({ status: 'draft', endsAt: new Date('2026-10-01T09:30:00Z') }), false, NOW)).toThrow(/geçmişte/);
    });
    it('e-posta kanalı: hizmet duyurusu onayı olmadan zamanlanamaz (S5)', () => {
        const d = doc({ status: 'draft', channels: { banner: true, inApp: true, email: true } });
        expect(() => scheduleDecision(d, false, NOW)).toThrow(/onay/);
        expect(scheduleDecision(d, true, NOW)).toBe('active');
    });
    it('iptal: sona ermiş/iptal edilmiş iptal edilemez', () => {
        expect(() => assertCancellable({ status: 'ended' })).toThrow(expect.objectContaining({ statusCode: 409 }));
        expect(() => assertCancellable({ status: 'cancelled' })).toThrow();
        expect(() => assertCancellable({ status: 'active' })).not.toThrow();
    });
});

describe('tenant görünürlüğü', () => {
    const v = { tid: 7, planCode: 'pro', tier: 'member' as const };
    it('pencere: başlamamış/bitmiş görünmez; scheduled pencere içindeyse görünür (banner işe bağlı değil)', () => {
        expect(visibleTo(doc(), v, NOW)).toBe(true);
        expect(visibleTo(doc({ startsAt: new Date('2026-10-01T11:00:00Z') }), v, NOW)).toBe(false);
        expect(visibleTo(doc({ endsAt: new Date('2026-10-01T09:59:00Z') }), v, NOW)).toBe(false);
        expect(visibleTo(doc({ status: 'scheduled' }), v, NOW)).toBe(true);
        for (const status of ['draft', 'ended', 'cancelled'] as const) expect(visibleTo(doc({ status }), v, NOW)).toBe(false);
    });
    it('hedef: tümü / plan / tenant listesi; banner kapalıysa görünmez', () => {
        expect(visibleTo(doc({ target: { mode: 'plans', planCodes: ['pro'] } }), v, NOW)).toBe(true);
        expect(visibleTo(doc({ target: { mode: 'plans', planCodes: ['free'] } }), v, NOW)).toBe(false);
        expect(visibleTo(doc({ target: { mode: 'plans', planCodes: ['pro'] } }), { ...v, planCode: null }, NOW)).toBe(false);
        expect(visibleTo(doc({ target: { mode: 'tenants', tids: [7, 8] } }), v, NOW)).toBe(true);
        expect(visibleTo(doc({ target: { mode: 'tenants', tids: [8] } }), v, NOW)).toBe(false);
        expect(visibleTo(doc({ channels: { banner: false, inApp: true, email: false } }), v, NOW)).toBe(false);
    });
    it('kitle: owners_admins yalnız yönetici/sahip kademesine görünür', () => {
        const d = doc({ audience: 'owners_admins' });
        expect(visibleTo(d, v, NOW)).toBe(false);
        expect(visibleTo(d, { ...v, tier: 'admin' }, NOW)).toBe(true);
        expect(visibleTo(d, { ...v, tier: 'owner' }, NOW)).toBe(true);
    });
    it('DTO yalnız görünüm alanları taşır; sıralama: önem sonra yenilik', () => {
        const dto = toTenantDto(doc({ target: { mode: 'tenants', tids: [7] }, createdBy: 'admin-1' }));
        expect(Object.keys(dto).sort()).toEqual(['body', 'dismissible', 'endsAt', 'id', 'kind', 'severity', 'startsAt', 'title']);
        const sorted = sortBySeverity([
            { severity: 'info' as const, startsAt: new Date('2026-10-01T09:00:00Z'), n: 1 }, { severity: 'critical' as const, startsAt: new Date('2026-09-01T00:00:00Z'), n: 2 },
            { severity: 'info' as const, startsAt: new Date('2026-10-01T09:30:00Z'), n: 3 },
        ]);
        expect(sorted.map((x) => x.n)).toEqual([2, 3, 1]);
    });
});

describe('hedef çözümü (iterateTargetTenants)', () => {
    const ports = (): TargetPorts & { calls: string[] } => {
        const all = [1, 2, 3, 4, 5];
        const calls: string[] = [];
        return {
            calls,
            async listActiveTenantIds(after, limit) { calls.push(`all:${after}`); return all.filter((t) => t > after).slice(0, limit); },
            async listTenantIdsByPlans(plans, after, limit) { calls.push(`plans:${plans.join('|')}:${after}`); return all.filter((t) => t % 2 === 1 && t > after).slice(0, limit); },
        };
    };
    const collect = async (t: AnnouncementDoc['target'], p: TargetPorts, size = 2) => { const o: number[] = []; for await (const x of iterateTargetTenants(t, p, size)) o.push(x); return o; };
    it('all: sayfalı; plans: plan kodlarıyla; tenants: doğrudan (sıralı)', async () => {
        const p = ports();
        expect(await collect({ mode: 'all' }, p)).toEqual([1, 2, 3, 4, 5]);
        expect(await collect({ mode: 'plans', planCodes: ['pro', 'team'] }, p)).toEqual([1, 3, 5]);
        expect(p.calls.some((c) => c.startsWith('plans:pro|team'))).toBe(true);
        expect(await collect({ mode: 'tenants', tids: [9, 3] }, p)).toEqual([3, 9]);
    });
});

describe('runAnnouncementFanout', () => {
    const PORTS: TargetPorts = { listActiveTenantIds: async (after, limit) => [1, 2, 3].filter((t) => t > after).slice(0, limit), listTenantIdsByPlans: async () => [2] };
    const mk = (over: Partial<AnnouncementDoc> = {}, seedExtra: any[] = []) => new FakeNotifyModel([{ ...doc({ channels: { banner: true, inApp: true, email: false } }), _id: 'A1', ...over }, ...seedExtra]);
    const deps = (model: FakeNotifyModel, extra: Record<string, unknown> = {}) => {
        const notify = jest.fn(async (..._a: any[]) => ({ status: 'created' as const }));
        return { notify, d: { model: model as any, ports: PORTS, notify: notify as any, flags: () => ({ v2Enabled: true }), now: () => NOW, ...extra } };
    };

    it('bayrak kapalı: hiçbir koleksiyona dokunmaz, bildirim üretmez', async () => {
        const m = mk({ status: 'scheduled' });
        const updateMany = jest.spyOn(m, 'updateMany');
        const { notify, d } = deps(m, { flags: () => ({ v2Enabled: false }) });
        expect(await runAnnouncementFanout(d)).toMatchObject({ skipped: 'notify_disabled', notified: 0 });
        expect(updateMany).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
        expect(m.docs[0].status).toBe('scheduled');
    });

    it('zamanı gelen scheduled -> active; süresi dolan active -> ended; dağıtım tamamlanınca doneAt yazılır ve ikinci tur tekrar göndermez', async () => {
        const m = mk({ status: 'scheduled', startsAt: new Date('2026-10-01T09:00:00Z') }, [{ ...doc({ endsAt: new Date('2026-10-01T09:30:00Z') }), _id: 'A2' }]);
        const { notify, d } = deps(m);
        const r = await runAnnouncementFanout(d);
        expect(r).toMatchObject({ activated: 1, ended: 1, fannedOut: 1, notified: 3 });
        expect(m.docs.find((x) => x._id === 'A1')).toMatchObject({ status: 'active', fanout: { tenants: 3, notified: 3 } });
        expect(m.docs.find((x) => x._id === 'A1')!.fanout.doneAt).toEqual(NOW);
        expect(m.docs.find((x) => x._id === 'A2')!.status).toBe('ended');
        expect(notify).toHaveBeenCalledTimes(3);
        expect(notify.mock.calls[0]).toEqual(['SYSTEM_ANNOUNCEMENT', 1, expect.objectContaining({ announcementId: 'A1', kind: 'info', title: 'Başlık', summary: 'Gövde' }), expect.objectContaining({ module: 'announcements', email: false })]);
        await runAnnouncementFanout(d);
        expect(notify).toHaveBeenCalledTimes(3);
    });

    it('yalnız banner kanallı duyuru dağıtılmaz; e-posta kanalı notify\'a iletilir; owners_admins minTier:admin ile', async () => {
        const banner = mk({ channels: { banner: true, inApp: false, email: false } });
        const b = deps(banner);
        expect(await runAnnouncementFanout(b.d)).toMatchObject({ fannedOut: 0, notified: 0 });
        expect(b.notify).not.toHaveBeenCalled();

        const mail = mk({ channels: { banner: true, inApp: true, email: true }, audience: 'owners_admins', target: { mode: 'plans', planCodes: ['pro'] }, title: { tr: 'T', en: 'E' } });
        const e = deps(mail);
        await runAnnouncementFanout(e.d);
        expect(e.notify).toHaveBeenCalledTimes(1);
        expect(e.notify.mock.calls[0][1]).toBe(2);
        expect(e.notify.mock.calls[0][2]).toMatchObject({ titleEn: 'E' });
        expect(e.notify.mock.calls[0][3]).toMatchObject({ email: true, minTier: 'admin' });
    });

    it('kira: başka bir tur talep ettiyse atlanır; kira süresi dolunca devam eder; bütçe aşımında doneAt yazılmaz', async () => {
        const fresh = mk({ fanout: { claimedAt: new Date(NOW.getTime() - 60_000) } as any });
        const f = deps(fresh);
        await runAnnouncementFanout(f.d);
        expect(f.notify).not.toHaveBeenCalled();

        const stale = mk({ fanout: { claimedAt: new Date(NOW.getTime() - 11 * 60_000) } as any });
        const s = deps(stale, { maxTenantsPerRun: 2 });
        const r = await runAnnouncementFanout(s.d);
        expect(s.notify).toHaveBeenCalledTimes(2);
        expect(r.fannedOut).toBe(0);
        expect(stale.docs[0].fanout.doneAt).toBeUndefined();
    });

    it('notify hatası/duplicate sayacı etkilemez; iptal edilmiş duyuru dağıtılmaz', async () => {
        const m = mk();
        const { notify, d } = deps(m);
        notify.mockResolvedValueOnce({ status: 'duplicate' as any }).mockResolvedValueOnce({ status: 'failed' as any });
        expect(await runAnnouncementFanout(d)).toMatchObject({ notified: 1, fannedOut: 1 });
        const c = deps(mk({ status: 'cancelled' }));
        await runAnnouncementFanout(c.d);
        expect(c.notify).not.toHaveBeenCalled();
    });
});

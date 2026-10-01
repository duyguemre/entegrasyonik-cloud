// ADR-0029 NB7/NB8: yetenek kaydı, girdi şemaları, step-up, LIVE_READONLY uyumu, servis kablolaması ve tenant duyuru bandı (getActive). DB/Redis/SMTP YOK.
import { describe, it, expect, jest } from '@jest/globals';

// Gerçek Mongo/Redis ping'i YOK (servis modülleri zincirleme yüklenir).
jest.mock('../../../../src/health/HealthCheck', () => ({ checkReadiness: jest.fn(async () => ({ ready: true, mongo: 'ok', redis: 'ok' })) }));

import { BACKOFFICE_NOTIFICATIONS_RPC_INPUT, announcementInput } from '../../../../src/capabilities/rpc-input/backoffice-notifications';
import { CAPABILITY_BY_RPC } from '../../../../src/capabilities';
import { getRequiredTier } from '../../../../src/api/rpc/operationPolicy';
import { requiresStepUp, isSensitiveRead } from '../../../../src/api/admin/stepUp';
import { isLiveReadonlyBlockedRpc } from '../../../../src/api/rpc/liveReadonlyRpcGuard';
import services from '../../../../src/api/rpc';
import AnnouncementService from '../../../../src/api/rpc/handlers/announcement-service';
import { FakeNotifyModel } from '../../../helpers/fakeNotifyDb';

const RPCS = Object.keys(BACKOFFICE_NOTIFICATIONS_RPC_INPUT);
const split = (rpc: string) => rpc.split('/') as [string, string];
const BO = RPCS.filter((r) => r.startsWith('BackofficeNotificationService/'));
const S = BACKOFFICE_NOTIFICATIONS_RPC_INPUT as any;
const OID = 'a'.repeat(24);

describe('yetenek kaydı', () => {
    it('18 uç (17 backoffice + 1 tenant): kayıtlı, şemalı, serviste metot olarak var; backoffice uçları platformAdmin, getActive member', () => {
        expect(RPCS).toHaveLength(18);
        expect(BO).toHaveLength(17);
        for (const rpc of RPCS) {
            const [s, o] = split(rpc);
            expect(CAPABILITY_BY_RPC.get(rpc)).toBeDefined();
            expect(typeof (services as any)[s]?.prototype?.[o]).toBe('function');
        }
        for (const rpc of BO) { const [s, o] = split(rpc); expect(getRequiredTier(s, o)).toBe('platformAdmin'); }
        expect(getRequiredTier('AnnouncementService', 'getActive')).toBe('member');
        expect(CAPABILITY_BY_RPC.get('AnnouncementService/getActive')).toMatchObject({ effect: 'read', permission: 'app:use' });
    });
    it('step-up + gerekçe: tüm yazan uçlar; okumalar istenmez', () => {
        const writes = ['createAnnouncement', 'updateAnnouncement', 'scheduleAnnouncement', 'cancelAnnouncement', 'retryDelivery', 'discardDelivery', 'sendTestEmail', 'muteAlert'];
        for (const w of writes) expect(requiresStepUp(`BackofficeNotificationService/${w}`)).toBe(true);
        for (const r of BO.filter((x) => !writes.some((w) => x.endsWith('/' + w)))) expect(requiresStepUp(r)).toBe(false);
        expect(requiresStepUp('AnnouncementService/getActive')).toBe(false);
    });
    it('etki: iptal/at destructive; retry/zamanla/test e-postası dış etkili yazma (external); okumalar read', () => {
        expect(CAPABILITY_BY_RPC.get('BackofficeNotificationService/cancelAnnouncement')?.effect).toBe('destructive');
        expect(CAPABILITY_BY_RPC.get('BackofficeNotificationService/discardDelivery')?.effect).toBe('destructive');
        for (const w of ['retryDelivery', 'scheduleAnnouncement', 'sendTestEmail']) expect(CAPABILITY_BY_RPC.get(`BackofficeNotificationService/${w}`)).toMatchObject({ effect: 'write', external: true });
        for (const r of ['listAnnouncements', 'getAnnouncement', 'previewAnnouncement', 'getDeliveryStats', 'listDeliveries', 'getTenantHistory', 'getCatalog', 'previewTemplate', 'listAlerts']) expect(CAPABILITY_BY_RPC.get(`BackofficeNotificationService/${r}`)?.effect).toBe('read');
    });
    it('tenant geçmişi maskeli PII yeteneği: hassas okuma denetimi (backoffice.sensitive_read)', () => {
        expect(CAPABILITY_BY_RPC.get('BackofficeNotificationService/getTenantHistory')?.pii).toBe('masked');
        expect(isSensitiveRead('BackofficeNotificationService/getTenantHistory')).toBe(true);
        expect(isSensitiveRead('BackofficeNotificationService/getCatalog')).toBe(false);
    });
    it('LIVE_READONLY: dış etkili üç uç reddedilir; yerel yazmalar ve okumalar serbest', () => {
        for (const w of ['retryDelivery', 'scheduleAnnouncement', 'sendTestEmail']) expect(isLiveReadonlyBlockedRpc('BackofficeNotificationService', w)).toBe(true);
        for (const w of ['createAnnouncement', 'updateAnnouncement', 'cancelAnnouncement', 'discardDelivery', 'muteAlert', 'listAlerts', 'getCatalog']) expect(isLiveReadonlyBlockedRpc('BackofficeNotificationService', w)).toBe(false);
        expect(isLiveReadonlyBlockedRpc('AnnouncementService', 'getActive')).toBe(false);
    });
});

describe('girdi şemaları', () => {
    const ann = { kind: 'info', title: { tr: 'T' }, body: { tr: 'B' }, target: { mode: 'all' }, channels: { banner: true, inApp: false, email: false }, startsAt: '2026-10-02T09:00:00Z' };
    it('duyuru: bilinmeyen alan (iç içe dahil), boş metin, aşırı uzun metin, plan/tenant sınırları reddedilir', () => {
        expect(announcementInput.safeParse(ann).success).toBe(true);
        expect(announcementInput.safeParse({ ...ann, createdBy: 'x' }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, status: 'active' }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, target: { mode: 'all', tids: [1] , extra: 1 } }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, title: { tr: '' } }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, title: { tr: 'x'.repeat(161) } }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, body: { tr: 'x'.repeat(2001) } }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, target: { mode: 'plans', planCodes: ['a b'] } }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, target: { mode: 'tenants', tids: [-1] } }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, channels: { banner: true } }).success).toBe(false);
        expect(announcementInput.safeParse({ ...ann, kind: 'promo' }).success).toBe(false);
    });
    it('uçlar: bilinmeyen alan, operatör nesnesi, limit>200, bozuk kimlik/kod reddedilir', () => {
        expect(S['BackofficeNotificationService/createAnnouncement'].safeParse({ announcement: ann, reason: 'x'.repeat(10) }).success).toBe(true);
        expect(S['BackofficeNotificationService/createAnnouncement'].safeParse({ announcement: ann }).success).toBe(false);
        expect(S['BackofficeNotificationService/scheduleAnnouncement'].safeParse({ id: OID, emailConsent: true, reason: 'gerekçe var' }).success).toBe(true);
        expect(S['BackofficeNotificationService/scheduleAnnouncement'].safeParse({ id: { $ne: null }, reason: 'gerekçe var' }).success).toBe(false);
        expect(S['BackofficeNotificationService/getAnnouncement'].safeParse({ id: 'kısa' }).success).toBe(false);
        expect(S['BackofficeNotificationService/listDeliveries'].safeParse({ limit: 200, status: 'dead', channel: 'email', code: 'ORDER_SYNC_FAILED' }).success).toBe(true);
        expect(S['BackofficeNotificationService/listDeliveries'].safeParse({ limit: 201 }).success).toBe(false);
        expect(S['BackofficeNotificationService/listDeliveries'].safeParse({ status: 'bilinmiyor' }).success).toBe(false);
        expect(S['BackofficeNotificationService/listDeliveries'].safeParse({ tid: { $gt: 0 } }).success).toBe(false);
        expect(S['BackofficeNotificationService/listDeliveries'].safeParse({ code: 'küçük_harf' }).success).toBe(false);
        expect(S['BackofficeNotificationService/retryDelivery'].safeParse({ id: OID, tid: 7, reason: 'gerekçe var' }).success).toBe(true);
        expect(S['BackofficeNotificationService/getTenantHistory'].safeParse({ tid: 7, limit: 50 }).success).toBe(true);
        expect(S['BackofficeNotificationService/getTenantHistory'].safeParse({}).success).toBe(false);
        expect(S['BackofficeNotificationService/previewTemplate'].safeParse({ code: 'SYSTEM_ANNOUNCEMENT', locale: 'tr', channel: 'email', params: { a: 'b', n: 1 } }).success).toBe(true);
        expect(S['BackofficeNotificationService/previewTemplate'].safeParse({ code: 'SYSTEM_ANNOUNCEMENT', locale: 'de', channel: 'email' }).success).toBe(false);
        expect(S['BackofficeNotificationService/previewTemplate'].safeParse({ code: 'SYSTEM_ANNOUNCEMENT', locale: 'tr', channel: 'email', params: { o: { $x: 1 } } }).success).toBe(false);
        expect(S['BackofficeNotificationService/muteAlert'].safeParse({ ruleId: 'R1', scopeKey: 'trendyol:7', hours: 6, reason: 'gerekçe var' }).success).toBe(true);
        expect(S['BackofficeNotificationService/muteAlert'].safeParse({ ruleId: 'R1', scopeKey: 'k', hours: 337, reason: 'gerekçe var' }).success).toBe(false);
        expect(S['BackofficeNotificationService/muteAlert'].safeParse({ ruleId: 'x', scopeKey: 'k', hours: 1, reason: 'gerekçe var' }).success).toBe(false);
        expect(S['BackofficeNotificationService/listAlerts'].safeParse({ status: 'firing', level: 'critical', ruleId: 'R7' }).success).toBe(true);
        expect(S['AnnouncementService/getActive'].safeParse({}).success).toBe(true);
        expect(S['AnnouncementService/getActive'].safeParse({ tid: 1 }).success).toBe(false);
    });
});

describe('AnnouncementService/getActive (tenant duyuru bandı)', () => {
    const NOW = Date.now();
    const ann = (over: Record<string, unknown>) => ({
        kind: 'info', severity: 'info', title: { tr: 'T' }, body: { tr: 'B' }, target: { mode: 'all' }, audience: 'all_members', channels: { banner: true, inApp: false, email: false },
        startsAt: new Date(NOW - 3600_000), endsAt: null, dismissible: true, status: 'active', createdBy: 'adm-secret', fanout: { tenants: 9 }, ...over,
    });
    function svc(docs: any[], opts: { tier?: string; clientId?: number; plan?: string | null } = {}) {
        const announcements = new FakeNotifyModel(docs);
        const subs = new FakeNotifyModel(opts.plan === null ? [] : [{ clientId: opts.clientId ?? 7, planCode: opts.plan ?? 'pro' }]);
        const s: any = new (AnnouncementService as any)(opts.clientId ?? 7, { ctx: { actor: { tier: opts.tier ?? 'member' } } });
        s.applicationDB = { getAnnouncementModel: () => announcements, getSubscriptionModel: () => subs };
        return { s, announcements, subs };
    }
    it('görünürlük (pencere/durum/kanal/hedef/kitle) uygulanır; yanıt yalnız görünüm alanları taşır; önem sırasına göre', async () => {
        const { s } = svc([
            ann({ title: { tr: 'bilgi' } }),
            ann({ title: { tr: 'kritik' }, kind: 'incident', severity: 'critical', dismissible: false }),
            ann({ title: { tr: 'gelecekte' }, startsAt: new Date(NOW + 3600_000) }),
            ann({ title: { tr: 'bitmiş' }, endsAt: new Date(NOW - 1000) }),
            ann({ title: { tr: 'taslak' }, status: 'draft' }),
            ann({ title: { tr: 'iptal' }, status: 'cancelled' }),
            ann({ title: { tr: 'bantsız' }, channels: { banner: false, inApp: true, email: false } }),
            ann({ title: { tr: 'başka tenant' }, target: { mode: 'tenants', tids: [8] } }),
            ann({ title: { tr: 'yöneticilere' }, audience: 'owners_admins' }),
            ann({ title: { tr: 'zamanlanmış pencerede' }, status: 'scheduled', startsAt: new Date(NOW - 1800_000) }),
        ]);
        const out = await s.getActive();
        expect(out.items.map((x: any) => x.title.tr)).toEqual(['kritik', 'zamanlanmış pencerede', 'bilgi']);
        expect(Object.keys(out.items[0]).sort()).toEqual(['body', 'dismissible', 'endsAt', 'id', 'kind', 'severity', 'startsAt', 'title']);
        expect(JSON.stringify(out)).not.toMatch(/adm-secret|fanout|target|audience/);
        expect(out.items[0].dismissible).toBe(false);
        expect(typeof out.serverTime).toBe('string');
    });
    it('kitle: owners_admins duyurusu yönetici kademesine görünür', async () => {
        expect((await svc([ann({ audience: 'owners_admins' })], { tier: 'admin' }).s.getActive()).items).toHaveLength(1);
        expect((await svc([ann({ audience: 'owners_admins' })], { tier: 'member' }).s.getActive()).items).toHaveLength(0);
    });
    it('plan hedefi: abonelik planıyla eşleşir; aboneliği olmayan görmez; plan hedefi yoksa abonelik sorgulanmaz', async () => {
        const plans = ann({ target: { mode: 'plans', planCodes: ['pro'] } });
        expect((await svc([plans], { plan: 'pro' }).s.getActive()).items).toHaveLength(1);
        expect((await svc([plans], { plan: 'free' }).s.getActive()).items).toHaveLength(0);
        expect((await svc([plans], { plan: null }).s.getActive()).items).toHaveLength(0);
        const t = svc([ann({})]);
        const spy = jest.spyOn(t.subs, 'findOne');
        await t.s.getActive();
        expect(spy).not.toHaveBeenCalled();
    });
    it('tenant bağlamı yoksa boş liste; hata maskelenmez (sorgu hatası yukarı fırlar)', async () => {
        expect((await svc([ann({})], { clientId: 0 }).s.getActive()).items).toEqual([]);
        const { s, announcements } = svc([ann({})]);
        jest.spyOn(announcements, 'find').mockImplementation(() => { throw new Error('db down'); });
        await expect(s.getActive()).rejects.toThrow('db down');
    });
});

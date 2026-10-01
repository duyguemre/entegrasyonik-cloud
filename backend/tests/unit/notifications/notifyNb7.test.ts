// ADR-0029 NB7/NB8: notify çekirdeğine eklenen `email:false`, `minTier`, `shadow` seçenekleri + duyuru şablonu + platformNotify + platform alıcısı (dispatcher). DB/SMTP YOK.
import { describe, it, expect } from '@jest/globals';
import { Notifier, type NotifyDeps } from '../../../src/operations/notifications/notify';
import type { Member } from '../../../src/operations/notifications/audience';
import { renderNotification } from '../../../src/operations/notifications/templates/render';
import { PlatformNotifier } from '../../../src/operations/notifications/platformNotify';
import { parseAlertRecipients, recipientHash, platformUserId, isPlatformUserId } from '../../../src/operations/notifications/platformRecipients';
import { EmailDispatcher, type DispatcherDeps } from '../../../src/operations/notifications/delivery/EmailDispatcher';
import { MongoDeliveryStore } from '../../../src/operations/notifications/delivery/deliveryStore';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

const T0 = new Date('2026-10-01T10:00:00Z');
const OWNER: Member = { userId: 'u-owner', owner: true, emailVerified: true };
const ADMIN: Member = { userId: 'u-admin', roleCode: 'ROLE_ADMIN', emailVerified: true };
const MEMBER: Member = { userId: 'u-member', emailVerified: true };

function setup(flags = { v2Enabled: true, emailEnabled: true }) {
    const ledger = new FakeNotifyModel([], { unique: [['idemKey']] });
    const deliveries = new FakeNotifyModel();
    const tenant = new FakeNotifyModel();
    const deps: NotifyDeps = {
        ledgerModel: ledger as any, deliveryModel: deliveries as any, tenantNotificationModel: async () => tenant as any,
        listMembers: async () => [OWNER, ADMIN, MEMBER], flags: () => flags, now: () => T0,
    };
    return { n: new Notifier(deps), ledger, deliveries, tenant };
}
const ANN = { announcementId: 'AN-1', kind: 'maintenance' as const, title: 'Planlı bakım', summary: 'Gece 02:00', titleEn: 'Planned maintenance', summaryEn: 'At 02:00' };

describe('SYSTEM_ANNOUNCEMENT şablonu', () => {
    it('duyuru metni params.title/summary; en yoksa tr; metin yoksa genel şablon', () => {
        expect(renderNotification('SYSTEM_ANNOUNCEMENT', ANN, 'tr')).toEqual({ title: 'Planlı bakım', message: 'Gece 02:00' });
        expect(renderNotification('SYSTEM_ANNOUNCEMENT', ANN, 'en')).toEqual({ title: 'Planned maintenance', message: 'At 02:00' });
        expect(renderNotification('SYSTEM_ANNOUNCEMENT', { ...ANN, titleEn: undefined, summaryEn: undefined }, 'en')).toEqual({ title: 'Planlı bakım', message: 'Gece 02:00' });
        expect(renderNotification('SYSTEM_ANNOUNCEMENT', { announcementId: 'AN-1', kind: 'info' }, 'tr').title).toBe('Duyuru');
    });
});

describe('notify seçenekleri', () => {
    it('email:false -> uygulama içi yazılır, e-posta teslimi üretilmez; email:true -> her doğrulanmış alıcıya outbox', async () => {
        const a = setup();
        expect(await a.n.notify('SYSTEM_ANNOUNCEMENT', 7, ANN, { email: false })).toMatchObject({ status: 'created', recipients: 3 });
        expect(a.tenant.docs).toHaveLength(3);
        expect(a.deliveries.docs).toHaveLength(0);
        expect(a.tenant.docs[0]).toMatchObject({ title: 'Planlı bakım', message: 'Gece 02:00', code: 'SYSTEM_ANNOUNCEMENT' });

        const b = setup();
        await b.n.notify('SYSTEM_ANNOUNCEMENT', 7, ANN, { email: true });
        expect(b.deliveries.docs).toHaveLength(3);
        expect(b.deliveries.docs.every((d) => d.status === 'pending' && d.channel === 'email' && d.mode === 'instant')).toBe(true);
    });

    it('minTier:admin -> yalnız sahip ve yöneticiler alıcı olur', async () => {
        const a = setup();
        const r = await a.n.notify('SYSTEM_ANNOUNCEMENT', 7, ANN, { minTier: 'admin', email: true });
        expect(r.recipients).toBe(2);
        expect(a.tenant.docs.map((d) => d.userId).sort()).toEqual(['u-admin', 'u-owner']);
        expect(a.deliveries.docs.map((d) => d.userId).sort()).toEqual(['u-admin', 'u-owner']);
    });

    it('shadow -> yalnız defter (suppressed:shadow): uygulama içi belge, outbox ve zil YOK; aynı çağrı tekrar edilebilir', async () => {
        const a = setup();
        const r = await a.n.notify('INTEGRATION_AUTH_FAILED', 7, { integ: 'n11' }, { shadow: true, module: 'alerts' });
        expect(r).toMatchObject({ status: 'suppressed', reason: 'shadow', recipients: 0 });
        expect(a.tenant.docs).toHaveLength(0);
        expect(a.deliveries.docs).toHaveLength(0);
        expect(a.ledger.docs).toHaveLength(1);
        expect(a.ledger.docs[0]).toMatchObject({ code: 'INTEGRATION_AUTH_FAILED', tid: 7, suppressedCount: 1, recipientCount: 0, source: { module: 'alerts' } });
        const again = await a.n.notify('INTEGRATION_AUTH_FAILED', 7, { integ: 'n11' }, { shadow: true });
        expect(again.status).toBe('suppressed');
        expect(a.ledger.docs).toHaveLength(2);
        // geçersiz params shadow'da da reddedilir (defter kirlenmez)
        expect(await a.n.notify('INTEGRATION_AUTH_FAILED', 7, { integ: 'n11', email: 'x@y.z' } as any, { shadow: true })).toMatchObject({ status: 'failed', reason: 'invalid_params' });
    });

    it('bayrak kapalı: shadow dahil hiçbir yazım yok', async () => {
        const a = setup({ v2Enabled: false, emailEnabled: true });
        expect(await a.n.notify('INTEGRATION_AUTH_FAILED', 7, { integ: 'n11' }, { shadow: true })).toMatchObject({ status: 'skipped' });
        expect(a.ledger.docs).toHaveLength(0);
    });
});

describe('platform alıcıları (ALERT_EMAIL_TO)', () => {
    it('ayrıştırma: geçerli/tekil/en fazla 10; adres değil özet kullanılır', () => {
        const r = parseAlertRecipients(' Ops@Example.com, bozuk, ops@example.com ,dev@example.org');
        expect(r.map((x) => x.email)).toEqual(['Ops@Example.com', 'dev@example.org']);
        expect(r[0].hash).toBe(recipientHash('ops@example.com'));
        expect(r[0].hash).toHaveLength(12);
        expect(parseAlertRecipients(Array.from({ length: 15 }, (_, i) => `a${i}@example.com`).join(',')).length).toBe(10);
        expect(parseAlertRecipients(undefined)).toEqual([]);
        expect(isPlatformUserId(platformUserId('abc'))).toBe(true);
        expect(isPlatformUserId('64f000000000000000000001')).toBe(false);
    });
});

describe('platformNotify', () => {
    const RCPT = parseAlertRecipients('ops@example.com,dev@example.org');
    const mk = (flags = { v2Enabled: true, emailEnabled: true }, recipients = RCPT) => {
        const ledger = new FakeNotifyModel([], { unique: [['idemKey']] });
        const deliveries = new FakeNotifyModel();
        return { ledger, deliveries, p: new PlatformNotifier({ ledgerModel: ledger as any, deliveryModel: deliveries as any, flags: () => flags, recipients: () => recipients, now: () => T0 }) };
    };
    it('firing: defter (tid 0) + alıcı başına outbox; e-posta adresi outbox/deftere YAZILMAZ', async () => {
        const { p, ledger, deliveries } = mk();
        const r = await p.notify('PLATFORM_ALERT_FIRING', { ruleId: 'R1', alertId: 'AL-1', level: 'critical' }, { idempotencyKey: 'AL-1:new' });
        expect(r).toMatchObject({ status: 'created', recipients: 2 });
        expect(ledger.docs[0]).toMatchObject({ tid: 0, code: 'PLATFORM_ALERT_FIRING', severity: 'critical', emailQueued: 2 });
        expect(deliveries.docs.map((d) => d.userId).sort()).toEqual(RCPT.map((x) => platformUserId(x.hash)).sort());
        expect(deliveries.docs.every((d) => d.status === 'pending' && d.mode === 'instant')).toBe(true);
        expect(JSON.stringify([ledger.docs, deliveries.docs])).not.toMatch(/example\.(com|org)/);
    });
    it('aynı idempotencyKey ikinci kez -> duplicate; tenant kodu ya da bilinmeyen kod -> reddedilir; geçersiz params -> failed', async () => {
        const { p } = mk();
        await p.notify('PLATFORM_ALERT_RESOLVED', { ruleId: 'R1', alertId: 'AL-1' }, { idempotencyKey: 'k' });
        expect((await p.notify('PLATFORM_ALERT_RESOLVED', { ruleId: 'R1', alertId: 'AL-1' }, { idempotencyKey: 'k' })).status).toBe('duplicate');
        expect((await p.notify('ORDER_SYNC_FAILED', {})).reason).toBe('unknown_code');
        expect((await p.notify('NOPE', {})).reason).toBe('unknown_code');
        expect((await p.notify('PLATFORM_ALERT_DIGEST', { newAlertCount: 'x' })).reason).toBe('invalid_params');
    });
    it('özet kodu varsayılan kipi (digest) taşınır; alıcı yoksa yalnız defter (panel)', async () => {
        const a = mk();
        await a.p.notify('PLATFORM_ALERT_RESOLVED', { ruleId: 'R1', alertId: 'AL-1' });
        expect(a.deliveries.docs[0].mode).toBe('digest');
        const b = mk(undefined, []);
        expect(await b.p.notify('PLATFORM_ALERT_DIGEST', { newAlertCount: 8 })).toMatchObject({ status: 'created', recipients: 0 });
        expect(b.deliveries.docs).toHaveLength(0);
        expect(b.ledger.docs).toHaveLength(1);
    });
    it('golge mod: teslimler suppressed:shadow; e-posta kapalı: skipped:disabled; V2 kapalı: hiçbir yazım yok', async () => {
        const a = mk();
        expect(await a.p.notify('PLATFORM_ALERT_FIRING', { ruleId: 'R1', alertId: 'A', level: 'warning' }, { shadow: true })).toMatchObject({ status: 'suppressed', reason: 'shadow' });
        expect(a.deliveries.docs.every((d) => d.status === 'suppressed' && d.lastErrorCode === 'shadow')).toBe(true);
        const b = mk({ v2Enabled: true, emailEnabled: false });
        await b.p.notify('PLATFORM_ALERT_FIRING', { ruleId: 'R1', alertId: 'A', level: 'warning' });
        expect(b.deliveries.docs.every((d) => d.status === 'skipped' && d.lastErrorCode === 'disabled')).toBe(true);
        const c = mk({ v2Enabled: false, emailEnabled: true });
        expect((await c.p.notify('PLATFORM_ALERT_FIRING', { ruleId: 'R1', alertId: 'A', level: 'warning' })).status).toBe('skipped');
        expect(c.ledger.docs).toHaveLength(0);
    });
});

describe('EmailDispatcher: platform alıcısı', () => {
    const RCPT = parseAlertRecipients('ops@example.com');
    function build(over: Partial<DispatcherDeps> = {}) {
        const model = new FakeNotifyModel();
        const sent: any[] = [];
        const d = new EmailDispatcher({
            store: new MongoDeliveryStore(model as any), flags: () => ({ v2Enabled: true, emailEnabled: true }),
            loadUser: async () => { throw new Error('platform alicisi Users\'a gitmemeli'); }, loadPrefs: async () => { throw new Error('platform alicisi tercih okumamali'); },
            loadEvents: async (ids) => new Map(ids.map((i) => [String(i), { params: { ruleId: 'R1', alertId: 'AL-1', level: 'critical' }, count: 1 }])),
            transport: { send: async (m) => { sent.push(m); return { messageId: 'm1' }; } },
            appUrl: 'https://app.example.com', unsubSecret: undefined, now: () => T0,
            platformRecipient: (h) => RCPT.find((r) => r.hash === h)?.email, ...over,
        });
        return { model, sent, d };
    }
    const doc = (over: any = {}) => ({ eventId: 'e1', tid: 0, userId: platformUserId(RCPT[0].hash), code: 'PLATFORM_ALERT_FIRING', channel: 'email', mode: 'instant', status: 'pending', attempts: 0, nextAttemptAt: T0, createdAt: T0, locale: 'tr', ...over });
    it('anlık: adres env çözümünden, abonelik bağlantısı yok (hizmet bildirimi), Users/tercih okunmaz', async () => {
        const { model, sent, d } = build();
        model.docs.push({ _id: 'd1', ...doc() });
        const r = await d.runOnce();
        expect(r.result.sent).toBe(1);
        expect(sent[0].to).toBe('ops@example.com');
        expect(sent[0].headers['List-Unsubscribe']).toBeUndefined();
        expect(model.docs[0]).toMatchObject({ status: 'sent' });
    });
    it('alıcı env listesinden çıkarılmışsa kayıt skipped:no_recipient', async () => {
        const { model, sent, d } = build({ platformRecipient: () => undefined });
        model.docs.push({ _id: 'd1', ...doc() });
        await d.runOnce();
        expect(sent).toHaveLength(0);
        expect(model.docs[0]).toMatchObject({ status: 'skipped', lastErrorCode: 'no_recipient' });
    });
    it('özet: platform alıcısı için tek iletide toplanır, abonelik bağlantısı yok', async () => {
        const { model, sent, d } = build();
        const due = new Date(T0.getTime() - 25 * 3_600_000);
        model.docs.push({ _id: 'd1', ...doc({ mode: 'digest', code: 'PLATFORM_ALERT_RESOLVED', createdAt: due, nextAttemptAt: due }) }, { _id: 'd2', ...doc({ eventId: 'e2', mode: 'digest', code: 'PLATFORM_ALERT_RESOLVED', createdAt: due, nextAttemptAt: due }) });
        const r = await d.runOnce();
        expect(r.result.digests).toBe(1);
        expect(sent).toHaveLength(1);
        expect(sent[0].headers['List-Unsubscribe']).toBeUndefined();
        expect(model.docs.every((x) => x.status === 'sent')).toBe(true);
    });
});

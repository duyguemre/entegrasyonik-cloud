// MOB-04: web push kanalı (ADR-0029 Karar 4). DB/ağ YOK: bellek-içi sahte modeller; gerçek `web-push` yalnız yerel kriptoda
// (VAPID üretimi + aes128gcm şifreleme gidiş-dönüş), ağ çağrısı yapılmaz.
import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';
import webpush from 'web-push';
import { resolveVapid } from '../../../src/operations/notifications/push/vapid';
import { isAllowedPushEndpoint, isPushHost, PUSH_SERVICE_HOSTS } from '../../../src/operations/notifications/push/pushHosts';
import { buildPushPayload, pushTitle, safeInternalPath } from '../../../src/operations/notifications/push/pushPayload';
import { filterPushRecipients } from '../../../src/operations/notifications/push/pushRecipients';
import {
    createPushSubscriptionPort, hashEndpoint, listPushDevices, MAX_DEVICES_PER_USER, PushSubscriptionError, removePushSubscription, savePushSubscription,
} from '../../../src/operations/notifications/push/subscriptions';
import { classifyPushError, PushDispatcher, PUSH_STALE_MS, type PushDispatcherDeps, type PushSender, type PushTarget } from '../../../src/operations/notifications/push/PushDispatcher';
import { MongoDeliveryStore } from '../../../src/operations/notifications/delivery/deliveryStore';
import { categoryLocks, defaultPush, resolveChannels } from '../../../src/operations/notifications/preferences';
import { getDefinition, NOTIFICATION_CATALOG } from '../../../src/operations/notifications/catalog';
import { Notifier, type NotifyDeps } from '../../../src/operations/notifications/notify';
import type { Member } from '../../../src/operations/notifications/audience';
import { PushSubscriptionRepository } from '../../../src/database/repositories/app/PushSubscriptionRepository';
import { NOTIFICATION_RPC_INPUT } from '../../../src/capabilities/rpc-input/notification';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

const T0 = new Date('2026-10-01T10:00:00Z');
const FCM = 'https://fcm.googleapis.com/fcm/send/abc123';

/** Gerçek tarayıcı aboneliği gibi: P-256 istemci anahtarı + 16 bayt auth. */
function clientSubscription(endpoint = FCM) {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = crypto.randomBytes(16);
    return { ecdh, auth, sub: { endpoint, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}

function newRepo() {
    const model = new FakeNotifyModel([], { unique: [['endpointHash']] });
    const repo = new PushSubscriptionRepository({ getPushSubscriptionModel: () => model } as any);
    return { model, repo };
}

describe('VAPID yapılandırması (yalnız env; yoksa kanal kapalı)', () => {
    const keys = webpush.generateVAPIDKeys();
    it('üçü geçerli -> açık; hiçbiri yok -> missing; biçimsiz -> neden (değer dönmez)', () => {
        expect(resolveVapid({ publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'mailto:ops@example.com' })).toMatchObject({ ok: true });
        expect(resolveVapid({ publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'https://entegrasyonik.com' })).toMatchObject({ ok: true });
        expect(resolveVapid(undefined)).toEqual({ ok: false, reason: 'missing' });
        expect(resolveVapid({})).toEqual({ ok: false, reason: 'missing' });
        expect(resolveVapid({ publicKey: keys.publicKey })).toEqual({ ok: false, reason: 'invalid_private' });
        expect(resolveVapid({ publicKey: 'abc', privateKey: keys.privateKey, subject: 'mailto:a@b.c' })).toEqual({ ok: false, reason: 'invalid_public' });
        expect(resolveVapid({ publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'http://x' })).toEqual({ ok: false, reason: 'invalid_subject' });
        const bad = resolveVapid({ publicKey: keys.publicKey, privateKey: 'gizli', subject: 'mailto:a@b.c' });
        expect(JSON.stringify(bad)).not.toContain('gizli');
    });
});

describe('push servis host izin listesi (SSRF)', () => {
    it('yalnız bilinen servisler; https, kimlik bilgisi/port yok; joker yalnız alt alan', () => {
        expect(isAllowedPushEndpoint(FCM)).toBe(true);
        expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
        expect(isAllowedPushEndpoint('https://web.push.apple.com/QJ3x')).toBe(true);
        expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
        for (const bad of [
            'http://fcm.googleapis.com/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://evil.example/fcm.googleapis.com',
            'https://fcm.googleapis.com.evil.example/x', 'https://u:p@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
            'https://notify.windows.com/x', 'https://evilnotify.windows.com/x', 'notaurl', 42, `https://fcm.googleapis.com/${'a'.repeat(1100)}`,
        ]) expect(isAllowedPushEndpoint(bad)).toBe(false);
        expect(PUSH_SERVICE_HOSTS.every((h) => isPushHost(h.replace('*.', 'a.')))).toBe(true);
    });
});

describe('push içeriği: hassas veri YOK', () => {
    it('başlık sabit şablon başlığı, metin sabit; params (sipariş/satır/SKU) metne GİRMEZ; url uygulama içi yol', () => {
        const params = { integ: 'trendyol', lineId: 'LINE-SECRET-77', orderId: 'ORD-99' };
        const p = buildPushPayload({ code: 'STOCK_OVERSOLD', params, locale: 'tr', eventId: 'e1', severity: 'critical' });
        expect(p).toEqual({ v: 1, title: 'Stok aşırı satıldı', body: 'Ayrıntılar için Entegrasyonik’i açın.', url: '/orders?allocation=OVERSOLD', tag: 'ntf:e1', severity: 'critical' });
        expect(`${p.title} ${p.body}`).not.toMatch(/LINE-SECRET|ORD-99|trendyol/);
        expect(buildPushPayload({ code: 'STOCK_OVERSOLD', params, locale: 'en', eventId: 'e1', severity: 'critical' }).body).toBe('Open Entegrasyonik for details.');
    });
    it('tüm tenant katalog kodlarında başlık yer tutucusuz (yoksa kategori etiketi) ve hiçbir örnek parametre değeri metinde yok', () => {
        for (const def of NOTIFICATION_CATALOG.filter((d) => d.surface === 'tenant' && !d.legacy)) {
            for (const locale of ['tr', 'en'] as const) {
                const p = buildPushPayload({ code: def.code, params: def.example as any, locale, eventId: 'x', severity: 'info' });
                expect(p.title).not.toContain('{');
                expect(p.title).toBe(pushTitle(def.code, locale));
                for (const v of Object.values(def.example ?? {})) if (typeof v === 'string' && v.length > 3) expect(`${p.title} ${p.body}`).not.toContain(v);
                expect(p.url.startsWith('/') && !p.url.startsWith('//')).toBe(true);
            }
        }
    });
    it('SYSTEM_ANNOUNCEMENT: yöneticinin metni değil genel "Duyuru"', () => {
        expect(buildPushPayload({ code: 'SYSTEM_ANNOUNCEMENT', params: { announcementId: 'A1', kind: 'info', title: 'İç bilgi' }, locale: 'tr', eventId: 'x', severity: 'info' }).title).toBe('Duyuru');
    });
    it('safeInternalPath: protokol/çift eğik/ters eğik/denetim karakteri reddedilir', () => {
        for (const bad of ['https://x', '//evil.example', '/\\evil', 'javascript:alert(1)', '/a\nb', 42]) expect(safeInternalPath(bad)).toBeUndefined();
        expect(safeInternalPath('/orders/1')).toBe('/orders/1');
    });
});

describe('tercih matrisi: push sütunu', () => {
    it('varsayılan: zorunlu ya da kritik olabilen kodlar açık; diğerleri kapalı; kullanıcı -> tenant -> katalog', () => {
        const oversold = getDefinition('STOCK_OVERSOLD')!;
        const realloc = getDefinition('STOCK_REALLOCATED')!;
        expect(defaultPush(oversold)).toBe(true);
        expect(defaultPush(realloc)).toBe(false);
        expect(resolveChannels(realloc).push).toBe(false);
        expect(resolveChannels(realloc, undefined, { stock: { push: true } }).push).toBe(true);
        expect(resolveChannels(realloc, { stock: { push: false } }, { stock: { push: true } }).push).toBe(false);
    });
    it('zorunlu kategoride bile push kapatılabilir (kilit yalnız inApp/e-posta)', () => {
        const pwd = getDefinition('SECURITY_PASSWORD_CHANGED')!;
        expect(resolveChannels(pwd, { security: { push: false, inApp: false } })).toMatchObject({ inApp: true, push: false });
        expect(categoryLocks().find((l) => l.category === 'security')!.catalogDefault.push).toBe(true);
    });
    it('rpc-input: push boolean kabul; başka tip reddedilir', () => {
        const S = NOTIFICATION_RPC_INPUT['NotificationService/updatePreferences']!;
        expect(S.safeParse({ matrix: { stock: { push: true } } }).success).toBe(true);
        expect(S.safeParse({ matrix: { stock: { push: 'yes' } } }).success).toBe(false);
    });
    it('filterPushRecipients: tercihi kapalı olan elenir', () => {
        const def = getDefinition('STOCK_REALLOCATED')!;
        expect(filterPushRecipients(def, ['a', 'b'], [{ userId: null, matrix: { stock: { push: true } } }, { userId: 'b', matrix: { stock: { push: false } } }])).toEqual(['a']);
        expect(filterPushRecipients(def, ['a'], [])).toEqual([]);
    });
});

describe('abonelik kaydı (tenant + kullanıcı kapsamlı, şifreli)', () => {
    it('kayıt: uç ve anahtarlar düz metin SAKLANMAZ; aynı uç = tek kayıt; başka kullanıcı aynı tarayıcıda -> sahiplik ona geçer', async () => {
        const { model, repo } = newRepo();
        const { sub } = clientSubscription();
        await savePushSubscription(repo, { tid: 7, userId: 'u1', subscription: sub, deviceLabel: 'Android · Chrome', now: T0 });
        expect(model.docs).toHaveLength(1);
        const raw = JSON.stringify(model.docs[0]);
        expect(raw).not.toContain('fcm.googleapis.com');
        expect(raw).not.toContain(sub.keys.auth);
        expect(model.docs[0]).toMatchObject({ tid: 7, userId: 'u1', endpointHash: hashEndpoint(FCM), deviceLabel: 'Android · Chrome' });
        expect(String(model.docs[0].sub).startsWith('enc:v1:')).toBe(true);
        await savePushSubscription(repo, { tid: 7, userId: 'u1', subscription: sub, now: T0 });
        expect(model.docs).toHaveLength(1);
        await savePushSubscription(repo, { tid: 9, userId: 'u2', subscription: sub, now: T0 });
        expect(model.docs).toHaveLength(1);
        expect(model.docs[0]).toMatchObject({ tid: 9, userId: 'u2' });
    });
    it('geçersiz uç / anahtar -> PushSubscriptionError; hiçbir şey yazılmaz', async () => {
        const { model, repo } = newRepo();
        const { sub } = clientSubscription('https://169.254.169.254/x');
        await expect(savePushSubscription(repo, { tid: 7, userId: 'u1', subscription: sub, now: T0 })).rejects.toMatchObject({ code: 'PUSH_ENDPOINT_NOT_ALLOWED' });
        const ok = clientSubscription().sub;
        await expect(savePushSubscription(repo, { tid: 7, userId: 'u1', subscription: { ...ok, keys: { ...ok.keys, auth: 'AAAA' } }, now: T0 })).rejects.toBeInstanceOf(PushSubscriptionError);
        expect(model.docs).toHaveLength(0);
    });
    it(`kullanıcı başına en çok ${MAX_DEVICES_PER_USER} cihaz (en eskiler düşer); liste yalnız kendi cihazları, uç/anahtar dönmez`, async () => {
        const { model, repo } = newRepo();
        for (let i = 0; i < MAX_DEVICES_PER_USER + 2; i++) {
            await savePushSubscription(repo, { tid: 7, userId: 'u1', subscription: clientSubscription(`${FCM}-${i}`).sub, now: new Date(T0.getTime() + i * 1000) });
        }
        await savePushSubscription(repo, { tid: 7, userId: 'u2', subscription: clientSubscription(`${FCM}-other`).sub, now: T0 });
        expect(model.docs.filter((d) => d.userId === 'u1')).toHaveLength(MAX_DEVICES_PER_USER);
        const devices = await listPushDevices(repo, 7, 'u1');
        expect(devices).toHaveLength(MAX_DEVICES_PER_USER);
        expect(JSON.stringify(devices)).not.toMatch(/fcm|enc:v1|p256dh/);
        expect(devices[0]).toEqual({ id: expect.any(String), deviceLabel: null, createdAt: new Date(T0.getTime() + (MAX_DEVICES_PER_USER + 1) * 1000), lastSuccessAt: null });
    });
    it('silme: yalnız kendi kaydı (başka kullanıcı / başka tenant silemez); idempotent', async () => {
        const { model, repo } = newRepo();
        const { sub } = clientSubscription();
        await savePushSubscription(repo, { tid: 7, userId: 'u1', subscription: sub, now: T0 });
        expect(await removePushSubscription(repo, { tid: 7, userId: 'u2', endpoint: FCM })).toBe(0);
        expect(await removePushSubscription(repo, { tid: 8, userId: 'u1', endpoint: FCM })).toBe(0);
        expect(await removePushSubscription(repo, { tid: 7, userId: 'u2', id: String(model.docs[0]._id) })).toBe(0);
        expect(model.docs).toHaveLength(1);
        expect(await removePushSubscription(repo, { tid: 7, userId: 'u1', endpoint: FCM })).toBe(1);
        expect(await removePushSubscription(repo, { tid: 7, userId: 'u1', endpoint: FCM })).toBe(0);
        expect(model.docs).toHaveLength(0);
    });
    it('gönderici portu şifreyi çözer; çözülemeyen kayıt atlanır ama SİLİNMEZ (anahtar halkası hatası abonelikleri yok etmesin)', async () => {
        const { model, repo } = newRepo();
        const { sub } = clientSubscription();
        await savePushSubscription(repo, { tid: 7, userId: 'u1', subscription: sub, now: T0 });
        model.docs.push({ _id: 'bozuk', tid: 7, userId: 'u1', endpointHash: 'h', sub: 'enc:v1:yok:AAAA:BBBB:CCCC', createdAt: T0 });
        const targets = await createPushSubscriptionPort(repo).listForUser(7, 'u1');
        expect(targets).toEqual([{ id: expect.any(String), endpoint: FCM, keys: sub.keys }]);
        expect(model.docs).toHaveLength(2);
        expect(await new PushSubscriptionRepository({ getPushSubscriptionModel: () => model } as any).usersWithSubscriptions(7, ['u1', 'u9'])).toEqual(['u1']);
    });
});

// --- gönderici ---------------------------------------------------------------------------------------------------------

function dispatcherSetup(o: { targets?: PushTarget[]; send?: PushSender['send']; prefs?: any; flags?: { v2Enabled: boolean; pushEnabled: boolean }; now?: Date; deliveries?: any[] } = {}) {
    const deliveries = new FakeNotifyModel(o.deliveries ?? [{
        eventId: 'ev1', tid: 7, userId: 'u1', code: 'STOCK_OVERSOLD', channel: 'push', mode: 'instant', status: 'pending', attempts: 0,
        nextAttemptAt: T0, createdAt: T0, locale: 'tr',
    }]);
    let targets = o.targets ?? [{ id: 's1', endpoint: FCM, keys: { p256dh: 'p', auth: 'a' } }];
    const removed: string[] = [];
    const sent: Array<{ target: PushTarget; payload: string; opts: any }> = [];
    const send = jest.fn(o.send ?? (async () => ({ statusCode: 201 })));
    const deps: PushDispatcherDeps = {
        store: new MongoDeliveryStore(deliveries as any, 'push'),
        subscriptions: {
            listForUser: async () => targets,
            remove: async (id) => { removed.push(id); targets = targets.filter((t) => t.id !== id); },
            markSuccess: async () => {},
        },
        sender: { send: async (target, payload, opts) => { sent.push({ target, payload, opts }); return send(target, payload, opts); } },
        flags: () => o.flags ?? { v2Enabled: true, pushEnabled: true },
        loadPrefs: async () => o.prefs ?? {},
        loadEvents: async () => new Map([['ev1', { params: { integ: 'trendyol', lineId: 'LINE-SECRET', orderId: 'ORD-1' }, severity: 'critical' }]]),
        now: () => o.now ?? new Date(T0.getTime() + 1000),
    };
    return { d: new PushDispatcher(deps), deliveries, removed, sent, send };
}

describe('PushDispatcher', () => {
    it('kanal kapalı -> outbox\'a DOKUNMAZ', async () => {
        const s = dispatcherSetup({ flags: { v2Enabled: true, pushEnabled: false } });
        expect((await s.d.runOnce()).skipped).toBe('disabled');
        expect(s.deliveries.docs[0].status).toBe('pending');
        expect(s.sent).toHaveLength(0);
    });
    it('gönderim: tüm cihazlara, yüksek aciliyet (kritik), TTL; içerikte params yok; kayıt sent', async () => {
        const s = dispatcherSetup({ targets: [{ id: 's1', endpoint: FCM, keys: { p256dh: 'p', auth: 'a' } }, { id: 's2', endpoint: `${FCM}2`, keys: { p256dh: 'p', auth: 'a' } }] });
        const r = await s.d.runOnce();
        expect(r.result.sent).toBe(1);
        expect(s.sent).toHaveLength(2);
        expect(s.sent[0].opts).toMatchObject({ urgency: 'high', ttl: 12 * 3600 });
        expect(s.sent[0].payload).not.toMatch(/LINE-SECRET|ORD-1|trendyol/);
        expect(JSON.parse(s.sent[0].payload)).toMatchObject({ title: 'Stok aşırı satıldı', url: '/orders?allocation=OVERSOLD', tag: 'ntf:ev1' });
        expect(s.deliveries.docs[0]).toMatchObject({ status: 'sent', attempts: 1 });
    });
    it('404/410 -> abonelik silinir; başka cihaz başarılıysa sent, hiçbiri kalmadıysa skipped:no_subscription', async () => {
        const gone = Object.assign(new Error('gone'), { statusCode: 410 });
        const a = dispatcherSetup({
            targets: [{ id: 'old', endpoint: FCM, keys: { p256dh: 'p', auth: 'a' } }, { id: 'new', endpoint: `${FCM}2`, keys: { p256dh: 'p', auth: 'a' } }],
            send: async (t) => { if (t.id === 'old') throw gone; return { statusCode: 201 }; },
        });
        await a.d.runOnce();
        expect(a.removed).toEqual(['old']);
        expect(a.deliveries.docs[0].status).toBe('sent');
        const b = dispatcherSetup({ send: async () => { throw Object.assign(new Error('nf'), { statusCode: 404 }); } });
        const r = await b.d.runOnce();
        expect(b.removed).toEqual(['s1']);
        expect(r.result.removedSubscriptions).toBe(1);
        expect(b.deliveries.docs[0]).toMatchObject({ status: 'skipped', lastErrorCode: 'no_subscription' });
    });
    it('geçici (429/5xx/ağ) -> yeniden dene (1 dk sonra); kalıcı (400/403) -> dead; abonelik silinmez', async () => {
        const t = dispatcherSetup({ send: async () => { throw Object.assign(new Error('x'), { statusCode: 503 }); } });
        await t.d.runOnce();
        expect(t.deliveries.docs[0]).toMatchObject({ status: 'pending', lastErrorCode: 'push_503', attempts: 1 });
        expect(new Date(t.deliveries.docs[0].nextAttemptAt).getTime()).toBe(T0.getTime() + 1000 + 60_000);
        const p = dispatcherSetup({ send: async () => { throw Object.assign(new Error('x'), { statusCode: 403 }); } });
        await p.d.runOnce();
        expect(p.deliveries.docs[0]).toMatchObject({ status: 'dead', lastErrorCode: 'push_403' });
        expect(p.removed).toEqual([]);
        expect(classifyPushError(new Error('ECONNRESET'))).toEqual({ kind: 'transient', code: 'push_network' });
        expect(classifyPushError({ statusCode: 429 }).kind).toBe('transient');
        expect(classifyPushError({ statusCode: 413 }).kind).toBe('permanent');
    });
    it('tercih kapalı -> skipped:opt_out; cihaz yok -> skipped:no_subscription; 24 saatten eski -> skipped:stale (gönderim yok)', async () => {
        const o = dispatcherSetup({ prefs: { user: { stock: { push: false } } } });
        await o.d.runOnce();
        expect(o.deliveries.docs[0]).toMatchObject({ status: 'skipped', lastErrorCode: 'opt_out' });
        const n = dispatcherSetup({ targets: [] });
        await n.d.runOnce();
        expect(n.deliveries.docs[0]).toMatchObject({ status: 'skipped', lastErrorCode: 'no_subscription' });
        const st = dispatcherSetup({ now: new Date(T0.getTime() + PUSH_STALE_MS + 1) });
        await st.d.runOnce();
        expect(st.deliveries.docs[0]).toMatchObject({ status: 'skipped', lastErrorCode: 'stale' });
        expect(o.sent.length + n.sent.length + st.sent.length).toBe(0);
    });
    it('sessiz saatler: zorunlu olmayan ertelenir (deneme hakkı harcanmaz); zorunlu gider', async () => {
        const quiet = { quiet: { start: '00:00', end: '23:59', tz: 'UTC' } };
        const nm = dispatcherSetup({ prefs: { ...quiet, user: { stock: { push: true } } }, deliveries: [{
            eventId: 'ev1', tid: 7, userId: 'u1', code: 'STOCK_REALLOCATED', channel: 'push', mode: 'instant', status: 'pending', attempts: 0, nextAttemptAt: T0, createdAt: T0,
        }] });
        await nm.d.runOnce();
        expect(nm.deliveries.docs[0]).toMatchObject({ status: 'pending', lastErrorCode: 'quiet_hours', attempts: 0 });
        expect(nm.sent).toHaveLength(0);
        const m = dispatcherSetup({ prefs: quiet });
        await m.d.runOnce();
        expect(m.deliveries.docs[0].status).toBe('sent');
    });
    it('e-posta kaydına dokunmaz (kanal ayrımı)', async () => {
        const s = dispatcherSetup({ deliveries: [{ eventId: 'ev1', tid: 7, userId: 'u1', code: 'STOCK_OVERSOLD', channel: 'email', mode: 'instant', status: 'pending', attempts: 0, nextAttemptAt: T0, createdAt: T0 }] });
        await s.d.runOnce();
        expect(s.deliveries.docs[0].status).toBe('pending');
        expect(s.sent).toHaveLength(0);
    });
});

describe('notify -> push outbox kaydı', () => {
    const OWNER: Member = { userId: 'u-owner', owner: true, emailVerified: true };
    const MEMBER: Member = { userId: 'u-member', emailVerified: true, locale: 'en' };
    function setup(o: { pushEnabled?: boolean; pushRecipients?: NotifyDeps['pushRecipients'] } = {}) {
        const deliveries = new FakeNotifyModel();
        const tenant = new FakeNotifyModel();
        const calls: string[][] = [];
        const deps: NotifyDeps = {
            ledgerModel: new FakeNotifyModel([], { unique: [['idemKey']] }) as any, deliveryModel: deliveries as any, tenantNotificationModel: async () => tenant as any,
            listMembers: async () => [OWNER, MEMBER], flags: () => ({ v2Enabled: true, emailEnabled: false, pushEnabled: o.pushEnabled ?? true }), now: () => T0,
            pushRecipients: o.pushRecipients ?? (async (_tid, _def, ids) => { calls.push(ids); return ids; }),
        };
        return { n: new Notifier(deps), deliveries, tenant, calls };
    }
    it('açıkken abone+tercihli alıcılar için channel:push/instant/pending kaydı (alıcının dili)', async () => {
        const s = setup();
        await s.n.notify('INTEGRATION_AUTH_FAILED', 7, { integ: 'n11' });
        const push = s.deliveries.docs.filter((d) => d.channel === 'push');
        expect(push.map((d) => d.userId).sort()).toEqual(['u-member', 'u-owner']);
        expect(push.every((d) => d.mode === 'instant' && d.status === 'pending')).toBe(true);
        expect(push.find((d) => d.userId === 'u-member')!.locale).toBe('en');
    });
    it('kapalıyken push kaydı yok ve alıcı çözümü çağrılmaz', async () => {
        const s = setup({ pushEnabled: false });
        await s.n.notify('INTEGRATION_AUTH_FAILED', 7, { integ: 'n11' });
        expect(s.deliveries.docs.filter((d) => d.channel === 'push')).toHaveLength(0);
        expect(s.calls).toHaveLength(0);
    });
    it('destek oturumu aktörü push alamaz; alıcı çözümü hata verirse uygulama içi bildirim yine yazılır', async () => {
        const s = setup();
        await s.n.notify('INTEGRATION_AUTH_FAILED', 7, { integ: 'n11' }, { actorUserId: 'u-owner', actorImpersonating: true });
        expect(s.calls[0]).toEqual(['u-member']);
        const f = setup({ pushRecipients: async () => { throw new Error('db'); } });
        expect((await f.n.notify('INTEGRATION_AUTH_FAILED', 7, { integ: 'n11' })).status).toBe('created');
        expect(f.tenant.docs).toHaveLength(2);
    });
});

/** RFC 8291 (aes128gcm, tek kayıt) istemci tarafı çözümü -- yalnız node crypto; tarayıcının yaptığını taklit eder. */
function decryptAes128gcm(body: Buffer, ecdh: crypto.ECDH, auth: Buffer): string {
    const hmac = (key: Buffer, data: Buffer) => crypto.createHmac('sha256', key).update(data).digest();
    const salt = body.subarray(0, 16);
    const idlen = body.readUInt8(20);
    const asPublic = body.subarray(21, 21 + idlen);
    const ct = body.subarray(21 + idlen);
    const shared = ecdh.computeSecret(asPublic);
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]);
    const ikm = hmac(hmac(auth, shared), keyInfo).subarray(0, 32);
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
    const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const padded = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    return padded.subarray(0, padded.lastIndexOf(2)).toString('utf8'); // son kayıt ayracı 0x02 + dolgu
}

describe('web-push kripto (yerel, ağ yok): VAPID + aes128gcm gidiş-dönüş', () => {
    it('üretilen istek RFC 8291 ile istemci anahtarıyla çözülür; VAPID başlığı var', () => {
        const vapid = webpush.generateVAPIDKeys();
        const { ecdh, auth, sub } = clientSubscription();
        const payload = JSON.stringify(buildPushPayload({ code: 'STOCK_OVERSOLD', params: {}, locale: 'tr', eventId: 'e', severity: 'critical' }));
        const req = webpush.generateRequestDetails(sub, payload, {
            vapidDetails: { subject: 'mailto:ops@example.com', publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 60, urgency: 'high',
        });
        expect(req.endpoint).toBe(FCM);
        expect(String(req.headers.Authorization)).toMatch(/^vapid t=.+, k=/);
        expect(req.headers['Content-Encoding']).toBe('aes128gcm');
        const plain = decryptAes128gcm(req.body as Buffer, ecdh, auth);
        expect(JSON.parse(plain)).toMatchObject({ title: 'Stok aşırı satıldı', tag: 'ntf:e' });
    });
});

// MOB-04: NotificationService web push uçları (getPushConfig / subscribePush / unsubscribePush). DB YOK: bellek-içi sahte model.
// VAPID env'den okunur (config canlı Proxy): test süreci kendi anahtarını üretir, hiçbir yere yazmaz.
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import webpush from 'web-push';
import NotificationService from '@api/rpc/handlers/notification-service';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';
import { CAPABILITY_BY_ID } from '../../../src/capabilities';

const UID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const FCM = 'https://fcm.googleapis.com/fcm/send/dev1';
const KEYS = ['NOTIFY_V2_ENABLED', 'WEBPUSH_VAPID_PUBLIC', 'WEBPUSH_VAPID_PRIVATE', 'WEBPUSH_VAPID_SUBJECT'];
let saved: Record<string, string | undefined>;
let model: FakeNotifyModel;

function sub(endpoint = FCM) {
    const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
    return { endpoint, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
}
function svc(body: any = {}, principal: any = {}, tid = 7, uid = UID) {
    const s: any = new NotificationService(tid, { ...body, principal: { sub: uid, tid, ...principal }, userContext: {} });
    s.applicationDB = { getPushSubscriptionModel: () => model };
    return s;
}
function enable() {
    const k = webpush.generateVAPIDKeys();
    process.env.NOTIFY_V2_ENABLED = 'true';
    process.env.WEBPUSH_VAPID_PUBLIC = k.publicKey;
    process.env.WEBPUSH_VAPID_PRIVATE = k.privateKey;
    process.env.WEBPUSH_VAPID_SUBJECT = 'mailto:ops@example.com';
    return k;
}

beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; model = new FakeNotifyModel([], { unique: [['endpointHash']] }); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe('getPushConfig', () => {
    it('VAPID yoksa kanal kapalı (süreç çökmez), açık anahtar null, cihaz listesi okunmaz', async () => {
        process.env.NOTIFY_V2_ENABLED = 'true';
        expect(await svc().getPushConfig()).toEqual({ result: true, enabled: false, publicKey: null, fcm: false, devices: [] });
        process.env.WEBPUSH_VAPID_PUBLIC = 'bozuk'; process.env.WEBPUSH_VAPID_PRIVATE = 'x'; process.env.WEBPUSH_VAPID_SUBJECT = 'mailto:a@b.c';
        expect((await svc().getPushConfig()).enabled).toBe(false);
    });
    it('NOTIFY_V2 kapalıysa VAPID olsa da kapalı', async () => {
        enable(); process.env.NOTIFY_V2_ENABLED = 'false';
        expect((await svc().getPushConfig()).enabled).toBe(false);
    });
    it('açık: açık anahtar (özel anahtar ASLA) + yalnız kendi cihazlarım', async () => {
        const k = enable();
        await svc({ subscription: sub(), deviceLabel: 'iPhone · Safari' }).subscribePush();
        await svc({ subscription: sub(`${FCM}-b`) }, {}, 7, OTHER).subscribePush();
        const r = await svc().getPushConfig();
        expect(r).toMatchObject({ enabled: true, publicKey: k.publicKey });
        expect(JSON.stringify(r)).not.toContain(k.privateKey);
        expect(r.devices).toEqual([expect.objectContaining({ deviceLabel: 'iPhone · Safari' })]);
    });
});

describe('subscribePush / unsubscribePush', () => {
    it('kanal kapalı -> 409 PUSH_DISABLED; izinsiz uç -> 400 PUSH_ENDPOINT_NOT_ALLOWED (SSRF)', async () => {
        await expect(svc({ subscription: sub() }).subscribePush()).rejects.toMatchObject({ statusCode: 409, code: 'PUSH_DISABLED' });
        enable();
        await expect(svc({ subscription: sub('https://10.0.0.5/hook') }).subscribePush()).rejects.toMatchObject({ statusCode: 400, code: 'PUSH_ENDPOINT_NOT_ALLOWED' });
        expect(model.docs).toHaveLength(0);
    });
    it('destek oturumu (impersonation) abonelik yazamaz/silemez: 403', async () => {
        enable();
        await expect(svc({ subscription: sub() }, { imp: true }).subscribePush()).rejects.toMatchObject({ statusCode: 403, code: 'IMPERSONATION_READ_ONLY' });
        await expect(svc({ endpoint: FCM }, { imp: true }).unsubscribePush()).rejects.toMatchObject({ statusCode: 403 });
        expect((await svc({}, { imp: true }).getPushConfig()).devices).toEqual([]);
    });
    it('tenant + kullanıcı kapsamı: kayıt (tid, userId) ile; başka kullanıcı silemez; kanal kapalıyken de silinebilir', async () => {
        enable();
        await svc({ subscription: sub() }).subscribePush();
        expect(model.docs[0]).toMatchObject({ tid: 7, userId: UID });
        expect(await svc({ endpoint: FCM }, {}, 7, OTHER).unsubscribePush()).toMatchObject({ removed: 0 });
        expect(await svc({ endpoint: FCM }, {}, 8).unsubscribePush()).toMatchObject({ removed: 0 });
        delete process.env.WEBPUSH_VAPID_PUBLIC;
        expect(await svc({ id: String(model.docs[0]._id) }).unsubscribePush()).toMatchObject({ result: true, removed: 1 });
        expect(model.docs).toHaveLength(0);
    });
    it('uç ve kimlik birlikte ya da hiçbiri -> 400', async () => {
        await expect(svc({}).unsubscribePush()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ endpoint: FCM, id: 'aaaaaaaaaaaaaaaaaaaaaaa3' }).unsubscribePush()).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('yetenek kaydı (RBAC)', () => {
    it('üç uç: member + self:manage + kullanıcı kapsamı; MCP\'ye açık değil', () => {
        for (const id of ['notifications.push.config', 'notifications.push.subscribe', 'notifications.push.unsubscribe']) {
            const c: any = CAPABILITY_BY_ID.get(id as any);
            expect(c).toMatchObject({ minTier: 'member', permission: 'self:manage', scope: 'user' });
            expect(c.mcp.notExposed).toBeDefined();
        }
    });
});

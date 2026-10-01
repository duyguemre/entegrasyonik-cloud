// MOB-07: Android kabuğu yerel push (FCM HTTP v1). DB/ağ YOK: sahte fetch + bellek-içi model; RSA anahtarı test sürecinde üretilir.
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import NotificationService from '@api/rpc/handlers/notification-service';
import BackofficePrefsService from '@api/rpc/handlers/backoffice-prefs-service';
import { buildFcmMessage, createFcmSender, FCM_SCOPE, FCM_TOKEN_URL, resolveFcm, type FetchLike } from '../../../src/operations/notifications/push/fcm';
import { createPushSubscriptionPort, decodePushTarget, removePushSubscription, saveFcmToken, PushSubscriptionError } from '../../../src/operations/notifications/push/subscriptions';
import { classifyPushError } from '../../../src/operations/notifications/push/PushDispatcher';
import { PushSubscriptionRepository } from '../../../src/database/repositories/app/PushSubscriptionRepository';
import { NOTIFICATION_RPC_INPUT } from '../../../src/capabilities/rpc-input/notification';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const SA = { type: 'service_account', project_id: 'entegrasyonik-test', client_email: 'push@entegrasyonik-test.iam.gserviceaccount.com', private_key: privateKey };
const TOKEN = `cK1x:APA91b${'A'.repeat(140)}`;
const UID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEYS = ['NOTIFY_V2_ENABLED', 'WEBPUSH_VAPID_PUBLIC', 'WEBPUSH_VAPID_PRIVATE', 'WEBPUSH_VAPID_SUBJECT', 'FCM_SERVICE_ACCOUNT_JSON'];
const OPTS = { ttl: 43200, urgency: 'high' as const, topic: 'bo-attention' };
const PAYLOAD = JSON.stringify({ v: 1, title: 'Stok bildirimi', body: 'Ayrıntılar için Entegrasyonik’i açın.', url: '/stock', tag: 'ntf:1', severity: 'critical' });

const newModel = () => new FakeNotifyModel([], { unique: [['endpointHash']] });
const repoOf = (m: FakeNotifyModel) => new PushSubscriptionRepository({ getPushSubscriptionModel: () => m } as any);

describe('hizmet hesabı (yalnız env)', () => {
    it('ham JSON ve base64 kabul; eksik/bozuk -> neden (değer dönmez)', () => {
        expect(resolveFcm(JSON.stringify(SA))).toMatchObject({ ok: true, fcm: { projectId: 'entegrasyonik-test', clientEmail: SA.client_email } });
        expect(resolveFcm(Buffer.from(JSON.stringify(SA)).toString('base64'))).toMatchObject({ ok: true });
        expect(resolveFcm(undefined)).toEqual({ ok: false, reason: 'missing' });
        expect(resolveFcm('{bozuk')).toEqual({ ok: false, reason: 'invalid_json' });
        const bad = resolveFcm(JSON.stringify({ ...SA, private_key: 'gizli-deger' }));
        expect(bad).toEqual({ ok: false, reason: 'invalid_fields' });
        expect(JSON.stringify(bad)).not.toContain('gizli');
    });
});

describe('ileti gövdesi', () => {
    it('data (url dahil, string) + Android bildirimi; öncelik/TTL/collapse', () => {
        const m: any = buildFcmMessage({ token: TOKEN, payload: PAYLOAD, opts: OPTS });
        expect(m.message.token).toBe(TOKEN);
        expect(m.message.data).toEqual({ v: '1', title: 'Stok bildirimi', body: 'Ayrıntılar için Entegrasyonik’i açın.', url: '/stock', tag: 'ntf:1', severity: 'critical' });
        expect(m.message.android).toEqual({ priority: 'high', ttl: '43200s', collapse_key: 'bo-attention', notification: { title: 'Stok bildirimi', body: 'Ayrıntılar için Entegrasyonik’i açın.', tag: 'ntf:1' } });
    });
});

describe('FCM göndericisi', () => {
    function fakeFetch(sendStatus = 200) {
        const calls: Array<{ url: string; init: any }> = [];
        const f: FetchLike = async (url, init) => {
            calls.push({ url, init });
            if (url === FCM_TOKEN_URL) return { status: 200, json: async () => ({ access_token: 'ya29.test', expires_in: 3600 }) };
            return { status: sendStatus, json: async () => ({}) };
        };
        return { f, calls };
    }
    const cfg = () => (resolveFcm(JSON.stringify(SA)) as any).fcm;

    it('OAuth2 JWT-bearer (RS256, doğru kapsam/aud) → v1 messages:send; belirteç önbellekte', async () => {
        const { f, calls } = fakeFetch();
        let now = Date.parse('2026-10-01T10:00:00Z');
        const s = createFcmSender({ config: cfg, fetch: f, now: () => now });
        expect(await s.send(TOKEN, PAYLOAD, OPTS)).toEqual({ statusCode: 200 });
        await s.send(TOKEN, PAYLOAD, OPTS);
        expect(calls.filter((c) => c.url === FCM_TOKEN_URL)).toHaveLength(1);
        const assertion = new URLSearchParams(calls[0].init.body).get('assertion')!;
        expect(jwt.verify(assertion, publicKey, { algorithms: ['RS256'], clockTimestamp: Math.floor(now / 1000) })).toMatchObject({ iss: SA.client_email, scope: FCM_SCOPE, aud: FCM_TOKEN_URL });
        expect(calls[1].url).toBe('https://fcm.googleapis.com/v1/projects/entegrasyonik-test/messages:send');
        expect(calls[1].init.headers.Authorization).toBe('Bearer ya29.test');
        now += 3600_000; // süre doldu → yenilenir
        await s.send(TOKEN, PAYLOAD, OPTS);
        expect(calls.filter((c) => c.url === FCM_TOKEN_URL)).toHaveLength(2);
    });
    it('404 (UNREGISTERED) → abonelik biter; 400 → kalıcı; 429/5xx → geçici; 401 → geçici + belirteç yenilenir; yapılandırma yok → 503', async () => {
        for (const [status, kind] of [[404, 'gone'], [400, 'permanent'], [429, 'transient'], [503, 'transient'], [401, 'transient']] as const) {
            const s = createFcmSender({ config: cfg, fetch: fakeFetch(status).f });
            const err = await s.send(TOKEN, PAYLOAD, OPTS).catch((e) => e);
            expect([status, classifyPushError(err).kind]).toEqual([status, kind]);
        }
        await expect(createFcmSender({ config: () => undefined, fetch: fakeFetch().f }).send(TOKEN, PAYLOAD, OPTS)).rejects.toMatchObject({ statusCode: 503 });
    });
});

describe('FCM belirteci saklama', () => {
    it('şifreli saklanır, hedefe çözülür, belirteçle silinir; bozuk belirteç reddedilir', async () => {
        const m = newModel(); const repo = repoOf(m);
        await saveFcmToken(repo, { tid: 7, userId: UID, token: TOKEN, deviceLabel: 'Android · Uygulama', now: new Date() });
        expect(m.docs[0].sub).toMatch(/^enc:v1:/);
        expect(JSON.stringify(m.docs[0])).not.toContain(TOKEN);
        expect(decodePushTarget(m.docs[0] as any)).toEqual({ id: String(m.docs[0]._id), fcmToken: TOKEN });
        expect(await createPushSubscriptionPort(repo).listForUser(7, UID)).toEqual([{ id: String(m.docs[0]._id), fcmToken: TOKEN }]);
        await saveFcmToken(repo, { tid: 7, userId: UID, token: TOKEN, now: new Date() });
        expect(m.docs).toHaveLength(1); // aynı belirteç = tek kayıt
        await expect(saveFcmToken(repo, { tid: 7, userId: UID, token: 'kisa', now: new Date() })).rejects.toBeInstanceOf(PushSubscriptionError);
        expect(await removePushSubscription(repo, { tid: 7, userId: UID, fcmToken: TOKEN })).toBe(1);
    });
});

describe('RPC (tenant + backoffice): FCM belirteci', () => {
    let model: FakeNotifyModel;
    let saved: Record<string, string | undefined>;
    const tenant = (body: any = {}) => { const s: any = new NotificationService(7, { ...body, principal: { sub: UID, tid: 7 }, userContext: {} }); s.applicationDB = { getPushSubscriptionModel: () => model }; return s; };
    const bo = (body: any = {}) => { const s: any = new BackofficePrefsService(undefined as any, { ...body, principal: { sub: UID, ga: true } }); s.applicationDB = { getPushSubscriptionModel: () => model }; return s; };
    beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; model = newModel(); process.env.NOTIFY_V2_ENABLED = 'true'; });
    afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } jest.restoreAllMocks(); });

    it('yalnız FCM açık: kanal açık, publicKey null, fcm true; FCM belirteci kaydı; web aboneliği 409', async () => {
        process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify(SA);
        expect(await tenant().getPushConfig()).toEqual({ result: true, enabled: true, publicKey: null, fcm: true, devices: [] });
        await tenant({ fcmToken: TOKEN, deviceLabel: 'Android · Uygulama' }).subscribePush();
        await bo({ fcmToken: `${TOKEN}b` }).subscribePush();
        expect(model.docs.map((d: any) => d.tid).sort()).toEqual([0, 7]);
        const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
        const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
        await expect(tenant({ subscription: sub }).subscribePush()).rejects.toMatchObject({ statusCode: 409, code: 'PUSH_DISABLED' });
        expect(await tenant({ fcmToken: TOKEN }).unsubscribePush()).toMatchObject({ removed: 1 });
        expect(await bo({ fcmToken: `${TOKEN}b` }).unsubscribePush()).toEqual({ removed: 1 });
    });
    it('yalnız VAPID açık: FCM belirteci 409; ikisi birden/hiçbiri 400; şema strict', async () => {
        const k = webpush.generateVAPIDKeys();
        process.env.WEBPUSH_VAPID_PUBLIC = k.publicKey; process.env.WEBPUSH_VAPID_PRIVATE = k.privateKey; process.env.WEBPUSH_VAPID_SUBJECT = 'mailto:ops@example.com';
        expect(await bo().getPushConfig()).toMatchObject({ enabled: true, publicKey: k.publicKey, fcm: false });
        await expect(tenant({ fcmToken: TOKEN }).subscribePush()).rejects.toMatchObject({ statusCode: 409 });
        await expect(tenant({}).subscribePush()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
        await expect(bo({ fcmToken: TOKEN, subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } }).subscribePush()).rejects.toMatchObject({ statusCode: 400 });
        await expect(tenant({ endpoint: 'https://fcm.googleapis.com/x', fcmToken: TOKEN }).unsubscribePush()).rejects.toMatchObject({ statusCode: 400 });
        const schema = NOTIFICATION_RPC_INPUT['NotificationService/subscribePush']!;
        expect(schema.safeParse({ fcmToken: TOKEN }).success).toBe(true);
        expect(schema.safeParse({ fcmToken: 'x y' }).success).toBe(false);
    });
});

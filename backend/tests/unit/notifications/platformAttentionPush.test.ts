// MOB-06: backoffice web push -- platform yöneticisi aboneliği + yalnız kritik dikkat maddeleri. DB/ağ YOK: bellek-içi sahte model,
// sahte gönderici. VAPID test sürecinde üretilir, hiçbir yere yazılmaz.
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';
import webpush from 'web-push';
import BackofficePrefsService from '@api/rpc/handlers/backoffice-prefs-service';
import {
    ATTENTION_PUSH_TAG, ATTENTION_RENOTIFY_MS, buildAttentionPushPayload, criticalAttentionItems, dueCriticalIds, PLATFORM_PUSH_TID, PlatformAttentionPusher,
    type PlatformAttentionPushDeps,
} from '../../../src/operations/notifications/push/platformAttentionPush';
import { savePushSubscription } from '../../../src/operations/notifications/push/subscriptions';
import type { PushSender } from '../../../src/operations/notifications/push/PushDispatcher';
import { PushSubscriptionRepository } from '../../../src/database/repositories/app/PushSubscriptionRepository';
import { BACKOFFICE_ATTENTION_RPC_INPUT } from '../../../src/capabilities/rpc-input/backoffice-attention';
import { CAPABILITY_BY_ID } from '../../../src/capabilities';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

const ADMIN = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const ADMIN2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const FCM = 'https://fcm.googleapis.com/fcm/send/bo1';
const KEYS = ['NOTIFY_V2_ENABLED', 'WEBPUSH_VAPID_PUBLIC', 'WEBPUSH_VAPID_PRIVATE', 'WEBPUSH_VAPID_SUBJECT'];
const T0 = Date.parse('2026-10-01T10:00:00Z');

function sub(endpoint = FCM) {
    const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
    return { endpoint, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
}
const newModel = () => new FakeNotifyModel([], { unique: [['endpointHash']] });
const repoOf = (model: FakeNotifyModel) => new PushSubscriptionRepository({ getPushSubscriptionModel: () => model } as any);

function attention(items: Array<{ id: string; severity: string; title: string; group?: 'system' | 'customers'; subjects?: any[] }>) {
    const of = (g: string) => ({ items: items.filter((i) => (i.group ?? 'system') === g).map((i) => ({ subjects: [], ...i })) });
    return { status: 'attention', groups: { system: of('system'), customers: of('customers') } };
}

describe('saf kurallar', () => {
    it('yalnız kritik maddeler (sistem önce), konu/tenant adı alınmaz; bozuk yanıt -> boş', () => {
        const a = attention([
            { id: 'cus.pastdue', severity: 'critical', title: 'Ödeme sorunu', group: 'customers', subjects: [{ tid: 4, name: 'Gizli Mağaza AŞ' }] },
            { id: 'sys.queue.backlog', severity: 'warning', title: 'Kuyrukta birikim' },
            { id: 'sys.queue.unavailable', severity: 'critical', title: 'Kuyruk okunamıyor' },
        ]);
        expect(criticalAttentionItems(a)).toEqual([{ id: 'sys.queue.unavailable', title: 'Kuyruk okunamıyor' }, { id: 'cus.pastdue', title: 'Ödeme sorunu' }]);
        expect(JSON.stringify(buildAttentionPushPayload(criticalAttentionItems(a)))).not.toContain('Gizli Mağaza');
        expect(criticalAttentionItems(null)).toEqual([]);
        expect(criticalAttentionItems({ groups: { system: { items: 'x' } } })).toEqual([]);
    });
    it('içerik: tek madde başlıkta; çok madde sayı + en çok 3 başlık; hedef "/" + sabit etiket', () => {
        expect(buildAttentionPushPayload([{ id: 'a', title: 'Kuyruk okunamıyor' }])).toEqual({
            v: 1, title: 'Kritik: Kuyruk okunamıyor', body: 'Ayrıntılar için yönetim panelini açın.', url: '/', tag: ATTENTION_PUSH_TAG, severity: 'critical',
        });
        const many = buildAttentionPushPayload(['A', 'B', 'C', 'D', 'E'].map((t) => ({ id: t, title: t })));
        expect(many.title).toBe('5 kritik dikkat maddesi');
        expect(many.body).toBe('A · B · C ve 2 madde daha');
    });
    it('tekrar: yeni madde ya da süre dolunca; çözülen madde budanır ve tekrar kritikleşince yeniden bildirilir', () => {
        const seen = new Map<string, number>();
        const it1 = [{ id: 'a', title: 'A' }];
        expect(dueCriticalIds(it1, seen, T0)).toEqual(['a']);
        seen.set('a', T0);
        expect(dueCriticalIds(it1, seen, T0 + 60_000)).toEqual([]);
        expect(dueCriticalIds(it1, seen, T0 + ATTENTION_RENOTIFY_MS)).toEqual(['a']);
        expect(dueCriticalIds([], seen, T0 + 1)).toEqual([]);
        expect(seen.size).toBe(0);
    });
});

describe('PlatformAttentionPusher', () => {
    let model: FakeNotifyModel;
    let sent: Array<{ endpoint: string; payload: any; opts: any }>;
    let failFor: Map<string, number>;
    let attentionCalls: number;
    let crit: any;
    let admins: Set<string>;
    const sender: PushSender = {
        async send(t, payload, opts) {
            const code = failFor.get(t.endpoint);
            if (code !== undefined) throw Object.assign(new Error('x'), code ? { statusCode: code } : {});
            sent.push({ endpoint: t.endpoint, payload: JSON.parse(payload), opts }); return { statusCode: 201 };
        },
    };
    function pusher(over: Partial<PlatformAttentionPushDeps> = {}, seen = new Map<string, number>()) {
        return new PlatformAttentionPusher({
            enabled: () => true, repo: repoOf(model), sender, seen, now: () => T0,
            activeAdminIds: async (ids) => new Set(ids.filter((i) => admins.has(i))),
            getAttention: async () => { attentionCalls++; return crit; },
            ...over,
        });
    }
    async function subscribe(userId: string, endpoint: string, tid = PLATFORM_PUSH_TID) {
        await savePushSubscription(repoOf(model), { tid, userId, subscription: sub(endpoint), now: new Date(T0) });
    }
    beforeEach(() => {
        model = newModel(); sent = []; failFor = new Map(); attentionCalls = 0; admins = new Set([ADMIN, ADMIN2]);
        crit = attention([{ id: 'sys.queue.unavailable', severity: 'critical', title: 'Kuyruk okunamıyor' }, { id: 'sys.x', severity: 'warning', title: 'Uyarı' }]);
    });

    it('kanal kapalı -> hiçbir şeye dokunmaz', async () => {
        const repo = { listByTid: async () => { throw new Error('DB çağrılmamalı'); }, deleteById: async () => undefined, markSuccess: async () => undefined };
        expect(await pusher({ enabled: () => false, repo }).runOnce()).toMatchObject({ skipped: 'disabled', processed: 0 });
    });
    it('abone yönetici yoksa dikkat HESAPLANMAZ; tenant (tid>0) abonelikleri hedef değildir', async () => {
        await subscribe(ADMIN, FCM, 7);
        expect(await pusher().runOnce()).toMatchObject({ skipped: 'no_subscription' });
        expect(attentionCalls).toBe(0);
    });
    it('kritik madde -> tüm yönetici cihazlarına yüksek öncelikli push; ikinci tur tekrar etmez', async () => {
        await subscribe(ADMIN, FCM); await subscribe(ADMIN2, `${FCM}-2`);
        const seen = new Map<string, number>();
        const r = await pusher({}, seen).runOnce();
        expect(r).toMatchObject({ processed: 2, failed: 0 });
        expect(sent.map((s) => s.endpoint).sort()).toEqual([FCM, `${FCM}-2`]);
        expect(sent[0].payload).toMatchObject({ title: 'Kritik: Kuyruk okunamıyor', url: '/', tag: ATTENTION_PUSH_TAG });
        expect(sent[0].opts).toMatchObject({ urgency: 'high', topic: ATTENTION_PUSH_TAG });
        sent = [];
        expect(await pusher({}, seen).runOnce()).toMatchObject({ processed: 0 });
        expect(sent).toHaveLength(0);
    });
    it('yalnız uyarı (kritik yok) -> gönderim yok', async () => {
        await subscribe(ADMIN, FCM);
        crit = attention([{ id: 'sys.x', severity: 'warning', title: 'Uyarı' }]);
        await pusher().runOnce();
        expect(sent).toHaveLength(0);
    });
    it('yetkisi alınan (artık platform yöneticisi değil/pasif) kişinin aboneliği silinir ve push almaz', async () => {
        await subscribe(ADMIN, FCM); await subscribe(ADMIN2, `${FCM}-2`);
        admins = new Set([ADMIN]);
        const r = await pusher().runOnce();
        expect(r.note).toContain('revoked=1');
        expect(sent.map((s) => s.endpoint)).toEqual([FCM]);
        expect(model.docs.map((d: any) => d.userId)).toEqual([ADMIN]);
    });
    it('404/410 -> abonelik silinir; yalnız geçici hata -> durum yazılmaz, sonraki turda yeniden denenir', async () => {
        await subscribe(ADMIN, FCM); await subscribe(ADMIN2, `${FCM}-2`);
        failFor.set(FCM, 410); failFor.set(`${FCM}-2`, 503);
        const seen = new Map<string, number>();
        const r = await pusher({}, seen).runOnce();
        expect(r.note).toContain('removed=1');
        expect(model.docs).toHaveLength(1);
        expect(seen.size).toBe(0);
        failFor.clear();
        await pusher({}, seen).runOnce();
        expect(sent.map((s) => s.endpoint)).toEqual([`${FCM}-2`]);
        expect(seen.has('sys.queue.unavailable')).toBe(true);
    });
});

describe('BackofficePrefsService push uçları', () => {
    let model: FakeNotifyModel;
    let saved: Record<string, string | undefined>;
    const svc = (body: any = {}, principalSub: string | null = ADMIN) => {
        const s: any = new BackofficePrefsService(undefined as any, { ...body, principal: principalSub ? { sub: principalSub, ga: true } : undefined });
        s.applicationDB = { getPushSubscriptionModel: () => model };
        return s;
    };
    function enable() {
        const k = webpush.generateVAPIDKeys();
        process.env.NOTIFY_V2_ENABLED = 'true'; process.env.WEBPUSH_VAPID_PUBLIC = k.publicKey;
        process.env.WEBPUSH_VAPID_PRIVATE = k.privateKey; process.env.WEBPUSH_VAPID_SUBJECT = 'mailto:ops@example.com';
        return k;
    }
    beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; model = newModel(); });
    afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

    it('kanal kapalı: getPushConfig kapalı, subscribe 409; açık: açık anahtar (özel ASLA) + yalnız kendi cihazlarım', async () => {
        expect(await svc().getPushConfig()).toEqual({ enabled: false, publicKey: null, devices: [] });
        await expect(svc({ subscription: sub() }).subscribePush()).rejects.toMatchObject({ statusCode: 409, code: 'PUSH_DISABLED' });
        const k = enable();
        await svc({ subscription: sub(), deviceLabel: 'Android · Chrome' }).subscribePush();
        await svc({ subscription: sub(`${FCM}-b`) }, ADMIN2).subscribePush();
        const r = await svc().getPushConfig();
        expect(r).toMatchObject({ enabled: true, publicKey: k.publicKey, devices: [expect.objectContaining({ deviceLabel: 'Android · Chrome' })] });
        expect(r.devices).toHaveLength(1);
        expect(JSON.stringify(r)).not.toContain(k.privateKey);
        expect(model.docs[0]).toMatchObject({ tid: PLATFORM_PUSH_TID, userId: ADMIN });
    });
    it('izinsiz uç -> 400 (SSRF); başka yönetici silemez; kanal kapalıyken de silinir; oturumsuz -> 401', async () => {
        enable();
        await expect(svc({ subscription: sub('https://10.0.0.5/x') }).subscribePush()).rejects.toMatchObject({ statusCode: 400, code: 'PUSH_ENDPOINT_NOT_ALLOWED' });
        await svc({ subscription: sub() }).subscribePush();
        expect(await svc({ endpoint: FCM }, ADMIN2).unsubscribePush()).toEqual({ removed: 0 });
        await expect(svc({}).unsubscribePush()).rejects.toMatchObject({ statusCode: 400 });
        await expect(svc({ endpoint: FCM }, null).unsubscribePush()).rejects.toMatchObject({ statusCode: 401 });
        delete process.env.WEBPUSH_VAPID_PUBLIC;
        expect(await svc({ id: String(model.docs[0]._id) }).unsubscribePush()).toEqual({ removed: 1 });
    });
    it('gövde şemaları strict; yetenekler platformAdmin + MCP dışı', () => {
        expect(BACKOFFICE_ATTENTION_RPC_INPUT['BackofficePrefsService/subscribePush']!.safeParse({ subscription: { endpoint: FCM, keys: { p256dh: 'a', auth: 'b' } }, extra: 1 }).success).toBe(false);
        expect(BACKOFFICE_ATTENTION_RPC_INPUT['BackofficePrefsService/getPushConfig']!.safeParse({}).success).toBe(true);
        for (const id of ['platform.prefs.push_config', 'platform.prefs.push_subscribe', 'platform.prefs.push_unsubscribe']) {
            const c: any = CAPABILITY_BY_ID.get(id as any);
            expect(c).toMatchObject({ minTier: 'platformAdmin' });
            expect(c.mcp.notExposed).toBeDefined();
        }
    });
});

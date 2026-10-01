// MOB-04: web push gondericisinin uretim baglantisi. Modeller tembel cozulur; kanal kapaliyken (`runOnce` erken doner) DB cagrisi yok.
// Tasiyici `web-push` (MPL-2.0; RFC 8030/8291/8292: aes128gcm + VAPID) tembel yuklenir.
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { PushSubscriptionRepository } from '@database/repositories/app/PushSubscriptionRepository';
import { config } from '@config';
import { MongoDeliveryStore } from '../delivery/deliveryStore';
import { createEmailDispatcherDeps, lazyModelPort } from '../delivery/createEmailDispatcher';
import { PushDispatcher, type LedgerEventLite, type PushSender } from './PushDispatcher';
import { createPushSubscriptionPort, type PushSubscriptionRepoLike } from './subscriptions';
import { currentFcm, currentVapid, isPushEnabled } from './pushConfig';
import { createFcmSender } from './fcm';

const app = () => DatabaseManagerInstance.getApplicationDB();

/** Her cagrida ApplicationDB'yi tembel cozen depo (bayrak kapaliyken hic cagrilmaz). */
function lazyRepo(): PushSubscriptionRepoLike {
    const r = async () => new PushSubscriptionRepository(await app());
    return {
        upsertByHash: async (...a) => (await r()).upsertByHash(...a),
        listByUser: async (...a) => (await r()).listByUser(...a),
        deleteOwned: async (...a) => (await r()).deleteOwned(...a),
        deleteManyByIds: async (...a) => (await r()).deleteManyByIds(...a),
        deleteById: async (...a) => (await r()).deleteById(...a),
        markSuccess: async (...a) => (await r()).markSuccess(...a),
    };
}

let fcmSender: ReturnType<typeof createFcmSender> | undefined;

/** Hedef turune gore tasiyici: tarayici aboneligi -> web-push (VAPID), FCM belirteci -> FCM HTTP v1 (MOB-07 Android kabugu). */
export function createWebPushSender(): PushSender {
    return {
        async send(target, payload, opts) {
            if ('fcmToken' in target) {
                fcmSender ??= createFcmSender({ config: currentFcm });
                return fcmSender.send(target.fcmToken, payload, opts);
            }
            const vapid = currentVapid();
            if (!vapid) throw Object.assign(new Error('web push kapali'), { statusCode: 503 });
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme
            const webpush = require('web-push') as typeof import('web-push');
            const r = await webpush.sendNotification({ endpoint: target.endpoint, keys: target.keys }, payload, {
                vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
                TTL: opts.ttl, urgency: opts.urgency, timeout: 10_000, ...(opts.topic ? { topic: opts.topic } : {}),
            });
            return { statusCode: r?.statusCode };
        },
    };
}

export function createPushDispatcher(): PushDispatcher {
    const email = createEmailDispatcherDeps(); // tercih okuma ayni (NotificationPreferences)
    return new PushDispatcher({
        store: new MongoDeliveryStore(lazyModelPort(), 'push'),
        subscriptions: createPushSubscriptionPort(lazyRepo()),
        sender: createWebPushSender(),
        flags: () => ({ v2Enabled: config.notify.v2Enabled, pushEnabled: isPushEnabled() }),
        loadPrefs: email.loadPrefs,
        async loadEvents(ids) {
            const rows: any[] = await (await app()).getNotificationEventModel().find({ _id: { $in: ids } }, { params: 1, severity: 1 }).lean();
            return new Map<string, LedgerEventLite>(rows.map((r) => [String(r._id), { params: r.params, severity: r.severity }]));
        },
    });
}

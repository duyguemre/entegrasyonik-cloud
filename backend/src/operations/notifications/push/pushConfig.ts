// MOB-04: web push kanal durumu (uretim). VAPID yalniz env'den; yoksa/gecersizse kanal KAPALI ve surec calismaya devam eder
// (gecersiz yapilandirma bir kez uyari olarak loglanir; deger loglanmaz).
import { config } from '@config';
import { logger } from '@platform/core/logger';
import { resolveVapid, type VapidConfig } from './vapid';
import { resolveFcm, type FcmConfig } from './fcm';

const log = logger.child({ module: 'notifications.push' });
let warned = false;

export function currentVapid(): VapidConfig | undefined {
    const r = resolveVapid(config.notify.webpush);
    if (r.ok) return r.vapid;
    if (r.reason !== 'missing' && !warned) { warned = true; log.warn({ reason: r.reason }, 'WEBPUSH_VAPID_* gecersiz: web push kanali KAPALI'); }
    return undefined;
}

let fcmWarned = false;
/** MOB-07: FCM hizmet hesabi (yalniz env). Yoksa/bozuksa undefined (bir kez uyari; deger loglanmaz). */
export function currentFcm(): FcmConfig | undefined {
    const r = resolveFcm(config.notify.fcmServiceAccount);
    if (r.ok) return r.fcm;
    if (r.reason !== 'missing' && !fcmWarned) { fcmWarned = true; log.warn({ reason: r.reason }, 'FCM_SERVICE_ACCOUNT_JSON gecersiz: Android kabugu push KAPALI'); }
    return undefined;
}

/** Tarayici web push (VAPID) acik mi. */
export function isWebPushEnabled(): boolean {
    return config.notify.v2Enabled === true && currentVapid() !== undefined;
}

/** Android kabugu yerel push (FCM) acik mi. */
export function isFcmEnabled(): boolean {
    return config.notify.v2Enabled === true && currentFcm() !== undefined;
}

/** Kanal acik mi: NOTIFY_V2_ENABLED + (gecerli VAPID uclusu YA DA FCM hizmet hesabi). */
export function isPushEnabled(): boolean {
    return isWebPushEnabled() || isFcmEnabled();
}

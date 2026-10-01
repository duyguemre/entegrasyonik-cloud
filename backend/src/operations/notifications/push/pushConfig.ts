// MOB-04: web push kanal durumu (uretim). VAPID yalniz env'den; yoksa/gecersizse kanal KAPALI ve surec calismaya devam eder
// (gecersiz yapilandirma bir kez uyari olarak loglanir; deger loglanmaz).
import { config } from '@config';
import { logger } from '@platform/core/logger';
import { resolveVapid, type VapidConfig } from './vapid';

const log = logger.child({ module: 'notifications.push' });
let warned = false;

export function currentVapid(): VapidConfig | undefined {
    const r = resolveVapid(config.notify.webpush);
    if (r.ok) return r.vapid;
    if (r.reason !== 'missing' && !warned) { warned = true; log.warn({ reason: r.reason }, 'WEBPUSH_VAPID_* gecersiz: web push kanali KAPALI'); }
    return undefined;
}

/** Kanal acik mi: NOTIFY_V2_ENABLED + gecerli VAPID uclusu. */
export function isPushEnabled(): boolean {
    return config.notify.v2Enabled === true && currentVapid() !== undefined;
}

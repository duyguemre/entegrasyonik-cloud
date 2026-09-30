import { notificationEventBus } from './NotificationEventBus';
import { SendNotificationEvent, NOTIFICATION_EVENTS, IClientOperations } from '@interfaces/index';
import { config } from '@config';
import { logger } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics';

const log = logger.child({ module: 'notifications.facade' });

/**
 * [ADR-0029 Karar 2] Cephe: `notify()` ve `sendClientNotification()` bootstrap'ta ENJEKTE edilen bir sink'e iletir
 * (`operations/notifications/notify.ts`). ADR-0024 katman kurali: `services -> operations` importu YOK; sink tipi burada tanimlidir.
 */
export type NotifyResultLike = { status: 'created' | 'grouped' | 'duplicate' | 'suppressed' | 'skipped' | 'failed'; eventId?: string; recipients?: number; reason?: string };
export interface NotificationSink {
    notify(code: string, tid: number, params: Record<string, unknown>, opts?: {
        idempotencyKey?: string; recipients?: { userIds: string[] }; actorUserId?: string; actorImpersonating?: boolean;
        occurredAt?: Date; corrId?: string; module?: string;
    }): Promise<NotifyResultLike>;
    notifyLegacy(tid: number, n: {
        type: string; mode?: string; severity?: string; title: string; message: string; actionUrl?: string;
        metaData?: Record<string, unknown>; userId?: string;
    }): Promise<NotifyResultLike>;
}

export interface LegacyFallback {
    /** Bayrak kapalıyken bugünkü yolun birebir olayı. */
    event: SendNotificationEvent;
    /** Bayrak kapalıyken eski süreç içi kısma (bayrak açıkken defter grubu kısar). */
    throttle?: { key: string; ms: number };
}
export type NotifyOpts = Parameters<NotificationSink['notify']>[3] & { legacy?: LegacyFallback };

export class NotificationService {
    private static sink: NotificationSink | undefined;

    /** Bootstrap enjeksiyonu (test: `setSink(undefined)` ile temizlenir). */
    static setSink(sink: NotificationSink | undefined) { NotificationService.sink = sink; }

    /**
     * Sistemi bir kez ayağa kaldırır ve dinlemeye başlar
     */
    static init(clientOperations: IClientOperations, sink?: NotificationSink) {
        if (sink) NotificationService.sink = sink;
        console.log("[\x1b[32mNotificationService\x1b[0m] Initialized and listening...");
        notificationEventBus.on(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION, async (event: SendNotificationEvent) => {
            const { clientId, notificationData } = event;
            try {
                // [GV-09] await: aksi halde reddedilen kayıt try/catch'e düşmez (unhandledRejection, sessiz kayıp)
                await clientOperations.saveNotification(clientId, notificationData);
            } catch (error) {
                console.error("[NotificationService] Error storing notification:", error);
            }
        });

        // Yarın öbür gün UI_NOTIFY gibi başka eventler gelirse onlar da buraya eklenir
    }

    /**
     * [ADR-0029] Tek giriş noktası: katalog koduyla bildirim üretir. ASLA fırlatmaz.
     * Sink yoksa (test, erken açılış) kayıt `warn` ile düşürülür.
     *
     * NB3 (bayrak KAPALI eşdeğerliği): çağıran `opts.legacy` verirse ve NOTIFY_V2_ENABLED=false ise bugünkü davranış BİREBİR
     * uygulanır (eski `sendClientNotification` yolu; `legacy.throttle` verilmişse süreç içi kısma, yalnız bu yolda).
     * Bayrak açıkken `legacy` yok sayılır; katalog kodu + params çekirdeğe gider (kısma/gruplama defterde).
     */
    static async notify(code: string, tenantId: number, params: Record<string, unknown>, opts?: NotifyOpts): Promise<NotifyResultLike> {
        const { legacy, ...sinkOpts } = opts ?? {};
        let result: NotifyResultLike;
        if (!config.notify.v2Enabled && legacy) {
            result = await NotificationService.legacySend(legacy);
        } else {
            const sink = NotificationService.sink;
            if (!sink) {
                log.warn({ notifyCode: code }, 'notify düşürüldü: sink enjekte edilmemiş');
                result = { status: 'skipped', reason: 'no_sink' };
            } else {
                try {
                    result = await sink.notify(code, tenantId, params, sinkOpts);
                } catch (error) {
                    log.error({ err: { message: (error as Error)?.message }, notifyCode: code }, 'notify hatası');
                    result = { status: 'failed', reason: 'exception' };
                }
            }
        }
        try { metricsRegistry.incCounter('notifications.notify', { code, result: result.status }); } catch { /* metrik asla akışı bozmaz */ }
        return result;
    }

    private static legacyThrottle = new Map<string, number>();
    /** Yalnız test. */
    static resetLegacyThrottleForTests() { NotificationService.legacyThrottle.clear(); }

    private static async legacySend(legacy: LegacyFallback): Promise<NotifyResultLike> {
        if (legacy.throttle) {
            const now = Date.now();
            const last = NotificationService.legacyThrottle.get(legacy.throttle.key);
            if (last !== undefined && now - last < legacy.throttle.ms) return { status: 'grouped', reason: 'legacy_throttled' };
            NotificationService.legacyThrottle.set(legacy.throttle.key, now);
        }
        try {
            await NotificationService.sendClientNotification(legacy.event);
            return { status: 'created', reason: 'legacy_path' };
        } catch (error) {
            log.error({ err: { message: (error as Error)?.message } }, 'legacy bildirim hatası');
            return { status: 'failed', reason: 'exception' };
        }
    }

    static async sendClientNotification(event: SendNotificationEvent) {
        // NOTIFY_V2_ENABLED=false (varsayılan): bugünkü davranış BİREBİR (olay yolu -> saveNotification).
        // true: uyum köprüsü notify çekirdeğine yönlenir (metaData.code katalogdaysa o kod, yoksa LEGACY_<type>).
        if (config.notify.v2Enabled && NotificationService.sink) {
            try {
                const n = event.notificationData;
                await NotificationService.sink.notifyLegacy(Number(event.clientId), {
                    type: n.type, mode: n.mode, severity: n.severity, title: n.title, message: n.message, actionUrl: n.actionUrl, metaData: n.metaData,
                });
            } catch (error) {
                log.error({ err: { message: (error as Error)?.message } }, 'notifyLegacy hatası');
            }
            return;
        }
        notificationEventBus.emit(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION, event);
    }
}

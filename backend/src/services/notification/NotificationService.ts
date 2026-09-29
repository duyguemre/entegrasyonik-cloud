import { notificationEventBus } from './NotificationEventBus';
import { SendNotificationEvent, NOTIFICATION_EVENTS, IClientOperations } from '@interfaces/index';

export class NotificationService {
    /**
     * Sistemi bir kez ayağa kaldırır ve dinlemeye başlar
     */
    static init(clientOperations: IClientOperations) {
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

    static async sendClientNotification(event: SendNotificationEvent) {
        notificationEventBus.emit(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION, event);
    }
}
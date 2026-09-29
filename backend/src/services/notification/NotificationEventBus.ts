import { EventEmitter } from 'events';
/**
 * Global Bildirim Bus Sınıfı
 */
class NotificationEventBus extends EventEmitter {
    constructor() {
        super();
        // Memory leak uyarılarını önlemek için sınırı artırıyoruz
        this.setMaxListeners(50);
    }
}

// Singleton Instance
export const notificationEventBus = new NotificationEventBus();


// ADR-0029 NB8: `PlatformNotifier` uretim baglantisi (modeller tembel; NOTIFY_V2_ENABLED=false iken hicbir koleksiyona dokunulmaz).
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { PlatformNotifier } from './platformNotify';
import { parseAlertRecipients } from './platformRecipients';

const app = () => DatabaseManagerInstance.getApplicationDB();

export function createPlatformNotifier(): PlatformNotifier {
    const call = (getter: 'getNotificationEventModel' | 'getNotificationDeliveryModel', m: string) => async (...a: any[]) => ((await app()) as any)[getter]()[m](...a);
    return new PlatformNotifier({
        ledgerModel: { create: call('getNotificationEventModel', 'create'), updateOne: call('getNotificationEventModel', 'updateOne'), findOneAndUpdate: call('getNotificationEventModel', 'findOneAndUpdate'), deleteOne: call('getNotificationEventModel', 'deleteOne') },
        deliveryModel: { insertMany: call('getNotificationDeliveryModel', 'insertMany') },
        flags: () => ({ v2Enabled: config.notify.v2Enabled, emailEnabled: config.notify.emailEnabled }),
        recipients: () => parseAlertRecipients(config.notify.alertEmailTo),
    });
}

// MOB-06: backoffice kritik dikkat push'unun uretim baglantisi (saf mantik: operations/notifications/push/platformAttentionPush.ts).
// Dikkat maddeleri BackofficeOverviewService/getAttention ile AYNI kaynaklardan (productionAttentionSources) hesaplanir; yeni sorgu yok.
// Kanal kapaliyken `runOnce` erken doner: ApplicationDB cozulmez.
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { PushSubscriptionRepository } from '@database/repositories/app/PushSubscriptionRepository';
import { isPushEnabled } from '@operations/notifications/push/pushConfig';
import { createWebPushSender } from '@operations/notifications/push/createPushDispatcher';
import { PlatformAttentionPusher } from '@operations/notifications/push/platformAttentionPush';
import { AttentionOps, MAX_GROUP_LIMIT } from './attentionOps';
import { productionAttentionSources } from '../rpc/handlers/backoffice-attention-support';

const app = () => DatabaseManagerInstance.getApplicationDB();

export function createAttentionPusher(): PlatformAttentionPusher {
    const repo = async () => new PushSubscriptionRepository(await app());
    return new PlatformAttentionPusher({
        enabled: isPushEnabled,
        repo: {
            listByTid: async (tid) => (await repo()).listByTid(tid),
            deleteById: async (id) => (await repo()).deleteById(id),
            markSuccess: async (id, at) => (await repo()).markSuccess(id, at),
        },
        async activeAdminIds(userIds) {
            const ids = userIds.filter((u) => /^[a-f0-9]{24}$/i.test(u)); // bicimsiz kimlik CastError ile tum turu dusurmesin (alici sayilmaz -> silinir)
            const rows: any[] = ids.length ? await (await app()).getUserModel().find({ _id: { $in: ids }, isGlobalAdmin: true, isActive: { $ne: false } }, { _id: 1 }).lean() : [];
            return new Set(rows.map((r) => String(r._id)));
        },
        getAttention: async () => new AttentionOps({ sources: productionAttentionSources(await app()) }).getAttention(MAX_GROUP_LIMIT),
        sender: createWebPushSender(),
    });
}

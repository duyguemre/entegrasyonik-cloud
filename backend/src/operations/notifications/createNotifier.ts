// ADR-0029 NB2: uretim baglantisi (bootstrap enjekte eder). ApplicationDB defter/outbox modelleri + tenant DB `Notifications`
// + Users'tan uye listesi (30 sn surec-ici TTL onbellegi; ADR-0028 MembershipCache gelince o kullanilir).
// NOTIFY_V2_ENABLED=false iken bu modelleri HIC cagirmaz (bayrak notify icinde denetlenir) -> yeni koleksiyonlara dokunulmaz.
import { config } from '@config';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { Notifier, NotifyDeps } from './notify';
import { memberTier, type Member } from './audience';
import { can } from '@platform/core/authz/can';
import { getRealtimeBus } from '@platform/runtime/realtime';

const MEMBER_TTL_MS = 30_000;

export function createNotifierDeps(): NotifyDeps {
    const cache = new Map<number, { at: number; members: Member[] }>();
    return {
        // Model erisimi tembel: bayrak kapaliyken ApplicationDB'ye bile gidilmez.
        ledgerModel: lazyModel(async () => (await DatabaseManagerInstance.getApplicationDB()).getNotificationEventModel()),
        deliveryModel: lazyModel(async () => (await DatabaseManagerInstance.getApplicationDB()).getNotificationDeliveryModel()) as any,
        async tenantNotificationModel(tid) {
            const db = await DatabaseManagerInstance.getClientDB(tid);
            return db?.getNotificationModel();
        },
        async listMembers(tid) {
            const hit = cache.get(tid);
            if (hit && Date.now() - hit.at < MEMBER_TTL_MS) return hit.members;
            const app = await DatabaseManagerInstance.getApplicationDB();
            const rows = await app.getUserModel()
                .find({ clientId: tid, isActive: { $ne: false } }, { owner: 1, roleCode: 1, emailVerified: 1 }).lean();
            const members: Member[] = rows.map((u: any) => ({ userId: String(u._id), owner: u.owner === true, roleCode: u.roleCode, emailVerified: u.emailVerified === true }));
            cache.set(tid, { at: Date.now(), members });
            return members;
        },
        // ADR-0028/0029: alici uygunlugu izin katalogundan (can): uyenin kademesi -> rol -> izin. Platform yoneticisi tenant alicisi degildir.
        hasPermission: (m, permission) => can({ tier: memberTier(m), platformAdmin: false }, permission).allowed,
        // ADR-0029 NB6: gercek zamanli zil sinyali (yalniz kimlik+kategori/onem; asla firlatmaz).
        publish: (e) => getRealtimeBus().publish(e),
        flags: () => ({ v2Enabled: config.notify.v2Enabled, emailEnabled: config.notify.emailEnabled }),
    };
}

/** Yalniz gereken metotlari (create/updateOne/findOneAndUpdate/deleteOne/insertMany) tembelce cozulen modele yonlendirir. */
function lazyModel(resolve: () => Promise<any>): any {
    const call = (m: string) => async (...a: any[]) => (await resolve())[m](...a);
    return { create: call('create'), updateOne: call('updateOne'), findOneAndUpdate: call('findOneAndUpdate'), deleteOne: call('deleteOne'), insertMany: call('insertMany') };
}

export function createNotifier(): Notifier {
    return new Notifier(createNotifierDeps());
}

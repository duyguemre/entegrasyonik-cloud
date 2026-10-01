import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { listViews, saveView, deleteView } from '../../../operations/backoffice/viewsAdmin'
import { ApplicationError } from '@platform/core/errors'
import { PushSubscriptionRepository } from '@database/repositories/app/PushSubscriptionRepository'
import { currentVapid, isPushEnabled } from '@operations/notifications/push/pushConfig'
import { PLATFORM_PUSH_TID } from '@operations/notifications/push/platformAttentionPush'
import { listPushDevices, PushSubscriptionError, removePushSubscription, savePushSubscription } from '@operations/notifications/push/subscriptions'

/**
 * BE-05 (K51) -- `/admin-api` kayıtlı görünümler: yönetici başına, ekran başına adlandırılmış URL süzgeçleri (<=20). Yalnız çağıranın kayıtları (`principal.sub`).
 * Yazmalar (`saveView`/`deleteView`) RunOperation'da `backoffice.write` denetimi alır; step-up/gerekçe YOK (kişisel tercih). Sözleşme: docs/API_BACKOFFICE_ATTENTION.md (BE-05).
 */
export default class BackofficePrefsService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    private deps() { return { model: this.applicationDB.getBackofficeViewModel() } }
    private sub(): string | undefined { return this.request?.principal?.sub }

    async listViews(): Promise<any> { return listViews(this.deps(), this.sub(), this.request?.screen) }
    async saveView(): Promise<any> { const r = this.request || {}; return saveView(this.deps(), this.sub(), { screen: r.screen, name: String(r.name).trim(), query: r.query }) }
    async deleteView(): Promise<any> { return deleteView(this.deps(), this.sub(), this.request?.id) }

    // ---- MOB-06 web push: platform yöneticisi × cihaz aboneliği (yalnız kritik dikkat maddeleri; gönderici notifications.platform-attention-push).
    // Kayıt MOB-04 koleksiyonunda tid=PLATFORM_PUSH_TID (0) + userId=principal.sub; kurallar (SSRF uç listesi, şifreli saklama, cihaz sınırı) aynı.
    private get pushSubs() { return new PushSubscriptionRepository(this.applicationDB) }
    private admin(): string {
        const sub = this.sub()
        if (!sub) throw new ApplicationError('Oturum bulunamadı.', 401, 'UNAUTHENTICATED')
        return sub
    }

    /** Kanal durumu + VAPID açık anahtarı (sır değil) + bu yöneticinin cihazları. Kanal kapalıyken cihaz listesi okunmaz. */
    async getPushConfig(): Promise<any> {
        const vapid = isPushEnabled() ? currentVapid() : undefined
        if (!vapid) return { enabled: false, publicKey: null, devices: [] }
        return { enabled: true, publicKey: vapid.publicKey, devices: await listPushDevices(this.pushSubs, PLATFORM_PUSH_TID, this.admin()) }
    }

    /** Bu cihazı kaydet (aynı uç = güncelle). İzin istemi istemcide YALNIZ kullanıcı eylemiyle. */
    async subscribePush(): Promise<any> {
        if (!isPushEnabled()) throw new ApplicationError('Anlık bildirimler şu an kullanılamıyor.', 409, 'PUSH_DISABLED')
        try {
            await savePushSubscription(this.pushSubs, { tid: PLATFORM_PUSH_TID, userId: this.admin(), subscription: this.request.subscription, deviceLabel: this.request.deviceLabel, now: new Date() })
        } catch (e) {
            if (e instanceof PushSubscriptionError) throw new ApplicationError(e.message, 400, e.code)
            throw e
        }
        return { ok: true }
    }

    /** Cihaz aboneliğini sil (uç ya da cihaz kimliği; yalnız kendi kaydı). Kanal kapalıyken de çalışır. İdempotent. */
    async unsubscribePush(): Promise<any> {
        const { endpoint, id } = this.request || {}
        if (!endpoint === !id) throw new ApplicationError('Uç ya da cihaz kimliğinden yalnız biri gönderilmeli.', 400, 'VALIDATION')
        return { removed: await removePushSubscription(this.pushSubs, { tid: PLATFORM_PUSH_TID, userId: this.admin(), endpoint, id }) }
    }
}

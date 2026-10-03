import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { config } from '@config'
import { NotificationOps, type BackofficeActor } from '@operations/notifications/backofficeOps'
import { AnnouncementAdmin } from '@operations/notifications/announcementAdmin'
import { AlertAdmin } from '@operations/alerts/alertAdmin'
import { createEmailDispatcherDeps } from '@operations/notifications/delivery/createEmailDispatcher'

/**
 * ADR-0029 Karar 7 (NB7/NB8) -- `/admin-api` bildirim ve duyuru yönetimi: duyurular (list/get/create/update/schedule/cancel/preview), teslim günlüğü
 * (istatistik/liste/retry/discard), tenant bildirim geçmişi (YALNIZ meta veri), katalog + şablon önizleme, test e-postası, platform uyarıları (liste/susturma).
 * Yalnız platformAdmin. Yazmalar step-up + gerekçe ister (`admin/stepUp.ts REAUTH_RPCS`); RunOperation `backoffice.write` yazar, hedefli olaylar
 * (`backoffice.notifications.*`, `backoffice.alerts.mute`) iş mantığında yazılır. Sözleşme: docs/API_BACKOFFICE_NOTIFICATIONS.md.
 */
export default class BackofficeNotificationService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    private actor(): BackofficeActor { return { sub: this.request?.principal?.sub, ip: this.request?.requestMeta?.ip } }
    private reason(): string { return typeof this.request?.reason === 'string' ? this.request.reason.trim().slice(0, 500) : '' }
    private ops(): NotificationOps {
        const mail = createEmailDispatcherDeps()
        return new NotificationOps({ applicationDB: this.applicationDB as any, flags: () => ({ emailEnabled: config.notify.emailEnabled }), appUrl: mail.appUrl, transport: mail.transport })
    }
    private announcements(): AnnouncementAdmin { return new AnnouncementAdmin({ model: this.applicationDB.getAnnouncementModel(), appUrl: createEmailDispatcherDeps().appUrl }) }
    private alerts(): AlertAdmin { return new AlertAdmin({ model: this.applicationDB.getAlertModel() }) }

    // --- duyurular ---
    async listAnnouncements(): Promise<any> { const r = this.request || {}; return this.announcements().list({ status: r.status, kind: r.kind, from: r.from, to: r.to, cursor: r.cursor, limit: r.limit }) }
    async getAnnouncement(): Promise<any> { return this.announcements().get({ id: this.request?.id }) }
    async createAnnouncement(): Promise<any> { return this.announcements().create(this.actor(), this.request?.announcement) }
    async updateAnnouncement(): Promise<any> { return this.announcements().update(this.actor(), { id: this.request?.id, announcement: this.request?.announcement }) }
    async scheduleAnnouncement(): Promise<any> { return this.announcements().schedule(this.actor(), { id: this.request?.id, emailConsent: this.request?.emailConsent === true, reason: this.reason() }) }
    async cancelAnnouncement(): Promise<any> { return this.announcements().cancel(this.actor(), { id: this.request?.id, reason: this.reason() }) }
    async previewAnnouncement(): Promise<any> { return this.announcements().preview({ id: this.request?.id, draft: this.request?.draft }) }

    // --- teslim günlüğü ---
    async getDeliveryStats(): Promise<any> { return this.ops().getDeliveryStats() }
    async listDeliveries(): Promise<any> { const r = this.request || {}; return this.ops().listDeliveries({ status: r.status, channel: r.channel, tid: r.tid, code: r.code, eventId: r.eventId, cursor: r.cursor, limit: r.limit }) }
    async retryDelivery(): Promise<any> { return this.ops().retryDelivery(this.actor(), { id: this.request?.id, reason: this.reason() }) }
    async discardDelivery(): Promise<any> { return this.ops().discardDelivery(this.actor(), { id: this.request?.id, reason: this.reason() }) }

    // --- tenant geçmişi (yalnız meta), katalog, önizleme, test e-postası ---
    async getTenantHistory(): Promise<any> { const r = this.request || {}; return this.ops().getTenantHistory({ tid: r.tid, cursor: r.cursor, limit: r.limit }) }
    async getCatalog(): Promise<any> { return this.ops().getCatalog() }
    async previewTemplate(): Promise<any> { const r = this.request || {}; return this.ops().previewTemplate({ code: r.code, locale: r.locale, channel: r.channel, params: r.params }) }
    async sendTestEmail(): Promise<any> { return this.ops().sendTestEmail(this.actor(), { reason: this.reason() }) }

    // --- platform uyarıları (ADR-0017 Aşama C) ---
    async listAlerts(): Promise<any> { const r = this.request || {}; return this.alerts().list({ status: r.status, level: r.level, ruleId: r.ruleId, cursor: r.cursor, limit: r.limit }) }
    async muteAlert(): Promise<any> { const r = this.request || {}; return this.alerts().mute(this.actor(), { ruleId: r.ruleId, scopeKey: r.scopeKey, hours: r.hours, reason: this.reason() }) }
}

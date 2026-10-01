import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { sortBySeverity, toTenantDto, visibleTo, type AnnouncementDoc } from '@operations/notifications/announcements'

const QUERY_MAX_TIME_MS = 3000
const MAX_ROWS = 50

/**
 * ADR-0029 Karar 7 (NB7): tenant tarafı duyuru bandı. Fan-out YOK: giriş anında, 5 dakikada bir ve SSE `announcement` olayında çağrılır.
 * Görünürlük zaman penceresinden + hedeften (tümü / plan / tenant) + kitleden (owners_admins = yönetici kademesi) hesaplanır; yanıtta yalnız
 * görünüm alanları döner (hedef/kitle/yazar/sayaç sızmaz). Kapatılan duyurular istemcide tutulur; `maintenance`/`incident` kapatılamaz (`dismissible:false`).
 * Sözleşme: docs/API_BACKOFFICE_NOTIFICATIONS.md "Tenant tarafı".
 */
export default class AnnouncementService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    /** Yanıt: {items:[{id,kind,severity,title:{tr,en?},body:{tr,en?},dismissible,startsAt,endsAt}], serverTime}. Hata = hata (boş liste DEĞİL). */
    async getActive(): Promise<any> {
        const now = new Date()
        const tid = Number(this.clientId)
        if (!Number.isInteger(tid) || tid <= 0) return { items: [], serverTime: now.toISOString() }
        const rows: AnnouncementDoc[] = await this.applicationDB.getAnnouncementModel().find({
            status: { $in: ['active', 'scheduled'] }, startsAt: { $lte: now }, 'channels.banner': true,
            $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
        }).sort({ startsAt: -1 }).limit(MAX_ROWS).maxTimeMS(QUERY_MAX_TIME_MS).lean()
        let planCode: string | null = null
        if (rows.some((r) => r.target?.mode === 'plans')) {
            const sub: any = await this.applicationDB.getSubscriptionModel().findOne({ clientId: tid }, 'planCode').maxTimeMS(QUERY_MAX_TIME_MS).lean()
            planCode = sub?.planCode ?? null
        }
        const viewer = { tid, planCode, tier: this.ctx.actor.tier ?? 'member' }
        const visible = rows.filter((r) => visibleTo(r, viewer, now))
        return { items: sortBySeverity(visible).map(toTenantDto), serverTime: now.toISOString() }
    }
}

import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { clampLimit } from '@utils/search'
import { ApplicationError } from '@platform/core/errors'
import { getCatalogDto } from '@operations/notifications/catalog'
import { NOTIFICATION_CATEGORIES } from '@operations/notifications/catalog.types'
import { categoryLocks, violatedMandatory } from '@operations/notifications/preferences'
import { buildListFilter, buildOwnUpdateFilter, buildUnreadFilter, presentNotification } from '@operations/notifications/inAppRepository'

/**
 * ADR-0029 NB4: tenant bildirim API'si. N-01: HER okuma/güncelleme/silme `userId = ctx.actor.sub` ile süzülür (filtreleri
 * `inAppRepository` kurar; bu servis ham filtre yazmaz). Başka kullanıcının bildirimi -> 404. Eski userId'siz kayıtlar: salt-okunur
 * görünür, kimse değiştiremez (bkz. inAppRepository başlığı). Destek oturumu (imp): liste tenant birleşik + salt okunur; yazma 403.
 * RPC yanıt şekilleri yalnız EKLEME alır (nextCursor, unreadByCategory, legacy).
 */
export default class NotificationService extends BaseApi implements IService {

    private get uid(): string { return this.ctx.actor.sub }

    private get tid(): number { return Number(this.clientId) }

    /** Destek oturumu (impersonation) bildirim durumunu/tercihi DEĞİŞTİRemez (ADR-0029 Karar 8, N-18). */
    private assertWritable(): void {
        if (this.ctx.actor.imp === true) {
            throw new ApplicationError('Destek oturumunda bildirimler salt okunurdur.', 403, 'IMPERSONATION_READ_ONLY');
        }
    }

    private toObjectId(id: string): ObjectId {
        if (typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id)) throw new ApplicationError('Geçersiz bildirim kimliği.', 400, 'VALIDATION');
        return new ObjectId(id);
    }

    /** Kimlik listesiyle yapılan güncellemede hiçbir kendi belgesi eşleşmediyse 404 (başkasının/olmayan kayıt ayrımı sızmaz). */
    private assertMatched(res: any): void {
        const n = res?.matchedCount ?? res?.n ?? res?.modifiedCount;
        if (n === 0) throw new ApplicationError('Bildirim bulunamadı.', 404, 'NOT_FOUND');
    }

    private async unreadByCategory(): Promise<Record<string, number>> {
        if (this.ctx.actor.imp === true) return {};
        // aggregate() Mongoose şema dönüşümü YAPMAZ: userId ObjectId'ye açıkça çevrilir (yoksa eşleşme olmaz)
        const match = buildUnreadFilter(this.uid);
        if (/^[a-fA-F0-9]{24}$/.test(this.uid)) match.userId = new ObjectId(this.uid);
        const rows: Array<{ _id: string | null; n: number }> = await this.clientDB.getNotificationModel()
            .aggregate([{ $match: match }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
        const out: Record<string, number> = {};
        for (const r of rows ?? []) out[r._id ?? 'uncategorized'] = r.n;
        return out;
    }

    /**
     * Bildirimleri Listeleme (kullanıcı kapsamlı, imleç sayfalama).
     * İstek: {cursor?, limit?, category?, onlyUnread?, archived?, afterId?, byCategory?}. Yanıt: {result, data, unreadCount, nextCursor, unreadByCategory?}.
     */
    async get(): Promise<any> {
        const { onlyUnread = false, archived = false, category, cursor, afterId, byCategory = false } = this.request;
        const imp = this.ctx.actor.imp === true;
        const limit = clampLimit(this.request.limit, 20, cursor ? 50 : 200); // ADR-0029 Karar 3: imleçle ≤50, imleçsiz eski ≤200
        const model = this.clientDB.getNotificationModel();

        const filter = buildListFilter({
            userId: this.uid, category, onlyUnread, archived, cursor, afterId, tenantWide: imp,
            toObjectId: (id) => this.toObjectId(id),
        });
        const rows: any[] = await model.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);
        const nextCursor = hasMore && page.length ? String(page[page.length - 1]._id) : null;

        let data = page.map(presentNotification);
        if (imp) { // birleşik görünüm: aynı olay (eventId) tenant üyelerinin her birine yazılmıştır -> tekilleştir
            const seen = new Set<string>();
            data = data.filter((n: any) => {
                if (!n.eventId) return true;
                if (seen.has(n.eventId)) return false;
                seen.add(n.eventId);
                return true;
            });
        }

        const unreadCount = imp ? 0 : await model.countDocuments(buildUnreadFilter(this.uid));
        return {
            result: true, data, unreadCount, nextCursor,
            ...(byCategory ? { unreadByCategory: await this.unreadByCategory() } : {}),
        };
    }

    /** Tekil veya Toplu Okundu İşaretleme (kişisel; `all` yalnız kendi kayıtları). */
    async markAsRead(): Promise<any> {
        this.assertWritable();
        const { notificationIds, all = false } = this.request;
        const now = new Date();
        let filter: Record<string, unknown>;
        if (all) {
            filter = buildOwnUpdateFilter(this.uid, undefined, { isDeleted: false, isRead: false, isArchived: { $ne: true } });
        } else {
            if (!notificationIds?.length) return { result: false, message: 'ID listesi boş.' };
            filter = buildOwnUpdateFilter(this.uid, notificationIds.map((id: string) => this.toObjectId(id)), { isDeleted: false });
        }
        const res = await this.clientDB.getNotificationModel().updateMany(filter, { $set: { isRead: true, readAt: now } });
        if (!all) this.assertMatched(res);
        return { result: true, message: 'Okundu olarak işaretlendi.' };
    }

    /** Bildirim Silme (soft delete; kişisel). `all` yalnız ÇAĞIRANIN bildirimlerini siler (N-01). */
    async delete(): Promise<any> {
        this.assertWritable();
        const { notificationIds, all = false } = this.request;
        let filter: Record<string, unknown>;
        if (all) {
            filter = buildOwnUpdateFilter(this.uid, undefined, { isDeleted: false });
        } else {
            if (!notificationIds?.length) return { result: false, message: 'ID listesi boş.' };
            filter = buildOwnUpdateFilter(this.uid, notificationIds.map((id: string) => this.toObjectId(id)));
        }
        const res = await this.clientDB.getNotificationModel().updateMany(filter, { $set: { isDeleted: true } });
        if (!all) this.assertMatched(res);
        return { result: true, message: 'Bildirimler silindi.' };
    }

    /** Arşivle (kişisel). */
    async archive(): Promise<any> {
        return this.setArchived(true);
    }

    /** Arşivden çıkar (kişisel). */
    async unarchive(): Promise<any> {
        return this.setArchived(false);
    }

    private async setArchived(value: boolean): Promise<any> {
        this.assertWritable();
        const ids = (this.request.notificationIds as string[] | undefined) ?? [];
        if (!ids.length) return { result: false, message: 'ID listesi boş.' };
        const filter = buildOwnUpdateFilter(this.uid, ids.map((id) => this.toObjectId(id)), { isDeleted: false });
        const res = await this.clientDB.getNotificationModel().updateMany(filter, { $set: { isArchived: value, archivedAt: value ? new Date() : null } });
        this.assertMatched(res);
        return { result: true, message: value ? 'Arşivlendi.' : 'Arşivden çıkarıldı.' };
    }

    /** Çan rozeti: yalnız çağıranın okunmamış (silinmemiş, arşivsiz) sayısı; isteğe bağlı kategori kırılımı. */
    async getUnreadCount(): Promise<any> {
        if (this.ctx.actor.imp === true) return { result: true, unreadCount: 0, ...(this.request.byCategory ? { unreadByCategory: {} } : {}) };
        const count = await this.clientDB.getNotificationModel().countDocuments(buildUnreadFilter(this.uid));
        return { result: true, unreadCount: count, ...(this.request.byCategory ? { unreadByCategory: await this.unreadByCategory() } : {}) };
    }

    /** FE için katalog (tek kaynak): kod/kategori/zorunluluk/varsayılan kanallar + kategori kilit tablosu. Params şeması/fonksiyon içermez. */
    async getCatalog(): Promise<any> {
        return { result: true, data: getCatalogDto('tenant'), categories: [...NOTIFICATION_CATEGORIES], locks: categoryLocks() };
    }

    // ---- Tercihler (ApplicationDB.NotificationPreferences; userId = kendi, null = tenant varsayılanı) ----

    private prefsView(doc: any) {
        return { locale: doc?.locale ?? 'tr', matrix: doc?.matrix ?? {}, digest: doc?.digest ?? null, quietHours: doc?.quietHours ?? null };
    }

    /** Kendi tercihlerim + tenant varsayılanı (salt okunur) + kategori kilitleri. */
    async getPreferences(): Promise<any> {
        const model = this.applicationDB.getNotificationPreferencesModel();
        const [mine, tenant] = await Promise.all([
            model.findOne({ tid: this.tid, userId: this.uid }).lean(),
            model.findOne({ tid: this.tid, userId: null }).lean(),
        ]);
        return { result: true, data: this.prefsView(mine), tenantDefaults: this.prefsView(tenant), locks: categoryLocks() };
    }

    async updatePreferences(): Promise<any> {
        return this.savePrefs(this.uid);
    }

    /** Tenant varsayılanı (yalnız admin/owner: `settings:manage`; yetenek kaydı ve operasyon politikası uygular). */
    async getTenantDefaults(): Promise<any> {
        const doc = await this.applicationDB.getNotificationPreferencesModel().findOne({ tid: this.tid, userId: null }).lean();
        return { result: true, data: this.prefsView(doc), locks: categoryLocks() };
    }

    async updateTenantDefaults(): Promise<any> {
        return this.savePrefs(null);
    }

    private async savePrefs(userId: string | null): Promise<any> {
        this.assertWritable();
        const { locale, matrix, digest, quietHours } = this.request;
        const bad = violatedMandatory(matrix);
        if (bad.length) throw new ApplicationError('Zorunlu bildirim kategorisi kapatılamaz.', 400, 'MANDATORY_CATEGORY', { categories: bad });

        const $set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: this.uid };
        const $unset: Record<string, ''> = {};
        if (locale !== undefined) $set.locale = locale;
        if (digest !== undefined) $set.digest = digest;
        if (quietHours === null) $unset.quietHours = ''; else if (quietHours !== undefined) $set.quietHours = quietHours;
        // anahtarlar zod enum'undan (kategori adı) gelir -> noktalı yol güvenli
        for (const [cat, cell] of Object.entries(matrix ?? {})) $set[`matrix.${cat}`] = cell;

        await this.applicationDB.getNotificationPreferencesModel().findOneAndUpdate(
            { tid: this.tid, userId },
            { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
            { upsert: true, new: true },
        );
        return { result: true, message: 'Tercihler kaydedildi.' };
    }
}

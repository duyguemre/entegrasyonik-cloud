import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ObjectId } from 'mongodb'
import { clampLimit } from '@utils/search'

export default class NotificationService extends BaseApi implements IService {

    /**
     * Bildirimleri Listeleme
     * Önyüzdeki "Bildirim Merkezi" için son bildirimleri getirir.
     */
    async get(): Promise<any> {
        try {
            const { onlyUnread = false } = this.request;
            const limit = clampLimit(this.request.limit, 20); // [GV-01/MM-08]

            const filterQuery: any = { isDeleted: false };

            // Eğer sadece okunmamışlar isteniyorsa
            if (onlyUnread) {
                filterQuery.isRead = false;
            }


            const notifications = await this.clientDB.getNotificationModel()
                .find(filterQuery)
                .sort({ createdAt: -1 }) // En yeni en üstte
                .limit(limit)
                .lean();

            const unreadCount = await this.clientDB.getNotificationModel()
                .countDocuments({ isRead: false, isDeleted: false });

            return {
                result: true,
                data: notifications,
                unreadCount
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Tekil veya Toplu Okundu İşaretleme
     */
    async markAsRead(): Promise<any> {
        try {
            const { notificationIds, all = false } = this.request;
            const now = new Date();

            let query: any = { isDeleted: false };

            if (!all) {
                if (!notificationIds?.length) return { result: false, message: 'ID listesi boş.' };
                query._id = { $in: notificationIds.map((id: string) => new ObjectId(id)) };
            } else {
                query.isRead = false; // "Hepsini okundu yap" durumu
            }

            await this.clientDB.getNotificationModel().updateMany(
                query,
                { $set: { isRead: true, readAt: now } }
            );

            return { result: true, message: 'Okundu olarak işaretlendi.' };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Bildirim Silme (Soft Delete)
     */
    async delete(): Promise<any> {
        try {
            const { notificationIds, all = false } = this.request;

            let query: any = {};

            if (!all) {
                if (!notificationIds?.length) return { result: false, message: 'ID listesi boş.' };
                query._id = { $in: notificationIds.map((id: string) => new ObjectId(id)) };
            }

            await this.clientDB.getNotificationModel().updateMany(
                query,
                { $set: { isDeleted: true } }
            );

            return { result: true, message: 'Bildirimler silindi.' };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Önyüzdeki "Çan" ikonu için sadece okunmamış sayısını dönen hızlı metod
     */
    async getUnreadCount(): Promise<any> {
        try {
            const count = await this.clientDB.getNotificationModel().countDocuments({
                isRead: false,
                isDeleted: false
            });

            return { result: true, unreadCount: count };
        } catch (error) {
            throw error;
        }
    }
}
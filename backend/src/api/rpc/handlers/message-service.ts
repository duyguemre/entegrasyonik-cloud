import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ObjectId } from 'mongodb';
import { containsRegex, normalizePagination } from '@utils/search';

export default class MessageService extends BaseApi implements IService {



    async get(): Promise<any> { }

    async getMessages(): Promise<any> {
        try {
            const {
                searchMessageForm = {},
                pagination: rawPagination,
                sortBy: sortReq
            } = this.request;

            const sortField = sortReq?.key || 'date';
            const sortOrder = sortReq?.order === 'asc' ? 1 : -1;
            const pagination = normalizePagination(rawPagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
            const skipCount = (pagination.page - 1) * pagination.limit;

            const filterQuery: any = {};
            const data = searchMessageForm.data || {};

            // 1. GLOBAL SEARCH
            if (data.globalSearch) {
                const searchRegex = containsRegex(data.globalSearch); // [GV-01] kaçışlı + uzunluk sınırlı
                filterQuery.$or = [
                    { text: searchRegex },
                    { answer: searchRegex },
                    { rejectionReason: searchRegex },
                    { "context.orderNumber": searchRegex },
                    { "context.productName": searchRegex }
                ];
            }

            // 2. FİLTRELER
            if (data.status) filterQuery.status = data.status;
            if (data.type) filterQuery.type = data.type;

            // UI'dan gelen null/undefined değerlerini temizleyerek kontrol et
            if (data.isRejected === true || data.isRejected === false) {
                filterQuery.isRejected = data.isRejected;
            }

            if (data.integrationCodes?.length > 0) filterQuery.integrationCode = { $in: data.integrationCodes };

            if (data.startDate || data.endDate) {
                filterQuery.date = {};
                if (data.startDate) filterQuery.date.$gte = new Date(data.startDate);
                if (data.endDate) {
                    const end = new Date(data.endDate);
                    end.setHours(23, 59, 59, 999);
                    filterQuery.date.$lte = end;
                }
            }

            // 3. AGGREGATION PIPELINE
            const result = await this.clientDB.getMessageModel().aggregate([
                // PERFORMANS NOTU: Match her zaman ilk aşama olmalı
                { $match: filterQuery },
                { $sort: { [sortField]: sortOrder } }, // [DB-02] $facet dışında: indeks kullanılabilir
                {
                    $facet: {
                        metadata: [{ $count: 'total' }],
                        data: [
                            { $skip: skipCount },
                            { $limit: pagination.limit },
                            {
                                $lookup: {
                                    from: 'Customers',
                                    localField: 'customerId',
                                    foreignField: '_id',
                                    as: 'customer'
                                }
                            },
                            { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
                            {
                                $lookup: {
                                    from: 'Orders',
                                    localField: 'orderId',
                                    foreignField: '_id',
                                    as: 'order'
                                }
                            },
                            { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } }
                        ]
                    }
                }
            ]);

            const totalRecords = result[0].metadata[0]?.total || 0;

            return {
                totalNumberOfRecords: totalRecords,
                totalNumberOfPages: Math.ceil(totalRecords / pagination.limit) || 1,
                messages: result[0].data
            };

        } catch (error) {
            console.error('[MessageService] getMessages Hatası:', error);
            throw error;
        }
    }

    async replyMessage(): Promise<any> {
        try {
            const { messageId, answerText } = this.request;
            if (!messageId || !answerText) throw new Error('messageId ve answerText gereklidir.');

            const message = await this.clientDB.getMessageModel().findById(messageId);
            if (!message) throw new Error('Mesaj bulunamadı.');

            const factory = new IntegrationFactory(Number(this.currentClientId));
            const instance = await factory.getInstance(message.integrationCode);

            if (!instance.answerMessage) {
                throw new Error(`${message.integrationCode} için answerMessage metodu desteklenmiyor.`);
            }

            const success = await instance.answerMessage(message.externalMessageId, answerText);

            if (success) {
                // Pazarama gibi platformlarda cevap onay bekler, Trendyol'da ise direkt cevaplanmış sayılır.
                const nextStatus = message.integrationCode === 'pazarama' ? 'WAITING_APPROVAL' : 'ANSWERED';

                const updatedMessage = await this.clientDB.getMessageModel().findByIdAndUpdate(
                    messageId,
                    {
                        $set: {
                            status: nextStatus,
                            answer: answerText,
                            answeredAt: new Date(),
                            isRejected: false,
                            rejectionReason: null
                        }
                    },
                    { new: true }
                );

                return { success: true, message: updatedMessage };
            } else {
                throw new Error('Pazar yeri mesajı cevaplamayı reddetti.');
            }

        } catch (error) {
            console.error('[MessageService] replyMessage Hatası:', error);
            throw error;
        }
    }

    async markAsRead(): Promise<any> {
        try {
            const { messageId } = this.request;
            if (!messageId) throw new Error('messageId gereklidir.');

            const message = await this.clientDB.getMessageModel().findById(messageId);
            if (!message) throw new Error('Mesaj bulunamadı.');

            // Sadece UNREAD olanları READ yapıyoruz, 
            // WAITING_SELLER gibi operasyonel statülere dokunmuyoruz.
            if (message.status === 'UNREAD') {
                const updatedMessage = await this.clientDB.getMessageModel().findByIdAndUpdate(
                    messageId,
                    { $set: { status: 'READ' } },
                    { new: true }
                );
                return { success: true, message: updatedMessage };
            }

            return { success: true, message: 'Mesaj durumu değiştirilmeye uygun değil (zaten okunmuş veya işlem bekliyor olabilir).' };
        } catch (error) {
            console.error('[MessageService] markAsRead Hatası:', error);
            throw error;
        }
    }

    async deleteMessage(): Promise<any> {
        try {
            const { messageId } = this.request;
            if (!messageId) throw new Error('messageId gereklidir.');

            await this.clientDB.getMessageModel().findByIdAndDelete(messageId);

            return { success: true, message: 'Mesaj silindi.' };
        } catch (error) {
            console.error('[MessageService] deleteMessage Hatası:', error);
            throw error;
        }
    }

    /**
     * bulkDeleteMessages
     * Seçilen birden fazla mesajı toplu siler.
     */
    async bulkDeleteMessages(): Promise<any> {
        try {
            const { messageIds } = this.request;
            if (!messageIds || !Array.isArray(messageIds)) throw new Error('messageIds listesi gereklidir.');

            await this.clientDB.getMessageModel().deleteMany({ _id: { $in: messageIds.map(id => new ObjectId(id)) } });

            return { success: true, message: `${messageIds.length} mesaj başarıyla silindi.` };
        } catch (error) {
            console.error('[MessageService] bulkDeleteMessages Hatası:', error);
            throw error;
        }
    }
}
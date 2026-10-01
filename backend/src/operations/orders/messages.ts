import { ObjectId } from 'mongodb';
import { IClientDB } from '@interfaces/index';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { MessageRepository } from '@database/repositories/tenant/MessageRepository';
import { containsRegex, normalizePagination } from '@utils/search';

/** ADR-0024 P3-ORD: müşteri soruları/mesajları (liste, yanıt, okundu, silme); eski `MessageService` gövdesi, davranış BİREBİR. */

/** Mesaj listesi: arama, durum/tip/red/kanal/tarih filtreleri; müşteri ve sipariş eşlemesiyle. */
export async function searchMessages(clientDB: IClientDB, request: any) {
    const { searchMessageForm = {}, pagination: rawPagination, sortBy: sortReq } = request;
    const sortField = sortReq?.key || 'date';
    const sortOrder = sortReq?.order === 'asc' ? 1 : -1;
    const pagination = normalizePagination(rawPagination, 15); // [GV-01/MM-08] limit üst sınırı, page>=1
    const skipCount = (pagination.page - 1) * pagination.limit;

    const filterQuery: any = {};
    const data = searchMessageForm.data || {};
    if (data.globalSearch) {
        const searchRegex = containsRegex(data.globalSearch); // [GV-01] kaçışlı + uzunluk sınırlı
        filterQuery.$or = [
            { text: searchRegex }, { answer: searchRegex }, { rejectionReason: searchRegex },
            { 'context.orderNumber': searchRegex }, { 'context.productName': searchRegex },
        ];
    }
    if (data.status) filterQuery.status = data.status;
    if (data.type) filterQuery.type = data.type;
    // UI'dan gelen null/undefined değerleri yok sayılır
    if (data.isRejected === true || data.isRejected === false) filterQuery.isRejected = data.isRejected;
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

    const result = await new MessageRepository(clientDB).pagedSearch(filterQuery, { [sortField]: sortOrder }, skipCount, pagination.limit);
    const totalRecords = result[0].metadata[0]?.total || 0;
    return {
        totalNumberOfRecords: totalRecords,
        totalNumberOfPages: Math.ceil(totalRecords / pagination.limit) || 1,
        messages: result[0].data,
    };
}

/** Pazaryerine yanıt gönderir; Pazarama'da yanıt onay bekler (WAITING_APPROVAL), diğerlerinde ANSWERED. */
export async function replyMessage(clientDB: IClientDB, clientId: unknown, messageId: unknown, answerText: unknown) {
    if (!messageId || !answerText) throw new Error('messageId ve answerText gereklidir.');
    const repo = new MessageRepository(clientDB);
    const message = await repo.findById(messageId);
    if (!message) throw new Error('Mesaj bulunamadı.');

    const factory = new IntegrationFactory(Number(clientId));
    const instance = await factory.getInstance(message.integrationCode);
    if (!instance.answerMessage) throw new Error(`${message.integrationCode} için answerMessage metodu desteklenmiyor.`);

    const success = await instance.answerMessage(message.externalMessageId, answerText as any);
    if (!success) throw new Error('Pazar yeri mesajı cevaplamayı reddetti.');

    const nextStatus = message.integrationCode === 'pazarama' ? 'WAITING_APPROVAL' : 'ANSWERED';
    const updatedMessage = await repo.updateById(messageId, {
        $set: { status: nextStatus, answer: answerText, answeredAt: new Date(), isRejected: false, rejectionReason: null },
    }, { new: true });
    return { success: true, message: updatedMessage };
}

/** Yalnız UNREAD -> READ; WAITING_SELLER gibi operasyonel durumlara dokunulmaz. */
export async function markAsRead(clientDB: IClientDB, messageId: unknown) {
    if (!messageId) throw new Error('messageId gereklidir.');
    const repo = new MessageRepository(clientDB);
    const message = await repo.findById(messageId);
    if (!message) throw new Error('Mesaj bulunamadı.');
    if (message.status === 'UNREAD') {
        const updatedMessage = await repo.updateById(messageId, { $set: { status: 'READ' } }, { new: true });
        return { success: true, message: updatedMessage };
    }
    return { success: true, message: 'Mesaj durumu değiştirilmeye uygun değil (zaten okunmuş veya işlem bekliyor olabilir).' };
}

export async function deleteMessage(clientDB: IClientDB, messageId: unknown) {
    if (!messageId) throw new Error('messageId gereklidir.');
    await new MessageRepository(clientDB).deleteById(messageId);
    return { success: true, message: 'Mesaj silindi.' };
}

/** Seçilen birden fazla mesajı toplu siler. */
export async function bulkDeleteMessages(clientDB: IClientDB, messageIds: unknown) {
    if (!messageIds || !Array.isArray(messageIds)) throw new Error('messageIds listesi gereklidir.');
    await new MessageRepository(clientDB).deleteByIds(messageIds.map(id => new ObjectId(id)));
    return { success: true, message: `${messageIds.length} mesaj başarıyla silindi.` };
}

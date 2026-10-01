import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { containsRegex, normalizePagination } from '@utils/search';
import type { MessagePanelRepository } from '@database/repositories/tenant/MessagePanelRepository';

/**
 * ADR-0024 Dalga 3 (P3-ORD): mesaj listeleme/cevaplama/okundu/silme iş kuralları.
 * Davranış `MessageService`'in eski gövdeleriyle birebir. Tenant = `clientId` (doğrulanmış principal) + `repo` (tenant DB).
 */
export interface MessageActionDeps { repo: MessagePanelRepository; clientId: number }

/** Mesaj listesi. `request`: `{ searchMessageForm, pagination, sortBy }`. */
export async function listMessages(repo: MessagePanelRepository, request: any): Promise<any> {
    const {
        searchMessageForm = {},
        pagination: rawPagination,
        sortBy: sortReq
    } = request;

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

    // 3. AGGREGATION PIPELINE — repo'da
    const { total: totalRecords, messages } = await repo.listPage(filterQuery, { [sortField]: sortOrder }, skipCount, pagination.limit);

    return {
        totalNumberOfRecords: totalRecords,
        totalNumberOfPages: Math.ceil(totalRecords / pagination.limit) || 1,
        messages
    };
}

/** Pazaryerinde mesajı cevaplar, yerelde durumu günceller. */
export async function replyMessage(deps: MessageActionDeps, messageId: any, answerText: any): Promise<any> {
    if (!messageId || !answerText) throw new Error('messageId ve answerText gereklidir.');

    const message = await deps.repo.findById(messageId);
    if (!message) throw new Error('Mesaj bulunamadı.');

    const factory = new IntegrationFactory(deps.clientId);
    const instance = await factory.getInstance(message.integrationCode);

    if (!instance.answerMessage) {
        throw new Error(`${message.integrationCode} için answerMessage metodu desteklenmiyor.`);
    }

    const success = await instance.answerMessage(message.externalMessageId, answerText);

    if (success) {
        // Pazarama gibi platformlarda cevap onay bekler, Trendyol'da ise direkt cevaplanmış sayılır.
        const nextStatus = message.integrationCode === 'pazarama' ? 'WAITING_APPROVAL' : 'ANSWERED';

        const updatedMessage = await deps.repo.updateById(
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
}

/** Mesajı okundu işaretler (yalnızca UNREAD ise). */
export async function markMessageRead(repo: MessagePanelRepository, messageId: any): Promise<any> {
    if (!messageId) throw new Error('messageId gereklidir.');

    const message = await repo.findById(messageId);
    if (!message) throw new Error('Mesaj bulunamadı.');

    // Sadece UNREAD olanları READ yapıyoruz, 
    // WAITING_SELLER gibi operasyonel statülere dokunmuyoruz.
    if (message.status === 'UNREAD') {
        const updatedMessage = await repo.updateById(
            messageId,
            { $set: { status: 'READ' } },
            { new: true }
        );
        return { success: true, message: updatedMessage };
    }

    return { success: true, message: 'Mesaj durumu değiştirilmeye uygun değil (zaten okunmuş veya işlem bekliyor olabilir).' };
}

export async function deleteMessage(repo: MessagePanelRepository, messageId: any): Promise<any> {
    if (!messageId) throw new Error('messageId gereklidir.');

    await repo.deleteById(messageId);

    return { success: true, message: 'Mesaj silindi.' };
}

/** Seçilen birden fazla mesajı toplu siler. */
export async function bulkDeleteMessages(repo: MessagePanelRepository, messageIds: any): Promise<any> {
    if (!messageIds || !Array.isArray(messageIds)) throw new Error('messageIds listesi gereklidir.');

    await repo.deleteManyByIds(messageIds);

    return { success: true, message: `${messageIds.length} mesaj başarıyla silindi.` };
}

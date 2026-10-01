import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { MessagePanelRepository } from '@database/repositories/tenant/MessagePanelRepository'
import { listMessages, replyMessage, markMessageRead, deleteMessage, bulkDeleteMessages } from '@operations/orders/messages'
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'message-service');

/**
 * Mesaj RPC cephesi (ADR-0024 Dalga 3 P3-ORD). Sorgular `MessagePanelRepository`'de, iş kuralları `operations/orders/messages`'ta;
 * RPC adları ve yanıt biçimleri değişmedi. Tenant izolasyonu `this.clientDB` (tenant DB) seçimiyle.
 */
export default class MessageService extends BaseApi implements IService {

    private get messages(): MessagePanelRepository { return new MessagePanelRepository(this.clientDB) }
    private get deps() { return { repo: this.messages, clientId: Number(this.currentClientId) } }

    async get(): Promise<any> { }

    async getMessages(): Promise<any> {
        try {
            return await listMessages(this.messages, this.request);
        } catch (error) {
            log.error('MESSAGE_GET_MESSAGES_FAILED', '[MessageService] getMessages hatası', { err: error });
            throw error;
        }
    }

    async replyMessage(): Promise<any> {
        try {
            const { messageId, answerText } = this.request;
            return await replyMessage(this.deps, messageId, answerText);
        } catch (error) {
            log.error('MESSAGE_REPLY_MESSAGE_FAILED', '[MessageService] replyMessage hatası', { err: error });
            throw error;
        }
    }

    async markAsRead(): Promise<any> {
        try {
            return await markMessageRead(this.messages, this.request.messageId);
        } catch (error) {
            log.error('MESSAGE_MARK_AS_READ_FAILED', '[MessageService] markAsRead hatası', { err: error });
            throw error;
        }
    }

    async deleteMessage(): Promise<any> {
        try {
            return await deleteMessage(this.messages, this.request.messageId);
        } catch (error) {
            log.error('MESSAGE_DELETE_MESSAGE_FAILED', '[MessageService] deleteMessage hatası', { err: error });
            throw error;
        }
    }

    /** Seçilen birden fazla mesajı toplu siler. */
    async bulkDeleteMessages(): Promise<any> {
        try {
            return await bulkDeleteMessages(this.messages, this.request.messageIds);
        } catch (error) {
            log.error('MESSAGE_BULK_DELETE_MESSAGES_FAILED', '[MessageService] bulkDeleteMessages hatası', { err: error });
            throw error;
        }
    }
}

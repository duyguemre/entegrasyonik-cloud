import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { MessagePanelRepository } from '@database/repositories/tenant/MessagePanelRepository'
import { listMessages, replyMessage, markMessageRead, deleteMessage, bulkDeleteMessages } from '@operations/orders/messages'

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
            console.error('[MessageService] getMessages Hatası:', error);
            throw error;
        }
    }

    async replyMessage(): Promise<any> {
        try {
            const { messageId, answerText } = this.request;
            return await replyMessage(this.deps, messageId, answerText);
        } catch (error) {
            console.error('[MessageService] replyMessage Hatası:', error);
            throw error;
        }
    }

    async markAsRead(): Promise<any> {
        try {
            return await markMessageRead(this.messages, this.request.messageId);
        } catch (error) {
            console.error('[MessageService] markAsRead Hatası:', error);
            throw error;
        }
    }

    async deleteMessage(): Promise<any> {
        try {
            return await deleteMessage(this.messages, this.request.messageId);
        } catch (error) {
            console.error('[MessageService] deleteMessage Hatası:', error);
            throw error;
        }
    }

    /** Seçilen birden fazla mesajı toplu siler. */
    async bulkDeleteMessages(): Promise<any> {
        try {
            return await bulkDeleteMessages(this.messages, this.request.messageIds);
        } catch (error) {
            console.error('[MessageService] bulkDeleteMessages Hatası:', error);
            throw error;
        }
    }
}

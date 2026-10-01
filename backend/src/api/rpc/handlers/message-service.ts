import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import * as messages from '@operations/orders/messages'

/**
 * ADR-0024 P3-ORD: müşteri mesajları RPC cephesi. İş akışları `operations/orders/messages`, sorgular
 * `database/repositories/tenant/MessageRepository` (RPC adları ve yanıt biçimleri değişmez). Hatalar loglanıp yeniden fırlatılır.
 */
export default class MessageService extends BaseApi implements IService {

    async get(): Promise<any> { }

    async getMessages(): Promise<any> {
        try {
            return await messages.searchMessages(this.clientDB, this.request)
        } catch (error) {
            console.error('[MessageService] getMessages Hatası:', error);
            throw error;
        }
    }

    async replyMessage(): Promise<any> {
        try {
            const { messageId, answerText } = this.request
            return await messages.replyMessage(this.clientDB, this.currentClientId, messageId, answerText)
        } catch (error) {
            console.error('[MessageService] replyMessage Hatası:', error);
            throw error;
        }
    }

    async markAsRead(): Promise<any> {
        try {
            return await messages.markAsRead(this.clientDB, this.request.messageId)
        } catch (error) {
            console.error('[MessageService] markAsRead Hatası:', error);
            throw error;
        }
    }

    async deleteMessage(): Promise<any> {
        try {
            return await messages.deleteMessage(this.clientDB, this.request.messageId)
        } catch (error) {
            console.error('[MessageService] deleteMessage Hatası:', error);
            throw error;
        }
    }

    /** Seçilen birden fazla mesajı toplu siler. */
    async bulkDeleteMessages(): Promise<any> {
        try {
            return await messages.bulkDeleteMessages(this.clientDB, this.request.messageIds)
        } catch (error) {
            console.error('[MessageService] bulkDeleteMessages Hatası:', error);
            throw error;
        }
    }
}

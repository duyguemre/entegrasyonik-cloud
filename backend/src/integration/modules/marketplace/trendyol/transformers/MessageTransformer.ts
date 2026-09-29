import { IMessage, MessageStatus } from '@interfaces/index';
import { integrationCode } from '../constants';

export class MessageTransformer {
    /**
     * Trendyol'dan gelen raw response'u (liste veya tekil) iç modele çevirir.
     * RawResponse: { content: [...], totalElements: 864 } veya doğrudan { id: ... }
     */
    public toInternalMessages(rawResponse: any): IMessage[] {
        // Liste yapısı mı yoksa tekil soru mu kontrolü
        return rawResponse.map((q: any) => this.toInternalMessage(q));
    }

    public toInternalMessage(q: any): IMessage {
        // Reddedilme detayı önceliği: Aktif cevap reddi > Genel reddedilmiş cevap > Soru reddi
        const rejectionReason = q.answer?.reason || q.rejectedAnswer?.reason || q.reason;
        const rejectedAt = q.rejectedDate || q.rejectedAnswer?.creationDate;

        return {
            integrationCode: integrationCode,
            externalMessageId: String(q.id),
            threadId: String(q.id),

            // Trendyol'dan gelen maskeli müşteri adı
            externalUserName: q.userName || undefined,

            type: q.orderNumber ? 'ORDER_QUESTION' : 'PRODUCT_QUESTION',
            status: this.mapStatus(q.status),
            direction: 'INBOUND',

            text: q.text,
            answer: q.answer?.text || undefined,

            context: {
                orderNumber: q.orderNumber || undefined,
                productName: q.productName || undefined,
                imageUrl: q.imageUrl || undefined,
                productUrl: q.webUrl || undefined,
                productMainId: q.productMainId || undefined
            },

            // RED DETAYLARI
            isRejected: q.status === 'REJECTED' || !!rejectionReason,
            rejectionReason: rejectionReason || undefined,
            rejectedAt: rejectedAt ? new Date(rejectedAt) : undefined,

            // TARİHLER
            date: q.creationDate ? new Date(q.creationDate) : new Date(),
            answeredAt: q.answer?.creationDate ? new Date(q.answer.creationDate) : undefined,

            /**
             * Pazar yerine özgü flag'leri rawMetadata'ya atıyoruz.
             * Bu sayede UI'da "Bu soru halka açık mı?" gibi kontrolleri yapabilirsin.
             */
            rawMetadata: {
                public: q.public,
                showUserName: q.showUserName,
                hasPrivateInfo: q.answer?.hasPrivateInfo,
                reportReason: q.reportReason,
                reportedDate: q.reportedDate
            }
        };
    }

    private mapStatus(platformStatus: string): MessageStatus {
        switch (platformStatus) {
            case 'WAITING_SELLER':
                return 'WAITING_SELLER';
            case 'ANSWERED':
                return 'ANSWERED';
            case 'REJECTED':
                return 'REJECTED';
            default:
                // Bilinmeyen bir statüde her zaman aksiyon bekleyen moda çekmek en güvenlisi
                return 'WAITING_SELLER';
        }
    }
}
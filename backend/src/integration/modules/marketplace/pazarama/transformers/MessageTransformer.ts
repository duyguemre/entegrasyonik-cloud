import { IMessage, MessageStatus } from '@interfaces/index';
import { integrationCode } from '../constants';

export class MessageTransformer {
    public toInternalMessages(rawResponse: any): IMessage[] {
        // Handle list from getApprovalAnswersByMerchant
        const items = rawResponse?.ApprovalAnswersByMerchant || rawResponse?.approvalAnswersByMerchant || 
                      rawResponse?.ApprovalAnswersByMerchantSearchs || rawResponse?.approvalAnswersByMerchantSearchs || [];
        return items.map((q: any) => this.toInternalMessage(q));
    }

    public toInternalMessage(q: any): IMessage {
        return {
            integrationCode: integrationCode,
            externalMessageId: String(q.QuestionId || q.questionId),
            threadId: String(q.QuestionId || q.questionId),
            externalUserName: q.MaskedUserName || q.maskedUserName || 'Müşteri',
            type: 'PRODUCT_QUESTION',
            status: this.mapStatus(q.QuestionStatus !== undefined ? q.QuestionStatus : q.questionStatus),
            direction: 'INBOUND',
            text: q.Question || q.question || '',
            answer: q.Answer || q.answer || '',
            context: {
                productName: q.ProductName || q.productName,
                imageUrl: q.ProductImageUrl || q.productImageUrl,
                barcode: q.Barcode || q.barcode,
                brand: q.Brand || q.brand
            },
            isRejected: (q.QuestionStatus !== undefined ? q.QuestionStatus : q.questionStatus) === 3,
            date: (q.QuestionDate || q.questionDate) ? new Date(q.QuestionDate || q.questionDate) : new Date(),
            answeredAt: (q.AnswerDate || q.answerDate) ? new Date(q.AnswerDate || q.answerDate) : undefined,
            rawMetadata: { ...q }
        };
    }

    private mapStatus(platformStatus: number | string): MessageStatus {
        const status = Number(platformStatus);
        switch (status) {
            case 0: return 'WAITING_SELLER';
            case 1: return 'ANSWERED';
            case 2: return 'WAITING_APPROVAL'; // Pazarama: Onay bekliyor
            case 3: return 'REJECTED';
            default: return 'WAITING_SELLER';
        }
    }
}

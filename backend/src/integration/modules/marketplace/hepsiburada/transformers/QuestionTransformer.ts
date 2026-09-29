import { IMessage } from '@interfaces/index';
import { integrationCode } from '../constants';

export class QuestionMapper {
    public toInternalMessages(rawResponse: any): IMessage[] {
        const items = rawResponse.items || (Array.isArray(rawResponse) ? rawResponse : []);
        return items.map((item: any) => ({
            integrationCode,
            externalMessageId: String(item.id),
            type: item.type === 'Order' || item.orderNumber ? 'ORDER_QUESTION' : 'PRODUCT_QUESTION',
            status: this.mapStatus(item.status),
            direction: 'INBOUND',
            text: item.text,
            answer: item.answer,
            externalUserName: item.customerName,
            // [DÜZELTME, 2026-09-29, ADR-0016 B-R-T4 bulgusu] `creationDate` yoksa `new Date(undefined)` = Invalid
            // Date üretiyordu — AYNI dosyadaki `answeredAt` VE kardeş `OrderTransformer.orderDate`/
            // `ClaimTransformer.claimedAt`'ın kullandığı "yoksa şimdi" korumasıyla TUTARLI hale getirildi.
            date: item.creationDate ? new Date(item.creationDate) : new Date(),
            answeredAt: item.answerDate ? new Date(item.answerDate) : undefined,
            context: {
                orderNumber: item.orderNumber,
                productName: item.productName,
                barcode: item.productSku
            },
            rawMetadata: item
        }));
    }

    private mapStatus(status: string): any {
        switch (status) {
            case 'WaitingForAnswer': return 'WAITING_SELLER';
            case 'Answered': return 'ANSWERED';
            case 'Closed': return 'REJECTED';
            default: return 'WAITING_SELLER';
        }
    }
}

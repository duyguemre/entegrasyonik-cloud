import { Types } from 'mongoose';

export type MessageType = 'PRODUCT_QUESTION' | 'ORDER_QUESTION';
// [eslesme-fiyat WP4/WP6] AUTO_CLOSED: kanal tarafında kapanmış, cevaplanamaz (TY REPORTED/UNANSWERED); PRE_APPROVAL: cevap kanal onayında.
export type MessageStatus = 'WAITING_SELLER' | 'ANSWERED' | 'REJECTED' | 'UNREAD' | 'READ' | 'WAITING_APPROVAL' | 'AUTO_CLOSED' | 'PRE_APPROVAL';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export interface IMessageContext {
    orderNumber?: string;
    productName?: string;
    productUrl?: string;
    imageUrl?: string;
    productMainId?: string; // Trendyol'dan gelen model kodu için ekledik
    barcode?: string;
    brand?: string;
}

export interface IMessage {
    _id?: string | Types.ObjectId;

    integrationCode: string;
    externalMessageId: string;
    threadId?: string;

    customerId?: Types.ObjectId | string;
    orderId?: Types.ObjectId | string;

    // UI tarafında "Müşteri İsmi" maskeli de olsa Trendyol'dan gelir, saklayalım.
    externalUserName?: string;

    type: MessageType;
    status: MessageStatus;
    direction: MessageDirection;

    text: string;
    answer?: string;

    context?: IMessageContext;

    // REJECTION (RED) BÖLÜMÜ - Yeni Eklenenler
    isRejected?: boolean;           // Reddedildi mi?
    rejectionReason?: string;       // Red sebebi (Trendyol answer.reason veya q.reason)
    rejectedAt?: Date;              // Reddedilme tarihi

    // AUDIT & TIME
    date: Date;                     // Pazar yerindeki asıl sorulma tarihi
    answeredAt?: Date;              // Cevaplanma tarihi

    /**
     * Pazar yerine özgü ama sistemde genel karşılığı olmayan alanlar.
     * Örn: Trendyol'daki 'public', 'showUserName' gibi flaglar burada tutulabilir.
     */
    rawMetadata?: Record<string, any>;

    createdAt?: Date;
    updatedAt?: Date;
}
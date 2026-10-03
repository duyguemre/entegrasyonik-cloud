import { Schema, Document } from 'mongoose';
import { IMessage } from '@interfaces/index';

export type IMessageDocument = IMessage & Document;

export const MessageSchema = new Schema<IMessageDocument>(
    {
        integrationCode: { type: String, required: true, index: true },
        externalMessageId: { type: String, required: true },
        threadId: { type: String },

        // İlişkili Model Bağlantıları
        customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
        orderId: { type: Schema.Types.ObjectId, ref: 'Order' },

        // Pazar yerinden gelen müşteri adı (Örn: D**** B****)
        externalUserName: { type: String },

        type: {
            type: String,
            enum: ['PRODUCT_QUESTION', 'ORDER_QUESTION'],
            required: true,
            index: true
        },
        status: {
            type: String,
            // [eslesme-fiyat WP4/WP6] tip ile hizalı (WAITING_APPROVAL tipte vardı, şemada yoktu); şema-only, göç yok (K05)
            enum: ['WAITING_SELLER', 'ANSWERED', 'REJECTED', 'UNREAD', 'READ', 'WAITING_APPROVAL', 'AUTO_CLOSED', 'PRE_APPROVAL'],
            required: true,
            index: true
        },
        direction: { type: String, enum: ['INBOUND', 'OUTBOUND'], default: 'INBOUND' },

        text: { type: String, required: true },
        answer: { type: String },

        context: {
            orderNumber: { type: String },
            productName: { type: String },
            productUrl: { type: String }, // Trendyol'daki webUrl buraya maplenir
            imageUrl: { type: String },
            productMainId: { type: String } // Model kodu veya barkod
        },

        // REDDEDİLME (REJECTION) ALANLARI
        isRejected: { type: Boolean, default: false, index: true },
        rejectionReason: { type: String },
        rejectedAt: { type: Date },

        // TARİH BİLGİLERİ
        date: { type: Date, required: true }, // Pazar yerindeki asıl tarih
        answeredAt: { type: Date },

        // ESNEKLİK ALANI
        // Her pazar yerinin kendine has ekstra verilerini (public, showUserName vb.) kaybetmemek için
        rawMetadata: { type: Schema.Types.Mixed }
    },
    {
        timestamps: true,
        versionKey: false,
        collection: 'Messages'
    }
);

// Pazar yeri bazlı tekil mesaj kontrolü (En önemli index)
MessageSchema.index({ integrationCode: 1, externalMessageId: 1 }, { unique: true });

// UI Filtrelemeleri için performans indeksleri
MessageSchema.index({ customerId: 1 });
MessageSchema.index({ orderId: 1 });
MessageSchema.index({ date: -1 }); // En yeni mesajlar en üstte
MessageSchema.index({ isRejected: 1, status: 1 }); // Reddedilen ve bekleyenleri hızlı bulmak için

export default MessageSchema;
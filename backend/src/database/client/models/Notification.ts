import { PLATFORM_PROCESS } from "@interfaces/index";
import { Schema } from "mongoose";

export const NotificationSchema = new Schema({
    // Hangi kullanıcıya ait?
    userId: { type: Schema.Types.ObjectId, ref: 'Users', index: true },

    // Bildirim Tipi: BATCH_PROCESS, ORDER, STOCK_ALERT, INFO, SYSTEM
    type: {
        type: String,
        required: true,
        enum: ['BATCH_PROCESS', 'ORDER', 'STOCK_ALERT', 'INFO', 'SYSTEM', 'EXPORT_READY', 'IMPORT_READY'],
        index: true
    },


    // [ADR-0021 D2] `mode` (PLATFORM_PROCESS) yalnız toplu işlem/aktarım bildirimlerinde anlamlıdır ve zorunludur.
    // STOCK_ALERT (aşırı satış vb.), ORDER, INFO, SYSTEM bir platform işlemi değildir: eskiden koşulsuz `required`
    // olduğu için `mode` göndermeyen STOCK_ALERT yazımları ValidationError ile düşüyordu. Eski belgeler geçerli kalır.
    mode: {
        type: String,
        required: function (this: { type?: string }) {
            return this.type === 'BATCH_PROCESS' || this.type === 'EXPORT_READY' || this.type === 'IMPORT_READY';
        },
        enum: Object.values(PLATFORM_PROCESS),
        index: true
    },

    // Görselleştirme için seviye: success, info, warning, error
    severity: {
        type: String,
        enum: ['success', 'info', 'warning', 'error', 'primary', 'danger', 'critical'], // [ADR-0029] critical eklendi; danger okunurken error sayılır
        default: 'info'
    },

    // Başlık ve Detaylı Mesaj
    title: { type: String, required: true },
    message: { type: String, required: true },

    // Opsiyonel: Bildirime tıklandığında gidilecek rota (örn: /orders/123)
    actionUrl: { type: String, default: null },

    // Metadata: İşlemle ilgili ID'ler veya ek veriler (JSON formatında)
    metaData: { type: Schema.Types.Mixed, default: {} },

    // Durum takibi
    isRead: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false, index: true },

    // [ADR-0029 Karar 3] katalog alanları (yalnız ekleme; eski belgelerde yok). PII/ham hata metni YOK.
    code: { type: String, default: undefined },
    category: { type: String, default: undefined },
    params: { type: Schema.Types.Mixed, default: undefined },
    eventId: { type: String, default: undefined },          // NotificationEvents._id (impersonation birleşik görünümü tekilleştirir)
    groupKey: { type: String, default: undefined },
    count: { type: Number, default: 1 },
    lastOccurredAt: { type: Date, default: undefined },
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },

    // Zaman damgaları
    createdAt: { type: Date, default: Date.now, index: true },
    readAt: { type: Date, default: null },

    /**
     * Otomatik Silme Tarihi (3 Gün Sonrası)
     * default kısmında fonksiyon (arrow function) kullanmak, kaydın atıldığı andaki 
     * zamanı baz almasını sağlar.
     */
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    }
}, {
    timestamps: true,
    versionKey: false,
    collection: 'Notifications'
});

/**
 * INDEXLER
 */

// Performans: "Kullanıcının okunmamış son bildirimlerini getir" sorgusu için
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

/**
 * TTL (Time To Live) INDEX
 * expiresAt alanındaki tarih geldiğinde MongoDB dökümanı otomatik olarak siler.
 * expireAfterSeconds: 0 -> "Tarih alanındaki değerle şimdiki zaman eşleşince sil" demektir.
 */
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });




import { Schema } from 'mongoose';
import { IInvoiceDocument } from '@interfaces/invoice';

// ============================================================================
// 2. MONGOOSE ŞEMASI (Schema)
// ============================================================================
export const InvoiceSchema = new Schema<IInvoiceDocument>({
    integrationCode: { type: String, index: true },

    // REFERANSLAR
    orderId: { type: Schema.Types.ObjectId, ref: 'Orders', required: false, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customers', required: false, index: true },
    externalOrderId: { type: String, index: true },
    externalInvoiceId: { type: String, index: true },

    totalAmount: { type: Number },
    currency: { type: String, default: 'TRY' },
    invoiceMethod: {
        type: String,
        enum: ['MARKETPLACE', 'INTEGRATOR', 'MANUAL'],
        required: true,
        index: true
    },

    // YASAL KİMLİKLER
    ettn: { type: String, required: true, unique: true }, // ETTN dünyada eşsizdir!
    invoiceNumber: { type: String, index: true },         // Oluşması zaman alabilir (DRAFT aşamasında boştur)

    // BELGE VE İŞLEM TİPLERİ
    type: {
        type: String,
        enum: ['SALES', 'RETURN', 'EXPENSE'],
        default: 'SALES'
    },
    documentType: {
        type: String,
        enum: ['E_FATURA', 'E_ARSIV'],
        required: true
    },

    // DURUM YÖNETİMİ
    status: {
        type: String,
        enum: ['DRAFT', 'QUEUED', 'PROCESSING', 'APPROVED', 'FAILED', 'CANCELLED'],
        default: 'DRAFT',
        index: true
    },
    statusMessage: { type: String },
    errorCode: { type: String }, // Teknik hata kodlarını saklamak için eklendi

    // DOSYA VE LİNKLER (Tutarlılık için güncellendi)
    pdfUrl: { type: String },
    xmlUrl: { type: String },
    invoiceLink: { type: String }, // UI'da tıklandığında açılacak link (Sipariş özetiyle uyumlu)

    // TARİHLER
    issueDate: { type: Date, required: true }

}, {
    collection: 'Invoices',
    timestamps: true,
    strict: true
});

// [eslesme-fiyat WP6, D-ORD-1 / Ek E F-P1-2(b)] Sipariş başına tek SATIŞ faturası (upsert filtresinin DB güvencesi). Kısmi: yalnız
// `type:'SALES'` + dolu `externalOrderId` (siparişsiz manuel ve çoklu kısmi iade faturaları kapsam dışı). Uygulama: göç 0027.
InvoiceSchema.index(
    { integrationCode: 1, externalOrderId: 1, type: 1 },
    { unique: true, name: 'uniq_integration_externalOrder_sales', partialFilterExpression: { type: 'SALES', externalOrderId: { $gt: '' } } }
);

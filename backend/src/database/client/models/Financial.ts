import { Schema } from 'mongoose';
import {
    UniversalTransactionType,
    IFinancialTransactionDocument,
    ICargoInvoiceDocument,
    CargoShipmentType
} from '@interfaces/platforms';

// ============================================================================
// 1. EVRENSEL FINANSAL İŞLEM ŞEMASI
// ============================================================================
export const FinancialTransactionSchema = new Schema<IFinancialTransactionDocument>({
    integrationCode: { type: String, required: true, index: true },
    externalId: { type: String, required: true }, // unique index aşağıda tanımlandı
    orderNumber: { type: String, index: true },
    shipmentPackageId: { type: String, index: true },

    transactionType: {
        type: String,
        enum: Object.values(UniversalTransactionType),
        required: true,
        index: true
    },
    platformType: { type: String },

    // Finansal Değerler
    debt: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    netAmount: { type: Number, required: true },

    // Komisyon Detayları
    commissionRate: { type: Number },
    commissionAmount: { type: Number },
    sellerRevenue: { type: Number },

    // Tarihler
    transactionDate: { type: Date, required: true, index: true },
    payoutDate: { type: Date, index: true },
    paymentOrderId: { type: String, index: true },

    description: { type: String },
    meta: { type: Schema.Types.Mixed }

}, {
    collection: 'FinancialTransactions',
    timestamps: true,
    strict: true
});

// İndeksler
FinancialTransactionSchema.index({ integrationCode: 1, externalId: 1 }, { unique: true });
FinancialTransactionSchema.index({ integrationCode: 1, transactionDate: -1 });

// ============================================================================
// 2. EVRENSEL KARGO FATURA ŞEMASI
// ============================================================================
export const CargoInvoiceSchema = new Schema<ICargoInvoiceDocument>({
    integrationCode: { type: String, required: true, index: true },
    invoiceNumber: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    packageId: { type: String, required: true, index: true },

    shipmentType: {
        type: String,
        enum: Object.values(CargoShipmentType),
        required: true
    },

    desi: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    transactionDate: { type: Date, required: true, index: true },

    meta: { type: Schema.Types.Mixed }

}, {
    collection: 'CargoInvoices',
    timestamps: true,
    strict: true
});

// İndeksler
CargoInvoiceSchema.index({ integrationCode: 1, invoiceNumber: 1, packageId: 1 }, { unique: true });
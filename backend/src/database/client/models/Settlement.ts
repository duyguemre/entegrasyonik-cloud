import { IFinancialDeduction, ISettlementDocument } from '@interfaces/settlement';
import { Schema } from 'mongoose';

const FinancialDeductionSchema = new Schema<IFinancialDeduction>({
    type: {
        type: String,
        enum: ['COMMISSION', 'SHIPPING', 'MARKETING', 'SERVICE_FEE', 'PENALTY', 'REBATE', 'OTHER'],
        required: true
    },
    amount: { type: Number, required: true },
    description: { type: String }
}, { _id: false });

export const SettlementSchema = new Schema<ISettlementDocument>({
    integrationCode: { type: String, required: true, index: true },
    clientId: { type: String, required: true, index: true },

    // REFERANSLAR
    externalOrderId: { type: String, required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },

    // İŞLEM KİMLİKLERİ
    transactionId: { type: String, required: true, index: true },
    transactionType: {
        type: String,
        enum: ['SALE', 'RETURN', 'CANCEL', 'OTHER'],
        default: 'SALE'
    },

    // TARİHLER
    transactionDate: { type: Date, required: true },
    payoutDate: { type: Date, required: true, index: true },

    // PARASAL DEĞERLER
    grossAmount: { type: Number, required: true },
    totalDeduction: { type: Number, required: true },
    netAmount: { type: Number, required: true },

    // DETAYLI KESİNTİ LİSTESİ
    deductions: { type: [FinancialDeductionSchema], default: [] },

    currencyCode: { type: String, default: 'TRY' },
    status: {
        type: String,
        enum: ['UPCOMING', 'PAID', 'RECONCILED'],
        default: 'UPCOMING',
        index: true
    },

    meta: { type: Schema.Types.Mixed }

}, {
    collection: 'Settlements',
    timestamps: true,
    strict: true
});

// Idempotency: Aynı pazar yeri ve aynı işlem ID'si tekrar kaydedilemez.
SettlementSchema.index({ integrationCode: 1, transactionId: 1 }, { unique: true });

// Raporlama İndeksi: Belirli bir tarihteki ödemeleri hızlıca çekmek için
SettlementSchema.index({ payoutDate: 1, status: 1 });
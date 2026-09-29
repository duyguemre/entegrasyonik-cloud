import { Types, Document } from 'mongoose';

// Alt Şema: Kesinti kalemleri (Komisyon, Kargo, Ceza vb.)
export interface IFinancialDeduction {
    type: 'COMMISSION' | 'SHIPPING' | 'MARKETING' | 'SERVICE_FEE' | 'PENALTY' | 'REBATE' | 'OTHER';
    amount: number;
    description?: string; // Pazar yerinden gelen ham açıklama
}

export interface ISettlement {
    integrationCode: string;
    clientId: string; // Multi-tenant yapı için

    // Referanslar
    externalOrderId: string;      // Pazar yerindeki sipariş ID
    orderId?: Types.ObjectId;      // Bizim sistemdeki sipariş referansı

    // İşlem Detayları
    transactionId: string;         // Pazar yerinin bu finansal işleme verdiği ID
    transactionType: 'SALE' | 'RETURN' | 'CANCEL' | 'OTHER';

    // Tarihler
    transactionDate: Date;         // İşlemin gerçekleştiği tarih
    payoutDate: Date;              // Paranın banka hesabına yatacağı/yattığı tarih

    // Finansal Rakamlar
    grossAmount: number;           // Satış tutarı (Müşterinin ödediği)
    totalDeduction: number;        // Toplam kesinti (Komisyon + Kargo + vb.)
    netAmount: number;             // Satıcının cebine girecek net tutar (Gross - Deduction)

    // Kesinti Detayları
    deductions: IFinancialDeduction[];

    currencyCode: string;          // 'TRY', 'USD'
    status: 'UPCOMING' | 'PAID' | 'RECONCILED'; // Bekleyen, Ödenmiş, Eşleşmiş

    meta?: Record<string, any>;
}

export interface ISettlementDocument extends ISettlement, Document {
    createdAt: Date;
    updatedAt: Date;
}
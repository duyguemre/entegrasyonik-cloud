import { Document } from 'mongoose';

// ============================================================================
// 1. FINANSAL ENUM YAPILARI
// ============================================================================

export enum UniversalTransactionType {
    SALE = 'SALE',               // Satış Geliri
    RETURN = 'RETURN',           // İade Gideri
    CANCEL = 'CANCEL',           // İptal İşlemi
    PAYOUT = 'PAYOUT',           // Pazaryerinden Bankaya Yatan Hak Ediş
    DEDUCTION = 'DEDUCTION',     // Kargo, Reklam, Hizmet Bedeli vb. Kesintiler
    CORRECTION = 'CORRECTION',   // Düzeltme Kayıtları
    PROVISION = 'PROVISION',     // Provizyon / Bloke
    COUPON = 'COUPON',           // Kupon Gideri/Geliri
    DISCOUNT = 'DISCOUNT'        // İndirim Kalemleri
}

export enum CargoShipmentType {
    FORWARD = 'FORWARD',         // Gidiş Kargo
    RETURN = 'RETURN'            // İade Kargo
}

// ============================================================================
// 2. FINANSAL İŞLEM INTERFACE
// ============================================================================

export interface IFinancialTransaction {
    integrationCode: string;            // 'TRENDYOL', 'HEPSIBURADA'
    externalId: string;                 // Pazaryeri benzersiz ID
    orderNumber?: string;               // İlişkili Sipariş No
    shipmentPackageId?: string;         // Paket ID (Kargo eşleşmesi için)

    transactionType: UniversalTransactionType;
    platformType: string;               // Pazaryerinden gelen orijinal tip adı (örn: 'Sale', 'CashAdvance')

    debt: number;                       // Borç (Eksi bakiye)
    credit: number;                     // Alacak (Artı bakiye)
    netAmount: number;                  // Net (credit - debt)

    commissionRate?: number;            // Komisyon Yüzdesi
    commissionAmount?: number;          // Komisyon Tutarı
    sellerRevenue?: number;             // Satıcıya kalan net tutar

    transactionDate: Date;              // İşlem Tarihi
    payoutDate?: Date;                  // Tahmini Vade/Ödeme Tarihi
    paymentOrderId?: string;            // Ödeme Emri Numarası

    description?: string;               // İşlem açıklaması
    meta?: any;                         // Ekstra bilgiler
}

export interface IFinancialTransactionDocument extends IFinancialTransaction, Document { }

// ============================================================================
// 3. KARGO DETAY INTERFACE
// ============================================================================

export interface ICargoInvoice {
    integrationCode: string;
    invoiceNumber: string;              // Fatura Seri/Sıra No
    orderNumber: string;                // Sipariş No
    packageId: string;                  // parcelUniqueId / Barcode
    shipmentType: CargoShipmentType;
    desi: number;                       // Ölçülen Desi
    amount: number;                     // Fatura Tutarı
    transactionDate: Date;              // Fatura Tarihi
    meta?: any;
}

export interface ICargoInvoiceDocument extends ICargoInvoice, Document { }
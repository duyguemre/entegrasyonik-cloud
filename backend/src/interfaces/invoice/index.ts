import { Document, Types } from 'mongoose';

// ============================================================================
// 1. TİP TANIMLAMALARI (Interface)
// ============================================================================
export interface IInvoice {
    integrationCode?: string;

    // İlişkili Kayıtlar
    orderId?: string | Types.ObjectId;
    customerId?: string | Types.ObjectId;
    externalOrderId?: string; // Pazaryeri Sipariş ID si
    externalInvoiceId?: string; // Pazaryeri Fatura ID si eğer varsa

    // Faturanın hangi yöntemle tetiklendiği (Karar mekanizması takibi için)
    invoiceMethod: 'MARKETPLACE' | 'INTEGRATOR' | 'MANUAL'; // EKLENDİ

    totalAmount?: number;
    currency?: string;

    // Kimlik Bilgileri
    ettn: string; // UUID
    invoiceNumber?: string;

    // Tip Tanımları
    type: 'SALES' | 'RETURN' | 'EXPENSE';
    documentType: 'E_FATURA' | 'E_ARSIV';

    // Durum Yönetimi
    status: 'DRAFT' | 'QUEUED' | 'PROCESSING' | 'APPROVED' | 'FAILED' | 'CANCELLED';
    statusMessage?: string; // Kullanıcıya gösterilecek detaylı durum
    errorCode?: string;     // Teknik hata kodu (Örn: "ERR_INVALID_VAT") - EKLENDİ

    // Dosya ve Linkler
    pdfUrl?: string;        // Orijinal dosya yolu
    xmlUrl?: string;        // Resmi XML yolu
    invoiceLink?: string;   // UI'da tıklandığında açılacak kısa link - EKLENDİ

    issueDate: Date;
}

export interface IInvoiceDocument extends IInvoice, Document {
    createdAt: Date;
    updatedAt: Date;
}

// ============================================================================
// 2. MONGOOSE SCHEMA (Referans İçin)
// ============================================================================
// Not: Bu arayüze uygun Schema'yı oluştururken orderId'ye index atmayı unutma.
import { Document, Types } from 'mongoose';

// ============================================================================
// 1. DIŞ KİMLİKLER (External Identities)
// ============================================================================
export interface IExternalIdentity {
    integrationCode: string; // 'trendyol', 'hepsiburada'
    externalCustomerId: string; // Pazaryeri tarafındaki tekil ID
}

// ============================================================================
// 2. MÜŞTERİ ADRES HAVUZU
// ============================================================================
export interface ICustomerAddress {
    _id?: string | Types.ObjectId; // Referans verilebilmesi için ID önemli
    title?: string;
    addressLine: string;
    city: string;
    state: string;
    postalCode?: string;
    isDefaultShipping?: boolean;
    isDefaultBilling?: boolean;
}

// ============================================================================
// 3. CRM & INSIGHT METRİKLERİ (İş Geliştirme Odaklı)
// ============================================================================
export interface ICustomerMetrics {
    totalOrderCount: number;
    totalSpent: number;           // Toplam Ciro (LTV)
    totalClaimCount: number;      // İade Sayısı (Insight için kritik)
    totalReturnAmount: number;    // İade Edilen Toplam Tutar
    averageOrderValue: number;    // (totalSpent / totalOrderCount)
    lastOrderDate?: Date;
    firstOrderDate?: Date;
    preferredPlatform?: string;   // 'trendyol', 'ideasoft' vb.
}

// ============================================================================
// 4. ANA MÜŞTERİ YAPISI (Saf Veri / DTO)
// ============================================================================
export interface ICustomer {
    _id?: string | Types.ObjectId;
    firstName: string;
    lastName?: string;
    companyName?: string;

    // Kurumsal Kimlik (E-Fatura & B2B Analizi için)
    isCorporate?: boolean;
    taxNumber?: string; // TCKN veya VKN
    taxOffice?: string;

    // İletişim Bilgileri
    email?: string;
    phone?: string;
    isEmailMasked?: boolean;
    isPhoneMasked?: boolean;

    // İlişkisel Veriler
    externalIdentities?: IExternalIdentity[];
    addresses?: ICustomerAddress[];

    // CRM ve Segmentasyon
    metrics?: ICustomerMetrics;
    tags?: string[]; // 'VIP', 'HIGH_RETURN_RISK', 'PASSIVE'
    status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

    // Esneklik Katmanı
    meta?: Record<string, any>; // Pazaryerinden gelen ekstra tüm ham veriler
}

// ============================================================================
// 5. MONGOOSE DOCUMENT YAPI (Veritabanı Çıktısı)
// ============================================================================
export interface ICustomerDocument extends ICustomer, Document {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
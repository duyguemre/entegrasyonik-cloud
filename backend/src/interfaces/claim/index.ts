import { Document, Types } from 'mongoose';

// ============================================================================
// 1. İADE / TALEP ENUMLARI
// ============================================================================

export enum ClaimTypeEnum {
    REFUND = 'REFUND',           // Para İadesi
    REPLACEMENT = 'REPLACEMENT', // Değişim
    CANCEL = 'CANCEL',           // İptal (Kargo öncesi)
    UNKNOWN = 'UNKNOWN'
}

export enum ClaimInternalStatusEnum {
    WAITING = 'WAITING',           // İlk talep (TY: Created, PAZ: Onay Bekliyor)
    UNDER_REVIEW = 'UNDER_REVIEW', // İnceleme/Analiz (TY: InAnalysis)
    APPROVED = 'APPROVED',         // Onaylandı (PAZ: 2,4,6,8, TY: Accepted)
    REJECTED = 'REJECTED',         // Reddedildi (PAZ: 3,5, TY: Rejected)
    CANCELLED = 'CANCELLED',       // Talep iptal (PAZ: 7, TY: Cancelled)
    DISPUTED = 'DISPUTED',          // İtiraz/Uyuşmazlık (TY: Unresolved)
    COMPLETED = 'COMPLETED'        // DOSYA KAPANDI (Para yattı veya ürün müşteriye geri ulaştı)
}

// ============================================================================
// 2. ALT YAPILAR
// ============================================================================

export interface IClaimItem {
    /** * ORDER-CLAIM KÖPRÜSÜ: Sipariş satırındaki 'externalLineItemId' ile 
     * birebir eşleşmelidir. İş analitiği için hayati önemde.
     */
    externalLineItemId: string;
    externalItemId: string;

    sku: string;
    barcode: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    reason?: string;
    description?: string;
}

export interface IClaimFulfillment {
    carrierCode?: string;
    carrierName?: string;
    trackingCode?: string;
    trackingUrl?: string;
}

export interface IClaimHistory {
    status: ClaimInternalStatusEnum;
    changedAt: Date;
    description?: string;
    actionBy?: string;
    meta?: Record<string, any>;
}

// ============================================================================
// 3. ANA İADE / TALEP YAPISI (IClaim)
// ============================================================================

export interface IClaim {
    _id?: string | Types.ObjectId;
    integrationCode: string;
    externalClaimId: string; // Pazar yeri iade ID'si
    externalOrderId: string; // Pazar yeri sipariş ID'si

    customerId?: string | Types.ObjectId;
    orderId?: string | Types.ObjectId;

    type: ClaimTypeEnum;
    externalStatus: string;
    internalStatus: ClaimInternalStatusEnum;

    // FİNANSAL VERİLER
    totalRefundAmount: number; // Müşteriye iade edilecek net tutar
    currencyCode: string;

    items: IClaimItem[];
    fulfillment?: IClaimFulfillment;
    history: IClaimHistory[];

    // DENETİM VE METRİK KONTROLÜ
    flags?: {
        /** * CRM metrikleri (totalClaimCount, totalReturnAmount) bu iade için işlendi mi? 
         * OrderWorker'ın mükerrer sayım yapmasını önler.
         */
        isMetricsProcessed?: boolean;
        isInventoryUpdated?: boolean; // Stok iade alındı mı?
    };

    claimedAt: Date;           // İade açılış tarihi
    resolvedAt?: Date;          // İade kapanış tarihi
    externalUpdatedAt?: Date;

    meta?: Record<string, any>;
}

// ============================================================================
// 4. VERİTABANI VE PAKETLEME
// ============================================================================

export interface IClaimDocument extends IClaim, Document {
    _id: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

export interface IClaimPackage {
    claim: IClaim;
    customer?: any; // ICustomer interface'i buraya bağlanabilir
}
export enum InvoiceStatusEnum {
    DRAFT = 'DRAFT',
    QUEUED = 'QUEUED',
    PROCESSING = 'PROCESSING',
    APPROVED = 'APPROVED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED'
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatusEnum, string> = {
    [InvoiceStatusEnum.DRAFT]: 'Taslak',
    [InvoiceStatusEnum.QUEUED]: 'Kuyrukta',
    [InvoiceStatusEnum.PROCESSING]: 'İşleniyor',
    [InvoiceStatusEnum.APPROVED]: 'Onaylandı',
    [InvoiceStatusEnum.FAILED]: 'Hatalı',
    [InvoiceStatusEnum.CANCELLED]: 'İptal edildi'
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatusEnum, string> = {
    [InvoiceStatusEnum.DRAFT]: 'slate-500',      // Gri
    [InvoiceStatusEnum.QUEUED]: 'info',          // Açık Mavi
    [InvoiceStatusEnum.PROCESSING]: 'warning',   // Turuncu
    [InvoiceStatusEnum.APPROVED]: 'success',     // Yeşil
    [InvoiceStatusEnum.FAILED]: 'error',         // Kırmızı
    [InvoiceStatusEnum.CANCELLED]: 'error'       // Kırmızı
};

export enum InvoiceMethodEnum {
    MARKETPLACE = 'MARKETPLACE',
    INTEGRATOR = 'INTEGRATOR',
    MANUAL = 'MANUAL'
}

export const INVOICE_METHOD_LABELS: Record<InvoiceMethodEnum, string> = {
    [InvoiceMethodEnum.MARKETPLACE]: 'Pazaryeri',
    [InvoiceMethodEnum.INTEGRATOR]: 'Entegratör',
    [InvoiceMethodEnum.MANUAL]: 'Manuel'
};

export enum InvoiceTypeEnum {
    SALES = 'SALES',
    RETURN = 'RETURN',
    EXPENSE = 'EXPENSE'
}

export const INVOICE_TYPE_LABELS: Record<InvoiceTypeEnum, string> = {
    [InvoiceTypeEnum.SALES]: 'Satış Faturası',
    [InvoiceTypeEnum.RETURN]: 'İade Faturası',
    [InvoiceTypeEnum.EXPENSE]: 'Kargo / Gider Faturası'
};

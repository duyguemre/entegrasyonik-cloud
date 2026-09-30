export enum PLATFORM_PROCESS {
    TRANSFER = "TRANSFER",
    UPDATE_PRICE = "UPDATE_PRICE",
    UPDATE_STOCK = "UPDATE_STOCK",
    UPDATE = "UPDATE",
    UPDATE_VARIANT = "UPDATE_VARIANT",
    UPDATE_DELIVERY = "UPDATE_DELIVERY",
    IMPORT = "IMPORT",
}


export const PLATFORM_PROCESS_LABELS: Record<PLATFORM_PROCESS, string> = {
    [PLATFORM_PROCESS.TRANSFER]: 'Ürün Gönderimi',
    [PLATFORM_PROCESS.UPDATE_PRICE]: 'Fiyat Güncelleme',
    [PLATFORM_PROCESS.UPDATE_STOCK]: 'Stok Güncelleme',
    [PLATFORM_PROCESS.UPDATE]: 'Ürün Güncelleme',
    [PLATFORM_PROCESS.UPDATE_VARIANT]: 'Varyant Güncelleme',
    [PLATFORM_PROCESS.UPDATE_DELIVERY]: 'Teslimat Güncelleme',
    [PLATFORM_PROCESS.IMPORT]: "İçe Aktarım"
};



/**
 * Süreç türü → renk (CSS değeri; DS-v2 rol token'ı). Yalnızca ayırt edici aksan; anlam
 * metin etiketiyle (`PLATFORM_PROCESS_LABELS`) taşınır (WCAG 1.4.1).
 */
export const PLATFORM_PROCESS_COLORS: Record<string, string> = {
    [PLATFORM_PROCESS.TRANSFER]: 'var(--ek-color-action)',
    [PLATFORM_PROCESS.UPDATE_PRICE]: 'var(--ek-color-info)',
    [PLATFORM_PROCESS.UPDATE_STOCK]: 'var(--ek-color-success)',
    [PLATFORM_PROCESS.UPDATE]: 'var(--ek-color-warning)',
    [PLATFORM_PROCESS.UPDATE_VARIANT]: 'var(--ek-color-content-muted)',
    [PLATFORM_PROCESS.UPDATE_DELIVERY]: 'var(--ek-color-content-strong)',
};


export const PLATFORM_PROCESS_MODES: PLATFORM_PROCESS[] = [
    PLATFORM_PROCESS.TRANSFER,
    PLATFORM_PROCESS.UPDATE,
    PLATFORM_PROCESS.UPDATE_PRICE,
    PLATFORM_PROCESS.UPDATE_STOCK,
    PLATFORM_PROCESS.UPDATE_VARIANT,
    PLATFORM_PROCESS.UPDATE_DELIVERY
];


export const PLATFORM_PROCESS_ICONS: Record<PLATFORM_PROCESS, string> = {
    [PLATFORM_PROCESS.TRANSFER]: 'mdi-cloud-upload',
    [PLATFORM_PROCESS.UPDATE_PRICE]: 'mdi-currency-try',
    [PLATFORM_PROCESS.UPDATE_STOCK]: 'mdi-counter',
    [PLATFORM_PROCESS.UPDATE]: 'mdi-sync',
    [PLATFORM_PROCESS.UPDATE_VARIANT]: 'mdi-vector-difference', // Yeni
    [PLATFORM_PROCESS.UPDATE_DELIVERY]: 'mdi-truck-delivery',   // Yeni
    [PLATFORM_PROCESS.IMPORT]: 'mdi-cloud-download',            // Yeni
};
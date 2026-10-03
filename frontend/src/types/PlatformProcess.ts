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



export const PLATFORM_PROCESS_COLORS: Record<string, string> = {
    [PLATFORM_PROCESS.TRANSFER]: '#6200ea',        // Mor (Deep Purple)
    [PLATFORM_PROCESS.UPDATE_PRICE]: '#2962ff',    // Mavi (Accent Blue)
    [PLATFORM_PROCESS.UPDATE_STOCK]: '#00c853',    // Yeşil (Accent Green)
    [PLATFORM_PROCESS.UPDATE]: '#ff6d00',          // Turuncu (Deep Orange)
    [PLATFORM_PROCESS.UPDATE_VARIANT]: '#00b8d4',  // Turkuaz/Cyan (Yeni)
    [PLATFORM_PROCESS.UPDATE_DELIVERY]: '#d500f9', // Pembe/Magenta (Yeni)
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
// src/integration/common/IPlatformProvider.ts

export interface IPlatformMappingProvider {
    // Kategori & Marka Dönüşümleri
    getPlatformCategoryId(localId: string): Promise<string | number>;
    getPlatformBrandId(localId: string): Promise<string | number>;
    getLocalCategoryId(platformId: string | number): Promise<string | undefined>;
    getLocalBrandId(platformId: string | number): Promise<string | undefined>;

    // Bilgilendirme
    getLocalCategoryTitle(localId: string): Promise<string>;
    getLocalBrandTitle(localId: string): Promise<string>;

    // Varyant & Seçenek Mantığı
    getLocalChoices(): Promise<any[]>;
    getAllAttributeMappings(): Promise<any[]>;
    /** [WP9] Yerel kategori (+ isteğe bağlı platform kategorisi) için bu entegrasyonun özellik eşlemeleri. */
    getAttributeMappingsForCategory(localCategoryId: string, platformCategoryId?: string | number): Promise<any[]>;
    // Gerekirse komisyon/vergi gibi ayarları da buradan sağlayabiliriz
    /** Komisyon yüzdesi; `null` = bilinmiyor (0 DEĞİL). */
    getCategoryCommission(platformCategoryId: string | number): Promise<number | null>;
}
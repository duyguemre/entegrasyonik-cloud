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
    // Gerekirse komisyon/vergi gibi ayarları da buradan sağlayabiliriz
    getCategoryCommission(platformCategoryId: string | number): Promise<number>;
}
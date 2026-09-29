import { IClientDB } from "@interfaces/index";
import { Cache } from "@utils/decorator/cache";

/**
 * CatalogOperations: Marka, Kategori ve Seçenek (Choice) eşleşmelerini yöneten operasyon sınıfı.
 * Veritabanı sorgularını cache mekanizması ile optimize eder.
 */
export class CatalogOperations {
    constructor(
        private clientDB: IClientDB,
        private clientId: string
    ) { }

    // --- TEMEL VERİ SAĞLAYICILAR (CACHED) ---

    @Cache(300, 'CatalogOperations', (that) => that.clientId)
    public async getEntegrasyonikChoices() {
        return await this.clientDB.getChoiceModel().find({}).lean();
    }

    @Cache(300, 'CatalogOperations', (that) => that.clientId)
    public async getEntegrasyonikBrands() {
        return await this.clientDB.getBrandModel().find({}).lean();
    }

    @Cache(300, 'CatalogOperations', (that) => that.clientId)
    public async getEntegrasyonikCategories() {
        return await this.clientDB.getCategoryModel().find({}).lean();
    }

    @Cache(600, 'CatalogOperations', (that) => that.clientId)
    public async getCachedClientIntegrations() {
        return await this.clientDB.getClientIntegrationModel().findOne({}).lean();
    }

    // --- ID MAPPING: PLATFORM <-> ENTEGRASYONIK ---

    /**
     * Platformdan gelen Kategori ID'sini sistemdeki karşılığına (ObjectId) dönüştürür.
     */
    public async getEntegrasyonikCategoryId(integrationCode: string, platformCategoryId: any) {
        const categories = await this.getEntegrasyonikCategories();
        return categories.find((c: any) => c.platforms?.[integrationCode] == platformCategoryId)?._id;
    }

    /**
     * Sistemdeki Kategori ID'sini (ObjectId) ilgili platformun Kategori ID'sine dönüştürür.
     */
    public async getIntegrationCategoryId(integrationCode: string, entegrasyonikCategoryId: any) {
        const categories = await this.getEntegrasyonikCategories();
        const found = categories.find((c: any) => c._id.toString() == entegrasyonikCategoryId.toString());
        return found?.platforms?.[integrationCode];
    }

    /**
     * Platformdan gelen Marka ID'sini sistemdeki karşılığına (ObjectId) dönüştürür.
     */
    public async getEntegrasyonikBrandId(integrationCode: string, platformBrandId: any) {
        const brands = await this.getEntegrasyonikBrands();
        return brands.find((b: any) => b.platforms?.[integrationCode]?.id == platformBrandId)?._id;
    }

    /**
     * Sistemdeki Marka ID'sini (ObjectId) ilgili platformun Marka ID'sine dönüştürür.
     */
    public async getIntegrationBrandId(integrationCode: string, entegrasyonikBrandId: any) {
        const brands = await this.getEntegrasyonikBrands();
        return brands.find((b: any) => b._id.toString() == entegrasyonikBrandId.toString())?.platforms?.[integrationCode]?.id;
    }

    // --- YARDIMCI METOTLAR (TITLE/SEARCH) ---

    /**
     * Kategori ID'sine göre başlık döner.
     */
    public async getEntegrasyonikCategoryTitle(id: any): Promise<string> {
        const categories = await this.getEntegrasyonikCategories();
        const found = categories.find((c: any) => c._id.toString() == id.toString());
        return found?.title || "Bilinmeyen Kategori";
    }

    /**
     * Marka ID'sine göre başlık döner.
     */
    public async getEntegrasyonikBrandTitle(id: any): Promise<string> {
        const brands = await this.getEntegrasyonikBrands();
        const found = brands.find((b: any) => b._id.toString() == id.toString());
        return found?.title || "Bilinmeyen Marka";
    }
}
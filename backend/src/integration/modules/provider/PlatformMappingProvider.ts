// src/integration/adapters/PlatformMappingProvider.ts

import { IPlatformMappingProvider } from "./IPlatformMappingProvider";
import { IClientDB } from "@interfaces/index";
import { Cache } from '@utils/decorator/cache';

export class PlatformMappingProvider implements IPlatformMappingProvider {
    constructor(
        private clientDB: IClientDB,
        private clientId: any,
        private integrationCode: string // Sadece filtreleme için kullanılır
    ) { }

    @Cache(30, 'PlatformMappingProvider_getAllAttributeMappings', (that) => that.clientId)
    async getAllAttributeMappings(): Promise<any[]> {
        return await this.clientDB.getAttributeMappingModel().find({}).lean();
    }

    // --- SHARED DATA SOURCES (Dükkan Bazlı Global Cache) ---
    // Cache anahtarında integrationCode YOK. Sadece clientId var.

    @Cache(600, 'PlatformMappingProvider_getAllCategories', (that) => that.clientId)
    private async getAllCategories() {
        return await this.clientDB.getCategoryModel().find({}).lean();
    }

    @Cache(600, 'PlatformMappingProvider_getAllBrands', (that) => that.clientId)
    private async getAllBrands() {
        return await this.clientDB.getBrandModel().find({}).lean();
    }

    @Cache(600, 'PlatformMappingProvider_getAllAtrributeMappings', (that) => that.clientId)
    private async getAllAtrributeMappings() {
        return await this.clientDB.getAttributeMappingModel().find({}).lean();
    }

    @Cache(600, 'PlatformMappingProvider_getLocalChoices', (that) => that.clientId)
    public async getLocalChoices(): Promise<any[]> {
        return await this.clientDB.getChoiceModel().find({}).lean();
    }

    // --- INTERFACE IMPLEMENTATION (Hafif Filtreleme Katmanı) ---

    async getPlatformCategoryId(localId: string): Promise<string | number> {
        const attributeMappings = await this.getAllAtrributeMappings();
        const found = attributeMappings.find((c: any) => c.localCategoryId.toString() === localId.toString() && c.integrationCode == this.integrationCode && c.isCategoryMapping == true);
        return found?.platformCategoryId;
    }

    async getPlatformBrandId(localId: string): Promise<string | number> {
        const brands = await this.getAllBrands(); // Global cache'den gelir
        const found = brands.find((b: any) => b._id.toString() === localId.toString());
        return found?.platforms?.[this.integrationCode]?.id;
    }

    async getLocalCategoryId(platformCategoryId: string | number): Promise<string | undefined> {
        const attributeMappings = await this.getAllAtrributeMappings();
        const found = attributeMappings.find((c: any) => c.integrationCode == this.integrationCode && String(c.platformCategoryId) == String(platformCategoryId) && c.isCategoryMapping == true);
        return found ? String(found.localCategoryId) : undefined;
    }

    async getLocalBrandId(platformId: string | number): Promise<string | undefined> {
        const brands = await this.getAllBrands();
        const found = brands.find((b: any) => b.platforms?.[this.integrationCode]?.id == platformId);
        return found ? String(found._id) : undefined;
    }

    async getLocalCategoryTitle(localId: string): Promise<string> {
        const categories = await this.getAllCategories();
        return categories.find((c: any) => c._id.toString() === localId.toString())?.title || "Bilinmeyen Kategori";
    }

    async getLocalBrandTitle(localId: string): Promise<string> {
        const brands = await this.getAllBrands();
        return brands.find((b: any) => b._id.toString() === localId.toString())?.title || "Bilinmeyen Marka";
    }

    async getCategoryCommission(platformCategoryId: string | number): Promise<number> {
        const categories = await this.getAllCategories();
        const found = categories.find((c: any) => c.platforms?.[this.integrationCode] == platformCategoryId);
        return found?.commission || 0;
    }
}
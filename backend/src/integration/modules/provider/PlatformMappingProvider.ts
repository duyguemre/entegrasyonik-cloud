// src/integration/adapters/PlatformMappingProvider.ts

import { IPlatformMappingProvider } from "./IPlatformMappingProvider";
import { IClientDB } from "@interfaces/index";
import { Cache } from '@utils/decorator/cache';
import trendyolCommissions from '../marketplace/trendyol/commissions.json';
import pazaramaCommissions from '../marketplace/pazarama/commissions.json';

// [DB-06] Kanal komisyon tablosu (ADR-0032 / playbook §4.14: kanal paylasilan referans verisi tenant DB'ye kopyalanmaz).
// Kategori eslemesinin tek kaynagi `AttributeMappings`tir; komisyon ise KANAL TABLOSUNDA platform kategori kimligiyle aranir.
// ESKI okuma (`Categories.platforms.<kod>` + var olmayan `commission` alani) her zaman null donuyordu (DBR-13).
const CHANNEL_COMMISSION_TABLES: Readonly<Record<string, ReadonlyArray<any>>> = {
    trendyol: trendyolCommissions as any[],
    pazarama: pazaramaCommissions as any[],
};
const commissionIndexCache = new Map<string, Map<string, number>>();

/** Kanal tablosunu (ic ice `childrenCategories`) bir kez duzlestirir: platformCategoryId -> temel `commission` (yalniz sayisal olanlar). */
function commissionIndex(integrationCode: string): Map<string, number> {
    let idx = commissionIndexCache.get(integrationCode);
    if (idx) return idx;
    idx = new Map();
    const walk = (nodes: ReadonlyArray<any>) => {
        for (const n of nodes) {
            if (typeof n?.commission === 'number' && Number.isFinite(n.commission)) idx!.set(String(n.id), n.commission);
            if (Array.isArray(n?.childrenCategories)) walk(n.childrenCategories);
        }
    };
    walk(CHANNEL_COMMISSION_TABLES[integrationCode] ?? []);
    commissionIndexCache.set(integrationCode, idx);
    return idx;
}

export class PlatformMappingProvider implements IPlatformMappingProvider {
    constructor(
        private clientDB: IClientDB,
        private clientId: any,
        private integrationCode: string // Sadece filtreleme için kullanılır
    ) { }

    // [WP9] Tek önbellekli kaynak (eskiden 30 sn'lik bu metot + 10 dk'lık yazım hatalı `getAllAtrributeMappings` AYNI koleksiyonu
    // iki kez okuyordu). Yazma yolları `@InvalidatesTenantCache('PlatformMappingProvider', ...)` ile aileyi düşürdüğü için (WP3)
    // 10 dk (ADR-0002 tenant üst sınırı) güvenlidir. Anahtar entegrasyon koduna göre ayrışır (aynı tenant, farklı entegrasyon = ayrı kayıt).
    @Cache({ scope: 'tenant', ttl: '10m', context: 'PlatformMappingProvider_getAllAttributeMappings' })
    async getAllAttributeMappings(): Promise<any[]> {
        return await this.clientDB.getAttributeMappingModel().find({}).lean();
    }

    // --- SHARED DATA SOURCES (Dükkan Bazlı Global Cache) ---
    // Anahtar t:<clientId>:<integrationCode>:... biçimindedir (entegrasyon başına ayrı kayıt; invalidation aile önekiyle hepsini düşürür).

    @Cache({ scope: 'tenant', ttl: '10m', context: 'PlatformMappingProvider_getAllCategories' })
    private async getAllCategories() {
        return await this.clientDB.getCategoryModel().find({}).lean();
    }

    @Cache({ scope: 'tenant', ttl: '10m', context: 'PlatformMappingProvider_getAllBrands' })
    private async getAllBrands() {
        return await this.clientDB.getBrandModel().find({}).lean();
    }

    @Cache({ scope: 'tenant', ttl: '10m', context: 'PlatformMappingProvider_getLocalChoices' })
    public async getLocalChoices(): Promise<any[]> {
        return await this.clientDB.getChoiceModel().find({}).lean();
    }

    /**
     * [WP9] Bir yerel kategori için BU entegrasyonun özellik (nitelik) eşlemeleri (kategori-eşleme kaydı hariç). Tüm çözümleme
     * (import/export) aynı süzmeyi kullansın diye tek yerde: entegrasyon + yerel kategori (+ isteğe bağlı platform kategorisi).
     * Platform kategorisi verilirse yalnız o platform kategorisine yapılmış eşlemeler döner (yerel kategori başka platform
     * kategorisine yeniden eşlendiyse ESKİ kategoriye ait bayat özellik eşlemeleri çözümlemeye karışmaz).
     */
    async getAttributeMappingsForCategory(localCategoryId: string, platformCategoryId?: string | number): Promise<any[]> {
        if (localCategoryId === undefined || localCategoryId === null || String(localCategoryId) === '') return [];
        const all = await this.getAllAttributeMappings();
        return all.filter((m: any) =>
            m.integrationCode === this.integrationCode &&
            m.isCategoryMapping !== true &&
            String(m.localCategoryId) === String(localCategoryId) &&
            (platformCategoryId === undefined || platformCategoryId === null || String(m.platformCategoryId) === String(platformCategoryId)));
    }

    // --- INTERFACE IMPLEMENTATION (Hafif Filtreleme Katmanı) ---

    async getPlatformCategoryId(localId: string): Promise<string | number> {
        if (localId === undefined || localId === null || String(localId) === '') return undefined as any; // eşleme yok (eskiden TypeError)
        const attributeMappings = await this.getAllAttributeMappings();
        const found = attributeMappings.find((c: any) => String(c.localCategoryId) === String(localId) && c.integrationCode == this.integrationCode && c.isCategoryMapping == true);
        return found?.platformCategoryId;
    }

    async getPlatformBrandId(localId: string): Promise<string | number> {
        if (localId === undefined || localId === null || String(localId) === '') return undefined as any;
        const brands = await this.getAllBrands(); // Global cache'den gelir
        const found = brands.find((b: any) => b._id.toString() === localId.toString());
        return found?.platforms?.[this.integrationCode]?.id;
    }

    async getLocalCategoryId(platformCategoryId: string | number): Promise<string | undefined> {
        const attributeMappings = await this.getAllAttributeMappings();
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

    /**
     * COM-02 + DB-06: platform kategori kimligi icin KANAL komisyon tablosundaki temel oran; tabloda yok/tanimsiz -> `null`
     * (bilinmiyor, %0 DEGIL); gercek `0` korunur. `ka1`/`ka2` kademeleri SECILMEZ (COM-01 insan teyidi).
     */
    async getCategoryCommission(platformCategoryId: string | number): Promise<number | null> {
        if (platformCategoryId === undefined || platformCategoryId === null || String(platformCategoryId) === '') return null;
        return commissionIndex(this.integrationCode).get(String(platformCategoryId)) ?? null;
    }

    /** [DB-06] Yerel kategori -> `AttributeMappings` (isCategoryMapping) ile platform kategorisi -> kanal tablosundaki oran; eslesme yoksa `null`. */
    async getLocalCategoryCommission(localCategoryId: string): Promise<number | null> {
        const platformCategoryId = await this.getPlatformCategoryId(localCategoryId);
        return platformCategoryId === undefined || platformCategoryId === null ? null : this.getCategoryCommission(platformCategoryId);
    }
}

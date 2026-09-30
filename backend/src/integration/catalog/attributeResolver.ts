// WP12 (faz4-int): export'ta SUNUCU TARAFI özellik çözümleyici (ADR-0025). Yerel seçenekler (`variant.choices`) ->
// platform özellikleri (`platforms[code].attributes`). Platformdan bağımsız; platform adaptörleri yalnız SONUCU okur.
// Öncelik: dolu (FE/import) `attributes[id]` DOKUNULMAZ; çözümleyici yalnız eksik/boş olanları tamamlar.

import { normalizeAttrValue } from './attributePayload';

/** Çözümleyicinin ihtiyaç duyduğu dar sağlayıcı yüzeyi (PlatformMappingProvider bunu karşılar; testte mocklanır). */
export interface IAttributeResolverProvider {
    getPlatformCategoryId(localCategoryId: string): Promise<string | number>;
    getAttributeMappingsForCategory(localCategoryId: string, platformCategoryId?: string | number): Promise<any[]>;
}

export interface IResolveResult {
    /** Tamamlanan (yeni eklenen) platform özellik kimlikleri. */
    added: string[];
    /** Rapor: çoklu değer vb. (model özellik başına tek değer tutar; ilk değer alınır). */
    warnings: string[];
}

/** Bir kategori (id) için değişmeyen eşleme listesi; tek sorgu/cache sağlayıcıdan gelir, toplu işte bellekte tekrar kullanılır. */
export class AttributeResolver {
    private byCategory = new Map<string, Promise<any[]>>();

    constructor(private provider: IAttributeResolverProvider, private integrationCode: string) { }

    private mappingsFor(localCategoryId: string): Promise<any[]> {
        let p = this.byCategory.get(localCategoryId);
        if (!p) {
            p = (async () => {
                const platformCat = await this.provider.getPlatformCategoryId(localCategoryId);
                // Kategori eşlemesi yoksa özellik eşlemesi de çözülemez (bayat/başka kategori karışmasın).
                if (platformCat === undefined || platformCat === null || String(platformCat) === '') return [];
                return this.provider.getAttributeMappingsForCategory(localCategoryId, platformCat);
            })();
            this.byCategory.set(localCategoryId, p);
        }
        return p;
    }

    /** `variant.platforms[code].attributes` alanını YERİNDE (bellekte; DB'ye yazılmaz) eksik olanlarla tamamlar. */
    async resolveInto(variant: any, localCategoryId: string | undefined | null): Promise<IResolveResult> {
        const res: IResolveResult = { added: [], warnings: [] };
        if (localCategoryId === undefined || localCategoryId === null || String(localCategoryId) === '') return res;
        const choices: any[] = Array.isArray(variant?.choices) ? variant.choices : [];
        if (choices.length === 0) return res;

        const mappings = await this.mappingsFor(String(localCategoryId));
        if (mappings.length === 0) return res;

        const code = this.integrationCode;
        const existing: Record<string, any> = variant.platforms?.[code]?.attributes || {};
        const out: Record<string, any> = {};

        for (const m of mappings) {
            const attrId = m.platformAttributeId;
            if (attrId === undefined || attrId === null || String(attrId) === '' || !m.localChoiceId) continue;
            const key = String(attrId);
            if (normalizeAttrValue(existing[key])) continue; // FE/import değeri öncelikli
            const mine = choices.filter(c => String(c.choiceId) === String(m.localChoiceId));
            if (mine.length === 0) continue;
            if (mine.length > 1) res.warnings.push(`${m.platformAttributeName ?? key} (${key}): birden çok yerel değer var, ilki kullanıldı`);
            const valueMap = (m.values || []).find((v: any) => String(v.localValueId) === String(mine[0].choiceValueId));
            if (!valueMap) continue;
            const hasId = valueMap.platformValueId !== undefined && valueMap.platformValueId !== null && String(valueMap.platformValueId) !== '';
            out[key] = {
                attributeName: m.platformAttributeName,
                attributeValue: valueMap.platformValueName,
                ...(hasId ? { attributeValueId: String(valueMap.platformValueId) } : {})
            };
            res.added.push(key);
        }

        if (res.added.length > 0) {
            variant.platforms = variant.platforms || {};
            variant.platforms[code] = variant.platforms[code] || {};
            variant.platforms[code].attributes = { ...existing, ...out };
        }
        return res;
    }
}

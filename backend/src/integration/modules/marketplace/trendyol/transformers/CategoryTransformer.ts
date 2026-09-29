// transformers/CategoryMapper.ts
import { ICategory, ICategoryAttribute } from '@interfaces/index';

export class CategoryMapper {
    /**
     * Trendyol hiyerarşisini ICategory[] (Nested) yapısına çevirir
     */
    public toInternalCategories(rawCategories: any[], parentId = "0", level = 0): ICategory[] {
        return rawCategories.map(cat => {
            const nodeId = String(cat.id);
            const children = cat.subCategories
                ? this.toInternalCategories(cat.subCategories, nodeId, level + 1)
                : [];

            return {
                _id: nodeId,
                parentId: level === 0 ? "0" : parentId,
                title: cat.name,
                level: level,
                children: children.length > 0 ? children : undefined
            } as ICategory;
        });
    }

    /**
     * API özelliklerini ICategoryAttribute[] formatına çevirir.
     * [C22 2026-09-28] Hoşgörülü okuma: V1 `{attribute:{id,name}, attributeValues:[]}` şekli öncelikli; V2 yanıtında
     * öznitelik düz (`{id,name,...}`) veya değerler `values` altında gelirse de okunur (resmi V2 şekli tam
     * doğrulanamadı — spec §8 madde 10).
     */
    public toInternalAttributes(rawAttributes: any[]): ICategoryAttribute[] {
        return (rawAttributes || [])
            .map(attr => ({ attr, core: attr?.attribute ?? (attr && attr.id !== undefined && attr.name ? attr : undefined) }))
            .filter(x => !!x.core)
            .map(({ attr, core }) => ({
                _id: String(core.id),
                title: core.name,
                allowCustom: !!attr.allowCustom,
                required: !!attr.required,
                varianter: !!attr.varianter,
                slicer: !!attr.slicer,
                values: this.toInternalValues(attr.attributeValues ?? attr.values ?? []),
                multiple: false
            }))
            .sort((a, b) => a.title.localeCompare(b.title));
    }

    /** Değer listesi (`[{id,name}]`) -> `[{id,title}]` (başlığa göre sıralı). */
    public toInternalValues(rawValues: any[]): Array<{ id: string; title: string }> {
        return (rawValues || [])
            .filter(v => v && v.id !== undefined)
            .map((v: any) => ({ id: String(v.id), title: String(v.name ?? v.title ?? v.id) }))
            .sort((a, b) => a.title.localeCompare(b.title));
    }
}
import { ICategory, ICategoryAttribute } from '@interfaces/index';

export class CategoryMapper {
    /**
     * Pazarama hiyerarşisini ICategory[] (Nested) yapısına çevirir
     */
    public toInternalCategories(rawCategories: any[], parentId = "0", level = 0): ICategory[] {
        if (!rawCategories || !Array.isArray(rawCategories)) return [];

        // EĞER VERİ DÜZ LİSTE OLARAK GELİYORSA (Sizin eski mantığınız)
        // Eğer elemanlarda parentId varsa ve Children dizisi yoksa flat kabul ediyoruz
        // Pazarama'da düz listede parentId "0" veya null olabilir
        const isFlat = level === 0 && rawCategories.length > 0 && rawCategories.some(c =>
            (c.ParentId !== undefined || c.parentId !== undefined) &&
            !(c.Children || c.children || c.subCategories)
        );

        if (isFlat) {
            return this.buildTreeFromFlatList(rawCategories, "0", 0);
        }

        // EĞER VERİ ZATEN AĞAÇ YAPISINDA GELİYORSA
        return rawCategories.map(cat => {
            const nodeId = String(cat.CategoryId || cat.categoryId || cat.id);
            const nodeTitle = cat.Name || cat.name || cat.categoryName || cat.title;
            const rawChildren = cat.Children || cat.children || cat.subCategories;

            const children = (rawChildren && Array.isArray(rawChildren))
                ? this.toInternalCategories(rawChildren, nodeId, level + 1)
                : [];

            return {
                _id: nodeId,
                parentId: level === 0 ? "0" : parentId,
                title: nodeTitle,
                level: level,
                children: children.length > 0 ? (children as ICategory[]) : undefined
            } as ICategory;
        });
    }

    /**
     * Düz listeyi (flat list) ağaç yapısına çevirir
     */
    private buildTreeFromFlatList(categories: any[], parentId: string, level: number): ICategory[] {
        return categories
            .filter(cat => {
                const pid = String(cat.ParentId || cat.parentId || "0");
                // Pazarama'da root parentId null veya empty string gelebilir
                const normalizedPid = (pid === "null" || pid === "undefined" || pid === "") ? "0" : pid;
                return normalizedPid === parentId;
            })
            .map(cat => {
                const nodeId = String(cat.CategoryId || cat.categoryId || cat.id);
                const children = this.buildTreeFromFlatList(categories, nodeId, level + 1);

                return {
                    _id: nodeId,
                    parentId: parentId,
                    title: cat.Name || cat.name || cat.categoryName || cat.title,
                    level: level,
                    children: children.length > 0 ? children : undefined
                } as ICategory;
            });
    }

    public toInternalAttributes(rawAttributes: any[]): ICategoryAttribute[] {
        if (!rawAttributes || !Array.isArray(rawAttributes)) return [];

        return rawAttributes
            .map(attr => {
                const title = attr.Name || attr.name || attr.AttributeName || attr.attributeName || "Adsız Özellik";
                const values = (attr.AttributeValues || attr.attributeValues || attr.Values || attr.values || [])
                    .map((v: any) => ({
                        id: String(v.id || v.ValueId || v.valueId || v.Id),
                        title: v.value || v.Name || v.name || v.ValueName || v.valueName || "Adsız Değer"
                    }))
                    .sort((a: any, b: any) => (a.title || "").localeCompare(b.title || ""));

                return {
                    _id: String(attr.AttributeId || attr.attributeId || attr.Id || attr.id),
                    title: title,
                    allowCustom: !!(attr.AllowCustom || attr.allowCustom),
                    required: !!(attr.Required || attr.required),
                    varianter: !!(attr.IsVariantable || attr.isVariantable || attr.IsVariant || attr.isVariant || attr.Varianter || attr.varianter),
                    slicer: !!(attr.IsSlicer || attr.isSlicer || attr.Slicer || attr.slicer),
                    values: values,
                    multiple: !!(attr.AllowMultipleSelection || attr.allowMultipleSelection || attr.IsMultiple || attr.isMultiple || attr.Multiple || attr.multiple)
                } as ICategoryAttribute;
            })
            .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
}

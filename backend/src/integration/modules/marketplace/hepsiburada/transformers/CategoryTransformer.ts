import { ICategory, ICategoryAttribute } from '@interfaces/index';

export class CategoryMapper {
    public toInternalCategories(rawCategories: any[], parentId = "0", level = 0): ICategory[] {
        if (!rawCategories || !Array.isArray(rawCategories)) return [];

        const children: ICategory[] = [];
        
        for (const category of rawCategories) {
            const catParentId = String(category.parentCategoryId || category.parentId || "0");
            
            if (parentId === catParentId) {
                const nodeId = String(category.categoryId || category.id);
                const childCategory: any = {
                    _id: nodeId,
                    parentId: catParentId,
                    title: category.name || category.title || "Adsız Kategori",
                    level: level,
                    children: this.toInternalCategories(rawCategories, nodeId, level + 1)
                };
                
                if (childCategory.children && childCategory.children.length === 0) {
                    delete childCategory.children;
                }
                
                children.push(childCategory as ICategory);
            }
        }

        return this.sortByTitleRecursive(children);
    }

    private sortByTitleRecursive(items: ICategory[]): ICategory[] {
        return items
            .map((item: ICategory) => ({
                ...item,
                children: item.children ? this.sortByTitleRecursive(item.children) : undefined
            }) as ICategory)
            .sort((a: any, b: any) => a.title.localeCompare(b.title, "tr"));
    }

    public toInternalAttributes(rawResponse: any): ICategoryAttribute[] {
        const data = rawResponse?.data || {};
        const baseAttributes = data.baseAttributes || [];
        const normalAttributes = data.attributes || [];
        const variantAttributes = data.variantAttributes || [];

        // Flag variant attributes
        variantAttributes.forEach((attr: any) => {
            attr.varianter = true;
        });

        const mergedAttributes = [
            ...baseAttributes,
            ...normalAttributes,
            ...variantAttributes
        ];

        return mergedAttributes.map(attr => {
            return {
                _id: String(attr.id),
                title: attr.name,
                required: !!attr.mandatory,
                allowCustom: attr.type !== 'enum',
                varianter: !!attr.varianter,
                slicer: !!attr.slicer,
                multiple: !!attr.multiValue,
                values: [] // Values will be fetched by the service if needed
            } as ICategoryAttribute;
        }).sort((a, b) => a.title.localeCompare(b.title, "tr"));
    }

    public toInternalAttributeValues(rawValues: any[]): any[] {
        if (!rawValues || !Array.isArray(rawValues)) return [];

        const seen = new Set();
        return rawValues
            .map((item: any) => ({
                id: String(item.value),
                title: String(item.value).trim()
            }))
            .filter((val: any) => {
                if (!val.id || val.id === 'undefined') return false;
                if (seen.has(val.id)) return false;
                seen.add(val.id);
                return true;
            })
            .sort((a, b) => a.title.localeCompare(b.title, "tr"));
    }
}

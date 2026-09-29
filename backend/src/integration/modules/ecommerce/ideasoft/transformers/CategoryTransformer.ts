import { ICategory, ICategoryAttribute } from '@interfaces/index';

export class CategoryTransformer {
    public toInternalCategories(flatList: any[]): ICategory[] {
        if (!Array.isArray(flatList) || flatList.length === 0) return [];

        const map = new Map<string, any>();
        const roots: any[] = [];

        for (const cat of flatList) {
            map.set(String(cat.id), {
                _id: String(cat.id),
                parentId: cat.parent ? String(cat.parent.id) : '0',
                title: String(cat.name || cat.title || ''),
                children: [],
                level: 0
            });
        }

        for (const cat of flatList) {
            const current = map.get(String(cat.id));
            if (!current) continue;
            const parentId = cat.parent ? String(cat.parent.id) : null;
            if (parentId && map.has(parentId)) {
                map.get(parentId)!.children.push(current);
            } else {
                roots.push(current);
            }
        }

        const assignLevels = (nodes: any[], level: number) => {
            for (const node of nodes) {
                node.level = level;
                if (node.children?.length > 0) {
                    assignLevels(node.children, level + 1);
                } else {
                    delete node.children;
                }
            }
        };
        assignLevels(roots, 0);
        return roots;
    }

    public toInternalAttributes(rawItems: any[]): ICategoryAttribute[] {
        if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

        const grouped: Record<string, any> = {};
        for (const item of rawItems) {
            const groupId = String(item.optionGroup?.id || item.id || '');
            const groupTitle = item.optionGroup?.title || item.title || 'Özellik';

            if (!grouped[groupId]) {
                grouped[groupId] = {
                    _id: groupId,
                    title: groupTitle,
                    allowCustom: false,
                    required: false,
                    varianter: true,
                    slicer: false,
                    multiple: false,
                    values: []
                };
            }
            grouped[groupId].values.push({
                id: String(item.id),
                title: String(item.title || item.name || '')
            });
        }

        return Object.values(grouped).map((attr: any) => ({
            ...attr,
            values: (attr.values as any[]).sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        }));
    }
}

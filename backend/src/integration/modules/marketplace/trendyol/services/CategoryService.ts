// services/CategoryService.ts
import { ICategory, ICategoryAttribute, ICategoryAttributeValue } from '@interfaces/index';
import { Cache } from '@utils/decorator/cache';
import commissions from '../commissions.json'; // Local JSON
import { CategoryConnector } from '../api/CategoryConnector';
import { CategoryMapper } from '../transformers/CategoryTransformer';
import Service from './Service';
import { ICategoryComission } from '@interfaces/index';

export class CategoryService {
    private connector: CategoryConnector;
    private mapper: CategoryMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new CategoryConnector(this.service, this.params);
        this.mapper = new CategoryMapper();
    }

    // CategoryService içinde
    @Cache(300, 'catalog-service', (that) => that.integrationCode)
    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> {
        // 1. Önce kategorinin tüm niteliklerini getir
        const attributes = await this.fetchCategoryAttributes(categoryId);

        // 2. İlgili niteliği (Beden, Renk vb.) ID ile bul
        const attribute = attributes.find((attr: any) => attr._id === attributeId || attr.id === attributeId);

        // 3. Gömülü değerler varsa onları dön (V1 şekli; V2'de de gömülü gelebilir)
        if (attribute?.values && attribute.values.length > 0) return attribute.values;

        // 4. [C22 2026-09-28] V2: değerler ayrı uç noktada (`…/attributes/{attributeId}/values`). Gömülü liste boşsa
        //    yalnızca öznitelik gerçekten bu kategoride varsa ayrı çağrı yapılır.
        if (!attribute) return [];
        const response = await this.connector.fetchAttributeValuesFromPlatform(categoryId, attributeId);
        const data = response?.data;
        const raw = Array.isArray(data) ? data : (data?.attributeValues ?? data?.values ?? data?.content ?? []);
        return this.mapper.toInternalValues(raw) as ICategoryAttributeValue[];
    }

    @Cache(300, 'catalog-service', (that) => that.integrationCode)
    public async fetchCategories(): Promise<ICategory[]> {
        const response = await this.connector.fetchCategoriesFromPlatform();
        if (!response?.data?.categories) throw new Error(`[${this.clientId}] Kategori listesi alınamadı.`);

        const converted = this.mapper.toInternalCategories(response.data.categories);

        return converted;
    }

    @Cache(300, 'catalog-service', (that) => that.integrationCode)
    public async fetchCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> {
        if (!categoryId) throw new Error(`[${this.clientId}] categoryId eksik.`);

        const response = await this.connector.fetchAttributesFromPlatform(categoryId);
        if (!response?.data) throw new Error(`[${this.clientId}] Özellikler çekilemedi.`);

        // [C22] hoşgörülü okuma: V1 `categoryAttributes`, olası V2 adları `attributes`/`content`, ya da düz dizi
        const d = response.data;
        const raw = Array.isArray(d) ? d : (d.categoryAttributes ?? d.attributes ?? d.content ?? []);
        return this.mapper.toInternalAttributes(raw);
    }

    /**
     * Local JSON (commissions.json) üzerinden recursive komisyon bulur
     */
    public async fetchCategoryCommission(categoryId: string): Promise<ICategoryComission | undefined> {
        const findRecursive = (categories: Array<any>, id: string): any => {
            for (const category of categories) {
                if (String(category.id) === id) return category;
                if (category.childrenCategories) {
                    const found = findRecursive(category.childrenCategories, id);
                    if (found) return found;
                }
            }
            return undefined;
        };
        return findRecursive(commissions, categoryId);
    }
}
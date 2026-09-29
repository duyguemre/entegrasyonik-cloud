import { ICategory, ICategoryAttribute, ICategoryAttributeValue, ICategoryComission } from '@interfaces/index';
import { integrationCode } from '../constants';
import { CategoryTransformer } from '../transformers/CategoryTransformer';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class CategoryService {
    private transformer: CategoryTransformer;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
        this.transformer = new CategoryTransformer();
    }

    public async fetchCategories(): Promise<ICategory[]> {
        try {
            const url = this.params.integrationSettings?.urls?.categoryListUrl || 'categories';
            const allItems: any[] = [];
            let page = 1;

            while (true) {
                const response = await this.service.get(`${url}?page=${page}`);
                const items = Array.isArray(response.data) ? response.data : (response.data?.data || []);
                if (!items.length) break;
                allItems.push(...items);
                if (items.length < 100) break;
                page++;
            }

            return this.transformer.toInternalCategories(allItems);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}CategoryService:fetchCategories] ${error.message}`);
        }
    }

    public async fetchCategoryAttributes(categoryId?: string): Promise<ICategoryAttribute[]> {
        try {
            const url = this.params.integrationSettings?.urls?.categoryAttributesUrl || 'option-groups';
            const allItems: any[] = [];
            let page = 1;
            const concurrency = 3;

            let hasMore = true;
            while (hasMore) {
                const batchRequests = Array.from({ length: concurrency }, (_, i) =>
                    this.service.get(`${url}?page=${page + i}`).then((r: any) => r.data || [])
                );
                const results = await Promise.all(batchRequests);
                for (const items of results) {
                    if (Array.isArray(items) && items.length > 0) {
                        allItems.push(...items);
                    } else {
                        hasMore = false;
                    }
                }
                page += concurrency;
            }

            return this.transformer.toInternalAttributes(allItems);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}CategoryService:fetchCategoryAttributes] ${error.message}`);
        }
    }

    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> {
        return [];
    }

    public async fetchCategoryCommission(categoryId: string): Promise<ICategoryComission | undefined> {
        return undefined;
    }
}

import { ICategory, ICategoryAttribute, ICategoryAttributeValue, ICategoryComission } from '@interfaces/index';
import { integrationCode } from '../constants';
import { CategoryTransformer } from '../transformers/CategoryTransformer';
import Service from './Service';
import { paginate } from '@integration/modules/common/adapter/paginate';
import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { fetchAllPages, observedItems, maxPages } from './paging';
import { IDEASOFT_CATEGORIES_LIST } from '../contracts';
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
            const allItems = await fetchAllPages(async page => observedItems(IDEASOFT_CATEGORIES_LIST, (await this.service.get(`${url}?page=${page}`)).data, this.clientId), 'fetchCategories', this.clientId);

            return carryIncomplete(allItems, this.transformer.toInternalCategories(allItems));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}CategoryService:fetchCategories] ${error.message}`);
        }
    }

    public async fetchCategoryAttributes(categoryId?: string): Promise<ICategoryAttribute[]> {
        try {
            const url = this.params.integrationSettings?.urls?.categoryAttributesUrl || 'option-groups';
            const concurrency = 3;

            // 3 sayfalık TUR = paginate'in bir "sayfası" (cursor kipi: sonraki tur = bir sonraki ilk sayfa no). Turdaki HERHANGİ bir boş sayfa
            // bitiş sayılır (sayfa boyutu varsayımı yok: sözleşme doğrulanamadı); tavan/tekrar => incomplete.
            const allItems = await paginate<any>(async ({ cursor }) => {
                const first = Number(cursor ?? 1);
                const results = await Promise.all(Array.from({ length: concurrency }, (_, i) =>
                    this.service.get(`${url}?page=${first + i}`).then((r: any) => r.data || [])
                ));
                const filled = results.filter((items: any) => Array.isArray(items) && items.length > 0);
                return { items: filled.flat(), next: filled.length === concurrency ? first + concurrency : null };
            }, { kind: 'cursor', maxPages: maxPages(), operation: 'fetchCategoryAttributes', integrationCode, clientId: this.clientId });

            return carryIncomplete(allItems, this.transformer.toInternalAttributes(allItems));
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

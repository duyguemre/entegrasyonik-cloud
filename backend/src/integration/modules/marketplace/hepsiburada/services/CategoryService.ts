import { ICategory, ICategoryAttribute } from '@interfaces/index';
import { Cache } from '@utils/decorator/cache';
import { integrationCode } from '../constants';
import { CategoryConnector } from '../api/CategoryConnector';
import { CategoryMapper } from '../transformers/CategoryTransformer';
import { Service } from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { paginate } from '@integration/modules/common/adapter/paginate';
import { carryIncomplete } from '@integration/contracts/IncompleteFetch';

const HB_MAX_ATTRIBUTE_VALUE_PAGES = 50;

export class CategoryService {
    private connector: CategoryConnector;
    private mapper: CategoryMapper;

    constructor(private params: any, private service: Service) {
        this.connector = new CategoryConnector(this.service, this.params);
        this.mapper = new CategoryMapper();
    }

    // scope:global -- HB kategori ağacı/nitelikleri tüm tenant'lar için aynı (eski `24` = 24 SANİYE birim hatasıydı; 6 saat)
    @Cache({ scope: 'global', ttl: '6h', context: `${integrationCode}-catalog` })
    public async fetchCategories(): Promise<ICategory[]> {
        try {
            const rawCategories = await this.connector.fetchCategoriesFromPlatform();
            return this.mapper.toInternalCategories(rawCategories);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaCategoryService:fetchCategories] ${error.message}`);
        }
    }

    // scope:global -- HB kategori ağacı/nitelikleri tüm tenant'lar için aynı (eski `24` = 24 SANİYE birim hatasıydı; 6 saat)
    @Cache({ scope: 'global', ttl: '6h', context: `${integrationCode}-catalog` })
    public async fetchCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> {
        try {
            const rawResponse = await this.connector.fetchCategoryAttributes(categoryId);
            const internalAttributes = this.mapper.toInternalAttributes(rawResponse);

            // Fetch values for enum attributes
            /*             for (const attr of internalAttributes) {
                            if (!attr.allowCustom) {
                                attr.values = await this.fetchFullAttributeValues(categoryId, attr._id);
                            }
                        } */

            return internalAttributes;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaCategoryService:fetchCategoryAttributes] ${error.message}`);
        }
    }

    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string): Promise<any[]> {
        // [INT-05 / F-02] Ortak sayfalama: `totalPages` kadar, en cok HB_MAX_ATTRIBUTE_VALUE_PAGES sayfa. Tavanda SESSIZ kesilmez:
        // uyari loglanir ve donen dizi incomplete isaretlenir (degerler onbellege alinmadigi icin kismi liste reddedilmez).
        const allValues = await paginate<any>(async ({ page }) => {
            const body = await this.connector.fetchCategoryAttributeValues(categoryId, attributeId, page);
            if (body && Array.isArray(body.data)) {
                const totalPages = body.totalPages || 1;
                return { items: body.data, next: page + 1 < totalPages ? page + 1 : null };
            }
            return { items: [], next: null };
        }, { kind: 'cursor', maxPages: HB_MAX_ATTRIBUTE_VALUE_PAGES, operation: 'fetchCategoryAttributeValues', integrationCode: 'hepsiburada', clientId: this.params.clientId });

        return carryIncomplete(allValues, this.mapper.toInternalAttributeValues(allValues));
    }
}

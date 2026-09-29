import { ICategory, ICategoryAttribute } from '@interfaces/index';
import { Cache } from '@utils/decorator/cache';
import { integrationCode } from '../constants';
import { CategoryConnector } from '../api/CategoryConnector';
import { CategoryMapper } from '../transformers/CategoryTransformer';
import { Service } from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class CategoryService {
    private connector: CategoryConnector;
    private mapper: CategoryMapper;

    constructor(private params: any, private service: Service) {
        this.connector = new CategoryConnector(this.service, this.params);
        this.mapper = new CategoryMapper();
    }

    @Cache(24, integrationCode)
    public async fetchCategories(): Promise<ICategory[]> {
        try {
            const rawCategories = await this.connector.fetchCategoriesFromPlatform();
            return this.mapper.toInternalCategories(rawCategories);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[HepsiburadaCategoryService:fetchCategories] ${error.message}`);
        }
    }

    @Cache(24, integrationCode)
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
        let allValues: any[] = [];
        let currentPage = 0;
        let totalPages = 1;

        while (currentPage < totalPages) {
            const body = await this.connector.fetchCategoryAttributeValues(categoryId, attributeId, currentPage);
            if (body && Array.isArray(body.data)) {
                allValues = allValues.concat(body.data);
                totalPages = body.totalPages || 1;
            } else {
                break;
            }
            currentPage++;

            // Safety break for excessive pages
            if (currentPage > 50) break;
        }

        return this.mapper.toInternalAttributeValues(allValues);
    }
}

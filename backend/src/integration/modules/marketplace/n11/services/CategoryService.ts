import { ICategory, ICategoryAttribute, ICategoryAttributeValue, ICategoryComission } from '@interfaces/index';
import { CategoryConnector } from '../api/CategoryConnector';
import { CategoryMapper } from '../transformers/Mappers';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class CategoryService {
    private connector: CategoryConnector;
    private mapper: CategoryMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new CategoryConnector(this.service, this.params);
        this.mapper = new CategoryMapper();
    }

    public async fetchCategories(): Promise<ICategory[]> {
        try {
            const response = await this.connector.fetchCategoriesRest();
            let categories: any[];
            if (Array.isArray(response)) {
                categories = response;
            } else if (Array.isArray(response?.categoryList)) {
                categories = response.categoryList;
            } else if (Array.isArray(response?.categoryList?.category)) {
                categories = response.categoryList.category;
            } else if (response?.categoryList?.category) {
                categories = [response.categoryList.category];
            } else if (Array.isArray(response?.categories)) {
                categories = response.categories;
            } else {
                throw new Error(`Unexpected response format: ${JSON.stringify(response).substring(0, 200)}`);
            }
            return this.mapper.toInternalCategories(categories);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11CategoryService:fetchCategories] ${error.message}`);
        }
    }

    public async fetchCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> {
        try {
            const response = await this.connector.fetchCategoryAttributesRest(categoryId);
            if (response.categoryAttributes || response.attributes || Array.isArray(response)) {
                return this.mapper.toInternalAttributes(response);
            }
            throw new Error('Unexpected response format from attributes endpoint');
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11CategoryService:fetchCategoryAttributes] ${error.message}`);
        }
    }

    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> {
        try {
            const payload = {
                categoryId: categoryId,
                categoryProductAttributeId: attributeId,
                pagingData: { currentPage: 0, pageSize: 1000 }
            };
            const response = await this.connector.getCategoryAttributeValue(payload);
            return this.mapper.toInternalAttributeValues(response);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][N11CategoryService:fetchCategoryAttributeValues] ${error.message}`);
        }
    }

    public async fetchCategoryCommission(categoryId: string): Promise<ICategoryComission | undefined> {
        return undefined;
    }
}

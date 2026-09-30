import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { N11_CATEGORIES_LIST, N11_CATEGORY_ATTRIBUTES } from '../contracts';
import Service, { N11_DEFAULT_URLS } from '../services/Service';

export class CategoryConnector {
    constructor(private service: Service, private params: any) { }

    private getUrl(key: keyof typeof N11_DEFAULT_URLS): string {
        return this.params.integrationSettings.urls?.[key] || N11_DEFAULT_URLS[key];
    }

    // REST Methods
    public async fetchCategoriesRest(): Promise<any> {
        const url = this.getUrl('categoryListUrl');
        const data = await this.service.rest.getReal(url);
        observeResponseSchema(N11_CATEGORIES_LIST, data, { clientId: this.params.clientId });
        return data;
    }

    public async fetchCategoryAttributesRest(categoryId: string): Promise<any> {
        const pattern = this.getUrl('categoryAttributeListUrl');
        const url = pattern.replace('<CATEGORYID>', categoryId);
        const data = await this.service.rest.getReal(url);
        observeResponseSchema(N11_CATEGORY_ATTRIBUTES, data, { clientId: this.params.clientId });
        return data;
    }

    // SOAP Methods (tümü okuma -> idempotent:true)
    public async getTopLevelCategories(): Promise<any> {
        return await this.service.soapRequest('categoryService', 'sch:GetTopLevelCategoriesRequest', {}, { idempotent: true });
    }

    public async getCategoryAttributesId(payload: any): Promise<any> {
        return await this.service.soapRequest('categoryService', 'sch:GetCategoryAttributesIdRequest', payload, { idempotent: true });
    }

    public async getCategoryAttributeValue(payload: any): Promise<any> {
        return await this.service.soapRequest('categoryService', 'sch:GetCategoryAttributeValueRequest', payload, { idempotent: true });
    }
}

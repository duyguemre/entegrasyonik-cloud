import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { PAZARAMA_CATEGORIES_LIST, PAZARAMA_CATEGORY_ATTRIBUTES } from '../contracts';
import Service from '../services/Service';

export class CategoryConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchCategoriesFromPlatform(): Promise<any> {
        const url = this.params.integrationSettings?.urls?.categoryListUrl || 'category/getCategoryTree';
        const response = await this.service.get(url);
        observeResponseSchema(PAZARAMA_CATEGORIES_LIST, response?.data, { clientId: this.params.clientId });
        return response;
    }

    public async fetchAttributesFromPlatform(categoryId: string): Promise<any> {
        const urlTemplate = this.params.integrationSettings?.urls?.categoryAttributeListUrl || 'category/getCategoryWithAttributes?Id=<CATEGORYID>';
        const url = urlTemplate.replace("<CATEGORYID>", categoryId);
        const response = await this.service.get(url);
        observeResponseSchema(PAZARAMA_CATEGORY_ATTRIBUTES, response?.data, { clientId: this.params.clientId });
        return response;
    }
}

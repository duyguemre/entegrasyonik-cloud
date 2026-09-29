import Service from '../services/Service';

export class CategoryConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchCategoriesFromPlatform(): Promise<any> {
        const url = this.params.integrationSettings?.urls?.categoryListUrl || 'category/getCategoryTree';
        return await this.service.get(url);
    }

    public async fetchAttributesFromPlatform(categoryId: string): Promise<any> {
        const urlTemplate = this.params.integrationSettings?.urls?.categoryAttributeListUrl || 'category/getCategoryWithAttributes?Id=<CATEGORYID>';
        const url = urlTemplate.replace("<CATEGORYID>", categoryId);
        return await this.service.get(url);
    }
}

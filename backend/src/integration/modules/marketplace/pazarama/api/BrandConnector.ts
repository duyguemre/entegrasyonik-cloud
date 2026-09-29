import Service from '../services/Service';

export class BrandConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchBrandsFromPlatform(query: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.brandListUrl || 'brand/getBrands';

        const queryParams: any = {};
        if (typeof query === 'string') {
            queryParams.brandName = query;
        } else if (typeof query === 'object' && query !== null) {
            Object.assign(queryParams, query);
        }

        const response = await this.service.get(baseUrl, queryParams);
        return response?.data;
    }
}

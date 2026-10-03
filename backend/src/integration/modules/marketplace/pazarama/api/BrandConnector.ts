import Service from '../services/Service';

export class BrandConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchBrandsFromPlatform(query: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.brandListUrl || 'brand/getBrands';

        // [eslesme-fiyat WP4, 02-ekler/pazarama C-2 / D-PZ-2] resmî parametreler PascalCase `Page`/`Size` + arama `name`
        // (eskiden `brandName` ve sayfa yok → API varsayılanı Size=10: yalnız 10 marka). Çağıran sayfalamayı yönetir.
        const queryParams: any = {};
        if (typeof query === 'string') {
            queryParams.name = query;
        } else if (typeof query === 'object' && query !== null) {
            Object.assign(queryParams, query);
        }

        const response = await this.service.get(baseUrl, queryParams);
        return response?.data;
    }
}

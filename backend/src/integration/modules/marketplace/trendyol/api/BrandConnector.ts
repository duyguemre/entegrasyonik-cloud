// api/BrandConnector.ts
import Service from '../services/Service';

export class BrandConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchBrandsFromPlatform(query: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.brandListUrl;
        if (!baseUrl) throw new Error("brandListUrl config içerisinde bulunamadı.");

        // URLSearchParams yerine doğrudan düz bir obje (Literal Object) kullanıyoruz
        const queryParams: any = { size: '500' };

        if (typeof query === 'string') {
            queryParams.name = query;
        } else if (typeof query === 'object' && query !== null) {
            // Mevcut query objesini bizim parametrelerle birleştiriyoruz
            Object.assign(queryParams, query);
        }

        // Service.get metoduna artık düz bir obje gidiyor.
        // Axios bunu otomatik olarak ?size=500&name=... formatına çevirecektir.
        const response = await this.service.get(baseUrl, queryParams);
        return response?.data;
    }
}
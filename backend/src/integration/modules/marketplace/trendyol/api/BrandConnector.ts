// api/BrandConnector.ts
import Service from '../services/Service';
import { TRENDYOL_BRAND_PAGE_SIZE } from '../limits';

export class BrandConnector {
    constructor(private service: Service, private params: any) { }

    /**
     * [eslesme-fiyat WP4, D-TY-4] Ad ile arama (`name`) yapılıyorsa `size` gönderilmez (by-name ucu belgelemez);
     * tam liste çağrısında `size` resmî aralığın alt sınırı 1000'dir (eski 500 geçersizdi). Grup: marka/kategori 50/dk.
     */
    public async fetchBrandsFromPlatform(query: any): Promise<any> {
        const baseUrl = this.params.integrationSettings?.urls?.brandListUrl;
        if (!baseUrl) throw new Error("brandListUrl config içerisinde bulunamadı.");

        const queryParams: any = {};
        if (typeof query === 'string') {
            queryParams.name = query;
        } else if (typeof query === 'object' && query !== null) {
            Object.assign(queryParams, query);
        }
        if (!queryParams.name) {
            const size = Number(queryParams.size);
            queryParams.size = String(Number.isFinite(size) && size >= 1000 && size <= 2000 ? size : TRENDYOL_BRAND_PAGE_SIZE);
        } else {
            delete queryParams.size;
        }

        const response = await this.service.get(baseUrl, queryParams, { group: 'brand_category_read' });
        return response?.data;
    }
}

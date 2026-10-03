import { IBrand } from '@interfaces/index';
import { BrandConnector } from '../api/BrandConnector';
import { BrandMapper } from '../transformers/BrandTransformer';
import Service from '../services/Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export const PAZARAMA_BRAND_PAGE_SIZE = 1000;
export const PAZARAMA_BRAND_MAX_PAGES = 100;

export class BrandService {
    private connector: BrandConnector;
    private mapper: BrandMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new BrandConnector(this.service, this.params);
        this.mapper = new BrandMapper();
    }

    /**
     * [D-PZ-2] Arama metniyle: `name` + `Page=1&Size=100` tek istek. Aramasız: `Size=PAZARAMA_BRAND_PAGE_SIZE` ile sayfa sayfa
     * (dönen < Size ya da boş → son sayfa; tavan PAZARAMA_BRAND_MAX_PAGES — aşılırsa uyarı, eldeki liste döner).
     */
    public async fetchBrands(query: Record<string, any> | string): Promise<IBrand[]> {
        try {
            const search = typeof query === 'string' ? query.trim() : (typeof query?.name === 'string' ? query.name.trim() : '');
            if (search) {
                const rawData = await this.connector.fetchBrandsFromPlatform({ name: search, Page: 1, Size: 100 });
                return this.mapper.toInternalBrands(rawData);
            }
            const all: IBrand[] = [];
            const seen = new Set<string>();
            for (let page = 1; page <= PAZARAMA_BRAND_MAX_PAGES; page++) {
                const rawData = await this.connector.fetchBrandsFromPlatform({ Page: page, Size: PAZARAMA_BRAND_PAGE_SIZE });
                const batch = this.mapper.toInternalBrands(rawData);
                const fresh = batch.filter(b => !seen.has(b.id));
                fresh.forEach(b => { seen.add(b.id); all.push(b); });
                if (batch.length < PAZARAMA_BRAND_PAGE_SIZE || fresh.length === 0) break; // son sayfa ya da sunucu Page'i yok saydı
            }
            return all.sort((a, b) => a.title.localeCompare(b.title));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][PazaramaBrandService:fetchBrands] ${error.message}`);
        }
    }

    public async getMappedBrandId(localBrandId: string) {
        return await this.params.mappingProvider.getPlatformBrandId(localBrandId);
    }
}

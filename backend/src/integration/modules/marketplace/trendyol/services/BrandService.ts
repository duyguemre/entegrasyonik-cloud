// services/BrandService.ts
import { IBrand } from '@interfaces/index';
import { BrandConnector } from '../api/BrandConnector';
import { BrandMapper } from '../transformers/BrandTransformer';
import Service from '../services/Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

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
     * Önyüzden gelen istekleri karşılar: Trendyol'un marka listesini döner
     */
    public async fetchBrands(query: Record<string, any>): Promise<IBrand[]> {
        try {
            const rawData = await this.connector.fetchBrandsFromPlatform(query);
            return this.mapper.toInternalBrands(rawData);
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][BrandService:fetchBrands] ${error.message}`);
        }
    }

    /**
     * Ürün gönderirken kullanılan eşleşmiş marka bilgisini Provider'dan alır
     */
    public async getMappedBrandId(localBrandId: string) {
        return await this.params.mappingProvider.getPlatformBrandId(localBrandId);
    }
}
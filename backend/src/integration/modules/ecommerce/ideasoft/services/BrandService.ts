import { IBrand } from '@interfaces/index';
import { integrationCode } from '../constants';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class BrandService {
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
    }

    public async fetchBrands(query?: Record<string, any>): Promise<IBrand[]> {
        try {
            const url = this.params.integrationSettings?.urls?.brandListUrl || 'brands';
            const allBrands: IBrand[] = [];
            let page = 1;

            while (true) {
                const response = await this.service.get(`${url}?page=${page}`);
                const items = Array.isArray(response.data) ? response.data : (response.data?.data || []);
                if (!items.length) break;

                for (const item of items) {
                    allBrands.push({
                        id: String(item.id),
                        title: String(item.name || item.title || '')
                    });
                }

                if (items.length < 100) break;
                page++;
            }

            return allBrands;
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}BrandService:fetchBrands] ${error.message}`);
        }
    }
}

import { IBrand } from '@interfaces/index';
import { integrationCode } from '../constants';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { carryIncomplete } from '@integration/contracts/IncompleteFetch';
import { fetchAllPages, observedItems } from './paging';
import { IDEASOFT_BRANDS_LIST } from '../contracts';

export class BrandService {
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
    }

    public async fetchBrands(query?: Record<string, any>): Promise<IBrand[]> {
        try {
            const url = this.params.integrationSettings?.urls?.brandListUrl || 'brands';
            const items = await fetchAllPages(async page => observedItems(IDEASOFT_BRANDS_LIST, (await this.service.get(`${url}?page=${page}`)).data, this.clientId), 'fetchBrands', this.clientId);
            // [INT-05] tavan/tekrar sinyali (getIncomplete) dönüşümden sonra da taşınır
            return carryIncomplete(items, items.map((item: any): IBrand => ({
                id: String(item.id),
                title: String(item.name || item.title || '')
            })));
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}BrandService:fetchBrands] ${error.message}`);
        }
    }
}

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
            const clientDB = this.params.clientDB;
            if (!clientDB) return [];
            const doc = await clientDB.getClientIntegrationModel().findOne(
                { 'erp.code': integrationCode },
                { 'erp.$': 1 }
            ).lean();
            return doc?.erp?.[0]?.settings?.catalog?.brands || [];
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}BrandService:fetchBrands] ${error.message}`);
        }
    }
}

import { ICategory, ICategoryAttribute, ICategoryAttributeValue, ICategoryComission } from '@interfaces/index';
import { integrationCode } from '../constants';
import Service from './Service';
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export class CategoryService {
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || 'UnknownClient';
    }

    public async fetchCategories(): Promise<ICategory[]> {
        try {
            const doc = await this.getCatalogDoc();
            return doc?.categories || [];
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}CategoryService:fetchCategories] ${error.message}`);
        }
    }

    public async fetchCategoryAttributes(categoryId?: string): Promise<ICategoryAttribute[]> {
        try {
            const doc = await this.getCatalogDoc();
            return doc?.options || [];
        } catch (error: any) {
            if (IntegrationError.isIntegrationError(error)) throw error;
            throw new Error(`[${this.clientId}][${integrationCode}CategoryService:fetchCategoryAttributes] ${error.message}`);
        }
    }

    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> {
        return [];
    }

    public async fetchCategoryCommission(categoryId: string): Promise<ICategoryComission | undefined> {
        return undefined;
    }

    private async getCatalogDoc(): Promise<any> {
        const clientDB = this.params.clientDB;
        if (!clientDB) return {};
        const doc = await clientDB.getClientIntegrationModel().findOne(
            { 'erp.code': integrationCode },
            { 'erp.$': 1 }
        ).lean();
        return doc?.erp?.[0]?.settings?.catalog || {};
    }
}

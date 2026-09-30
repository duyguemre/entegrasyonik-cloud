import { ICategory, ICategoryAttribute, ICategoryAttributeValue, ICategoryComission } from '@interfaces/index';
import { Cache } from '@utils/decorator/cache';
import commissions from '../commissions.json';
import { CategoryConnector } from '../api/CategoryConnector';
import { CategoryMapper } from '../transformers/CategoryTransformer';
import Service from './Service';
import { integrationCode } from '../constants';
import { eventLog } from '@platform/core/logger';

const log = eventLog('adapter-pazarama', 'CategoryService');

export class CategoryService {
    private connector: CategoryConnector;
    private mapper: CategoryMapper;
    private clientId: string;
    public integrationCode = integrationCode;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new CategoryConnector(this.service, this.params);
        this.mapper = new CategoryMapper();
    }

    // scope:global -- pazarama kategori ağacı/nitelikleri tüm tenant'lar için aynı, kimlik bilgisinden bağımsız (ADR-0002 Karar 3)
    @Cache({ scope: 'global', ttl: '6h', context: 'pazarama-catalog' })
    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> {
        const attributes = await this.fetchCategoryAttributes(categoryId);
        const attribute = attributes.find((attr: any) => attr._id === attributeId);
        return attribute ? attribute.values || [] : [];
    }

    // scope:global -- pazarama kategori ağacı/nitelikleri tüm tenant'lar için aynı, kimlik bilgisinden bağımsız (ADR-0002 Karar 3)
    @Cache({ scope: 'global', ttl: '6h', context: 'pazarama-catalog' })
    public async fetchCategories(): Promise<ICategory[]> {
        const response = await this.connector.fetchCategoriesFromPlatform();
        // Pazarama API bazen { data: { categories: [...] } } bazen { data: [...] } dönebiliyor
        const body = response?.data;
        const rawCategories = body?.data?.categories || body?.data || body?.categories || (Array.isArray(body) ? body : []);
        
        if (!Array.isArray(rawCategories)) {
            log.error('CATEGORYSERVICE_KATEGORI_LISTESI_GECERSIZ_FORMAT', `[${this.clientId}] Kategori listesi geçersiz format:`, { detail: body });
            return [];
        }

        return this.mapper.toInternalCategories(rawCategories);
    }

    // scope:global -- pazarama kategori ağacı/nitelikleri tüm tenant'lar için aynı, kimlik bilgisinden bağımsız (ADR-0002 Karar 3)
    @Cache({ scope: 'global', ttl: '6h', context: 'pazarama-catalog' })
    public async fetchCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> {
        if (!categoryId) throw new Error(`[${this.clientId}] categoryId eksik.`);

        const response = await this.connector.fetchAttributesFromPlatform(categoryId);
        const body = response?.data;
        const rawAttributes = body?.data?.categoryAttributes || body?.data?.attributes || body?.data || body?.categoryAttributes || (Array.isArray(body) ? body : []);
        
        if (!Array.isArray(rawAttributes)) return [];
        return this.mapper.toInternalAttributes(rawAttributes);
    }

    public async fetchCategoryCommission(categoryId: string): Promise<ICategoryComission | undefined> {
        const findRecursive = (categories: Array<any>, id: string): any => {
            for (const category of categories) {
                if (String(category.id) === id) return category;
                if (category.childrenCategories) {
                    const found = findRecursive(category.childrenCategories, id);
                    if (found) return found;
                }
            }
            return undefined;
        };
        return findRecursive(commissions, categoryId);
    }
}

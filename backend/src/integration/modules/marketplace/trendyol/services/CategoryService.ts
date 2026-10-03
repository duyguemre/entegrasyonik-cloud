// services/CategoryService.ts
import { ICategory, ICategoryAttribute, ICategoryAttributeValue } from '@interfaces/index';
import { Cache } from '@utils/decorator/cache';
import commissions from '../commissions.json'; // Local JSON
import commissionsMeta from '../commissions.meta.json'; // COM-01: kaynak/bayatlık üst verisi
import { CategoryConnector } from '../api/CategoryConnector';
import { CategoryMapper } from '../transformers/CategoryTransformer';
import Service from './Service';
import { TRENDYOL_ATTRIBUTE_VALUE_PAGING } from '../limits';
import { ICategoryComission } from '@interfaces/index';

export class CategoryService {
    private connector: CategoryConnector;
    private mapper: CategoryMapper;
    private clientId: string;

    constructor(private params: any, private service: Service) {
        this.clientId = params.clientId || "UnknownClient";
        this.connector = new CategoryConnector(this.service, this.params);
        this.mapper = new CategoryMapper();
    }

    // CategoryService içinde
    // scope:global -- trendyol kategori ağacı/nitelikleri tüm tenant'lar için aynı, kimlik bilgisinden bağımsız (ADR-0002 Karar 3)
    @Cache({ scope: 'global', ttl: '6h', context: 'trendyol-catalog' })
    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string): Promise<ICategoryAttributeValue[]> {
        // 1. Önce kategorinin tüm niteliklerini getir
        const attributes = await this.fetchCategoryAttributes(categoryId);

        // 2. İlgili niteliği (Beden, Renk vb.) ID ile bul
        const attribute = attributes.find((attr: any) => attr._id === attributeId || attr.id === attributeId);

        // 3. Gömülü değerler varsa onları dön (V1 şekli; V2'de de gömülü gelebilir)
        if (attribute?.values && attribute.values.length > 0) return attribute.values;

        // 4. [C22 2026-09-28] V2: değerler ayrı uç noktada (`…/attributes/{attributeId}/values`). Gömülü liste boşsa
        //    yalnızca öznitelik gerçekten bu kategoride varsa ayrı çağrı yapılır.
        if (!attribute) return [];
        // [eslesme-fiyat WP4, C-2] Sayfalı çekim: `totalPages` kadar (güvenlik tavanı maxPages); düz dizi yanıtı tek sayfadır.
        const raw: any[] = [];
        const { size, maxPages } = TRENDYOL_ATTRIBUTE_VALUE_PAGING;
        for (let page = 0; page < maxPages; page++) {
            const response = await this.connector.fetchAttributeValuesFromPlatform(categoryId, attributeId, page, size);
            const data = response?.data;
            const chunk = Array.isArray(data) ? data : (data?.content ?? data?.attributeValues ?? data?.values ?? []);
            raw.push(...chunk);
            const totalPages = Array.isArray(data) ? 1 : Number(data?.totalPages);
            if (!Number.isFinite(totalPages) || page + 1 >= totalPages || chunk.length === 0) break;
        }
        return this.mapper.toInternalValues(raw) as ICategoryAttributeValue[];
    }

    // scope:global -- trendyol kategori ağacı/nitelikleri tüm tenant'lar için aynı, kimlik bilgisinden bağımsız (ADR-0002 Karar 3)
    @Cache({ scope: 'global', ttl: '6h', context: 'trendyol-catalog' })
    public async fetchCategories(): Promise<ICategory[]> {
        const response = await this.connector.fetchCategoriesFromPlatform();
        if (!response?.data?.categories) throw new Error(`[${this.clientId}] Kategori listesi alınamadı.`);

        const converted = this.mapper.toInternalCategories(response.data.categories);

        return converted;
    }

    // scope:global -- trendyol kategori ağacı/nitelikleri tüm tenant'lar için aynı, kimlik bilgisinden bağımsız (ADR-0002 Karar 3)
    @Cache({ scope: 'global', ttl: '6h', context: 'trendyol-catalog' })
    public async fetchCategoryAttributes(categoryId: string): Promise<ICategoryAttribute[]> {
        if (!categoryId) throw new Error(`[${this.clientId}] categoryId eksik.`);

        const response = await this.connector.fetchAttributesFromPlatform(categoryId);
        if (!response?.data) throw new Error(`[${this.clientId}] Özellikler çekilemedi.`);

        // [C22] hoşgörülü okuma: V1 `categoryAttributes`, olası V2 adları `attributes`/`content`, ya da düz dizi
        const d = response.data;
        const raw = Array.isArray(d) ? d : (d.categoryAttributes ?? d.attributes ?? d.content ?? []);
        return this.mapper.toInternalAttributes(raw);
    }

    /**
     * Local JSON (commissions.json) üzerinden recursive komisyon bulur
     */
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
        return CategoryService.toCommissionResult(findRecursive(commissions, String(categoryId)));
    }

    /**
     * commissions.json düğümünü tiplenmiş sonuca çevirir. `ka1`/`ka2` ({commission,name}) kademeleri YALNIZ okunur;
     * hangi kademenin uygulanacağı (tenant kademesi) COM-01 insan teyidine kadar SEÇİLMEZ. `commission` yoksa `null` (bilinmiyor, 0 değil).
     */
    private static toCommissionResult(node: any): ICategoryComission | undefined {
        if (!node) return undefined;
        const tiers: { KA1?: number; KA2?: number } = {};
        if (typeof node.ka1?.commission === 'number') tiers.KA1 = node.ka1.commission;
        if (typeof node.ka2?.commission === 'number') tiers.KA2 = node.ka2.commission;
        return {
            ...node,
            commission: typeof node.commission === 'number' ? node.commission : null,
            maturity: typeof node.maturity === 'number' ? node.maturity : null,
            tiers,
            meta: { source: commissionsMeta.source, asOf: commissionsMeta.asOf, vatIncluded: commissionsMeta.vatIncluded, sourceConfidence: commissionsMeta.sourceConfidence },
        };
    }
}
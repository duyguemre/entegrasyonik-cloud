// api/CategoryConnector.ts
import Service from '../services/Service';
import { fillUrl, resolveCategoryAttributeUrls } from './productUrls';

export class CategoryConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchCategoriesFromPlatform(): Promise<any> {
        const url = this.params.integrationSettings.urls.categoryListUrl;
        return await this.service.get(url);
    }

    /**
     * [C22 2026-09-28] Kategori öznitelikleri: V1 `product-categories/{id}/attributes` 15.10.2026'da kapanıyor;
     * V2 `product/categories/{id}/attributes`. DB değeri ESKİ de olsa `productUrls` normalizasyonu V2'ye çevirir.
     */
    public async fetchAttributesFromPlatform(categoryId: string): Promise<any> {
        const { categoryAttributes } = resolveCategoryAttributeUrls(this.params.integrationSettings.urls, { clientId: this.params.clientId });
        return await this.service.get(fillUrl(categoryAttributes, { categoryId }));
    }

    /** [C22] V2: değerler ayrı uç nokta `product/categories/{id}/attributes/{attributeId}/values` (gömülü gelmeyebilir). */
    public async fetchAttributeValuesFromPlatform(categoryId: string, attributeId: string): Promise<any> {
        const { categoryAttributeValues } = resolveCategoryAttributeUrls(this.params.integrationSettings.urls, { clientId: this.params.clientId });
        return await this.service.get(fillUrl(categoryAttributeValues, { categoryId, attributeId }));
    }
}

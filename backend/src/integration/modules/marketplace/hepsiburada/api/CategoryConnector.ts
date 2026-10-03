import { observeResponseSchema } from '@integration/modules/common/contract/observeResponseSchema';
import { HB_CATEGORIES_LIST, HB_CATEGORY_ATTRIBUTES } from '../contracts';
import Service from '../services/Service';
import { paginate } from '@integration/modules/common/adapter/paginate';
import { getIncomplete } from '@integration/contracts/IncompleteFetch';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { integrationCode } from '../constants';

/** Kategori listesi sayfa tavani (gercek liste bunun cok altinda). */
export const HB_MAX_CATEGORY_PAGES = 500;

export class CategoryConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchCategoriesFromPlatform(): Promise<any[]> {
        const urls = this.params.integrationSettings.urls || {};
        const baseUrl = urls.categoryListUrl || 'product/api/categories/get-all-categories';

        // [INT-05 / F-02] Sunucunun bildirdigi `totalPages` artik tavansiz izlenmez (HB_MAX_CATEGORY_PAGES). Tavan asilirsa kismi liste
        // DONMEZ (kategori listesi 6 saat onbellege alinir: eksik liste onbellegi zehirlerdi) -> IntegrationError(VALIDATION).
        const all = await paginate<any>(async ({ page }) => {
            const separator = baseUrl.includes('?') ? '&' : '?';
            const response = await this.service.get(`${baseUrl}${separator}page=${page}`);
            const body = response.data;
            observeResponseSchema(HB_CATEGORIES_LIST, body, { clientId: this.params.clientId });

            if (body && Array.isArray(body.data)) {
                const totalPages = body.totalPages || 1;
                return { items: body.data, next: page + 1 < totalPages ? page + 1 : null };
            }
            // Dogrudan dizi govde ilk sayfada aynen doner; taninmayan govde listeyi bitirir.
            return { items: Array.isArray(body) ? body : [], next: null };
        }, { kind: 'cursor', maxPages: HB_MAX_CATEGORY_PAGES, operation: 'fetchCategoriesFromPlatform', integrationCode: 'hepsiburada', clientId: this.params.clientId });

        const incomplete = getIncomplete(all);
        if (incomplete) {
            throw new IntegrationError('VALIDATION', `Hepsiburada kategori listesi ${HB_MAX_CATEGORY_PAGES} sayfa tavanini asti (${incomplete.reason}); kismi liste onbellege alinmaz.`, {
                integrationCode, operation: 'fetchCategoriesFromPlatform', clientId: this.params.clientId, platformCode: 'CATALOG_PAGE_CAP',
            });
        }
        return all;
    }

    public async fetchCategoryAttributes(categoryId: string): Promise<any> {
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.categoryAttributesUrl || `product/api/categories/${categoryId}/attributes`;
        url = url.replace('<CATEGORYID>', categoryId);
        const response = await this.service.get(url);
        observeResponseSchema(HB_CATEGORY_ATTRIBUTES, response.data, { clientId: this.params.clientId });
        return response.data;
    }

    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string, page = 0): Promise<any> {
        const urls = this.params.integrationSettings.urls || {};
        // [eslesme-fiyat WP3, K-5] Doküman yolu TEKİL `attribute` (`/api/categories/{id}/attribute/{attributeId}/values`, version=5,
        // size ≤1000); eski çoğul `attributes/.../values` dokümanda yok. Yerel canlı turda (03 §5) doğrulanacak; platform urls override kalır.
        let url = urls.categoryAttributeValuesUrl || `product/api/categories/${categoryId}/attribute/${attributeId}/values?version=5&size=1000`;
        url = url.replace('<CATEGORYID>', categoryId).replace('<ATTRIBUTEID>', attributeId);

        // Append page parameter
        const separator = url.includes('?') ? '&' : '?';
        const finalUrl = `${url}${separator}page=${page}`;

        const response = await this.service.get(finalUrl);
        return response.data;
    }
}

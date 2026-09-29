import Service from '../services/Service';

export class CategoryConnector {
    constructor(private service: Service, private params: any) { }

    public async fetchCategoriesFromPlatform(): Promise<any[]> {
        const urls = this.params.integrationSettings.urls || {};
        const baseUrl = urls.categoryListUrl || 'product/api/categories/get-all-categories';
        let allCategories: any[] = [];
        let currentPage = 0;
        let totalPages = 1;

        while (currentPage < totalPages) {
            // Append page number to URL. Check if it already has params.
            const separator = baseUrl.includes('?') ? '&' : '?';
            const url = `${baseUrl}${separator}page=${currentPage}`;

            const response = await this.service.get(url);
            const body = response.data;

            if (body && Array.isArray(body.data)) {
                allCategories = allCategories.concat(body.data);
                totalPages = body.totalPages || 1;
            } else if (Array.isArray(body)) {
                // If it's a direct array, just return it
                return body;
            } else {
                break;
            }
            currentPage++;
        }

        return allCategories;
    }

    public async fetchCategoryAttributes(categoryId: string): Promise<any> {
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.categoryAttributesUrl || `product/api/categories/${categoryId}/attributes`;
        url = url.replace('<CATEGORYID>', categoryId);
        const response = await this.service.get(url);
        return response.data;
    }

    public async fetchCategoryAttributeValues(categoryId: string, attributeId: string, page = 0): Promise<any> {
        const urls = this.params.integrationSettings.urls || {};
        let url = urls.categoryAttributeValuesUrl || `product/api/categories/${categoryId}/attributes/${attributeId}/values`;
        url = url.replace('<CATEGORYID>', categoryId).replace('<ATTRIBUTEID>', attributeId);

        // Append page parameter
        const separator = url.includes('?') ? '&' : '?';
        const finalUrl = `${url}${separator}page=${page}`;

        const response = await this.service.get(finalUrl);
        return response.data;
    }
}

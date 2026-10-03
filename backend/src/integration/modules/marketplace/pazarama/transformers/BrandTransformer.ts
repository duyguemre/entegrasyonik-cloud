import { IBrand } from '@interfaces/index';

export class BrandMapper {
    /**
     * Pazarama'dan gelen marka listesini normalize eder
     */
    public toInternalBrands(rawResponse: any): IBrand[] {
        // Pazarama genelde { data: { brands: [] } } veya direkt [] döner
        // [D-PZ-2] sarmalı `{data:[...]}` ya da `{data:{items:[...]}}`
        const d = rawResponse?.data;
        const rawBrands = Array.isArray(rawResponse) ? rawResponse
            : Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(rawResponse?.brands) ? rawResponse.brands : [];

        const brands: IBrand[] = rawBrands
            .filter((item: any) => item && (item.id ?? item.brandId) !== undefined)
            .map((item: any) => ({
                id: String(item.id ?? item.brandId),
                title: String(item.name ?? item.brandName ?? '')
            }));

        return brands.sort((a, b) => a.title.localeCompare(b.title));
    }
}

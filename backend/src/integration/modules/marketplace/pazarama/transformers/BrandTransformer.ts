import { IBrand } from '@interfaces/index';

export class BrandMapper {
    /**
     * Pazarama'dan gelen marka listesini normalize eder
     */
    public toInternalBrands(rawResponse: any): IBrand[] {
        // Pazarama genelde { data: { brands: [] } } veya direkt [] döner
        const rawBrands = Array.isArray(rawResponse) ? rawResponse : (rawResponse?.data || rawResponse?.brands || []);

        const brands: IBrand[] = rawBrands.map((item: any) => ({
            id: String(item.id || item.brandId),
            title: item.name || item.brandName
        }));

        return brands.sort((a, b) => a.title.localeCompare(b.title));
    }
}

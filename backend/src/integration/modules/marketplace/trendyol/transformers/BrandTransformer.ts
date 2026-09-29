// transformers/BrandMapper.ts
import { IBrand } from '@interfaces/index';

export class BrandMapper {
    /**
     * Trendyol'dan gelen karmaşık marka listesini normalize eder
     */
    public toInternalBrands(rawResponse: any): IBrand[] {
        const rawBrands = Array.isArray(rawResponse) ? rawResponse : (rawResponse?.content || []);

        const brands: IBrand[] = rawBrands.map((item: any) => ({
            id: String(item.id),
            title: item.name
        }));

        return brands.sort((a, b) => a.title.localeCompare(b.title));
    }
}
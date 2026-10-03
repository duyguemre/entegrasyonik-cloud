// transformers/BrandMapper.ts
import { IBrand } from '@interfaces/index';

export class BrandMapper {
    /**
     * Trendyol'dan gelen karmaşık marka listesini normalize eder.
     * [eslesme-fiyat WP4] Liste ucu yanıtı `{brands:[...]}` (resmî); by-name düz dizi; eski `content` geriye uyumlu.
     */
    public toInternalBrands(rawResponse: any): IBrand[] {
        const rawBrands = Array.isArray(rawResponse) ? rawResponse : (rawResponse?.brands || rawResponse?.content || []);

        const brands: IBrand[] = rawBrands.map((item: any) => ({
            id: String(item.id),
            title: item.name
        }));

        return brands.sort((a, b) => a.title.localeCompare(b.title));
    }
}
/**
 * [eslesme-fiyat WP1, D-ERR-1] Pazarama hata çevirisi (iskelet). Kaynak: batch `batchResult[].message`; WP4'te genişletilir.
 */
import type { ErrorMapRule } from '../../common/errors/errorMap';

export const PAZARAMA_ERROR_RULES: readonly ErrorMapRule[] = [
    { match: /marka|brand/i, code: 'MAP_BRAND_MISSING', field: 'brand' },
    { match: /kategori|category/i, code: 'MAP_CATEGORY_MISSING', field: 'category' },
    { match: /zorunlu|required|mandatory/i, code: 'MAP_ATTR_MISSING', field: 'attributes' },
    { match: /image|g[öo]rsel/i, code: 'IMAGE_INVALID', field: 'images' },
];

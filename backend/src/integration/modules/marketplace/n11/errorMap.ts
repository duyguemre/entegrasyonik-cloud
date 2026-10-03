/**
 * [eslesme-fiyat WP1, D-ERR-1] N11 hata çevirisi (iskelet). Kaynak: task-details `reasons[]`; WP4'te fikstürle genişletilir.
 */
import type { ErrorMapRule } from '../../common/errors/errorMap';

export const N11_ERROR_RULES: readonly ErrorMapRule[] = [
    { match: /marka|brand/i, code: 'MAP_BRAND_MISSING', field: 'brand' },
    { match: /kategori|category/i, code: 'MAP_CATEGORY_MISSING', field: 'category' },
    { match: /zorunlu|required|mandatory/i, code: 'MAP_ATTR_MISSING', field: 'attributes' },
    { match: /stok ?kodu|stockcode|sellerstockcode/i, code: 'STOCKCODE_INVALID', field: 'stockcode' },
    { match: /image|g[öo]rsel|resim/i, code: 'IMAGE_INVALID', field: 'images' },
];

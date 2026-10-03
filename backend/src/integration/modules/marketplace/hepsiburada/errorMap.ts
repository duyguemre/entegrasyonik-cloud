/**
 * [eslesme-fiyat WP1, D-ERR-1] Hepsiburada hata çevirisi (iskelet). Kaynak: katalog `validationResults[].attributeName/message`,
 * listing `priceValidations`. WP3'te (D-HB-2) fikstürle genişletilir; eşleşmeyen → PLATFORM_REJECTED.
 */
import type { ErrorMapRule } from '../../common/errors/errorMap';

export const HEPSIBURADA_ERROR_RULES: readonly ErrorMapRule[] = [
    { match: /marka|brand/i, code: 'HB_BRAND_UNMATCHED', field: 'brand' },
    { match: /kategori|category/i, code: 'MAP_CATEGORY_MISSING', field: 'category' },
    { match: /zorunlu|required|mandatory/i, code: 'MAP_ATTR_MISSING', field: 'attributes' },
    { match: /image|g[öo]rsel/i, code: 'IMAGE_INVALID', field: 'images' },
    { match: /kdv|vat|tax/i, code: 'VAT_INVALID', field: 'vatRate' },
];

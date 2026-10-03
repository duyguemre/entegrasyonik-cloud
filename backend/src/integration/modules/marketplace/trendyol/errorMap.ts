/**
 * [eslesme-fiyat WP1, D-ERR-1] Trendyol hata çevirisi (iskelet). Kaynak: `batch-requests` kalem `failureReasons[]` metinleri.
 * Canlı/stage fikstürleri yerel turda (03 §5) geldikçe genişletilir; eşleşmeyen → PLATFORM_REJECTED (ham metin korunur).
 */
import type { ErrorMapRule } from '../../common/errors/errorMap';

export const TRENDYOL_ERROR_RULES: readonly ErrorMapRule[] = [
    { match: /origin|men[şs]e/i, code: 'TY_ORIGIN_REQUIRED', field: 'origin' },
    { match: /brand|marka/i, code: 'MAP_BRAND_MISSING', field: 'brand' },
    { match: /category|kategori/i, code: 'MAP_CATEGORY_MISSING', field: 'category' },
    { match: /(zorunlu|required|mandatory).*(özellik|attribute)|(özellik|attribute).*(zorunlu|required|mandatory)/i, code: 'MAP_ATTR_MISSING', field: 'attributes' },
    { match: /image|g[öo]rsel/i, code: 'IMAGE_INVALID', field: 'images' },
    { match: /barcode|barkod/i, code: 'BARCODE_INVALID', field: 'barcode' },
    { match: /listprice|list price|liste fiyat/i, code: 'PRICE_ABOVE_LIST', field: 'prices.marketPrice' },
    { match: /vat|kdv/i, code: 'VAT_INVALID', field: 'vatRate' },
];

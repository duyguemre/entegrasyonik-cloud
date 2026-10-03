/**
 * [eslesme-fiyat WP1, D-ERR-1] Ideasoft hata çevirisi (iskelet). Kaynak: 422 gövdesi (alan → mesaj); K-H gereği canlı doğrulama yok.
 */
import type { ErrorMapRule } from '../../common/errors/errorMap';

export const IDEASOFT_ERROR_RULES: readonly ErrorMapRule[] = [
    { match: /brand|marka/i, code: 'MAP_BRAND_MISSING', field: 'brand' },
    { match: /categor|kategori/i, code: 'MAP_CATEGORY_MISSING', field: 'category' },
    { match: /sku|stock ?code|stok ?kodu/i, code: 'STOCKCODE_INVALID', field: 'stockcode' },
    { match: /price|fiyat/i, code: 'PRICE_INVALID', field: 'prices.salePrice' },
];

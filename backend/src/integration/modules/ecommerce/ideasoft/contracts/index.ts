// F-09 (faz4-conf-close C7a): Ideasoft YANIT sözleşmeleri (yalnız adaptörün okuduğu kritik alanlar; `.passthrough()`; yalnız GÖZLEM,
// davranış değişmez). Resmi şema sayfası (Stoplight SPA) doğrulanamadı (docs/research/API_CONTRACTS_2026-09-30.md §5): sözleşme
// ADAPTÖRÜN OKUDUĞU alanlarla sınırlıdır; bilinmeyen alan uyuşmazlık sayılmaz. Liste yanıtı `[...]` ya da `{ data: [...] }` (paging.ts::itemsOf).
import { z } from 'zod';
import { requireOneOf, type ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';

const INTEGRATION = 'ideasoft';
const strOrNum = z.union([z.string(), z.number()]);
/** Kod `Number(x)` ile okur: sayı ya da sayısal dizgi kabul; nesne/"on" gibi değer kayma sayılır. */
const numLike = z.union([z.number(), z.string().regex(/^\s*-?\d+([.,]\d+)?\s*$/)]);

/** `[...]` | `{ data: [...] }` -> { items } (itemsOf ile aynı çözümleme; dizi değilse items undefined => sözleşme ihlali). */
const listOf = (item: z.ZodTypeAny) => z.preprocess(
    (b: any) => ({ items: Array.isArray(b) ? b : b?.data }),
    z.object({ items: z.array(item) }).passthrough(),
);

const line = z.object({
    id: strOrNum.optional(), quantity: numLike.optional(), price: numLike.optional(), salePrice: numLike.optional(),
}).passthrough();
const order = requireOneOf(z.object({
    status: strOrNum.optional(),
    totalPrice: numLike.optional(), total: numLike.optional(), shippingPrice: numLike.optional(),
    orderLines: z.array(line).optional(),
}).passthrough(), ['id', 'orderNumber']);

/** GET orders?page&limit -> [...] | { data: [...] } (OrderService.fetchOrders). */
export const IDEASOFT_ORDERS_LIST: ResponseContract = { integration: INTEGRATION, endpoint: 'orders.list', schema: listOf(order) };

const product = z.object({ id: strOrNum.optional(), name: z.string().optional(), price1: numLike.optional(), stockAmount: numLike.optional() }).passthrough();
/** GET products?page&limit -> [...] | { data: [...] } (ProductService.streamProducts/updateProductStatuses). */
export const IDEASOFT_PRODUCTS_LIST: ResponseContract = { integration: INTEGRATION, endpoint: 'products.list', schema: listOf(product) };

const category = z.object({ id: strOrNum.optional(), name: z.string().optional(), parent: z.object({ id: strOrNum.optional() }).passthrough().nullable().optional() }).passthrough();
/** GET categories?page -> [...] | { data: [...] } (CategoryService.fetchCategories). */
export const IDEASOFT_CATEGORIES_LIST: ResponseContract = { integration: INTEGRATION, endpoint: 'categories.list', schema: listOf(category) };

const brand = z.object({ id: strOrNum.optional(), name: z.string().optional() }).passthrough();
/** GET brands?page -> [...] | { data: [...] } (BrandService.fetchBrands). */
export const IDEASOFT_BRANDS_LIST: ResponseContract = { integration: INTEGRATION, endpoint: 'brands.list', schema: listOf(brand) };

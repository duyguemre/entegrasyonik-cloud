// F-09 (faz4-conf-close C7a): Bizimhesap YANIT sözleşmeleri (yalnız adaptörün okuduğu kritik alanlar; `.passthrough()`; yalnız GÖZLEM,
// davranış değişmez). Resmi şema sayfası JS-render/doğrulanamadı (docs/research/API_CONTRACTS_2026-09-30.md §6): sözleşme ADAPTÖRÜN
// OKUDUĞU alanlarla sınırlıdır; bilinmeyen alan uyuşmazlık sayılmaz.
import { z } from 'zod';
import { requireOneOf, type ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';

const INTEGRATION = 'bizimhesap';
const strOrNum = z.union([z.string(), z.number()]);
/** Kod `Number(x)` ile okur: sayı ya da sayısal dizgi kabul; "on" gibi sayısal olmayan değer kayma sayılır. */
const numLike = z.union([z.number(), z.string().regex(/^\s*-?\d+([.,]\d+)?\s*$/)]);

const line = z.object({
    id: strOrNum.optional(),
    quantity: numLike.optional(), amount: numLike.optional(), discount: numLike.optional(),
}).passthrough();

const order = requireOneOf(z.object({
    lines: z.array(line).optional(),
    grossAmount: numLike.optional(), totalDiscount: numLike.optional(),
}).passthrough(), ['id', 'orderNumber']);

/** GET orderListUrl?page&size -> { content: [...], totalPages } (OrderService.fetchOrders). */
export const BIZIMHESAP_ORDERS_LIST: ResponseContract = {
    integration: INTEGRATION, endpoint: 'orders.list',
    schema: z.object({ content: z.array(order).optional(), totalPages: z.number().optional() }).passthrough(),
};

const product = z.object({
    id: strOrNum.optional(), barcode: strOrNum.optional(),
    title: z.string().optional(),
    price: numLike.optional(), quantity: numLike.optional(),
}).passthrough();

/** GET productListUrl -> { data: { products: [...] } } | { products: [...] } | [...] (ProductService.fetchAllProducts). */
export const BIZIMHESAP_PRODUCTS_LIST: ResponseContract = {
    integration: INTEGRATION, endpoint: 'products.list',
    schema: z.preprocess((b: any) => ({ items: b?.data?.products ?? b?.products ?? (Array.isArray(b?.data) ? b.data : Array.isArray(b) ? b : undefined) }),
        z.object({ items: z.array(product) }).passthrough()),
};

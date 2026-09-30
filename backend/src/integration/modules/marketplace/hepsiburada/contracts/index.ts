// F-09: Hepsiburada YANIT sözleşmeleri (yalnız motorun okuduğu kritik alanlar; `.passthrough()`; yalnız GÖZLEM).
import { z } from 'zod';
import { requireOneOf, type ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';

const strOrNum = z.union([z.string(), z.number()]);
const INTEGRATION = 'hepsiburada';

const orderLine = z.object({
    quantity: strOrNum.optional(),
    merchantSku: z.string().optional(),
    sku: z.string().optional(),
    barcode: z.string().optional(),
}).passthrough();

const order = requireOneOf(z.object({
    orderNumber: strOrNum.optional(),
    orderId: strOrNum.optional(),
    status: z.string().optional(),
    lineItems: z.array(orderLine).optional(),
}).passthrough(), ['orderNumber', 'orderId']);

/** GET orders/merchantid/{id} -> { items: [...], totalCount? } (OrderConnector.fetchOrdersFromPlatform). */
export const HB_ORDERS_LIST: ResponseContract = {
    integration: INTEGRATION, endpoint: 'orders.list',
    schema: z.object({ items: z.array(order) }).passthrough(),
};

const batchItem = z.object({
    barcode: z.string().optional(),
    merchantSku: z.string().optional(),
    status: z.string().optional(),
    message: z.string().optional(),
}).passthrough();

/** Ürün aktarımı + fiyat/stok/güncelleme yükleme işi durumu (fetchBatchResults, checkUploadJobStatus). */
export const HB_BATCH_STATUS: ResponseContract = {
    integration: INTEGRATION, endpoint: 'batch.status',
    schema: z.object({
        status: z.string().optional(),
        items: z.array(batchItem).optional(),
        data: z.array(z.object({}).passthrough()).optional(),
    }).passthrough(),
};

const category = z.object({
    categoryId: strOrNum.optional(),
    id: strOrNum.optional(),
    name: z.string().optional(),
    parentCategoryId: strOrNum.optional(),
}).passthrough();

/** Kategori listesi: ya `{ data: [...], totalPages }` ya doğrudan dizi (CategoryConnector). */
export const HB_CATEGORIES_LIST: ResponseContract = {
    integration: INTEGRATION, endpoint: 'categories.list',
    schema: z.preprocess(v => (Array.isArray(v) ? { data: v } : v),
        z.object({ data: z.array(category), totalPages: z.number().optional() }).passthrough()),
};

const attr = z.object({ name: z.string().optional() }).passthrough();
/** Kategori öznitelikleri: { data: { baseAttributes, attributes, variantAttributes } } (CategoryMapper.toInternalAttributes). */
export const HB_CATEGORY_ATTRIBUTES: ResponseContract = {
    integration: INTEGRATION, endpoint: 'categories.attributes',
    schema: z.object({
        data: z.object({
            baseAttributes: z.array(attr).optional(),
            attributes: z.array(attr).optional(),
            variantAttributes: z.array(attr).optional(),
        }).passthrough(),
    }).passthrough(),
};

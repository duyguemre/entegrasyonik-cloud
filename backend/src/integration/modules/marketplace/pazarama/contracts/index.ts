// F-09: Pazarama YANIT sözleşmeleri (yalnız motorun okuduğu kritik alanlar; `.passthrough()`; yalnız GÖZLEM).
// Pazarama alan adları PascalCase/camelCase karışık gelebilir; kod her ikisini de okur, şema da her ikisini kabul eder.
import { z } from 'zod';
import { requireOneOf, type ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';

const strOrNum = z.union([z.string(), z.number()]);
const INTEGRATION = 'pazarama';

const line = z.object({
    OrderItemId: strOrNum.optional(), orderItemId: strOrNum.optional(),
    Quantity: strOrNum.optional(), quantity: strOrNum.optional(),
}).passthrough();

const order = requireOneOf(z.object({
    Items: z.array(line).optional(), items: z.array(line).optional(),
}).passthrough(), ['OrderNumber', 'orderNumber', 'OrderId', 'orderId']);

/** POST order/getOrdersForApi -> { data: [...] } | doğrudan dizi (OrderConnector.fetchOrdersFromPlatform). */
export const PAZARAMA_ORDERS_LIST: ResponseContract = {
    integration: INTEGRATION, endpoint: 'orders.list',
    schema: z.preprocess(v => (Array.isArray(v) ? { data: v } : v),
        z.object({ data: z.array(order) }).passthrough()),
};

/** Ürün toplu işlem sonucu: { data: { batchResult: [{productCode|code}], failedProducts: [{productCode|barcode, errorReason}] } }. */
export const PAZARAMA_BATCH_RESULT: ResponseContract = {
    integration: INTEGRATION, endpoint: 'batch.result',
    schema: z.object({
        data: z.object({
            batchResult: z.array(z.object({ productCode: z.string().optional(), code: z.string().optional(), barcode: z.string().optional() }).passthrough()).optional(),
            failedProducts: z.array(z.object({ productCode: z.string().optional(), barcode: z.string().optional(), errorReason: z.string().optional() }).passthrough()).optional(),
        }).passthrough(),
    }).passthrough(),
};

/** Fiyat/stok güncelleme toplu işlem sonucu (lake-projections): { data: { data: [{ code, price: { status } }] } }. */
export const PAZARAMA_UPDATE_BATCH_RESULT: ResponseContract = {
    integration: INTEGRATION, endpoint: 'batch.update.result',
    schema: z.object({
        data: z.object({
            data: z.array(z.object({
                code: z.string(),
                barcode: z.string().optional(),
                operationStatusText: z.string().optional(),
                price: z.object({ status: z.number().optional(), operationDetail: z.string().optional() }).passthrough().optional(),
            }).passthrough()).optional(),
        }).passthrough(),
    }).passthrough(),
};

const cat = z.object({
    CategoryId: strOrNum.optional(), categoryId: strOrNum.optional(), id: strOrNum.optional(),
    Name: z.string().optional(), name: z.string().optional(),
}).passthrough();
/** Kategori ağacı/listesi: `response.data` içinde data.categories | data | categories | dizi (CategoryService). */
export const PAZARAMA_CATEGORIES_LIST: ResponseContract = {
    integration: INTEGRATION, endpoint: 'categories.list',
    schema: z.preprocess((b: any) => ({
        items: b?.data?.categories ?? b?.data ?? b?.categories ?? (Array.isArray(b) ? b : undefined),
    }), z.object({ items: z.array(cat) }).passthrough()),
};

const attr = z.object({
    AttributeId: strOrNum.optional(), attributeId: strOrNum.optional(), Id: strOrNum.optional(), id: strOrNum.optional(),
    Name: z.string().optional(), name: z.string().optional(),
}).passthrough();
/** Kategori öznitelikleri: `response.data` içinde data.categoryAttributes | data.attributes | data | dizi (CategoryService). */
export const PAZARAMA_CATEGORY_ATTRIBUTES: ResponseContract = {
    integration: INTEGRATION, endpoint: 'categories.attributes',
    schema: z.preprocess((b: any) => ({
        items: b?.data?.categoryAttributes ?? b?.data?.attributes ?? b?.data ?? b?.categoryAttributes ?? (Array.isArray(b) ? b : undefined),
    }), z.object({ items: z.array(attr) }).passthrough()),
};

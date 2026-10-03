// F-09: N11 YANIT sözleşmeleri (yalnız motorun okuduğu kritik alanlar; `.passthrough()`; yalnız GÖZLEM).
import { z } from 'zod';
import { requireOneOf, type ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';

const strOrNum = z.union([z.string(), z.number()]);
const INTEGRATION = 'n11';

const restLine = z.object({
    orderLineId: strOrNum.optional(),
    productId: strOrNum.optional(),
    quantity: strOrNum.optional(),
    price: strOrNum.optional(),
    stockCode: z.string().optional(),
}).passthrough();

const restPackage = requireOneOf(z.object({
    shipmentPackageStatus: z.string().optional(),
    lines: z.array(restLine).optional(),
}).passthrough(), ['orderNumber']);

/** REST GET rest/delivery/v1/shipmentPackages -> { content: [...], totalElements } (OrderService.fetchAllRestPages). */
export const N11_ORDERS_LIST_REST: ResponseContract = {
    integration: INTEGRATION, endpoint: 'orders.list.rest',
    schema: z.object({ content: z.array(restPackage), totalElements: z.number().nullable().optional() }).passthrough(),
};

const soapItem = z.object({
    id: strOrNum.optional(),
    productId: strOrNum.optional(),
    quantity: strOrNum.optional(),
    price: strOrNum.optional(),
    sellerStockCode: z.string().optional(),
}).passthrough();
const soapOrder = requireOneOf(z.object({
    status: z.string().optional(),
    orderItemList: z.object({ orderItem: z.union([soapItem, z.array(soapItem)]).optional() }).passthrough().optional(),
}).passthrough(), ['orderNumber']);

/** SOAP OrderListRequest (xml2js çıktısı) -> { orderList: { order: obj | obj[] } } (OrderMapper.toInternalOrderPackages). */
export const N11_ORDERS_LIST_SOAP: ResponseContract = {
    integration: INTEGRATION, endpoint: 'orders.list.soap',
    schema: z.object({
        // Sonuç boşsa orderList hiç gelmeyebilir veya xml2js'te '' olabilir; bunlar drift SAYILMAZ.
        orderList: z.union([z.literal(''), z.object({ order: z.union([soapOrder, z.array(soapOrder)]).optional() }).passthrough()]).optional(),
    }).passthrough(),
};

/** REST görev/batch durumu (ProductService.checkBatchProduct): { items: [{ id, status, stockCode|barcode, reasons }] }. */
export const N11_BATCH_STATUS: ResponseContract = {
    integration: INTEGRATION, endpoint: 'batch.status',
    schema: z.object({
        items: z.array(z.object({
            id: strOrNum.optional(),
            status: strOrNum,
            stockCode: z.string().optional(),
            barcode: z.string().optional(),
            productSellerCode: z.string().optional(),
            itemCode: z.string().optional(), // [D-N11-3] resmî kalem anahtarı
            reasons: z.array(z.any()).optional(),
        }).passthrough()).optional(),
        content: z.array(z.any()).optional(), // [D-N11-3] sarmalayıcı doğrulanmadı (items[] | content[])
    }).passthrough(),
};

const cat = z.object({ id: strOrNum.optional(), name: z.string().optional(), subCategories: z.array(z.any()).optional() }).passthrough();
/** REST cdn/categories: dizi | { categoryList | categories } (CategoryService.fetchCategories). Liste çıkarılıp `items` altında doğrulanır. */
export const N11_CATEGORIES_LIST: ResponseContract = {
    integration: INTEGRATION, endpoint: 'categories.list',
    schema: z.preprocess((v: any) => {
        const list = Array.isArray(v) ? v
            : Array.isArray(v?.categoryList) ? v.categoryList
            : Array.isArray(v?.categoryList?.category) ? v.categoryList.category
            : v?.categoryList?.category ? [v.categoryList.category]
            : Array.isArray(v?.categories) ? v.categories : undefined;
        return { items: list };
    }, z.object({ items: z.array(cat) }).passthrough()),
};

const attr = z.object({
    attributeId: strOrNum.optional(), id: strOrNum.optional(),
    attributeName: z.string().optional(), name: z.string().optional(),
}).passthrough();
/** REST cdn/category/{id}/attribute -> { categoryAttributes: [...] } | { attributes: [...] } | dizi (Mappers.toInternalAttributes). */
export const N11_CATEGORY_ATTRIBUTES: ResponseContract = {
    integration: INTEGRATION, endpoint: 'categories.attributes',
    schema: z.preprocess((v: any) => ({
        items: Array.isArray(v) ? v : (v?.categoryAttributes ?? v?.attributes),
    }), z.object({ items: z.array(attr) }).passthrough()),
};

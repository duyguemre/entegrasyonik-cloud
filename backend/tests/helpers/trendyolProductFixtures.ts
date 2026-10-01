/**
 * Trendyol ÜRÜN/KATALOG testleri için ortak fikstürler (BACKLOG C22).
 * Gerçek Trendyol'a istek YOK: testler axios'u `_axiosMock` ile taklit eder.
 * Örnek gövdeler `docs/research/2026-09-28-trendyol-v2-migration-spec.md` (resmi kaynaklı) şemasından türetildi.
 */

export const SELLER = '999';
export const HOST = 'https://apigw.trendyol.com/integration';

/** DB `Integrations.urls` (Trendyol) — 2026-09-28 tarihli YEREL DB'de okunan ESKİ (V1) değerler (BACKLOG C22). */
export const V1_URLS: Record<string, string> = {
    baseUrl: HOST,
    transferUrl: `product/sellers/<SELLERID>/products`,
    productListUrl: `product/sellers/<SELLERID>/products`,
    checkBatchUrl: `product/sellers/<SELLERID>/products/batch-requests/`,
    checkTransferUrl: `product/sellers/<SELLERID>/products/batch-requests/`,
    updatePriceUrl: `inventory/sellers/<SELLERID>/products/price-and-inventory`,
    updateStockUrl: `inventory/sellers/<SELLERID>/products/price-and-inventory`,
    updateContentUrl: `product/sellers/<SELLERID>/products/content-bulk-update`,
    updateVariantUrl: `product/sellers/<SELLERID>/products/variant-bulk-update`,
    updateDeliveryUrl: `product/sellers/<SELLERID>/products/delivery-bulk-update`,
    categoryListUrl: `product/product-categories`,
    categoryAttributeListUrl: `product/product-categories/<CATEGORYID>/attributes`,
};

/** Önerilen YENİ (V2) değerler — göç sonrası DB'nin taşıması gereken değerler. */
export const V2_URLS: Record<string, string> = {
    ...V1_URLS,
    transferUrl: `product/sellers/<SELLERID>/v2/products`,
    productListUrl: `product/sellers/<SELLERID>/products/approved`,
    updateDeliveryUrl: `product/sellers/<SELLERID>/products/delivery-info-bulk-update`,
    categoryAttributeListUrl: `product/categories/<CATEGORYID>/attributes`,
};

export function makeParams(opts: { urls?: Record<string, string>; settings?: Record<string, any>; mapping?: any } = {}) {
    return {
        clientId: 7,
        integrationSettings: {
            settings: { APIKEY: 'test-key', APISECRET: 'test-secret', SELLERID: SELLER, ...(opts.settings || {}) },
            urls: opts.urls || V1_URLS,
        },
        mappingProvider: opts.mapping || {
            getPlatformCategoryId: async () => 411,
            getPlatformBrandId: async () => 22,
        },
    };
}

/** Kategori özniteliği (V1 `categoryAttributes[]` şekli). */
export const CATEGORY_ATTRIBUTES_V1 = {
    categoryAttributes: [
        { attribute: { id: 47, name: 'Renk' }, allowCustom: true, required: true, varianter: false, slicer: false, attributeValues: [{ id: 2, name: 'Mavi' }, { id: 1, name: 'Kırmızı' }] },
        { attribute: { id: 338, name: 'Beden' }, allowCustom: false, required: true, varianter: true, slicer: true, attributeValues: [{ id: 7001, name: 'M' }, { id: 7000, name: 'L' }] },
    ],
};

export function makeVariant(over: any = {}) {
    const base: any = {
        _id: 'v1',
        barcode: 'BC-001',
        stockcode: 'SKU-001',
        maincode: 'MAIN-1',
        stock: 5,
        prices: { salePrice: 100, marketPrice: 120 },
        images: ['https://img.example.com/1.jpg', 'https://img.example.com/2.jpg'],
        product: { title: 'Test Ürün', description: 'Açıklama', desi: 2, taxPercentage: 20, category: 'c1', brand: 'b1' },
        platforms: {
            trendyol: {
                prices: { salePrice: 100, marketPrice: 120 },
                upload: { TRANSFER: { status: 'COMPLETED' } },
                attributes: {
                    '47': { attributeName: 'Renk', attributeValue: 'Lila Grisi', attributeValueId: 'undefined' },
                    '338': { attributeName: 'Beden', attributeValue: 'M', attributeValueId: '7001' },
                },
                mapping: { returningAddressId: 111, shipmentAddressId: 222, productContentId: 5551 },
            },
        },
    };
    const out = { ...base, ...over };
    if (over.platforms) out.platforms = over.platforms;
    return out;
}

export const staged = (variant: any) => ({ payload: variant } as any);

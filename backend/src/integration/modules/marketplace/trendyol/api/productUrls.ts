/**
 * Trendyol ÜRÜN URL normalizasyonu (BACKLOG C22, 2026-09-28).
 *
 * NEDEN: Ürün V1 uç noktaları 15 Ekim 2026'da kapanıyor. `Integrations.urls` (DB) değerleri hâlâ ESKİ
 * yolları taşıyor ve kod yolları DB değerini önceliklendiriyor (C11 dersi: DB tanımı kod varsayılanını
 * eziyordu). Bu modül, DB değeri ESKİ de YENİ de olsa kodun DOĞRU (V2) yola gitmesini sağlayan bir
 * güvenlik ağıdır; DB göçünden BAĞIMSIZ çalışır. YALNIZCA ürün/kategori tarafında (`ProductService`,
 * `ProductConnector`, `CategoryConnector`, `CategoryService`) kullanılır — SİPARİŞ URL'leri kapsam dışıdır
 * (`Service.ts` sipariş normalizasyonuyla çakışmamak için ayrı dosya).
 *
 * KURALLAR: (1) eski→yeni eşleme TEK yerde (`PRODUCT_URL_MIGRATIONS`); DB göç aracı ve testler aynı tabloyu
 * kullanır. (2) Göreli ("product/sellers/…") ve mutlak ("https://…") URL'ler, `<SELLERID>` yer tutucusu ve
 * sorgu dizesi korunur. (3) Sorgu dizesi/URL LOGLANMAZ (sır/kimlik sızıntısı riski). (4) Bilinmeyen yollar
 * DEĞİŞTİRİLMEZ (yalnız bilinen V1 kalıpları çevrilir).
 */
import { IntegrationError } from '@integration/modules/common/IntegrationError';

export interface ProductUrlChange {
    key: string;
    /** `null` => yeni anahtar (DB'de bugün yok, eklenmesi önerilir). */
    from: string | null;
    to: string;
}

/**
 * Eski → yeni eşleme tablosu (TEK YER). `from`/`to` göreli şablonlardır; DB değeri mutlak URL ise
 * (ör. "https://apigw.trendyol.com/integration/product/…") aynı sonek mantığı uygulanır.
 * Kaynak: docs/research/2026-09-28-trendyol-v2-migration-spec.md §1.
 */
export const PRODUCT_URL_MIGRATIONS: ReadonlyArray<ProductUrlChange> = [
    { key: 'transferUrl', from: 'product/sellers/<SELLERID>/products', to: 'product/sellers/<SELLERID>/v2/products' },
    { key: 'productListUrl', from: 'product/sellers/<SELLERID>/products', to: 'product/sellers/<SELLERID>/products/approved' },
    { key: 'categoryAttributeListUrl', from: 'product/product-categories/<CATEGORYID>/attributes', to: 'product/categories/<CATEGORYID>/attributes' },
    { key: 'updateDeliveryUrl', from: 'product/sellers/<SELLERID>/products/delivery-bulk-update', to: 'product/sellers/<SELLERID>/products/delivery-info-bulk-update' },
    // Yeni anahtarlar (kod, DB'de yoksa bunları TÜRETİR; DB'ye yazılması isteğe bağlıdır)
    { key: 'productUnapprovedUrl', from: null, to: 'product/sellers/<SELLERID>/products/unapproved' },
    { key: 'updateUnapprovedUrl', from: null, to: 'product/sellers/<SELLERID>/products/unapproved-bulk-update' },
    { key: 'categoryAttributeValuesUrl', from: null, to: 'product/categories/<CATEGORYID>/attributes/<ATTRIBUTEID>/values' },
];

const PLACEHOLDER_SELLER = '<SELLERID>';

function split(url: string): { path: string; query: string } {
    const i = url.indexOf('?');
    return i < 0 ? { path: url, query: '' } : { path: url.slice(0, i), query: url.slice(i) };
}

function trimSlash(path: string): string {
    return path.replace(/\/+$/, '');
}

/** Sorgu dizesi/kimlik sızdırmadan loglanabilir kısım (yalnızca yol). */
export function safeUrlForLog(url: string): string {
    return split(String(url ?? '')).path;
}

/** `…/products` (V1 aktarma) -> `…/v2/products`; zaten `/v2/products` ise veya bilinmeyen kalıpsa değişmez. */
export function normalizeTransferUrl(url: string): string {
    const { path, query } = split(url);
    const p = trimSlash(path);
    if (/\/v2\/products$/.test(p)) return url;
    if (/\/products$/.test(p)) return p.replace(/\/products$/, '/v2/products') + query;
    return url;
}

export interface ProductListUrls {
    /** Onaylı ürün listesi (sorgu dizesi korunur — DB'de sabit filtre olabilir). */
    approved: string;
    unapproved: string;
}

/**
 * `productListUrl` (V1 `…/products`, ya da zaten `…/products/approved|unapproved`, ya da `…/v2/products`)
 * -> onaylı + onaysız V2 liste URL'leri. `explicitUnapproved` (DB'de `productUnapprovedUrl`) varsa onu kullanır.
 */
export function normalizeProductListUrls(url: string, explicitUnapproved?: string): ProductListUrls {
    const { path, query } = split(url);
    const p = trimSlash(path);
    let root: string; // "…/products" köküne kadar
    if (/\/products\/unapproved$/.test(p)) root = p.replace(/\/unapproved$/, '');
    else if (/\/products\/approved$/.test(p)) root = p.replace(/\/approved$/, '');
    else if (/\/v2\/products$/.test(p)) root = p.replace(/\/v2\/products$/, '/products');
    else root = p;
    const approved = `${root}/approved${query}`;
    const unapproved = explicitUnapproved
        ? split(explicitUnapproved).path.replace(/\/+$/, '') + split(explicitUnapproved).query
        : `${root}/unapproved${query}`;
    return { approved, unapproved };
}

/** `…/product-categories/<ID>/attributes` (V1) -> `…/categories/<ID>/attributes` (V2). Kategori LİSTE URL'sine dokunmaz. */
export function normalizeCategoryAttributesUrl(url: string): string {
    const { path, query } = split(url);
    if (/\/product-categories\/[^/]+\/attributes\/?$/.test(path)) {
        return path.replace(/\/product-categories\/([^/]+)\/attributes/, '/categories/$1/attributes') + query;
    }
    return url;
}

/** `…/delivery-bulk-update` -> resmi `…/delivery-info-bulk-update` (spec §1: bizim yol yanlış). */
export function normalizeDeliveryUpdateUrl(url: string): string {
    const { path, query } = split(url);
    if (/\/delivery-bulk-update\/?$/.test(path)) return path.replace(/\/delivery-bulk-update\/?$/, '/delivery-info-bulk-update') + query;
    return url;
}

/** `…/products/…` içeren herhangi bir ürün URL'sinden "…/product/sellers/<SELLERID>" kökünü çıkarır. */
function deriveSellerRoot(url?: string): string | undefined {
    if (!url) return undefined;
    const p = split(url).path;
    const m = p.match(/^(.*?)(?:\/v2)?\/products(?:\/.*)?$/);
    return m ? m[1] : undefined;
}

function ensureTrailingSlash(url: string): string {
    const { path, query } = split(url);
    return `${path.endsWith('/') ? path : path + '/'}${query}`;
}

export interface ResolvedProductUrls {
    transfer: string;
    listApproved: string;
    listUnapproved: string;
    updateContent: string;
    updateVariant: string;
    updateDelivery: string;
    updateUnapproved: string;
    /** Sonu "/" ile biter (batchRequestId eklenir) veya `<BATCHID>` yer tutucusu içerir. */
    checkBatch: string;
    /** `<CATEGORYID>` yer tutucusu içerir. */
    categoryAttributes: string;
    /** `<CATEGORYID>` ve `<ATTRIBUTEID>` yer tutucuları içerir. */
    categoryAttributeValues: string;
    updatePrice: string;
    updateStock: string;
}

function missing(key: string, ctx: { clientId?: any }): never {
    throw new IntegrationError('NOT_SUPPORTED', `Trendyol entegrasyon ayarında '${key}' URL'i tanımlı değil (ve türetilemedi).`, {
        integrationCode: 'trendyol', operation: 'resolve-product-urls', clientId: ctx.clientId ?? 'unknown',
    });
}

/** Kategori öznitelik URL'leri (yalnız bunlara ihtiyaç duyan `CategoryConnector` için; başka anahtar gerektirmez). */
export function resolveCategoryAttributeUrls(urls: Record<string, any> | undefined, ctx: { clientId?: any } = {}): { categoryAttributes: string; categoryAttributeValues: string } {
    const u = urls || {};
    const raw = typeof u.categoryAttributeListUrl === 'string' && u.categoryAttributeListUrl.trim() ? u.categoryAttributeListUrl.trim() : missing('categoryAttributeListUrl', ctx);
    const categoryAttributes = normalizeCategoryAttributesUrl(raw);
    const explicit = typeof u.categoryAttributeValuesUrl === 'string' && u.categoryAttributeValuesUrl.trim() ? u.categoryAttributeValuesUrl.trim() : undefined;
    const categoryAttributeValues = explicit ?? `${trimSlash(split(categoryAttributes).path)}/<ATTRIBUTEID>/values`;
    return { categoryAttributes, categoryAttributeValues };
}

/**
 * DB `urls` nesnesinden (ESKİ ya da YENİ değerlerle) çalışacak V2 ürün URL'lerini üretir. Eksik zorunlu
 * anahtar için IntegrationError(NOT_SUPPORTED) fırlatır (sessiz `undefined` yok). Bu fonksiyon SAFTIR (I/O yok).
 */
export function resolveProductUrls(urls: Record<string, any> | undefined, ctx: { clientId?: any } = {}): ResolvedProductUrls {
    const u = urls || {};
    const str = (k: string): string | undefined => (typeof u[k] === 'string' && u[k].trim() ? u[k].trim() : undefined);

    const rootSource = str('transferUrl') ?? str('productListUrl') ?? str('updateVariantUrl') ?? str('updateContentUrl');
    const sellerRoot = deriveSellerRoot(rootSource);
    const derive = (suffix: string, key: string): string => sellerRoot ? `${sellerRoot}/${suffix}` : missing(key, ctx);

    const rawTransfer = str('transferUrl') ?? (sellerRoot ? `${sellerRoot}/v2/products` : missing('transferUrl', ctx));
    const rawList = str('productListUrl') ?? (sellerRoot ? `${sellerRoot}/products` : missing('productListUrl', ctx));
    const list = normalizeProductListUrls(rawList, str('productUnapprovedUrl'));

    const { categoryAttributes, categoryAttributeValues } = resolveCategoryAttributeUrls(u, ctx);

    const checkBatchRaw = str('checkBatchUrl') ?? str('checkTransferUrl') ?? derive('products/batch-requests/', 'checkBatchUrl');

    return {
        transfer: normalizeTransferUrl(rawTransfer),
        listApproved: list.approved,
        listUnapproved: list.unapproved,
        updateContent: str('updateContentUrl') ?? derive('products/content-bulk-update', 'updateContentUrl'),
        updateVariant: str('updateVariantUrl') ?? derive('products/variant-bulk-update', 'updateVariantUrl'),
        updateDelivery: normalizeDeliveryUpdateUrl(str('updateDeliveryUrl') ?? derive('products/delivery-info-bulk-update', 'updateDeliveryUrl')),
        updateUnapproved: str('updateUnapprovedUrl') ?? derive('products/unapproved-bulk-update', 'updateUnapprovedUrl'),
        checkBatch: checkBatchRaw.includes('<BATCHID>') ? checkBatchRaw : ensureTrailingSlash(checkBatchRaw),
        categoryAttributes,
        categoryAttributeValues,
        updatePrice: str('updatePriceUrl') ?? missing('updatePriceUrl', ctx),
        updateStock: str('updateStockUrl') ?? str('updatePriceUrl') ?? missing('updateStockUrl', ctx),
    };
}

/** Yer tutucuları doldurur (`<SELLERID>` vb.). Değerler URL-encode EDİLİR (yol segmenti). */
export function fillUrl(template: string, values: { sellerId?: string; categoryId?: string; attributeId?: string; batchId?: string }): string {
    let out = template;
    if (values.sellerId !== undefined) out = out.split(PLACEHOLDER_SELLER).join(String(values.sellerId));
    if (values.categoryId !== undefined) out = out.split('<CATEGORYID>').join(encodeURIComponent(String(values.categoryId)));
    if (values.attributeId !== undefined) out = out.split('<ATTRIBUTEID>').join(encodeURIComponent(String(values.attributeId)));
    if (values.batchId !== undefined) {
        out = out.includes('<BATCHID>')
            ? out.split('<BATCHID>').join(encodeURIComponent(String(values.batchId)))
            : split(out).path + encodeURIComponent(String(values.batchId)) + split(out).query;
    }
    return out;
}

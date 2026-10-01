/**
 * Birim testi: Trendyol ürün URL normalizasyonu (BACKLOG C22) — saf fonksiyonlar, I/O yok.
 * Eski→yeni eşleme tablosu tek yerde (`PRODUCT_URL_MIGRATIONS`); tablo ile davranışın tutarlılığı doğrulanır.
 */
import { describe, it, expect } from '@jest/globals';
import {
    PRODUCT_URL_MIGRATIONS, normalizeTransferUrl, normalizeProductListUrls, normalizeCategoryAttributesUrl,
    normalizeDeliveryUpdateUrl, resolveProductUrls, resolveCategoryAttributeUrls, fillUrl, safeUrlForLog,
} from '@integration/modules/marketplace/trendyol/api/productUrls';
import { V1_URLS, V2_URLS } from '../helpers/trendyolProductFixtures';

describe('PRODUCT_URL_MIGRATIONS tablosu ile normalizasyon tutarlılığı', () => {
    const table = Object.fromEntries(PRODUCT_URL_MIGRATIONS.filter(c => c.from).map(c => [c.key, c]));
    it('transferUrl: from -> to', () => { expect(normalizeTransferUrl(table.transferUrl.from!)).toBe(table.transferUrl.to); });
    it('productListUrl: from -> to (onaylı)', () => { expect(normalizeProductListUrls(table.productListUrl.from!).approved).toBe(table.productListUrl.to); });
    it('categoryAttributeListUrl: from -> to', () => { expect(normalizeCategoryAttributesUrl(table.categoryAttributeListUrl.from!)).toBe(table.categoryAttributeListUrl.to); });
    it('updateDeliveryUrl: from -> to', () => { expect(normalizeDeliveryUpdateUrl(table.updateDeliveryUrl.from!)).toBe(table.updateDeliveryUrl.to); });
    it('normalizasyon İDEMPOTENT: yeni değerler bir kez daha normalize edilince değişmez', () => {
        for (const c of PRODUCT_URL_MIGRATIONS.filter(x => x.from)) {
            const fns: any = { transferUrl: normalizeTransferUrl, categoryAttributeListUrl: normalizeCategoryAttributesUrl, updateDeliveryUrl: normalizeDeliveryUpdateUrl, productListUrl: (u: string) => normalizeProductListUrls(u).approved };
            expect(fns[c.key](c.to)).toBe(c.to);
        }
    });
});

describe('mutlak URL, sorgu dizesi ve bilinmeyen kalıplar', () => {
    it('mutlak URL + sorgu dizesi korunur', () => {
        expect(normalizeTransferUrl('https://apigw.trendyol.com/integration/product/sellers/<SELLERID>/products?x=1'))
            .toBe('https://apigw.trendyol.com/integration/product/sellers/<SELLERID>/v2/products?x=1');
        const l = normalizeProductListUrls('https://h/product/sellers/<SELLERID>/products?a=b');
        expect(l.approved).toBe('https://h/product/sellers/<SELLERID>/products/approved?a=b');
        expect(l.unapproved).toBe('https://h/product/sellers/<SELLERID>/products/unapproved?a=b');
    });
    it('productListUrl zaten /approved, /unapproved veya /v2/products ise doğru kökten türetilir', () => {
        expect(normalizeProductListUrls('p/sellers/<SELLERID>/products/approved').unapproved).toBe('p/sellers/<SELLERID>/products/unapproved');
        expect(normalizeProductListUrls('p/sellers/<SELLERID>/products/unapproved').approved).toBe('p/sellers/<SELLERID>/products/approved');
        expect(normalizeProductListUrls('p/sellers/<SELLERID>/v2/products').approved).toBe('p/sellers/<SELLERID>/products/approved');
        expect(normalizeProductListUrls('x/products', 'custom/unapproved-list').unapproved).toBe('custom/unapproved-list');
    });
    it('bilinmeyen yollar DEĞİŞTİRİLMEZ (kategori LİSTE, marka, stok-fiyat)', () => {
        expect(normalizeCategoryAttributesUrl('product/product-categories')).toBe('product/product-categories');
        expect(normalizeTransferUrl('inventory/sellers/<SELLERID>/products/price-and-inventory')).toBe('inventory/sellers/<SELLERID>/products/price-and-inventory');
        expect(normalizeDeliveryUpdateUrl('a/delivery-info-bulk-update')).toBe('a/delivery-info-bulk-update');
    });
    it('safeUrlForLog sorgu dizesini (sır) atar', () => {
        expect(safeUrlForLog('https://h/p?apiKey=SECRET&x=1')).toBe('https://h/p');
    });
});

describe('resolveProductUrls', () => {
    it('ESKİ (V1) DB değerleri -> V2 yolları; YENİ değerler -> aynı sonuç', () => {
        const a = resolveProductUrls(V1_URLS);
        const b = resolveProductUrls(V2_URLS);
        expect(a).toEqual(b);
        expect(a.transfer).toBe('product/sellers/<SELLERID>/v2/products');
        expect(a.listApproved).toBe('product/sellers/<SELLERID>/products/approved');
        expect(a.listUnapproved).toBe('product/sellers/<SELLERID>/products/unapproved');
        expect(a.updateContent).toBe('product/sellers/<SELLERID>/products/content-bulk-update');
        expect(a.updateVariant).toBe('product/sellers/<SELLERID>/products/variant-bulk-update');
        expect(a.updateDelivery).toBe('product/sellers/<SELLERID>/products/delivery-info-bulk-update');
        expect(a.updateUnapproved).toBe('product/sellers/<SELLERID>/products/unapproved-bulk-update');
        expect(a.categoryAttributes).toBe('product/categories/<CATEGORYID>/attributes');
        expect(a.categoryAttributeValues).toBe('product/categories/<CATEGORYID>/attributes/<ATTRIBUTEID>/values');
        expect(a.checkBatch).toBe('product/sellers/<SELLERID>/products/batch-requests/');
        expect(a.updatePrice).toBe('inventory/sellers/<SELLERID>/products/price-and-inventory');
    });

    it('eksik anahtarlar transferUrl/productListUrl kökünden TÜRETİLİR; hiç kök yoksa IntegrationError(NOT_SUPPORTED) (sessiz undefined yok)', () => {
        const minimal = resolveProductUrls({ transferUrl: 'product/sellers/<SELLERID>/products', categoryAttributeListUrl: 'product/product-categories/<CATEGORYID>/attributes', updatePriceUrl: 'inv/price-and-inventory' });
        expect(minimal.updateContent).toBe('product/sellers/<SELLERID>/products/content-bulk-update');
        expect(minimal.checkBatch).toBe('product/sellers/<SELLERID>/products/batch-requests/');
        expect(() => resolveProductUrls({})).toThrow(/NOT_SUPPORTED/);
        expect(() => resolveCategoryAttributeUrls({})).toThrow(/categoryAttributeListUrl/);
    });

    it('fillUrl: <SELLERID>/<CATEGORYID>/<ATTRIBUTEID>/batchId (yol segmenti URL-encode; batch sonu "/" ya da <BATCHID>)', () => {
        expect(fillUrl('p/<SELLERID>/c/<CATEGORYID>/a/<ATTRIBUTEID>/values', { sellerId: '1', categoryId: '2', attributeId: '3' })).toBe('p/1/c/2/a/3/values');
        expect(fillUrl('p/batch-requests/', { batchId: 'a b/c' })).toBe('p/batch-requests/a%20b%2Fc');
        expect(fillUrl('p/batch?id=<BATCHID>', { batchId: 'X' })).toBe('p/batch?id=X');
    });
});

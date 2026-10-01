/** ADR-0030 X1: Trendyol grup limit tablosu varsayılanları + barkod başına fiyat sınırı. */
import { describe, it, expect, afterEach } from '@jest/globals';
import {
    trendyolGroupRatePerMin, TRENDYOL_GROUP_RATE_PER_MIN_50K, trendyolWriteGroupForUrl,
    BarcodePriceGate, TRENDYOL_PRICE_PER_BARCODE_PER_MIN,
} from '@integration/modules/marketplace/trendyol/limits';

afterEach(() => { delete process.env.TY_RATE_PRODUCT_READ_PER_MIN; delete process.env.TY_RATE_PRODUCT_WRITE_PER_MIN; });

describe('Trendyol servis grubu limit tablosu', () => {
    it('varsayılan = 50K kademesi (en muhafazakâr)', () => {
        expect(trendyolGroupRatePerMin()).toEqual({ product_read: 1000, product_write: 200, inventory_price_write: 350 });
        expect(TRENDYOL_GROUP_RATE_PER_MIN_50K.inventory_price_write).toBe(350);
    });
    it('env geçerliyse yükseltir, geçersizse varsayılana düşer', () => {
        process.env.TY_RATE_PRODUCT_READ_PER_MIN = '2000';
        process.env.TY_RATE_PRODUCT_WRITE_PER_MIN = '-5';
        const t = trendyolGroupRatePerMin();
        expect(t.product_read).toBe(2000);
        expect(t.product_write).toBe(200);
    });
    it('URL -> grup: price-and-inventory stok/fiyat, diğer yazmalar ürün yazma', () => {
        expect(trendyolWriteGroupForUrl('https://x/product/sellers/1/products/price-and-inventory')).toBe('inventory_price_write');
        expect(trendyolWriteGroupForUrl('https://x/product/sellers/1/v2/products')).toBe('product_write');
    });
});

describe('BarcodePriceGate (30/dk)', () => {
    it('sınır 30/dk', () => expect(TRENDYOL_PRICE_PER_BARCODE_PER_MIN).toBe(30));
    it('ilk 30 yazım beklemeden geçer; 31. reddedilmez, pencere boşalana dek ertelenir', () => {
        const g = new BarcodePriceGate();
        const t = 1_000_000;
        for (let i = 0; i < 30; i++) expect(g.reserve('a', t + i)).toBe(0);
        const w = g.reserve('a', t + 30);
        expect(w).toBeGreaterThan(59_000);
        expect(w).toBeLessThanOrEqual(60_000);
    });
    it('barkodlar birbirinden bağımsız; pencere geçince yeniden serbest', () => {
        const g = new BarcodePriceGate();
        const t = 5_000_000;
        for (let i = 0; i < 30; i++) g.reserve('a', t);
        expect(g.reserve('b', t)).toBe(0);
        expect(g.reserve('a', t + 60_001)).toBe(0);
    });
});

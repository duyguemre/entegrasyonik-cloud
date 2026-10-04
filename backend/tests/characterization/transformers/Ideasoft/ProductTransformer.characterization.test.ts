// Protokol 13 karakterizasyon: Ideasoft `ProductTransformer` (buildIdeasoftProduct / buildIdeasoftVariant /
// toInternalVariant / toInternalStatusResult). ADR-0016 §8.2 B-R-T4 dilimi (SON dilim).
import { describe, it, expect } from '@jest/globals';
import { ProductTransformer } from '@integration/modules/ecommerce/ideasoft/transformers/ProductTransformer';

describe('Ideasoft ProductTransformer.buildIdeasoftProduct — karakterizasyon', () => {
    const t = new ProductTransformer();

    it('mutlu yol: alan eşlemeleri ve sabit değerler', () => {
        const product = {
            title: 'Test Ürün', maincode: 'MC-1', description: 'Açıklama', totalStock: 10,
            minPrice: 99.9, taxPercentage: 10, desi: 2, warranty: 24, stockTypeLabel: 'Adet',
            platformBrandId: '5', platformCategoryId: '7', images: ['img1.jpg'],
        };
        const result = t.buildIdeasoftProduct(product, {});
        expect(result).toMatchObject({
            name: 'Test Ürün', fullname: 'Test Ürün', sku: 'MC-1', barcode: 'MC-1',
            detail: { details: 'Açıklama' }, stockAmount: 10, price1: 99.9,
            currency: { id: 3 }, taxIncluded: 1, tax: 10, warranty: 24, volumetricWeight: 2,
            stockTypeLabel: 'Adet', customShippingDisabled: 1, hasOption: 1, hasGift: 0,
            status: 1, categoryShowcaseStatus: 0, brand: { id: 5 }, categories: [{ id: 7 }],
            images: ['img1.jpg'],
        });
        // GİZLİ DAVRANIŞ: sku VE barcode İKİSİ DE product.maincode'a eşlenir (ürünün ayrı bir barkod alanı yok).
        expect(result.sku).toBe(result.barcode);
    });

    // [eslesme-fiyat WP5, D-PRICE-2] bilinçli güncelleme: KDV {0,1,10,20}; sessiz 20/18 varsayılanı yok (ayarsız → VALIDATION).
    it('varsayılanlar: desi/warranty/stockTypeLabel product\'ta yoksa settings\'e, o da yoksa sabit varsayılana düşer (1/0/"Piece"); KDV yoksa VALIDATION', () => {
        expect(() => t.buildIdeasoftProduct({ title: 'X', maincode: 'X1' }, {})).toThrow(/KDV oranı ayarlı değil/);
        const result = t.buildIdeasoftProduct({ title: 'X', maincode: 'X1', taxPercentage: 20 }, {});
        expect(result.tax).toBe(20);
        expect(result.volumetricWeight).toBe(1);
        expect(result.warranty).toBe(0);
        expect(result.stockTypeLabel).toBe('Piece');
        expect(result.stockAmount).toBe(0);
        expect(result.price1).toBe(0);
        expect(result.images).toEqual([]);
    });

    it('settings üzerinden fallback: product\'ta yoksa settings.taxPercentage/desi/warranty/stockTypeLabel kullanılır', () => {
        const settings = { taxPercentage: 20, desi: 4, warranty: 12, stockTypeLabel: 'Kutu' };
        const result = t.buildIdeasoftProduct({ title: 'Y', maincode: 'Y1' }, settings);
        expect(result.tax).toBe(20);
        expect(result.volumetricWeight).toBe(4);
        expect(result.warranty).toBe(12);
        expect(result.stockTypeLabel).toBe('Kutu');
    });

    it('description yoksa detail.details boş string olur', () => {
        const result = t.buildIdeasoftProduct({ title: 'Z', maincode: 'Z1', taxPercentage: 20 }, {});
        expect(result.detail).toEqual({ details: '' });
    });

    it('slug: Türkçe karakterler ASCII\'ye çevrilir, boşluklar/tire dışı karakterler "-" olur, baş/son "-" kırpılır', () => {
        const result = t.buildIdeasoftProduct({ title: 'Çöğüşı Ürün Adı!', maincode: 'S1', taxPercentage: 20 }, {});
        expect(result.slug).toBe('cogusi-urun-adi');
    });

    it('brand/categories id\'leri Number() ile zorlanır (string "5" -> 5)', () => {
        const result = t.buildIdeasoftProduct({ title: 'A', maincode: 'A1', platformBrandId: '42', platformCategoryId: '99', taxPercentage: 20 }, {});
        expect(result.brand).toEqual({ id: 42 });
        expect(result.categories).toEqual([{ id: 99 }]);
    });
});

describe('Ideasoft ProductTransformer.buildIdeasoftVariant — karakterizasyon', () => {
    const t = new ProductTransformer();
    const product = { title: 'Ana Ürün', taxPercentage: 20, desi: 1, warranty: 0 }; // [eslesme-fiyat WP5, D-PRICE-2] bilinçli güncelleme: KDV {0,1,10,20}; sessiz 20/18 varsayılanı yok (ayarsız → VALIDATION).

    it('mutlu yol: platform fiyatı öncelikli, options/brand/category eşlenir', () => {
        const variant: any = {
            title: 'Kırmızı - L', stockcode: 'SKU-V1', barcode: 'BAR-V1', stock: 15,
            // [eslesme-fiyat WP5] kanal fiyatı yalnız `isPlatformBasedPrice:true` ile esas alınır (effectiveChannelPrice; bilinçli güncelleme).
            prices: { isPlatformBasedPrice: true, salePrice: 10 },
            platforms: { ideasoft: { prices: { salePrice: 149.999 }, attributes: { '10': 'V100', '11': null } } },
        };
        const result = t.buildIdeasoftVariant(variant, product, '3', '4', [], {});
        expect(result.name).toBe('Kırmızı - L');
        expect(result.fullname).toBe('Ana Ürün'); // fullname HER ZAMAN ana ürünün başlığı
        expect(result.sku).toBe('SKU-V1');
        expect(result.barcode).toBe('BAR-V1');
        expect(result.stockAmount).toBe(15);
        expect(result.price1).toBe(150); // Math.round(149.999*100)/100 = 150
        expect(result.brand).toEqual({ id: 3 });
        expect(result.categories).toEqual([{ id: 4 }]);
        expect(result.hasOption).toBe(0); // variant için HER ZAMAN 0 (ürün ise hep 1)
        expect(result.optionGroups).toEqual([{ id: '10', options: [{ id: 'V100' }] }]); // falsy value'lu attribute (11:null) FİLTRELENİR
    });

    it('variant.title yoksa product.title kullanılır (name VE slug için)', () => {
        const variant: any = { stockcode: 'S1', barcode: 'B1', platforms: {} };
        const result = t.buildIdeasoftVariant(variant, product, 1, 1, [], {});
        expect(result.name).toBe('Ana Ürün');
        expect(result.slug).toBe('ana-urun');
    });

    it('detail.details HER ZAMAN boş string döner (variant açıklaması hiç kullanılmaz)', () => {
        const variant: any = { title: 'V', description: 'Bu açıklama YOK SAYILIR', platforms: {} };
        const result = t.buildIdeasoftVariant(variant, product, 1, 1, [], {});
        expect(result.detail).toEqual({ details: '' });
    });

    it('images HER ZAMAN boş dizi döner (variant.images ne olursa olsun kullanılmaz)', () => {
        const variant: any = { title: 'V', images: ['a.jpg', 'b.jpg'], platforms: {} };
        const result = t.buildIdeasoftVariant(variant, product, 1, 1, [], {});
        expect(result.images).toEqual([]);
    });

    it('salePrice: platforms[ideasoft].prices.salePrice yoksa variant.prices.salePrice\'a, o da yoksa 0\'a düşer', () => {
        const variant: any = { title: 'V', platforms: {}, prices: { salePrice: 77 } };
        const result = t.buildIdeasoftVariant(variant, product, 1, 1, [], {});
        expect(result.price1).toBe(77);
        const variantNone: any = { title: 'V', platforms: {} };
        const resultNone = t.buildIdeasoftVariant(variantNone, product, 1, 1, [], {});
        expect(resultNone.price1).toBe(0);
    });

    // GİZLİ DAVRANIŞ / OLASI TUTARSIZLIK (BACKLOG.md'ye eklendi — DÜZELTİLMEDİ):
    // taxPercentage/desi/warranty zinciri variant -> product -> settings -> sabit şeklinde 3 seviye
    // fallback yaparken, stockTypeLabel zinciri SADECE variant -> settings arasında (product ATLANIR).
    it('stockTypeLabel zinciri product SEVİYESİNİ ATLAR: variant\'ta yoksa DOĞRUDAN settings\'e düşer (product.stockTypeLabel YOK SAYILIR)', () => {
        const productWithLabel = { ...product, stockTypeLabel: 'Ürün Etiketi' };
        const variant: any = { title: 'V', platforms: {} };
        const result = t.buildIdeasoftVariant(variant, productWithLabel, 1, 1, [], { stockTypeLabel: 'Ayar Etiketi' });
        expect(result.stockTypeLabel).toBe('Ayar Etiketi'); // product.stockTypeLabel ('Ürün Etiketi') DEĞİL
    });

    // [eslesme-fiyat WP5, D-PRICE-2] bilinçli güncelleme: KDV {0,1,10,20}; sessiz 20/18 varsayılanı yok (ayarsız → VALIDATION).
    it('taxPercentage: kanal eşlemesi -> product -> settings (yoksa VALIDATION); desi/warranty: variant -> product -> settings -> sabit (1/0)', () => {
        const variant: any = { title: 'V', platforms: {} };
        expect(() => t.buildIdeasoftVariant(variant, { title: 'P' }, 1, 1, [], {})).toThrow(/KDV oranı ayarlı değil/);
        const result = t.buildIdeasoftVariant(variant, { title: 'P' }, 1, 1, [], { taxPercentage: 20 });
        expect(result.tax).toBe(20);
        expect(result.volumetricWeight).toBe(1);
        expect(result.warranty).toBe(0);

        const resultFromProduct = t.buildIdeasoftVariant(variant, { title: 'P', taxPercentage: 10, desi: 3, warranty: 6 }, 1, 1, [], {});
        expect(resultFromProduct.tax).toBe(10);
        expect(resultFromProduct.volumetricWeight).toBe(3);
        expect(resultFromProduct.warranty).toBe(6);

        const variantOverride: any = { title: 'V', desi: 1, warranty: 1, platforms: { ideasoft: { mapping: { taxPercentage: 1 } } } };
        const resultFromVariant = t.buildIdeasoftVariant(variantOverride, { title: 'P', taxPercentage: 10, desi: 3, warranty: 6 }, 1, 1, [], {});
        expect(resultFromVariant.tax).toBe(1);
        expect(resultFromVariant.volumetricWeight).toBe(1);
        expect(resultFromVariant.warranty).toBe(1);
    });

    it('categoryAttributes parametresi FONKSİYON GÖVDESİNDE KULLANILMAZ (ölü parametre) — sonucu etkilemez', () => {
        const variant: any = { title: 'V', platforms: {} };
        const withAttrs = t.buildIdeasoftVariant(variant, product, 1, 1, [{ _id: 'x' } as any], {});
        const withoutAttrs = t.buildIdeasoftVariant(variant, product, 1, 1, [], {});
        expect(withAttrs).toEqual(withoutAttrs);
    });
});

describe('Ideasoft ProductTransformer.toInternalVariant — karakterizasyon', () => {
    const t = new ProductTransformer();

    it('mutlu yol: salePrice prices[0].value öncelikli, tax uygulanmış price hesaplanır, onSale status===1', () => {
        const platformProduct = { id: 55, barcode: 'BAR-1', sku: 'SKU-1', stockAmount: 12, tax: 20, status: 1, prices: [{ value: 120 }], price1: 999 };
        const parentProduct = { id: 'PARENT-1', name: 'Ana Ürün Adı' };
        const result = t.toInternalVariant(platformProduct, parentProduct);
        expect(result.code).toBe('ideasoft');
        expect(result.maincode).toBe('ideasoft_PARENT-1');
        expect(result.title).toBe('Ana Ürün Adı');
        expect(result.barcode).toBe('BAR-1');
        expect(result.stockcode).toBe('SKU-1');
        expect(result.stock).toBe(12);
        expect(result.prices).toEqual({ isPlatformBasedPrice: false, price: 100, salePrice: 120, marketPrice: 120 }); // 120*(100/120)=100
        expect((result.platforms as any).ideasoft.mapping).toEqual({ productId: 55 });
        expect(result.onSale).toBe(true);
    });

    it('prices[0] yoksa platformProduct.price1 kullanılır', () => {
        const result = t.toInternalVariant({ id: 1, price1: 50, tax: 0 }, { id: 'P' });
        expect(result.prices!.salePrice).toBe(50);
        expect(result.prices!.price).toBe(50); // tax 0 -> price === salePrice
    });

    it('title: parentProduct.name öncelikli, yoksa platformProduct.name', () => {
        const result = t.toInternalVariant({ id: 1, name: 'Platform Adı' }, { id: 'P', name: undefined });
        expect(result.title).toBe('Platform Adı');
    });

    it('status 1 değilse onSale false', () => {
        const result = t.toInternalVariant({ id: 1, status: 0 }, { id: 'P' });
        expect(result.onSale).toBe(false);
        const resultUndef = t.toInternalVariant({ id: 1 }, { id: 'P' });
        expect(resultUndef.onSale).toBe(false);
    });

    it('stockAmount yoksa stock 0 olur', () => {
        const result = t.toInternalVariant({ id: 1 }, { id: 'P' });
        expect(result.stock).toBe(0);
    });
});

describe('Ideasoft ProductTransformer.toInternalStatusResult — karakterizasyon', () => {
    const t = new ProductTransformer();

    it('boş/undefined girdi -> boş dizi', () => {
        expect(t.toInternalStatusResult(undefined as any)).toEqual([]);
        expect(t.toInternalStatusResult([])).toEqual([]);
    });

    it('status===1 ve stockAmount>0 -> COMPLETED, mesaj yok', () => {
        const [r] = t.toInternalStatusResult([{ barcode: 'B1', status: 1, stockAmount: 5 }]);
        expect(r).toEqual({ matchValue: 'B1', barcode: 'B1', status: 'COMPLETED', messages: [] });
    });

    it('status !== 1 -> FAILED, "Pasif" mesajı (stok ne olursa olsun)', () => {
        const [r] = t.toInternalStatusResult([{ barcode: 'B2', status: 0, stockAmount: 10 }]);
        expect(r).toEqual({ matchValue: 'B2', barcode: 'B2', status: 'FAILED', messages: ['Pasif'] });
    });

    it('status===1 ve stockAmount===0 -> FAILED, "Stok sıfır" mesajı', () => {
        const [r] = t.toInternalStatusResult([{ barcode: 'B3', status: 1, stockAmount: 0 }]);
        expect(r).toEqual({ matchValue: 'B3', barcode: 'B3', status: 'FAILED', messages: ['Stok sıfır'] });
    });

    // GİZLİ DAVRANIŞ (BACKLOG.md'ye eklendi — DÜZELTİLMEDİ):
    // status===1 ve stockAmount TANIMSIZ (ne >0 ne ===0, örn. undefined) ise: status FAILED olur
    // (çünkü stockAmount>0 false) AMA messages BOŞ DİZİ kalır (çünkü stockAmount===0 de false) —
    // yani kullanıcıya "neden başarısız" bilgisi VERİLMEDEN sessizce FAILED dönebilir.
    it('status===1 ve stockAmount TANIMSIZ ise FAILED ama mesaj YOK (sessiz başarısızlık)', () => {
        const [r] = t.toInternalStatusResult([{ barcode: 'B4', status: 1 }]);
        expect(r.status).toBe('FAILED');
        expect(r.messages).toEqual([]);
    });
});

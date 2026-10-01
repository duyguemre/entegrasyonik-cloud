// Protokol 13 karakterizasyon: Bizimhesap `ProductTransformer` (extractCatalog / convertProducts /
// toInternalStatusResult). ADR-0016 §8.2 B-R-T4 dilimi (Ideasoft + Bizimhesap transformer'ları — SON dilim).
import { describe, it, expect } from '@jest/globals';
import { ProductTransformer } from '@integration/modules/erp/bizimhesap/transformers/ProductTransformer';

describe('Bizimhesap ProductTransformer.extractCatalog — karakterizasyon', () => {
    const t = new ProductTransformer();

    it('boş dizi -> tüm koleksiyonlar boş', () => {
        const result = t.extractCatalog([]);
        expect(result).toEqual({ categories: [], brands: [], options: [] });
    });

    it('category/brand distinct olarak toplanır, id/title karakter dizisine göre sıralanır', () => {
        const products = [
            { category: 'Giyim', brand: 'Nike' },
            { category: 'Elektronik', brand: 'Apple' },
            { category: 'Giyim', brand: 'Nike' }, // tekrar -> dedup
        ];
        const result = t.extractCatalog(products);
        expect(result.categories.map(c => c._id)).toEqual(['Elektronik', 'Giyim']); // alfabetik sıralı
        expect(result.brands.map(b => b.id)).toEqual(['Apple', 'Nike']);
    });

    it('category/brand yoksa (falsy) haritaya eklenmez', () => {
        const result = t.extractCatalog([{ category: '', brand: undefined }]);
        expect(result.categories).toEqual([]);
        expect(result.brands).toEqual([]);
    });

    it('variantName/variant " -- " ile ayrılmış isim-değer çiftlerine göre options grubu oluşturur', () => {
        const products = [{ variantName: 'Renk -- Beden', variant: 'Kırmızı -- L' }];
        const result = t.extractCatalog(products);
        expect(result.options).toHaveLength(2);
        expect(result.options[0]).toMatchObject({ _id: 'Renk', title: 'Renk', values: [{ id: 'Kırmızı', title: 'Kırmızı' }] });
        expect(result.options[1]).toMatchObject({ _id: 'Beden', title: 'Beden', values: [{ id: 'L', title: 'L' }] });
    });

    it('aynı isimli grup birden fazla üründe tekrar ederse DEĞERLER birikir, tekrar eden değer eklenmez', () => {
        const products = [
            { variantName: 'Renk', variant: 'Kırmızı' },
            { variantName: 'Renk', variant: 'Mavi' },
            { variantName: 'Renk', variant: 'Kırmızı' }, // tekrar -> eklenmez
        ];
        const result = t.extractCatalog(products);
        expect(result.options).toHaveLength(1);
        expect(result.options[0].values!.map((v: any) => v.id)).toEqual(['Kırmızı', 'Mavi']);
    });

    // [DÜZELTİLDİ, 2026-09-29, orkestratör] extractCatalog, variantNames dizisini `.filter(Boolean)` ile BOŞ
    // segmentleri ATARAK indexleri KAYDIRIYORDU, fakat variantValues dizisi filtrelenmiyordu -> isim/değer
    // eşleşmesi YANLIŞ kayabiliyordu. AYNI dosyadaki `getVariantAttributes()`'ın DOĞRU deseni (`if (name)
    // map[name] = values[idx] || ''` — filtrelemeden, index korunarak) buraya da uygulandı.
    it('[DÜZELTİLDİ] variantName başında/ortasında boş segment varsa artık DOĞRU index eşleşir (getVariantAttributes ile TUTARLI)', () => {
        // variantName " -- Beden" -> split(' -- ') -> ['', 'Beden'] (index KORUNUR, filtrelenmez)
        // variant "Kırmızı -- 42" -> split -> ['Kırmızı', '42']
        // Sonuç: '' isimli segment (index 0) atlanır, 'Beden' KENDİ index'i (1) üzerinden '42' değerini alır.
        const products = [{ variantName: ' -- Beden', variant: 'Kırmızı -- 42' }];
        const result = t.extractCatalog(products);
        expect(result.options).toHaveLength(1);
        expect(result.options[0]._id).toBe('Beden');
        expect(result.options[0].values![0]).toEqual({ id: '42', title: '42' }); // DÜZELTİLDİ: artık doğru eşleşiyor
    });

    it('variantName/variant boşsa options boş kalır (variantMap\'e hiç girilmez)', () => {
        const result = t.extractCatalog([{ variantName: '', variant: '' }]);
        expect(result.options).toEqual([]);
    });
});

describe('Bizimhesap ProductTransformer.convertProducts — karakterizasyon', () => {
    const t = new ProductTransformer();

    it('boş dizi -> boş dizi', async () => {
        expect(await t.convertProducts([], undefined)).toEqual([]);
    });

    it('title boş/toUrlFriendly sonucu boşsa (maincode üretilemezse) ürün ATLANIR', async () => {
        const result = await t.convertProducts([{ title: '' }, { title: '!!!' }], undefined);
        expect(result).toEqual([]);
    });

    it('aynı maincode\'a (title\'dan türetilen) sahip iki kayıt AYNI ürüne varyant olarak eklenir, görseller birleştirilir (dedup)', async () => {
        const products = [
            { title: 'Ortak Ürün', variant: 'S', photo: JSON.stringify([{ PhotoUrl: 'a.jpg' }]) },
            { title: 'Ortak Ürün', variant: 'M', photo: JSON.stringify([{ PhotoUrl: 'a.jpg' }, { PhotoUrl: 'b.jpg' }]) },
        ];
        const result = await t.convertProducts(products, undefined);
        expect(result).toHaveLength(1);
        expect(result[0].variants).toHaveLength(2);
        expect(result[0].images.sort()).toEqual(['a.jpg', 'b.jpg']); // dedup edilmiş birleşim
    });

    it('mappingProvider yoksa (undefined) brand/category HAM p.brand/p.category olarak kalır', async () => {
        const result = await t.convertProducts([{ title: 'Ürün X', brand: 'Nike', category: 'Ayakkabı' }], undefined);
        expect(result[0].brand).toBe('Nike');
        expect(result[0].category).toBe('Ayakkabı');
    });

    it('mappingProvider.getLocalBrandId/getLocalCategoryId varsa SONUÇLARI kullanılır', async () => {
        const mappingProvider = {
            getLocalBrandId: async (b: string) => `LOCAL-${b}`,
            getLocalCategoryId: async (c: string) => `LOCAL-${c}`,
        };
        const result = await t.convertProducts([{ title: 'Ürün Y', brand: 'Nike', category: 'Ayakkabı' }], mappingProvider);
        expect(result[0].brand).toBe('LOCAL-Nike');
        expect(result[0].category).toBe('LOCAL-Ayakkabı');
    });

    it('fiyat: price*(100/(100+tax)) formülüyle KDV\'siz fiyat hesaplanır; tax 0 ise price===salePrice', () => {
        // dolaylı doğrulama convertProducts üzerinden
        return t.convertProducts([{ title: 'Fiyat Ürünü', price: 120, tax: 20 }], undefined).then((result) => {
            const v = result[0].variants[0];
            expect(v.prices.salePrice).toBe(120);
            expect(v.prices.price).toBe(100); // 120*(100/120)=100
            expect(v.taxPercentage).toBe(20);
        });
    });

    it('onSale: isActive===1 VEYA isActive===true; başka her değer false', async () => {
        const [p1] = await t.convertProducts([{ title: 'A', isActive: 1 }], undefined);
        expect(p1.variants[0].onSale).toBe(true);
        const [p2] = await t.convertProducts([{ title: 'B', isActive: true }], undefined);
        expect(p2.variants[0].onSale).toBe(true);
        const [p3] = await t.convertProducts([{ title: 'C', isActive: 0 }], undefined);
        expect(p3.variants[0].onSale).toBe(false);
        const [p4] = await t.convertProducts([{ title: 'D', isActive: '1' }], undefined); // string "1" -> false (=== ile)
        expect(p4.variants[0].onSale).toBe(false);
    });

    it('platforms[bizimhesap].mapping.categoryId/brandId HAM (mappingProvider ile YEREL ID\'YE çevrilmemiş) platform değerlerini taşır', async () => {
        const mappingProvider = { getLocalBrandId: async () => 'LOCAL-B', getLocalCategoryId: async () => 'LOCAL-C' };
        const [p] = await t.convertProducts([{ title: 'Eşleme Testi', brand: 'RAW-BRAND', category: 'RAW-CAT', id: 7 }], mappingProvider);
        expect(p.brand).toBe('LOCAL-B'); // ürün seviyesi YEREL id
        expect((p.variants[0].platforms as any).bizimhesap.mapping).toEqual({ productId: '7', id: 7, categoryId: 'RAW-CAT', brandId: 'RAW-BRAND' }); // mapping HAM platform id
    });

    it('barcode/stockcode/stock: eksikse boş string\'e/0\'a düşer, varsa String()/Number() ile zorlanır', async () => {
        const [p] = await t.convertProducts([{ title: 'Stok Ürünü', barcode: 12345, code: 999, quantity: '7' }], undefined);
        expect(p.variants[0].barcode).toBe('12345');
        expect(p.variants[0].stockcode).toBe('999');
        expect(p.variants[0].stock).toBe(7);
        const [pNone] = await t.convertProducts([{ title: 'Stoksuz Ürün' }], undefined);
        expect(pNone.variants[0].barcode).toBe('');
        expect(pNone.variants[0].stockcode).toBe('');
        expect(pNone.variants[0].stock).toBe(0);
    });

    it('uniqueId: p.uniqueId varsa AYNEN kullanılır, yoksa rastgele üretilir', async () => {
        const [pWith] = await t.convertProducts([{ title: 'UID Ürünü', uniqueId: 'SABIT-UID' }], undefined);
        expect(pWith.variants[0].uniqueId).toBe('SABIT-UID');
        const [pWithout] = await t.convertProducts([{ title: 'UID Yok' }], undefined);
        expect(typeof pWithout.variants[0].uniqueId).toBe('string');
        expect(pWithout.variants[0].uniqueId.length).toBeGreaterThan(0);
    });

    it('variantAttrs (getVariantAttributes ile): boş isimli segment eşlenmez, DİĞER isimlerin index eşlemesi BOZULMAZ (extractCatalog artık AYNI deseni kullanıyor)', async () => {
        const [p] = await t.convertProducts([{ title: 'Varyant Testi', variantName: ' -- Beden', variant: 'Kırmızı -- 42' }], undefined);
        const attrs = (p.variants[0].platforms as any).bizimhesap.attributes;
        // '' isimli segment map'e YAZILMAZ (if(name) koruması), 'Beden' KENDİ index'i (1) üzerinden '42' değerini alır
        expect(attrs).toEqual({ Beden: '42' });
    });
});

describe('Bizimhesap ProductTransformer.toInternalStatusResult — karakterizasyon', () => {
    const t = new ProductTransformer();

    it('boş/undefined girdi -> boş dizi', () => {
        expect(t.toInternalStatusResult(undefined as any)).toEqual([]);
        expect(t.toInternalStatusResult([])).toEqual([]);
    });

    it('isActive===1 veya true -> COMPLETED, mesaj yok', () => {
        expect(t.toInternalStatusResult([{ barcode: 'B1', isActive: 1 }])).toEqual([{ matchValue: 'B1', barcode: 'B1', status: 'COMPLETED', messages: [] }]);
        expect(t.toInternalStatusResult([{ barcode: 'B2', isActive: true }])).toEqual([{ matchValue: 'B2', barcode: 'B2', status: 'COMPLETED', messages: [] }]);
    });

    it('isActive değeri başka her şeyse -> FAILED, "Pasif" mesajı', () => {
        expect(t.toInternalStatusResult([{ barcode: 'B3', isActive: 0 }])).toEqual([{ matchValue: 'B3', barcode: 'B3', status: 'FAILED', messages: ['Pasif'] }]);
        expect(t.toInternalStatusResult([{ barcode: 'B4' }])).toEqual([{ matchValue: 'B4', barcode: 'B4', status: 'FAILED', messages: ['Pasif'] }]);
    });

    it('barcode yoksa boş string\'e (String coercion) düşer', () => {
        expect(t.toInternalStatusResult([{ isActive: 1 }])).toEqual([{ matchValue: '', barcode: '', status: 'COMPLETED', messages: [] }]);
    });
});

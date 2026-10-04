// Protokol 13 karakterizasyon: Hepsiburada `ProductMapper` (validate / toPlatformBatch / toInternalVariant /
// toInternalBatchResult). ADR-0016 §8.2 B-R-T4 dilimi (Hepsiburada + Pazarama transformer'ları).
import { describe, it, expect } from '@jest/globals';
import { ProductMapper } from '@integration/modules/marketplace/hepsiburada/transformers/ProductTransformer';
import { PLATFORM_PROCESS } from '@interfaces/index';

const CODE = 'hepsiburada';

function makeVariant(overrides: any = {}) {
    return {
        _id: 'v1', code: CODE, maincode: 'MAIN-1', title: 'Test', description: 'Açıklama',
        barcode: '1234567890123', stockcode: 'SKU-001', stock: 5,
        prices: { isPlatformBasedPrice: false, price: 80, salePrice: 100, marketPrice: 120 },
        images: ['https://img.example.com/1.jpg', { url: 'https://img.example.com/2.jpg' }],
        choices: [], taxPercentage: 18, onSale: true, tempId: 't1', uniqueId: 'u1',
        // [eslesme-fiyat WP5, D-PRICE-2] bilinçli güncelleme: KDV {0,1,10,20}; sessiz 20/18 varsayılanı yok (ayarsız → VALIDATION).
        product: { taxPercentage: 20 },
        choiceId: '-', choiceValueId: '-', choiceValueTitle: '-',
        platforms: {
            [CODE]: {
                prices: { salePrice: 100, marketPrice: 120 }, upload: {},
                attributes: {}, mapping: {},
            },
        },
        ...overrides,
    };
}

function staged(payload: any) {
    return { payload } as any;
}

describe('Hepsiburada ProductMapper.validate — karakterizasyon', () => {
    const m = new ProductMapper();

    it('TRANSFER modunda daha önce SENT/WAITING/COMPLETED gönderilmişse reddeder', () => {
        for (const status of ['SENT', 'WAITING', 'COMPLETED']) {
            const v = makeVariant({ platforms: { [CODE]: { prices: {}, upload: { TRANSFER: { status } }, attributes: {}, mapping: {} } } });
            expect(m.validate(v, PLATFORM_PROCESS.TRANSFER)).toEqual({ result: false, reason: 'Ürün zaten gönderilmiş.' });
        }
    });

    it('barkod eksikse "Barkod eksik." reddi (TRANSFER durumu kontrolünden SONRA kontrol edilir)', () => {
        const v = makeVariant({ barcode: '' });
        expect(m.validate(v, PLATFORM_PROCESS.TRANSFER)).toEqual({ result: false, reason: 'Barkod eksik.' });
    });

    it('salePrice <= 0 veya yoksa "Fiyat geçersiz."; platform fiyatı öncelikli, yoksa variant.prices', () => {
        // [eslesme-fiyat WP5] kanal fiyatı yalnız `isPlatformBasedPrice:true` ile esas alınır (effectiveChannelPrice; bilinçli güncelleme).
        const v = makeVariant({ prices: { isPlatformBasedPrice: true, salePrice: 50, marketPrice: 60 }, platforms: { [CODE]: { prices: { salePrice: 0 }, upload: {}, attributes: {}, mapping: {} } } });
        expect(m.validate(v, PLATFORM_PROCESS.UPDATE_STOCK)).toEqual({ result: false, reason: 'Fiyat geçersiz.' });

        const vFallback = makeVariant({ platforms: { [CODE]: { prices: undefined, upload: {}, attributes: {}, mapping: {} } }, prices: { salePrice: 50, marketPrice: 60, isPlatformBasedPrice: false, price: 40 } });
        expect(m.validate(vFallback, PLATFORM_PROCESS.UPDATE_STOCK)).toEqual({ result: true, reason: '' });
    });

    it('tüm kurallar geçerse result true, reason boş string', () => {
        expect(m.validate(makeVariant(), PLATFORM_PROCESS.UPDATE_STOCK)).toEqual({ result: true, reason: '' });
    });
});

describe('Hepsiburada ProductMapper.toPlatformBatch — karakterizasyon', () => {
    const m = new ProductMapper();
    const mapping = { catId: 100, brandId: 200, settings: { APIKEY: 'key-1' } };
    const catAttrs: any[] = [];

    it('stagedProduct.payload yoksa null döner (kırılmaz)', () => {
        expect(m.toPlatformBatch(staged(undefined), PLATFORM_PROCESS.TRANSFER, catAttrs, [], mapping)).toBeNull();
    });

    it('mutlu yol: kategori/marka/fiyat(virgüllü)/stok/görsel alanları doğru eşlenir', () => {
        const item = m.toPlatformBatch(staged(makeVariant()), PLATFORM_PROCESS.TRANSFER, catAttrs, [], mapping);
        expect(item.categoryId).toBe(100);
        expect(item.merchant).toBe('key-1');
        expect(item.attributes).toMatchObject({
            merchantSku: 'SKU-001', VaryantGroupID: 'MAIN-1', Barcode: '1234567890123',
            Marka: '200', GarantiSuresi: 24, kg: '1', tax_vat_rate: '20',
            price: '100,00', stock: '5',
            Image1: 'https://img.example.com/1.jpg', Image2: 'https://img.example.com/2.jpg',
        });
    });

    it('fiyat virgüllü string olarak biçimlenir (Math.round ile 2 ondalık, nokta -> virgül)', () => {
        const v = makeVariant({ platforms: { [CODE]: { prices: { salePrice: 99.999 }, upload: {}, attributes: {}, mapping: {} } } });
        const item = m.toPlatformBatch(staged(v), PLATFORM_PROCESS.TRANSFER, catAttrs, [], mapping);
        expect(item.attributes.price).toBe('100,00');
    });

    it('vMapping alanları (title/description/taxPercentage/desi/warranty) varsa öncelikli, yoksa variant.product\'a, o da yoksa mapping.settings/sabit varsayılana düşer', () => {
        const v = makeVariant({
            product: { title: 'Ürün Başlığı', description: 'Ürün Açıklaması', taxPercentage: 10, desi: 3, warranty: 12 },
            platforms: { [CODE]: { prices: { salePrice: 100 }, upload: {}, attributes: {}, mapping: { title: 'Mapping Başlığı' } } },
        });
        const item = m.toPlatformBatch(staged(v), PLATFORM_PROCESS.TRANSFER, catAttrs, [], mapping);
        expect(item.attributes.UrunAdi).toBe('Mapping Başlığı'); // mapping > product
        expect(item.attributes.UrunAciklamasi).toBe('Ürün Açıklaması'); // mapping'de yok -> product
        expect(item.attributes.tax_vat_rate).toBe('10');
        expect(item.attributes.kg).toBe('3');
        expect(item.attributes.GarantiSuresi).toBe(12);
    });

    it('VaryantGroupID: maincode yoksa stockcode kullanılır; merchantSku: stockcode yoksa barkod kullanılır', () => {
        const v = makeVariant({ maincode: undefined, stockcode: undefined });
        const item = m.toPlatformBatch(staged(v), PLATFORM_PROCESS.TRANSFER, catAttrs, [], mapping);
        expect(item.attributes.merchantSku).toBe('1234567890123');
        expect(item.attributes.VaryantGroupID).toBeUndefined();
    });

    it('vAttrs: attrData.attributeValueId veya attrData.id öncelikli, yoksa ham değer kullanılır', () => {
        const v = makeVariant({ platforms: { [CODE]: { prices: { salePrice: 100 }, upload: {}, mapping: {}, attributes: { A1: { attributeValueId: 'V1' }, A2: { id: 'ID2' }, A3: 'RAW3' } } } });
        const item = m.toPlatformBatch(staged(v), PLATFORM_PROCESS.TRANSFER, catAttrs, [], mapping);
        expect(item.attributes.A1).toBe('V1');
        expect(item.attributes.A2).toBe('ID2');
        expect(item.attributes.A3).toBe('RAW3');
    });

    // [eslesme-fiyat WP3, K-13 — BİLİNÇLİ DEĞİŞİKLİK] Eskiden merchant = APIKEY→USERNAME (sorgu yollarından farklı kaynak). Artık tek kaynak
    // hbMerchantId: SELLERID → MERCHANTID → APIKEY; USERNAME merchantId değildir (Basic kullanıcı adı).
    it('merchant: tek kaynak hbMerchantId (SELLERID → MERCHANTID → APIKEY); hiçbiri yoksa boş string', () => {
        const pick = (settings: any) => m.toPlatformBatch(staged(makeVariant()), PLATFORM_PROCESS.TRANSFER, catAttrs, [], { ...mapping, settings }).merchant;
        expect(pick({ SELLERID: 'uuid-1', APIKEY: 'key', USERNAME: 'user-1' })).toBe('uuid-1');
        expect(pick({ MERCHANTID: 'uuid-2', APIKEY: 'key' })).toBe('uuid-2');
        expect(pick({ APIKEY: 'key' })).toBe('key');
        expect(pick({ USERNAME: 'user-1' })).toBe('');
        expect(pick({})).toBe('');
    });
});

describe('Hepsiburada ProductMapper.toInternalVariant — karakterizasyon', () => {
    const m = new ProductMapper();

    it('platforms[code].prices.salePrice HAM (komisyon uygulanmamış) platform fiyatını taşır; üst düzey prices.salePrice de BRÜT (COM-10)', () => {
        const p = { barcode: 'B1', merchantSku: 'SKU-1', productName: 'Ürün', vatRate: 18, price: 100, listPrice: 120, hbSku: 'HB-1', status: 'Active', stockCount: 7 };
        const v = m.toInternalVariant(p, { choices: [], slicer: {} });
        // [eslesme-fiyat WP5] bilinçli: içe aktarmada kanal fiyat nesnesi yazılmaz (bayrak false), kanal fiyatı `observed`'da.
        expect(v.platforms[CODE].prices).toBeUndefined();
        expect(v.platforms[CODE].observed).toEqual({ salePrice: 100, marketPrice: 120, source: 'import' });
        expect(v.prices.salePrice).toBe(100);
        // price = 100 * (100/(100+18)) = 84.745...
        expect(v.prices.price).toBeCloseTo(84.745, 2);
        expect(v.prices.marketPrice).toBe(120);
        expect(v.stock).toBe(7);
        expect(v.onSale).toBe(true);
        expect(v.platforms[CODE].mapping).toEqual({ id: 'HB-1', categoryId: undefined, brandId: undefined });
    });

    it('status "Active" değilse onSale false; hbSku yoksa uniqueId rastgele üretilir (string)', () => {
        const p = { barcode: 'B2', productName: 'Ürün2', price: 50, status: 'Passive' };
        const v = m.toInternalVariant(p, { choices: [] });
        expect(v.onSale).toBe(false);
        expect(typeof v.uniqueId).toBe('string');
        expect(v.uniqueId.length).toBeGreaterThan(0);
    });

    it('choicesResult.slicer yoksa choiceId/choiceValueId/choiceValueTitle "-" varsayılır', () => {
        const p = { barcode: 'B3', price: 10 };
        const v = m.toInternalVariant(p, { choices: [] });
        expect(v.choiceId).toBe('-');
        expect(v.choiceValueId).toBe('-');
        expect(v.choiceValueTitle).toBe('-');
    });

    it('images yoksa boş dizi; attributes yoksa boş obje', () => {
        const p = { barcode: 'B4', price: 10 };
        const v = m.toInternalVariant(p, { choices: [] });
        expect(v.images).toEqual([]);
        expect(v.platforms[CODE].attributes).toEqual({});
    });
});

describe('Hepsiburada ProductMapper.toInternalBatchResult — karakterizasyon', () => {
    const m = new ProductMapper();

    it('data yoksa boş dizi', () => {
        expect(m.toInternalBatchResult(undefined)).toEqual([]);
    });

    it('status "Processing" -> boş dizi (henüz sonuç yok)', () => {
        expect(m.toInternalBatchResult({ status: 'Processing' })).toEqual([]);
    });

    it('status "Completed" + items doluysa: her kalem COMPLETED, matchValue Barcode/merchantSku', () => {
        const res = m.toInternalBatchResult({ status: 'Completed', items: [{ attributes: { Barcode: 'BC1' } }, { attributes: { merchantSku: 'SK2' } }] });
        expect(res).toEqual([
            { matchValue: 'BC1', barcode: 'BC1', status: 'COMPLETED', messages: ['Ürün başarıyla aktarıldı.'] },
            { matchValue: 'SK2', barcode: undefined, status: 'COMPLETED', messages: ['Ürün başarıyla aktarıldı.'] },
        ]);
    });

    it('status "Completed" ama items boşsa data.data (ürün statü) dizisine düşer', () => {
        const res = m.toInternalBatchResult({ status: 'Completed', items: [], data: [{ barcode: 'X1', productStatus: 'REJECTED', statusDescription: 'Reddedildi' }] });
        expect(res).toEqual([{ matchValue: 'X1', barcode: 'X1', status: 'FAILED', messages: ['Reddedildi'] }]);
    });

    it('data.data: REJECTED/MISSING_INFO -> FAILED; "Satışa Hazır"/MATCHED -> COMPLETED; aksi WAITING', () => {
        const res = m.toInternalBatchResult({
            data: [
                { barcode: 'A', productStatus: 'REJECTED' },
                { barcode: 'B', productStatus: 'MISSING_INFO' },
                { barcode: 'C', productStatus: 'Satışa Hazır' },
                { barcode: 'D', productStatus: 'MATCHED' },
                { barcode: 'E', productStatus: 'InReview' },
            ],
        });
        expect(res.map((r: any) => r.status)).toEqual(['FAILED', 'FAILED', 'COMPLETED', 'COMPLETED', 'WAITING']);
    });

    it('data.data mesaj birleştirme: validationResults VE taskDetails.reason BİRLİKTE (öncelik değil, EKLENİR); ikisi de yoksa statusDescription > "Statü: X"', () => {
        const withBoth = m.toInternalBatchResult({ data: [{ barcode: 'A', productStatus: 'InReview', validationResults: [{ message: 'Hatalı alan' }], taskDetails: { reason: 'ek neden' } }] });
        expect(withBoth[0].messages).toEqual(['Hatalı alan', 'ek neden']);
        const withTask = m.toInternalBatchResult({ data: [{ barcode: 'B', productStatus: 'InReview', taskDetails: { reason: 'Görev nedeni' } }] });
        expect(withTask[0].messages).toEqual(['Görev nedeni']);
        const withDesc = m.toInternalBatchResult({ data: [{ barcode: 'C', productStatus: 'InReview', statusDescription: 'Açıklama' }] });
        expect(withDesc[0].messages).toEqual(['Açıklama']);
        const withNone = m.toInternalBatchResult({ data: [{ barcode: 'D', productStatus: 'InReview' }] });
        expect(withNone[0].messages).toEqual(['Statü: InReview']);
    });

    it('data.data ve data.status "Completed" ikisi de yoksa data.errors dizisine düşer (legacy); barcode = err.sku', () => {
        const res = m.toInternalBatchResult({ errors: [{ sku: 'S1', message: 'Hata mesajı' }] });
        expect(res).toEqual([{ barcode: 'S1', status: 'FAILED', messages: ['Hata mesajı'] }]);
        const noSku = m.toInternalBatchResult({ errors: [{ message: 'Hata mesajı 2' }] });
        expect(noSku).toEqual([{ barcode: '', status: 'FAILED', messages: ['Hata mesajı 2'] }]);
    });

    it('hiçbir dizi de yoksa boş dizi döner', () => {
        expect(m.toInternalBatchResult({})).toEqual([]);
    });
});

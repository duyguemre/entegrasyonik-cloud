// Protokol 13 karakterizasyon: Pazarama `ProductMapper` (validate / toPlatformBatch / toInternalVariant /
// toInternalBatchResult / toInternalStatusResult). ADR-0016 §8.2 B-R-T4 dilimi.
import { describe, it, expect } from '@jest/globals';
import { ProductMapper } from '@integration/modules/marketplace/pazarama/transformers/ProductTransformer';
import { PLATFORM_PROCESS } from '@interfaces/index';

const CODE = 'pazarama';

function makeVariant(overrides: any = {}) {
    return {
        _id: 'v1', code: CODE, maincode: 'MAIN-1', title: 'Test', description: 'Açıklama',
        barcode: '1234567890123', stockcode: 'SKU-001', stock: 5,
        prices: { isPlatformBasedPrice: false, price: 80, salePrice: 100, marketPrice: 120 },
        images: ['https://img.example.com/1.jpg', { url: 'https://img.example.com/2.jpg' }],
        choices: [], taxPercentage: 18, onSale: true, tempId: 't1', uniqueId: 'u1',
        choiceId: '-', choiceValueId: '-', choiceValueTitle: '-',
        // `toPlatformBatch` isim/açıklama/vergi için `variant.product?.*` alanına bakar (variant.title/description
        // DEĞİL) — bkz. ProductTransformer.ts satır 53-64.
        product: { title: 'Test', description: 'Açıklama', taxPercentage: 18 },
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

describe('Pazarama ProductMapper.validate — karakterizasyon', () => {
    const m = new ProductMapper();

    it('TRANSFER modunda zaten SENT/WAITING/COMPLETED ise reddeder', () => {
        const v = makeVariant({ platforms: { [CODE]: { prices: {}, upload: { TRANSFER: { status: 'WAITING' } }, attributes: {}, mapping: {} } } });
        expect(m.validate(v, PLATFORM_PROCESS.TRANSFER)).toEqual({ result: false, reason: 'Ürün zaten gönderilmiş.' });
    });

    it('barkod eksikse reddeder', () => {
        expect(m.validate(makeVariant({ barcode: '' }), PLATFORM_PROCESS.TRANSFER)).toEqual({ result: false, reason: 'Barkod eksik.' });
    });

    it('UPDATE_STOCK modunda fiyat kontrolü ATLANIR (Hepsiburada\'dan FARKLI davranış — burada mode kontrolü var)', () => {
        const v = makeVariant({ platforms: { [CODE]: { prices: { salePrice: 0 }, upload: {}, attributes: {}, mapping: {} } } });
        expect(m.validate(v, PLATFORM_PROCESS.UPDATE_STOCK)).toEqual({ result: true, reason: '' });
    });

    it('TRANSFER modunda salePrice <=0 ise "Fiyat geçersiz."', () => {
        const v = makeVariant({ platforms: { [CODE]: { prices: { salePrice: 0 }, upload: {}, attributes: {}, mapping: {} } } });
        expect(m.validate(v, PLATFORM_PROCESS.TRANSFER)).toEqual({ result: false, reason: 'Fiyat geçersiz.' });
    });

    it('salePrice > marketPrice ise "Satış > Liste fiyatı hatası."', () => {
        const v = makeVariant({ platforms: { [CODE]: { prices: { salePrice: 150, marketPrice: 100 }, upload: {}, attributes: {}, mapping: {} } } });
        expect(m.validate(v, PLATFORM_PROCESS.TRANSFER)).toEqual({ result: false, reason: 'Satış > Liste fiyatı hatası.' });
    });

    it('TRANSFER/UPDATE_STOCK modunda stock undefined/negatifse "Stok geçersiz."', () => {
        expect(m.validate(makeVariant({ stock: -1 }), PLATFORM_PROCESS.TRANSFER)).toEqual({ result: false, reason: 'Stok geçersiz.' });
        expect(m.validate(makeVariant({ stock: undefined }), PLATFORM_PROCESS.UPDATE_STOCK)).toEqual({ result: false, reason: 'Stok geçersiz.' });
    });

    it('UPDATE modunda stok kontrolü YAPILMAZ (yalnızca TRANSFER/UPDATE_STOCK\'ta yapılır)', () => {
        expect(m.validate(makeVariant({ stock: -1 }), PLATFORM_PROCESS.UPDATE)).toEqual({ result: true, reason: '' });
    });

    it('tüm kurallar geçerse result true', () => {
        expect(m.validate(makeVariant(), PLATFORM_PROCESS.TRANSFER)).toEqual({ result: true, reason: '' });
    });
});

describe('Pazarama ProductMapper.toPlatformBatch — karakterizasyon', () => {
    const m = new ProductMapper();
    const mapping = { catId: 100, brandId: 200, settings: {} };

    it('stagedProduct.payload yoksa null döner', () => {
        expect(m.toPlatformBatch(staged(undefined), PLATFORM_PROCESS.TRANSFER, [], [], mapping)).toBeNull();
    });

    it('TRANSFER/UPDATE: tam gövde (isim/kod/fiyat/görsel/currencyType sabit TRY/desi sabit 1) üretir', () => {
        const item = m.toPlatformBatch(staged(makeVariant()), PLATFORM_PROCESS.TRANSFER, [], [], mapping);
        expect(item).toMatchObject({
            barcode: '1234567890123', name: 'Test', displayName: 'Test', description: 'Açıklama', code: '1234567890123',
            groupCode: 'MAIN-1', stockCode: 'SKU-001', brandId: '200', categoryId: '100', stockCount: 5,
            salePrice: 100, listPrice: 120, vatRate: 18, desi: 1, currencyType: 'TRY',
        });
        expect(item.images).toEqual([{ imageurl: 'https://img.example.com/1.jpg' }, { imageurl: 'https://img.example.com/2.jpg' }]);
    });

    // [BİLİNÇLİ DÜZELTME - eslesme-fiyat WP4 C-3/D-PZ-3] Eskiden UPDATE_PRICE ve UPDATE_STOCK AYNI fiyat+stok gövdesini üretip
    // fiyat ucuna gidiyordu (stok-yalnız güncelleme fiyatı da yazıyordu). Artık ayrı: fiyat {code,listPrice,salePrice}, stok {code,stockCount}.
    it('UPDATE_PRICE ve UPDATE_STOCK ayrı gövdeler üretir (isim/kategori YOK)', () => {
        const itemPrice = m.toPlatformBatch(staged(makeVariant()), PLATFORM_PROCESS.UPDATE_PRICE, [], [], mapping);
        expect(Object.keys(itemPrice).sort()).toEqual(['code', 'listPrice', 'salePrice']);
        const itemStock = m.toPlatformBatch(staged(makeVariant()), PLATFORM_PROCESS.UPDATE_STOCK, [], [], mapping);
        expect(Object.keys(itemStock).sort()).toEqual(['code', 'stockCount']);
    });

    it('diğer modlarda (örn. UPDATE_VARIANT) yalnızca { barcode } döner (else-if kapsamadığı için)', () => {
        const item = m.toPlatformBatch(staged(makeVariant()), PLATFORM_PROCESS.UPDATE_VARIANT, [], [], mapping);
        expect(item).toEqual({ barcode: '1234567890123' });
    });

    it('marketPrice: variant.marketPrice, salePrice\'tan KÜÇÜKSE salePrice\'a EŞİTLENİR (asla salePrice altına düşmez)', () => {
        const v = makeVariant({ platforms: { [CODE]: { prices: { salePrice: 100, marketPrice: 50 }, upload: {}, attributes: {}, mapping: {} } } });
        const item = m.toPlatformBatch(staged(v), PLATFORM_PROCESS.TRANSFER, [], [], mapping);
        expect(item.listPrice).toBe(100);
        expect(item.salePrice).toBe(100);
    });

    it('vatRate: vMapping.taxPercentage > product.taxPercentage > mapping.settings.taxPercentage > 20 varsayılan', () => {
        const v = makeVariant({ product: { taxPercentage: 8 }, platforms: { [CODE]: { prices: { salePrice: 100 }, upload: {}, attributes: {}, mapping: {} } } });
        expect(m.toPlatformBatch(staged(v), PLATFORM_PROCESS.TRANSFER, [], [], mapping).vatRate).toBe(8);
        const vNone = makeVariant({ product: undefined, platforms: { [CODE]: { prices: { salePrice: 100 }, upload: {}, attributes: {}, mapping: {} } } });
        expect(m.toPlatformBatch(staged(vNone), PLATFORM_PROCESS.TRANSFER, [], [], mapping).vatRate).toBe(20);
        expect(m.toPlatformBatch(staged(vNone), PLATFORM_PROCESS.TRANSFER, [], [], { ...mapping, settings: { taxPercentage: 1 } }).vatRate).toBe(1);
    });

    it('prepareAttributes: vAttrs boşsa boş dizi; attrData falsy ise null filtrelenir', () => {
        const v = makeVariant({ platforms: { [CODE]: { prices: { salePrice: 100 }, upload: {}, mapping: {}, attributes: { A1: { attributeValueId: 'V1', attributeValue: 'Kırmızı' }, A2: null } } } });
        const item = m.toPlatformBatch(staged(v), PLATFORM_PROCESS.TRANSFER, [], [], mapping);
        // [BİLİNÇLİ DÜZELTME - eslesme-fiyat WP4 C-6/D-PZ-6] tek alan: kimlik varsa yalnız attributeValueId (eskiden ikisi birlikte).
        expect(item.attributes).toEqual([{ attributeId: 'A1', attributeValueId: 'V1' }]);
    });
});

describe('Pazarama ProductMapper.toInternalVariant — karakterizasyon', () => {
    const m = new ProductMapper();

    it('platforms[code].prices HAM (komisyonsuz) kalır; üst düzey prices de BRÜT (COM-10: komisyon düşülmez)', () => {
        const p = { barcode: 'B1', stockCode: 'SKU-1', title: 'Ürün', vatRate: 18, salePrice: 100, listPrice: 120, id: 'ID-1', categoryId: 5, brandId: 6 };
        const v = m.toInternalVariant(p, { choices: [], slicer: {} });
        expect(v.platforms[CODE].prices).toEqual({ salePrice: 100, marketPrice: 120 });
        expect(v.prices.salePrice).toBe(100);
        expect(v.prices.price).toBeCloseTo(84.745, 2); // 100 * 100/118
        expect(v.platforms[CODE].mapping).toEqual({ id: 'ID-1', categoryId: 5, brandId: 6 });
        expect(v.stock).toBe(0); // p.quantity/p.stockCount yok -> 0
    });

    // [DÜZELTİLDİ, 2026-09-29, orkestratör] `onSale: p.onSale || p.active || true` ölü `|| true` sabiti taşıyordu —
    // `p.onSale`/`p.active` AÇIKÇA false verilse bile ifade HER ZAMAN truthy sonuçlanıyordu. `??` (nullish
    // coalescing) zincirine (`p.onSale ?? p.active ?? true`) getirildi: artık explicit `false` KORUNUYOR, yalnız
    // veri hiç yoksa (null/undefined) varsayılan `true`'ya düşülüyor (muhtemel orijinal niyet).
    it('[DÜZELTİLDİ] onSale: veri hiç yoksa varsayılan true; p.onSale/p.active AÇIKÇA false verilirse artık DOĞRU şekilde false döner', () => {
        const vNone = m.toInternalVariant({ barcode: 'B2' }, { choices: [] });
        expect(vNone.onSale).toBe(true); // veri yok -> varsayılan true (davranış AYNI kaldı)
        const vFalse = m.toInternalVariant({ barcode: 'B3', onSale: false, active: false }, { choices: [] });
        expect(vFalse.onSale).toBe(false); // DÜZELTİLDİ: artık explicit false korunuyor
    });

    it('attributes: getRawAttributesMap ile attributeId anahtarlı objeye çevrilir', () => {
        const p = { barcode: 'B4', attributes: [{ attributeId: 1, attributeName: 'Renk', attributeValue: 'Mavi', valueId: 9 }] };
        const v = m.toInternalVariant(p, { choices: [] });
        expect(v.platforms[CODE].attributes).toEqual({ '1': { attributeName: 'Renk', attributeValue: 'Mavi', attributeValueId: '9' } });
    });

    it('images: string[] veya {url} nesneleri karışık gelebilir, ikisi de düz string dizisine çevrilir', () => {
        const p = { barcode: 'B5', images: ['a.jpg', { url: 'b.jpg' }] };
        const v = m.toInternalVariant(p, { choices: [] });
        expect(v.images).toEqual(['a.jpg', 'b.jpg']);
    });
});

describe('Pazarama ProductMapper.toInternalBatchResult — karakterizasyon', () => {
    const m = new ProductMapper();

    it('failedProducts -> FAILED sonuçlar üretir', () => {
        const res = m.toInternalBatchResult({ failedProducts: [{ productCode: 'PC1', barcode: 'BC1', errorReason: 'Hatalı görsel' }] }, 'TRANSFER');
        expect(res).toEqual([{ matchValue: 'PC1', barcode: 'BC1', status: 'FAILED', messages: ['Hatalı görsel'] }]);
    });

    it('batchResult başarılı ürünler: TRANSFER/UPDATE -> WAITING; diğerleri -> COMPLETED', () => {
        const resTransfer = m.toInternalBatchResult({ batchResult: [{ productCode: 'PC2', status: 'SUCCESS' }] }, 'TRANSFER');
        expect(resTransfer[0].status).toBe('WAITING');
        const resStock = m.toInternalBatchResult({ batchResult: [{ productCode: 'PC3', isSuccess: true }] }, 'UPDATE_STOCK');
        expect(resStock[0].status).toBe('COMPLETED');
    });

    it('aynı productCode hem failedProducts hem batchResult\'ta varsa FAILED KAZANIR (SUCCESS eklenmez)', () => {
        const res = m.toInternalBatchResult({
            failedProducts: [{ productCode: 'DUP', errorReason: 'hata' }],
            batchResult: [{ productCode: 'DUP', status: 'SUCCESS' }],
        }, 'TRANSFER');
        expect(res).toHaveLength(1);
        expect(res[0].status).toBe('FAILED');
    });

    it('batchResult öğesi SUCCESS/isSuccess değilse sonuca EKLENMEZ (sessizce atlanır)', () => {
        const res = m.toInternalBatchResult({ batchResult: [{ productCode: 'PC4', status: 'PENDING' }] }, 'TRANSFER');
        expect(res).toEqual([]);
    });

    it('ne failedProducts ne batchResult varsa boş dizi', () => {
        expect(m.toInternalBatchResult({}, 'TRANSFER')).toEqual([]);
    });
});

describe('Pazarama ProductMapper.toInternalStatusResult — karakterizasyon', () => {
    const m = new ProductMapper();

    it('state 3 -> COMPLETED; 6 -> FAILED; 1/2/7 -> WAITING; diğer bilinmeyen -> WAITING (default değişken başlangıcı)', () => {
        const res = m.toInternalStatusResult([
            { barcode: 'A', state: 3 }, { barcode: 'B', state: 6 }, { barcode: 'C', state: 1 }, { barcode: 'D', state: 99 },
        ]);
        expect(res.map(r => r.status)).toEqual(['COMPLETED', 'FAILED', 'WAITING', 'WAITING']);
    });

    it('messages: waitingApproveExp önceliklidir, o yoksa stateDescription, o da yoksa boş dizi', () => {
        const res = m.toInternalStatusResult([
            { barcode: 'A', state: 1, waitingApproveExp: 'Onay bekliyor', stateDescription: 'görmezden gelinir' },
            { barcode: 'B', state: 1, stateDescription: 'Açıklama' },
            { barcode: 'C', state: 1 },
        ]);
        expect(res.map(r => r.messages)).toEqual([['Onay bekliyor'], ['Açıklama'], []]);
    });

    it('mapping alanı id/categoryId/brandId taşır; matchValue barcode > code', () => {
        const [r] = m.toInternalStatusResult([{ code: 'CODE-ONLY', productId: 'PID', categoryId: 5, brandId: 6, state: 3 }]);
        expect(r.matchValue).toBe('CODE-ONLY');
        expect(r.mapping).toEqual({ id: 'PID', categoryId: 5, brandId: 6 });
    });
});

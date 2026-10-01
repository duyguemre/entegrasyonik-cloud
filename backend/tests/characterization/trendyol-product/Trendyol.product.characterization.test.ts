/**
 * Karakterizasyon testi (Protokol 13) — Trendyol ÜRÜN/KATALOG adaptörü (ProductMapper, ProductService, CategoryService).
 * BACKLOG C22 (2026-09-28): Ürün V1 servisleri 15 Ekim 2026'da kapanıyor, `origin` 23 Ekim 2026'da zorunlu.
 *
 * TARİHÇE: Bu dosya (commit 9f2293e) ilk yazıldığında BUGÜNKÜ V1 davranışını sabitledi (V1 gövdeler,
 * `PUT products`, düz `content[]` çekme, batch `PARTIALLY_COMPLETED`...). V2 geçişinde ilgili assertion'lar
 * KASITLI OLARAK TERS ÇEVRİLDİ — her ters çevirme testte `[C22 2026-09-28 TERS ÇEVRİLDİ]` ile işaretlidir ve eski
 * davranış yorumda tutulur. Değişmeyen davranışlar (fiyat/stok uç noktası, doğrulama kuralları, eşleme) aynen korunur.
 * Gerçek Trendyol'a İSTEK ATILMAZ: axios taklit (`_axiosMock`); fikstürler spesifikasyondaki örnek şekillerden.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { ProductService } from '@integration/modules/marketplace/trendyol/services/ProductService';
import { CategoryService } from '@integration/modules/marketplace/trendyol/services/CategoryService';
import { ProductMapper } from '@integration/modules/marketplace/trendyol/transformers/ProductTransformer';
import { TRENDYOL_ORIGIN_REQUIRED_FROM_MS } from '@integration/modules/marketplace/trendyol/productConstants';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { nodeCache } from '@utils/decorator/cache';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { http, resetHttp } from '../stubs/_axiosMock';
import { makeParams, makeVariant, staged, CATEGORY_ATTRIBUTES_V1, V2_URLS, HOST, SELLER } from '../../helpers/trendyolProductFixtures';

const P = PLATFORM_PROCESS;
const BEFORE_DEADLINE = TRENDYOL_ORIGIN_REQUIRED_FROM_MS - 24 * 3600 * 1000;
const AFTER_DEADLINE = TRENDYOL_ORIGIN_REQUIRED_FROM_MS + 24 * 3600 * 1000;

let service: Service;
let productService: ProductService;
const build = (p = makeParams()) => { service = new Service(p); productService = new ProductService(p, service); return p; };
const getCall = (n: number) => http.get.mock.calls[n] as any[];
const postCall = (n: number) => http.post.mock.calls[n] as any[];

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
    nodeCache.flushAll();
    ProductService.resetMemoForTests();
    ProductMapper.clock = () => BEFORE_DEADLINE;
});
afterEach(() => { jest.restoreAllMocks(); ProductMapper.clock = () => Date.now(); });

const mapping = { catId: 411, brandId: 22, settings: {} as any };
// [WP9] Fixture kategorisinde 47 (Renk) ve 338 (Beden) ZORUNLU: yayına giden varyantlar ikisini de taşımalı.
const REQUIRED_ATTRS = { '47': { attributeName: 'Renk', attributeValue: 'Mavi', attributeValueId: '2' }, '338': { attributeName: 'Beden', attributeValue: 'M', attributeValueId: '7001' } };
const catAttrs = [{ _id: '47', allowCustom: true }, { _id: '338', allowCustom: false, varianter: true, slicer: true }] as any;
const freshPlatform = { trendyol: { prices: { salePrice: 100, marketPrice: 120 }, upload: {}, attributes: REQUIRED_ATTRS, mapping: { returningAddressId: 1, shipmentAddressId: 2 } } };

describe('ProductMapper.toPlatformBatch - Ürün V2 gövde şemaları', () => {
    const m = new ProductMapper();

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] TRANSFER: V2 gövdesinde currencyType/cargoCompanyId/stockUnitType YOK (V1: gönderiliyordu); lotNumber varsayılanı "1" kalktı', () => {
        const item = m.toPlatformBatch(staged(makeVariant()), P.TRANSFER, catAttrs, [], { ...mapping, settings: { shippingId: 10 } });
        expect(item).toMatchObject({
            barcode: 'BC-001', title: 'Test Ürün', description: 'Açıklama', productMainId: 'MAIN-1',
            brandId: 22, categoryId: 411, quantity: 5, stockCode: 'SKU-001', dimensionalWeight: 2,
            vatRate: 20, shipmentAddressId: 222, returningAddressId: 111, salePrice: 100, listPrice: 120,
        });
        expect(item.currencyType).toBeUndefined();
        expect(item.cargoCompanyId).toBeUndefined();
        expect(item.stockUnitType).toBeUndefined();
        expect(item.lotNumber).toBeUndefined();
        expect(item.origin).toBeUndefined(); // 23.10.2026 öncesi ve kaynak yok -> atlanır
        expect(item.images).toEqual([{ url: 'https://img.example.com/1.jpg' }, { url: 'https://img.example.com/2.jpg' }]);
        expect(item.attributes).toEqual([
            { attributeId: 47, customAttributeValue: 'Lila Grisi' },
            { attributeId: 338, attributeValueId: 7001 },
        ]);
        expect(m.toPlatformBatch(staged(makeVariant({ lotNumber: 'L-1' })), P.TRANSFER, catAttrs, [], mapping).lotNumber).toBe('L-1');
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] TRANSFER deliveryOption: yalnız {deliveryDuration} (fastDeliveryType YOK); 0=aynı gün, 1=ertesi gün; eski fastDeliveryType ayarı SAME_DAY_SHIPPING->0, diğer->1', () => {
        const none = m.toPlatformBatch(staged(makeVariant()), P.TRANSFER, catAttrs, [], mapping);
        expect(none.deliveryOption).toBeUndefined();
        const legacySame = m.toPlatformBatch(staged(makeVariant()), P.TRANSFER, catAttrs, [], { ...mapping, settings: { fastDeliveryType: 'SAME_DAY_SHIPPING' } });
        expect(legacySame.deliveryOption).toEqual({ deliveryDuration: 0 });
        const legacyFast = m.toPlatformBatch(staged(makeVariant()), P.TRANSFER, catAttrs, [], { ...mapping, settings: { fastDeliveryType: 'FAST_DELIVERY' } });
        expect(legacyFast.deliveryOption).toEqual({ deliveryDuration: 1 }); // eski sabit deliveryDuration:1 korunur
        const off = m.toPlatformBatch(staged(makeVariant()), P.TRANSFER, catAttrs, [], { ...mapping, settings: { fastDeliveryType: -1 } });
        expect(off.deliveryOption).toBeUndefined();
        const explicit0 = m.toPlatformBatch(staged(makeVariant()), P.TRANSFER, catAttrs, [], { ...mapping, settings: { deliveryDuration: 0, fastDeliveryType: 'FAST_DELIVERY' } });
        expect(explicit0.deliveryOption).toEqual({ deliveryDuration: 0 }); // açık ayar eskiyi ezer
        expect(() => m.toPlatformBatch(staged(makeVariant()), P.TRANSFER, catAttrs, [], { ...mapping, settings: { deliveryDuration: 3 } })).toThrow(/deliveryDuration/);
    });

    it('origin kaynak önceliği: platform mapping > variant > product > entegrasyon ayarı; küçük harf büyütülür; biçim 2 harf', () => {
        const withMap = makeVariant({ origin: 'DE' });
        withMap.platforms.trendyol.mapping.origin = 'us';
        expect(m.toPlatformBatch(staged(withMap), P.TRANSFER, catAttrs, [], mapping).origin).toBe('US');
        expect(m.toPlatformBatch(staged(makeVariant({ origin: 'de' })), P.TRANSFER, catAttrs, [], mapping).origin).toBe('DE');
        const prod = makeVariant(); prod.product.origin = 'IT';
        expect(m.toPlatformBatch(staged(prod), P.TRANSFER, catAttrs, [], mapping).origin).toBe('IT');
        expect(m.toPlatformBatch(staged(makeVariant()), P.TRANSFER, catAttrs, [], { ...mapping, settings: { origin: 'tr' } }).origin).toBe('TR');
        expect(() => m.toPlatformBatch(staged(makeVariant({ origin: 'TUR' })), P.TRANSFER, catAttrs, [], mapping)).toThrow(/origin/);
    });

    it('origin ZORUNLULUĞU: 23.10.2026 SONRASI kaynak yoksa TRANSFER/UPDATE(onaysız) IntegrationError(VALIDATION) ile açıkça reddedilir; UPDATE_VARIANT reddetmez', () => {
        ProductMapper.clock = () => AFTER_DEADLINE;
        for (const mode of [P.TRANSFER, P.UPDATE]) {
            try { m.toPlatformBatch(staged(makeVariant()), mode, catAttrs, [], mapping); throw new Error('fırlatmalıydı'); }
            catch (e: any) { expect(e).toMatchObject({ name: 'IntegrationError', code: 'VALIDATION', retryable: false }); expect(e.message).toMatch(/Menşe|origin/); }
        }
        expect(m.toPlatformBatch(staged(makeVariant()), P.UPDATE_VARIANT, catAttrs, [], mapping).origin).toBeUndefined();
        // kaynak varsa geçer
        expect(m.toPlatformBatch(staged(makeVariant({ origin: 'TR' })), P.TRANSFER, catAttrs, [], mapping).origin).toBe('TR');
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] UPDATE onaylı ürün (contentId): content-bulk-update gövdesi — contentId anahtarlı, barcode/productMainId/brandId/categoryId YOK, slicer/varianter öznitelikleri hariç', () => {
        const item = m.toPlatformBatch(staged(makeVariant()), P.UPDATE, catAttrs, [], { ...mapping, contentId: 5551 });
        expect(Object.keys(item).sort()).toEqual(['attributes', 'contentId', 'description', 'images', 'title']);
        expect(item.contentId).toBe(5551);
        expect(item.attributes).toEqual([{ attributeId: 47, customAttributeValue: 'Lila Grisi' }]);
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] UPDATE onaysız ürün: unapproved-bulk-update gövdesi (barkod anahtarlı; cargoCompanyId YOK; V1 PUT gövdesi terk edildi)', () => {
        const item = m.toPlatformBatch(staged(makeVariant()), P.UPDATE, catAttrs, [], { ...mapping, settings: { shippingId: 10, origin: 'TR', fastDeliveryType: 'FAST_DELIVERY' } });
        expect(item.contentId).toBeUndefined();
        expect(item.cargoCompanyId).toBeUndefined();
        expect(Object.keys(item).sort()).toEqual([
            'attributes', 'barcode', 'brandId', 'categoryId', 'deliveryOption', 'description', 'dimensionalWeight', 'images',
            'origin', 'productMainId', 'returningAddressId', 'shipmentAddressId', 'stockCode', 'title', 'vatRate',
        ]);
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] UPDATE_VARIANT: lotNumber varsayılanı yok; origin biliniyorsa gönderilir', () => {
        expect(m.toPlatformBatch(staged(makeVariant()), P.UPDATE_VARIANT, catAttrs, [], mapping)).toEqual({
            barcode: 'BC-001', vatRate: 20, stockCode: 'SKU-001', shipmentAddressId: 222, returningAddressId: 111,
            dimensionalWeight: 2, locationBasedDelivery: 'DISABLED',
        });
        expect(m.toPlatformBatch(staged(makeVariant({ origin: 'TR' })), P.UPDATE_VARIANT, catAttrs, [], mapping).origin).toBe('TR');
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] UPDATE_DELIVERY: ÇOĞUL `deliveryOptions` {deliveryDuration}; süre tanımsızsa VALIDATION (sessiz boş gövde yok)', () => {
        const item = m.toPlatformBatch(staged(makeVariant()), P.UPDATE_DELIVERY, catAttrs, [], { ...mapping, settings: { deliveryDuration: 1 } });
        expect(item).toEqual({ barcode: 'BC-001', deliveryOptions: { deliveryDuration: 1 } });
        expect(() => m.toPlatformBatch(staged(makeVariant()), P.UPDATE_DELIVERY, catAttrs, [], mapping)).toThrow(/Teslimat süresi/);
    });

    it('UPDATE_PRICE / UPDATE_STOCK: yalnızca barkod + fiyat / adet (DEĞİŞMEDİ)', () => {
        expect(m.toPlatformBatch(staged(makeVariant()), P.UPDATE_PRICE, catAttrs, [], mapping)).toEqual({ barcode: 'BC-001', salePrice: 100, listPrice: 120 });
        expect(m.toPlatformBatch(staged(makeVariant()), P.UPDATE_STOCK, catAttrs, [], mapping)).toEqual({ barcode: 'BC-001', quantity: 5 });
    });
});

describe('ProductMapper.validate ve sonuç dönüştürücüler', () => {
    const m = new ProductMapper();
    it('validate: barkod/fiyat/stok kuralları (DEĞİŞMEDİ; origin kontrolü toPlatformBatch\'te)', () => {
        expect(m.validate(makeVariant({ barcode: '' }), P.TRANSFER).result).toBe(false);
        const fresh = { trendyol: { prices: { salePrice: 100, marketPrice: 120 }, upload: {}, attributes: {}, mapping: {} } };
        expect(m.validate(makeVariant({ stock: -1, platforms: fresh }), P.TRANSFER).reason).toBe('Stok geçersiz.');
        expect(m.validate(makeVariant({ prices: { salePrice: 150, marketPrice: 120 }, platforms: { trendyol: { prices: { salePrice: 150, marketPrice: 120 }, upload: {}, attributes: {}, mapping: {} } } }), P.UPDATE_PRICE).reason)
            .toBe('Satış > Liste fiyatı hatası.');
        expect(m.validate(makeVariant(), P.TRANSFER)).toEqual({ result: false, reason: 'Ürün zaten gönderilmiş.' });
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] toInternalBatchResult: SUCCESS -> (TRANSFER: WAITING | diğer: COMPLETED); FAILED -> FAILED; BİLİNMEYEN/IN_PROGRESS -> FAILED + "belirsiz" açıklaması (asla COMPLETED değil)', () => {
        const items = [
            { requestItem: { barcode: 'A' }, status: 'SUCCESS' },
            { requestItem: { barcode: 'B' }, status: 'FAILED', failureReasons: ['x'] },
            { requestItem: { barcode: 'C' }, status: 'WEIRD' },
        ];
        const t = m.toInternalBatchResult(items, 'TRANSFER');
        expect(t.map(r => r.status)).toEqual(['WAITING', 'FAILED', 'FAILED']);
        expect(t[1].messages).toEqual(['x']);
        expect(t[2].messages[0]).toMatch(/belirsiz/);
        expect(m.toInternalBatchResult(items, 'UPDATE_STOCK').map(r => r.status)).toEqual(['COMPLETED', 'FAILED', 'FAILED']);
    });

    it('interpretBatchResponse: batch IN_PROGRESS / kalem yok / IN_PROGRESS kalem -> bekle; stok-fiyatta batch status YOK ama tüm kalemler SUCCESS/FAILED -> tamam; COMPLETED -> tamam; PARTIALLY_COMPLETED (belgede yok) hoşgörülür', () => {
        const ok = { requestItem: { barcode: 'A' }, status: 'SUCCESS' };
        const bad = { requestItem: { barcode: 'B' }, status: 'FAILED', failureReasons: ['r'] };
        expect(m.interpretBatchResponse(undefined).done).toBe(false);
        expect(m.interpretBatchResponse({ status: 'IN_PROGRESS', items: [ok] }).done).toBe(false);
        expect(m.interpretBatchResponse({ status: 'COMPLETED', items: [] }).done).toBe(false);
        expect(m.interpretBatchResponse({ items: [ok, bad] }).done).toBe(true); // stok/fiyat: batch status yok
        expect(m.interpretBatchResponse({ status: 'COMPLETED', items: [{ ...ok, status: 'IN_PROGRESS' }] }).done).toBe(false); // teslimat: kalem IN_PROGRESS
        expect(m.interpretBatchResponse({ items: [{ requestItem: { barcode: 'A' } }] }).done).toBe(false); // statüsüz kalem + batch status yok -> belirsiz
        expect(m.interpretBatchResponse({ status: 'COMPLETED', items: [ok] }).done).toBe(true);
        expect(m.interpretBatchResponse({ status: 'PARTIALLY_COMPLETED', items: [ok, bad] }).done).toBe(true);
        expect(m.interpretBatchResponse({ status: 'COMPLETED', items: [{ requestItem: { barcode: 'Z' }, status: 'WEIRD' }] }).done).toBe(true); // -> toInternalBatchResult FAILED
    });

    it('toInternalBatchResult: content-bulk-update sonucu (requestItem.contentId) -> contentBarcodes ile her barkoda ayrı sonuç', () => {
        const res = m.toInternalBatchResult([{ requestItem: { contentId: 5551 }, status: 'SUCCESS' }], 'UPDATE', new Map([['5551', ['A', 'B']]]));
        expect(res.map(r => [r.matchValue, r.status])).toEqual([['A', 'COMPLETED'], ['B', 'COMPLETED']]);
        expect(m.collectUnresolvedContentIds([{ requestItem: { contentId: 7 }, status: 'SUCCESS' }, { requestItem: { barcode: 'A' } }])).toEqual(['7']);
    });

    it('toInternalStatusResult: rejected -> FAILED, approved -> COMPLETED, aksi WAITING; contentId/productContentId ikisi de okunur', () => {
        const res = m.toInternalStatusResult([
            { barcode: 'A', approved: true, id: 1, contentId: 9, pimCategoryId: 3, brandId: 4 },
            { barcode: 'B', rejected: true, rejectReasonDetails: [{ rejectReason: 'R', rejectReasonDetail: 'D' }] },
            { barcode: 'C' },
        ]);
        expect(res.map(r => r.status)).toEqual(['COMPLETED', 'FAILED', 'WAITING']);
        expect(res[0].mapping).toMatchObject({ id: 1, productContentId: 9, pimCategoryId: 3, brandId: 4 });
        expect(res[1].messages).toEqual(['R: D']);
    });

    it('toInternalVariant: origin platform mapping\'e yazılır (V2 filtre yanıtından); contentId korunur', () => {
        const v = m.toInternalVariant({ barcode: 'A', productMainId: 'M', title: 't', salePrice: 120, listPrice: 150, vatRate: 20, quantity: 2, productContentId: 77, origin: 'TR', images: [{ url: 'u' }], attributes: [] }, { choices: [], slicer: {}, unmappedVarianters: [] });
        expect(v.platforms.trendyol.mapping.productContentId).toBe(77);
        expect((v.platforms.trendyol.mapping as any).origin).toBe('TR');
    });

    it('flattenListedProduct: onaylı V2 içerik (contentId altında variants[]) -> varyant başına düz ham kayıt; onaysız kök; V1 düz öğe hoşgörülü', () => {
        const approvedContent = {
            contentId: 5551, productMainId: 'MAIN-1', brand: { id: 22, name: 'B' }, category: { id: 411, name: 'C' }, title: 'T', description: 'D',
            images: [{ url: 'u1' }], attributes: [{ attributeId: 338, attributeName: 'Beden', attributeValueId: 7001, attributeValue: 'M' }],
            variants: [
                { variantId: 1, barcode: 'A', stock: { quantity: 3 }, price: { salePrice: 100, listPrice: 120 }, stockCode: 'S-A', origin: 'TR', vatRate: 20, onSale: true },
                { variantId: 2, barcode: 'B', stock: { quantity: 0 }, price: { salePrice: 110, listPrice: 130 }, stockCode: 'S-B', origin: 'TR', vatRate: 20 },
            ],
        };
        const flat = m.flattenListedProduct(approvedContent, true);
        expect(flat).toHaveLength(2);
        expect(flat[0]).toMatchObject({
            barcode: 'A', stockCode: 'S-A', productContentId: 5551, contentId: 5551, productMainId: 'MAIN-1', brandId: 22, pimCategoryId: 411,
            quantity: 3, salePrice: 100, listPrice: 120, origin: 'TR', vatRate: 20, approved: true, rejected: false, id: 1,
        });
        expect(flat[0].attributes).toEqual([expect.objectContaining({ attributeId: 338, attributeValue: 'M', attributeValueId: 7001 })]);
        const un = m.flattenListedProduct({ barcode: 'U', status: 'rejected', title: 'x', productMainId: 'M', rejectReasonDetails: [{ rejectReason: 'r', rejectReasonDetail: 'd' }], quantity: 1, salePrice: 5, listPrice: 6, origin: 'TR' }, false);
        expect(un[0]).toMatchObject({ barcode: 'U', approved: false, rejected: true, origin: 'TR' });
        const pending = m.flattenListedProduct({ barcode: 'P', status: 'pendingApproval' }, false);
        expect(pending[0]).toMatchObject({ approved: false, rejected: false });
        const legacy = m.flattenListedProduct({ barcode: 'L', stockCode: 'S', quantity: 2, salePrice: 9, listPrice: 10, productContentId: 3, pimCategoryId: 4, brandId: 5, approved: true }, true);
        expect(legacy[0]).toMatchObject({ barcode: 'L', quantity: 2, salePrice: 9, productContentId: 3, pimCategoryId: 4, brandId: 5, approved: true });
    });
});

describe('ProductService - gönderim (Ürün V2 uç noktaları; DB URL değeri ESKİ V1 de olsa YENİ de olsa)', () => {
    const attrHttp = () => http.get.mockResolvedValue({ data: CATEGORY_ATTRIBUTES_V1 } as never);

    for (const [label, urls] of [['ESKİ (V1) DB değerleri', undefined], ['YENİ (V2) DB değerleri', V2_URLS]] as const) {
        it(`[C22 2026-09-28 TERS ÇEVRİLDİ] transferProducts (${label}): POST {items} -> .../v2/products; V1 alanları yok; Basic auth + User-Agent; trackingId`, async () => {
            build(makeParams({ urls: urls as any, settings: { origin: 'TR' } }));
            attrHttp();
            http.post.mockResolvedValue({ data: { batchRequestId: 'B-1' } } as never);
            const v = makeVariant({ platforms: freshPlatform });
            const res = await productService.transferProducts([staged(v)]);
            const [url, body, cfg] = postCall(0);
            expect(url).toBe(`${HOST}/product/sellers/${SELLER}/v2/products`);
            expect(body.items).toHaveLength(1);
            expect(body.items[0]).toMatchObject({ barcode: 'BC-001', origin: 'TR' });
            expect(body.items[0].currencyType).toBeUndefined();
            expect(cfg.auth).toEqual({ username: 'test-key', password: 'test-secret' });
            expect(cfg.headers['User-Agent']).toBe(`${SELLER} - Entegrasyonik`);
            expect(res).toMatchObject({ trackingId: 'B-1', result: true, type: 'TRANSFER' });
            expect(res.variantList[0]).toMatchObject({ barcode: 'BC-001', trackingId: 'B-1' });
            // kategori öznitelikleri V2 yolundan
            expect(getCall(0)[0]).toBe(`${HOST}/product/categories/411/attributes`);
        });
    }

    it('transferProducts: origin eksik + 23.10.2026 sonrası -> HTTP ÇAĞRISI YOK; failedVariants nedeni tenant\'a görünür (Menşe/origin)', async () => {
        build(makeParams());
        attrHttp();
        ProductMapper.clock = () => AFTER_DEADLINE;
        const res = await productService.transferProducts([staged(makeVariant({ platforms: freshPlatform }))]);
        expect(http.post).not.toHaveBeenCalled();
        expect(res).toMatchObject({ trackingId: null, result: false });
        expect(res.failedVariants[0].reason).toMatch(/origin|Menşe/);
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] UPDATE onaylı ürün: PUT YOK; POST content-bulk-update; aynı contentId için TEK kalem; varyantlar aynı trackingId', async () => {
        build();
        attrHttp();
        http.post.mockResolvedValue({ data: { batchRequestId: 'B-2' } } as never);
        const v1 = makeVariant();
        const v2 = makeVariant({ _id: 'v2', barcode: 'BC-002' });
        const res = await productService.updateProduct([staged(v1), staged(v2)]);
        expect(http.put).not.toHaveBeenCalled();
        const [url, body] = postCall(0);
        expect(url).toBe(`${HOST}/product/sellers/${SELLER}/products/content-bulk-update`);
        expect(body.items).toHaveLength(1);
        expect(body.items[0].contentId).toBe(5551);
        expect(body.items[0].barcode).toBeUndefined();
        expect(res.variantList.map((x: any) => [x.barcode, x.trackingId])).toEqual([['BC-001', 'B-2'], ['BC-002', 'B-2']]);
    });

    it('UPDATE onaysız ürün (contentId yok): POST unapproved-bulk-update (barkod anahtarlı)', async () => {
        build(makeParams({ settings: { origin: 'TR' } }));
        attrHttp();
        http.post.mockResolvedValue({ data: { batchRequestId: 'B-3' } } as never);
        const unapproved = makeVariant({ platforms: { trendyol: { prices: { salePrice: 100, marketPrice: 120 }, upload: {}, attributes: REQUIRED_ATTRS, mapping: { returningAddressId: 1, shipmentAddressId: 2 } } } });
        await productService.updateProduct([staged(unapproved)]);
        const [url, body] = postCall(0);
        expect(url).toBe(`${HOST}/product/sellers/${SELLER}/products/unapproved-bulk-update`);
        expect(body.items[0].barcode).toBe('BC-001');
    });

    it('UPDATE karışık (onaylı + onaysız): iki ayrı istek, her varyant KENDİ trackingId\'siyle döner', async () => {
        build(makeParams({ settings: { origin: 'TR' } }));
        attrHttp();
        http.post.mockResolvedValueOnce({ data: { batchRequestId: 'B-A' } } as never).mockResolvedValueOnce({ data: { batchRequestId: 'B-U' } } as never);
        const approved = makeVariant();
        const unapproved = makeVariant({ _id: 'v9', barcode: 'BC-009', platforms: { trendyol: { prices: { salePrice: 100, marketPrice: 120 }, upload: {}, attributes: REQUIRED_ATTRS, mapping: { returningAddressId: 1, shipmentAddressId: 2 } } } });
        const res = await productService.updateProduct([staged(approved), staged(unapproved)]);
        expect(http.post).toHaveBeenCalledTimes(2);
        const byBarcode = Object.fromEntries(res.variantList.map((x: any) => [x.barcode, x.trackingId]));
        expect(byBarcode).toEqual({ 'BC-001': 'B-A', 'BC-009': 'B-U' });
    });

    it('bir parça gönderildikten sonra sonraki parça hata verirse: mükerrer gönderimi önlemek için o parçanın varyantları failedVariants; hiç gönderilmediyse hata FIRLATILIR', async () => {
        build(makeParams({ settings: { origin: 'TR' } }));
        attrHttp();
        const err = Object.assign(new Error('HTTP 400'), { response: { status: 400, data: {} } });
        const unapproved = makeVariant({ _id: 'v9', barcode: 'BC-009', platforms: { trendyol: { prices: { salePrice: 100, marketPrice: 120 }, upload: {}, attributes: REQUIRED_ATTRS, mapping: { returningAddressId: 1, shipmentAddressId: 2 } } } });
        http.post.mockResolvedValueOnce({ data: { batchRequestId: 'B-A' } } as never).mockRejectedValueOnce(err as never);
        const res = await productService.updateProduct([staged(makeVariant()), staged(unapproved)]);
        expect(res.result).toBe(true);
        expect(res.failedVariants).toHaveLength(1);
        // hiç gönderilmediyse
        resetHttp(); attrHttp();
        http.post.mockRejectedValue(err as never);
        await expect(productService.updateProduct([staged(makeVariant())])).rejects.toMatchObject({ name: 'IntegrationError', code: 'VALIDATION' });
    });

    it('istek başına <=1000 kalem: 1001 stok kalemi 2 isteğe bölünür (1000 + 1), varyantlar doğru trackingId alır', async () => {
        build();
        http.post.mockResolvedValueOnce({ data: { batchRequestId: 'S-1' } } as never).mockResolvedValueOnce({ data: { batchRequestId: 'S-2' } } as never);
        const list = Array.from({ length: 1001 }, (_, i) => staged(makeVariant({ _id: `v${i}`, barcode: `BC-${i}` })));
        const res = await productService.updateProductStock(list);
        expect(http.post).toHaveBeenCalledTimes(2);
        expect(postCall(0)[1].items).toHaveLength(1000);
        expect(postCall(1)[1].items).toHaveLength(1);
        expect(res.variantList.filter((x: any) => x.trackingId === 'S-2')).toHaveLength(1);
        expect(res.variantList).toHaveLength(1001);
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] UPDATE_DELIVERY: DB değeri ESKİ (…/delivery-bulk-update) olsa da resmi …/delivery-info-bulk-update; gövde çoğul deliveryOptions', async () => {
        build(makeParams({ settings: { deliveryDuration: 1 } }));
        http.post.mockResolvedValue({ data: { batchRequestId: 'B-4' } } as never);
        await productService.updateProductDeliveryV2([staged(makeVariant())]);
        const [url, body] = postCall(0);
        expect(url).toBe(`${HOST}/product/sellers/${SELLER}/products/delivery-info-bulk-update`);
        expect(body.items[0]).toEqual({ barcode: 'BC-001', deliveryOptions: { deliveryDuration: 1 } });
    });

    it('UPDATE_VARIANT -> variant-bulk-update; UPDATE_PRICE / UPDATE_STOCK: inventory price-and-inventory (DEĞİŞMEDİ)', async () => {
        build();
        http.post.mockResolvedValue({ data: { batchRequestId: 'B-5' } } as never);
        await productService.updateProductVariantV2([staged(makeVariant())]);
        expect(postCall(0)[0]).toBe(`${HOST}/product/sellers/${SELLER}/products/variant-bulk-update`);
        await productService.updateProductStock([staged(makeVariant())]);
        expect(postCall(1)[0]).toBe(`${HOST}/inventory/sellers/${SELLER}/products/price-and-inventory`);
        expect(postCall(1)[1].items[0]).toEqual({ barcode: 'BC-001', quantity: 5 });
    });

    it('doğrulamada elenen varyant failedVariants\'a düşer; hiç kalem yoksa HTTP çağrısı YOK; batchRequestId dönmezse başarı SAYILMAZ', async () => {
        build();
        const res = await productService.updateProductStock([staged(makeVariant({ barcode: '' }))]);
        expect(res).toMatchObject({ trackingId: null, result: false });
        expect(res.failedVariants[0].reason).toBe('Barkod eksik.');
        expect(http.post).not.toHaveBeenCalled();
        http.post.mockResolvedValue({ data: {} } as never);
        const res2 = await productService.updateProductStock([staged(makeVariant())]);
        expect(res2.result).toBe(false);
        expect(res2.failedVariants[0].reason).toMatch(/batchRequestId/);
    });

    it('eşleme bulunamazsa ("Eşleşme bulunamadı.") kalem failedVariants\'a düşer', async () => {
        build(makeParams({ mapping: { getPlatformCategoryId: async () => -1, getPlatformBrandId: async () => 1 } }));
        const res = await productService.updateProductStock([staged(makeVariant())]);
        expect(res.failedVariants[0].reason).toBe('Eşleşme bulunamadı.');
    });
});

describe('ProductService - ürün çekme / durum / batch takibi (V2)', () => {
    const approvedPage = (n: number, extra: any = {}) => ({
        data: {
            content: Array.from({ length: n }, (_, i) => ({
                contentId: 100 + i, productMainId: `M${i}`, brand: { id: 22 }, category: { id: 411 }, title: 't', images: [{ url: 'u' }],
                variants: [{ variantId: i, barcode: `A${i}`, stock: { quantity: 1 }, price: { salePrice: 10, listPrice: 12 }, stockCode: `S${i}`, origin: 'TR' }],
            })),
            ...extra,
        },
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] getProductsAndPersist: önce …/products/approved sonra …/products/unapproved; variants[] düzleştirilir; stockCode normalize edilir (V1: undefined kalıyordu)', async () => {
        build();
        http.get
            .mockResolvedValueOnce(approvedPage(2, { totalElements: 2, totalPages: 1 }) as never)
            .mockResolvedValueOnce({ data: { content: [{ barcode: 'U1', status: 'pendingApproval', productMainId: 'MU', stockCode: 'SU', categoryId: 5, brandId: 6 }], totalElements: 1, totalPages: 1 } } as never);
        const chunks: any[][] = [];
        const res = await productService.getProductsAndPersist(async c => { chunks.push(c); });
        expect(res).toMatchObject({ totalProcessed: 3, status: 'COMPLETED' });
        expect(getCall(0)[0]).toBe(`${HOST}/product/sellers/${SELLER}/products/approved`);
        expect(getCall(0)[1].params).toEqual({ page: 0, size: 100 });
        expect(getCall(1)[0]).toBe(`${HOST}/product/sellers/${SELLER}/products/unapproved`);
        expect(getCall(1)[1].params).toEqual({ page: 0, size: 1000 });
        expect(chunks[0][0]).toMatchObject({ _normalizedBarcode: 'A0', _normalizedStockCode: 'S0', _normalizedMainId: 'M0', barcode: 'A0', pimCategoryId: 411, origin: 'TR' });
        expect(chunks[1][0]).toMatchObject({ barcode: 'U1', pimCategoryId: 5, approved: false, rejected: false });
    });

    it('sayfalama: totalPages ile sayfa artırır; nextPageToken dönerse imleç token ile sürer (page gönderilmez)', async () => {
        build();
        http.get
            .mockResolvedValueOnce(approvedPage(1, { totalPages: 5, nextPageToken: 'TOK1' }) as never)
            .mockResolvedValueOnce(approvedPage(1, { totalPages: 5 }) as never) // token ile: son sayfa (token yok, totalPages 5 ama page=0 ...)
            .mockResolvedValue({ data: { content: [] } } as never);
        const res = await productService.getProductsAndPersist(async () => undefined);
        expect(getCall(1)[1].params).toEqual({ size: 100, nextPageToken: 'TOK1' });
        expect(res.status).toBe('COMPLETED');
    });

    it('10.000 pencere tavanı: token dönmeden tavana ulaşılırsa SESSİZ KESİLMEZ, status FAILED + neden', async () => {
        build();
        // size=100 -> 100. sayfada (page=99) tavan; totalPages büyük, token yok
        http.get.mockImplementation((async () => approvedPage(1, { totalPages: 1000 })) as never);
        const res = await productService.getProductsAndPersist(async () => undefined);
        expect(res.status).toBe('FAILED');
        expect(res.error).toMatch(/10000|nextPageToken/);
    }, 60000);

    it('getProductsAndPersist: hata -> {status:FAILED,error} (fırlatmaz), sayaç korunur (DEĞİŞMEDİ)', async () => {
        build();
        http.get.mockRejectedValue(Object.assign(new Error('HTTP 400'), { response: { status: 400, data: {} } }) as never);
        const res = await productService.getProductsAndPersist(async () => undefined);
        expect(res.status).toBe('FAILED');
        expect(res.totalProcessed).toBe(0);
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] checkBatchProduct: STOK/FİYAT batch\'inde batch-seviyesi status YOK (yalnız kalem) -> kalemlerden tamamlanır (V1 mantığı asla sonuçlanmıyordu); zaman aşımı params olarak DEĞİL istek zaman aşımı', async () => {
        build();
        http.get.mockResolvedValueOnce({ data: { items: [{ requestItem: { barcode: 'A' }, status: 'SUCCESS' }, { requestItem: { barcode: 'B' }, status: 'FAILED', failureReasons: ['fiyat'] }] } } as never);
        const res = await productService.checkBatchProduct({ trackingId: 'B-9', mode: P.UPDATE_STOCK });
        expect(res!.map(r => [r.matchValue, r.status])).toEqual([['A', 'COMPLETED'], ['B', 'FAILED']]);
        expect(getCall(0)[0]).toBe(`${HOST}/product/sellers/${SELLER}/products/batch-requests/B-9`);
        expect(getCall(0)[1].params).toBeUndefined(); // V1: { timeout: 15000 } sorgu parametresi olarak gidiyordu
    });

    it('checkBatchProduct: IN_PROGRESS batch / IN_PROGRESS kalem / statüsüz+belirsiz -> undefined (Sentinel bekler); bilinmeyen kalem statüsü asla COMPLETED değil', async () => {
        build();
        const ok = { requestItem: { barcode: 'A' }, status: 'SUCCESS' };
        http.get.mockResolvedValueOnce({ data: { status: 'IN_PROGRESS', items: [ok] } } as never);
        expect(await productService.checkBatchProduct({ trackingId: 'B-9', mode: P.TRANSFER })).toBeUndefined();
        http.get.mockResolvedValueOnce({ data: { status: 'COMPLETED', items: [{ ...ok, status: 'IN_PROGRESS' }] } } as never);
        expect(await productService.checkBatchProduct({ trackingId: 'B-9', mode: P.UPDATE_DELIVERY })).toBeUndefined();
        http.get.mockResolvedValueOnce({ data: { items: [{ requestItem: { barcode: 'A' } }] } } as never);
        expect(await productService.checkBatchProduct({ trackingId: 'B-9', mode: P.UPDATE_STOCK })).toBeUndefined();
        http.get.mockResolvedValueOnce({ data: { status: 'COMPLETED', items: [{ requestItem: { barcode: 'A' }, status: 'WEIRD' }] } } as never);
        const weird = await productService.checkBatchProduct({ trackingId: 'B-9', mode: P.UPDATE_STOCK });
        expect(weird![0].status).toBe('FAILED');
    });

    it('checkBatchProduct: TRANSFER SUCCESS -> WAITING (onay bekler); PARTIALLY_COMPLETED hoşgörülür', async () => {
        build();
        http.get.mockResolvedValueOnce({ data: { status: 'PARTIALLY_COMPLETED', items: [{ requestItem: { barcode: 'A' }, status: 'SUCCESS' }] } } as never);
        const res = await productService.checkBatchProduct({ trackingId: 'B-9', mode: P.TRANSFER });
        expect(res![0].status).toBe('WAITING');
    });

    it('checkBatchProduct: content-bulk-update sonucu (contentId) — bellek notundan barkoda çözülür; bellek yoksa platformdan (approved?contentId=) çözülür', async () => {
        build();
        http.get.mockResolvedValue({ data: { content: [] } } as never);
        http.post.mockResolvedValue({ data: { batchRequestId: 'B-C' } } as never);
        http.get.mockResolvedValueOnce({ data: CATEGORY_ATTRIBUTES_V1 } as never);
        await productService.updateProduct([staged(makeVariant()), staged(makeVariant({ _id: 'v2', barcode: 'BC-002' }))]);
        http.get.mockReset();
        http.get.mockResolvedValueOnce({ data: { status: 'COMPLETED', items: [{ requestItem: { contentId: 5551 }, status: 'SUCCESS' }] } } as never);
        const fromMemo = await productService.checkBatchProduct({ trackingId: 'B-C', mode: P.UPDATE });
        expect(fromMemo!.map(r => r.matchValue)).toEqual(['BC-001', 'BC-002']);
        expect(http.get).toHaveBeenCalledTimes(1);

        ProductService.resetMemoForTests();
        http.get.mockReset();
        http.get
            .mockResolvedValueOnce({ data: { status: 'COMPLETED', items: [{ requestItem: { contentId: 5551 }, status: 'FAILED', failureReasons: ['x'] }] } } as never)
            .mockResolvedValueOnce({ data: { content: [{ contentId: 5551, variants: [{ barcode: 'BC-001' }, { barcode: 'BC-002' }] }] } } as never);
        const fromPlatform = await productService.checkBatchProduct({ trackingId: 'B-C', mode: P.UPDATE });
        expect(fromPlatform!.map(r => [r.matchValue, r.status])).toEqual([['BC-001', 'FAILED'], ['BC-002', 'FAILED']]);
        expect(getCall(1)[0]).toBe(`${HOST}/product/sellers/${SELLER}/products/approved`);
        expect(getCall(1)[1].params).toMatchObject({ contentId: '5551' });
    });

    it('[C22 2026-09-28 TERS ÇEVRİLDİ] updateProductStatuses: barkodlar 50\'şer parça; önce approved (bulunan -> COMPLETED), bulunamayan için unapproved (rejected -> FAILED, pendingApproval -> WAITING); hiçbirinde yoksa sonuç dönmez', async () => {
        build();
        http.get
            .mockResolvedValueOnce({ data: { content: [{ contentId: 1, variants: [{ barcode: 'A' }] }] } } as never)
            .mockResolvedValueOnce({ data: { content: [{ barcode: 'R', status: 'rejected', rejectReasonDetails: [{ rejectReason: 'x', rejectReasonDetail: 'y' }] }, { barcode: 'P', status: 'pendingApproval' }], totalPages: 1 } } as never);
        const res = await productService.updateProductStatuses({ barcodes: ['A', 'R', 'P', 'NONE'] });
        expect(getCall(0)[0]).toBe(`${HOST}/product/sellers/${SELLER}/products/approved`);
        expect(getCall(0)[1].params).toMatchObject({ barcodes: 'A,R,P,NONE' });
        expect(getCall(1)[0]).toBe(`${HOST}/product/sellers/${SELLER}/products/unapproved`);
        const by = Object.fromEntries(res.map(r => [r.matchValue, r.status]));
        expect(by).toEqual({ A: 'COMPLETED', R: 'FAILED', P: 'WAITING' });
    });

    it('updateProductStatuses: 120 barkod -> onaylı listeye 3 istek (50+50+20); barcodes 50 sınırını aşmaz', async () => {
        build();
        http.get.mockResolvedValue({ data: { content: [] } } as never);
        const barcodes = Array.from({ length: 120 }, (_, i) => `B${i}`);
        await productService.updateProductStatuses({ barcodes });
        const approvedCalls = http.get.mock.calls.filter((c: any) => String(c[0]).endsWith('/approved'));
        expect(approvedCalls).toHaveLength(3);
        expect(approvedCalls.map((c: any) => c[1].params.barcodes.split(',').length)).toEqual([50, 50, 20]);
    });
});

describe('CategoryService - öznitelikler (V2 yolu, hoşgörülü okuma)', () => {
    it('[C22 2026-09-28 TERS ÇEVRİLDİ] fetchCategoryAttributes: DB değeri ESKİ (product-categories/<id>/attributes) olsa da product/categories/<id>/attributes çağrılır', async () => {
        const p = build();
        http.get.mockResolvedValueOnce({ data: CATEGORY_ATTRIBUTES_V1 } as never);
        const attrs = await new CategoryService(p, service).fetchCategoryAttributes('411');
        expect(getCall(0)[0]).toBe(`${HOST}/product/categories/411/attributes`);
        expect(attrs.map(a => a._id)).toEqual(['338', '47']);
        expect(attrs.find(a => a._id === '338')).toMatchObject({ varianter: true, slicer: true, allowCustom: false });
        expect(attrs.find(a => a._id === '47')?.values?.map(v => v.title)).toEqual(['Kırmızı', 'Mavi']);
    });

    it('V2 olası düz şekil (`{id,name,values:[]}`, dizi kökü) de okunur', async () => {
        const p = build();
        http.get.mockResolvedValueOnce({ data: [{ id: 1, name: 'Renk', required: true, values: [{ id: 5, name: 'Z' }, { id: 6, name: 'A' }] }] } as never);
        const attrs = await new CategoryService(p, service).fetchCategoryAttributes('9');
        expect(attrs).toHaveLength(1);
        expect(attrs[0]).toMatchObject({ _id: '1', title: 'Renk', required: true });
        expect(attrs[0].values!.map(v => v.title)).toEqual(['A', 'Z']);
    });

    it('fetchCategoryAttributeValues: gömülü değer varsa ayrı çağrı YOK; yoksa …/attributes/{attributeId}/values çağrılır', async () => {
        const p = build();
        http.get.mockResolvedValueOnce({ data: CATEGORY_ATTRIBUTES_V1 } as never);
        const vals = await new CategoryService(p, service).fetchCategoryAttributeValues('411', '338');
        expect(vals.map(v => v.id)).toEqual(['7000', '7001']);
        expect(http.get).toHaveBeenCalledTimes(1);

        nodeCache.flushAll(); resetHttp();
        http.get
            .mockResolvedValueOnce({ data: { categoryAttributes: [{ attribute: { id: 55, name: 'Marka' }, attributeValues: [] }] } } as never)
            .mockResolvedValueOnce({ data: { attributeValues: [{ id: 1, name: 'B' }, { id: 2, name: 'A' }] } } as never);
        const v2 = await new CategoryService(p, service).fetchCategoryAttributeValues('411', '55');
        expect(getCall(1)[0]).toBe(`${HOST}/product/categories/411/attributes/55/values`);
        expect(v2.map(v => v.title)).toEqual(['A', 'B']);
        // bilinmeyen öznitelik -> ayrı çağrı yok
        nodeCache.flushAll(); resetHttp();
        http.get.mockResolvedValueOnce({ data: CATEGORY_ATTRIBUTES_V1 } as never);
        expect(await new CategoryService(p, service).fetchCategoryAttributeValues('411', '99999')).toEqual([]);
        expect(http.get).toHaveBeenCalledTimes(1);
    });
});

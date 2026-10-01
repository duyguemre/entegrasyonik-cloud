/**
 * Karakterizasyon testi (Protokol 13) — Trendyol SİPARİŞ tarafının V2 geçişi ÖNCESİ (2026-09-28) davranışı.
 * Kaynak: docs/research/2026-09-28-trendyol-v2-migration-spec.md (BACKLOG C22).
 *
 * Bu dosya İLK yazıldığında BUGÜNKÜ (V1'e göre yazılmış) davranışı sabitliyordu. Kod değiştikten sonra
 * kasıtlı ters çevrilen assertion'lar `[C22 2026-09-28]` etiketiyle işaretlidir; eski değer yorumda durur.
 * Gerçek Trendyol'a İSTEK YOK: axios `jest.mock` ile taklit (tests/characterization/stubs/_axiosMock.ts).
 */
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { OrderConnector } from '@integration/modules/marketplace/trendyol/api/OrderConnector';
import { ClaimConnector } from '@integration/modules/marketplace/trendyol/api/ClaimConnector';
import { OrderMapper } from '@integration/modules/marketplace/trendyol/transformers/OrderTransformer';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { deriveDesiredAllocationBucket } from '@operations/stock/orderStatusMapping';
import { http, resetHttp } from '../stubs/_axiosMock';
import { v1Package, v2Package, page } from '../../helpers/trendyolOrderFixtures';

const mkParams = (urls: Record<string, string> = {}) => ({
    clientId: 7,
    integrationSettings: {
        settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '778899' },
        urls,
    },
});

const calledUrls = (): string[] => (http.get.mock.calls as any[]).map(c => c[0] as string);
const qs = (u: string) => new URL(u).searchParams;

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    resetHttp();
    ResilientHttpClient.resetAllState();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('OrderConnector.fetchOrdersFromPlatform — sayfalama/parametre (BUGÜNKÜ davranış)', () => {
    it('[MEVCUT] ilk istek page=0&size=50; startDate ISO -> milisaniyeye çevrilir; diğer anahtarlar aynen iletilir', async () => {
        // Saat bağımlılığı yok: Trendyol yalnız SON 1 ayı sorguladığı için bağlayıcı "şimdi"ye göre başlangıcı kırpar; sabit 'now' (2026-09-10) ile
        // 2026-09-01 her zaman pencere içinde kalır (üretim davranışı değişmedi; yalnız test saati sabitlendi). `afterEach` restoreAllMocks geri alır.
        jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-10T00:00:00.000Z'));
        http.get.mockResolvedValue(page([], { totalPages: 1 }) as never);
        const p = mkParams({ orderListUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders' });
        await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({ startDate: '2026-09-01T00:00:00.000Z', status: 'Created' });
        const q = qs(calledUrls()[0]);
        expect(q.get('page')).toBe('0');
        // [C22 2026-09-28] ESKİ: size=50 (V2 üst sınırı 200; spec §2.1)
        expect(q.get('size')).toBe('200');
        expect(q.get('startDate')).toBe(String(Date.parse('2026-09-01T00:00:00.000Z')));
        expect(q.get('status')).toBe('Created');
    });

    it('[MEVCUT] worker `lastSyncTimestamp` verir: Trendyol için startDate\'e ÇEVRİLMEZ, bilinmeyen sorgu anahtarı olarak aynen iletilir (Trendyol yok sayar -> her tur varsayılan pencere)', async () => {
        http.get.mockResolvedValue(page([], { totalPages: 1 }) as never);
        const p = mkParams({ orderListUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders' });
        await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({ lastSyncTimestamp: '2026-09-28T10:00:00.000Z' });
        const q = qs(calledUrls()[0]);
        expect(q.get('lastSyncTimestamp')).toBe('2026-09-28T10:00:00.000Z');
        expect(q.get('startDate')).toBeNull();
    });

    it('[MEVCUT] çok sayfalı yanıt: tüm sayfalar istenir ve sonuç birleştirilir ([C22] artık ARDIŞIK, Promise.all yok)', async () => {
        http.get
            .mockResolvedValueOnce(page([{ a: 1 }], { totalPages: 3 }) as never)
            .mockResolvedValueOnce(page([{ a: 2 }], { totalPages: 3 }) as never)
            .mockResolvedValueOnce(page([{ a: 3 }], { totalPages: 3 }) as never);
        const p = mkParams({ orderListUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders' });
        const out = await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({});
        expect(out).toHaveLength(3);
        expect(calledUrls().map(u => qs(u).get('page'))).toEqual(['0', '1', '2']);
    });

    it('[MEVCUT] HTTP 426 (V1 brownout) -> IntegrationError(VALIDATION), retryable=false', async () => {
        http.get.mockRejectedValue(Object.assign(new Error('HTTP 426'), { response: { status: 426, data: { message: 'Upgrade Required' } } }) as never);
        const p = mkParams({ orderListUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/orders' });
        // [C22 2026-09-28] ESKİ: code 'VALIDATION', retryable false. YENİ: brownout geçicidir -> UNAVAILABLE, retryable true.
        await expect(new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({})).rejects.toMatchObject({ name: 'IntegrationError', code: 'UNAVAILABLE', retryable: true, httpStatus: 426 });
    });
});

describe('OrderConnector — DB\'deki ESKİ orderListUrl (C22: DB değeri kod fallback\'ini ezer)', () => {
    it('[MEVCUT] ESKİ göreli değer `order/sellers/<SELLERID>/orders` OLDUĞU GİBİ kullanılır: genel fallback base api.trendyol.com/sapigw + V2\'siz yol', async () => {
        http.get.mockResolvedValue(page([]) as never);
        const p = mkParams({ orderListUrl: 'order/sellers/<SELLERID>/orders' });
        await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({});
        const u = calledUrls()[0].split('?')[0];
        // [C22 2026-09-28] ESKİ: 'https://api.trendyol.com/sapigw/order/sellers/778899/orders'
        expect(u).toBe('https://apigw.trendyol.com/integration/order/sellers/778899/v2/orders');
    });

    it('[MEVCUT] ESKİ mutlak değer `.../integration/order/sellers/<SELLERID>/orders` (V2\'siz) OLDUĞU GİBİ istenir (15.10.2026\'da kapanır)', async () => {
        http.get.mockResolvedValue(page([]) as never);
        const p = mkParams({ orderListUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/orders' });
        await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({});
        const u = calledUrls()[0].split('?')[0];
        // [C22 2026-09-28] ESKİ: '.../order/sellers/778899/orders'
        expect(u).toBe('https://apigw.trendyol.com/integration/order/sellers/778899/v2/orders');
    });
});

describe('OrderMapper.toInternalOrderPackages — V1 (eski ad) şeması', () => {
    const mapper = new OrderMapper();
    it('[MEVCUT] V1 paketi: id/line.id/merchantSku/price/zipCode okunur', () => {
        const [pkg] = mapper.toInternalOrderPackages([v1Package()]);
        expect(pkg.order.externalOrderId).toBe('900001');
        const it0 = pkg.order.items[0];
        expect(it0.externalLineItemId).toBe('7001');
        expect(it0.sku).toBe('SKU-A');
        expect(it0.unitPrice).toBe(50);
        expect(it0.totalPrice).toBe(100);
        // [C22 2026-09-28] ESKİ: taxRate 0 (vatBaseAmount okunmuyordu). V2 tablosu: vatBaseAmount -> vatRate.
        expect(it0.taxRate).toBe(20);
        expect(pkg.order.shippingAddress.postalCode).toBe('34000');
    });

    it('[MEVCUT] V1 finansal alanları: subTotal=totalPrice, grandTotal=grossAmount (ÇAPRAZ eski fallback)', () => {
        const [pkg] = mapper.toInternalOrderPackages([v1Package()]);
        // [C22 2026-09-28] ESKİ: subTotal 100 (totalPrice), grandTotal 120 (grossAmount) — yeniden adlandırma tablosuna göre ters.
        expect(pkg.order.financials.subTotal).toBe(120);
        expect(pkg.order.financials.grandTotal).toBe(100);
    });
});

describe('OrderMapper.toInternalOrderPackages — V2 (yeni ad) şeması', () => {
    const mapper = new OrderMapper();
    it('[MEVCUT] V2 satırında `line.id` yok -> externalLineItemId/externalItemId "undefined" ÜRETİLİYORDU (spec R9)', () => {
        const out = mapper.toInternalOrderPackages([v2Package()]);
        // [C22 2026-09-28] ESKİ: '"undefined"' / '"undefined"'
        expect(out[0].order.items[0].externalLineItemId).toBe('8001');
        expect(out[0].order.items[0].externalItemId).toBe('8001');
    });

    it('[MEVCUT] V2: lineUnitPrice okunuyordu; lineItemPrice satır kökünde yok -> totalPrice 0 çıkıyordu; postalCode/company okunmuyordu', () => {
        const [pkg] = mapper.toInternalOrderPackages([v2Package()]);
        expect(pkg.order.items[0].unitPrice).toBe(50);
        expect(pkg.order.items[0].sku).toBe('SKU-B');
        // [C22 2026-09-28] ESKİ: totalPrice 0, postalCode '', companyName ''
        expect(pkg.order.items[0].totalPrice).toBe(100);
        expect(pkg.order.shippingAddress.postalCode).toBe('06000');
        expect(pkg.order.shippingAddress.companyName).toBe('Yeni Ltd.');
        expect(pkg.order.items[0].taxRate).toBe(20); // vatRate zaten okunuyordu
    });

    it('[MEVCUT] V2 paket finansalı doğru okunur (packageGrossAmount/packageTotalPrice)', () => {
        const [pkg] = mapper.toInternalOrderPackages([v2Package()]);
        expect(pkg.order.financials.subTotal).toBe(120);
        expect(pkg.order.financials.grandTotal).toBe(100);
        expect(pkg.order.financials.totalDiscount).toBe(20);
        expect(pkg.order.externalOrderId).toBe('900002');
        expect(pkg.order.meta?.packageId).toBe(900002);
    });
});

describe('OrderMapper.mapStatus — statü eşleme (BUGÜNKÜ davranış)', () => {
    const mapper = new OrderMapper();
    const internal = (status: string) => mapper.toInternalOrderPackages([v1Package({ status })])[0].order.internalStatus;

    it.each([
        ['Created', 'UNAPPROVED'], ['Picking', 'APPROVED'], ['Invoiced', 'APPROVED'], ['Shipped', 'SHIPPED'],
        ['Delivered', 'DELIVERED'], ['Cancelled', 'CANCELLED'], ['Unsupplied', 'CANCELLED'], ['Returned', 'RETURNED'],
    ])('[MEVCUT] %s -> %s', (raw, expected) => { expect(internal(raw)).toBe(expected); });

    it('[MEVCUT] spec\'in 5 yeni statüsü sessizce UNAPPROVED\'a düşüyordu (C20 c)', () => {
        // [C22 2026-09-28] ESKİ: hepsi 'UNAPPROVED'. Yeni: AtCollectionPoint/UnDelivered SHIPPED; Awaiting/Verified/UnPacked UNAPPROVED (bayraklı).
        expect(internal('AtCollectionPoint')).toBe('SHIPPED');
        expect(internal('UnDelivered')).toBe('SHIPPED');
        expect(internal('Awaiting')).toBe('UNAPPROVED');
        expect(internal('Verified')).toBe('UNAPPROVED');
        expect(internal('UnPacked')).toBe('UNAPPROVED');
    });

    it('[MEVCUT] resmi yazım "UnSupplied" (büyük S) tanınmıyordu -> UNAPPROVED (iptal edilmiş paket "onay bekliyor" görünürdü)', () => {
        // [C22 2026-09-28] ESKİ: 'UNAPPROVED'
        expect(internal('UnSupplied')).toBe('CANCELLED');
    });
});

describe('orderStatusMapping (ADR-0004 kovaları) — Trendyol yeni statüler', () => {
    it('[MEVCUT] tabloda olmayan yeni statüler internalStatus yedeğiyle (UNAPPROVED->RESERVED) RESERVED kovasına DÜŞÜYORDU', () => {
        // [C22 2026-09-28] ESKİ: hepsi 'RESERVED' (yedek katman). Yeni: açık tablo; UnPacked null (atlanır).
        expect(deriveDesiredAllocationBucket('trendyol', 'AtCollectionPoint', 'SHIPPED')).toBe('COMMITTED');
        expect(deriveDesiredAllocationBucket('trendyol', 'UnDelivered', 'SHIPPED')).toBe('COMMITTED');
        expect(deriveDesiredAllocationBucket('trendyol', 'Awaiting', 'UNAPPROVED')).toBe('RESERVED');
        expect(deriveDesiredAllocationBucket('trendyol', 'Verified', 'UNAPPROVED')).toBe('RESERVED');
        expect(deriveDesiredAllocationBucket('trendyol', 'UnPacked', 'UNAPPROVED')).toBeNull();
        expect(deriveDesiredAllocationBucket('trendyol', 'UnSupplied', 'CANCELLED')).toBe('RELEASED');
    });
});

describe('Fatura linki / iade onayı gövdeleri (BUGÜNKÜ davranış)', () => {
    it('[MEVCUT] sendOrderInvoice gövdesi {orderNumber, invoiceLink} idi', async () => {
        http.post.mockResolvedValue({ status: 201, data: {} } as never);
        const p = mkParams();
        await new OrderConnector(new Service(p), p).sendOrderInvoice({ orderId: '900001', invoiceNumber: 'INV1', pdfUrl: 'https://example.invalid/i.pdf' } as any);
        const body = (http.post.mock.calls[0] as any[])[1];
        // [C22 2026-09-28] ESKİ: { orderNumber: '900001', invoiceLink: '...' }
        expect(body).toEqual({ invoiceLink: 'https://example.invalid/i.pdf', shipmentPackageId: 900001, invoiceNumber: 'INV1' });
    });

    it('[MEVCUT] ClaimConnector.approveClaim gövdesi boş {} idi', async () => {
        http.put.mockResolvedValue({ status: 200, data: {} } as never);
        const p = mkParams({ claimApproveUrl: 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/claims/<CLAIMID>/items/approve' });
        await new ClaimConnector(new Service(p), p).approveClaim('C-1', { claimItemIdList: ['i1', 'i2'] } as any);
        const body = (http.put.mock.calls[0] as any[])[1];
        // [C22 2026-09-28] ESKİ: {}
        expect(body).toEqual({ claimLineItemIdList: ['i1', 'i2'], params: {} });
    });
});

describe('Service — genel fallback base (relative URL, urls.baseUrl yok)', () => {
    it('[MEVCUT] göreli yol api.trendyol.com/sapigw tabanına gidiyordu', async () => {
        http.get.mockResolvedValue({ data: {} } as never);
        const p = mkParams();
        await new Service(p).get('order/sellers/1/x');
        // [C22 2026-09-28] ESKİ: 'https://api.trendyol.com/sapigw/order/sellers/1/x'
        expect(calledUrls()[0]).toBe('https://apigw.trendyol.com/integration/order/sellers/1/x');
    });
});

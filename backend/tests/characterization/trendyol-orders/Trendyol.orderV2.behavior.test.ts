/**
 * Trendyol SİPARİŞ V2 (BACKLOG C22) — YENİ davranış testleri: URL güvenlik ağı, pencere/sayfa/oran kuralları,
 * hoşgörülü şema okuma, statü kararları. Fikstürler spec alan adlarına dayalıdır (tests/helpers/trendyolOrderFixtures.ts).
 * Gerçek Trendyol'a İSTEK YOK (axios taklit).
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('axios', () => require('../stubs/_axiosMock').axiosModuleFactory());

import Service from '@integration/modules/marketplace/trendyol/services/Service';
import { OrderConnector } from '@integration/modules/marketplace/trendyol/api/OrderConnector';
import { OrderMapper } from '@integration/modules/marketplace/trendyol/transformers/OrderTransformer';
import { normalizeTrendyolOrderListUrl, isLegacyOrderListUrl } from '@integration/modules/marketplace/trendyol/urlSafetyNet';
import { TRENDYOL_ORDER_V2, orderListPacer, trendyolGlobalRatePerMin, trendyolOrderListRatePerMin } from '@integration/modules/marketplace/trendyol/limits';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { setUnknownEnumSink, resetUnknownEnumState, redactEnumValue, reportUnknownEnum } from '@integration/modules/common/contract/reportUnknownEnum';
import { http, resetHttp } from '../stubs/_axiosMock';
import { v1Package, v2Package, page } from '../../helpers/trendyolOrderFixtures';

const V2_URL = 'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders';
const mkParams = (urls: Record<string, string> = { orderListUrl: V2_URL }) => ({
    clientId: 7,
    integrationSettings: { settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '778899' }, urls },
});
const urls = (): string[] => (http.get.mock.calls as any[]).map(c => c[0] as string);
const qs = (u: string) => new URL(u).searchParams;
const fetchOrders = (query: any = {}, p = mkParams()) => new OrderConnector(new Service(p), p).fetchOrdersFromPlatform(query);

beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    cap = captureLogs();
    resetHttp();
    ResilientHttpClient.resetAllState();
    orderListPacer.reset();
    resetUnknownEnumState();
});
afterEach(() => { jest.restoreAllMocks(); delete process.env.TY_MOCK_MODE; delete process.env.TY_ORDER_LIST_RATE_PER_MIN; delete process.env.TY_RATE_PER_MIN; });

describe('urlSafetyNet.normalizeTrendyolOrderListUrl (eski değer tespiti)', () => {
    it.each([
        ['order/sellers/<SELLERID>/orders', 'order/sellers/<SELLERID>/v2/orders', 'relative-v1'],
        ['/order/sellers/<SELLERID>/orders', '/order/sellers/<SELLERID>/v2/orders', 'relative-v1'],
        ['https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/orders', V2_URL, 'integration-v1'],
        ['https://stageapigw.trendyol.com/integration/order/sellers/<SELLERID>/orders', 'https://stageapigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders', 'integration-v1'],
        ['https://api.trendyol.com/sapigw/sellers/<SELLERID>/orders', V2_URL, 'sapigw-v1'],
        ['https://api.trendyol.com/sapigw/suppliers/<SELLERID>/orders', V2_URL, 'sapigw-v1'],
        ['https://stageapi.trendyol.com/sapigw/suppliers/<SELLERID>/orders', 'https://stageapigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders', 'sapigw-v1'],
        ['https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/orders/', V2_URL, 'integration-v1'],
    ])('%s -> V2', (from, to, kind) => {
        const r = normalizeTrendyolOrderListUrl(from);
        expect(r).toMatchObject({ url: to, changed: true, kind });
        expect(isLegacyOrderListUrl(from)).toBe(true);
    });

    it('İDEMPOTENT: V2 değer ve göreli V2 değer değişmez', () => {
        for (const v of [V2_URL, 'order/sellers/<SELLERID>/v2/orders']) {
            expect(normalizeTrendyolOrderListUrl(v)).toMatchObject({ url: v, changed: false, kind: 'v2' });
        }
        const once = normalizeTrendyolOrderListUrl('order/sellers/<SELLERID>/orders').url;
        expect(normalizeTrendyolOrderListUrl(once).changed).toBe(false);
    });

    it('bilinmeyen host (yerel mock/özel proxy) ve tanınmayan yollar OLDUĞU GİBİ kalır', () => {
        for (const v of [
            'http://127.0.0.1:3005/sapigw/suppliers/<SELLERID>/orders',
            'https://proxy.example.invalid/integration/order/sellers/<SELLERID>/orders',
            'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/orders/custom',
            'https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/shipment-packages',
            '', 'bir-sey',
        ]) {
            expect(normalizeTrendyolOrderListUrl(v)).toMatchObject({ url: v, changed: false });
        }
        expect(normalizeTrendyolOrderListUrl(undefined)).toMatchObject({ changed: false });
    });

    it('sorgu dizesi çıktıya KORUNUR ama not (log metni) sorgu dizesi/sır İÇERMEZ', () => {
        const r = normalizeTrendyolOrderListUrl('https://api.trendyol.com/sapigw/suppliers/<SELLERID>/orders?token=GIZLI123');
        expect(r.url).toBe('https://apigw.trendyol.com/integration/order/sellers/<SELLERID>/v2/orders?token=GIZLI123');
        expect(r.note).toBeDefined();
        expect(r.note).not.toMatch(/GIZLI123|token|\?/);
    });
});

describe('OrderConnector — ESKİ DB değeri güvenlik ağı + uyarı logu', () => {
    it('eski değer V2 istenir ve uyarı YALNIZCA host+yol şablonu içerir (sorgu/sır yok), süreçte bir kez basılır', async () => {
        http.get.mockResolvedValue(page([]) as never);
        const p = { ...mkParams({ orderListUrl: 'https://api.trendyol.com/sapigw/suppliers/<SELLERID>/orders' }), clientId: 991 };
        await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({});
        await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({});
        expect(urls()[0].split('?')[0]).toBe('https://apigw.trendyol.com/integration/order/sellers/778899/v2/orders');
        const msgs = cap.filter((l) => l.level === 'warn' && String(l.msg).includes('ESKİ (V2\'siz)')).map((l) => String(l.msg));
        expect(msgs).toHaveLength(1);
        expect(msgs[0]).not.toMatch(/APIKEY|APISECRET|k:s|\?/);
    });

    it('yerel mock modunda (TY_MOCK_MODE=true) dokunulmaz: mockserver /v2/orders sunmuyor (C15/C20)', async () => {
        process.env.TY_MOCK_MODE = 'true';
        process.env.TY_MOCKABLE_ENDPOINTS = 'order';
        http.get.mockResolvedValue(page([]) as never);
        const p = { ...mkParams({ orderListUrl: 'order/sellers/<SELLERID>/orders' }), clientId: 992 };
        await new OrderConnector(new Service(p), p).fetchOrdersFromPlatform({});
        expect(urls()[0].split('?')[0]).toMatch(/order\/sellers\/778899\/orders$/);
        delete process.env.TY_MOCKABLE_ENDPOINTS;
    });
});

describe('OrderConnector — V2 pencere/sayfa/oran kuralları', () => {
    it('sayfalar ARDIŞIK çekilir (bir önceki tamamlanmadan sonraki başlamaz)', async () => {
        let inFlight = 0; let maxInFlight = 0;
        http.get.mockImplementation((async () => {
            inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise(r => setTimeout(r, 5));
            inFlight--;
            return page([{ shipmentPackageId: Math.random() }], { totalPages: 4, totalElements: 800 });
        }) as never);
        await fetchOrders({});
        expect(urls().map(u => qs(u).get('page'))).toEqual(['0', '1', '2', '3']);
        expect(maxInFlight).toBe(1);
    });

    it('tarih aralığı > 14 gün => <=14 günlük ardışık pencerelere bölünür; kapsama tam, aralık üst sınırı aşılmaz', async () => {
        http.get.mockResolvedValue(page([]) as never);
        // [WP5] Yalnız son 1 ay sorgulanabildiği için fikstür artık "şimdi"ye göredir (eski sabit 2026-09-28 tarihi kırpılırdı).
        const end = Date.now(); const start = end - 29.5 * 24 * 3600 * 1000;
        await fetchOrders({ startDate: start, endDate: end });
        const wins = urls().map(u => ({ s: Number(qs(u).get('startDate')), e: Number(qs(u).get('endDate')) }));
        expect(wins.length).toBe(3);
        expect(wins[0].s).toBe(start);
        expect(wins[wins.length - 1].e).toBe(end);
        for (const w of wins) expect(w.e - w.s).toBeLessThanOrEqual(14 * 24 * 3600 * 1000);
        for (let i = 1; i < wins.length; i++) expect(wins[i].s).toBe(wins[i - 1].e + 1);
    });

    it('yalnız startDate verilirse endDate=şimdi; yalnız endDate verilirse startDate=endDate-<14 gün', async () => {
        http.get.mockResolvedValue(page([]) as never);
        const now = Date.now();
        await fetchOrders({ startDate: now - 3600_000 });
        expect(Number(qs(urls()[0]).get('endDate'))).toBeGreaterThanOrEqual(now);
        resetHttp(); http.get.mockResolvedValue(page([]) as never);
        await fetchOrders({ endDate: now });
        const q = qs(urls()[0]);
        expect(Number(q.get('endDate')) - Number(q.get('startDate'))).toBe(TRENDYOL_ORDER_V2.maxWindowMs);
    });

    it('tarihsiz sorguda startDate/endDate GÖNDERİLMEZ (sunucu varsayılanı son 1 hafta); size=200', async () => {
        http.get.mockResolvedValue(page([]) as never);
        await fetchOrders({ status: 'Created' });
        const q = qs(urls()[0]);
        expect(q.get('startDate')).toBeNull();
        expect(q.get('size')).toBe('200');
        expect(q.get('status')).toBe('Created');
    });

    it('totalElements > 10000 => pencere ikiye bölünür ve iki yarı çekilir, sonuç birleşir (taşan sorgunun sayfaları çekilmez)', async () => {
        const end = Date.UTC(2026, 8, 28); const start = end - 10 * 24 * 3600 * 1000;
        http.get.mockImplementation(((u: string) => {
            const q = qs(u); const w = Number(q.get('endDate')) - Number(q.get('startDate'));
            if (w > 6 * 24 * 3600 * 1000) return Promise.resolve(page([{ shipmentPackageId: 'BIG' }], { totalPages: 51, totalElements: 10500 }));
            return Promise.resolve(page([{ shipmentPackageId: `P${q.get('startDate')}` }], { totalPages: 1, totalElements: 1 }));
        }) as never);
        const out = await fetchOrders({ startDate: start, endDate: end });
        expect(out).toHaveLength(2);
        expect(out.some((o: any) => o.shipmentPackageId === 'BIG')).toBe(false);
        const pages = urls().map(u => qs(u).get('page'));
        expect(pages.every(p => p === '0')).toBe(true); // hiçbir taşan sorgunun 1+ sayfası istenmedi
        expect(urls()).toHaveLength(3);
    });

    it('tarihsiz sorgu taşarsa son 1 hafta açık pencereye çevrilip bölünür', async () => {
        http.get.mockImplementation(((u: string) => {
            const q = qs(u);
            if (q.get('startDate') === null) return Promise.resolve(page([], { totalPages: 60, totalElements: 12000 }));
            return Promise.resolve(page([{ shipmentPackageId: q.get('startDate') }], { totalPages: 1, totalElements: 1 }));
        }) as never);
        const out = await fetchOrders({});
        expect(out).toHaveLength(2);
        expect(qs(urls()[1]).get('startDate')).not.toBeNull();
    });

    it('bölünemeyecek kadar dar pencerede hâlâ >10000 ise IntegrationError(VALIDATION, ORDER_WINDOW_OVERFLOW) (sessiz kesme yok)', async () => {
        http.get.mockResolvedValue(page([], { totalPages: 60, totalElements: 12000 }) as never);
        const end = Date.now();
        await expect(fetchOrders({ startDate: end - 30_000, endDate: end })).rejects.toMatchObject({ code: 'VALIDATION', platformCode: 'ORDER_WINDOW_OVERFLOW' });
    });

    it('totalPages > 50 (sayfa indeksi 49 sınırı) da taşma sayılır', async () => {
        const end = Date.UTC(2026, 8, 28);
        http.get.mockImplementation(((u: string) => {
            const w = Number(qs(u).get('endDate')) - Number(qs(u).get('startDate'));
            return Promise.resolve(w > 3 * 24 * 3600 * 1000 ? page([], { totalPages: 80, totalElements: 4000 }) : page([{ shipmentPackageId: qs(u).get('startDate') }]));
        }) as never);
        const out = await fetchOrders({ startDate: end - 5 * 24 * 3600 * 1000, endDate: end });
        expect(out.length).toBeGreaterThanOrEqual(2);
        for (const u of urls()) expect(Number(qs(u).get('page'))).toBeLessThanOrEqual(TRENDYOL_ORDER_V2.maxPageIndex);
    });

    it('pencere sınırında/sayfalar arasında tekrar eden paket tekilleştirilir (son görülen kazanır)', async () => {
        http.get
            .mockResolvedValueOnce(page([{ shipmentPackageId: 1, status: 'Created' }], { totalPages: 2, totalElements: 2 }) as never)
            .mockResolvedValueOnce(page([{ shipmentPackageId: 1, status: 'Picking' }, { shipmentPackageId: 2 }], { totalPages: 2, totalElements: 2 }) as never);
        const out = await fetchOrders({});
        expect(out).toHaveLength(2);
        expect(out.find((o: any) => o.shipmentPackageId === 1).status).toBe('Picking');
    });

    it('endDate < startDate => IntegrationError(VALIDATION); geçersiz tarih de VALIDATION', async () => {
        await expect(fetchOrders({ startDate: 2000, endDate: 1000 })).rejects.toMatchObject({ code: 'VALIDATION' });
        await expect(fetchOrders({ startDate: 'bu-bir-tarih-degil' })).rejects.toMatchObject({ code: 'VALIDATION' });
        expect(http.get).not.toHaveBeenCalled();
    });

    it('çağıranın page/size değeri YOK sayılır (200/0 sabit yönetilir)', async () => {
        http.get.mockResolvedValue(page([]) as never);
        await fetchOrders({ page: 7, size: 999 });
        const q = qs(urls()[0]);
        expect(q.get('page')).toBe('0'); expect(q.get('size')).toBe('200');
    });

    it('oran limiti: satıcı başına sayfa çekimleri en az 60000/ratePerMin ms arayla yapılır', async () => {
        ResilientHttpClient.setTestDelayScale(1);
        try {
            process.env.TY_ORDER_LIST_RATE_PER_MIN = '600'; // 100 ms
            http.get.mockResolvedValue(page([{ shipmentPackageId: 1 }], { totalPages: 3, totalElements: 3 }) as never);
            const t0 = Date.now();
            await fetchOrders({});
            expect(Date.now() - t0).toBeGreaterThanOrEqual(180); // 3 istek => >= 2 aralık
        } finally { ResilientHttpClient.setTestDelayScale(0.001); }
    });

    it('ayarlanabilir sabitler: varsayılanlar 200 (genel) / 30 (sipariş); env override; geçersiz değer varsayılana düşer', () => {
        expect(trendyolGlobalRatePerMin()).toBe(200);
        expect(trendyolOrderListRatePerMin()).toBe(30);
        process.env.TY_RATE_PER_MIN = '350'; process.env.TY_ORDER_LIST_RATE_PER_MIN = '50';
        expect(trendyolGlobalRatePerMin()).toBe(350); expect(trendyolOrderListRatePerMin()).toBe(50);
        process.env.TY_RATE_PER_MIN = '-1'; process.env.TY_ORDER_LIST_RATE_PER_MIN = 'abc';
        expect(trendyolGlobalRatePerMin()).toBe(200); expect(trendyolOrderListRatePerMin()).toBe(30);
    });
});

describe('OrderMapper — hoşgörülü V2 okuma + kritik alan denetimi', () => {
    const mapper = () => new OrderMapper(7);

    it('V2 satırı: lineId/stockCode/lineUnitPrice/vatRate okunur; "undefined" kimlik ÜRETİLMEZ', () => {
        const [pkg] = mapper().toInternalOrderPackages([v2Package()]);
        const item = pkg.order.items[0];
        expect(item.externalLineItemId).toBe('8001');
        expect(item.sku).toBe('SKU-B');
        expect(item.unitPrice).toBe(50);
        expect(item.totalPrice).toBe(100);
        expect(item.discountAmount).toBe(10);
        expect(JSON.stringify(pkg.order)).not.toContain('"undefined"');
        expect(pkg.order.billingAddress.companyName).toBe('Yeni Ltd.');
        expect(pkg.order.billingAddress.postalCode).toBe('06001');
    });

    it('yeni ad ESKİ adın önüne geçer (ikisi birlikte gelirse)', () => {
        const line = { ...v1Package().lines[0], lineId: 1, id: 2, stockCode: 'NEW', merchantSku: 'OLD', lineUnitPrice: 9, price: 5 };
        const [pkg] = mapper().toInternalOrderPackages([v1Package({ lines: [line], shipmentPackageId: 11, id: 12 })]);
        expect(pkg.order.items[0]).toMatchObject({ externalLineItemId: '1', sku: 'NEW', unitPrice: 9 });
        expect(pkg.order.externalOrderId).toBe('11');
    });

    it('lineItemPrice varsa o kullanılır; 0 geçerli değerdir', () => {
        const line = { ...v2Package().lines[0], lineItemPrice: 0 };
        const [pkg] = mapper().toInternalOrderPackages([v2Package({ lines: [line] })]);
        expect(pkg.order.items[0].totalPrice).toBe(0);
    });

    it('satır kimliği eksik kayıt ATLANIR (diğerleri işlenir), lastSkipped PII içermez', () => {
        const bad = v2Package({ shipmentPackageId: 5, lines: [{ quantity: 1, barcode: 'x' }] });
        const out = mapper().toInternalOrderPackages([bad, v2Package(), v2Package({ shipmentPackageId: 901 }), v2Package({ shipmentPackageId: 902 })]);
        expect(out).toHaveLength(3);
        const m = mapper(); m.toInternalOrderPackages([bad, v2Package(), v2Package({ shipmentPackageId: 901 })]);
        expect(m.lastSkipped).toEqual([{ ref: 'package=5', reason: 'MISSING_LINE_ID' }]);
    });

    it('TÜM kayıtlar (>=3) kimliksiz ise şema kayması: IntegrationError(VALIDATION, ORDER_SCHEMA_DRIFT)', () => {
        const noLine = () => v2Package({ lines: [{ quantity: 1 }] });
        expect(() => mapper().toInternalOrderPackages([noLine(), noLine(), noLine()]))
            .toThrow(expect.objectContaining({ name: 'IntegrationError', code: 'VALIDATION', platformCode: 'ORDER_SCHEMA_DRIFT' }));
        // 2 kayıt: eşik altı -> atlanır, hata yok
        expect(mapper().toInternalOrderPackages([noLine(), noLine()])).toEqual([]);
    });

    it('paket kimliği hiç yoksa (id/shipmentPackageId/_id/packageId/orderNumber) kayıt atlanır', () => {
        const p = v2Package(); delete p.shipmentPackageId; delete p.orderNumber;
        const m = mapper();
        expect(m.toInternalOrderPackages([p, v2Package()])).toHaveLength(1);
        expect(m.lastSkipped[0].reason).toBe('MISSING_ORDER_ID');
    });

    it('meta.packageId eski V1 `id`den de doldurulur', () => {
        const p = v1Package(); delete p.shipmentPackageId;
        expect(mapper().toInternalOrderPackages([p])[0].order.meta?.packageId).toBe(900001);
    });
});

describe('OrderMapper — statü kararları (Awaiting/Verified/AtCollectionPoint/UnDelivered/UnPacked + bilinmeyen)', () => {
    const run = (status: string) => new OrderMapper(7).toInternalOrderPackages([v2Package({ status })])[0].order;

    it('Awaiting/Verified: UNAPPROVED (aksiyon açılmaz) + meta.statusFlag=paymentPending; externalStatus korunur', () => {
        for (const s of ['Awaiting', 'Verified']) {
            const o = run(s);
            expect(o.internalStatus).toBe('UNAPPROVED');
            expect(o.externalStatus).toBe(s);
            expect((o.meta as any).statusFlag).toBe('paymentPending');
        }
    });

    it('UnPacked bayraklanır; AtCollectionPoint/UnDelivered SHIPPED', () => {
        expect((run('UnPacked').meta as any).statusFlag).toBe('unpacked');
        expect(run('AtCollectionPoint').internalStatus).toBe('SHIPPED');
        expect(run('UnDelivered').internalStatus).toBe('SHIPPED');
    });

    it('resmi büyük/küçük harf yazımları (UnSupplied, UNSUPPLIED, cancelled) tanınır; iptal kaynağı SELLER', () => {
        expect(run('UnSupplied').internalStatus).toBe('CANCELLED');
        expect(run('UNSUPPLIED').internalStatus).toBe('CANCELLED');
        expect(run('UnSupplied').cancelSource).toBe('SELLER');
    });

    it('bilinmeyen statü: UNAPPROVED davranışı AYNI, ama reportUnknownEnum çağrılır + meta.statusFlag=unknownStatus', () => {
        const events: any[] = [];
        setUnknownEnumSink(e => events.push(e));
        const o = run('BrandNewStatus');
        expect(o.internalStatus).toBe('UNAPPROVED');
        expect((o.meta as any).statusFlag).toBe('unknownStatus');
        expect(events).toEqual([{ contractId: 'trendyol.orders.list@v2', field: 'status', value: 'BrandNewStatus' }]);
    });

    it('bilinen statü rapor ETMEZ; eksik statü "MISSING" raporlar', () => {
        const events: any[] = [];
        setUnknownEnumSink(e => events.push(e));
        run('Created');
        expect(events).toHaveLength(0);
        new OrderMapper(7).toInternalOrderPackages([v2Package({ status: undefined })]);
        expect(events[0].value).toBe('MISSING');
    });

    it('reportUnknownEnum: PII olabilecek/uzun değer redakte edilir, hiç fırlatmaz, aynı değer bir kez loglanır', () => {
        expect(redactEnumValue('Ahmet Yilmaz')).toBe('<redacted>');
        expect(redactEnumValue('x'.repeat(65))).toBe('<redacted>');
        expect(redactEnumValue('OK_status-1')).toBe('OK_status-1');
        setUnknownEnumSink(() => { throw new Error('sink patladı'); });
        expect(() => reportUnknownEnum('c', 'f', 'v')).not.toThrow();
        resetUnknownEnumState();
        reportUnknownEnum('c', 'f', 'Ahmet Yilmaz'); reportUnknownEnum('c', 'f', 'Ahmet Yilmaz');
        const warns = cap.filter((l) => l.level === 'warn');
        expect(warns).toHaveLength(1);
        expect(JSON.stringify(warns[0])).not.toContain('Ahmet');
    });
});

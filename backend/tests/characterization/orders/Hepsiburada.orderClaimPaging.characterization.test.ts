// Protokol 13 karakterizasyon + faz4-int-wp1/F-02: Hepsiburada sipariş/iade çekimi. HTTP tamamen sahte (ağ YOK).
// (A) bölümü ESKİ (tek sayfa) davranışta da yeşildir; (B) bölümü yeni sayfalama davranışıdır.
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OrderConnector, legacyOmsPath } from '@integration/modules/marketplace/hepsiburada/api/OrderConnector';
import { ClaimConnector } from '@integration/modules/marketplace/hepsiburada/api/ClaimConnector';

const params = { clientId: 7, integrationSettings: { settings: { MERCHANTID: 'M-1' }, urls: {} } };
const mk = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ orderNumber: `O${from + i}` }));

function fakeService(pages: any[]) {
    const get = jest.fn(async (_url: string, _q?: any) => {
        const next = pages.shift();
        if (next instanceof Error) throw next;
        return { data: next };
    });
    return { service: { get } as any, get };
}

beforeEach(() => { cap = captureLogs(); });
afterEach(() => { cap.restore(); });

describe('(A) karakterizasyon — tek sayfa davranışı korunur', () => {
    it('siparis: 1 sayfa (<100) -> tek istek, limit:100 offset:0, items döner', async () => {
        const { service, get } = fakeService([{ items: mk(3) }]);
        const r = await new OrderConnector(service, params).fetchOrdersFromPlatform({ beginDate: '2026-01-01' });
        expect(r).toHaveLength(3);
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith('orders/merchantid/M-1', { beginDate: '2026-01-01', limit: 100, offset: 0 });
    });
    it('siparis: items yoksa [] döner', async () => {
        const { service } = fakeService([{}]);
        expect(await new OrderConnector(service, params).fetchOrdersFromPlatform()).toEqual([]);
    });
    it('[2026-10-03 canlı doğrulama] platform urls\'teki ESKİ `rest/delivery/v1/shipmentPackages` yolu yok sayılır (OMS 404), kod varsayılanı kullanılır; özel yol korunur', async () => {
        const legacy = { ...params, integrationSettings: { settings: { MERCHANTID: 'M-1' }, urls: { orderListUrl: 'rest/delivery/v1/shipmentPackages', orderDetailUrl: 'rest/delivery/v1/shipmentPackages/<PACKAGEID>' } } };
        const { service, get } = fakeService([{ items: mk(1) }, { orderNumber: 'O1' }]);
        await new OrderConnector(service, legacy).fetchOrdersFromPlatform();
        await new OrderConnector(service, legacy).fetchOrderDetails('O1');
        expect(get.mock.calls.map(c => c[0])).toEqual(['orders/merchantid/M-1', 'orders/merchantid/M-1/ordernumber/O1']);

        const custom = { ...params, integrationSettings: { settings: { MERCHANTID: 'M-1' }, urls: { orderListUrl: 'orders/merchantid/<MERCHANTID>' } } };
        const c2 = fakeService([{ items: mk(1) }]);
        await new OrderConnector(c2.service, custom).fetchOrdersFromPlatform();
        expect(c2.get.mock.calls[0][0]).toBe('orders/merchantid/M-1');
        expect(legacyOmsPath('')).toBeUndefined(); expect(legacyOmsPath(undefined)).toBeUndefined(); expect(legacyOmsPath('/REST/delivery/v1/x')).toBeUndefined();
    });
    it('iade: dizi gövde -> tek istek, limit:100 offset:0', async () => {
        const { service, get } = fakeService([[{ claimId: 1 }]]);
        const r = await new ClaimConnector(service, params).fetchClaimsFromPlatform();
        expect(r).toEqual([{ claimId: 1 }]);
        expect(get).toHaveBeenCalledWith('claims/merchantId/M-1', { limit: 100, offset: 0 });
    });
    it('iade: gövde yoksa [] döner', async () => {
        const { service } = fakeService([undefined]);
        expect(await new ClaimConnector(service, params).fetchClaimsFromPlatform()).toEqual([]);
    });
});

describe('(B) sayfalama (F-02)', () => {
    it('siparis: 100+100+30 -> 3 istek, offset 0/100/200, 230 kayıt', async () => {
        const { service, get } = fakeService([{ items: mk(100) }, { items: mk(100, 100) }, { items: mk(30, 200) }]);
        const r = await new OrderConnector(service, params).fetchOrdersFromPlatform();
        expect(r).toHaveLength(230);
        expect(get.mock.calls.map(c => (c[1] as any).offset)).toEqual([0, 100, 200]);
    });
    it('siparis: toplam alanı varsa ona göre durur (tam dolu son sayfadan sonra fazladan istek yok)', async () => {
        const { service, get } = fakeService([{ items: mk(100), totalCount: 200 }, { items: mk(100, 100), totalCount: 200 }]);
        const r = await new OrderConnector(service, params).fetchOrdersFromPlatform();
        expect(r).toHaveLength(200);
        expect(get).toHaveBeenCalledTimes(2);
    });
    it('siparis: toplam alanı yokken tam dolu sayfa sonrası boş sayfa -> durur', async () => {
        const { service, get } = fakeService([{ items: mk(100) }, { items: [] }]);
        expect(await new OrderConnector(service, params).fetchOrdersFromPlatform()).toHaveLength(100);
        expect(get).toHaveBeenCalledTimes(2);
    });
    it('siparis: kayıt tavanı (5000) aşılırsa yapılandırılmış uyarı loglanır, sessiz kesme yok', async () => {
        const pages = Array.from({ length: 60 }, (_, i) => ({ items: mk(100, i * 100) }));
        const { service, get } = fakeService(pages);
        const r = await new OrderConnector(service, params).fetchOrdersFromPlatform();
        expect(r).toHaveLength(5000);
        expect(get).toHaveBeenCalledTimes(50);
        const logged = cap.find((l) => l.code === 'PAGINATION_RECORD_CAP');
        expect(logged).toMatchObject({ level: 'warn', source: 'adapter-common', integrationCode: 'hepsiburada', operation: 'fetchOrdersFromPlatform', code: 'PAGINATION_RECORD_CAP' });
    });
    it('siparis: sunucu offset yok sayıp aynı sayfayı dönerse sonsuz döngü yok, uyarı var', async () => {
        const same = mk(100);
        const { service, get } = fakeService([{ items: same }, { items: same }, { items: same }]);
        const r = await new OrderConnector(service, params).fetchOrdersFromPlatform();
        expect(r).toHaveLength(100);
        expect(get).toHaveBeenCalledTimes(2);
        expect(cap.find((l) => l.level === 'warn')?.code).toBe('PAGINATION_REPEATED_PAGE');
    });
    it('siparis: ara sayfa hatası yutulmaz (kısmi sonuç dönmez)', async () => {
        const { service } = fakeService([{ items: mk(100) }, new Error('boom')]);
        await expect(new OrderConnector(service, params).fetchOrdersFromPlatform()).rejects.toThrow('boom');
    });
    it('siparis: çağıranın offset başlangıcı korunur', async () => {
        const { service, get } = fakeService([{ items: mk(1) }]);
        await new OrderConnector(service, params).fetchOrdersFromPlatform({ offset: 300 });
        expect((get.mock.calls[0][1] as any).offset).toBe(300);
    });
    it('iade: 100+5 -> 2 istek, 105 kayıt', async () => {
        const { service, get } = fakeService([mk(100), mk(5, 100)]);
        const r = await new ClaimConnector(service, params).fetchClaimsFromPlatform();
        expect(r).toHaveLength(105);
        expect(get.mock.calls.map(c => (c[1] as any).offset)).toEqual([0, 100]);
    });
    it('iade: ara sayfa hatası fırlatılır', async () => {
        const { service } = fakeService([mk(100), new Error('x')]);
        await expect(new ClaimConnector(service, params).fetchClaimsFromPlatform()).rejects.toThrow('x');
    });
});

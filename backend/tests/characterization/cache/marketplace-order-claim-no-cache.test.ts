// ADR-0002 adım 1 (BACKLOG C3): Trendyol / Hepsiburada / Pazarama fetchOrders/fetchClaims artık @Cache KULLANMAZ.
//
// Bu dosya, önceki `marketplace-tenant-leak.test.ts`'in (tenant sızıntısını SABİTLEYEN) kasıtlı olarak TERS ÇEVRİLMİŞ halidir:
// her tenant çağrısı bağlayıcıya gider, hiçbir sonuç tenant'lar arası paylaşılmaz, hiçbir şey önbelleğe yazılmaz.
// Bu testler bir regresyon kapısıdır: biri bu metotlara tekrar @Cache eklerse burada kırılır.
//
// İzolasyon: connector, mapper ve Service sınıfları jest.mock ile kesilir (gerçek HTTP / DB / Redis YOK). Veriler sentetiktir.
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import { nodeCache } from '@utils/decorator/cache';

// jest.mock factory'leri hoist edilir; yalnızca `mock` önekli değişkenlere erişebilir.
const mockPlatformCall = jest.fn<(kind: string, mp: string, clientId: string, query: any) => Promise<any>>();

function mockConnectorClass(mp: string) {
    class MockConnector {
        constructor(public service: any, public params: any) { }
        async fetchOrdersFromPlatform(q: any) { return mockPlatformCall('orders', mp, this.params.clientId, q); }
        async fetchClaimsFromPlatform(q: any) { return mockPlatformCall('claims', mp, this.params.clientId, q); }
    }
    return MockConnector;
}

class MockOrderMapper { toInternalOrderPackages(raw: any) { return raw; } }
class MockClaimMapper { toInternalClaimPackages(raw: any) { return raw; } }

jest.mock('@integration/modules/marketplace/trendyol/api/OrderConnector', () => ({ OrderConnector: mockConnectorClass('trendyol') }));
jest.mock('@integration/modules/marketplace/trendyol/api/ClaimConnector', () => ({ ClaimConnector: mockConnectorClass('trendyol') }));
jest.mock('@integration/modules/marketplace/hepsiburada/api/OrderConnector', () => ({ OrderConnector: mockConnectorClass('hepsiburada') }));
jest.mock('@integration/modules/marketplace/hepsiburada/api/ClaimConnector', () => ({ ClaimConnector: mockConnectorClass('hepsiburada') }));
jest.mock('@integration/modules/marketplace/pazarama/api/OrderConnector', () => ({ OrderConnector: mockConnectorClass('pazarama') }));
jest.mock('@integration/modules/marketplace/pazarama/api/ClaimConnector', () => ({ ClaimConnector: mockConnectorClass('pazarama') }));
jest.mock('@integration/modules/marketplace/trendyol/transformers/OrderTransformer', () => ({ OrderMapper: MockOrderMapper }));
jest.mock('@integration/modules/marketplace/hepsiburada/transformers/OrderTransformer', () => ({ OrderMapper: MockOrderMapper }));
jest.mock('@integration/modules/marketplace/pazarama/transformers/OrderTransformer', () => ({ OrderMapper: MockOrderMapper }));
jest.mock('@integration/modules/marketplace/trendyol/transformers/ClaimTransformer', () => ({ ClaimMapper: MockClaimMapper }));
jest.mock('@integration/modules/marketplace/hepsiburada/transformers/ClaimTransformer', () => ({ ClaimMapper: MockClaimMapper }));
jest.mock('@integration/modules/marketplace/pazarama/transformers/ClaimTransformer', () => ({ ClaimMapper: MockClaimMapper }));

import { OrderService as TyOrderService } from '@integration/modules/marketplace/trendyol/services/OrderService';
import { ClaimService as TyClaimService } from '@integration/modules/marketplace/trendyol/services/ClaimService';
import { OrderService as HbOrderService } from '@integration/modules/marketplace/hepsiburada/services/OrderService';
import { ClaimService as HbClaimService } from '@integration/modules/marketplace/hepsiburada/services/ClaimService';
import { OrderService as PzOrderService } from '@integration/modules/marketplace/pazarama/services/OrderService';
import { ClaimService as PzClaimService } from '@integration/modules/marketplace/pazarama/services/ClaimService';

interface Case {
    name: string;
    kind: 'orders' | 'claims';
    method: 'fetchOrders' | 'fetchClaims';
    marketplace: string;
    errorPrefix: (clientId: string) => string;
    /** Mevcut desen: Trendyol'da getInstance(params, service); Hepsiburada/Pazarama'da getInstance yok -> new. */
    make: (params: any) => any;
}

const service: any = {}; // Service mock'lanan connector tarafından kullanılmaz

const CASES: Case[] = [
    { name: 'Trendyol OrderService.fetchOrders', kind: 'orders', method: 'fetchOrders', marketplace: 'trendyol', errorPrefix: (c) => `[${c}][OrderService:fetchOrders] `, make: (p) => TyOrderService.getInstance(p, service) },
    { name: 'Trendyol ClaimService.fetchClaims', kind: 'claims', method: 'fetchClaims', marketplace: 'trendyol', errorPrefix: (c) => `[${c}][ClaimService:fetchClaims] `, make: (p) => TyClaimService.getInstance(p, service) },
    { name: 'Hepsiburada OrderService.fetchOrders', kind: 'orders', method: 'fetchOrders', marketplace: 'hepsiburada', errorPrefix: (c) => `[${c}][HepsiburadaOrderService:fetchOrders] `, make: (p) => new HbOrderService(p, service) },
    { name: 'Hepsiburada ClaimService.fetchClaims', kind: 'claims', method: 'fetchClaims', marketplace: 'hepsiburada', errorPrefix: (c) => `[${c}][HepsiburadaClaimService:fetchClaims] `, make: (p) => new HbClaimService(p, service) },
    { name: 'Pazarama OrderService.fetchOrders', kind: 'orders', method: 'fetchOrders', marketplace: 'pazarama', errorPrefix: (c) => `[${c}][PazaramaOrderService:fetchOrders] `, make: (p) => new PzOrderService(p, service) },
    { name: 'Pazarama ClaimService.fetchClaims', kind: 'claims', method: 'fetchClaims', marketplace: 'pazarama', errorPrefix: (c) => `[${c}][PazaramaClaimService:fetchClaims] `, make: (p) => new PzClaimService(p, service) },
];

const tenantA = { clientId: 'tenant-A', apiKey: 'synthetic-key-A' };
const tenantB = { clientId: 'tenant-B', apiKey: 'synthetic-key-B' };

beforeEach(() => {
    nodeCache.flushAll();
    mockPlatformCall.mockReset();
    // Bağlayıcı: hangi tenant'ın çağırdığını sonuca işler (sentetik).
    // orderNumber/orderId: HB/PZ servisleri kimliksiz kaydi atlar (C7b) — sentetik kayit kimlik tasir.
    mockPlatformCall.mockImplementation(async (kind, mp, clientId) => [{ marker: `${kind}:${mp}:${clientId}`, owner: clientId, orderNumber: `SYN-${clientId}`, orderId: `SYN-${clientId}` }]);
});

afterAll(() => {
    nodeCache.flushAll();
    nodeCache.close();
});

describe.each(CASES)('$name', (c) => {
    it('her çağrı bağlayıcıya gider ve önbelleğe HİÇBİR şey yazılmaz', async () => {
        const res = await c.make(tenantA)[c.method]();
        expect(res).toEqual([expect.objectContaining({ marker: `${c.kind}:${c.marketplace}:tenant-A`, owner: 'tenant-A' })]);
        expect(mockPlatformCall).toHaveBeenCalledTimes(1);
        expect(nodeCache.keys()).toEqual([]);
    });

    it('TENANT İZOLASYONU (C3 kapandı): tenant B kendi bağlayıcı çağrısını yapar ve KENDİ verisini alır', async () => {
        const resA = await c.make(tenantA)[c.method]();
        const resB = await c.make(tenantB)[c.method]();

        expect(resA[0].owner).toBe('tenant-A');
        expect(resB[0].owner).toBe('tenant-B');
        expect(mockPlatformCall).toHaveBeenCalledTimes(2);
        expect(mockPlatformCall.mock.calls.map(x => x[2])).toEqual(['tenant-A', 'tenant-B']);
    });

    it('izolasyon iki yönlüdür: önce B sonra A çağırırsa her biri kendi verisini alır', async () => {
        const resB = await c.make(tenantB)[c.method]();
        const resA = await c.make(tenantA)[c.method]();
        expect(resB[0].owner).toBe('tenant-B');
        expect(resA[0].owner).toBe('tenant-A');
        expect(mockPlatformCall).toHaveBeenCalledTimes(2);
    });

    it('farklı kimlik bilgisi/params ile oluşturulan servis kendi params\'ı ile bağlayıcıya gider', async () => {
        await c.make(tenantA)[c.method]();
        await c.make({ clientId: 'tenant-C', apiKey: 'synthetic-key-C', extra: 1 })[c.method]();
        expect(mockPlatformCall.mock.calls.map(x => x[2])).toEqual(['tenant-A', 'tenant-C']);
    });

    it('aynı tenant, farklı sorgu (tarih aralığı): her çağrı güncel sorguyla bağlayıcıya gider (eski sonuç dönmez)', async () => {
        const svc = c.make(tenantA);
        // [WP6-kalan] Pazarama sipariş aralığı 30 günlük dilimlere bölünür (WP4 D-PZ-8): tek pencereye sığan YAKIN tarihler.
        const d1 = new Date(Date.now() - 5 * 864e5), d2 = new Date(Date.now() - 2 * 864e5);
        await svc[c.method]({ lastSyncTimestamp: d1.toISOString(), beginDate: d1.toISOString().slice(0, 10) });
        await svc[c.method]({ lastSyncTimestamp: d2.toISOString(), beginDate: d2.toISOString().slice(0, 10) });
        expect(mockPlatformCall).toHaveBeenCalledTimes(2);
    });

    it('aynı tenant, aynı sorgu art arda: TTL yok, her çağrı bağlayıcıya gider', async () => {
        const svc = c.make(tenantA);
        await svc[c.method]({ id: 'q1' });
        await svc[c.method]({ id: 'q1' });
        expect(mockPlatformCall).toHaveBeenCalledTimes(2);
        expect(nodeCache.keys()).toEqual([]);
    });

    it('bağlayıcı boş dizi dönerse boş dizi döner', async () => {
        mockPlatformCall.mockResolvedValueOnce([]);
        expect(await c.make(tenantA)[c.method]()).toEqual([]);
    });

    it('[MEVCUT DAVRANIŞ — korunuyor] bağlayıcı hata verirse hata tenant kimliğiyle sarılıp fırlatılır', async () => {
        mockPlatformCall.mockRejectedValueOnce(new Error('HTTP 500 synthetic'));
        await expect(c.make(tenantA)[c.method]()).rejects.toThrow(`${c.errorPrefix('tenant-A')}HTTP 500 synthetic`);
        expect(nodeCache.keys()).toEqual([]);
        const res = await c.make(tenantB)[c.method]();
        expect(res[0].owner).toBe('tenant-B');
    });
});

describe('sipariş/iade metotları @Cache kullanmaz (regresyon kapısı)', () => {
    it('üç pazaryeri × sipariş+iade çağrıldıktan sonra önbellek boştur', async () => {
        await TyOrderService.getInstance(tenantA, service).fetchOrders();
        await TyClaimService.getInstance(tenantA, service).fetchClaims();
        await new HbOrderService(tenantA, service).fetchOrders();
        await new HbClaimService(tenantA, service).fetchClaims();
        await new PzOrderService(tenantA, service).fetchOrders();
        await new PzClaimService(tenantA, service).fetchClaims();
        expect(mockPlatformCall).toHaveBeenCalledTimes(6);
        expect(nodeCache.keys()).toEqual([]);
    });
});

describe('[MEVCUT DAVRANIŞ — korunuyor] Hepsiburada/Pazarama fetchOrders sorgu dönüşümü her çağrıda çalışır', () => {
    it('Hepsiburada: lastSyncTimestamp -> beginDate (YYYY-MM-DD); beginDate/endDate query\'den geçer; lastSyncTimestamp bağlayıcıya iletilmez', async () => {
        const svc = new HbOrderService(tenantA, service);
        await svc.fetchOrders({ lastSyncTimestamp: '2025-03-04T10:20:30.000Z', endDate: '2025-03-10' });
        expect(mockPlatformCall).toHaveBeenCalledWith('orders', 'hepsiburada', 'tenant-A', { beginDate: '2025-03-04', endDate: '2025-03-10' });
    });

    it('Hepsiburada: açık beginDate, lastSyncTimestamp\'ten türetilen beginDate\'i ezer', async () => {
        const svc = new HbOrderService(tenantA, service);
        await svc.fetchOrders({ lastSyncTimestamp: '2025-03-04T10:20:30.000Z', beginDate: '2025-01-01' });
        expect(mockPlatformCall).toHaveBeenCalledWith('orders', 'hepsiburada', 'tenant-A', { beginDate: '2025-01-01' });
    });

    it('Pazarama: lastSyncTimestamp -> startDate ISO, endDate = şimdi; verilmezse son 24 saat', async () => {
        const svc = new PzOrderService(tenantA, service);
        // [WP6-kalan] 30 günlük dilim (WP4 D-PZ-8) → tek pencereye sığan yakın tarih.
        const since = new Date(Date.now() - 3 * 864e5).toISOString();
        await svc.fetchOrders({ lastSyncTimestamp: since });
        const q1 = mockPlatformCall.mock.calls[0][3];
        expect(q1.startDate).toBe(since);
        expect(q1.endDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

        await svc.fetchOrders();
        const q2 = mockPlatformCall.mock.calls[1][3];
        const diffMs = new Date(q2.endDate).getTime() - new Date(q2.startDate).getTime();
        expect(Math.abs(diffMs - 24 * 3600 * 1000)).toBeLessThan(60 * 1000); // ~24 saat (DST geçişinde 1 saat kayabilir)
    });

    it('farklı lastSyncTimestamp artık YOK SAYILMAZ: her çağrıda dönüşüm çalışır ve bağlayıcıya ulaşır (eski cache-hit davranışı kalktı)', async () => {
        const svc = new PzOrderService(tenantA, service);
        // [WP6-kalan] 30 günlük dilim (WP4 D-PZ-8) → tek pencereye sığan yakın tarihler.
        const a = new Date(Date.now() - 3 * 864e5).toISOString(), b = new Date(Date.now() - 20 * 864e5).toISOString();
        await svc.fetchOrders({ lastSyncTimestamp: a });
        await svc.fetchOrders({ lastSyncTimestamp: b });
        expect(mockPlatformCall).toHaveBeenCalledTimes(2);
        expect(mockPlatformCall.mock.calls[1][3].startDate).toBe(b);
    });
});

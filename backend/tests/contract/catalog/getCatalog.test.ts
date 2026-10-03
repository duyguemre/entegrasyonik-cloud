// ADR-0018 Aşama A DoD: "getCatalog salt-okunur uç (member)". Saf birim testi (DB/ağ YOK — `getCatalog`
// yalnız statik `IntegrationDescriptorRegistry`'yi okur, `init()` çağrılmadan test edilebilir olması BUNU kanıtlar).
import { describe, it, expect } from '@jest/globals';
import IntegrationService from '@api/services/integration-service';
import { INTEGRATION_DESCRIPTORS } from '@integration/catalog/IntegrationDescriptorRegistry';

describe('IntegrationService.getCatalog — ADR-0018 manifesto ucu', () => {
    it('DB/init() OLMADAN çalışır (yalnız statik kod verisi okur)', async () => {
        const svc = new IntegrationService(1, {}) as any;
        const catalog = await svc.getCatalog();
        expect(Array.isArray(catalog)).toBe(true);
        expect(catalog).toHaveLength(INTEGRATION_DESCRIPTORS.length);
    });

    it('her girişte kod/kategori/durum/yetenek özeti var; sır/kimlik bilgisi İÇERMEZ', async () => {
        const svc = new IntegrationService(1, {}) as any;
        const catalog = await svc.getCatalog();
        const trendyol = catalog.find((c: any) => c.code === 'trendyol');
        expect(trendyol).toBeDefined();
        expect(trendyol.category).toBe('marketplace');
        expect(trendyol.status).toBe('available');
        expect(trendyol.capabilities.products.level).toBe('supported');
        const serialized = JSON.stringify(catalog);
        expect(serialized).not.toMatch(/apikey|apisecret|password|secret/i);
    });

    it('6 entegrasyonun tamamı listede', async () => {
        const svc = new IntegrationService(1, {}) as any;
        const catalog = await svc.getCatalog();
        const codes = catalog.map((c: any) => c.code).sort();
        expect(codes).toEqual(['bizimhesap', 'hepsiburada', 'ideasoft', 'n11', 'pazarama', 'trendyol']);
    });
});

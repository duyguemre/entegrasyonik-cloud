// ADR-0018 Aşama A — Karar 1.3 bullet 4: "platform_auto metotları `{ performed:false }` döner" örneği,
// ADR-0006 Karar 2'nin VERDİĞİ bir örnek biçimdir ("ör." — zorunlu şema değil). GERÇEK kod okunduğunda
// Trendyol.approveOrder bugün yalın `true` döner (gerçek bir HTTP çağrısı yapmadan — bilinçli no-op,
// Trendyol siparişi kendi kendine onaylar). Bu test UYDURMA bir uyum iddia ETMEZ: yalnızca gerçekte
// doğrulanabilen şeyi sabitler (metot I/O yapmadan başarıyla döner) ve ADR örneğiyle bugünkü kod
// arasındaki farkı AÇIKÇA not eder (bkz. final rapor — orkestratöre bulgu olarak iletildi).
import { describe, it, expect } from '@jest/globals';
import { INTEGRATION_DESCRIPTORS } from '@integration/catalog/IntegrationDescriptorRegistry';
import Trendyol from '@integration/modules/marketplace/trendyol';

describe('descriptor platform_auto — gerçek davranışla tutarlılık (zayıflatılmış, dürüst assertion)', () => {
    it('Trendyol.orderActions (approveOrder) platform_auto işaretli; I/O yapmadan başarıyla döner', async () => {
        const d = INTEGRATION_DESCRIPTORS.find((x) => x.code === 'trendyol')!;
        const cap = d.capabilities.orderActions!;
        expect(cap.level).toBe('platform_auto');
        expect(cap.methods).toContain('approveOrder');

        const adapter = new Trendyol({
            clientId: 'catalog-consistency-test',
            integrationSettings: { settings: { SELLERID: 'S1', APIKEY: 'K', APISECRET: 'S' }, urls: {} },
            applicationSettings: {},
            clientDB: undefined,
        }) as any;

        const result = await adapter.approveOrder('EXT-ORDER-1');
        // BULGU (uydurulmadı): ADR-0018 Karar 1.3'ün "ör." verdiği `{performed:false, reason:'PLATFORM_AUTO'}`
        // şekli bugün UYGULANMIYOR — kod yalın `true` döner. Descriptor.note bunu açıkça belirtir; bu test
        // yalnızca "throw etmez ve I/O yapmadan sonuçlanır" gerçeğini kilitler.
        expect(result).toBe(true);
    });
});

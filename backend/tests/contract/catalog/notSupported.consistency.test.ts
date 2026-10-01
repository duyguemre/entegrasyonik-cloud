// ADR-0018 Aşama A — Karar 1.3: "not_supported işaretli her yeteneğin metodu, sahte yapılandırmayla
// çağrıldığında NOT_SUPPORTED fırlatır" tutarlılık testi. Yalnızca descriptor'da AÇIKÇA `not_supported`
// işaretlenmiş ve GERÇEKTEN throw eden (I/O gerektirmeyen) girişler burada test edilir — ADR §3 kuralı
// gereği manifestoda HİÇ yazılmayan yetenekler de örtük not_supported sayılır ama bu testin kapsamı
// dışındadır (ör. Hepsiburada updateProductVariant/Delivery ve Bizimhesap ürün yazma metotları
// 'products' yeteneğinin İÇİNDE karma (okuma çalışır/yazma NOT_SUPPORTED) olduğu için descriptor'da
// 'limited' + note ile temsil edilir, bkz. kategori belgesi §4 "İlk doldurma kuralı" — bu ayrım
// descriptor.registry.test.ts'te de doğrulanır).
//
// Gerçek adaptör örnekleri kuruluyor (clientId/ayar sahte, DB/ağ YOK); test edilen metotlar I/O'dan
// ÖNCE throw ettiği için gerçek bir HTTP/DB çağrısı yapılmaz (kod okunarak doğrulandı).
import { describe, it, expect } from '@jest/globals';
import { INTEGRATION_DESCRIPTORS } from '@integration/catalog/IntegrationDescriptorRegistry';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import Ideasoft from '@integration/modules/ecommerce/ideasoft';
import N11 from '@integration/modules/marketplace/n11';

function fakeParams(requiredSettings: string[]) {
    const settings: Record<string, string> = {};
    for (const key of requiredSettings) settings[key] = `fake-${key}`;
    return {
        clientId: 'catalog-consistency-test',
        integrationSettings: { settings, urls: {} },
        applicationSettings: {},
        clientDB: undefined,
    };
}

describe('descriptor not_supported → adaptör GERÇEKTEN NOT_SUPPORTED fırlatır (ADR-0018 Karar 1.3)', () => {
    it('Ideasoft.invoiceNotice (sendOrderInvoice) NOT_SUPPORTED fırlatır', async () => {
        const d = INTEGRATION_DESCRIPTORS.find((x) => x.code === 'ideasoft')!;
        const cap = d.capabilities.invoiceNotice!;
        expect(cap.level).toBe('not_supported');
        expect(cap.methods).toEqual(['sendOrderInvoice']);

        const adapter = new Ideasoft(fakeParams(d.auth.requiredSettings)) as any;
        await expect(adapter.sendOrderInvoice({ orderId: 'X', invoiceNumber: 'INV-1' } as any))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'NOT_SUPPORTED' });
    });

    it('N11.orderActions (approveOrder + rejectOrder) her ikisi de NOT_SUPPORTED fırlatır', async () => {
        const d = INTEGRATION_DESCRIPTORS.find((x) => x.code === 'n11')!;
        const cap = d.capabilities.orderActions!;
        expect(cap.level).toBe('not_supported');
        expect(cap.methods.sort()).toEqual(['approveOrder', 'rejectOrder']);

        const adapter = new N11(fakeParams(d.auth.requiredSettings)) as any;
        await expect(adapter.approveOrder('X'))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'NOT_SUPPORTED' });
        await expect(adapter.rejectOrder('X', { reasonId: '1' } as any))
            .rejects.toMatchObject({ name: 'IntegrationError', code: 'NOT_SUPPORTED' });
    });

    it('IntegrationError.isIntegrationError her iki hata için de true döner (sözleşme kontrolü)', async () => {
        const d = INTEGRATION_DESCRIPTORS.find((x) => x.code === 'ideasoft')!;
        const adapter = new Ideasoft(fakeParams(d.auth.requiredSettings)) as any;
        try {
            await adapter.sendOrderInvoice({ orderId: 'X' } as any);
            throw new Error('beklenen NOT_SUPPORTED fırlatılmadı');
        } catch (e) {
            expect(IntegrationError.isIntegrationError(e)).toBe(true);
        }
    });
});

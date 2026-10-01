// ADR-0029 NB8: R12 uyum bulgusu -> PLATFORM_COMPLIANCE_FINDING (bulgu içeriği bildirime girmez; gölge mod; idempotent anahtar).
import { describe, it, expect, jest } from '@jest/globals';
import { createFindingAlertHook } from '../../../src/operations/alerts/findingAlertHook';
import { PlatformNotifier } from '../../../src/operations/notifications/platformNotify';
import { parseAlertRecipients } from '../../../src/operations/notifications/platformRecipients';
import { FakeNotifyModel } from '../../helpers/fakeNotifyDb';

describe('createFindingAlertHook', () => {
    const ctx = { integrationCode: 'trendyol', kind: 'unknown_enum', severity: 'high', findingId: 'abcdef0123456789' };
    it('PLATFORM_COMPLIANCE_FINDING + yalnız kısa kimlik/entegrasyon/önem; idempotencyKey bulgu kimliği; gölge bayrağı iletilir', async () => {
        const platformNotify = jest.fn(async (..._a: any[]) => ({ status: 'created' as const }));
        let shadow = false;
        const hook = createFindingAlertHook({ platformNotify: platformNotify as any, shadow: () => shadow });
        await hook(ctx);
        shadow = true;
        await hook(ctx);
        expect(platformNotify).toHaveBeenNthCalledWith(1, 'PLATFORM_COMPLIANCE_FINDING', { findingId: 'abcdef0123456789', integ: 'trendyol', level: 'warning' }, { idempotencyKey: 'finding:abcdef0123456789', shadow: false, module: 'compliance' });
        expect(platformNotify.mock.calls[1][2]).toMatchObject({ shadow: true });
        expect(JSON.stringify(platformNotify.mock.calls)).not.toMatch(/unknown_enum|evidence/);
    });
    it('uçtan uca (sahte defter): aynı bulgu ikinci kez -> duplicate; tek defter kaydı', async () => {
        const ledger = new FakeNotifyModel([], { unique: [['idemKey']] });
        const deliveries = new FakeNotifyModel();
        const p = new PlatformNotifier({ ledgerModel: ledger as any, deliveryModel: deliveries as any, flags: () => ({ v2Enabled: true, emailEnabled: true }), recipients: () => parseAlertRecipients('ops@example.com') });
        const hook = createFindingAlertHook({ platformNotify: (c, pa, o) => p.notify(c, pa, o), shadow: () => false });
        await hook(ctx); await hook(ctx);
        expect(ledger.docs).toHaveLength(1);
        expect(ledger.docs[0]).toMatchObject({ code: 'PLATFORM_COMPLIANCE_FINDING', tid: 0, source: { module: 'compliance' } });
        expect(deliveries.docs).toHaveLength(1);
        expect(deliveries.docs[0].mode).toBe('digest');
    });
});

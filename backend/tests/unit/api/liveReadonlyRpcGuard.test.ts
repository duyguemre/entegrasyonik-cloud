// LIVE-RO Katman B (API): canlı salt-okuma kipinde dış-yazma RPC'lerinin tek merkezî reddi (423 LIVE_READONLY).
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { enforceLiveReadonlyForRpc, isLiveReadonlyBlockedRpc, LIVE_READONLY_ALLOWED_RPCS, LIVE_READONLY_DENIED_RPCS } from '../../../src/api/rpc/liveReadonlyRpcGuard';
import { CAPABILITIES, rpcBindingsOf } from '../../../src/capabilities';

const thrown = (fn: () => void) => { try { fn(); } catch (e: any) { return e; } return undefined; };

describe('liveReadonlyRpcGuard', () => {
    const prev = process.env.LIVE_READONLY;
    beforeEach(() => { process.env.LIVE_READONLY = 'true'; });
    afterEach(() => { if (prev === undefined) delete process.env.LIVE_READONLY; else process.env.LIVE_READONLY = prev; });

    it('dış-yazma RPC\'leri 423 LIVE_READONLY ile reddedilir', () => {
        for (const rpc of [
            'OrderService/approveOrder', 'OrderService/cancelOrder', 'ClaimService/approveClaim', 'ClaimService/rejectClaim', 'MessageService/replyMessage',
            'ShipmentService/createShipment', 'InvoiceService/createInvoice', 'IntegrationService/batchCreator', 'IntegrationService/retrieveAndSetExternalToken',
        ]) {
            const [s, o] = rpc.split('/');
            const e = thrown(() => enforceLiveReadonlyForRpc(s, o));
            expect({ rpc, status: e?.statusCode, code: e?.code }).toEqual({ rpc, status: 423, code: 'LIVE_READONLY' });
        }
    });
    it('okuma RPC\'leri ve kullanıcı tetiklemeli içe alma (requestFetchFromPlatform) geçer', () => {
        for (const rpc of [
            'IntegrationService/testConnection', 'IntegrationService/retrieveBrandsFromIntegration', 'IntegrationService/retrieveCategoriesFromIntegration',
            'IntegrationService/requestFetchFromPlatform', 'MessageService/getMessages', 'OrderService/getOrderRejectionReasons',
        ]) {
            const [s, o] = rpc.split('/');
            expect({ rpc, blocked: isLiveReadonlyBlockedRpc(s, o) }).toEqual({ rpc, blocked: false });
            expect(thrown(() => enforceLiveReadonlyForRpc(s, o))).toBeUndefined();
        }
    });
    it('yetenek kaydı invariantı: external && effect!=read olan HER RPC bloklu (açık istisna hariç)', () => {
        const offenders: string[] = [];
        for (const c of CAPABILITIES) {
            if (!(c.external && c.effect !== 'read')) continue;
            for (const b of rpcBindingsOf(c)) {
                if (LIVE_READONLY_ALLOWED_RPCS.has(b.rpc)) continue;
                const [s, o] = b.rpc.split('/');
                if (!isLiveReadonlyBlockedRpc(s, o)) offenders.push(b.rpc);
            }
        }
        expect(offenders).toEqual([]);
        expect([...LIVE_READONLY_ALLOWED_RPCS]).toEqual(['IntegrationService/requestFetchFromPlatform', 'BackofficeBillingService/cancelSubscription']);
        expect(LIVE_READONLY_DENIED_RPCS.has('IntegrationService/batchCreator')).toBe(true);
    });
    it('yerel-yazma RPC\'leri (ürün düzenleme vb.) ve kayıtsız RPC bu katmanda engellenmez', () => {
        expect(thrown(() => enforceLiveReadonlyForRpc('ProductService', 'updateProduct'))).toBeUndefined();
        expect(thrown(() => enforceLiveReadonlyForRpc('AccountService', 'nope'))).toBeUndefined();
    });
    it('kip KAPALIYKEN hiçbir şey engellenmez (davranış değişmez)', () => {
        delete process.env.LIVE_READONLY;
        expect(thrown(() => enforceLiveReadonlyForRpc('OrderService', 'approveOrder'))).toBeUndefined();
        expect(thrown(() => enforceLiveReadonlyForRpc('IntegrationService', 'batchCreator'))).toBeUndefined();
    });
});

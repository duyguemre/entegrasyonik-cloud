// [ADR-0030 X6-b] RPC intake kapısı: davranış tablosu (on/drain/off × okuma/yazma) ve kapsam.
import { describe, it, expect, beforeEach, afterAll, jest } from '@jest/globals';
import { enforceIntakeForRpc, extractRecordIds, isIntakeGatedRpc, resolveIntegrationCodes } from '../../../src/api/rpc/intakeRpcGuard';
import { setTargetIntake } from '../../../src/integration/config/platformOverrideStore';
import { ENGINE_TARGET } from '../../../src/integration/config/targets';
import { CAPABILITIES, rpcBindingsOf } from '../../../src/capabilities';

const READ = 'IntegrationService/retrieveBrandsFromIntegration';
const WRITE = 'IntegrationService/requestFetchFromPlatform';
const [rs, ro] = READ.split('/'); const [ws, wo] = WRITE.split('/');

function reset() { setTargetIntake(ENGINE_TARGET, 'on'); setTargetIntake('trendyol', 'on'); setTargetIntake('n11', 'on'); }
const blocked = async (fn: () => Promise<void>) => { try { await fn(); } catch (e: any) { return e; } return undefined; };

describe('intakeRpcGuard', () => {
    beforeEach(reset); afterAll(reset);

    it('on: her şey geçer', async () => {
        expect(await blocked(() => enforceIntakeForRpc(rs, ro, { integrationCode: 'trendyol' }))).toBeUndefined();
        expect(await blocked(() => enforceIntakeForRpc(ws, wo, { integrationCode: 'trendyol' }))).toBeUndefined();
    });
    it('drain: yazma 503 INTEGRATION_PAUSED, okuma geçer', async () => {
        setTargetIntake('trendyol', 'drain');
        const e = await blocked(() => enforceIntakeForRpc(ws, wo, { integrationCode: 'trendyol' }));
        expect(e?.statusCode).toBe(503); expect(e?.code).toBe('INTEGRATION_PAUSED');
        expect(await blocked(() => enforceIntakeForRpc(rs, ro, { integrationCode: 'trendyol' }))).toBeUndefined();
    });
    it('off: okuma ve yazma 503', async () => {
        setTargetIntake('trendyol', 'off');
        expect((await blocked(() => enforceIntakeForRpc(rs, ro, { integrationCode: 'trendyol' })))?.code).toBe('INTEGRATION_PAUSED');
        expect((await blocked(() => enforceIntakeForRpc(ws, wo, { integrationCode: 'trendyol' })))?.code).toBe('INTEGRATION_PAUSED');
    });
    it('başka entegrasyon etkilenmez', async () => {
        setTargetIntake('trendyol', 'off');
        expect(await blocked(() => enforceIntakeForRpc(ws, wo, { integrationCode: 'n11' }))).toBeUndefined();
    });
    it('kod çözülemezse yalnız global _engine (sipariş aksiyonu)', async () => {
        setTargetIntake('trendyol', 'off');
        expect(await blocked(() => enforceIntakeForRpc('OrderService', 'approveOrder', { orderId: '1' }))).toBeUndefined();
        setTargetIntake(ENGINE_TARGET, 'drain');
        expect((await blocked(() => enforceIntakeForRpc('OrderService', 'approveOrder', { orderId: '1' })))?.code).toBe('INTEGRATION_PAUSED');
    });
    it('batchCreator: seçili entegrasyonlardan biri kapalıysa reddedilir', async () => {
        setTargetIntake('n11', 'drain');
        expect((await blocked(() => enforceIntakeForRpc('IntegrationService', 'batchCreator', { selectedIntegrations: ['trendyol', 'n11'] })))?.code).toBe('INTEGRATION_PAUSED');
    });
    it('backoffice yüzeyi ve dış olmayan RPC kapsam dışı', async () => {
        setTargetIntake(ENGINE_TARGET, 'off');
        expect(await blocked(() => enforceIntakeForRpc(ws, wo, {}, 'backoffice'))).toBeUndefined();
        expect(await blocked(() => enforceIntakeForRpc('IntegrationService', 'saveClientMarketplaceSettings', {}))).toBeUndefined();
        expect(await blocked(() => enforceIntakeForRpc('AccountService', 'resendVerificationEmail', {}))).toBeUndefined();
        expect(await blocked(() => enforceIntakeForRpc('BillingService', 'startCheckout', {}))).toBeUndefined();
    });
    it('kapsam = yetenek kaydı: dış + pazaryeri etki alanı; hesap/faturalama hariç', async () => {
        const gated = CAPABILITIES.filter(c => c.external && rpcBindingsOf(c).some(b => isIntakeGatedRpc(...(b.rpc.split('/') as [string, string])).gated)).map(c => c.domain);
        expect(new Set(gated)).toEqual(new Set(['integrations', 'orders', 'claims', 'invoices', 'shipments', 'messages']));
    });
    it('kod çözümü', async () => {
        expect(resolveIntegrationCodes({ integrationCode: 'a', selectedIntegrations: ['b'] })).toEqual(['a', 'b']);
        expect(resolveIntegrationCodes({ integrationCode: 5 })).toEqual([]);
    });

    describe('X6-c: kayıt kimliğinden kod çözümü', () => {
        const OID = (n: number) => String(n).padStart(24, '0');
        const mk = (map: Record<string, string>) => {
            const fn = jest.fn(async (_t: number, ids: any) => [...new Set((ids.order ?? []).map((o: any) => map[String(o)]).filter(Boolean))] as string[]);
            return fn;
        };
        const run = (op: string, req: any, r: any) => enforceIntakeForRpc('OrderService', op, req, undefined, 7, r);

        it('kısıtlama yokken DB/çözücü çağrılmaz (sıcak yol)', async () => {
            const r = mk({ [OID(1)]: 'trendyol' });
            expect(await blocked(() => run('approveOrder', { orderId: OID(1) }, r))).toBeUndefined();
            setTargetIntake(ENGINE_TARGET, 'drain'); // yalnız global: kayıt çözmek sonucu değiştiremez
            await blocked(() => run('approveOrder', { orderId: OID(1) }, r));
            expect(r).not.toHaveBeenCalled();
        });
        it('trendyol off: Trendyol siparişi onayı 503, N11 siparişi geçer', async () => {
            setTargetIntake('trendyol', 'off');
            const r = mk({ [OID(1)]: 'trendyol', [OID(2)]: 'n11' });
            expect((await blocked(() => run('approveOrder', { orderId: OID(1) }, r)))?.statusCode).toBe(503);
            expect(await blocked(() => run('approveOrder', { orderId: OID(2) }, r))).toBeUndefined();
        });
        it('bulk karışık listede biri kapalıysa ret', async () => {
            setTargetIntake('trendyol', 'off');
            const r = mk({ [OID(1)]: 'trendyol', [OID(2)]: 'n11' });
            expect((await blocked(() => run('bulkApproveOrder', { orderIds: [OID(2), OID(1)] }, r)))?.code).toBe('INTEGRATION_PAUSED');
        });
        it('operatör nesnesi / geçersiz kimlik çözücüye gitmez', async () => {
            setTargetIntake('trendyol', 'off');
            const r = mk({});
            expect(await blocked(() => run('approveOrder', { orderId: { $ne: null } }, r))).toBeUndefined();
            expect(r).not.toHaveBeenCalled();
            expect(extractRecordIds({ orderIds: [OID(3), { $gt: '' }, 'x'] }).order?.length).toBe(1);
        });
        it('DB hatasında yalnız _engine uygulanır (geçer, 500 değil)', async () => {
            setTargetIntake('trendyol', 'off');
            const r = jest.fn(async () => { throw new Error('db down'); });
            expect(await blocked(() => run('approveOrder', { orderId: OID(1) }, r as any))).toBeUndefined();
            expect(r).toHaveBeenCalled();
        });
        it('drain + okuma: çözücüye gidilmez', async () => {
            setTargetIntake('trendyol', 'drain');
            const r = mk({ [OID(1)]: 'trendyol' });
            expect(await blocked(() => enforceIntakeForRpc('OrderService', 'getOrders', { orderId: OID(1) }, undefined, 7, r))).toBeUndefined();
            expect(r).not.toHaveBeenCalled();
        });
    });
});

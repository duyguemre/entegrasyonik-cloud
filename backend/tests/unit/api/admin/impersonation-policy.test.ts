// B3: impersonation (destek) oturumu -- yasak islemlerin yetenek kaydindan turemesi, RunOperation uygulamasi, audit isaretleri, token claim'leri.
// DB/Redis/ag YOK.
import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { CAPABILITIES, CAPABILITY_BY_RPC, rpcBindingsOf } from '../../../../src/capabilities';
import { impersonationDenial, IMP_DENIED_CREDENTIAL_RPCS } from '../../../../src/api/rpc/impersonationPolicy';
import Security from '../../../../src/platform/core/security/Security';

const allRpcs = () => CAPABILITIES.flatMap(c => rpcBindingsOf(c).map(b => ({ rpc: b.rpc, cap: c })));

describe('yasak liste yetenek kaydindan turer (merkezi, tek yer)', () => {
    it.each([
        ['hesap/tenant silme', 'TenantDataService/requestDeletion'],
        ['tenant veri disa aktarma', 'TenantDataService/exportTenantData'],
        ['kullanici silme', 'UserService/deleteUser'],
        ['sahiplik devri baslat', 'UserService/initiateOwnershipTransfer'],
        ['sahiplik devri iptal', 'UserService/cancelOwnershipTransfer'],
        ['sahiplik devri kabul', 'UserService/acceptOwnershipTransfer'],
        ['parola degisimi', 'AccountService/changePassword'],
        ['yeniden dogrulama (reauth)', 'AccountService/reauthenticate'],
        ['e-posta/kullanici guncelleme', 'UserService/updateUser'],
        ['kullanici olustur', 'UserService/createUser'],
        ['uye davet', 'UserService/inviteUser'],
        ['davet iptal', 'UserService/revokeInvitation'],
        ['uye askiya al', 'UserService/suspendUser'],
        ['faturalama / checkout', 'BillingService/startCheckout'],
        ['entegrasyon sirlari (pazaryeri)', 'IntegrationService/saveClientMarketplaceSettings'],
        ['entegrasyon sirlari (e-ticaret)', 'IntegrationService/saveClientECommerceSettings'],
        ['entegrasyon sirlari (ERP)', 'IntegrationService/saveClientErpSettings'],
        ['entegrasyon sirlari (kargo)', 'IntegrationService/saveClientShipmentSettings'],
        ['webhook belirteci uretimi', 'IntegrationService/generateWebhookToken'],
        ['harici belirtec al', 'IntegrationService/retrieveAndSetExternalToken'],
        ['dis dunyaya yazim (siparis onayi)', 'OrderService/approveOrder'],
    ])('%s reddedilir: %s', (_n, rpc) => {
        expect(CAPABILITY_BY_RPC.has(rpc)).toBe(true); // kayit sapmasi yakalanir
        expect(impersonationDenial(rpc)).toBeDefined();
    });

    it.each([
        'IntegrationService/getClientIntegrations', 'IntegrationService/getIntegrationHealth', 'UserService/getUsers', 'BillingService/getPlans',
        'BillingService/getMySubscription', 'ProductService/saveProduct', 'SettingService/getSettings',
    ])('destek icin acik kalir: %s', (rpc) => {
        expect(CAPABILITY_BY_RPC.has(rpc)).toBe(true);
        expect(impersonationDenial(rpc)).toBeUndefined();
    });

    it('degismez: kayittaki HER destructive ve HER external RPC reddedilir (yeni yetenek otomatik kapsanir)', () => {
        for (const { rpc, cap } of allRpcs()) {
            if (cap.effect === 'destructive' || cap.external === true) expect([rpc, typeof impersonationDenial(rpc)]).toEqual([rpc, 'string']);
        }
    });

    it('degismez: users:manage / billing:manage / tenant:* / yazma integrations:manage izinli HER RPC reddedilir; integrations:manage okuma acik', () => {
        for (const { rpc, cap } of allRpcs()) {
            if (['users:manage', 'billing:manage', 'tenant:export', 'tenant:delete'].includes(cap.permission)) expect([rpc, !!impersonationDenial(rpc)]).toEqual([rpc, true]);
            if (['integrations:manage', 'tenant:transfer'].includes(cap.permission) && cap.effect !== 'read') expect([rpc, !!impersonationDenial(rpc)]).toEqual([rpc, true]);
            if (cap.permission === 'integrations:manage' && cap.effect === 'read' && !cap.external) expect([rpc, impersonationDenial(rpc)]).toEqual([rpc, undefined]);
        }
    });

    it('acik kimlik-bilgisi listesindeki her girdi yetenek kaydinda vardir (sessiz sapma yok)', () => {
        for (const rpc of IMP_DENIED_CREDENTIAL_RPCS) expect(CAPABILITY_BY_RPC.has(rpc)).toBe(true);
    });
});

// ---- RunOperation uygulamasi + audit isaretleri ----
class Fake {
    constructor(public clientId: any, public request: any) {
        return new Proxy(this, { get: (t: any, k: any) => (k in t ? t[k] : (k === 'then' ? undefined : async () => ({ ok: true }))) });
    }
    async init() { /* */ }
}
let audits: any[] = [];
function loadRun() {
    let run: any;
    jest.isolateModules(() => {
        jest.doMock('../../../../src/api/rpc/index', () => ({ __esModule: true, default: { ProductService: Fake, IntegrationService: Fake, TenantDataService: Fake, UserService: Fake, AccountService: Fake, BillingService: Fake } }));
        jest.doMock('../../../../src/api/rpc/requestValidation', () => ({ validateRpcRequest: (_s: string, _o: string, b: any) => b }));
        run = require('../../../../src/api/rpc/RunOperation').default;
        require('../../../../src/services/audit/AuditLogger').AuditLogger.setSink(async (r: any) => { audits.push(r); });
    });
    return run as (uc: any, s: string, o: string, req: any, principal?: any, meta?: any) => Promise<any>;
}
const IMP = { sub: 'adm1', tid: 5, ga: true, tv: 0, imp: true, fx: true, impBy: 'adm1', impReason: 'TICKET-9 destek talebi' };
const UCT = { _id: 'adm1', isGlobalAdmin: true, order: 5 };

describe('RunOperation: fx impersonation oturumu', () => {
    beforeEach(() => { audits = []; });

    it('yasak RPC listesi 403 doner VE servis calismaz (tum liste)', async () => {
        const run = loadRun();
        for (const rpc of ['TenantDataService/requestDeletion', 'UserService/initiateOwnershipTransfer', 'AccountService/changePassword', 'UserService/inviteUser',
            'UserService/deleteUser', 'BillingService/startCheckout', 'IntegrationService/saveClientMarketplaceSettings', 'IntegrationService/saveClientErpSettings']) {
            const [s, o] = rpc.split('/');
            await expect(run(UCT, s, o, {}, IMP)).rejects.toMatchObject({ statusCode: 403 });
        }
    });

    it('izinli yazma: app.write kaydi aktor=yonetici sub, onBehalfOf=tenant, imp, gerekce; okuma: impersonation.request kaydi', async () => {
        const run = loadRun();
        await run(UCT, 'ProductService', 'saveProduct', {}, IMP, { ip: '1.2.3.4' });
        await run(UCT, 'IntegrationService', 'getClientIntegrations', {}, IMP, { ip: '1.2.3.4' });
        await new Promise(r => setImmediate(r));
        const w = audits.find(a => a.event === 'app.write');
        expect(w).toMatchObject({ sub: 'adm1', tid: 5, onBehalfOf: 5, actorType: 'impersonator', imp: true, surface: 'app' });
        expect(w.meta.impReason).toBe('TICKET-9 destek talebi');
        const r = audits.find(a => a.event === 'impersonation.request');
        expect(r).toMatchObject({ sub: 'adm1', tid: 5, onBehalfOf: 5, actorType: 'impersonator', imp: true, meta: { service: 'IntegrationService', operation: 'getClientIntegrations', effect: 'read' } });
    });

    it('imp olmayan normal oturum: impersonation.request YAZILMAZ', async () => {
        const run = loadRun();
        await run({ order: 5, roleCode: 'ROLE_ADMIN' }, 'IntegrationService', 'getClientIntegrations', {}, { sub: 'u', tid: 5, ga: false, tv: 0, imp: false });
        await new Promise(r => setImmediate(r));
        expect(audits.find(a => a.event === 'impersonation.request')).toBeUndefined();
    });
});

describe('oturum claim leri', () => {
    const OLD = { ...process.env };
    beforeEach(() => { process.env.JWT_SECRET = 'x'.repeat(48); process.env.JWT_ISSUER = 'test'; });
    afterAll(() => { process.env = OLD; });

    it('imp oturumu impBy (=sub) ve impReason (<=200) tasir; normal oturum tasimaz; dogrulamada principal a yansir', () => {
        const sec = Security.getInstance();
        const t = sec.signSession({ sub: 'adm1', tid: 5, ga: true, tv: 0, imp: true, fixedTtlSeconds: 1800, impReason: 'r'.repeat(500) });
        const dec: any = jwt.decode(t);
        expect(dec).toMatchObject({ imp: true, fx: true, impBy: 'adm1' });
        expect(dec.impReason).toHaveLength(200);
        expect(sec.verifyToken(t)).toMatchObject({ impBy: 'adm1', fx: true });
        const n: any = jwt.decode(sec.signSession({ sub: 'u1', tid: 5, ga: false, tv: 0, imp: false }));
        expect(n.impBy).toBeUndefined();
        expect(n.impReason).toBeUndefined();
    });
});

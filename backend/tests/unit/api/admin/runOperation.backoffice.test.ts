// ADR-0026: RunOperation -- backoffice audit (effect'ten turetilir), imp oturumu yasaklari, ADMIN_API_ONLY bayragi.
// Servis kayit defteri sahte servislerle degistirilir; gercek OPERATION_POLICY/yetenek kaydi kullanilir. DB/Redis/ag YOK.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

class Fake {
    constructor(public clientId: any, public request: any) { }
    async init() { }
    async getGlobalMetrics() { return { ok: 1 }; }
    async getSystemHealth() { return { ok: 1 }; }
    async getClients() { return []; }
    async getClientStats() { return {}; }
    async createClient() { return { created: true }; }
    async deleteClient() { return { deleted: true }; }
    async publish() { return true; }
    async selectStore() { return { sessionClaims: {}, body: {} }; }
    async createUser() { return { ok: 1 }; }
    async getPlans() { return []; }
    async approveOrder() { return true; }
}

let audits: any[];

function loadRun(apis: any = { AdminService: Fake, IntegrationConfigService: Fake, SecurityService: Fake, UserService: Fake, BillingService: Fake, OrderService: Fake }) {
    let run: any;
    jest.isolateModules(() => {
        jest.doMock('../../../../src/api/index', () => ({ __esModule: true, default: apis }));
        // Govde semalari (ADR-0023) bu testin konusu degil: dogrulama gecirgen
        jest.doMock('../../../../src/api/requestValidation', () => ({ validateRpcRequest: (_s: string, _o: string, b: any) => b }));
        run = require('../../../../src/api/RunOperation').default;
        // Izole kayit defterindeki AuditLogger ornegine sink baglanir (dis kayit defteri farkli ornektir)
        require('../../../../src/services/audit/AuditLogger').AuditLogger.setSink(async (r: any) => { audits.push(r); });
    });
    return run as (uc: any, s: string, o: string, req: any, principal?: any, meta?: any) => Promise<any>;
}

const ADMIN_PR = { sub: 'adm1', ga: true, tv: 0, imp: false, aud: 'backoffice' };
const UC = { _id: 'adm1', isGlobalAdmin: true };
const ENV = ['ADMIN_API_ONLY'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
    saved = Object.fromEntries(ENV.map(k => [k, process.env[k]]));
    audits = [];
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    jest.restoreAllMocks();
});
const settle = () => new Promise(r => setTimeout(r, 5));

describe('backoffice audit: karar yetenek effect alanindan (servis adi regex\'inden degil)', () => {
    it('AdminService DISINDAKI servisin yazmasi da yazilir (backoffice.write: surface, actorType, onBehalfOf, reason, reqId alani)', async () => {
        const run = loadRun();
        await run(UC, 'IntegrationConfigService', 'publish', { integrationCode: 'x' }, ADMIN_PR, { ip: '1.1.1.1', surface: 'backoffice', reason: 'TICKET-5 yayin' });
        await settle();
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
            event: 'backoffice.write', result: 'ok', sub: 'adm1', ip: '1.1.1.1', surface: 'backoffice', actorType: 'platform',
            meta: { service: 'IntegrationConfigService', operation: 'publish', effect: 'write', reason: 'TICKET-5 yayin' },
        });
        expect(audits[0].tid).toBeUndefined(); // tenant denetim gorunumune SIZMAZ
    });

    it('hedef tenant (tid/clientId/order) onBehalfOf\'a yazilir; destructive de yazilir; hata da yazilir', async () => {
        const run = loadRun();
        await run(UC, 'AdminService', 'createClient', { tid: 7 }, ADMIN_PR, { surface: 'backoffice' });
        await run(UC, 'AdminService', 'deleteClient', { clientId: 9 }, ADMIN_PR, { surface: 'backoffice', reason: 'TICKET-6 silme talebi' });
        await settle();
        expect(audits.map(a => [a.event, a.onBehalfOf, a.meta.effect])).toEqual([['backoffice.write', 7, 'write'], ['backoffice.write', 9, 'destructive']]);

        audits.length = 0;
        (Fake.prototype as any).deleteClient = async () => { throw new Error('boom'); };
        await expect(run(UC, 'AdminService', 'deleteClient', { clientId: 9 }, ADMIN_PR, { surface: 'backoffice' })).rejects.toThrow('boom');
        await settle();
        expect(audits[0]).toMatchObject({ event: 'backoffice.write', result: 'error' });
    });

    it('AdminService yazmasi backoffice yuzeyinde YALNIZ backoffice.write (eski admin.write ile cift kayit yok); /api yuzeyinde eski admin.write aynen', async () => {
        const run = loadRun();
        await run(UC, 'AdminService', 'createClient', {}, ADMIN_PR, { surface: 'backoffice' });
        await run(UC, 'AdminService', 'createClient', {}, { ...ADMIN_PR, aud: 'web' }, { ip: '2.2.2.2' });
        await settle();
        expect(audits.map(a => a.event)).toEqual(['backoffice.write', 'admin.write']);
        expect(audits[1]).not.toHaveProperty('surface');
    });

    it('hassas okuma backoffice.sensitive_read; hassas olmayan okuma yazilmaz', async () => {
        const run = loadRun();
        await run(UC, 'AdminService', 'getClients', {}, ADMIN_PR, { surface: 'backoffice' });
        await run(UC, 'AdminService', 'getGlobalMetrics', {}, ADMIN_PR, { surface: 'backoffice' });
        await run(UC, 'AdminService', 'getSystemHealth', {}, ADMIN_PR, { surface: 'backoffice' });
        await settle();
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({ event: 'backoffice.sensitive_read', meta: { operation: 'getClients', effect: 'read' }, surface: 'backoffice' });
    });
});

describe('impersonation (bilet, fx) oturumunda yasak islemler', () => {
    const IMP = { sub: 'adm1', tid: 5, ga: true, tv: 0, imp: true, fx: true };
    const UCT = { _id: 'adm1', isGlobalAdmin: true, order: 5 };

    it('yikici (destructive), dis-dunya (external), kullanici yonetimi (users:manage) ve odeme (billing:manage) 403; tenant okuma/yazma serbest', async () => {
        const run = loadRun();
        // AdminService/deleteClient destructive; UserService/createUser users:manage; BillingService/startCheckout external+billing:manage
        for (const [s, o] of [['AdminService', 'deleteClient'], ['UserService', 'createUser']] as const) {
            await expect(run(UCT, s, o, {}, IMP)).rejects.toMatchObject({ statusCode: 403 });
        }
        // odeme
        (Fake.prototype as any).startCheckout = async () => ({});
        const run2 = loadRun({ BillingService: Fake });
        await expect(run2(UCT, 'BillingService', 'startCheckout', {}, IMP)).rejects.toMatchObject({ statusCode: 403 });
        // salt okuma (billing:read) serbest
        await expect(run(UCT, 'BillingService', 'getPlans', {}, IMP)).resolves.toBeDefined();
    });

    it('fx OLMAYAN eski selectStore imp oturumu: davranis DEGISMEZ (ADMIN_API_ONLY kapaliyken)', async () => {
        const run = loadRun();
        await expect(run(UCT, 'UserService', 'createUser', {}, { ...IMP, fx: undefined })).resolves.toBeDefined();
    });

    it('ADMIN_API_ONLY=true: fx olmayan imp oturumu da ayni kisitlamaya girer', async () => {
        process.env.ADMIN_API_ONLY = 'true';
        const run = loadRun();
        await expect(run(UCT, 'UserService', 'createUser', {}, { ...IMP, fx: undefined })).rejects.toMatchObject({ statusCode: 403 });
    });

    it('imp olmayan (normal ga / tenant admin) etkilenmez', async () => {
        const run = loadRun();
        await expect(run({ order: 5, roleCode: 'ROLE_ADMIN' }, 'UserService', 'createUser', {}, { sub: 'u', tid: 5, ga: false, tv: 0, imp: false })).resolves.toBeDefined();
    });
});

describe('ADMIN_API_ONLY bayragi (Asama 3 hazirligi)', () => {
    it('varsayilan (kapali): /api uzerinde platformAdmin islemi eskisi gibi calisir', async () => {
        delete process.env.ADMIN_API_ONLY;
        const run = loadRun();
        await expect(run(UC, 'AdminService', 'getGlobalMetrics', {}, { ...ADMIN_PR, aud: 'web' }, { ip: '1.1.1.1' })).resolves.toEqual({ ok: 1 });
        await expect(run(UC, 'SecurityService', 'selectStore', { clientId: 5 }, { ...ADMIN_PR, aud: 'web' })).resolves.toBeDefined();
    });

    it('acik: /api uzerinde platformAdmin islemleri (selectStore dahil) 403 ADMIN_API_ONLY; tenant islemleri ve backoffice yuzeyi etkilenmez', async () => {
        process.env.ADMIN_API_ONLY = 'true';
        const run = loadRun();
        const webGa = { ...ADMIN_PR, aud: 'web' };
        for (const [s, o] of [['AdminService', 'getGlobalMetrics'], ['SecurityService', 'selectStore'], ['IntegrationConfigService', 'publish']]) {
            await expect(run(UC, s, o, {}, webGa, { ip: '1.1.1.1' })).rejects.toMatchObject({ statusCode: 403, code: 'ADMIN_API_ONLY' });
        }
        await expect(run(UC, 'AdminService', 'getGlobalMetrics', {}, ADMIN_PR, { surface: 'backoffice' })).resolves.toEqual({ ok: 1 });
        await expect(run({ order: 5, roleCode: 'ROLE_ADMIN' }, 'UserService', 'createUser', {}, { sub: 'u', tid: 5, ga: false, tv: 0, imp: false })).resolves.toBeDefined();
    });
});

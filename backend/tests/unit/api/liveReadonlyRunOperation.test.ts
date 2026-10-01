// LIVE-RO: RunOperation kablolaması. Dış-yazma RPC'si canlı salt-okuma kipinde servis ÖRNEKLENMEDEN 423 alır; okuma/içe alma çalışır; kip kapalıyken davranış aynı.
// Gerçek capability kaydı/OPERATION_POLICY kullanılır; servisler sahtedir. DB/Redis/ağ YOK.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const calls: string[] = [];
class Fake {
    constructor(public clientId: any, public request: any) { calls.push('ctor'); }
    async init() { calls.push('init'); }
    async approveOrder() { calls.push('approveOrder'); return 'approved'; }
    async testConnection() { calls.push('testConnection'); return 'ok'; }
    async requestFetchFromPlatform() { calls.push('requestFetchFromPlatform'); return 'queued'; }
    async batchCreator() { calls.push('batchCreator'); return 'pushed'; }
}

function loadRun() {
    let run: any;
    jest.isolateModules(() => {
        jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { OrderService: Fake, IntegrationService: Fake } }));
        jest.doMock('../../../src/api/requestValidation', () => ({ validateRpcRequest: (_s: string, _o: string, b: any) => b }));
        run = require('../../../src/api/RunOperation').default;
    });
    return run as (uc: any, s: string, o: string, req: any, principal?: any) => Promise<any>;
}
const PR = { sub: 'u1', tid: 1, ga: false, tv: 0, imp: false };
const UC = { order: 1, owner: true };
const prev = process.env.LIVE_READONLY;

beforeEach(() => { calls.length = 0; });
afterEach(() => { if (prev === undefined) delete process.env.LIVE_READONLY; else process.env.LIVE_READONLY = prev; jest.restoreAllMocks(); });

describe('RunOperation x LIVE_READONLY', () => {
    it('kip AÇIK: approveOrder ve batchCreator 423 LIVE_READONLY; servis HİÇ örneklenmez', async () => {
        process.env.LIVE_READONLY = 'true';
        const run = loadRun();
        for (const [s, o] of [['OrderService', 'approveOrder'], ['IntegrationService', 'batchCreator']]) {
            await expect(run(UC, s, o, {}, PR)).rejects.toMatchObject({ statusCode: 423, code: 'LIVE_READONLY' });
        }
        expect(calls).toEqual([]);
    });
    it('kip AÇIK: testConnection ve requestFetchFromPlatform (içe alma) çalışır', async () => {
        process.env.LIVE_READONLY = 'true';
        const run = loadRun();
        await expect(run(UC, 'IntegrationService', 'testConnection', { integrationCode: 'trendyol' }, PR)).resolves.toBe('ok');
        await expect(run(UC, 'IntegrationService', 'requestFetchFromPlatform', { integrationCode: 'trendyol' }, PR)).resolves.toBe('queued');
    });
    it('kip KAPALI: approveOrder normal çalışır (davranış değişmez)', async () => {
        delete process.env.LIVE_READONLY;
        const run = loadRun();
        await expect(run(UC, 'OrderService', 'approveOrder', { orderId: '1' }, PR)).resolves.toBe('approved');
    });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import * as policy from '../../src/integration/modules/common/security/liveReadonlyPolicy';

// `import * as` ad alanı sarmalayıcısı salt-okunurdur; gerçek modül nesnesi gerekir.
/* eslint-disable @typescript-eslint/no-require-imports */
const http: any = require('http');
const https: any = require('https');
/* eslint-enable @typescript-eslint/no-require-imports */

// Auto-install kapalı: guard yalnızca bu dosyada kurulur ve sonunda geri alınır (diğer testleri etkilemesin).
process.env.EGRESS_GUARD_NO_AUTOINSTALL = '1';
process.env.LIVE_READONLY_GUARD_NO_AUTOINSTALL = '1';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const egress = require('../../dev-tools/egress-guard.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require('../../dev-tools/live-readonly-guard.js');

/**
 * GÜVENLİK: GERÇEK AĞA HİÇ DOKUNMAZ. http/https.request ve fetch guard kurulmadan ÖNCE sahte "ağ" ile değiştirilir; guard bunun ÜSTÜNE kurulur.
 * Guard bozuk olsa bile hiçbir gerçek istek çıkamaz (sahte istek nesneleri yalnızca çağrıları kaydeder).
 */
class FakeReq extends EventEmitter {
    written: Buffer[] = [];
    ended = false;
    write = jest.fn((c: any) => { this.written.push(Buffer.from(c)); return true; });
    end = jest.fn((c?: any) => { if (c && typeof c !== 'function') this.written.push(Buffer.from(c)); this.ended = true; return this; }); // gerçek ClientRequest.end(cb) biçimini de kabul eder
    destroy = jest.fn((err?: Error) => { if (err) this.emit('error', err); return this; });
}
const realHttpRequest = http.request, realHttpGet = http.get, realHttpsRequest = https.request, realHttpsGet = https.get;
const realFetch = globalThis.fetch;
const netHttp = jest.fn((..._a: any[]) => new FakeReq());
const netHttps = jest.fn((..._a: any[]) => new FakeReq());
const netFetch = jest.fn(async (..._a: any[]) => ({ ok: true } as any));
const logs: string[] = [];

const soap = (op: string) => `<soapenv:Envelope><soapenv:Body><sch:${op}><auth/></sch:${op}></soapenv:Body></soapenv:Envelope>`;
const blocked = (fn: () => any) => { try { fn(); } catch (e: any) { return e; } return undefined; };

beforeAll(() => {
    (http as any).request = netHttp; (http as any).get = netHttp;
    (https as any).request = netHttps; (https as any).get = netHttps;
    (globalThis as any).fetch = netFetch;
    egress.install();
    guard.install({ policy, allowTokenRefresh: [], log: (m: string) => logs.push(m) });
});
afterAll(() => {
    guard.uninstall();
    egress.uninstall();
    (http as any).request = realHttpRequest; (http as any).get = realHttpGet;
    (https as any).request = realHttpsRequest; (https as any).get = realHttpsGet;
    (globalThis as any).fetch = realFetch;
});
beforeEach(() => { netHttp.mockClear(); netHttps.mockClear(); netFetch.mockClear(); logs.length = 0; });

describe('live-readonly-guard (Katman A: http/https/fetch)', () => {
    it('izinli host + GET geçer (https.request ve https.get)', () => {
        expect(blocked(() => https.request({ hostname: 'apigw.trendyol.com', method: 'GET', path: '/integration/x' }))).toBeUndefined();
        expect(netHttps).toHaveBeenCalledTimes(1);
        const r: any = https.get('https://apigw.trendyol.com/integration/y');
        expect(netHttps).toHaveBeenCalledTimes(2);
        expect(r.end).toBeDefined();
    });
    it('POST/PUT/PATCH/DELETE izinli host\'ta bile bloklu: LIVE_READONLY_BLOCKED, ağ katmanına ULAŞMAZ, log değersiz', () => {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
            const e = blocked(() => https.request({ hostname: 'apigw.trendyol.com', method, path: '/integration/product/sellers/123456789/products?secret=zzz', headers: { authorization: 'Bearer SECRETTOKEN' } }));
            expect(e?.code).toBe('LIVE_READONLY_BLOCKED');
        }
        expect(netHttps).not.toHaveBeenCalled();
        const all = logs.join('\n');
        expect(all).toContain('host=apigw.trendyol.com');
        expect(all).toContain('method=POST');
        expect(all).not.toContain('SECRETTOKEN');
        expect(all).not.toContain('secret=zzz');
        expect(all).not.toContain('123456789');
    });
    it('token POST (Pazarama) geçer; Ideasoft token (varsayılan) bloklu', () => {
        expect(blocked(() => https.request({ hostname: 'isortagimgiris.pazarama.com', method: 'POST', path: '/connect/token' }))).toBeUndefined();
        expect(netHttps).toHaveBeenCalledTimes(1);
        expect(blocked(() => https.request({ hostname: 'a.myideasoft.com', method: 'POST', path: '/oauth/v2/token' }))?.code).toBe('LIVE_READONLY_BLOCKED');
        expect(netHttps).toHaveBeenCalledTimes(1);
    });
    it('N11 SOAP okuma operasyonu geçer (gövde tamponlanıp aynen yazılır)', () => {
        const req: any = https.request({ hostname: 'api.n11.com', method: 'POST', path: '/ws/productService.wsdl' });
        expect(netHttps).toHaveBeenCalledTimes(1);
        const inner: FakeReq = netHttps.mock.results[0].value as FakeReq;
        const ended = jest.fn();
        req.end(soap('GetProductListRequest'), undefined, ended);
        expect(inner.ended).toBe(true);
        expect(Buffer.concat(inner.written).toString()).toContain('GetProductListRequest');
        expect(inner.destroy).not.toHaveBeenCalled();
    });
    it('N11 SOAP yazma operasyonu (SaveProduct / UpdateStock) bloklu: istek yok, HİÇ bayt yazılmaz', async () => {
        for (const op of ['SaveProductRequest', 'UpdateProductStockBySellerCodeRequest']) {
            netHttps.mockClear();
            const req: any = https.request({ hostname: 'api.n11.com', method: 'POST', path: '/ws/productService.wsdl' });
            const inner: FakeReq = netHttps.mock.results[0].value as FakeReq;
            const errP = new Promise<any>(res => inner.once('error', res));
            req.write(Buffer.from('<x>'));
            req.end(soap(op));
            const err = await errP;
            expect(err.code).toBe('LIVE_READONLY_BLOCKED');
            expect(err.operation).toBe(op);
            expect(inner.written).toHaveLength(0);
            expect(inner.ended).toBe(false);
        }
        expect(logs.join('\n')).toContain('operation=SaveProductRequest');
    });
    it('bilinmeyen host (R2/S3, CDN, SMTP vb.) GET bile olsa bloklu; loopback geçer', () => {
        expect(blocked(() => https.request({ hostname: 'cdn.dsmcdn.com', method: 'GET', path: '/a.jpg' }))?.code).toBe('LIVE_READONLY_BLOCKED');
        expect(blocked(() => https.request('https://bucket.r2.cloudflarestorage.com/x'))?.code).toBe('LIVE_READONLY_BLOCKED');
        expect(netHttps).not.toHaveBeenCalled();
        expect(blocked(() => http.request({ hostname: '127.0.0.1', port: 5001, method: 'POST', path: '/api/x' }))).toBeUndefined();
        expect(netHttp).toHaveBeenCalledTimes(1);
    });
    it('LLM saglayicilari (ADR-0034 BR-5): cikarim POST geçer (fetch + https.request); baska POST ve yabanci host bloklu', async () => {
        await (globalThis as any).fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}' });
        await (globalThis as any).fetch('https://api.openai.com/v1/models/gpt-4.1');
        await (globalThis as any).fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse', { method: 'POST', body: '{}' });
        expect(netFetch).toHaveBeenCalledTimes(3);
        await expect((globalThis as any).fetch('https://api.openai.com/v1/files', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'LIVE_READONLY_BLOCKED' });
        await expect((globalThis as any).fetch('https://api.llm-evil.example/v1/messages', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'LIVE_READONLY_BLOCKED' });
        expect(netFetch).toHaveBeenCalledTimes(3);
        expect(blocked(() => https.request({ hostname: 'api.openai.com', method: 'POST', path: '/v1/chat/completions' }))).toBeUndefined();
        expect(blocked(() => https.request({ hostname: 'api.openai.com', method: 'POST', path: '/v1/fine_tuning/jobs' }))?.code).toBe('LIVE_READONLY_BLOCKED');
        expect(egress.isAllowedHost('api.anthropic.com')).toBe(true); // TCP katmani (canli kip: izinli host listesi)
    });
    it('http (https olmayan) dış host bloklu', () => {
        expect(blocked(() => http.request({ hostname: 'apigw.trendyol.com', method: 'GET', path: '/' }))?.code).toBe('LIVE_READONLY_BLOCKED');
    });
    it('fetch: GET izinli host geçer; POST ve bilinmeyen host reddedilir', async () => {
        await (globalThis as any).fetch('https://api.trendyol.com/x');
        expect(netFetch).toHaveBeenCalledTimes(1);
        await expect((globalThis as any).fetch('https://api.trendyol.com/x', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'LIVE_READONLY_BLOCKED' });
        await expect((globalThis as any).fetch('https://evil.example.com/x')).rejects.toMatchObject({ code: 'LIVE_READONLY_BLOCKED' });
        await expect((globalThis as any).fetch('not a url')).rejects.toMatchObject({ code: 'LIVE_READONLY_BLOCKED' });
        expect(netFetch).toHaveBeenCalledTimes(1);
    });
    it('TCP katmanı: izinli pazaryeri host\'u + loopback geçer, diğerleri EGRESS_BLOCKED yolunda', () => {
        expect(egress.isAllowedHost('apigw.trendyol.com')).toBe(true);
        expect(egress.isAllowedHost('abc.myideasoft.com')).toBe(true);
        expect(egress.isAllowedHost('127.0.0.1')).toBe(true);
        expect(egress.isAllowedHost('mongodbcluster.4ndov.mongodb.net')).toBe(false);
        expect(egress.isAllowedHost('smtp.zoho.com')).toBe(false);
    });
});

describe('live-readonly-guard.preflight (süreç öncesi kapılar)', () => {
    it('Atlas/SRV DB_URL ile süreç BAŞLAMAZ (exit 1)', () => {
        const exit = jest.fn();
        const env: any = { DB_URL: 'mongodb+srv://u:p@mongodbcluster.4ndov.mongodb.net/x' };
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(guard.preflight(policy, env, exit)).toBe(false);
        expect(exit).toHaveBeenCalledWith(1);
        spy.mockRestore();
    });
    it('yerel DB_URL geçer; LIVE_READONLY=1 kurulur; mock kipleri ZORLA kapatılır', () => {
        const exit = jest.fn();
        const env: any = { DB_URL: 'mongodb://127.0.0.1:27017/{{DBNAME}}', TY_MOCK_MODE: 'true', N11_MOCK_MODE: 'true', HEPSIBURADA_MOCK_MODE: 'false' };
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(guard.preflight(policy, env, exit)).toBe(true);
        expect(exit).not.toHaveBeenCalled();
        expect(env.LIVE_READONLY).toBe('1');
        expect(env.TY_MOCK_MODE).toBe('false');
        expect(env.N11_MOCK_MODE).toBe('false');
        spy.mockRestore();
    });
    it('politika (dist) yüklenemezse süreç BAŞLAMAZ (fail-closed)', () => {
        const exit = jest.fn();
        const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(guard.preflight(null, { DB_URL: 'mongodb://127.0.0.1/x' } as any, exit)).toBe(false);
        expect(exit).toHaveBeenCalledWith(1);
        spy.mockRestore();
    });
});

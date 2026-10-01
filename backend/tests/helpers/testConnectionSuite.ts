// INT-01 testConnection: adaptör başına ortak birim testi paketi. Gerçek ağ YOK (127.0.0.1 yerel sunucu).
// Her adaptör testi yalnız fabrika + beklenen yol/parametre + sır listesi verir; eşleme/yan etkisizlik/sızıntı burada sınanır.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import type { IncomingMessage, ServerResponse } from 'http';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { startLocalServer, type LocalServerHandle } from './localHttpServer';

export interface TestConnectionSpec {
    name: string;
    timeoutEnv: string;
    build(baseUrl: string): any;
    /** Beklenen okuma isteği: yol (sorgusuz) ve sorgu parçaları. */
    expect: { path: string; queryIncludes?: string[] };
    /** Hiçbir sonuçta görünmemesi gereken sır/PII değerleri. */
    secrets: string[];
    /** Ek uçlar (ör. OAuth token) için istek yönlendirmesi; true dönerse istek işlenmiş sayılır. */
    preHandle?: (req: IncomingMessage, res: ServerResponse) => boolean;
    /** Token vb. hazırlığı (ör. Ideasoft). */
    prepare?(adapter: any): void;
}

export function runTestConnectionSuite(spec: TestConnectionSpec): void {
    let srv: LocalServerHandle | undefined;
    let status = 200;
    const seen: Array<{ method?: string; url?: string }> = [];
    const handler = (req: IncomingMessage, res: ServerResponse) => {
        if (spec.preHandle?.(req, res)) return;
        seen.push({ method: req.method, url: req.url });
        res.writeHead(status, { 'Content-Type': 'application/json', ...(status === 429 ? { 'Retry-After': '3600' } : {}) });
        res.end(JSON.stringify({ content: [], data: [], items: [], message: 'pii.leak@example.invalid Bearer abc', totalPages: 1 }));
    };
    const make = async () => {
        srv = await startLocalServer(handler);
        const a = spec.build(srv.baseUrl);
        spec.prepare?.(a);
        return a;
    };

    beforeAll(() => { ResilientHttpClient.setTestDelayScale(0.001); });
    afterAll(() => { ResilientHttpClient.setTestDelayScale(1); });
    beforeEach(() => {
        status = 200; seen.length = 0;
        jest.spyOn(console, 'log').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        ResilientHttpClient.resetAllState();
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        if (srv) { await srv.close(); srv = undefined; }
        delete process.env[spec.timeoutEnv];
    });

    describe(`${spec.name}.testConnection`, () => {
        it('200 -> {ok:true, code:OK}; tek GET, beklenen hafif okuma ucu', async () => {
            const a = await make();
            await expect(a.testConnection()).resolves.toEqual({ ok: true, code: 'OK' });
            expect(seen).toHaveLength(1);
            expect(seen[0].method).toBe('GET');
            const [path, query = ''] = (seen[0].url ?? '').split('?');
            expect(path).toBe(spec.expect.path);
            for (const q of spec.expect.queryIncludes ?? []) expect(query).toContain(q);
        });

        it.each([401, 403])('%i -> AUTH_FAILED', async (s) => {
            status = s;
            const a = await make();
            const r = await a.testConnection();
            expect(r).toMatchObject({ ok: false, code: 'AUTH_FAILED' });
        });

        it('429 -> RATE_LIMITED', async () => {
            status = 429;
            const a = await make();
            await expect(a.testConnection()).resolves.toMatchObject({ ok: false, code: 'RATE_LIMITED' });
        });

        it('500 -> UNREACHABLE', async () => {
            status = 500;
            const a = await make();
            await expect(a.testConnection()).resolves.toMatchObject({ ok: false, code: 'UNREACHABLE' });
        });

        it('zaman aşımı -> UNREACHABLE', async () => {
            process.env[spec.timeoutEnv] = '50';
            srv = await startLocalServer((req, res) => {
                if (spec.preHandle?.(req, res)) return;
                setTimeout(() => { try { res.writeHead(200); res.end('{}'); } catch { /* iptal */ } }, 400);
            });
            const a = spec.build(srv.baseUrl); spec.prepare?.(a);
            await expect(a.testConnection()).resolves.toMatchObject({ ok: false, code: 'UNREACHABLE' });
        });

        it('bağlantı reddi (dinleyen yok) -> UNREACHABLE', async () => {
            const tmp = await startLocalServer((_q, res) => { res.writeHead(200); res.end('{}'); });
            const dead = tmp.baseUrl; await tmp.close();
            const a = spec.build(dead); spec.prepare?.(a);
            await expect(a.testConnection()).resolves.toMatchObject({ ok: false, code: 'UNREACHABLE' });
        });

        it('404 (beklenmeyen) -> UNKNOWN; sonuçta sır/PII/ham gövde yok', async () => {
            status = 404;
            const a = await make();
            const r = await a.testConnection();
            expect(r).toMatchObject({ ok: false, code: 'UNKNOWN' });
            for (const s of [...spec.secrets, 'pii.leak', 'Bearer abc']) expect(JSON.stringify(r)).not.toContain(s);
        });

        it('401 detail alanı kısa sabit metindir ve sır içermez', async () => {
            status = 401;
            const a = await make();
            const r = await a.testConnection();
            expect((r.detail ?? '').length).toBeLessThan(160);
            for (const s of [...spec.secrets, 'pii.leak', 'Bearer abc']) expect(JSON.stringify(r)).not.toContain(s);
        });
    });
}

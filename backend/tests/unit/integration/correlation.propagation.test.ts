/**
 * [F-06] Correlation id taşınması: HTTP isteği -> servis -> adaptör (ResilientHttpClient) ve motor işi -> adaptör.
 * Pazaryeri isteklerine `X-Correlation-Id` EKLENMEZ (yalnız kendi servislerimize, `correlationHeaders()`).
 * Gerçek ağ YOK: 127.0.0.1 yerel sunucu. Sıralama: log satırları stdout JSON'dan yakalanır.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage } from 'http';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { createRequestIdMiddleware } from '../../../src/api/http/requestId';
import { runWithJobContext, getContext, correlationHeaders, CORRELATION_HEADER, withContextPatch, runWithContext } from '@platform/core/context';
import { startLocalServer, LocalServerHandle, jsonResponder } from '../../helpers/localHttpServer';
import { captureLogs, LogCapture } from '../../helpers/logCapture';

let cap: LogCapture;
let srv: LocalServerHandle | undefined;
beforeEach(() => { cap = captureLogs(); ResilientHttpClient.resetAllState(); });
afterEach(async () => {
    cap.restore();
    if (srv) { await srv.close(); srv = undefined; }
    ResilientHttpClient.resetAllState();
});

/** Express middleware'ini sahte req/res ile çalıştırır; `next` içinde `fn`'i (async) koşturur. */
function viaHttpMiddleware<T>(incomingId: string | undefined, fn: () => Promise<T>): Promise<T> {
    const mw = createRequestIdMiddleware();
    const req: any = { headers: incomingId ? { 'x-request-id': incomingId } : {}, method: 'GET', path: '/api/OrderService/list' };
    const res: any = { setHeader: jest.fn(), locals: {} };
    return new Promise<T>((resolve, reject) => { mw(req, res, () => { fn().then(resolve, reject); }); });
}

describe('HTTP isteği -> servis -> adaptör', () => {
    it('gelen X-Request-Id, adaptör çağrısı log satırında correlationId olarak KORUNUR (+ entegrasyon/operasyon/kaynak/süre alanları)', async () => {
        srv = await startLocalServer(jsonResponder(200, { ok: true }));
        const client = new ResilientHttpClient('trendyol', 3, { timeoutMs: 1000 });
        // "servis" katmanı: bağlamı hiç bilmeden adaptörü çağırır
        const service = async () => { await client.get(`${srv!.baseUrl}/orders`, undefined, { operation: 'fetchOrders' }); };
        await viaHttpMiddleware('client-req-0001', service);

        const ok = cap.find((l) => l.code === 'HTTP_CALL_OK')!;
        expect(ok).toBeDefined();
        expect(ok).toMatchObject({
            correlationId: 'client-req-0001', level: 'debug', source: 'adapter-trendyol', integrationCode: 'trendyol',
            operation: 'fetchOrders', tenantId: 3, retries: 0, kind: 'read', httpStatus: 200,
        });
        expect(typeof ok.durationMs).toBe('number');
    });

    it('geçersiz/eksik X-Request-Id -> yeni id üretilir; aynı istek içindeki tüm adaptör logları AYNI id\'yi taşır', async () => {
        srv = await startLocalServer(jsonResponder(200, { ok: true }));
        const client = new ResilientHttpClient('n11', 4, { timeoutMs: 1000 });
        await viaHttpMiddleware(undefined, async () => {
            await client.get(`${srv!.baseUrl}/a`, undefined, { operation: 'op1' });
            await client.get(`${srv!.baseUrl}/b`, undefined, { operation: 'op2' });
        });
        const ids = cap.filter((l) => l.code === 'HTTP_CALL_OK').map((l) => l.correlationId);
        expect(ids).toHaveLength(2);
        expect(ids[0]).toBeTruthy();
        expect(ids[0]).toBe(ids[1]);
    });

    it('iki eşzamanlı istek birbirinin correlation id\'sini KARIŞTIRMAZ', async () => {
        srv = await startLocalServer(jsonResponder(200, { ok: true }));
        const client = new ResilientHttpClient('trendyol', 5, { timeoutMs: 1000 });
        await Promise.all([
            viaHttpMiddleware('req-aaaa-0001', () => client.get(`${srv!.baseUrl}/a`, undefined, { operation: 'opA' })),
            viaHttpMiddleware('req-bbbb-0002', () => client.get(`${srv!.baseUrl}/b`, undefined, { operation: 'opB' })),
        ]);
        const byOp = Object.fromEntries(cap.filter((l) => l.code === 'HTTP_CALL_OK').map((l) => [l.operation, l.correlationId]));
        expect(byOp).toEqual({ opA: 'req-aaaa-0001', opB: 'req-bbbb-0002' });
    });
});

describe('motor işi -> adaptör', () => {
    it('iş başına YENİ correlation id üretilir ve adaptör loguna akar; iki iş farklı id alır', async () => {
        srv = await startLocalServer(jsonResponder(200, { ok: true }));
        const client = new ResilientHttpClient('hepsiburada', 6, { timeoutMs: 1000 });
        const run = () => runWithJobContext({ source: 'worker', tenantId: 6, integrationCode: 'hepsiburada', operation: 'order.sync' },
            () => client.get(`${srv!.baseUrl}/x`, undefined, { operation: 'listOrders' }));
        await run(); await run();
        const ids = cap.filter((l) => l.code === 'HTTP_CALL_OK').map((l) => String(l.correlationId));
        expect(ids[0]).toMatch(/^job-/);
        expect(ids[0]).not.toBe(ids[1]);
    });

    it('kuyruğa taşınan correlationId (webhook/producer) worker bağlamında AYNEN kullanılır', async () => {
        srv = await startLocalServer(jsonResponder(200, { ok: true }));
        const client = new ResilientHttpClient('trendyol', 7, { timeoutMs: 1000 });
        await runWithJobContext({ source: 'worker', correlationId: 'ord-carried-0001', tenantId: 7, operation: 'order.sync' },
            () => client.get(`${srv!.baseUrl}/x`, undefined, { operation: 'listOrders' }));
        expect(cap.find((l) => l.code === 'HTTP_CALL_OK')!.correlationId).toBe('ord-carried-0001');
    });

    it('adaptör başarısızlığı: HTTP_CALL_FAILED (warn) errorClass + durum + retry sayısı + correlationId taşır', async () => {
        srv = await startLocalServer(jsonResponder(401, { message: 'yetkisiz' }));
        const client = new ResilientHttpClient('trendyol', 8, { timeoutMs: 1000, retry: { baseDelayMs: 5 } });
        await expect(runWithJobContext({ source: 'worker', correlationId: 'job-fail-0001', tenantId: 8 },
            () => client.get(`${srv!.baseUrl}/x`, undefined, { operation: 'listOrders' }))).rejects.toMatchObject({ code: 'AUTH' });
        const l = cap.find((x) => x.code === 'HTTP_CALL_FAILED')!;
        expect(l).toMatchObject({ level: 'warn', correlationId: 'job-fail-0001', errorClass: 'AUTH', httpStatus: 401, retries: 0, kind: 'read', operation: 'listOrders', integrationCode: 'trendyol' });
    });

    it('OrderQueueProducer -> BullMQ worker-runner: iş verisindeki correlationId + tenant/entegrasyon bağlamı OrderWorker.process içinde görünür', async () => {
        let processor: ((job: any) => Promise<unknown>) | undefined;
        let seen: ReturnType<typeof getContext>;
        await jest.isolateModulesAsync(async () => {
            jest.doMock('bullmq', () => ({
                Worker: jest.fn((_q: string, fn: (job: any) => Promise<unknown>) => { processor = fn; return { on: jest.fn() }; }),
                Job: class { }, UnrecoverableError: class extends Error { },
            }));
            jest.doMock('@services/redis/RedisService', () => ({ RedisService: { getConnectionConfig: () => ({}) } }));
            jest.doMock('@integration/engine/order/OrderWorker', () => ({
                OrderWorker: class { async process() { seen = require('@platform/core/context').getContext(); return {}; } },
            }));
            const { startOrderWorkerConsumer } = require('@integration/engine/order/worker-runner');
            startOrderWorkerConsumer();
            await processor!({ data: { clientId: 12, integrationCode: 'trendyol', correlationId: 'ord-from-queue-1' } });
            expect(seen).toMatchObject({ requestId: 'ord-from-queue-1', tenantId: 12, integrationCode: 'trendyol', operation: 'order.sync', source: 'worker' });
            await processor!({ data: { clientId: 13, integrationCode: 'n11' } }); // id yok -> yeni üretilir
            expect(seen!.requestId).toMatch(/^job-/);
            expect(seen!.tenantId).toBe(13);
        });
        jest.dontMock('bullmq'); jest.dontMock('@services/redis/RedisService'); jest.dontMock('@integration/engine/order/OrderWorker');
    });
});

describe('X-Correlation-Id: yalnız KENDİ servislerimize', () => {
    it('pazaryeri (ResilientHttpClient) isteğinde X-Correlation-Id/X-Request-Id başlığı YOK', async () => {
        let received: IncomingMessage['headers'] = {};
        srv = await startLocalServer((req, res) => { received = req.headers; jsonResponder(200, {})(req, res); });
        const client = new ResilientHttpClient('trendyol', 9, { timeoutMs: 1000 });
        await runWithJobContext({ source: 'worker', correlationId: 'job-hdr-0001' }, () => client.get(`${srv!.baseUrl}/x`));
        expect(Object.keys(received).map((k) => k.toLowerCase())).not.toContain('x-correlation-id');
        expect(Object.keys(received).map((k) => k.toLowerCase())).not.toContain('x-request-id');
    });

    it('correlationHeaders(): bağlam varken başlığı verir, yokken boş nesne (kendi servis çağrıları için)', () => {
        expect(correlationHeaders()).toEqual({});
        runWithContext({ requestId: 'req-own-0001' }, () => {
            expect(correlationHeaders()).toEqual({ [CORRELATION_HEADER]: 'req-own-0001' });
        });
    });

    it('statik: ResilientHttpClient correlationHeaders/X-Correlation-Id KULLANMAZ (pazaryerine sızmasın)', () => {
        const src = fs.readFileSync(path.join(__dirname, '../../../src/integration/modules/common/http/ResilientHttpClient.ts'), 'utf8');
        expect(src).not.toMatch(/correlationHeaders|X-Correlation-Id|CORRELATION_HEADER/);
    });
});

describe('withContextPatch', () => {
    it('correlation id KORUNUR, alanlar yalnız blok içinde değişir; dış bağlam bozulmaz', () => {
        runWithContext({ requestId: 'req-patch-0001', tenantId: 1 }, () => {
            withContextPatch({ integrationCode: 'n11', operation: 'x' }, () => {
                expect(getContext()).toMatchObject({ requestId: 'req-patch-0001', tenantId: 1, integrationCode: 'n11', operation: 'x' });
            });
            expect(getContext()!.integrationCode).toBeUndefined();
        });
    });
});

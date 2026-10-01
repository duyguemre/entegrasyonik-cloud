/**
 * [F-06] ResilientHttpClient: her dış çağrı için süre / durum / errorClass / retry sayısı log'u ve platform+operasyon
 * etiketli metrik sayaçları (tenant etiketi YOK — ADR-0017 Karar 2.3). Gerçek ağ YOK (127.0.0.1 yerel sunucu).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';
import { recordIntegrationOperationMetric, normalizeOperationLabel } from '@platform/runtime/metrics/redMetrics';
import { startLocalServer, LocalServerHandle, jsonResponder, sequencedHandler } from '../../helpers/localHttpServer';
import { captureLogs, LogCapture } from '../../helpers/logCapture';

let cap: LogCapture;
let srv: LocalServerHandle | undefined;
beforeEach(() => { cap = captureLogs(); metricsRegistry.resetForTests(); ResilientHttpClient.resetAllState(); });
afterEach(async () => { cap.restore(); if (srv) { await srv.close(); srv = undefined; } ResilientHttpClient.resetAllState(); });

const series = (metric: string) => metricsRegistry.drain().filter((s) => s.metric === metric);

describe('çağrı logu', () => {
    it('başarı: debug HTTP_CALL_OK; retry sonrası başarıda retries sayılır', async () => {
        srv = await startLocalServer(sequencedHandler([jsonResponder(500, {}), jsonResponder(500, {}), jsonResponder(200, { ok: 1 })]));
        const client = new ResilientHttpClient('trendyol', 1, { retry: { baseDelayMs: 5, maxDelayMs: 20 }, timeoutMs: 1000 });
        await client.get(`${srv.baseUrl}/orders`, undefined, { operation: 'fetchOrders' });
        const l = cap.find((x) => x.code === 'HTTP_CALL_OK')!;
        expect(l).toMatchObject({ level: 'debug', retries: 2, kind: 'read', operation: 'fetchOrders', httpStatus: 200 });
        expect(l.durationMs as number).toBeGreaterThanOrEqual(0);
    });

    it('hata: warn HTTP_CALL_FAILED errorClass (UNAVAILABLE) + httpStatus + retries', async () => {
        srv = await startLocalServer(jsonResponder(500, { message: 'kalici' }));
        const client = new ResilientHttpClient('n11', 2, { retry: { maxAttempts: 1, baseDelayMs: 5, maxDelayMs: 10 }, timeoutMs: 1000 });
        await expect(client.get(`${srv.baseUrl}/x`, undefined, { operation: 'fetchOrders' })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        expect(cap.find((x) => x.code === 'HTTP_CALL_FAILED')).toMatchObject({ level: 'warn', errorClass: 'UNAVAILABLE', httpStatus: 500, retries: 1, kind: 'read', integrationCode: 'n11' });
    });

    it('yazma çağrısı kind=write olarak loglanır ve URL sorgusu/gövde log satırında YOK', async () => {
        srv = await startLocalServer(jsonResponder(200, {}));
        const client = new ResilientHttpClient('pazarama', 3, { timeoutMs: 1000 });
        await client.post(`${srv.baseUrl}/products?appSecret=TOP-SECRET-VAL`, { password: 'PW-SECRET-VAL' }, { operation: 'createProducts' });
        const raw = JSON.stringify(cap.lines);
        expect(cap.find((x) => x.code === 'HTTP_CALL_OK')).toMatchObject({ kind: 'write', operation: 'createProducts' });
        expect(raw).not.toContain('TOP-SECRET-VAL');
        expect(raw).not.toContain('PW-SECRET-VAL');
    });
});

describe('metrik sayaçları (platform + operasyon etiketi, tenant YOK)', () => {
    it('başarılı çağrı: integration_op_calls{outcome=ok} + süre histogramı; hata sayacı yok', async () => {
        srv = await startLocalServer(jsonResponder(200, {}));
        const client = new ResilientHttpClient('trendyol', 42, { timeoutMs: 1000 });
        await client.get(`${srv.baseUrl}/orders`, undefined, { operation: 'fetchOrders' });
        const snap = metricsRegistry.drain();
        const calls = snap.find((s) => s.metric === 'integration_op_calls')!;
        expect(calls.labels).toEqual({ integrationCode: 'trendyol', operation: 'fetchOrders', kind: 'read', outcome: 'ok' });
        expect(calls.count).toBe(1);
        const dur = snap.find((s) => s.metric === 'integration_op_duration_ms')!;
        expect(dur.count).toBe(1);
        expect(dur.labels).toEqual({ integrationCode: 'trendyol', operation: 'fetchOrders', kind: 'read' });
        expect(snap.find((s) => s.metric === 'integration_op_errors_total')).toBeUndefined();
    });

    it('hatalı çağrı: outcome=hata sınıfı, integration_op_errors_total{errorClass}, retry sayacı', async () => {
        srv = await startLocalServer(jsonResponder(500, {}));
        const client = new ResilientHttpClient('n11', 43, { retry: { maxAttempts: 2, baseDelayMs: 5, maxDelayMs: 10 }, timeoutMs: 1000 });
        await expect(client.get(`${srv.baseUrl}/o`, undefined, { operation: 'fetchOrders' })).rejects.toBeDefined();
        const snap = metricsRegistry.drain();
        expect(snap.find((s) => s.metric === 'integration_op_calls')!.labels.outcome).toBe('UNAVAILABLE');
        expect(snap.find((s) => s.metric === 'integration_op_errors_total')).toMatchObject({ labels: { integrationCode: 'n11', operation: 'fetchOrders', errorClass: 'UNAVAILABLE' }, count: 1 });
        expect(snap.find((s) => s.metric === 'integration_op_retries_total')!.count).toBe(2);
    });

    it('HİÇBİR op-metriğinde tenantId etiketi yok (farklı tenant, tek seri)', async () => {
        srv = await startLocalServer(jsonResponder(200, {}));
        for (const tenant of [1, 2, 3]) {
            await new ResilientHttpClient('trendyol', tenant, { timeoutMs: 1000 }).get(`${srv.baseUrl}/o`, undefined, { operation: 'fetchOrders' });
        }
        const opSeries = metricsRegistry.drain().filter((s) => s.metric.startsWith('integration_op_'));
        expect(opSeries.every((s) => !('tenantId' in s.labels))).toBe(true);
        expect(opSeries.find((s) => s.metric === 'integration_op_calls')!.count).toBe(3);
    });

    it('recordIntegrationOperationMetric imzası tenantId ALMAZ; operasyon etiketi kardinalite için normalize edilir', () => {
        recordIntegrationOperationMetric({ integrationCode: 'x', operation: 'GET /orders/12345/items/550e8400-e29b-41d4-a716-446655440000', kind: 'read', status: 'ok', durationMs: 5, retries: 0 });
        const s = series('integration_op_calls')[0];
        expect(s.labels.operation).toBe('GET /orders/#/items/<id>');
        expect(normalizeOperationLabel('z'.repeat(100)).length).toBe(60);
        expect(normalizeOperationLabel('')).toBe('unknown');
    });
});

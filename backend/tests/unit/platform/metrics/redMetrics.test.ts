/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 2.2/2.3): RED metrik yardımcıları. Kardinalite kuralı KOD SEVİYESİNDE
 * doğrulanır: `recordHttpRequestMetric` imzası `tenantId` ALMAZ (yapısal olarak sızamaz).
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';
import { recordHttpRequestMetric, recordIntegrationCallMetric, recordUnhandledRejection, statusClassOf } from '@platform/runtime/metrics/redMetrics';

describe('redMetrics', () => {
    beforeEach(() => { metricsRegistry.resetForTests(); });

    it('statusClassOf: 2xx/4xx/5xx doğru sınıflandırır', () => {
        expect(statusClassOf(200)).toBe('2xx');
        expect(statusClassOf(201)).toBe('2xx');
        expect(statusClassOf(404)).toBe('4xx');
        expect(statusClassOf(500)).toBe('5xx');
    });

    it('recordHttpRequestMetric: http_requests sayacı + süre histogramı, tenantId ETİKETİ YOK (Karar 2.3)', () => {
        recordHttpRequestMetric('ProductService/get', 200, 42);
        const snap = metricsRegistry.drain();
        const counter = snap.find((s) => s.metric === 'http_requests')!;
        const hist = snap.find((s) => s.metric === 'http_request_duration_ms')!;
        expect(counter.labels).toEqual({ op: 'ProductService/get', statusClass: '2xx' });
        expect(counter.count).toBe(1);
        expect(hist.sum).toBe(42);
        expect('tenantId' in counter.labels).toBe(false);
    });

    it('recordIntegrationCallMetric: integration_calls{tenantId,integrationCode,outcome} + süre + retries', () => {
        recordIntegrationCallMetric({ integrationCode: 'trendyol', tenantId: 7, status: 'ok', durationMs: 120, retries: 2 });
        const snap = metricsRegistry.drain();
        const counter = snap.find((s) => s.metric === 'integration_calls')!;
        const retries = snap.find((s) => s.metric === 'integration_call_retries_total')!;
        expect(counter.labels).toEqual({ tenantId: '7', integrationCode: 'trendyol', outcome: 'ok' });
        expect(retries.count).toBe(2);
    });

    it('recordIntegrationCallMetric: hata durumunda outcome=code; RATE_LIMITED ayrıca ayrı sayaca yazılır', () => {
        recordIntegrationCallMetric({ integrationCode: 'n11', tenantId: 3, status: 'error', code: 'RATE_LIMITED', durationMs: 10, retries: 0 });
        const snap = metricsRegistry.drain();
        const counter = snap.find((s) => s.metric === 'integration_calls')!;
        const rl = snap.find((s) => s.metric === 'integration_calls_rate_limited_total')!;
        expect(counter.labels.outcome).toBe('RATE_LIMITED');
        expect(rl.count).toBe(1);
        expect(rl.labels).toEqual({ tenantId: '3', integrationCode: 'n11' });
    });

    it('retries=0 ise integration_call_retries_total serisi HİÇ açılmaz', () => {
        recordIntegrationCallMetric({ integrationCode: 'n11', tenantId: 3, status: 'ok', durationMs: 10, retries: 0 });
        const snap = metricsRegistry.drain();
        expect(snap.find((s) => s.metric === 'integration_call_retries_total')).toBeUndefined();
    });

    it('recordUnhandledRejection: unhandled_rejections sayacını artırır', () => {
        recordUnhandledRejection();
        recordUnhandledRejection();
        const snap = metricsRegistry.drain();
        expect(snap.find((s) => s.metric === 'unhandled_rejections')!.count).toBe(2);
    });
});

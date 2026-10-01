/**
 * YENİ DAVRANIŞ (ADR-0017 Karar 2.2, K4 kapanışı): `installIntegrationCallMetricsBridge()` çağrı-başı
 * `IntegrationCallMetrics` yazımını `MetricsRegistry`e yönlendirir (eski Mongo `create()` ARTIK ÇAĞRILMAZ).
 */
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { IntegrationCallMetrics } from '@integration/modules/common/http/IntegrationCallMetrics';
import { installIntegrationCallMetricsBridge, uninstallIntegrationCallMetricsBridgeForTests } from '@integration/modules/common/http/IntegrationCallMetricsBridge';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';

describe('IntegrationCallMetricsBridge', () => {
    beforeEach(() => { metricsRegistry.resetForTests(); });
    afterEach(() => { uninstallIntegrationCallMetricsBridgeForTests(); metricsRegistry.resetForTests(); });

    it('köprü kurulunca IntegrationCallMetrics.record MetricsRegistry\'e yazar (eski sink ÇAĞRILMAZ)', async () => {
        installIntegrationCallMetricsBridge();
        await IntegrationCallMetrics.record({
            integrationCode: 'trendyol', operation: 'GET /orders', clientId: 9, status: 'ok', durationMs: 55, retries: 1, circuitState: 'closed',
        });
        const snap = metricsRegistry.drain();
        const counter = snap.find((s) => s.metric === 'integration_calls')!;
        expect(counter).toBeDefined();
        expect(counter.labels).toEqual({ tenantId: '9', integrationCode: 'trendyol', outcome: 'ok' });
    });

    it('hata durumunda outcome=code aktarılır (breaker/rate-limit ayrımı korunur)', async () => {
        installIntegrationCallMetricsBridge();
        await IntegrationCallMetrics.record({
            integrationCode: 'n11', operation: 'GET /orders', clientId: 3, status: 'error', code: 'AUTH', durationMs: 10, retries: 0, circuitState: 'open',
        });
        const snap = metricsRegistry.drain();
        expect(snap.find((s) => s.metric === 'integration_calls')!.labels.outcome).toBe('AUTH');
    });

    it('uninstall sonrası eski defaultSink davranışına döner (köprü ARTIK çağrılmaz)', async () => {
        installIntegrationCallMetricsBridge();
        uninstallIntegrationCallMetricsBridgeForTests();
        // customSink undefined -> defaultSink DB'ye gitmeye çalışır; burada gerçek DB yok, bu yüzden yalnızca
        // metrics registry'e YAZILMADIĞINI doğruluyoruz (defaultSink'in kendi hata yutma davranışı ayrı test'te).
        await IntegrationCallMetrics.record({ integrationCode: 'x', operation: 'GET /x', clientId: 1, status: 'ok', durationMs: 1, retries: 0, circuitState: 'closed' }).catch(() => {});
        expect(metricsRegistry.drain().find((s) => s.metric === 'integration_calls')).toBeUndefined();
    });
});

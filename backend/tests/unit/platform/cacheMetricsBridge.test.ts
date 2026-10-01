// ADR-0002/0017 (faz4-int-wp3): cache sayaçları MetricsRegistry'ye akar. DB yok.
import { describe, it, expect, afterAll } from '@jest/globals';
import { Cache, resetCacheForTests, nodeCache } from '@utils/decorator/cache';
import { metricsRegistry } from '../../../src/platform/runtime/metrics/MetricsRegistry';
import { installCacheMetricsBridge, uninstallCacheMetricsBridgeForTests } from '../../../src/platform/runtime/metrics/cacheMetricsBridge';

class S { clientId = 'T1'; @Cache({ scope: 'tenant', ttl: '1m', context: 'bridge' }) async f() { return 1; } }
afterAll(() => { uninstallCacheMetricsBridgeForTests(); nodeCache.close(); });

describe('cacheMetricsBridge', () => {
    it('miss/set/hit olayları cache_events serisine yazılır; tenant etikette YOK', async () => {
        resetCacheForTests(); metricsRegistry.resetForTests();
        installCacheMetricsBridge();
        await new S().f(); await new S().f();
        const series = metricsRegistry.drain().filter((x) => x.metric === 'cache_events');
        const by = Object.fromEntries(series.map((x) => [x.labels.event, x.count]));
        expect(by).toMatchObject({ miss: 1, set: 1, hit: 1 });
        expect(series.every((x) => x.labels.family === 'bridge.S.f' && !('tenantId' in x.labels))).toBe(true);
    });
});

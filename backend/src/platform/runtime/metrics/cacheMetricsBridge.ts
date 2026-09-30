// ADR-0002 (faz4-int-wp3) + ADR-0017: @Cache olay sayaçlarını MetricsRegistry'ye köprüler.
// `utils` yaprak katman olduğundan (platform'u içe aktaramaz) yön tersine çevrilir: cache.ts sink sunar, köprü burada.
// Seri: cache_events{family, event}; tenant kimliği etikete KONMAZ (kardinalite/PII).
import { setCacheMetricSink } from '@utils/decorator/cache';
import { metricsRegistry } from './MetricsRegistry';

export function installCacheMetricsBridge(): void {
    setCacheMetricSink((family, event, delta) => {
        metricsRegistry.incCounter('cache_events', { family, event }, delta);
    });
}

export function uninstallCacheMetricsBridgeForTests(): void {
    setCacheMetricSink(undefined);
}

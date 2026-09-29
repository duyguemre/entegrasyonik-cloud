// ADR-0017 Aşama B (Karar 2) + ADR-0016 §1.1 (`platform/runtime/metrics`): tek dış yüzey.
export { metricsRegistry, MetricsRegistry, HISTOGRAM_BUCKETS_MS, MAX_SERIES } from './MetricsRegistry';
export type { MetricLabels, MetricSeriesSnapshot } from './MetricsRegistry';
export { recordHttpRequestMetric, recordIntegrationCallMetric, recordUnhandledRejection, statusClassOf } from './redMetrics';
export type { IntegrationCallMetricInput } from './redMetrics';
export { truncateToBucket, encodeSeriesKey, buildBulkWriteOps, flushMetricsOnce } from './metricsFlush';
export type { Resolution, BulkWriteOp, MetricRollupBulkWriteModel, FlushMetricsDeps } from './metricsFlush';
export {
    fingerprintOfErrorEvent, buildErrorEventUpsertOp, recordErrorEvent,
    flushErrorEventBuffersForTests, resetErrorEventStateForTests,
} from './errorEvents';
export type { ErrorEventInput, ErrorEventSource, ErrorEventSample, ErrorEventModel, ErrorEventUpsertOp } from './errorEvents';
export { installErrorEventLoggerBridge, uninstallErrorEventLoggerBridgeForTests } from './loggerBridge';
export { MetricsFlushScheduler } from './MetricsFlushScheduler';
export { productionMetricRollupModel, productionErrorEventModel, resetMetricsProdDepsForTests } from './prodDeps';

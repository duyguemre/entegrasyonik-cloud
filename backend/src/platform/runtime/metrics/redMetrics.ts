// ADR-0017 Karar 2.2 (RED metrikleri): iki seri ailesi -- HTTP (RunOperation RPC katmanı) ve entegrasyon çağrısı
// (ResilientHttpClient/IntegrationCallMetrics köprüsü, bkz. `integrationCallMetricsBridge.ts`). Kardinalite kuralı
// (Karar 2.3) BURADA, kod seviyesinde zorlanır: `tenantId` yalnızca entegrasyon çağrısı serisinde; HTTP serisinde
// KESİNLİKLE yok (fonksiyon imzası tenantId ALMAZ -- yapısal olarak imkânsız).
import { metricsRegistry } from './MetricsRegistry';

export function statusClassOf(statusCode: number): string {
    const c = Math.floor(statusCode / 100);
    return c >= 2 && c <= 5 ? `${c}xx` : 'xxx';
}

/**
 * RED -- HTTP (Karar 2.2): `http_requests{op, statusClass}` + `http_request_duration_ms` histogramı.
 * `op` = "Service/method" (RunOperation'ın kendi service/operation dizeleri); `tenantId` etiketi YOK (Karar 2.3).
 * Asla fırlatmaz (registry metotları zaten kendi içinde yutuyor); ana akışı bloklamaz (senkron, DB YOK).
 */
export function recordHttpRequestMetric(op: string, statusCode: number, durationMs: number): void {
    const labels = { op, statusClass: statusClassOf(statusCode) };
    metricsRegistry.incCounter('http_requests', labels, 1);
    metricsRegistry.observeHistogram('http_request_duration_ms', labels, durationMs);
}

export interface IntegrationCallMetricInput {
    integrationCode: string;
    /** ResilientHttpClient/IntegrationCallMetrics `clientId` -- tenant numarası (bazen string). */
    tenantId: string | number;
    status: 'ok' | 'error';
    /** Bilinen `IntegrationError.code` (ör. AUTH/RATE_LIMITED/UNAVAILABLE); `status:'ok'` ise yok. */
    code?: string;
    durationMs: number;
    retries: number;
}

/**
 * RED -- entegrasyon çağrısı (Karar 2.2): `integration_calls{tenantId, integrationCode, outcome}` + süre
 * histogramı + `retries` toplamı + `rate_limited` sayacı. `tenantId` BİLEREK dahil (Karar 2.3: varlık-kapsamlı
 * seri istisnası). `kind` (read|write) etiketi EKSİK: `IntegrationCallMetrics.record()` girdisinde bu bilgi YOK
 * (ResilientHttpClient bunu taşımıyor) -- ayrı bir BULGU (rapor), bu köprü ResilientHttpClient'ı YENİDEN YAZMAZ.
 */
export function recordIntegrationCallMetric(entry: IntegrationCallMetricInput): void {
    const labels = {
        tenantId: String(entry.tenantId),
        integrationCode: entry.integrationCode,
        outcome: entry.status === 'ok' ? 'ok' : (entry.code ?? 'ERROR'),
    };
    metricsRegistry.incCounter('integration_calls', labels, 1);
    metricsRegistry.observeHistogram('integration_call_duration_ms', labels, entry.durationMs);
    if (entry.retries > 0) metricsRegistry.incCounter('integration_call_retries_total', labels, entry.retries);
    if (entry.status === 'error' && entry.code === 'RATE_LIMITED') {
        metricsRegistry.incCounter('integration_calls_rate_limited_total', { tenantId: labels.tenantId, integrationCode: labels.integrationCode }, 1);
    }
}

/** Süreç metrikleri (Karar 2.2 "Süreç"): yalnızca K12 (`unhandled_rejections`) bu görevde uygulanır. */
export function recordUnhandledRejection(): void {
    metricsRegistry.incCounter('unhandled_rejections', {}, 1);
}

// --- [F-06] Platform + operasyon kapsamlı entegrasyon çağrı metrikleri (tenant etiketi YOK; Karar 2.3 kardinalite) ---

/** Etiket kardinalitesini sınırlar: UUID/uzun hex -> <id>, sayı -> #, 60 karaktere kırpılır. */
export function normalizeOperationLabel(op: string): string {
    return String(op ?? 'unknown')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
        .replace(/\b[0-9a-f]{16,}\b/gi, '<id>')
        .replace(/\d+/g, '#')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60) || 'unknown';
}

export interface IntegrationOperationMetricInput {
    integrationCode: string;
    operation: string;
    kind: 'read' | 'write';
    status: 'ok' | 'error';
    /** Hata sınıfı (IntegrationError.code); `status:'error'` ise. */
    errorClass?: string;
    durationMs: number;
    retries: number;
}

/**
 * Çağrı süresi + hata oranı sayaçları: `integration_op_calls{integrationCode,operation,kind,outcome}`,
 * `integration_op_duration_ms{integrationCode,operation,kind}`, `integration_op_errors_total{integrationCode,operation,errorClass}`,
 * `integration_op_retries_total{integrationCode,operation}`. `tenantId` etiketi KASITLI olarak YOK (imza almaz).
 */
export function recordIntegrationOperationMetric(e: IntegrationOperationMetricInput): void {
    const operation = normalizeOperationLabel(e.operation);
    const base = { integrationCode: e.integrationCode, operation };
    const outcome = e.status === 'ok' ? 'ok' : (e.errorClass ?? 'ERROR');
    metricsRegistry.incCounter('integration_op_calls', { ...base, kind: e.kind, outcome }, 1);
    metricsRegistry.observeHistogram('integration_op_duration_ms', { ...base, kind: e.kind }, e.durationMs);
    if (e.status === 'error') metricsRegistry.incCounter('integration_op_errors_total', { ...base, errorClass: e.errorClass ?? 'ERROR' }, 1);
    if (e.retries > 0) metricsRegistry.incCounter('integration_op_retries_total', base, e.retries);
}

/**
 * [ADR-0030 X1] Giden hız kovası sayaçları (tenant etiketi YOK; seri sayısı = pazaryeri x grup, küçük):
 * `integration_rate_bucket_waits_total{integrationCode,group}` (kovada bekleyen çağrı sayısı),
 * `integration_rate_bucket_wait_ms_total{...}` (toplam bekleme), `integration_rate_bucket_rejects_total{...}`
 * (pazaryerinin 429 ile reddettiği ve tükenen çağrılar), `integration_barcode_price_deferred_total{integrationCode}`.
 */
export function recordRateBucketMetric(e: { integrationCode: string; group: string; event: 'wait' | 'reject' | 'barcode_deferred'; waitMs?: number }): void {
    const labels = { integrationCode: e.integrationCode, group: e.group };
    if (e.event === 'wait') {
        metricsRegistry.incCounter('integration_rate_bucket_waits_total', labels, 1);
        if (e.waitMs && e.waitMs > 0) metricsRegistry.incCounter('integration_rate_bucket_wait_ms_total', labels, Math.round(e.waitMs));
    } else if (e.event === 'reject') {
        metricsRegistry.incCounter('integration_rate_bucket_rejects_total', labels, 1);
    } else {
        metricsRegistry.incCounter('integration_barcode_price_deferred_total', { integrationCode: e.integrationCode }, 1);
    }
}

/** Platform sipariş içe alma sayacı `orders_ingested_total{channel}` (tenant etiketi YOK; yalnız YENİ sipariş). Asla fırlatmaz. */
export const ORDERS_INGESTED_METRIC = 'orders_ingested_total';
export function recordOrdersIngested(channel: string, count = 1): void {
    if (count > 0) metricsRegistry.incCounter(ORDERS_INGESTED_METRIC, { channel: String(channel || 'unknown') }, count);
}

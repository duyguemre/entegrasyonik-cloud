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

// F-09: yanıt sözleşmesi testleri için ortak yardımcı (metrik + API_SCHEMA_DRIFT logu yakalama).
import { metricsRegistry } from '@platform/runtime/metrics';
import { observeResponseSchema, type ResponseContract } from '@integration/modules/common/contract/observeResponseSchema';
import { captureLogs, type LogCapture } from './logCapture';

export interface DriftObservation {
    ok: boolean;
    fields: string[];
    logs: Record<string, unknown>[];
    counterFields: string[];
    cap: LogCapture;
}

export function observe(contract: ResponseContract, data: unknown): DriftObservation {
    metricsRegistry.resetForTests();
    const cap = captureLogs();
    const ok = observeResponseSchema(contract, data, { clientId: 7 });
    const logs = cap.filter(l => l.code === 'API_SCHEMA_DRIFT') as Record<string, unknown>[];
    const counterFields = metricsRegistry.drain()
        .filter(s => s.metric === 'integration_response_schema_mismatch'
            && s.labels.integration === contract.integration && s.labels.endpoint === contract.endpoint)
        .map(s => s.labels.field);
    cap.restore();
    return { ok, fields: logs.map(l => String(l.field)), logs, counterFields, cap };
}

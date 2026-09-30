import { eventLog } from '@platform/core/logger';

const log = eventLog('engine', 'IntegrationCallMetrics');
// ADR-0006 Karar 1: her HTTP çağrısı için best-effort metrik. AuditLogger deseniyle aynı yaklaşım:
// yazma asenkron, hata YUTULUR ve loglanır, isteği ASLA düşürmez/geciktirmez.

export interface IntegrationCallMetricEntry {
    integrationCode: string;
    operation: string;
    clientId: string | number;
    status: 'ok' | 'error';
    durationMs: number;
    retries: number;
    circuitState: 'closed' | 'open' | 'half_open';
    code?: string;
    httpStatus?: number;
}

export type IntegrationCallMetricSink = (record: Record<string, any>) => Promise<void>;

let customSink: IntegrationCallMetricSink | undefined;

async function defaultSink(record: Record<string, any>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
    const { DatabaseManagerInstance } = (require('@database/DatabaseManager') as typeof import('@database/DatabaseManager'));
    const db = await DatabaseManagerInstance.getApplicationDB();
    await (db as any).getIntegrationCallMetricModel().create(record);
}

export class IntegrationCallMetrics {
    /** Test/özel depolama için. undefined => varsayılan (ApplicationDB.IntegrationCallMetrics). */
    public static setSink(sink: IntegrationCallMetricSink | undefined): void { customSink = sink; }

    private static isDisabled(): boolean {
        return process.env.INTEGRATION_METRICS_DISABLED === 'true' && !customSink;
    }

    /** ASLA fırlatmaz/reddetmez; çağıran `void` ile bırakabilir. */
    public static record(entry: IntegrationCallMetricEntry): Promise<void> {
        try {
            if (this.isDisabled()) return Promise.resolve();
            const record: Record<string, any> = {
                kind: 'http',
                at: new Date(),
                integrationCode: entry.integrationCode,
                operation: String(entry.operation).slice(0, 200),
                clientId: String(entry.clientId),
                status: entry.status,
                durationMs: Math.max(0, Math.round(entry.durationMs)),
                retries: entry.retries,
                circuitState: entry.circuitState,
            };
            if (entry.code) record.code = entry.code;
            if (entry.httpStatus !== undefined) record.httpStatus = entry.httpStatus;
            const sink = customSink ?? defaultSink;
            return Promise.resolve().then(() => sink(record)).catch((e: any) => {
                log.error('INTEGRATIONCALLMETRICS_KAYIT_YAZILAMADI_BEST_EFFORT', 'kayıt yazılamadı (best-effort):', { err: e });
            });
        } catch (e: any) {
            log.error('INTEGRATIONCALLMETRICS_KAYIT_HAZIRLANAMADI_BEST_EFFORT', 'kayıt hazırlanamadı (best-effort):', { err: e });
            return Promise.resolve();
        }
    }
}

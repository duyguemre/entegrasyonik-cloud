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
    const { DatabaseManagerInstance } = await import('@database/DatabaseManager');
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
                console.error('[IntegrationCallMetrics] kayıt yazılamadı (best-effort):', e?.message);
            });
        } catch (e: any) {
            console.error('[IntegrationCallMetrics] kayıt hazırlanamadı (best-effort):', e?.message);
            return Promise.resolve();
        }
    }
}

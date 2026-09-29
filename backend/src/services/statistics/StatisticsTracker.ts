import os from 'os';
import type { OperationType, OperationStatus } from '@database/application/models/OperationLog';

export interface IOperationLogInput {
    clientId: number;
    integrationCode: string;
    operationType: OperationType;
    status: OperationStatus;
    fetched?: number;
    inserted?: number;
    updated?: number;
    failed?: number;
    skipped?: number;
    durationMs?: number;
    errorMessage?: string;
    operationMode?: string;
    workerType?: string;
    triggeredBy?: string;
    startedAt: Date;
}

/**
 * Tüm orchestrator ve worker operasyonlarının istatistiklerini
 * fire-and-forget pattern ile ApplicationDB'ye kaydeder.
 *
 * Ana akışı asla bloklamaz; herhangi bir hata sessizce yutulur.
 */
export class StatisticsTracker {
    private static appDB: any = null;
    private static readonly POD_NAME = process.env.POD_NAME || os.hostname();

    /** Orchestrator start() metodlarından bir kez çağrılır. */
    public static init(appDB: any): void {
        if (!this.appDB) this.appDB = appDB;
    }

    /** Tek bir operasyon kaydı yazar. */
    public static track(input: IOperationLogInput): void {
        if (!this.appDB) return;
        setImmediate(async () => {
            try {
                await this.appDB.getOperationLogModel().create(this.normalize(input));
            } catch { /* silent */ }
        });
    }

    /** Birden fazla operasyon kaydını toplu yazar (insertMany). */
    public static trackMany(inputs: IOperationLogInput[]): void {
        if (!this.appDB || !inputs.length) return;
        setImmediate(async () => {
            try {
                await this.appDB.getOperationLogModel().insertMany(
                    inputs.map(i => this.normalize(i)),
                    { ordered: false }
                );
            } catch { /* silent */ }
        });
    }

    private static normalize(input: IOperationLogInput): Record<string, any> {
        return {
            ...input,
            fetched:    input.fetched    ?? 0,
            inserted:   input.inserted   ?? 0,
            updated:    input.updated    ?? 0,
            failed:     input.failed     ?? 0,
            skipped:    input.skipped    ?? 0,
            durationMs: input.durationMs ?? 0,
            podName:    this.POD_NAME,
        };
    }
}

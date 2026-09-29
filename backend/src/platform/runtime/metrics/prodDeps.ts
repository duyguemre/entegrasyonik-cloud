// `platform/runtime/metrics/{metricsFlush,errorEvents}` için üretim bağımlılıklarını (ApplicationDB modelleri)
// TEMBEL çözer -- `platform/runtime/scheduler/prodDeps.ts` ile AYNI desen (Sv5 -> Sv3 `database` bağımlılığı
// katman kuralına uygundur, ADR-0016 §1.2). Testler bu dosyayı KULLANMAZ (modeller doğrudan sahte enjekte edilir).
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { MetricRollupBulkWriteModel } from './metricsFlush';
import { ErrorEventModel } from './errorEvents';

let cachedMetricRollup: MetricRollupBulkWriteModel | undefined;
let cachedErrorEvent: ErrorEventModel | undefined;

export async function productionMetricRollupModel(): Promise<MetricRollupBulkWriteModel> {
    if (cachedMetricRollup) return cachedMetricRollup;
    const db = await DatabaseManagerInstance.getApplicationDB();
    cachedMetricRollup = (db as any).getMetricRollupModel();
    return cachedMetricRollup!;
}

export async function productionErrorEventModel(): Promise<ErrorEventModel> {
    if (cachedErrorEvent) return cachedErrorEvent;
    const db = await DatabaseManagerInstance.getApplicationDB();
    cachedErrorEvent = (db as any).getErrorEventModel();
    return cachedErrorEvent!;
}

/** Yalnız testler için: önbelleği düşürür. */
export function resetMetricsProdDepsForTests(): void {
    cachedMetricRollup = undefined;
    cachedErrorEvent = undefined;
}

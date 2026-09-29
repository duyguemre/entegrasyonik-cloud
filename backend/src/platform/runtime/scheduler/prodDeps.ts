// Üretimde `runJob`'un ihtiyaç duyduğu 3 Mongo modelini `DatabaseManagerInstance.getApplicationDB()`'den
// TEMBEL (yalnız ilk gerçek kullanımda) çözer. Testler bu dosyayı KULLANMAZ -- `RunJobDeps` doğrudan sahte
// modellerle enjekte edilir (bkz. `tests/unit/platform/scheduler/*`); bu, `platform/runtime` katmanının
// `database`'e (Sv3) bağımlı olmasına izin veren katman kuralıyla (ADR-0016 §1.2, Sv5 -> 0-4) uyumludur.
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { getPodIdentity } from '@utils/podIdentity';
import { RunJobDeps } from './runJob';

let cached: RunJobDeps | undefined;

/** Üretim `RunJobDeps`'i (tembel; ApplicationDB henüz hazır değilse ilk çağrıda bekler). */
export async function productionSchedulerDeps(): Promise<RunJobDeps> {
    if (cached) return cached;
    const applicationDB = await DatabaseManagerInstance.getApplicationDB();
    cached = {
        leaseModel: applicationDB.getJobLeaseModel(),
        jobStateModel: applicationDB.getJobStateModel(),
        jobRunModel: applicationDB.getJobRunModel(),
        pod: getPodIdentity(),
    };
    return cached;
}

/** Yalnız testler için: önbelleği düşürür. */
export function resetProductionSchedulerDepsForTests(): void {
    cached = undefined;
}

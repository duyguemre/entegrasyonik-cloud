// ADR-0016 §2 (`platform/runtime/scheduler`) + ADR-0017 Karar 3 (`JobRunRegistry`): tek dış yüzey.
//   import { defineJob, startJob, stopAllJobs } from '@platform/runtime/scheduler';
//   const controller = startJob(defineJob({ name, everyMs, maxDurationMs, run }));   // üretim: DB lease tembel çözülür
//   controller.stop();                                                              // testte: startJob(def, fakeDeps)
import { logger as rootLogger } from '@platform/core/logger';
import { scheduleJob, JobController } from './scheduleJob';
import { RunJobDeps } from './runJob';
import { productionSchedulerDeps } from './prodDeps';
import { JobDefinition } from './types';

export { defineJob } from './types';
export type { JobDefinition, JobOutcome, JobRunContext, JobScope, JobBudget, JobStatus, RunType, Trigger } from './types';
export { runJobOnce } from './runJob';
export type { RunJobDeps, RunJobResult } from './runJob';
export { scheduleJob } from './scheduleJob';
export type { JobController } from './scheduleJob';
export { productionSchedulerDeps, resetProductionSchedulerDepsForTests } from './prodDeps';
export {
    deriveJobHealth, isHistoryWorthy, toRedactedError, truncateOutputSummary, deriveStatus, skippedReasonOf,
    resetHistoryThrottleForTests,
} from './registry';
export type { DerivedHealth, DeriveHealthOptions, JobStateDoc } from './registry';

const activeControllers = new Map<string, JobController>();
/** ADR-0017 R6: bu surecte baslatilan islerin beklenen araligi/suresi/kritikligi (JobState bunlari saklamaz). */
const startedDefs = new Map<string, { everyMs: number; maxDurationMs: number; critical: boolean }>();

/** R6 alarm kaynagi icin: bu surecte baslatilan islerin tanim ozeti. */
export function listStartedJobDefs(): Array<{ name: string; everyMs: number; maxDurationMs: number; critical: boolean }> {
    return [...startedDefs.entries()].map(([name, d]) => ({ name, ...d }));
}

/**
 * Bir işi başlatır. `deps` verilmezse üretim bağımlılıkları (`ApplicationDB`) TEMBEL çözülür (`stop()` çözüm
 * tamamlanmadan çağrılırsa iç zamanlayıcı hiç BAŞLAMADAN durdurulmuş sayılır -- yarış GÜVENLİDİR).
 * `deps` verilirse (testler) senkron olarak HEMEN `scheduleJob` çağrılır.
 */
export function startJob(def: JobDefinition, deps?: RunJobDeps): JobController {
    startedDefs.set(def.name, { everyMs: def.everyMs, maxDurationMs: def.maxDurationMs, critical: def.criticality === 'critical' });
    if (deps) {
        const inner = scheduleJob(def, deps);
        activeControllers.set(def.name, inner);
        return controllerFor(def.name, inner);
    }

    let stoppedBeforeInit = false;
    let inner: JobController | undefined;

    productionSchedulerDeps()
        .then((resolved) => {
            if (stoppedBeforeInit) return;
            inner = scheduleJob(def, resolved);
            activeControllers.set(def.name, inner);
        })
        .catch((err) => rootLogger.error({ err, job: def.name }, 'startJob: üretim bağımlılıkları çözülemedi'));

    return {
        stop() {
            stoppedBeforeInit = true;
            inner?.stop();
            activeControllers.delete(def.name);
        },
        overlapSkippedCount: () => inner?.overlapSkippedCount() ?? 0,
        isRunning: () => inner?.isRunning() ?? false,
    };
}

function controllerFor(name: string, inner: JobController): JobController {
    return {
        stop() { inner.stop(); activeControllers.delete(name); },
        overlapSkippedCount: inner.overlapSkippedCount,
        isRunning: inner.isRunning,
    };
}

/**
 * ADR-0016 §2.3 (kapanış): `bootstrap/shutdown.ts`'e BAĞLANACAK fonksiyon (bu görevde yalnız dışa açılır,
 * henüz `entegrasyonik.ts`'e BAĞLANMAZ -- görev talimatı). Tüm aktif zamanlayıcıları durdurur (yeni tur
 * planlanmaz); uçuştaki turun 15 sn beklenmesi/`AbortSignal` iptali gelecek bir görevde eklenir.
 */
export function stopAllJobs(): void {
    for (const controller of activeControllers.values()) controller.stop();
    activeControllers.clear();
}

/** Yalnız testler için: kayıtlı iş sayısı (sızıntı denetimi). */
export function activeJobCountForTests(): number {
    return activeControllers.size;
}

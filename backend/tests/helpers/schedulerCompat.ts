/**
 * ADR-0024 P0-LIFE: eski `*Scheduler.ts` sarmalayicilarinin (silindi) `start(impl, deps)` / `stop()` imzasini,
 * `bootstrap/schedules` kaydi uzerinden yeniden sunar; boylece tasima oncesi yazilmis karakterizasyon testleri
 * DAVRANISI ayni assert'lerle dogrulamaya devam eder (yalniz import satiri degisti).
 */
import { startSchedule, stopSchedules } from '@bootstrap/schedules';
import type { RunJobDeps } from '@platform/runtime/scheduler';

function compat(ids: string[]) {
  return {
    /** Tek-is sarmalayicilar: (impl, deps). Cok-isli (Reconciliation): (internalImpl, externalImpl, deps). */
    start: (...args: any[]) => {
      if (ids.length === 2) {
        const [internal, external, deps] = args;
        startSchedule(ids[0], { impl: internal, deps });
        startSchedule(ids[1], { impl: external, deps });
        return;
      }
      // Eski imza: start(impl?, deps?) -- deps yalniz son arguman olabilir (ExportSignalPoll/MetricsFlush/ConfigHeadPoll: start(deps)).
      const [a, b] = args;
      const noImpl = ['catalog.exportSignalPoll', 'observability.metrics-flush', 'config-head-poll'].includes(ids[0]);
      startSchedule(ids[0], noImpl ? { deps: a as RunJobDeps | undefined } : { impl: a, deps: b as RunJobDeps | undefined });
    },
    stop: () => { ids.forEach((id) => stopSchedules(id)); },
  };
}

export const AllocationSweepScheduler = compat(['stock.allocationSweep']);
export const StockPublishScheduler = compat(['stock.publish']);
export const OversellCompensationScheduler = compat(['stock.oversellCompensation']);
export const ReconciliationScheduler = compat(['stock.internalReconciliation', 'stock.externalReconciliation']);
export const TrialExpiryScheduler = compat(['billing.trialExpiry']);
export const ExportSignalPollScheduler = compat(['catalog.exportSignalPoll']);
export const ProbeScheduler = compat(['compliance.probeRunner']);
export const SourceMonitorScheduler = compat(['compliance.sourceMonitor']);
export const MetricsFlushScheduler = compat(['observability.metrics-flush']);
export const ConfigHeadPollScheduler = compat(['config-head-poll']);

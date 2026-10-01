/**
 * CHARACTERIZATION (ADR-0024 P0-LIFE, adim 2-3): 10 zamanlayici isinin tanimi (ad, aralik, sure siniri, kritiklik,
 * ilk kosu, lease, kapsam) ve rol dagilimi. Tablo, eski `*Scheduler.ts` sarmalayicilarindan ve `entegrasyonik.ts`
 * kapisindan (worker/all: 8 + iki rol-bagimsiz: MetricsFlush, ConfigHeadPoll) BIREBIR alinmistir; sarmalayicilar
 * `bootstrap/schedules`'a tasindiktan sonra AYNI tablo yesil kalmalidir.
 * Gercek DB/Redis/ag YOK: `startJob` yakalayici ile degistirilir.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const captured: any[] = [];
const stops: string[] = [];

jest.mock('@platform/runtime/scheduler', () => ({
  defineJob: (d: any) => d,
  startJob: jest.fn((def: any, deps?: any) => {
    captured.push({ def, deps });
    return { stop: () => { stops.push(def.name); }, overlapSkippedCount: () => 0, isRunning: () => false };
  }),
  stopAllJobs: jest.fn(),
  productionSchedulerDeps: jest.fn(async () => ({ resolved: true })),
}));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
for (const m of [
  '@operations/stock/AllocationSweepJob', '@operations/stock/StockPublishTrigger', '@operations/stock/OversellCompensationJob',
  '@operations/stock/InternalReconciliationJob', '@operations/stock/ExternalReconciliationJob', '@operations/billing/TrialExpiryJob', '@operations/notifications/delivery/createEmailDispatcher', '@operations/notifications/push/createPushDispatcher', '@api/admin/createAttentionPusher',
]) {
  jest.mock(m, () => new Proxy({}, { get: (_t, name) => (name === '__esModule' ? true : class { async run() { return {}; } }) }));
}
jest.mock('@integration/compliance/ProbeRunner', () => ({ runProbes: jest.fn(async () => ({})) }));
jest.mock('@integration/compliance/SourceMonitor', () => ({ runSourceMonitor: jest.fn(async () => ({})) }));
jest.mock('@platform/runtime/metrics/metricsFlush', () => ({ flushMetricsOnce: jest.fn() }));
jest.mock('@platform/runtime/metrics/prodDeps', () => ({ productionMetricRollupModel: jest.fn() }));

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** [ad, everyMs, maxDurationMs, criticality, runOnStart, roleGate] -- roleGate: 'worker' => yalniz worker/all, 'any' => her rol. */
const EXPECTED: Array<[string, number, number, string, string, 'worker' | 'any']> = [
  ['stock.allocationSweep', 15 * MIN, 5 * MIN, 'critical', 'always', 'worker'],
  ['stock.publish', 30 * 1000, 25 * 1000, 'critical', 'always', 'worker'],
  ['stock.oversellCompensation', 5 * MIN, 4 * MIN, 'critical', 'always', 'worker'],
  ['stock.internalReconciliation', HOUR, 30 * MIN, 'normal', 'always', 'worker'],
  ['stock.externalReconciliation', DAY, 2 * HOUR, 'normal', 'ifDue', 'worker'],
  ['billing.trialExpiry', 15 * MIN, 5 * MIN, 'normal', 'always', 'worker'],
  ['catalog.exportSignalPoll', 15 * 1000, 30 * 1000, 'normal', 'always', 'worker'],
  ['compliance.probeRunner', DAY, 5 * MIN, 'normal', 'always', 'worker'],
  ['compliance.sourceMonitor', 7 * DAY, 30 * MIN, 'normal', 'ifDue', 'worker'],
  ['notifications.email-dispatch', 15 * 1000, 60 * 1000, 'normal', 'always', 'worker'],
  ['notifications.push-dispatch', 10 * 1000, 60 * 1000, 'normal', 'always', 'worker'],
  ['notifications.platform-attention-push', 2 * MIN, 60 * 1000, 'normal', 'always', 'worker'],
  ['notifications.announcements', 60 * 1000, 5 * MIN, 'normal', 'always', 'worker'],
  ['alerts.evaluator', 60 * 1000, 60 * 1000, 'normal', 'always', 'worker'],
  ['observability.metrics-flush', 60 * 1000, 30 * 1000, 'normal', 'always', 'any'],
  ['config-head-poll', 15 * 1000, 10 * 1000, 'normal', 'always', 'any'],
];

/** ADAPTER (yeni: bootstrap/schedules kaydi). Eski sarmalayici adaptoru commit 15ce0a4'te; AYNI tablo yesil kaldi. */
async function startFor(role: 'web' | 'worker' | 'all') {
  const { startSchedules } = require('@bootstrap/schedules');
  startSchedules(role);
  await new Promise((r) => setImmediate(r));
}

beforeEach(() => { captured.length = 0; stops.length = 0; jest.resetModules(); });

describe('zamanlayici listesi ve tanimlari (birebir)', () => {
  it('worker rolu: 11 is, tablo ile birebir ayni tanim ve sira (metrik/config isleri sona)', async () => {
    await startFor('worker');
    const got = captured.map((c) => [c.def.name, c.def.everyMs, c.def.maxDurationMs, c.def.criticality, c.def.runOnStart ?? 'always']);
    const want = EXPECTED.map(([n, e, m, c, r]) => [n, e, m, c, r]);
    expect(got.map((g) => g[0]).sort()).toEqual(want.map((w) => w[0]).sort());
    for (const w of want) expect(got).toContainEqual(w);
  });

  it('all rolu worker ile ayni kumeyi baslatir', async () => {
    await startFor('all');
    expect(captured.map((c) => c.def.name).sort()).toEqual(EXPECTED.map((e) => e[0]).sort());
  });

  it('web rolu yalniz rol-bagimsiz iki isi baslatir (metrics-flush, config-head-poll)', async () => {
    await startFor('web');
    expect(captured.map((c) => c.def.name).sort()).toEqual(EXPECTED.filter((e) => e[5] === 'any').map((e) => e[0]).sort());
  });

  it('compliance isleri runType=scheduler + scope=platform tasir', async () => {
    await startFor('worker');
    for (const n of ['compliance.probeRunner', 'compliance.sourceMonitor']) {
      const d = captured.find((c) => c.def.name === n).def;
      expect(d.runType).toBe('scheduler');
      expect(d.scope).toEqual({ level: 'platform' });
    }
  });

  it('yalniz metrics-flush lease KAPALI ve uretim bagimliliklariyla baslar; digerleri deps vermez (tembel)', async () => {
    await startFor('worker');
    const flush = captured.find((c) => c.def.name === 'observability.metrics-flush');
    expect(flush.deps).toMatchObject({ resolved: true, leaseEnabled: false });
    for (const c of captured.filter((x) => x.def.name !== 'observability.metrics-flush')) expect(c.deps).toBeUndefined();
  });

  it('ikinci start() ayni is icin no-op (idempotent)', async () => {
    await startFor('worker');
    const n = captured.length;
    await startFor('worker');
    expect(captured.length).toBe(n);
  });
});

describe('rol x is matrisi (scheduleIdsForRole) ve durdurma', () => {
  it('scheduleIdsForRole: web=2 rol-bagimsiz, worker=all=11; sira eski entegrasyonik.ts sirasi', () => {
    const { scheduleIdsForRole } = require('@bootstrap/schedules');
    expect(scheduleIdsForRole('web')).toEqual(['observability.metrics-flush', 'config-head-poll']);
    expect(scheduleIdsForRole('worker')).toEqual(EXPECTED.map((e) => e[0]));
    expect(scheduleIdsForRole('all')).toEqual(scheduleIdsForRole('worker'));
  });

  it('stopSchedules(): tum kontrolculer durdurulur ve stopAllJobs cagrilir; ardindan yeniden baslatilabilir', async () => {
    await startFor('worker');
    const { stopSchedules } = require('@bootstrap/schedules');
    const { stopAllJobs } = require('@platform/runtime/scheduler');
    stopSchedules();
    expect(stops.sort()).toEqual(EXPECTED.map((e) => e[0]).sort());
    expect(stopAllJobs).toHaveBeenCalled();
    captured.length = 0;
    await startFor('web');
    expect(captured).toHaveLength(2);
  });

  it('metrics-flush: uretim bagimliliklari cozulmeden stop() cagrilirsa is HIC baslamaz', async () => {
    const { startSchedule, stopSchedules } = require('@bootstrap/schedules');
    startSchedule('observability.metrics-flush');
    stopSchedules('observability.metrics-flush');
    await new Promise((r) => setImmediate(r));
    expect(captured).toHaveLength(0);
  });
});

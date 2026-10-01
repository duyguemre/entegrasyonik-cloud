// LIVE-RO Katman B (açılış): zamanlayıcılar, ön koşul denetimi ve açılış özeti. DB/Redis/ağ YOK.
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@platform/runtime/scheduler', () => ({
  defineJob: (d: any) => d,
  startJob: jest.fn(() => ({ stop: () => undefined, overlapSkippedCount: () => 0, isRunning: () => false })),
  stopAllJobs: jest.fn(),
  productionSchedulerDeps: jest.fn(async () => ({})),
}));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
for (const m of [
  '@operations/stock/AllocationSweepJob', '@operations/stock/StockPublishTrigger', '@operations/stock/OversellCompensationJob',
  '@operations/stock/InternalReconciliationJob', '@operations/stock/ExternalReconciliationJob', '@operations/billing/TrialExpiryJob', '@operations/notifications/delivery/createEmailDispatcher',
]) {
  jest.mock(m, () => new Proxy({}, { get: (_t, name) => (name === '__esModule' ? true : class { async run() { return {}; } }) }));
}
jest.mock('@integration/compliance/ProbeRunner', () => ({ runProbes: jest.fn(async () => ({})) }));
jest.mock('@integration/compliance/SourceMonitor', () => ({ runSourceMonitor: jest.fn(async () => ({})) }));
jest.mock('@platform/runtime/metrics/metricsFlush', () => ({ flushMetricsOnce: jest.fn() }));
jest.mock('@platform/runtime/metrics/prodDeps', () => ({ productionMetricRollupModel: jest.fn() }));

import { scheduleIdsForRole, SCHEDULES, LIVE_READONLY_SCHEDULE_IDS } from '../../../src/bootstrap/schedules';
import { assertLiveReadonlyBoot, liveReadonlyBootSummary, LIVE_READONLY_GUARD_MARK } from '../../../src/bootstrap/liveReadonly';

const KEYS = ['LIVE_READONLY', 'DB_URL', 'TY_MOCK_MODE', 'N11_MOCK_MODE', 'LIVE_READONLY_ALLOW_TOKEN_REFRESH'];
let saved: Record<string, string | undefined>;
beforeEach(() => { saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]])); });
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  delete (globalThis as any)[LIVE_READONLY_GUARD_MARK];
});
const thrown = (fn: () => void) => { try { fn(); } catch (e: any) { return e; } return undefined; };

describe('schedules x LIVE_READONLY', () => {
  it('kip AÇIKKEN yalnız metrics-flush + config-head-poll başlar (stok yayını, mutabakat, probe, kaynak izleyici, e-posta KAPALI)', () => {
    process.env.LIVE_READONLY = 'true';
    expect(scheduleIdsForRole('all')).toEqual(['observability.metrics-flush', 'config-head-poll']);
    expect(scheduleIdsForRole('worker')).toEqual(['observability.metrics-flush', 'config-head-poll']);
    for (const id of ['stock.publish', 'stock.allocationSweep', 'stock.oversellCompensation', 'stock.externalReconciliation', 'catalog.exportSignalPoll', 'compliance.probeRunner', 'compliance.sourceMonitor', 'notifications.email-dispatch', 'billing.trialExpiry']) {
      expect(scheduleIdsForRole('all')).not.toContain(id);
    }
  });
  it('kip KAPALIYKEN tüm zamanlayıcılar (davranış değişmez)', () => {
    delete process.env.LIVE_READONLY;
    expect(scheduleIdsForRole('all')).toEqual(SCHEDULES.map(s => s.id));
  });
  it('izinli liste kayıtlı işlere karşılık gelir', () => {
    for (const id of LIVE_READONLY_SCHEDULE_IDS) expect(SCHEDULES.map(s => s.id)).toContain(id);
  });
});

describe('assertLiveReadonlyBoot', () => {
  it('kip kapalıysa no-op', () => {
    delete process.env.LIVE_READONLY;
    expect(thrown(() => assertLiveReadonlyBoot())).toBeUndefined();
  });
  it('ağ katmanı (live-readonly-guard) yüklü değilse BAŞLAMAZ', () => {
    process.env.LIVE_READONLY = 'true'; process.env.DB_URL = 'mongodb://127.0.0.1:27017/x';
    expect(thrown(() => assertLiveReadonlyBoot())?.message).toMatch(/live-readonly-guard/);
  });
  it('Atlas (SRV / yerel olmayan) DB_URL ile BAŞLAMAZ', () => {
    process.env.LIVE_READONLY = 'true'; (globalThis as any)[LIVE_READONLY_GUARD_MARK] = true;
    process.env.DB_URL = 'mongodb+srv://u:p@mongodbcluster.4ndov.mongodb.net/x';
    const e = thrown(() => assertLiveReadonlyBoot());
    expect(e?.message).toMatch(/yerel/);
    expect(String(e?.message)).not.toContain('mongodbcluster'); // hata iletisi değer sızdırmaz
    process.env.DB_URL = 'mongodb://127.0.0.1:27017,atlas-shard.mongodb.net:27017/x';
    expect(thrown(() => assertLiveReadonlyBoot())).toBeDefined();
  });
  it('mock kipi açıksa BAŞLAMAZ', () => {
    process.env.LIVE_READONLY = 'true'; (globalThis as any)[LIVE_READONLY_GUARD_MARK] = true;
    process.env.DB_URL = 'mongodb://127.0.0.1:27017/x'; process.env.TY_MOCK_MODE = 'true';
    expect(thrown(() => assertLiveReadonlyBoot())?.message).toMatch(/Mock/);
  });
  it('tüm ön koşullar sağlanınca geçer', () => {
    process.env.LIVE_READONLY = 'true'; (globalThis as any)[LIVE_READONLY_GUARD_MARK] = true;
    process.env.DB_URL = 'mongodb://127.0.0.1:27017/{{DBNAME}}'; process.env.TY_MOCK_MODE = 'false';
    expect(thrown(() => assertLiveReadonlyBoot())).toBeUndefined();
  });
});

describe('liveReadonlyBootSummary (sır YOK)', () => {
  it('izinli host, kapalı/açık işçi ve zamanlayıcı özeti', () => {
    process.env.LIVE_READONLY = 'true'; process.env.DB_URL = 'mongodb://user' + ':secretpw@127.0.0.1:27017/x';
    const s = liveReadonlyBootSummary();
    expect(s.allowedHosts).toEqual(expect.arrayContaining(['apigw.trendyol.com', 'api.n11.com', '*.myideasoft.com']));
    expect(s.stoppedEngine.join(' ')).toMatch(/ExportOrchestrator/);
    expect(s.stoppedEngine.join(' ')).toMatch(/OrderOrchestrator/);
    expect(s.runningEngine.join(' ')).toMatch(/ImportOrchestrator/);
    expect(s.stoppedSchedules).toContain('stock.publish');
    expect(s.tokenRefreshAllowedFor).toEqual([]);
    expect(JSON.stringify(s)).not.toContain('secretpw');
  });
});

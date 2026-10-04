// ADR-0024 P0-LIFE (D5) / ADR-0016 §2: zamanlayici isinin TEK kaydi. Onceki 10 ince `*Scheduler.ts` sarmalayicisinin
// (ad, aralik, sure siniri, kritiklik, ilk-kosu, lease, kapsam) davranisi BIREBIR korunur
// (tests/unit/bootstrap/schedules.characterization.test.ts). Dagitik kilit + POD_NAME `platform/runtime/scheduler`
// icindedir (degismedi). Rol kapisi: 'worker' -> yalniz worker/all (IntegrationEngine ile ayni kapi); 'any' -> HER rol.
import type { AppRole } from '@health/HealthCheck';
import { config } from '@config';
import { startJob, defineJob, stopAllJobs, productionSchedulerDeps } from '@platform/runtime/scheduler';
import type { JobController, JobDefinition, JobOutcome, RunJobDeps } from '@platform/runtime/scheduler';
import { logger } from '@platform/core/logger';
import { flushMetricsOnce } from '@platform/runtime/metrics/metricsFlush';
import { productionMetricRollupModel } from '@platform/runtime/metrics/prodDeps';
import { AllocationSweepJob } from '@operations/stock/AllocationSweepJob';
import { StockPublishTrigger } from '@operations/stock/StockPublishTrigger';
import { createPricePublishTrigger } from '@operations/pricing/createPricePublishTrigger';
import { PRICE_PUBLISH_JOB_NAME } from '@operations/pricing/PricePublishTrigger';
import { CHANNEL_RULE_JOB_NAME, createChannelRuleJobDeps, runChannelRuleJob, type ChannelRuleJobDeps } from '@operations/pricing/channelRuleJob';
import { OversellCompensationJob } from '@operations/stock/OversellCompensationJob';
import { InternalReconciliationJob } from '@operations/stock/InternalReconciliationJob';
import { ExternalReconciliationJob } from '@operations/stock/ExternalReconciliationJob';
import { TrialExpiryJob } from '@operations/billing/TrialExpiryJob';
import { runProbes, ProbeRunnerDeps } from '@integration/compliance/ProbeRunner';
import { runSourceMonitor, SourceMonitorDeps } from '@integration/compliance/SourceMonitor';
import { runConfigHeadPoll, CONFIG_HEAD_POLL_JOB_NAME } from '@integration/config/configHeadPoll';
import { runExportSignalPoll } from '@integration/engine/catalog/export/exportSignalPoll';
import { createEmailDispatcher } from '@operations/notifications/delivery/createEmailDispatcher';
import type { EmailDispatcher } from '@operations/notifications/delivery/EmailDispatcher';
import { createPushDispatcher } from '@operations/notifications/push/createPushDispatcher';
import type { PushDispatcher } from '@operations/notifications/push/PushDispatcher';
import type { PlatformAttentionPusher } from '@operations/notifications/push/platformAttentionPush';
import { createAttentionPusher } from '@api/admin/createAttentionPusher';
import { runAnnouncementFanout, type FanoutDeps } from '@operations/notifications/announcements';
import { createAnnouncementFanoutDeps } from '@operations/notifications/createAnnouncementFanout';
import { createAlertEvaluator } from '@operations/alerts/createAlertEvaluator';
import type { AlertEvaluator } from '@operations/alerts/AlertEvaluator';
import { createBuyboxRefreshJob } from '@operations/pricing/createBuyboxRefreshJob';
import { BUYBOX_JOB_NAME, type BuyboxRefreshJob } from '@operations/pricing/BuyboxRefreshJob';
import { writeResilienceSnapshot } from '@integration/modules/common/http/resilienceSnapshot';
import { RedisService } from '@services/redis/RedisService';
import { AUDIT_IP_MASK_JOB_NAME, runAuditIpMaskProd } from '@operations/retention/auditIpMask';
import { COMMISSION_DRIFT_JOB_NAME, createCommissionDriftDeps, runCommissionDrift, type CommissionDriftJobDeps } from '@operations/finance/commissionDriftJob';
import { PLATFORM_CATALOG_JOB_NAME, createPlatformCatalogDeps } from '@operations/catalog/platformCatalogJob';
import { runPlatformCatalogCycle, type PlatformCatalogDeps } from '@operations/catalog/platformCatalog';
import { runsWorker } from './roles';

const log = logger.child({ module: 'bootstrap.schedules' });
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Runnable = { run(): Promise<any> };
/** Eski sarmalayicilarin ortak eslemesi: is sinifinin `skipped:boolean` sonucu -> `'redis_unavailable'` nedeni. */
const redisSkip = (job: Runnable) => async (): Promise<JobOutcome> => {
  const r = await job.run();
  return { ...r, skipped: r.skipped ? 'redis_unavailable' : undefined };
};

export interface ScheduleSpec {
  /** Is adi (= JobDefinition.name = lease anahtari). */
  id: string;
  runsOn: 'worker' | 'any';
  /** true: lease KAPALI, uretim bagimliliklari tembel cozulur (her pod kendi sayaclarini yazmali). */
  leaseOff?: boolean;
  /** `impl`: testlerde enjekte edilen is/tetikleyici/bagimlilik (uretimde undefined -> varsayilan ornek). */
  build(impl?: any): JobDefinition;
}

/** Siralama = eski `entegrasyonik.ts` baslatma sirasi. */
export const SCHEDULES: readonly ScheduleSpec[] = [
  { id: 'stock.allocationSweep', runsOn: 'worker', build: (impl?: Runnable) => defineJob({
    name: 'stock.allocationSweep', everyMs: 15 * MIN, maxDurationMs: 5 * MIN, criticality: 'critical', runOnStart: 'always',
    run: redisSkip(impl ?? new AllocationSweepJob()) }) },
  { id: 'stock.publish', runsOn: 'worker', build: (impl?: Runnable) => defineJob({
    name: 'stock.publish', everyMs: 30 * 1000, maxDurationMs: 25 * 1000, criticality: 'critical', runOnStart: 'always',
    run: redisSkip(impl ?? new StockPublishTrigger()) }) },
  // [eslesme-fiyat WP5, K-B] otomatik fiyat yayını (yerel → kanal; 60 sn dirty, PLAN §3.6). Kanala yazar → LIVE_READONLY'de BAŞLAMAZ.
  { id: PRICE_PUBLISH_JOB_NAME, runsOn: 'worker', build: (impl?: Runnable) => defineJob({
    name: PRICE_PUBLISH_JOB_NAME, everyMs: MIN, maxDurationMs: 50 * 1000, criticality: 'normal', runOnStart: 'always',
    run: redisSkip(impl ?? createPricePublishTrigger()) }) },
  { id: 'stock.oversellCompensation', runsOn: 'worker', build: (impl?: Runnable) => defineJob({
    name: 'stock.oversellCompensation', everyMs: 5 * MIN, maxDurationMs: 4 * MIN, criticality: 'critical', runOnStart: 'always',
    run: redisSkip(impl ?? new OversellCompensationJob()) }) },
  { id: 'stock.internalReconciliation', runsOn: 'worker', build: (impl?: Runnable) => defineJob({
    name: 'stock.internalReconciliation', everyMs: HOUR, maxDurationMs: 30 * MIN, criticality: 'normal', runOnStart: 'always',
    run: redisSkip(impl ?? new InternalReconciliationJob()) }) },
  // Dis mutabakat: gunluk is her deploy'da yeniden kosmaz (ADR-0017 Karar 3) -> 'ifDue'.
  { id: 'stock.externalReconciliation', runsOn: 'worker', build: (impl?: Runnable) => defineJob({
    name: 'stock.externalReconciliation', everyMs: DAY, maxDurationMs: 2 * HOUR, criticality: 'normal', runOnStart: 'ifDue',
    run: redisSkip(impl ?? new ExternalReconciliationJob()) }) },
  { id: 'billing.trialExpiry', runsOn: 'worker', build: (impl?: Runnable) => defineJob({
    name: 'billing.trialExpiry', everyMs: 15 * MIN, maxDurationMs: 5 * MIN, criticality: 'normal', runOnStart: 'always',
    run: redisSkip(impl ?? new TrialExpiryJob()) }) },
  { id: 'catalog.exportSignalPoll', runsOn: 'worker', build: () => defineJob({
    name: 'catalog.exportSignalPoll', everyMs: config.scheduler.exportIdlePollMs,
    maxDurationMs: Math.max(5000, config.scheduler.exportIdlePollMs * 2), criticality: 'normal', runOnStart: 'always',
    run: runExportSignalPoll }) },
  { id: 'compliance.probeRunner', runsOn: 'worker', build: (probeDeps: ProbeRunnerDeps = {}) => defineJob({
    name: 'compliance.probeRunner', everyMs: DAY, maxDurationMs: 5 * MIN, criticality: 'normal', runOnStart: 'always',
    runType: 'scheduler', scope: { level: 'platform' }, run: async () => runProbes(probeDeps) }) },
  { id: 'compliance.sourceMonitor', runsOn: 'worker', build: (monitorDeps: SourceMonitorDeps = {}) => defineJob({
    name: 'compliance.sourceMonitor', everyMs: 7 * DAY, maxDurationMs: 30 * MIN, criticality: 'normal', runOnStart: 'ifDue',
    runType: 'scheduler', scope: { level: 'platform' }, run: async () => runSourceMonitor(monitorDeps) }) },
  // ADR-0029 NB5: e-posta outbox gondericisi (anlik + ozet). Bayrak kapaliyken (NOTIFY_V2/EMAIL_ENABLED) DB'ye dokunmadan doner.
  { id: 'notifications.email-dispatch', runsOn: 'worker', build: (impl?: EmailDispatcher) => {
    let d: EmailDispatcher | undefined = impl;
    return defineJob({
      name: 'notifications.email-dispatch', everyMs: 15 * 1000, maxDurationMs: 60 * 1000, criticality: 'normal', runOnStart: 'always',
      run: async () => { d ??= createEmailDispatcher(); const r = await d.runOnce(); return { skipped: r.skipped, processed: r.processed, failed: r.failed, note: r.note }; } });
  } },
  // MOB-04: web push outbox gondericisi (anlik). Kanal kapaliyken (NOTIFY_V2_ENABLED / WEBPUSH_VAPID_*) DB'ye dokunmadan doner.
  { id: 'notifications.push-dispatch', runsOn: 'worker', build: (impl?: PushDispatcher) => {
    let d: PushDispatcher | undefined = impl;
    return defineJob({
      name: 'notifications.push-dispatch', everyMs: 10 * 1000, maxDurationMs: 60 * 1000, criticality: 'normal', runOnStart: 'always',
      run: async () => { d ??= createPushDispatcher(); const r = await d.runOnce(); return { skipped: r.skipped, processed: r.processed, failed: r.failed, note: r.note }; } });
  } },
  // MOB-06: backoffice kritik dikkat maddeleri -> abone platform yoneticisi cihazlari (web push). Kanal kapaliysa DB'ye dokunmaz; abone yoksa dikkat hesaplanmaz.
  { id: 'notifications.platform-attention-push', runsOn: 'worker', build: (impl?: PlatformAttentionPusher) => {
    let d: PlatformAttentionPusher | undefined = impl;
    return defineJob({
      name: 'notifications.platform-attention-push', everyMs: 2 * 60 * 1000, maxDurationMs: 60 * 1000, criticality: 'normal', runOnStart: 'always',
      run: async () => { d ??= createAttentionPusher(); const r = await d.runOnce(); return { skipped: r.skipped, processed: r.processed, failed: r.failed, note: r.note }; } });
  } },
  // ADR-0029 NB7: duyuru durum gecisleri + inApp/e-posta fan-out. NOTIFY_V2_ENABLED=false iken DB'ye dokunmadan doner (`skipped:'notify_disabled'`).
  { id: 'notifications.announcements', runsOn: 'worker', build: (deps?: FanoutDeps) => {
    let d: FanoutDeps | undefined = deps;
    return defineJob({
      name: 'notifications.announcements', everyMs: MIN, maxDurationMs: 5 * MIN, criticality: 'normal', runOnStart: 'always',
      run: async () => {
        d ??= createAnnouncementFanoutDeps();
        const r = await runAnnouncementFanout(d);
        return { skipped: r.skipped, processed: r.activated + r.ended + r.fannedOut, failed: 0, note: `activated=${r.activated} ended=${r.ended} fanout=${r.fannedOut} notified=${r.notified}` };
      } });
  } },
  // ADR-0017 Asama C / NB8: alarm degerlendiricisi (esik kurallari + cooldown + platform bildirimi). ALERT_EVALUATOR_ENABLED=false iken DB/Redis'e dokunmadan doner.
  { id: 'alerts.evaluator', runsOn: 'worker', build: (impl?: AlertEvaluator) => {
    let e: AlertEvaluator | undefined = impl;
    return defineJob({
      name: 'alerts.evaluator', everyMs: MIN, maxDurationMs: MIN, criticality: 'normal', runOnStart: 'always',
      run: async () => {
        e ??= createAlertEvaluator();
        const r = await e.runOnce();
        return { skipped: r.skipped, processed: r.evaluated, failed: 0, note: `firing=${r.evaluated} new=${r.newFirings} resolved=${r.resolved} renotified=${r.renotified} platform=${r.platformNotified} tenant=${r.tenantNotified} shadow=${r.shadow} maint=${r.maintenance}` };
      } });
  } },
  // PRC-R1/PRC-CFG: Trendyol buybox SALT OKUMA isi. `features.competition` kapaliyken (varsayilan) DB/agla hic konusmadan doner.
  // Dakikalik cagri butcesi (`pricing.buybox.budget.trendyol.perMin`) tenant'lar arasinda adil paylastirilir; LIVE_READONLY'de BASLAMAZ (K57-S8 acik).
  { id: BUYBOX_JOB_NAME, runsOn: 'worker', build: (impl?: BuyboxRefreshJob) => {
    let j: BuyboxRefreshJob | undefined = impl;
    return defineJob({
      name: BUYBOX_JOB_NAME, everyMs: MIN, maxDurationMs: 50 * 1000, criticality: 'normal', runOnStart: 'always',
      run: async () => {
        j ??= createBuyboxRefreshJob();
        const r = await j.runOnce();
        return { skipped: r.skipped, processed: r.observed, failed: r.failedTenants, note: `tenants=${r.tenants} calls=${r.calls} lost=${r.lost} notified=${r.notified} deferred=${r.deferred}` };
      } });
  } },
  // [eslesme-fiyat WP5, K-A2] kanal fiyat kurali OTOMATIK uygulama (yalniz type:'channel' + kural autoApply + tenant channelAutoApply;
  // platform anahtari features.pricingRules). Kanala yayin pricing.publish ile. Kendi DB'mize yazar -> LIVE_READONLY'de BASLAMAZ.
  { id: CHANNEL_RULE_JOB_NAME, runsOn: 'worker', build: (impl?: ChannelRuleJobDeps) => {
    let d: ChannelRuleJobDeps | undefined = impl;
    return defineJob({
      name: CHANNEL_RULE_JOB_NAME, everyMs: 15 * MIN, maxDurationMs: 10 * MIN, criticality: 'normal', runOnStart: 'ifDue',
      run: async (ctx) => {
        d ??= createChannelRuleJobDeps();
        const r = await runChannelRuleJob(d, ctx.signal);
        return { skipped: r.skipped || undefined, processed: r.applied, failed: r.failed, note: `tenants=${r.tenants} rules=${r.rules} blocked=${r.blocked} throttled=${r.throttled}` };
      } });
  } },
  // COM-08: komisyon sapma taramasi (gunluk, ifDue). NOTIFY_V2_ENABLED=false iken DB'ye dokunmadan doner (`notify_disabled`).
  { id: COMMISSION_DRIFT_JOB_NAME, runsOn: 'worker', build: (impl?: CommissionDriftJobDeps) => {
    let d: CommissionDriftJobDeps | undefined = impl;
    return defineJob({
      name: COMMISSION_DRIFT_JOB_NAME, everyMs: DAY, maxDurationMs: 15 * MIN, criticality: 'normal', runOnStart: 'ifDue',
      run: async (ctx) => {
        d ??= createCommissionDriftDeps();
        const r = await runCommissionDrift(d, { signal: ctx.signal });
        return { skipped: r.skipped, processed: r.evaluated, failed: r.failedTenants, note: `tenants=${r.tenants} drifted=${r.drifted} notified=${r.notified}` };
      } });
  } },
  // [eslesme-fiyat WP2] platform katalog yenileme + esleme bayatlik taramasi (haftalik, ifDue). Platforma YAZMA yok (salt katalog okuma);
  // kendi DB'mize yazdigi icin LIVE_READONLY'de BASLAMAZ (varsayilan liste). Bildirim: FE `stale` alanini gosterir (bildirim olayi WP7/WP8).
  { id: PLATFORM_CATALOG_JOB_NAME, runsOn: 'worker', build: (impl?: PlatformCatalogDeps) => {
    let d: PlatformCatalogDeps | undefined = impl;
    return defineJob({
      name: PLATFORM_CATALOG_JOB_NAME, everyMs: 7 * DAY, maxDurationMs: HOUR, criticality: 'normal', runOnStart: 'ifDue',
      run: async (ctx) => {
        d ??= createPlatformCatalogDeps();
        const r = await runPlatformCatalogCycle({ ...d, signal: ctx.signal });
        return { processed: r.entries, failed: r.failed, note: `channels=${r.channels} calls=${r.calls} tenants=${r.tenantsScanned} stale+=${r.marked} stale-=${r.cleared}` };
      } });
  } },
  // RET-02: 90 gunden eski AuditLogs IP maskeleme (gunluk; deploy'da yeniden kosmaz -> 'ifDue'). Yalniz kendi DB'mize yazar; LIVE_READONLY'de baslamaz (varsayilan liste).
  { id: AUDIT_IP_MASK_JOB_NAME, runsOn: 'worker', build: (impl?: typeof runAuditIpMaskProd) => defineJob({
    name: AUDIT_IP_MASK_JOB_NAME, everyMs: DAY, maxDurationMs: 15 * MIN, criticality: 'normal', runOnStart: 'ifDue',
    run: async (ctx) => {
      const r = await (impl ?? runAuditIpMaskProd)({ signal: ctx.signal, heartbeat: ctx.heartbeat });
      return { processed: r.processed, failed: r.failed, note: `batches=${r.batches} more=${r.more}` };
    } }) },
  // Metrik flush: HER rolde; lease KASITLI kapali (her pod kendi surec-ici kayit defterini flush eder, ADR-0017 Karar 2.1).
  { id: 'observability.metrics-flush', runsOn: 'any', leaseOff: true, build: () => defineJob({
    name: 'observability.metrics-flush', everyMs: MIN, maxDurationMs: 30 * 1000, criticality: 'normal', runOnStart: 'always',
    run: async () => {
      const model = await productionMetricRollupModel();
      const r = await flushMetricsOnce({ model });
      // [BO B6] pod dayanıklılık anlık görüntüsü (resilience:<pod>, 60 sn TTL); Redis hazır değilse atlanır, hata akışı bozmaz.
      if (RedisService.isReady()) await writeResilienceSnapshot(RedisService.getInstance());
      return { processed: r.seriesFlushed, note: `ops=${r.opsWritten}` };
    } }) },
  // Platform ayar yayini yoklamasi: HER rolde (ADR-0020 Karar 3.6).
  { id: CONFIG_HEAD_POLL_JOB_NAME, runsOn: 'any', build: () => defineJob({
    name: CONFIG_HEAD_POLL_JOB_NAME, everyMs: 15 * 1000, maxDurationMs: 10 * 1000, criticality: 'normal', runOnStart: 'always',
    run: runConfigHeadPoll }) },
];

const controllers = new Map<string, JobController>();

/** [LIVE-RO] Canli salt-okuma kipinde (LIVE_READONLY=1) YALNIZ bunlar baslar: dis sisteme yazan/cagri yapan hicbir is (stok yayini, mutabakat, probe, kaynak izleyici, e-posta) acilmaz. */
export const LIVE_READONLY_SCHEDULE_IDS: readonly string[] = ['observability.metrics-flush', CONFIG_HEAD_POLL_JOB_NAME];

/** Bir rolde baslayacak is adlari (kayit sirasiyla). Rol x is matrisinin tek kaynagi. */
export function scheduleIdsForRole(role: AppRole): string[] {
  const liveRo = config.liveReadonly.enabled;
  return SCHEDULES
    .filter((s) => s.runsOn === 'any' || runsWorker(role))
    .filter((s) => !liveRo || LIVE_READONLY_SCHEDULE_IDS.includes(s.id))
    .map((s) => s.id);
}

/** Tek isi baslatir; ayni surecte ikinci cagri no-op (idempotent). `deps` yalniz testler icin. */
export function startSchedule(id: string, opts: { impl?: unknown; deps?: RunJobDeps } = {}): void {
  const spec = SCHEDULES.find((s) => s.id === id);
  if (!spec) throw new Error(`[bootstrap.schedules] bilinmeyen zamanlayici: ${id}`);
  if (controllers.has(id)) return;
  const def = spec.build(opts.impl);

  if (!spec.leaseOff) { controllers.set(id, startJob(def, opts.deps)); return; }
  if (opts.deps) { controllers.set(id, startJob(def, { ...opts.deps, leaseEnabled: false })); return; }

  // leaseOff + uretim: bagimliliklar tembel cozulur; stop() cozum bitmeden cagrilirsa is hic baslamaz.
  let stoppedBeforeInit = false;
  let inner: JobController | undefined;
  productionSchedulerDeps()
    .then((resolved) => { if (!stoppedBeforeInit) inner = startJob(def, { ...resolved, leaseEnabled: false }); })
    .catch((err) => log.error({ err, job: id }, 'uretim bagimliliklari cozulemedi'));
  controllers.set(id, {
    stop() { stoppedBeforeInit = true; inner?.stop(); },
    overlapSkippedCount: () => inner?.overlapSkippedCount() ?? 0,
    isRunning: () => inner?.isRunning() ?? false,
  });
}

/** Rolun tum islerini kayit sirasiyla baslatir; baslatilan is adlarini dondurur. */
export function startSchedules(role: AppRole): string[] {
  const ids = scheduleIdsForRole(role);
  for (const id of ids) startSchedule(id);
  return ids;
}

/** Bir isi (veya `id` verilmezse hepsini) durdurur; yeni tur planlanmaz. Kapanis + testler icin. */
export function stopSchedules(id?: string): void {
  if (id) { controllers.get(id)?.stop(); controllers.delete(id); return; }
  for (const c of controllers.values()) c.stop();
  controllers.clear();
  stopAllJobs();
}

// ADR-0024 P0-LIFE: BILESIM KOKU. Sira: yapilandirma dogrulama -> Redis -> (DB tembel/ClientOperations) -> HTTP -> motor
// -> zamanlayicilar. Rol (`APP_ROLE`, varsayilan all) hangi katmanlarin acilacagini belirler; davranis eski
// `entegrasyonik.ts` ile AYNIDIR. `entegrasyonik.ts` yalniz kopruleri kurar, bu modulu cagirir ve sinyalleri baglar.
import Security from '@platform/core/security/Security';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import IntegrationEngine from '../integration/engine/IntegrationEngine';
import { NotificationService } from '@services/notification/NotificationService';
import { storageService } from '@services/storage/StorageService';
import { ClientOperations } from '@operations/client/ClientOperations';
import { createNotifier } from '@operations/notifications/createNotifier';
import { createPlatformNotifier } from '@operations/notifications/createPlatformNotifier';
import { createChangeNoticeHook, createFindingAlertHook } from '@operations/alerts/findingAlertHook';
import { parseShadowUntil } from '@operations/alerts/createAlertEvaluator';
import { FindingService } from '@integration/compliance/FindingService';
import { RedisService } from '@services/redis';
import { config } from '@config';
import { eventLog } from '@platform/core/logger';
import { assertFieldCryptoConfig } from '@utils/FieldCrypto';
import { beginShutdown } from '@health/readinessState';
import { closeLogPersistence } from '@platform/runtime/logs';
import { initRealtimeBus, closeRealtimeBus } from '@platform/runtime/realtime';
import { closeNotificationStreams } from '../api/http/notificationStream';
import { closeOrderWorkerConsumer } from '../integration/engine/order/worker-runner';
import { resolveAppRole, runsWorker } from './roles';
import { startHttp, HttpSurface } from './http';
import { startSchedules, stopSchedules } from './schedules';
import { createShutdown, ShutdownHandler } from './shutdown';
import { assertLiveReadonlyBoot, isLiveReadonly, liveReadonlyBootSummary } from './liveReadonly';

const log = eventLog('api', 'bootstrap');

/** Yari kalmis baslatmada bile kapanisin kapatabilmesi icin surec-genel, kademeli dolan HTTP yuzeyi. */
const http: HttpSurface = {};

/** ADR-0006 Karar 6 kapanis zinciri. DB adimi P0-DB'nin idempotent `close()`'u (kapanis bayragi + yeni baglanti reddi). */
export const shutdown: ShutdownHandler = createShutdown({
  onBegin: () => beginShutdown(),
  steps: [
    { name: 'realtime.streams', run: () => closeNotificationStreams() }, // ADR-0029 NB6: acik SSE'lere event: shutdown + kapat (server.close() acik akisi beklemesin)
    { name: 'http.webserver', run: () => http.webserver?.close() },
    { name: 'http.healthServer', run: () => http.healthServer?.close() },
    { name: 'realtime.bus', run: () => closeRealtimeBus() },
    { name: 'schedules', run: () => stopSchedules() },
    { name: 'bullmq.orderWorker', run: () => closeOrderWorkerConsumer() },
    { name: 'logs.flush', run: () => closeLogPersistence() }, // ADR-0026 L1: kalan LogEvents kuyrugu DB kapanmadan bosaltilir (bayrak kapaliysa no-op)
    { name: 'database', run: () => DatabaseManagerInstance.close() },
    { name: 'redis', run: () => RedisService.quit() },
  ],
});

/** Baslatma. Hata firlatirsa cagiran `shutdown('Initialization Failed', err)` yapar. */
export async function bootApplication(): Promise<void> {
  try {
    // ADR-0001: JWT_SECRET yok/kisa ise surec baslamaz (fail-fast)
    Security.assertConfig();
    // ADR-0003 C.10: alan sifreleme anahtarlari yok/gecersizse surec baslamaz (fail-fast)
    assertFieldCryptoConfig();

    // [LIVE-RO] canlı salt-okuma kipi ön koşulları (ag katmani yuklu, DB yerel, mock kapali); saglanmazsa surec baslamaz
    assertLiveReadonlyBoot();
    if (isLiveReadonly()) log.warn('LIVE_READONLY_ACTIVE', '[System] CANLI SALT-OKUMA kipi: pazaryerine yazma KAPALI.', liveReadonlyBootSummary());

    log.info('APP_STARTING', 'Entegrasyonik Başlıyor...');
    for (const w of config.warnings) log.warn('CONFIG_WARNING', w); // ADR-0031: ör. eski görsel kökü kullanımı (production/staging)

    const role = resolveAppRole();
    log.info('APP_ROLE_RESOLVED', `[System] APP_ROLE=${role}`, { role });

    // [ADR-0005 Karar 2] Redis baglanamazsa surec DEVAM EDER (ioredis kendi yeniden baglanmasini yapar).
    try {
      await RedisService.init();
    } catch (err) {
      log.error('REDIS_INIT_FAILED_CONTINUING', '[System] RedisService.init() başarısız oldu; süreç Redis olmadan DEVAM EDİYOR (ADR-0005 Karar 2)', { err });
    }

    // ADR-0029 NB6: RealtimeBus (REALTIME_BUS=redis -> Redis pub/sub, yoksa yerel + uyari); NotificationService'ten ONCE.
    initRealtimeBus(config.notify.realtimeBus, () => {
      const base = RedisService.getInstance();
      return { pub: base.duplicate(), sub: base.duplicate() };
    });

    const clientOperations = new ClientOperations();
    const tenantNotifier = createNotifier();
    NotificationService.init(clientOperations, tenantNotifier); // ADR-0029: notify çekirdeği sink'i (NOTIFY_V2_ENABLED=false iken köprü eski yolu kullanır)
    storageService.initialize(clientOperations);
    // ADR-0029 NB8: R12 uyum bulgusu -> platform bildirimi (NOTIFY_V2_ENABLED=false iken platformNotify hicbir sey yazmaz)
    const platformNotifier = createPlatformNotifier();
    FindingService.setAlertHook(createFindingAlertHook({
      platformNotify: (code, params, opts) => platformNotifier.notify(code, params, opts),
      shadow: () => { const u = parseShadowUntil(config.notify.alertShadowUntil); return !!u && Date.now() < u.getTime(); },
    }));
    // ADR-0029 NB8: accepted + severity >= high bulgu -> etkilenen tenant'lara INTEGRATION_CHANGE_NOTICE (ADR-0018 triage sonrasi)
    FindingService.setChangeNoticeHook(createChangeNoticeHook({
      tenantNotify: (code, tid, params, opts) => tenantNotifier.notify(code, tid, params, opts),
      shadow: () => { const u = parseShadowUntil(config.notify.alertShadowUntil); return !!u && Date.now() < u.getTime(); },
    }));

    // ADR-0006 Karar 3: web/all -> tam API; worker -> yalniz /health,/ready
    await startHttp(role, http);

    // worker/all -> motor + tum zamanlayicilar; web -> yalniz rol-bagimsiz olanlar (metrics-flush, config-head-poll).
    // Kapi/siralama `bootstrap/schedules.ts` kaydindadir (tests/unit/bootstrap).
    if (runsWorker(role)) await IntegrationEngine.start();
    startSchedules(role);
  } catch (error) {
    await shutdown('Initialization Failed', error);
  }
}

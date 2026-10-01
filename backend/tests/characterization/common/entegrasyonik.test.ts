/**
 * CHARACTERIZATION + YENİ DAVRANIŞ (ADR-0006 Karar 3/6): entegrasyonik.ts (giriş noktası).
 * Not (süreç disiplini istisnası, açıkça belirtilir): bu dosya için önce-testi-sonra-değişikliği sırası TAM
 * olarak izlenmedi (dosya küçük/doğrudan bir orkestrasyon sarmalayıcısı olduğu için); bunun yerine YENİ hâli
 * yazıldıktan HEMEN SONRA, hem korunan eski davranış hem yeni davranış burada kapsamlı şekilde sabitlenmiştir.
 * Bu sapma orkestratöre bildirilmiştir (final rapor).
 *
 * Tüm bağımlılıklar (Webserver, Security, DatabaseManager, IntegrationEngine, RedisService, storage/notification,
 * health modülleri, worker-runner) `jest.doMock` ile değiştirilir; gerçek DB/Redis/HTTP/süreç sinyali YOK.
 * Modül üst seviyede yan etkili olduğundan (`new Entegrasyonik().init()` + `process.on(...)`), her test
 * `jest.isolateModules` içinde taze bir modül kopyası yükler.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

type Boot = {
  order: string[];
  mocks: Record<string, any>;
  processOnCalls: Array<[string, (...a: any[]) => any]>;
  exitSpy: jest.Mock<any>;
};

async function bootEntegrasyonik(opts: {
  appRole?: string;
  initShouldThrow?: any;
  redisInitShouldThrow?: any;
} = {}): Promise<Boot> {
  const order: string[] = [];
  const processOnCalls: Array<[string, (...a: any[]) => any]> = [];
  const exitSpy = jest.fn();

  const webserverInstance = { init: jest.fn(async () => { order.push('webserver.init'); }), close: jest.fn(async () => { order.push('webserver.close'); }) };
  const healthServerInstance = { close: jest.fn(async () => { order.push('healthServer.close'); }) };
  const startHealthOnlyServer = jest.fn(() => { order.push('startHealthOnlyServer'); return healthServerInstance; });

  const mocks: Record<string, any> = {
    // [ADR-0017 2026-09-28] console köprüsü no-op mock'lanır: bu test dosyasının amacı orkestrasyon SIRASIdır,
    // gerçek console.*'ı değiştirmez (aşağıdaki console.warn/error casus assertion'ları AYNEN korunur).
    // BİLEREK `order`'a push YAPMAZ (mevcut kesin sıralama `toEqual([...])` testlerini bozmamak için; ayrı
    // testlerde `toHaveBeenCalled()` ile doğrulanır -- AllocationSweepSchedulerStart ile AYNI desen).
    installConsoleBridge: jest.fn(),
    Security: { assertConfig: jest.fn(() => order.push('Security.assertConfig')) },
    assertFieldCryptoConfig: jest.fn(() => order.push('assertFieldCryptoConfig')),
    RedisServiceInit: jest.fn(async () => {
      order.push('RedisService.init');
      if (opts.redisInitShouldThrow) throw opts.redisInitShouldThrow;
    }),
    RedisServiceQuit: jest.fn(async () => order.push('RedisService.quit')),
    ClientOperations: jest.fn(() => order.push('new ClientOperations')),
    NotificationServiceInit: jest.fn(() => order.push('NotificationService.init')),
    storageInitialize: jest.fn(() => order.push('storageService.initialize')),
    WebserverInit: webserverInstance.init,
    IntegrationEngineStart: jest.fn(async () => {
      if (opts.initShouldThrow) throw opts.initShouldThrow;
      order.push('IntegrationEngine.start');
    }),
    // [ADR-0024 P0-LIFE] 11 zamanlayıcı tek kayıtta (`@bootstrap/schedules`): sıralamaya `stopSchedules` HARİÇ dahil EDİLMEZ
    // (mevcut `toEqual([...])` dizilerini korumak için); hangi rolde hangi işlerin başladığı tests/unit/bootstrap'ta kanıtlıdır.
    startSchedules: jest.fn(),
    stopSchedules: jest.fn(() => order.push('stopSchedules')),
    installErrorEventLoggerBridge: jest.fn(),
    installCacheMetricsBridge: jest.fn(),
    installIntegrationCallMetricsBridge: jest.fn(),
    recordUnhandledRejection: jest.fn(),
    // [faz4-arch-p0db] kapanis artik idempotent `close()` (kapanis bayragi + yeni baglanti reddi) cagirir
    close: jest.fn(async () => order.push('DatabaseManagerInstance.close')),
    closeOrderWorkerConsumer: jest.fn(async () => order.push('closeOrderWorkerConsumer')),
    beginShutdown: jest.fn(() => order.push('beginShutdown')),
    startHealthOnlyServer,
    webserverInstance,
    healthServerInstance,
  };

  const savedRole = process.env.APP_ROLE;
  if (opts.appRole === undefined) delete process.env.APP_ROLE; else process.env.APP_ROLE = opts.appRole;

  const processOnSpy = jest.spyOn(process, 'on').mockImplementation(((event: any, cb: any) => { processOnCalls.push([event, cb]); return process; }) as any);
  const processExitSpy = jest.spyOn(process, 'exit').mockImplementation(exitSpy as any);

  await new Promise<void>((resolve) => {
    jest.isolateModules(() => {
      jest.doMock('dotenv/config', () => ({}));
      jest.doMock('@platform/core/logger', () => {
        const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
        mocks.eventLogWarn = log.warn; // bootstrap/roles.ts geçersiz APP_ROLE uyarısını eventLog ile yazar (F-06 göçü)
        return { installConsoleBridge: mocks.installConsoleBridge, logger: { child: () => log, ...log }, eventLog: () => log };
      });
      jest.doMock('@bootstrap/schedules', () => ({ startSchedules: mocks.startSchedules, stopSchedules: mocks.stopSchedules }));
      jest.doMock('../../../src/bootstrap/Webserver', () => ({ __esModule: true, default: { getInstance: jest.fn(() => webserverInstance) } }));
      jest.doMock('../../../src/platform/core/security/Security', () => ({ __esModule: true, default: mocks.Security }));
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { close: mocks.close } }));
      jest.doMock('../../../src/integration/engine/IntegrationEngine', () => ({ __esModule: true, default: { start: mocks.IntegrationEngineStart } }));
      jest.doMock('@services/notification/NotificationService', () => ({ NotificationService: { init: mocks.NotificationServiceInit } }));
      jest.doMock('@services/storage/StorageService', () => ({ storageService: { initialize: mocks.storageInitialize } }));
      jest.doMock('@operations/client/ClientOperations', () => ({ ClientOperations: mocks.ClientOperations }));
      jest.doMock('@services/redis', () => ({ RedisService: { init: mocks.RedisServiceInit, quit: mocks.RedisServiceQuit } }));
      jest.doMock('@utils/FieldCrypto', () => ({ assertFieldCryptoConfig: mocks.assertFieldCryptoConfig }));
      jest.doMock('@health/HealthServer', () => ({ startHealthOnlyServer }));
      jest.doMock('@health/readinessState', () => ({ beginShutdown: mocks.beginShutdown }));
      jest.doMock('../../../src/integration/engine/order/worker-runner', () => ({ closeOrderWorkerConsumer: mocks.closeOrderWorkerConsumer }));
      // [ADR-0017 Aşama B] YENİ: hata olayı köprüsü + metrik flush zamanlayıcısı, gerçek DB/Mongo YOK.
      jest.doMock('@platform/runtime/metrics', () => ({
        installErrorEventLoggerBridge: mocks.installErrorEventLoggerBridge,
        installCacheMetricsBridge: mocks.installCacheMetricsBridge,
        recordUnhandledRejection: mocks.recordUnhandledRejection,
      }));
      jest.doMock('../../../src/integration/modules/common/http/IntegrationCallMetricsBridge', () => ({
        installIntegrationCallMetricsBridge: mocks.installIntegrationCallMetricsBridge,
      }));

      require('../../../entegrasyonik');
      // init() bir async IIFE gibi tetiklenir; mikro görev kuyruğunun boşalmasını bekleyelim.
      setImmediate(resolve);
    });
  });
  // Zincirlenmiş await'lerin hepsinin çözülmesi için birkaç mikro-görev turu daha.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

  if (savedRole === undefined) delete process.env.APP_ROLE; else process.env.APP_ROLE = savedRole;
  processOnSpy; processExitSpy;
  return { order, mocks, processOnCalls, exitSpy };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('entegrasyonik.ts init() - APP_ROLE=all (varsayılan, ADR-0006 Karar 3)', () => {
  it('[MEVCUT DAVRANIŞ, korunmuş] kurulum sırası: assertConfig -> assertFieldCryptoConfig -> RedisService.init -> ClientOperations/Notification/Storage -> Webserver.init -> IntegrationEngine.start', async () => {
    const { order } = await bootEntegrasyonik({});
    expect(order).toEqual([
      'Security.assertConfig', 'assertFieldCryptoConfig', 'RedisService.init',
      'new ClientOperations', 'NotificationService.init', 'storageService.initialize',
      'webserver.init', 'IntegrationEngine.start',
    ]);
  });

  it('[ADR-0017 2026-09-28] installConsoleBridge() giriş noktasında bir kez çağrılır (console.* -> pino köprüsü kurulumu)', async () => {
    const { mocks } = await bootEntegrasyonik({});
    expect(mocks.installConsoleBridge).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ, ADR-0017 Aşama B] hata olayı köprüsü + entegrasyon çağrı metrik köprüsü giriş noktasında bir kez kurulur', async () => {
    const { mocks } = await bootEntegrasyonik({});
    expect(mocks.installErrorEventLoggerBridge).toHaveBeenCalledTimes(1);
    expect(mocks.installIntegrationCallMetricsBridge).toHaveBeenCalledTimes(1);
  });



  it('[YENİ DAVRANIŞ] APP_ROLE tanımsızsa "all" davranışı (hem Webserver hem IntegrationEngine başlar; healthServer BAŞLAMAZ)', async () => {
    const { order, mocks } = await bootEntegrasyonik({});
    expect(order).toContain('webserver.init');
    expect(order).toContain('IntegrationEngine.start');
    expect(mocks.startHealthOnlyServer).not.toHaveBeenCalled();
  });




});

describe('entegrasyonik.ts init() - TrialExpiryScheduler (ADR-0008 §3, deneme bitişi -> suspended)', () => {



});

describe('entegrasyonik.ts init() - APP_ROLE=web (YENİ, ADR-0006 Karar 3)', () => {
  it('[YENİ DAVRANIŞ] yalnızca Webserver başlar; IntegrationEngine BAŞLAMAZ, minimal health sunucusu da BAŞLAMAZ', async () => {
    const { order, mocks } = await bootEntegrasyonik({ appRole: 'web' });
    expect(order).toContain('webserver.init');
    expect(order).not.toContain('IntegrationEngine.start');
    expect(mocks.startHealthOnlyServer).not.toHaveBeenCalled();
  });




});

describe('entegrasyonik.ts init() - APP_ROLE=worker (YENİ, ADR-0006 Karar 3)', () => {
  it('[YENİ DAVRANIŞ] Webserver BAŞLAMAZ; IntegrationEngine başlar; KARAR: worker rolü de minimal bir health sunucusu başlatır (/health, /ready)', async () => {
    const { order, mocks } = await bootEntegrasyonik({ appRole: 'worker' });
    expect(order).not.toContain('webserver.init');
    expect(order).toContain('IntegrationEngine.start');
    expect(mocks.startHealthOnlyServer).toHaveBeenCalledWith(expect.any(Number), expect.any(String), 'worker');
  });




});

describe('entegrasyonik.ts init() - geçersiz APP_ROLE (YENİ)', () => {
  it('[YENİ DAVRANIŞ] tanımlı olmayan bir rol (ör. "bogus") uyarı basar ve "all" gibi davranır', async () => {
    const { order, mocks } = await bootEntegrasyonik({ appRole: 'bogus' });
    expect(mocks.eventLogWarn).toHaveBeenCalledWith('APP_ROLE_INVALID', expect.stringContaining('Geçersiz APP_ROLE'));
    expect(order).toContain('webserver.init');
    expect(order).toContain('IntegrationEngine.start');
  });
});

describe('entegrasyonik.ts - process sinyalleri', () => {
  it('[MEVCUT DAVRANIŞ, korunmuş] SIGINT ve SIGTERM için handler kayıtlıdır', async () => {
    const { processOnCalls } = await bootEntegrasyonik({});
    expect(processOnCalls.map((c) => c[0])).toEqual(expect.arrayContaining(['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection']));
  });

  it('[MEVCUT DAVRANIŞ, korunmuş] unhandledRejection SADECE loglar, süreç KAPATILMAZ (ADR-0006: 24 saatlik gözlem sonrası değişecek)', async () => {
    const { processOnCalls, exitSpy } = await bootEntegrasyonik({});
    const handler = processOnCalls.find((c) => c[0] === 'unhandledRejection')![1];
    handler(new Error('boom'));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unhandled Rejection:'), expect.anything());
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ, ADR-0017 Aşama B Karar 2.2 (K12)] unhandledRejection ARTIK recordUnhandledRejection() ile SAYILIR (ADR-0006 Karar 6 "sayılır" hükmü uygulanır)', async () => {
    const { processOnCalls, mocks } = await bootEntegrasyonik({});
    const handler = processOnCalls.find((c) => c[0] === 'unhandledRejection')![1];
    handler(new Error('boom'));
    expect(mocks.recordUnhandledRejection).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ, DÜZELTİLDİ] uncaughtException artık graceful shutdown\'ı TETİKLER ve exit(1) ile sonlanır (eskiden: sadece loglanıyordu, süreç devam ediyordu)', async () => {
    const { processOnCalls, exitSpy, order } = await bootEntegrasyonik({});
    order.length = 0;
    const handler = processOnCalls.find((c) => c[0] === 'uncaughtException')![1];
    await handler(new Error('sync boom'));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(order).toEqual(['beginShutdown', 'webserver.close', 'stopSchedules', 'closeOrderWorkerConsumer', 'DatabaseManagerInstance.close', 'RedisService.quit']);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('entegrasyonik.ts - gracefulShutdown (ADR-0006 Karar 6: sıralı 6 adım)', () => {
  it('[YENİ DAVRANIŞ] init() sırasında hata olursa: beginShutdown -> webserver.close -> stopSchedules -> closeOrderWorkerConsumer -> DB kapat -> Redis kapat -> exit(1)', async () => {
    const { order, exitSpy } = await bootEntegrasyonik({ initShouldThrow: new Error('IntegrationEngine patladı') });
    expect(order).toEqual([
      'Security.assertConfig', 'assertFieldCryptoConfig', 'RedisService.init',
      'new ClientOperations', 'NotificationService.init', 'storageService.initialize',
      'webserver.init',
      'beginShutdown', 'webserver.close', 'stopSchedules', 'closeOrderWorkerConsumer',
      'DatabaseManagerInstance.close', 'RedisService.quit',
    ]);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('[YENİ DAVRANIŞ] SIGTERM handler\'ı gracefulShutdown\'ı hatasız (reason\'lı, error\'suz) çağırır -> exit(0)', async () => {
    const { processOnCalls, exitSpy, order } = await bootEntegrasyonik({});
    order.length = 0;
    const handler = processOnCalls.find((c) => c[0] === 'SIGTERM')![1];
    await handler();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(order[0]).toBe('beginShutdown');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('[YENİ DAVRANIŞ] worker rolünde kapanış healthServer.close() çağırır (webserver.close DEĞİL, çünkü Webserver hiç başlamadı)', async () => {
    const { processOnCalls, order } = await bootEntegrasyonik({ appRole: 'worker' });
    order.length = 0;
    const handler = processOnCalls.find((c) => c[0] === 'SIGINT')![1];
    await handler();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(order).toContain('healthServer.close');
    expect(order).not.toContain('webserver.close');
  });
});

describe('entegrasyonik.ts init() - RedisService.init() hatası (ADR-0005 Karar 2)', () => {
  it('[YENİ DAVRANIŞ, ADR-0005 adım 1] RedisService.init() reddedilse bile süreç DEVAM EDER: Webserver.init ve IntegrationEngine.start yine çalışır, gracefulShutdown TETİKLENMEZ (ÖNCEKİ DAVRANIŞ: bu hata outer catch\'e düşüp exit(1) ile süreci kapatıyordu — RedisService.init() artık zaten reddetmiyor, ama entegrasyonik.ts bu satırı yine de try/catch ile sarar; savunma katmanı burada doğrulanır)', async () => {
    const { order, exitSpy } = await bootEntegrasyonik({ redisInitShouldThrow: new Error('ECONNREFUSED') });
    expect(order).toEqual([
      'Security.assertConfig', 'assertFieldCryptoConfig', 'RedisService.init',
      'new ClientOperations', 'NotificationService.init', 'storageService.initialize',
      'webserver.init', 'IntegrationEngine.start',
    ]);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('entegrasyonik.ts init() - zamanlayıcılar (ADR-0024 P0-LIFE: tek kayıt `@bootstrap/schedules`)', () => {
  it('[YENİ DAVRANIŞ] HER rolde (web dahil) startSchedules(rol) çağrılır; hangi işlerin başladığı rol kapısıyla kayıtta belirlenir (tests/unit/bootstrap)', async () => {
    for (const appRole of ['web', 'worker', 'all'] as const) {
      const { mocks } = await bootEntegrasyonik({ appRole });
      expect(mocks.startSchedules).toHaveBeenCalledTimes(1);
      expect(mocks.startSchedules).toHaveBeenCalledWith(appRole);
    }
  });

  it('[YENİ DAVRANIŞ] zamanlayıcılar IntegrationEngine.start() sonrasında başlar; motor başarısız olursa HİÇBİRİ başlatılmaz (eski davranış)', async () => {
    const ok = await bootEntegrasyonik({});
    expect(ok.mocks.startSchedules).toHaveBeenCalledTimes(1);
    const failed = await bootEntegrasyonik({ initShouldThrow: new Error('IntegrationEngine patladı') });
    expect(failed.mocks.startSchedules).not.toHaveBeenCalled();
  });
});

/**
 * CHARACTERIZATION: IntegrationEngine.start (Merkezi Yönetim Birimi)
 * Kaynak: backend/src/integration/engine/IntegrationEngine.ts
 *
 * Bu sınıf Faz 2 QA raporunun (docs/QA_FAZ2.md madde 7/12) "%0 kapsam, dokunulmaz" listesindeydi;
 * ilk yazıldığında kod DEĞİŞTİRİLMEDEN yalnızca mevcut davranış gözlemlenip sabitlenmişti.
 *
 * [IntegrationEngine başlatma izolasyonu düzeltmesi, 2026-09-27] BACKLOG "%0-kapsamlı orkestrasyon
 * sınıfları" madde 1 (KRİTİK): `start()` içindeki Export/Import/Order.start() çağrıları artık
 * `safeStartSubsystem` ile BAĞIMSIZ try/catch'e alındı (bkz. IntegrationEngine.ts). "alt-sistem başlatma
 * HATASI ve İZOLASYON" describe bloğundaki ilgili testler KASITLI OLARAK ters çevrildi — yeni beklenen
 * davranış: bir alt-sistem SENKRON throw etse bile diğer ikisi YİNE DE çağrılır, `start()` reddetmez.
 *
 * DatabaseManager, ExportOrchestrator, ImportOrchestrator, OrderOrchestrator jest.mock ile değiştirilir.
 * DB/Redis/ağ YOK. `IntegrationEngine.isRunning` MODÜL YÜKLEME SIRASINDA sıfırlanan bir static alan
 * olduğundan, her testte `jest.resetModules()` + `require()` ile TAZE bir modül grafiği kurulur
 * (aksi halde testler arası `isRunning=true` sızardı — bu da kendi başına bir gözlemdir, aşağıda not edildi).
 *
 * ANA SORU (görev tanımından): "start() hangi alt-orkestratörleri hangi sırada başlatıyor, bir alt-sistem
 * başlatma hatası verirse diğerleri etkileniyor mu?" — Bu dosyanın "sıralama ve hata izolasyonu" describe
 * blokları TAM OLARAK bunu cevaplar; sonuç `ChaosIsolation.test.ts`'te orkestrasyon-seviyesi kaostestine
 * temel oluşturur.
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn() },
}));
jest.mock('@integration/engine/catalog/export/ExportOrchestrator', () => ({
  ExportOrchestrator: { start: jest.fn(), clearZombies: jest.fn(async () => undefined) },
}));
jest.mock('@integration/engine/catalog/import/ImportOrchestrator', () => ({
  ImportOrchestrator: { start: jest.fn(), clearZombies: jest.fn(async () => undefined) },
}));
jest.mock('@integration/engine/order/OrderOrchestrator', () => ({
  OrderOrchestrator: { start: jest.fn() },
}));

let IntegrationEngine: any;
let DatabaseManagerInstance: any;
let ExportOrchestrator: any;
let ImportOrchestrator: any;
let OrderOrchestrator: any;
let appDb: any;
const callOrder: string[] = [];

/** Her testte TAZE bir modül grafiği kurar (static `isRunning` sızıntısını önlemek için). */
function loadFresh() {
  jest.resetModules();
  IntegrationEngine = require('@integration/engine/IntegrationEngine').default;
  ({ DatabaseManagerInstance } = require('@database/DatabaseManager'));
  ({ ExportOrchestrator } = require('@integration/engine/catalog/export/ExportOrchestrator'));
  ({ ImportOrchestrator } = require('@integration/engine/catalog/import/ImportOrchestrator'));
  ({ OrderOrchestrator } = require('@integration/engine/order/OrderOrchestrator'));

  callOrder.length = 0;
  appDb = { name: 'appDb' };
  DatabaseManagerInstance.getApplicationDB.mockReset().mockResolvedValue(appDb);

  ExportOrchestrator.start.mockReset().mockImplementation(() => { callOrder.push('Export.start'); });
  ExportOrchestrator.clearZombies.mockReset().mockImplementation(async () => { callOrder.push('Export.clearZombies'); });
  ImportOrchestrator.start.mockReset().mockImplementation(() => { callOrder.push('Import.start'); });
  ImportOrchestrator.clearZombies.mockReset().mockImplementation(async () => { callOrder.push('Import.clearZombies'); });
  OrderOrchestrator.start.mockReset().mockImplementation(() => { callOrder.push('Order.start'); });
}

beforeEach(() => {
  loadFresh();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  cap = captureLogs();
  // start() GERÇEK bir setInterval kurar (durdurma mekanizması YOK, bkz. MASTER_STATE.md); sahte zamanlayıcı
  // KULLANILMAZSA bu interval jest sürecini süresiz canlı tutar (açık handle). Bu yüzden HER testte sahte
  // zamanlayıcı zorunlu (yalnızca periyodik-temizlik testlerine özgü değil).
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('IntegrationEngine.start - mutlu yol sıralaması', () => {
  it('[MEVCUT DAVRANIŞ] applicationDB alınır, İLK açılış zombi temizliği (isInitial=true) yapılır, SONRA alt orkestratörler SIRAYLA başlatılır: Export -> Import -> Order', async () => {
    await IntegrationEngine.start();

    expect(DatabaseManagerInstance.getApplicationDB).toHaveBeenCalledTimes(1);
    expect(ExportOrchestrator.clearZombies).toHaveBeenCalledWith(appDb, true);
    expect(ImportOrchestrator.clearZombies).toHaveBeenCalledWith(appDb, true);
    expect(ExportOrchestrator.start).toHaveBeenCalledWith(appDb);
    expect(ImportOrchestrator.start).toHaveBeenCalledWith(appDb);
    expect(OrderOrchestrator.start).toHaveBeenCalledWith(); // parametresiz

    // Sıra: önce her iki zombi temizliği (paralel, ama ikisi de start()'lardan ÖNCE), sonra Export.start, Import.start, Order.start
    const startIdx = { export: callOrder.indexOf('Export.start'), import: callOrder.indexOf('Import.start'), order: callOrder.indexOf('Order.start') };
    expect(callOrder).toContain('Export.clearZombies');
    expect(callOrder).toContain('Import.clearZombies');
    expect(startIdx.export).toBeLessThan(startIdx.import);
    expect(startIdx.import).toBeLessThan(startIdx.order);
    expect(callOrder.indexOf('Export.clearZombies')).toBeLessThan(startIdx.export);
  });

  it('[MEVCUT DAVRANIŞ] alt orkestratörlerin start() dönüş değeri (varsa) BEKLENMEZ: IntegrationEngine.start() Export/Import/Order.start() içindeki asenkron işin bitmesini beklemeden döner (fire-and-forget)', async () => {
    let resolveExport: (() => void) | null = null;
    ExportOrchestrator.start.mockImplementation(() => new Promise<void>((r) => { resolveExport = r; }) as any);

    const p = IntegrationEngine.start();
    // start() Export'un iç promise'i HİÇ çözülmeden tamamlanabilmeli (Import/Order zaten çağrılmış olmalı)
    await p;
    expect(ImportOrchestrator.start).toHaveBeenCalled();
    expect(OrderOrchestrator.start).toHaveBeenCalled();
    // temizlik: pending promise'i çöz (sızıntı olmasın)
    resolveExport!();
  });
});

describe('IntegrationEngine.start - periyodik zombi temizliği (setInterval)', () => {
  it('[MEVCUT DAVRANIŞ] ZOMBIE_CHECK_INTERVAL (orchestrator.config.json, varsayılan 900000ms) ile periyodik temizlik kurulur; ileri sarınca isInitial=false ile tekrar çağrılır', async () => {
    jest.useFakeTimers();
    await IntegrationEngine.start();
    callOrder.length = 0;

    jest.advanceTimersByTime(900000);
    await Promise.resolve(); // mikro görev kuyruğunu boşalt
    await Promise.resolve();

    expect(ExportOrchestrator.clearZombies).toHaveBeenCalledWith(appDb, false);
    expect(ImportOrchestrator.clearZombies).toHaveBeenCalledWith(appDb, false);
  });

  it('[MEVCUT DAVRANIŞ] periyodik temizlikte HATA yutulur (console.error), interval durmaz/süreç çökmez', async () => {
    jest.useFakeTimers();
    await IntegrationEngine.start();
    ExportOrchestrator.clearZombies.mockRejectedValueOnce(new Error('mongo down'));

    jest.advanceTimersByTime(900000);
    await Promise.resolve();
    await Promise.resolve();

    // Not: `clearAllZombieLocks` KENDİ try/catch'i içinde hatayı yutup RESOLVE olur; bu yüzden setInterval
    // callback'indeki `.catch(...)` ("Global Cleanup Error:") ASLA tetiklenmez -- iç log mesajı görülür.
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'INTEGRATIONENGINE_CLEARALLZOMBIELOCKS_ERROR', err: expect.objectContaining({ message: "mongo down" }) }));

    // Bir sonraki tur yine çalışır (interval iptal olmadı)
    ExportOrchestrator.clearZombies.mockClear();
    jest.advanceTimersByTime(900000);
    await Promise.resolve();
    await Promise.resolve();
    expect(ExportOrchestrator.clearZombies).toHaveBeenCalledWith(appDb, false);
  });
});

describe('IntegrationEngine.start - isRunning koruması', () => {
  it('[MEVCUT DAVRANIŞ] start() ikinci kez çağrılırsa hiçbir şey tekrar yapılmaz (applicationDB tekrar alınmaz, alt orkestratörler tekrar başlatılmaz)', async () => {
    await IntegrationEngine.start();
    DatabaseManagerInstance.getApplicationDB.mockClear();
    ExportOrchestrator.start.mockClear();
    ImportOrchestrator.start.mockClear();
    OrderOrchestrator.start.mockClear();

    await IntegrationEngine.start();

    expect(DatabaseManagerInstance.getApplicationDB).not.toHaveBeenCalled();
    expect(ExportOrchestrator.start).not.toHaveBeenCalled();
    expect(ImportOrchestrator.start).not.toHaveBeenCalled();
    expect(OrderOrchestrator.start).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] eşzamanlı iki start() çağrısı: `isRunning` bayrağı SENKRON olarak en başta true yapıldığı için ikinci çağrı da erken döner (yarış koruması VAR — bayrak await\'ten ÖNCE set edilir)', async () => {
    const p1 = IntegrationEngine.start();
    const p2 = IntegrationEngine.start(); // p1 henüz applicationDB'yi bile almamışken senkron olarak girdi
    await Promise.all([p1, p2]);
    expect(DatabaseManagerInstance.getApplicationDB).toHaveBeenCalledTimes(1);
    expect(ExportOrchestrator.start).toHaveBeenCalledTimes(1);
  });
});

describe('IntegrationEngine.start - alt-sistem başlatma HATASI ve İZOLASYON (kaostestinin temeli)', () => {
  it('[IntegrationEngine başlatma izolasyonu düzeltmesi, 2026-09-27] ExportOrchestrator.start() SENKRON throw ederse: hata İZOLE EDİLİR (loglanır), ImportOrchestrator.start() ve OrderOrchestrator.start() YİNE DE ÇAĞRILIR; IntegrationEngine.start() REJECT OLMAZ.', async () => {
    // DÜZELTME ÖNCESİ bu test tersini sabitliyordu (bkz. git geçmişi / BACKLOG "%0-kapsamlı orkestrasyon
    // sınıfları" madde 1): start() içindeki 3 çağrı (Export/Import/Order) artık `safeStartSubsystem` ile
    // BAĞIMSIZ try/catch'e alınmıştır — biri SENKRON throw etse bile diğer ikisi YİNE DE çağrılır ve
    // IntegrationEngine.start() reddetmez (dolayısıyla entegrasyonik.ts'teki `gracefulShutdown()` artık
    // tek bir alt-sistemin başlatma hatasıyla TETİKLENMEZ).
    ExportOrchestrator.start.mockImplementation(() => { throw new Error('sync init boom'); });

    await expect(IntegrationEngine.start()).resolves.toBeUndefined();

    expect(ImportOrchestrator.start).toHaveBeenCalledWith(appDb);
    expect(OrderOrchestrator.start).toHaveBeenCalledWith();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'INTEGRATIONENGINE_START_BASLATMA_HATASI_IZOLE', msg: expect.stringContaining('ExportOrchestrator.start() başlatma hatası'), detail: 'sync init boom' }));
  });

  it('[IntegrationEngine başlatma izolasyonu düzeltmesi, 2026-09-27] ImportOrchestrator.start() SENKRON throw ederse: Export ZATEN başlamıştı (etkilenmez) VE OrderOrchestrator.start() YİNE DE ÇAĞRILIR; IntegrationEngine.start() REJECT OLMAZ.', async () => {
    ImportOrchestrator.start.mockImplementation(() => { throw new Error('import init boom'); });

    await expect(IntegrationEngine.start()).resolves.toBeUndefined();

    expect(ExportOrchestrator.start).toHaveBeenCalledTimes(1); // Export etkilenmedi, zaten çağrılmıştı
    expect(OrderOrchestrator.start).toHaveBeenCalledWith(); // Order YİNE DE başlatıldı (izolasyon)
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'INTEGRATIONENGINE_START_BASLATMA_HATASI_IZOLE', msg: expect.stringContaining('ImportOrchestrator.start() başlatma hatası'), detail: 'import init boom' }));
  });

  it('[IntegrationEngine başlatma izolasyonu düzeltmesi, 2026-09-27] Export/Import/Order.start() ÜÇÜ DE SENKRON throw ederse: IntegrationEngine.start() YİNE DE REJECT OLMAZ (süreç kapanmaz — KARAR: bkz. IntegrationEngine.ts JSDoc gerekçesi), her biri ayrı ayrı loglanır ve toplu bir "tamamen devre dışı" uyarısı EK OLARAK loglanır.', async () => {
    ExportOrchestrator.start.mockImplementation(() => { throw new Error('export boom'); });
    ImportOrchestrator.start.mockImplementation(() => { throw new Error('import boom'); });
    OrderOrchestrator.start.mockImplementation(() => { throw new Error('order boom'); });

    await expect(IntegrationEngine.start()).resolves.toBeUndefined();

    expect(ExportOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(ImportOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(OrderOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'INTEGRATIONENGINE_KRITIK_EXPORT_IMPORT_ORDER', msg: expect.stringContaining('KRİTİK: Export/Import/Order orkestratörlerinin ÜÇÜ DE başlatılamadı') }));
  });

  it('[MEVCUT DAVRANIŞ] ExportOrchestrator.start() ASENKRON olarak (kendi döngüsü içinde, ilk `await`\'ten SONRA) reddederse: bu IntegrationEngine.start()\'ı ETKİLEMEZ (zaten dönmüştü) — Import/Order normal şekilde başlar. Fark: SENKRON throw kardeşleri engeller, ASENKRON (sonradan gelen) ret etmez.', async () => {
    // ExportOrchestrator.start() gerçek kodda `async` değildir ve döngüyü (startLoop) AWAIT ETMEDEN başlatır;
    // bu nedenle döngü içindeki bir reddi IntegrationEngine.start()'a hiçbir zaman ulaşmaz. Burada bunu,
    // mock'un bir "sonradan reddeden" promise DÖNDÜRMESİYLE (ama IntegrationEngine bunu await etmediği için)
    // taklit ediyoruz.
    ExportOrchestrator.start.mockImplementation(() => {
      callOrder.push('Export.start');
      const p = Promise.reject(new Error('loop crashed later'));
      p.catch(() => undefined); // SUT zaten await etmiyor; test sürecinin unhandledRejection ile çökmesini önlemek için sessizce yutulur
      return p as any;
    });

    await expect(IntegrationEngine.start()).resolves.toBeUndefined();
    expect(ImportOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(OrderOrchestrator.start).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] İLK açılış zombi temizliğinde (clearAllZombieLocks) hata olursa dış try/catch tarafından yutulur; alt orkestratörler YİNE DE başlatılır (bu adımda İZOLASYON HER ZAMAN vardı; Export/Import/Order.start() çağrıları da [2026-09-27] düzeltmesiyle artık AYNI şekilde izole)', async () => {
    ExportOrchestrator.clearZombies.mockRejectedValueOnce(new Error('zombie cleanup fail'));

    await expect(IntegrationEngine.start()).resolves.toBeUndefined();

    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'INTEGRATIONENGINE_CLEARALLZOMBIELOCKS_ERROR', err: expect.objectContaining({ message: "zombie cleanup fail" }) }));
    expect(ExportOrchestrator.start).toHaveBeenCalled();
    expect(ImportOrchestrator.start).toHaveBeenCalled();
    expect(OrderOrchestrator.start).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] ilk temizlikte Export VE Import.clearZombies HER İKİSİ DE çağrılır (Promise.all eşzamanlı başlatır); biri reddetse bile diğeri çağrılmış olur (Promise.all\'un eager-start semantiği)', async () => {
    ExportOrchestrator.clearZombies.mockRejectedValueOnce(new Error('export zombie fail'));
    await IntegrationEngine.start();
    expect(ImportOrchestrator.clearZombies).toHaveBeenCalledWith(appDb, true);
  });

  it('[MEVCUT DAVRANIŞ] applicationDB alınamazsa (DatabaseManagerInstance.getApplicationDB reddeder): hiçbir alt orkestratör başlatılmaz, IntegrationEngine.start() REJECT olur (try/catch YOK, bu satır dış korumasız)', async () => {
    DatabaseManagerInstance.getApplicationDB.mockRejectedValueOnce(new Error('db down'));
    await expect(IntegrationEngine.start()).rejects.toThrow('db down');
    expect(ExportOrchestrator.start).not.toHaveBeenCalled();
    expect(ImportOrchestrator.start).not.toHaveBeenCalled();
    expect(OrderOrchestrator.start).not.toHaveBeenCalled();
  });
});

/**
 * CHARACTERIZATION (tamamlayıcı): IntegrationEngine yaşam döngüsü — durdurma imkânı, setInterval, isRunning, başlatma günlüğü
 * Kaynak: backend/src/integration/engine/IntegrationEngine.ts
 * BACKLOG C14 açık ucu (2026-09-28): `IntegrationEngine.characterization.test.ts` başlatma sırası + izolasyonu sabitlemişti;
 * bu dosya DURDURMA BAYRAĞI YOK (setInterval tutamağı saklanmaz/iptal edilmez), isRunning'in "zehirlenmesi", zombi temizliğinin
 * çakışma korumasız periyodikliği ve başlatma günlüğü sırasını sabitler. [DÜZELTME 2026-09-28: isRunning artık DB erişimi reddedilince geri alınır; ilgili test ters çevrildi, diğerleri aynen.] Alt orkestratörler mock;
 * DB/Redis/ağ YOK; sahte zamanlayıcı -> gerçek interval sızıntısı YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));
jest.mock('@integration/engine/catalog/export/ExportOrchestrator', () => ({ ExportOrchestrator: { start: jest.fn(), clearZombies: jest.fn(async () => undefined) } }));
jest.mock('@integration/engine/catalog/import/ImportOrchestrator', () => ({ ImportOrchestrator: { start: jest.fn(), clearZombies: jest.fn(async () => undefined) } }));
jest.mock('@integration/engine/order/OrderOrchestrator', () => ({ OrderOrchestrator: { start: jest.fn() } }));

let IntegrationEngine: any;
let DatabaseManagerInstance: any;
let ExportOrchestrator: any;
let ImportOrchestrator: any;
let OrderOrchestrator: any;
let appDb: any;
const order: string[] = [];

function loadFresh() {
  jest.resetModules();
  IntegrationEngine = require('@integration/engine/IntegrationEngine').default;
  ({ DatabaseManagerInstance } = require('@database/DatabaseManager'));
  ({ ExportOrchestrator } = require('@integration/engine/catalog/export/ExportOrchestrator'));
  ({ ImportOrchestrator } = require('@integration/engine/catalog/import/ImportOrchestrator'));
  ({ OrderOrchestrator } = require('@integration/engine/order/OrderOrchestrator'));
  order.length = 0;
  appDb = { name: 'appDb' };
  DatabaseManagerInstance.getApplicationDB.mockReset().mockResolvedValue(appDb);
  ExportOrchestrator.start.mockReset().mockImplementation(() => { order.push('Export.start'); });
  ImportOrchestrator.start.mockReset().mockImplementation(() => { order.push('Import.start'); });
  OrderOrchestrator.start.mockReset().mockImplementation(() => { order.push('Order.start'); });
  ExportOrchestrator.clearZombies.mockReset().mockResolvedValue(undefined);
  ImportOrchestrator.clearZombies.mockReset().mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.useFakeTimers();
  loadFresh();
  // [F-06] 'Engine started' artık yapılandırılmış log (stdout JSON): sıra doğrulaması için koda göre yakalanır.
  jest.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => { for (const l of String(chunk).split('\n')) if (l.includes('INTEGRATIONENGINE_ENGINE_STARTED')) order.push('log:[IntegrationEngine] Engine started on'); return true; }) as never);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const tick = async (ms: number) => { await jest.advanceTimersByTimeAsync(ms); };

describe('IntegrationEngine - DURDURMA İMKÂNI YOK', () => {
  it('[MEVCUT DAVRANIŞ] statik yüzeyde stop/shutdown/close/destroy/halt/cancel benzeri HİÇBİR üye yoktur (yalnızca start + private clearAllZombieLocks/safeStartSubsystem + durum alanları)', () => {
    const names = Object.getOwnPropertyNames(IntegrationEngine);
    expect(names.filter((n) => /stop|shutdown|close|destroy|halt|cancel|abort|terminate/i.test(n))).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(['start', 'clearAllZombieLocks', 'safeStartSubsystem', 'isRunning', 'POD_NAME', 'ZOMBIE_CHECK_INTERVAL']));
  });

  it('[MEVCUT DAVRANIŞ] start() TAM 1 setInterval kurar ve tutamağını SAKLAMAZ: clearInterval hiç çağrılmaz, ikinci start() yeni zamanlayıcı eklemez; sınıfta interval referansı alanı yoktur', async () => {
    const setSpy = jest.spyOn(global, 'setInterval');
    const clearSpy = jest.spyOn(global, 'clearInterval');
    await IntegrationEngine.start();
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 900000);
    expect(jest.getTimerCount()).toBe(1);

    await IntegrationEngine.start(); // no-op (isRunning)
    expect(jest.getTimerCount()).toBe(1);
    await tick(900000 * 4);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyNames(IntegrationEngine).filter((n) => /timer|handle|intervalId|timeout/i.test(n))).toEqual([]);
  });

  it('[MEVCUT DAVRANIŞ] interval "sonsuza dek" çalışır: 1 saatte 4 periyodik temizlik (900sn), her biri isInitial=false ile Export+Import.clearZombies; ilk tik 900000ms\'den ÖNCE gelmez', async () => {
    await IntegrationEngine.start();
    ExportOrchestrator.clearZombies.mockClear();
    ImportOrchestrator.clearZombies.mockClear();

    await tick(899999);
    expect(ExportOrchestrator.clearZombies).not.toHaveBeenCalled();
    await tick(1);
    expect(ExportOrchestrator.clearZombies).toHaveBeenCalledTimes(1);

    await tick(3600000 - 900000);
    expect(ExportOrchestrator.clearZombies).toHaveBeenCalledTimes(4);
    expect(ImportOrchestrator.clearZombies).toHaveBeenCalledTimes(4);
    expect(ExportOrchestrator.clearZombies.mock.calls.every((c: any[]) => c[0] === appDb && c[1] === false)).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ] periyodik temizlikte ÇAKIŞMA KORUMASI YOK: bir tur bitmemişken (clearZombies askıda) sonraki tikler yenilerini başlatır', async () => {
    await IntegrationEngine.start(); // ilk açılış temizliği (isInitial=true) mockResolvedValue ile bitti
    ExportOrchestrator.clearZombies.mockReset().mockImplementation(() => new Promise(() => undefined)); // bundan sonrakiler asla bitmez
    ImportOrchestrator.clearZombies.mockReset().mockResolvedValue(undefined);

    await tick(900000 * 3);
    expect(ExportOrchestrator.clearZombies).toHaveBeenCalledTimes(3);
  });
});

describe('IntegrationEngine.start - isRunning ve günlük sırası', () => {
  it('[DÜZELTME 2026-09-28] applicationDB alınamayıp start() reddederse isRunning bayrağı GERİ ALINIR: ikinci start() yeniden dener (eskiden "zehirlenmiş" durumda sessizce no-op olurdu) ve başarılı olunca alt orkestratörler başlar; çift interval oluşmaz', async () => {
    DatabaseManagerInstance.getApplicationDB.mockRejectedValueOnce(new Error('db down'));
    await expect(IntegrationEngine.start()).rejects.toThrow('db down');
    expect(IntegrationEngine.isRunning).toBe(false);
    expect(ExportOrchestrator.start).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0); // başarısız denemede interval kurulmadı

    await expect(IntegrationEngine.start()).resolves.toBeUndefined(); // yeniden deneme çalışır
    expect(DatabaseManagerInstance.getApplicationDB).toHaveBeenCalledTimes(2);
    expect(IntegrationEngine.isRunning).toBe(true);
    expect(ExportOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(ImportOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(OrderOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1); // tam 1 zamanlayıcı

    await IntegrationEngine.start(); // başarılı başlatmadan sonra çift start hâlâ no-op
    expect(ExportOrchestrator.start).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('[MEVCUT DAVRANIŞ] "Engine started" günlüğü alt orkestratörler başlatılmadan ÖNCE yazılır (başarısız başlatma olsa bile "started" görünür); sıra: zombi temizliği -> interval -> günlük -> Export -> Import -> Order', async () => {
    await IntegrationEngine.start();
    const logIdx = order.findIndex((l) => l.startsWith('log:[IntegrationEngine] Engine started on'));
    expect(logIdx).toBeGreaterThanOrEqual(0);
    expect(logIdx).toBeLessThan(order.indexOf('Export.start'));
    expect(order.indexOf('Export.start')).toBeLessThan(order.indexOf('Import.start'));
    expect(order.indexOf('Import.start')).toBeLessThan(order.indexOf('Order.start'));
  });

  it('[MEVCUT DAVRANIŞ] alt orkestratörler MOCK\'LU birim sınırında start() üçüne de tam 1 kez çağrı yapar ve dönüş değerlerini beklemez; orkestratör döngüleri (ExportOrchestrator/ImportOrchestrator) bu nedenle IntegrationEngine.start() döndükten SONRA da sürer (fire-and-forget)', async () => {
    let exportLoopStillRunning = false;
    ExportOrchestrator.start.mockImplementation(() => { setTimeout(() => { exportLoopStillRunning = true; }, 1000); });
    await IntegrationEngine.start();
    expect(exportLoopStillRunning).toBe(false); // start() döndüğünde export "döngüsü" henüz ilerlemedi
    await tick(1000);
    expect(exportLoopStillRunning).toBe(true);
  });
});

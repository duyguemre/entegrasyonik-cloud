/**
 * CHARACTERIZATION (tamamlayıcı): ExportOrchestrator yaşam döngüsü, çoklu-tenant tarama, durdurma imkânı, arşivleme uç durumları
 * Kaynak: backend/src/integration/engine/catalog/export/ExportOrchestrator.ts
 * BACKLOG C14 açık ucu (2026-09-28): `ExportOrchestrator.characterization.test.ts` çekirdek döngüyü sabitlemişti; bu dosya
 * DURDURMA BAYRAĞI YOK, çift start(), platform kilidi ($nor) ile çoklu-tenant tarama, olay yayını ve archiveAndCleanup
 * uç durumlarını sabitler. KAYNAK KOD DEĞİŞTİRİLMEDİ. Tüm bağımlılıklar mock; DB/Redis/ağ YOK; sahte zamanlayıcı
 * kullanılır (döngü test sonunda fake timer'a bağlı "askıda" kalır, gerçek handle YOK -> süreç sızıntısı yok).
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@integration/engine/catalog/export/Dispatcher', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/export/Validator', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/export/Publisher', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/export/Sentinel', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/export/Sync', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getClientDB: jest.fn() } }));
jest.mock('@services/storage/StorageService', () => ({ storageService: { uploadArchive: jest.fn() } }));
jest.mock('@integration/engine/catalog/provider/IntegrationEngineProvider', () => ({ IntegrationEngineProvider: jest.fn() }));
jest.mock('@services/statistics/StatisticsTracker', () => ({ StatisticsTracker: { init: jest.fn(), track: jest.fn() } }));

function chain(result: any) {
  const c: any = {};
  for (const m of ['sort', 'limit', 'select']) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

let ExportOrchestrator: any;
let DatabaseManagerInstance: any;
let storageService: any;
let StatisticsTracker: any;
let integrationEventBus: any;
let EVENTS: any;
let DispatcherCtor: any;
let ValidatorCtor: any;
let signalModel: any;
let stagedModel: any;
let clientDb: any;
let appDb: any;
let workerRunOnce: any;
/** Sinyal seçim sorgusu her çağrıda bu kuyruktan bir eleman çeker (yoksa null = iş yok). */
let signalQueue: any[];
/** dispatch() finally'sindeki "kilit bırakma" güncellemesinin döndüreceği sinyal statüsü. */
let releasedStatus: string;

const flush = () => jest.advanceTimersByTimeAsync(0);

function loadFresh() {
  jest.resetModules();
  ExportOrchestrator = require('@integration/engine/catalog/export/ExportOrchestrator').ExportOrchestrator;
  ({ DatabaseManagerInstance } = require('@database/DatabaseManager'));
  ({ storageService } = require('@services/storage/StorageService'));
  ({ StatisticsTracker } = require('@services/statistics/StatisticsTracker'));
  ({ integrationEventBus, EVENTS } = require('@integration/engine/IntegrationEventBus'));
  DispatcherCtor = require('@integration/engine/catalog/export/Dispatcher').default;
  ValidatorCtor = require('@integration/engine/catalog/export/Validator').default;

  signalQueue = [];
  releasedStatus = 'SENT';
  signalModel = {
    findOneAndUpdate: jest.fn(async (filter: any) => ('lockedBy' in filter ? (signalQueue.shift() ?? null) : { status: releasedStatus })),
    findOne: jest.fn(() => chain(null)),
  };
  appDb = { getExportSignalModel: jest.fn(() => signalModel) };
  stagedModel = { find: jest.fn(() => chain([])), bulkWrite: jest.fn(async () => undefined) };
  clientDb = { getExportStagedProductModel: jest.fn(() => stagedModel) };

  DispatcherCtor.mockReset().mockImplementation(() => ({ run: jest.fn(async () => undefined) }));
  workerRunOnce = jest.fn(async () => undefined);
  ValidatorCtor.mockReset().mockImplementation(() => ({ runOnce: workerRunOnce }));
  DatabaseManagerInstance.getClientDB.mockReset().mockResolvedValue(clientDb);
  storageService.uploadArchive.mockReset().mockResolvedValue({ result: true, key: 'archive-key' });
  StatisticsTracker.init.mockReset();
  StatisticsTracker.track.mockReset();
}

beforeEach(() => {
  jest.useFakeTimers();
  loadFresh();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  cap = captureLogs();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const selectionCalls = () => (signalModel.findOneAndUpdate.mock.calls as any[]).filter((c) => c[0] && 'lockedBy' in c[0]);
const sig = (over: Partial<any> = {}) => ({ _id: 'sig1', clientId: '7', integrationCode: 'trendyol', status: 'PREPARING', mode: 'TRANSFER', batchId: 'b1', itemCount: 3, ...over });

describe('ExportOrchestrator - DURDURMA İMKÂNI YOK (bayrak/stop metodu/clearTimeout yok)', () => {
  it('[MEVCUT DAVRANIŞ] sınıfın statik yüzeyinde stop/shutdown/close/destroy/halt/cancel benzeri HİÇBİR üye yoktur; yalnızca start ve clearZombies genel API\'dir (start/clearZombies dışındakiler private ama çalışma zamanında görünür)', () => {
    const names = Object.getOwnPropertyNames(ExportOrchestrator);
    expect(names.filter((n) => /stop|shutdown|close|destroy|halt|cancel|abort|terminate/i.test(n))).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(['start', 'clearZombies', 'startLoop', 'dispatch', 'archiveAndCleanup', 'getWorkerTypeByStatus']));
  });

  it('[MEVCUT DAVRANIŞ] döngü zamanlayıcısı hiçbir zaman iptal edilmez: clearTimeout ÇAĞRILMAZ; olay dinleyicisi (PROCESS_NEXT_SIGNAL) hiç kaldırılmaz; bekleme sırasında TAM 1 bekleyen zamanlayıcı vardır', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    ExportOrchestrator.start(appDb);
    await flush();
    expect(jest.getTimerCount()).toBe(1); // 300sn'lik bekleme
    expect(integrationEventBus.listenerCount(EVENTS.PROCESS_NEXT_SIGNAL)).toBe(1);

    await jest.advanceTimersByTimeAsync(300000 * 3);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(integrationEventBus.listenerCount(EVENTS.PROCESS_NEXT_SIGNAL)).toBe(1); // dinleyici sızmıyor ama hiç de kaldırılmıyor
  });

  it('[MEVCUT DAVRANIŞ] döngü "sonsuza dek" poll eder: 1 saatlik simüle sürede (boşta, 300sn aralık) ~12 seçim turu; süreç kapanış sinyali/bayrak olmadığı için kendi kendine ASLA durmaz', async () => {
    ExportOrchestrator.start(appDb);
    await flush();
    await jest.advanceTimersByTimeAsync(3600000);
    // t=0 turu + her 300sn'de bir tur = 1 + 12
    expect(selectionCalls()).toHaveLength(13);
    expect(jest.getTimerCount()).toBe(1); // hâlâ bir sonraki turu bekliyor
  });

  it('[MEVCUT DAVRANIŞ] start() İKİ KEZ çağrılırsa isRunning koruması YOKTUR: iki bağımsız döngü + iki dinleyici oluşur (her turda 2 Dispatcher), StatisticsTracker.init 2 kez çağrılır', async () => {
    ExportOrchestrator.start(appDb);
    ExportOrchestrator.start(appDb);
    await flush();
    expect(StatisticsTracker.init).toHaveBeenCalledTimes(2);
    expect(DispatcherCtor).toHaveBeenCalledTimes(2);
    expect(selectionCalls()).toHaveLength(2);
    expect(integrationEventBus.listenerCount(EVENTS.PROCESS_NEXT_SIGNAL)).toBe(2);
  });
});

describe('ExportOrchestrator - çoklu-tenant tarama: platform kilidi (activePlatformLocks / $nor)', () => {
  it('[MEVCUT DAVRANIŞ] bir (clientId,integrationCode) çifti işlenirken sonraki sorguya $nor eklenir (aynı tenant+platform paralel çalışmaz); BAŞKA tenant\'ın AYNI platformu ise seçilir; iş bitince kilit kalkar', async () => {
    const pending: Array<() => void> = [];
    workerRunOnce.mockImplementation(() => new Promise<void>((r) => { pending.push(r); }));
    signalQueue = [sig({ _id: 'sA', clientId: '7', integrationCode: 'trendyol', batchId: 'bA' }), sig({ _id: 'sB', clientId: '8', integrationCode: 'trendyol', batchId: 'bB' })];

    ExportOrchestrator.start(appDb);
    await flush(); // tur 1: sA seçildi, worker askıda
    expect(selectionCalls()[0][0].$nor).toBeUndefined();

    await jest.advanceTimersByTimeAsync(1000); // tur 2 (1sn sabit gecikme sonrası)
    expect(selectionCalls()[1][0].$nor).toEqual([{ clientId: '7', integrationCode: 'trendyol' }]);
    expect(workerRunOnce).toHaveBeenCalledTimes(2); // tenant 8 (aynı platform) paralel işlendi
    expect(workerRunOnce).toHaveBeenNthCalledWith(2, '8', 'trendyol', 'TRANSFER', 'bB');

    await jest.advanceTimersByTimeAsync(1000); // tur 3: iki kilit de aktif
    expect(selectionCalls()[2][0].$nor).toEqual([
      { clientId: '7', integrationCode: 'trendyol' },
      { clientId: '8', integrationCode: 'trendyol' },
    ]);

    pending.forEach((r) => r()); // her iki worker biter -> finally kilitleri siler
    await flush();
    await jest.advanceTimersByTimeAsync(1000);
    const last = selectionCalls()[selectionCalls().length - 1][0];
    expect(last.$nor).toBeUndefined();
  });

  it('[MEVCUT DAVRANIŞ — ŞÜPHELİ, BACKLOG] kilit anahtarı `${clientId}-${integrationCode}` biçimindedir ve $nor kurulurken `key.split(\'-\')` ile geri ayrıştırılır: içinde "-" geçen bir integrationCode KESİLİR (ör. "my-platform" -> "my"); bugün tüm gerçek kodlar ("trendyol","n11","hepsiburada","pazarama","ideasoft","bizimhesap") tire içermediği için tetiklenmez', async () => {
    workerRunOnce.mockImplementation(() => new Promise<void>(() => undefined)); // asla bitmez
    signalQueue = [sig({ clientId: '7', integrationCode: 'my-platform' })];
    ExportOrchestrator.start(appDb);
    await flush();
    await jest.advanceTimersByTimeAsync(1000);
    expect(selectionCalls()[1][0].$nor).toEqual([{ clientId: '7', integrationCode: 'my' }]);
  });
});

describe('ExportOrchestrator - olay yolu (IntegrationEventBus)', () => {
  it('[MEVCUT DAVRANIŞ] her dispatch() SONUNDA (başarı/hata/clientDB-yok fark etmez) PROCESS_NEXT_SIGNAL yayınlanır', async () => {
    const emitSpy = jest.spyOn(integrationEventBus, 'emit');
    signalQueue = [sig()];
    ExportOrchestrator.start(appDb);
    await flush();
    expect(emitSpy).toHaveBeenCalledWith(EVENTS.PROCESS_NEXT_SIGNAL);

    loadFresh();
    const emitSpy2 = jest.spyOn(integrationEventBus, 'emit');
    signalQueue = [sig()];
    DatabaseManagerInstance.getClientDB.mockResolvedValueOnce(null);
    ExportOrchestrator.start(appDb);
    await flush();
    expect(emitSpy2).toHaveBeenCalledWith(EVENTS.PROCESS_NEXT_SIGNAL);
  });

  it('[MEVCUT DAVRANIŞ] PROCESS_NEXT_IMPORT_JOB (Import olayı) Export döngüsünü UYANDIRMAZ: iki olay yolu ayrıdır', async () => {
    ExportOrchestrator.start(appDb);
    await flush();
    signalModel.findOneAndUpdate.mockClear();
    integrationEventBus.emit(EVENTS.PROCESS_NEXT_IMPORT_JOB);
    await flush();
    expect(selectionCalls()).toHaveLength(0);
  });
});

describe('ExportOrchestrator.archiveAndCleanup - uç durumlar (dispatch sonrası COMPLETED/FAILED)', () => {
  const run = (signal: any) => (ExportOrchestrator as any).archiveAndCleanup(signal);

  it('[MEVCUT DAVRANIŞ] FAILED statüsü de arşivler (yalnızca COMPLETED değil)', async () => {
    releasedStatus = 'FAILED';
    signalQueue = [sig()];
    stagedModel.find.mockReturnValue(chain([{ _id: 'p1', barcode: 'B1', payload: { a: 1 } }]));
    ExportOrchestrator.start(appDb);
    await flush();
    expect(storageService.uploadArchive).toHaveBeenCalledTimes(1);
    expect(StatisticsTracker.track).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' })); // updatedSignal FAILED -> FAILED
  });

  it('[MEVCUT DAVRANIŞ] anahtar: barcode || _id; içerik: payload || rawData; ikisi de yoksa kayıt arşive KONMAZ ama yine de (boş {} dahil) yükleme yapılır ve bulkWrite TÜM kayıtlara uygulanır', async () => {
    stagedModel.find.mockReturnValue(chain([
      { _id: 'p1', barcode: 'B1', payload: { a: 1 } },
      { _id: 'p2', rawData: { r: 2 } }, // barcode yok -> _id anahtarı, rawData içerik
      { _id: 'p3', barcode: 'B3' }, // payload/rawData yok -> arşive girmez
    ]));
    await run(sig({ batchId: 'bx' }));
    expect(storageService.uploadArchive).toHaveBeenCalledWith('7', { B1: { a: 1 }, p2: { r: 2 } }, expect.stringContaining('exports/7/'), 'batch_bx_payloads');
    const ops = stagedModel.bulkWrite.mock.calls[0][0];
    expect(ops.map((o: any) => o.updateOne.filter._id)).toEqual(['p1', 'p2', 'p3']); // payload'ı olmayan p3 de "arşivlendi" işaretlenir
  });

  it('[MEVCUT DAVRANIŞ] staged kayıtların HİÇBİRİNDE payload/rawData yoksa yine de BOŞ arşiv ({}) yüklenir ve kayıtlar "arşivlendi" işaretlenir (payload zaten yok)', async () => {
    stagedModel.find.mockReturnValue(chain([{ _id: 'p1', barcode: 'B1' }]));
    await run(sig({ batchId: 'empty' }));
    expect(storageService.uploadArchive).toHaveBeenCalledWith('7', {}, expect.any(String), 'batch_empty_payloads');
    expect(stagedModel.bulkWrite).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] hiç staged kayıt yoksa yükleme/bulkWrite YAPILMAZ', async () => {
    stagedModel.find.mockReturnValue(chain([]));
    await run(sig());
    expect(storageService.uploadArchive).not.toHaveBeenCalled();
    expect(stagedModel.bulkWrite).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] yükleme başarısız (result:false) ise bulkWrite YAPILMAZ (payload Mongo\'da kalır), hata FIRLATILMAZ ve loglanmaz', async () => {
    stagedModel.find.mockReturnValue(chain([{ _id: 'p1', barcode: 'B1', payload: { a: 1 } }]));
    storageService.uploadArchive.mockResolvedValue({ result: false });
    await expect(run(sig())).resolves.toBeUndefined();
    expect(stagedModel.bulkWrite).not.toHaveBeenCalled();
    expect(cap.filter((l) => l.level === 'error')).toHaveLength(0);
  });

  it('[MEVCUT DAVRANIŞ] yükleme fırlatırsa ("[Archive Error]:") yutulur; dispatch akışı bozulmaz ve PROCESS_NEXT_SIGNAL yine yayınlanır', async () => {
    releasedStatus = 'COMPLETED';
    signalQueue = [sig()];
    stagedModel.find.mockReturnValue(chain([{ _id: 'p1', barcode: 'B1', payload: { a: 1 } }]));
    storageService.uploadArchive.mockRejectedValue(new Error('R2 down'));
    const emitSpy = jest.spyOn(integrationEventBus, 'emit');
    ExportOrchestrator.start(appDb);
    await flush();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'EXPORTORCHESTRATOR_ARCHIVE_ERROR', err: expect.objectContaining({ message: "R2 down" }) }));
    expect(emitSpy).toHaveBeenCalledWith(EVENTS.PROCESS_NEXT_SIGNAL);
  });

  it('[MEVCUT DAVRANIŞ] clientId yoksa erken çıkış (loglanır); arşivleme sırasında clientDB bulunamazsa "[Archive Error]:" ile yutulur', async () => {
    await run(sig({ clientId: undefined, _id: 'sigX' }));
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'EXPORTORCHESTRATOR_CLIENT_ID_NOT_FOUND', msg: expect.stringContaining('Job ID: sigX') }));

    DatabaseManagerInstance.getClientDB.mockResolvedValueOnce(null);
    await run(sig());
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'EXPORTORCHESTRATOR_ARCHIVE_ERROR', err: expect.objectContaining({ message: "Client DB not found for client ID: 7" }) }));
  });
});

describe('ExportOrchestrator - kill-switch (ADR-0030 X6)', () => {
  it('[YENİ DAVRANIŞ] off: kapalı entegrasyon sinyal seçiminden dışlanır; global off: sinyal hiç kilitlenmez/işçi çağrılmaz; açılınca devam', async () => {
    const store = require('@integration/config/platformOverrideStore');
    store.setTargetIntake('trendyol', 'off');
    ExportOrchestrator.start(appDb);
    await flush();
    expect(selectionCalls()[0][0].integrationCode).toEqual({ $nin: ['trendyol'] });

    store.setTargetIntake('_engine', 'off');
    signalQueue.push(sig());
    await jest.advanceTimersByTimeAsync(20000);
    expect(workerRunOnce).not.toHaveBeenCalled();
    expect(signalQueue.length).toBe(1); // iş kaybolmadı, kilitlenmedi

    store.setTargetIntake('_engine', 'on'); store.setTargetIntake('trendyol', 'on');
    await jest.advanceTimersByTimeAsync(20000);
    expect(workerRunOnce).toHaveBeenCalledTimes(1);
  });
});

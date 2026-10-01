/**
 * CHARACTERIZATION: ExportOrchestrator (katalog export "while(true)" döngüsü)
 * Kaynak: backend/src/integration/engine/catalog/export/ExportOrchestrator.ts
 *
 * %0 kapsam, dokunulmaz listesindeydi (docs/QA_FAZ2.md madde 7/12, MASTER_STATE.md). Kod DEĞİŞTİRİLMEDİ.
 *
 * Dispatcher/Validator/Publisher/Sentinel/Sync, DatabaseManager, StorageService, IntegrationEngineProvider,
 * StatisticsTracker jest.mock ile değiştirilir. `integrationEventBus` GERÇEKTİR (Dispatcher/Sync
 * characterization testlerindeki desenle AYNI). DB/Redis/ağ YOK.
 *
 * ÖNEMLİ TEKNİK NOT: `startLoop` sonsuz bir `while(true)`'dur ve DURDURMA MEKANİZMASI YOKTUR (MASTER_STATE.md).
 * Bu yüzden HER testte `jest.resetModules()` ile TAZE bir modül grafiği kurulup sahte zamanlayıcılarla İLERİ
 * SARILARAK yalnızca birkaç iterasyon gözlemlenir; döngü test sonunda "askıda" (fake timer'a bağlı, gerçek
 * handle YOK) bırakılır — bir sonraki testin taze modül grafiğini ETKİLEMEZ (kanıt: bu dosyadaki tüm testler
 * yeşil ve sırayla/paralel çalışırken çakışmıyor).
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

/** find()/findOne() zincirini taklit eder (Dispatcher/Sync testleriyle AYNI desen). */
function chain(result: any) {
  const c: any = { calls: {} as Record<string, any[]> };
  for (const m of ['sort', 'limit', 'select']) c[m] = jest.fn((...a: any[]) => { c.calls[m] = a; return c; });
  c.lean = jest.fn(async () => result);
  return c;
}

let ExportOrchestrator: any;
let DatabaseManagerInstance: any;
let storageService: any;
let IntegrationEngineProvider: any;
let StatisticsTracker: any;
let integrationEventBus: any;
let EVENTS: any;
let DispatcherCtor: any;
let ValidatorCtor: any;
let PublisherCtor: any;
let SentinelCtor: any;
let SyncCtor: any;

let signalModel: any;
let stagedModel: any;
let clientDb: any;
let appDb: any;
let findOneAndUpdateResult: any;
let nextPotentialResult: any;
let dispatcherRun: any;
let workerRunOnce: any;

async function flush() {
  // modern sahte zamanlayıcılar: bekleyen mikro görevleri de doğru şekilde arada işler (advanceTimersByTime'ın
  // aksine). 0ms ilerletmek, henüz hiçbir gerçek setTimeout beklemeyen ama zincirlenmiş await'leri tüketen
  // promise zincirlerini (dispatcher.run -> findOneAndUpdate -> dispatch içi await'ler) sona erdirir.
  await jest.advanceTimersByTimeAsync(0);
}

function loadFresh() {
  jest.resetModules();
  ExportOrchestrator = require('@integration/engine/catalog/export/ExportOrchestrator').ExportOrchestrator;
  ({ DatabaseManagerInstance } = require('@database/DatabaseManager'));
  ({ storageService } = require('@services/storage/StorageService'));
  ({ IntegrationEngineProvider } = require('@integration/engine/catalog/provider/IntegrationEngineProvider'));
  ({ StatisticsTracker } = require('@services/statistics/StatisticsTracker'));
  ({ integrationEventBus, EVENTS } = require('@integration/engine/IntegrationEventBus'));
  DispatcherCtor = require('@integration/engine/catalog/export/Dispatcher').default;
  ValidatorCtor = require('@integration/engine/catalog/export/Validator').default;
  PublisherCtor = require('@integration/engine/catalog/export/Publisher').default;
  SentinelCtor = require('@integration/engine/catalog/export/Sentinel').default;
  SyncCtor = require('@integration/engine/catalog/export/Sync').default;

  findOneAndUpdateResult = null; // varsayılan: işlenecek sinyal yok
  nextPotentialResult = null;

  signalModel = {
    findOneAndUpdate: jest.fn(async () => findOneAndUpdateResult),
    findOne: jest.fn(() => chain(nextPotentialResult)),
  };
  appDb = { getExportSignalModel: jest.fn(() => signalModel) };

  stagedModel = { find: jest.fn(() => chain([])) };
  clientDb = { getExportStagedProductModel: jest.fn(() => stagedModel) };

  dispatcherRun = jest.fn(async () => undefined);
  DispatcherCtor.mockReset().mockImplementation(() => ({ run: dispatcherRun }));

  workerRunOnce = jest.fn(async () => undefined);
  for (const C of [ValidatorCtor, PublisherCtor, SentinelCtor, SyncCtor]) {
    C.mockReset().mockImplementation(() => ({ runOnce: workerRunOnce }));
  }

  DatabaseManagerInstance.getClientDB.mockReset().mockResolvedValue(clientDb);
  IntegrationEngineProvider.mockReset();
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

/** `signalModel.findOneAndUpdate` İKİ farklı amaçla çağrılır: (a) sinyal SEÇİMİ (filtre `lockedBy` içerir),
 * (b) dispatch() finally'sindeki KİLİT BIRAKMA (filtre yalnızca `_id` içerir). Şekle göre ayrıştırılır. */
const selectionCalls = () => (signalModel.findOneAndUpdate.mock.calls as any[]).filter((c) => c[0] && 'lockedBy' in c[0]);

const sig = (over: Partial<any> = {}) => ({
  _id: 'sig1', clientId: '7', integrationCode: 'trendyol', status: 'PREPARING', mode: 'TRANSFER', batchId: 'b1', itemCount: 3,
  ...over,
});

describe('ExportOrchestrator.start - kurulum', () => {
  it('[MEVCUT DAVRANIŞ] start(applicationDB) StatisticsTracker.init(applicationDB) çağırır (senkron), döngüyü BEKLEMEDEN döner', () => {
    const result = ExportOrchestrator.start(appDb);
    expect(StatisticsTracker.init).toHaveBeenCalledWith(appDb);
    expect(result).toBeUndefined();
  });
});

describe('ExportOrchestrator - döngü: her iterasyonda önce Dispatcher tetiklenir', () => {
  it('[MEVCUT DAVRANIŞ] her turda YENİ bir Dispatcher örneği oluşturulup run() çağrılır (iş yok/var farketmez); Dispatcher hatası try/catch İLE yutulur, döngü durmaz', async () => {
    dispatcherRun.mockRejectedValueOnce(new Error('dispatcher patladı'));
    ExportOrchestrator.start(appDb);
    await flush();

    expect(DispatcherCtor).toHaveBeenCalledTimes(1);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'EXPORTORCHESTRATOR_DISPATCHER_ERROR', err: expect.objectContaining({ message: "dispatcher patladı" }) }));

    // Döngü devam eder: sinyal yok -> bekleme kurulur, ileri sarınca yeni Dispatcher örneği yine oluşturulur
    await jest.advanceTimersByTimeAsync(300000); // export.config.json > exportLoopDelay
    expect(DispatcherCtor).toHaveBeenCalledTimes(2);
  });
});

describe('ExportOrchestrator - uygun sinyal sorgusu ve kilitleme', () => {
  it('[MEVCUT DAVRANIŞ] sorgu: lockedBy:null, nextRunAt<=now, status PREPARING/QUEUED/PENDING/SENT/WAITING; başlangıçta activePlatformLocks boş olduğu için $nor YOK', async () => {
    ExportOrchestrator.start(appDb);
    await flush();
    const [filter, , opts] = signalModel.findOneAndUpdate.mock.calls[0] as any[];
    expect(filter.lockedBy).toBeNull();
    expect(filter.status).toEqual({ $in: ['PREPARING', 'QUEUED', 'PENDING', 'SENT', 'WAITING'] });
    expect(filter.$nor).toBeUndefined();
    expect(opts).toMatchObject({ sort: { createdAt: 1, sequence: 1 }, new: true, lean: true });
  });

  it('[MEVCUT DAVRANIŞ] worker tipi statüye göre seçilir: PREPARING->Validator, PENDING->Publisher, SENT->Sentinel, WAITING->Sync, bilinmeyen->Validator (varsayılan)', async () => {
    const statusToWorkerName: Record<string, string> = {
      PREPARING: 'Validator', PENDING: 'Publisher', SENT: 'Sentinel', WAITING: 'Sync', UNKNOWN_STATUS: 'Validator',
    };
    for (const status of Object.keys(statusToWorkerName)) {
      loadFresh(); // NOT: `cases` dizisini döngü ÖNCESİNDE oluşturup Ctor referansı tutmak YANLIŞ olurdu -- her
      // loadFresh() TAZE bir mock modülü döndürür; bu yüzden beklenen Ctor'a burada (loadFresh SONRASI) bakılır.
      findOneAndUpdateResult = sig({ status });
      ExportOrchestrator.start(appDb);
      await flush();
      const ctorByName: Record<string, any> = { Validator: ValidatorCtor, Publisher: PublisherCtor, Sentinel: SentinelCtor, Sync: SyncCtor };
      expect(ctorByName[statusToWorkerName[status]]).toHaveBeenCalledTimes(1);
    }
  });

  it('[MEVCUT DAVRANIŞ] worker.runOnce clientId(String), integrationCode, mode, batchId ile çağrılır; IntegrationEngineProvider(appDb, clientDb) ile kurulur', async () => {
    findOneAndUpdateResult = sig();
    ExportOrchestrator.start(appDb);
    await flush();
    expect(DatabaseManagerInstance.getClientDB).toHaveBeenCalledWith('7');
    expect(IntegrationEngineProvider).toHaveBeenCalledWith(appDb, clientDb);
    expect(workerRunOnce).toHaveBeenCalledWith('7', 'trendyol', 'TRANSFER', 'b1');
  });

  it('[MEVCUT DAVRANIŞ] sinyal bulunduğunda ana döngü dispatch()\'i BEKLEMEZ (fire-and-forget): yalnızca 1sn sonra bir sonraki sinyali aramaya devam eder', async () => {
    findOneAndUpdateResult = sig();
    ExportOrchestrator.start(appDb);
    await flush();
    signalModel.findOneAndUpdate.mockClear();

    await jest.advanceTimersByTimeAsync(1000);
    expect(selectionCalls()).toHaveLength(1); // bir SONRAKİ tur başladı (1sn'lik sabit gecikme), tam olarak 1 YENİ seçim sorgusu
  });
});

describe('ExportOrchestrator - dispatch() sonrası: kilit bırakma, istatistik, arşivleme', () => {
  it('[MEVCUT DAVRANIŞ] dispatch bitince lockedBy:null yazılır; updatedSignal.status COMPLETED/FAILED DEĞİLSE arşivleme YAPILMAZ', async () => {
    findOneAndUpdateResult = sig();
    signalModel.findOneAndUpdate.mockImplementation(async (filter: any) => {
      if (filter._id === 'sig1') return { status: 'SENT' }; // dispatch sonrası "release" güncellemesi
      return findOneAndUpdateResult; // ilk sinyal seçim çağrısı
    });
    ExportOrchestrator.start(appDb);
    await flush();
    expect(storageService.uploadArchive).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] updatedSignal.status===COMPLETED ise archiveAndCleanup çağrılır: stagedProduct payload\'ları R2\'ye yüklenir, bulkWrite ile payload silinip archiveKey yazılır', async () => {
    findOneAndUpdateResult = sig();
    let call = 0;
    signalModel.findOneAndUpdate.mockImplementation(async (filter: any) => {
      call++;
      if (call === 1) return findOneAndUpdateResult;
      return { status: 'COMPLETED' };
    });
    stagedModel.find.mockReturnValue(chain([{ _id: 'sp1', barcode: 'B1', payload: { a: 1 } }]));
    stagedModel.bulkWrite = jest.fn(async () => undefined);

    ExportOrchestrator.start(appDb);
    await flush();

    expect(storageService.uploadArchive).toHaveBeenCalledWith('7', { B1: { a: 1 } }, expect.stringContaining('exports/7/'), 'batch_b1_payloads');
    expect(stagedModel.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { _id: 'sp1' }, update: { $set: { archiveKey: 'archive-key', isArchived: true, archivedAt: expect.any(Date) }, $unset: { payload: '' } } } },
    ]);
  });

  it('[MEVCUT DAVRANIŞ] StatisticsTracker.track status: workerError varsa veya updatedSignal.status===FAILED ise FAILED, aksi halde SUCCESS', async () => {
    findOneAndUpdateResult = sig();
    workerRunOnce.mockRejectedValueOnce(new Error('n11 kırık'));
    let call = 0;
    signalModel.findOneAndUpdate.mockImplementation(async (filter: any) => {
      call++;
      if (call === 1) return findOneAndUpdateResult;
      return { status: 'FAILED' };
    });

    ExportOrchestrator.start(appDb);
    await flush();

    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'EXPORTORCHESTRATOR_WORKER_DISPATCH_ERROR', msg: expect.stringContaining('(b1)'), err: expect.objectContaining({ message: "n11 kırık" }) }));
    expect(StatisticsTracker.track).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED', clientId: 7, integrationCode: 'trendyol', workerType: 'Validator', errorMessage: 'n11 kırık' }));
  });

  it('[MEVCUT DAVRANIŞ] clientDB bulunamazsa: worker HİÇ çağrılmaz ama finally BLOĞU YİNE DE çalışır (kilit bırakılır, istatistik SUCCESS olarak işlenir çünkü workerError set edilmez)', async () => {
    findOneAndUpdateResult = sig();
    DatabaseManagerInstance.getClientDB.mockResolvedValueOnce(null);

    ExportOrchestrator.start(appDb);
    await flush();

    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'EXPORTORCHESTRATOR_CLIENT_DB_NOT_FOUND', msg: expect.stringContaining('Client DB not found for Client ID: 7') }));
    expect(workerRunOnce).not.toHaveBeenCalled();
    expect(StatisticsTracker.track).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }));
  });

  it('[MEVCUT DAVRANIŞ — İZOLASYON] bir sinyalin worker hatası (workerError) SONRAKİ turun BAŞKA bir clientId/sinyalini etkilemez: her iki turdaki dispatch bağımsız try/catch\'e sahiptir', async () => {
    // 1. tur: n11 sinyali, worker hata verir. 2. tur: trendyol sinyali, worker başarılı.
    const calls: any[] = [sig({ _id: 's-n11', clientId: '1', integrationCode: 'n11' }), sig({ _id: 's-try', clientId: '2', integrationCode: 'trendyol' }), null];
    let selectIdx = 0;
    signalModel.findOneAndUpdate.mockImplementation(async (filter: any) => {
      if (filter._id) return { status: 'COMPLETED' }; // release güncellemesi (finally)
      return calls[selectIdx++] ?? null; // sinyal seçim sorgusu
    });
    workerRunOnce.mockImplementationOnce(async () => { throw new Error('n11 down'); }).mockImplementationOnce(async () => undefined);

    ExportOrchestrator.start(appDb);
    await flush();
    await jest.advanceTimersByTimeAsync(1000); // 2. tura geç

    expect(workerRunOnce).toHaveBeenCalledTimes(2);
    const statuses = (StatisticsTracker.track.mock.calls as any[]).map((c) => c[0].status);
    expect(statuses).toEqual(['FAILED', 'SUCCESS']); // n11 hatası trendyol'un SUCCESS izlenmesini engellemedi
  });
});

describe('ExportOrchestrator - iş yokken bekleme ve olayla uyanma', () => {
  it('[MEVCUT DAVRANIŞ] sinyal yoksa ve bekleyen bir gelecek iş de yoksa varsayılan gecikme (exportLoopDelay=300000ms) kadar beklenir', async () => {
    ExportOrchestrator.start(appDb);
    await flush();
    expect(cap.lines).toContainEqual(expect.objectContaining({ code: 'EXPORTORCHESTRATOR_NO_ACTIVE_JOBS', msg: expect.stringContaining('No active jobs. Waiting for 300000ms') }));
  });

  it('[MEVCUT DAVRANIŞ] gelecekte bir iş varsa (nextRunAt>now) dinamik gecikme MIN(kalan süre, varsayılan) olur, en az 1000ms', async () => {
    nextPotentialResult = { nextRunAt: new Date(Date.now() + 5000) };
    ExportOrchestrator.start(appDb);
    await flush();
    expect(cap.lines).toContainEqual(expect.objectContaining({ code: 'EXPORTORCHESTRATOR_NO_ACTIVE_JOBS', msg: expect.stringContaining('Waiting for 5000ms') }));
  });

  it('[MEVCUT DAVRANIŞ — İNCE DAVRANIŞ] PROCESS_NEXT_SIGNAL olayı beklemeyi ANINDA keser (300sn beklemeden); ama `shouldWakeUp` bayrağı iş bulunamayınca sıfırlanmadığı için olay TAM OLARAK 2 ardışık seçim turuna yol açar (biri olay yüzünden, biri hemen ardından "shouldWakeUp hâlâ true" fast-path\'i yüzünden), SONRA normal 300sn bekleyişe döner', async () => {
    // BACKLOG: şüpheli/ince - `shouldWakeUp` yalnızca (a) sinyal BULUNDUĞUNDA veya (b) "else" dalında
    // sıfırlanıyor; iş yokken PROCESS_NEXT_SIGNAL geldiğinde bir sonraki turda da hâlâ true kalabiliyor ve
    // fazladan bir "boş" seçim turuna neden oluyor. Zararsız (yalnızca 1 ekstra sorgu) ama kasıtsız görünüyor.
    ExportOrchestrator.start(appDb);
    await flush();
    signalModel.findOneAndUpdate.mockClear();

    integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL);
    await flush();

    expect(selectionCalls()).toHaveLength(2); // 300sn beklemeden yeni turlar başladı (2 ardışık, sonra tekrar bekleme)

    // Bunu doğrulamak için: bir sonraki 300sn'lik varsayılan gecikmeye kadar YENİ bir seçim turu OLMAMALI.
    signalModel.findOneAndUpdate.mockClear();
    await jest.advanceTimersByTimeAsync(299999);
    expect(selectionCalls()).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(selectionCalls()).toHaveLength(1);
  });
});

describe('ExportOrchestrator - üst seviye döngü hatası', () => {
  it('[MEVCUT DAVRANIŞ] sinyal sorgusu (findOneAndUpdate) hata verirse dış catch yutar, 10sn bekler, döngü devam eder', async () => {
    signalModel.findOneAndUpdate.mockRejectedValueOnce(new Error('mongo timeout'));
    ExportOrchestrator.start(appDb);
    await flush();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'EXPORTORCHESTRATOR_LOOP_ERROR', err: expect.objectContaining({ message: "mongo timeout" }) }));

    signalModel.findOneAndUpdate.mockClear();
    await jest.advanceTimersByTimeAsync(10000);
    expect(signalModel.findOneAndUpdate).toHaveBeenCalled(); // döngü devam etti, çökmedi
  });
});

describe('ExportOrchestrator.clearZombies', () => {
  it('[MEVCUT DAVRANIŞ] isInitial=true iken lockedBy=POD_NAME olan, isInitial=false iken lockedBy!=null olan kayıtlar LOCK_TIMEOUT (1800000ms) öncesinde güncellendiyse serbest bırakılır', async () => {
    const updateMany = jest.fn(async () => undefined);
    const model = { updateMany };
    const localAppDb = { getExportSignalModel: () => model };

    await ExportOrchestrator.clearZombies(localAppDb, true);
    let [filter, update] = updateMany.mock.calls[0] as any[];
    expect(filter.lockedBy).toEqual(expect.any(String));
    expect(update.$set).toMatchObject({ lockedBy: null });

    updateMany.mockClear();
    await ExportOrchestrator.clearZombies(localAppDb, false);
    [filter, update] = updateMany.mock.calls[0] as any[];
    expect(filter.lockedBy).toEqual({ $ne: null });
  });
});

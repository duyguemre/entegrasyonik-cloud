/**
 * CHARACTERIZATION: ImportOrchestrator (katalog import "while(true)" döngüsü)
 * Kaynak: backend/src/integration/engine/catalog/import/ImportOrchestrator.ts
 *
 * %0 kapsam, dokunulmaz listesindeydi (docs/QA_FAZ2.md madde 7/12, MASTER_STATE.md). Kod DEĞİŞTİRİLMEDİ.
 *
 * Stager/Importer, DatabaseManager, NotificationService, IntegrationEngineProvider, StatisticsTracker
 * jest.mock ile değiştirilir. `integrationEventBus` GERÇEKTİR. DB/Redis/ağ YOK.
 *
 * TEKNİK NOT 1 (ExportOrchestrator.characterization.test.ts ile AYNI gerekçe): `startLoop` sonsuz döngüdür,
 * durdurma mekanizması YOKTUR; her testte `jest.resetModules()` ile taze modül grafiği + `jest.advanceTimersByTimeAsync`
 * kullanılır.
 *
 * TEKNİK NOT 2 (ÖNEMLİ, ExportOrchestrator'dan FARKLI): ImportOrchestrator'ın döngüsü, bir iş BULUNDUĞUNDA
 * `continue` ile HİÇBİR bekleme YAPMADAN bir sonraki işi aramaya devam eder (ExportOrchestrator'daki 1sn'lik
 * sabit gecikmenin AKSİNE — bkz. aşağıdaki "gecikmesiz ardışık dispatch" testi, bu KENDİ BAŞINA bir
 * [MEVCUT DAVRANIŞ] bulgusudur). Bu yüzden mock iş kaynağı SABİT/kalıcı bir nesne DEĞİL, bir KUYRUK
 * (`jobQueue`) olarak modellenmiştir — aksi halde SAHTE de olsa döngü gerçekten sonsuz/senkron dönüp test
 * sürecinin belleğini tüketir (bizzat gözlemlendi: ilk taslakta OOM ile çöktü).
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@integration/engine/catalog/import/Stager', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/import/Importer', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getClientDB: jest.fn() } }));
jest.mock('@services/notification/NotificationService', () => require('../../helpers/notificationServiceMock').notificationServiceModule());
jest.mock('@integration/engine/catalog/provider/IntegrationEngineProvider', () => ({ IntegrationEngineProvider: jest.fn() }));
jest.mock('@services/statistics/StatisticsTracker', () => ({ StatisticsTracker: { init: jest.fn(), track: jest.fn() } }));

function chain(result: any) {
  const c: any = { calls: {} as Record<string, any[]> };
  for (const m of ['sort', 'select']) c[m] = jest.fn((...a: any[]) => { c.calls[m] = a; return c; });
  c.lean = jest.fn(async () => result);
  return c;
}

let ImportOrchestrator: any;
let DatabaseManagerInstance: any;
let NotificationService: any;
let IntegrationEngineProvider: any;
let StatisticsTracker: any;
let integrationEventBus: any;
let EVENTS: any;
let StagerCtor: any;
let ImporterCtor: any;

let jobModel: any;
let clientDb: any;
let appDb: any;
/** Sıradaki iş seçim sorgusu bu kuyruktan bir eleman ÇEKER (yoksa null döner -> "iş yok" dalı). */
let jobQueue: any[];
let findByIdResult: any;
let stagerRunOnce: any;
let importerRunOnce: any;

async function flush() {
  await jest.advanceTimersByTimeAsync(0);
}

function loadFresh() {
  jest.resetModules();
  ImportOrchestrator = require('@integration/engine/catalog/import/ImportOrchestrator').ImportOrchestrator;
  ({ DatabaseManagerInstance } = require('@database/index'));
  ({ NotificationService } = require('@services/notification/NotificationService'));
  ({ IntegrationEngineProvider } = require('@integration/engine/catalog/provider/IntegrationEngineProvider'));
  ({ StatisticsTracker } = require('@services/statistics/StatisticsTracker'));
  ({ integrationEventBus, EVENTS } = require('@integration/engine/IntegrationEventBus'));
  StagerCtor = require('@integration/engine/catalog/import/Stager').default;
  ImporterCtor = require('@integration/engine/catalog/import/Importer').default;

  jobQueue = [];
  findByIdResult = null;

  jobModel = {
    findOneAndUpdate: jest.fn(() => chain(jobQueue.length ? jobQueue.shift() : null)),
    findById: jest.fn(() => chain(findByIdResult)),
    updateOne: jest.fn(async () => undefined),
  };
  appDb = { getImportJobModel: jest.fn(() => jobModel) };
  clientDb = { name: 'clientDb' };

  stagerRunOnce = jest.fn(async () => undefined);
  StagerCtor.mockReset().mockImplementation(() => ({ runOnce: stagerRunOnce }));
  importerRunOnce = jest.fn(async () => undefined);
  ImporterCtor.mockReset().mockImplementation(() => ({ runOnce: importerRunOnce }));

  DatabaseManagerInstance.getClientDB.mockReset().mockResolvedValue(clientDb);
  IntegrationEngineProvider.mockReset();
  NotificationService.sendClientNotification.mockReset();
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

const job = (over: Partial<any> = {}) => ({
  _id: { toString: () => over.jobIdStr || 'job1' }, clientId: '7', integrationCode: 'trendyol', status: 'WAITING_FOR_FETCH',
  ...over,
});

describe('ImportOrchestrator.start - kurulum', () => {
  it('[MEVCUT DAVRANIŞ] start(applicationDB) StatisticsTracker.init(applicationDB) çağırır (senkron), döngüyü BEKLEMEDEN döner', () => {
    const result = ImportOrchestrator.start(appDb);
    expect(StatisticsTracker.init).toHaveBeenCalledWith(appDb);
    expect(result).toBeUndefined();
  });
});

describe('ImportOrchestrator - iş seçim sorgusu', () => {
  it('[MEVCUT DAVRANIŞ] sorgu: status WAITING_FOR_FETCH/READY_TO_SYNC, lockedBy null/POD_NAME, _id activeImportJobIds dışında; sort updatedAt asc', async () => {
    ImportOrchestrator.start(appDb);
    await flush();
    const [filter, update, opts] = jobModel.findOneAndUpdate.mock.calls[0] as any[];
    expect(filter.status).toEqual({ $in: ['WAITING_FOR_FETCH', 'READY_TO_SYNC'] });
    expect(filter.lockedBy).toEqual({ $in: [null, expect.any(String)] });
    expect(filter._id).toEqual({ $nin: [] });
    expect(update.$set).toMatchObject({ lockedBy: expect.any(String) });
    expect(opts).toEqual({ sort: { updatedAt: 1 }, new: true });
  });

  it('[MEVCUT DAVRANIŞ] WAITING_FOR_FETCH -> Stager, READY_TO_SYNC -> Importer', async () => {
    for (const status of ['WAITING_FOR_FETCH', 'READY_TO_SYNC']) {
      loadFresh();
      jobQueue = [job({ status })];
      findByIdResult = job({ status }); // dispatch sonundaki updatedJob okuması
      ImportOrchestrator.start(appDb);
      await flush();
      const ctorByStatus: Record<string, any> = { WAITING_FOR_FETCH: StagerCtor, READY_TO_SYNC: ImporterCtor };
      expect(ctorByStatus[status]).toHaveBeenCalledTimes(1);
    }
  });

  it('[MEVCUT DAVRANIŞ] worker.runOnce SADECE jobId (string) ile çağrılır; IntegrationEngineProvider(appDb, clientDb) ile kurulur', async () => {
    jobQueue = [job()];
    findByIdResult = job();
    ImportOrchestrator.start(appDb);
    await flush();
    expect(DatabaseManagerInstance.getClientDB).toHaveBeenCalledWith('7');
    expect(IntegrationEngineProvider).toHaveBeenCalledWith(appDb, clientDb);
    expect(stagerRunOnce).toHaveBeenCalledWith('job1');
  });

  it('[MEVCUT DAVRANIŞ — KRİTİK BULGU] iş bulunduğunda ana döngü dispatch()\'i BEKLEMEZ VE HİÇBİR bekleme YAPMADAN (ExportOrchestrator\'daki 1sn sabit gecikmenin AKSİNE) bir sonraki işi hemen arar: ardışık iki iş, ARADA HİÇBİR setTimeout OLMADAN, aynı mikro görev penceresinde seçilebilir.', async () => {
    jobQueue = [job({ jobIdStr: 'j1' }), job({ jobIdStr: 'j2' })];
    findByIdResult = job();
    ImportOrchestrator.start(appDb);
    await flush(); // tek bir "0ms ilerlet" turu, gerçek zaman GEÇMEDEN
    expect(jobModel.findOneAndUpdate.mock.calls.length).toBeGreaterThanOrEqual(2); // iki iş de bekleme OLMADAN seçildi
  });

  it('[MEVCUT DAVRANIŞ] iş yoksa importLoopDelay (import.config.json, varsayılan 30000ms) kadar beklenir', async () => {
    ImportOrchestrator.start(appDb);
    await flush();
    jobModel.findOneAndUpdate.mockClear();

    await jest.advanceTimersByTimeAsync(29999);
    expect(jobModel.findOneAndUpdate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(jobModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] PROCESS_NEXT_IMPORT_JOB olayı beklemeyi ANINDA keser', async () => {
    ImportOrchestrator.start(appDb);
    await flush();
    jobModel.findOneAndUpdate.mockClear();

    integrationEventBus.emit(EVENTS.PROCESS_NEXT_IMPORT_JOB);
    await flush();

    expect(jobModel.findOneAndUpdate).toHaveBeenCalledTimes(1); // 30sn beklemeden yeni tur
  });
});

describe('ImportOrchestrator.dispatch - hata izolasyonu VE KRİTİK BULGU: catch YOK', () => {
  // NOT: `dispatch` private static bir metottur; TypeScript görünürlüğü yalnızca derleme zamanınadır, çalışma
  // zamanında `(ImportOrchestrator as any).dispatch(...)` ile doğrudan çağrılabilir. Bunu KASITLI olarak
  // burada yapıyoruz: ana döngü `this.dispatch(job, applicationDB); continue;` şeklinde dispatch()'in dönüşünü
  // HİÇ beklemediği/yakalamadığı için (bkz. kaynak kod), gerçek akışta bu bir Node-seviyesi "unhandled
  // rejection" olur. Jest'in kendi global unhandledRejection dinleyicisi bunu YAKALAYIP testi BAŞARISIZ
  // sayacağından (bizzat gözlemlendi), davranışı burada dispatch()'in DÖNÜŞ DEĞERİNİ doğrudan yakalayarak
  // sabitliyoruz — asıl "ana döngü bunu hiç yakalamıyor" gerçeği yukarıdaki kod okumasıyla ayrıca doğrulanmıştır.
  it('[MEVCUT DAVRANIŞ — KRİTİK BULGU] dispatch() bir try/finally kullanır, try/CATCH YOK: worker.runOnce() SONRASI bir adım (ör. StatisticsTracker.track) patlarsa dispatch()\'in DÖNDÜRDÜĞÜ PROMISE REDDEDER; ana döngü bunu await/catch ETMEDEN çağırdığı için gerçek çalışmada bu sessiz bir unhandled rejection olur (çökme YOK ama hata İZİ kaybolur). Kilit YİNE DE bırakılır (finally çalışır).', async () => {
    // BACKLOG: kritik bulgu - ExportOrchestrator.dispatch()'in AKSİNE (orada try/catch VAR, workerError
    // izlenir), ImportOrchestrator.dispatch() yalnızca try/finally kullanır. worker.runOnce() İÇİNDE
    // (Stager/Importer'ın KENDİ try/catch'i, ör. DB hatası) normalde hata yutulur ve iş FAILED yapılır; ama
    // findById/StatisticsTracker.track gibi dispatch() İÇİNDEKİ SONRAKİ adımlar patlarsa hiçbir yerde
    // yakalanmaz. Düzeltilirse bu test kasıtlı olarak güncellenecek.
    const j = job();
    findByIdResult = job();
    (StatisticsTracker.track as any).mockImplementationOnce(() => { throw new Error('metrik yazımı patladı'); });

    await expect((ImportOrchestrator as any).dispatch(j, appDb)).rejects.toThrow('metrik yazımı patladı');

    expect(jobModel.updateOne).toHaveBeenCalledWith({ _id: j._id }, { $set: { lockedBy: null, updatedAt: expect.any(Date) } });
  });

  it('[MEVCUT DAVRANIŞ — İZOLASYON] BİR job\'un dispatch() hatası (örn. n11, worker.runOnce sonrası patlıyor) BAŞKA bir job\'un (örn. trendyol) dispatch()\'ini ETKİLEMEZ: her çağrı bağımsız bir promise\'tir, paylaşılan durum (activeImportJobIds hariç, o da yalnızca kilit takibi için) yoktur.', async () => {
    const jN11 = job({ jobIdStr: 'n11-job', integrationCode: 'n11' });
    const jTry = job({ jobIdStr: 'try-job', integrationCode: 'trendyol' });
    findByIdResult = job();
    (StatisticsTracker.track as any)
      .mockImplementationOnce(() => { throw new Error('n11 metrik hatası'); })
      .mockImplementationOnce(() => undefined);

    const p1 = (ImportOrchestrator as any).dispatch(jN11, appDb);
    const p2 = (ImportOrchestrator as any).dispatch(jTry, appDb);
    await expect(p1).rejects.toThrow('n11 metrik hatası');
    await expect(p2).resolves.toBeUndefined();

    expect(stagerRunOnce).toHaveBeenCalledTimes(2); // n11 hatasına rağmen trendyol da işlendi
  });
});

describe('ImportOrchestrator.dispatch - clientId/clientDB yokluğu', () => {
  it('[MEVCUT DAVRANIŞ] job.clientId yoksa erken return (worker HİÇ çağrılmaz); finally YİNE DE çalışır (kilit bırakılır)', async () => {
    jobQueue = [job({ clientId: undefined })];
    ImportOrchestrator.start(appDb);
    await flush();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'IMPORTORCHESTRATOR_CLIENT_ID_NOT_FOUND' }));
    expect(stagerRunOnce).not.toHaveBeenCalled();
    expect(jobModel.updateOne).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] clientDB bulunamazsa erken return (worker HİÇ çağrılmaz); finally YİNE DE çalışır', async () => {
    jobQueue = [job()];
    DatabaseManagerInstance.getClientDB.mockResolvedValueOnce(null);
    ImportOrchestrator.start(appDb);
    await flush();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'IMPORTORCHESTRATOR_CLIENT_DB_NOT_FOUND' }));
    expect(stagerRunOnce).not.toHaveBeenCalled();
    expect(jobModel.updateOne).toHaveBeenCalled();
  });
});

describe('ImportOrchestrator.dispatch - bildirim ve istatistik', () => {
  it('[MEVCUT DAVRANIŞ] updatedJob.status COMPLETED/FAILED ise bildirim gönderilir; DİĞER statülerde (ör. PROCESSING) GÖNDERİLMEZ', async () => {
    jobQueue = [job({ status: 'READY_TO_SYNC' })];
    findByIdResult = job({ status: 'COMPLETED', integrationCode: 'trendyol' });
    ImportOrchestrator.start(appDb);
    await flush();
    expect(NotificationService.sendClientNotification).toHaveBeenCalledWith(expect.objectContaining({
      clientId: '7',
      notificationData: expect.objectContaining({ severity: 'success', title: 'Ürün Çekme Tamamlandı' }),
    }));

    loadFresh();
    jobQueue = [job({ status: 'READY_TO_SYNC' })];
    findByIdResult = job({ status: 'PROCESSING' });
    ImportOrchestrator.start(appDb);
    await flush();
    expect(NotificationService.sendClientNotification).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] status değiştiyse (job.status !== updatedJob.status) PROCESS_NEXT_IMPORT_JOB olayı yayınlanır; değişmediyse yayınlanmaz', async () => {
    const emitSpy = jest.spyOn(integrationEventBus, 'emit');
    jobQueue = [job({ status: 'WAITING_FOR_FETCH' })];
    findByIdResult = job({ status: 'READY_TO_SYNC' }); // Stager statüyü değiştirdi
    ImportOrchestrator.start(appDb);
    await flush();
    expect(emitSpy).toHaveBeenCalledWith(EVENTS.PROCESS_NEXT_IMPORT_JOB);

    loadFresh();
    const emitSpy2 = jest.spyOn(integrationEventBus, 'emit');
    jobQueue = [job({ status: 'WAITING_FOR_FETCH' })];
    findByIdResult = job({ status: 'WAITING_FOR_FETCH' }); // değişmedi
    ImportOrchestrator.start(appDb);
    await flush();
    expect(emitSpy2).not.toHaveBeenCalledWith(EVENTS.PROCESS_NEXT_IMPORT_JOB);
  });

  it('[MEVCUT DAVRANIŞ] StatisticsTracker.track: FAILED->FAILED, COMPLETED/READY_TO_SYNC->SUCCESS, diğerleri->PARTIAL', async () => {
    const cases: Array<[string, string]> = [['FAILED', 'FAILED'], ['COMPLETED', 'SUCCESS'], ['READY_TO_SYNC', 'SUCCESS'], ['PROCESSING', 'PARTIAL']];
    for (const [updatedStatus, expectedTrackStatus] of cases) {
      loadFresh();
      jobQueue = [job({ status: 'WAITING_FOR_FETCH' })];
      findByIdResult = job({ status: updatedStatus });
      ImportOrchestrator.start(appDb);
      await flush();
      expect(StatisticsTracker.track).toHaveBeenCalledWith(expect.objectContaining({ status: expectedTrackStatus, operationType: 'IMPORT_FETCH' }));
    }
  });

  it('[MEVCUT DAVRANIŞ] operationType: WAITING_FOR_FETCH (Stager) -> IMPORT_FETCH, READY_TO_SYNC (Importer) -> IMPORT_SYNC', async () => {
    jobQueue = [job({ status: 'READY_TO_SYNC' })];
    findByIdResult = job({ status: 'COMPLETED' });
    ImportOrchestrator.start(appDb);
    await flush();
    expect(StatisticsTracker.track).toHaveBeenCalledWith(expect.objectContaining({ operationType: 'IMPORT_SYNC' }));
  });

  it('[MEVCUT DAVRANIŞ] updatedJob bulunamazsa (findById null) bildirim/istatistik hiç yapılmaz ama finally çalışır', async () => {
    jobQueue = [job()];
    findByIdResult = null;
    ImportOrchestrator.start(appDb);
    await flush();
    expect(NotificationService.sendClientNotification).not.toHaveBeenCalled();
    expect(StatisticsTracker.track).not.toHaveBeenCalled();
    expect(jobModel.updateOne).toHaveBeenCalled();
  });
});

describe('ImportOrchestrator - üst seviye döngü hatası', () => {
  it('[MEVCUT DAVRANIŞ] iş seçim sorgusu hata verirse dış catch yutar, 10sn bekler, döngü devam eder', async () => {
    jobModel.findOneAndUpdate.mockImplementationOnce(() => { throw new Error('mongo timeout'); });
    ImportOrchestrator.start(appDb);
    await flush();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'IMPORTORCHESTRATOR_LOOP_ERROR', err: expect.objectContaining({ message: "mongo timeout" }) }));

    jobModel.findOneAndUpdate.mockClear();
    await jest.advanceTimersByTimeAsync(10000);
    expect(jobModel.findOneAndUpdate).toHaveBeenCalled();
  });
});

describe('ImportOrchestrator.clearZombies', () => {
  it('[MEVCUT DAVRANIŞ] isInitial=true: FETCHING/PROCESSING statülü ve (lockedBy=POD_NAME VEYA lastCheckedAt zaman aşımına uğramış) kayıtlar FAILED yapılır, kilit açılır', async () => {
    const updateMany = jest.fn(async () => undefined);
    const model = { updateMany };
    const localAppDb = { getImportJobModel: () => model };

    await ImportOrchestrator.clearZombies(localAppDb, true);
    const [filter, update] = updateMany.mock.calls[0] as any[];
    expect(filter.status).toEqual({ $in: ['FETCHING', 'PROCESSING'] });
    expect(filter.$or).toEqual([{ lockedBy: expect.any(String) }, { lastCheckedAt: { $lte: expect.any(Date) } }]);
    expect(update.$set).toMatchObject({ lockedBy: null, status: 'FAILED' });
  });

  it('[DÜZELTME 2026-09-29, C23 dersi, KASITLI TERS ÇEVRİLDİ] isInitial=false: filtre ARTIK `lockedBy:null` VE `lockedBy:{$exists:false}` ikisini birden kapsar (eskiden yalnız `$exists:false` vardı; şema `default:null` olduğundan bu dal GERÇEK Mongo\'da hiç eşleşmiyordu -- bkz. OversellCompensationJob.claimCancel/mongoLease AYNI deseni)', async () => {
    const updateMany = jest.fn(async () => undefined);
    const model = { updateMany };
    const localAppDb = { getImportJobModel: () => model };

    await ImportOrchestrator.clearZombies(localAppDb, false);
    const [filter] = updateMany.mock.calls[0] as any[];
    expect(filter.status).toEqual({ $in: ['FETCHING', 'PROCESSING'] });
    expect(filter.$or).toEqual([
      { lockedBy: null },
      { lockedBy: { $exists: false } },
      { lastCheckedAt: { $lte: expect.any(Date) } },
    ]);
  });
});

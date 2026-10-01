/**
 * CHARACTERIZATION (tamamlayıcı): ImportOrchestrator yaşam döngüsü, çoklu-tenant tarama, durdurma imkânı, olay kaybı
 * Kaynak: backend/src/integration/engine/catalog/import/ImportOrchestrator.ts
 * BACKLOG C14 açık ucu (2026-09-28): `ImportOrchestrator.characterization.test.ts` çekirdek döngüyü sabitlemişti; bu dosya
 * DURDURMA BAYRAĞI YOK, çift start(), tenant/platform seri kilidinin OLMAMASI, activeImportJobIds takibi, "uyanma olayı
 * bekleme dışındayken KAYBOLUR" ve hatalı log öneki bulgularını sabitler. KAYNAK KOD DEĞİŞTİRİLMEDİ. Tüm bağımlılıklar
 * mock; DB/Redis/ağ YOK; sahte zamanlayıcı (döngü fake timer'a bağlı askıda kalır, gerçek handle YOK).
 * ÖNEMLİ: iş bulununca döngü bekleme YAPMADAN devam ettiğinden iş kaynağı daima SONLU bir KUYRUKTUR (bkz. komşu dosyadaki OOM notu).
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

const chain = (result: any) => ({ lean: jest.fn(async () => result) });

let ImportOrchestrator: any;
let DatabaseManagerInstance: any;
let StatisticsTracker: any;
let integrationEventBus: any;
let EVENTS: any;
let StagerCtor: any;
let ImporterCtor: any;
let jobModel: any;
let appDb: any;
let jobQueue: any[];
let stagerRunOnce: any;

const flush = () => jest.advanceTimersByTimeAsync(0);

function loadFresh() {
  jest.resetModules();
  ImportOrchestrator = require('@integration/engine/catalog/import/ImportOrchestrator').ImportOrchestrator;
  ({ DatabaseManagerInstance } = require('@database/index'));
  ({ StatisticsTracker } = require('@services/statistics/StatisticsTracker'));
  ({ integrationEventBus, EVENTS } = require('@integration/engine/IntegrationEventBus'));
  StagerCtor = require('@integration/engine/catalog/import/Stager').default;
  ImporterCtor = require('@integration/engine/catalog/import/Importer').default;

  jobQueue = [];
  jobModel = {
    findOneAndUpdate: jest.fn(() => chain(jobQueue.length ? jobQueue.shift() : null)),
    findById: jest.fn(() => chain(null)),
    updateOne: jest.fn(async () => undefined),
  };
  appDb = { getImportJobModel: jest.fn(() => jobModel) };
  stagerRunOnce = jest.fn(async () => undefined);
  StagerCtor.mockReset().mockImplementation(() => ({ runOnce: stagerRunOnce }));
  ImporterCtor.mockReset().mockImplementation(() => ({ runOnce: jest.fn(async () => undefined) }));
  DatabaseManagerInstance.getClientDB.mockReset().mockResolvedValue({ name: 'clientDb' });
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
  _id: { toString: () => over.jobIdStr || 'job1' }, clientId: '7', integrationCode: 'trendyol', status: 'WAITING_FOR_FETCH', ...over,
});

describe('ImportOrchestrator - DURDURMA İMKÂNI YOK', () => {
  it('[MEVCUT DAVRANIŞ] sınıfın statik yüzeyinde stop/shutdown/close/destroy/halt/cancel benzeri HİÇBİR üye yoktur', () => {
    const names = Object.getOwnPropertyNames(ImportOrchestrator);
    expect(names.filter((n) => /stop|shutdown|close|destroy|halt|cancel|abort|terminate/i.test(n))).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(['start', 'clearZombies', 'startLoop', 'dispatch', 'sendNotification']));
  });

  it('[MEVCUT DAVRANIŞ] clearTimeout ÇAĞRILMAZ, dinleyici (PROCESS_NEXT_IMPORT_JOB) hiç kaldırılmaz; boşta TAM 1 bekleyen zamanlayıcı (30sn) vardır', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    ImportOrchestrator.start(appDb);
    await flush();
    expect(jest.getTimerCount()).toBe(1);
    expect(integrationEventBus.listenerCount(EVENTS.PROCESS_NEXT_IMPORT_JOB)).toBe(1);
    await jest.advanceTimersByTimeAsync(30000 * 3);
    expect(clearSpy).not.toHaveBeenCalled();
    expect(integrationEventBus.listenerCount(EVENTS.PROCESS_NEXT_IMPORT_JOB)).toBe(1);
  });

  it('[MEVCUT DAVRANIŞ] döngü "sonsuza dek" poll eder: 1 saatlik simüle sürede (boşta, 30sn aralık) 1 + 120 = 121 sorgu; kendi kendine ASLA durmaz', async () => {
    ImportOrchestrator.start(appDb);
    await flush();
    await jest.advanceTimersByTimeAsync(3600000);
    expect(jobModel.findOneAndUpdate).toHaveBeenCalledTimes(121);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('[MEVCUT DAVRANIŞ] start() İKİ KEZ çağrılırsa koruma YOKTUR: iki bağımsız döngü + iki dinleyici; StatisticsTracker.init 2 kez', async () => {
    ImportOrchestrator.start(appDb);
    ImportOrchestrator.start(appDb);
    await flush();
    expect(StatisticsTracker.init).toHaveBeenCalledTimes(2);
    expect(jobModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(integrationEventBus.listenerCount(EVENTS.PROCESS_NEXT_IMPORT_JOB)).toBe(2);
  });
});

describe('ImportOrchestrator - çoklu-tenant tarama: tenant/platform seri kilidi YOK, yalnızca iş-kimliği (activeImportJobIds) takibi', () => {
  it('[MEVCUT DAVRANIŞ] ExportOrchestrator\'un AKSİNE (clientId,integrationCode) kilidi YOKTUR: AYNI tenant + AYNI platformun iki işi (ve başka tenant\'ın işi) worker\'lar askıdayken PARALEL dispatch edilir; her sonraki sorgu `_id.$nin` ile yalnızca aktif İŞ KİMLİKLERİNİ dışlar', async () => {
    const pending: Array<() => void> = [];
    stagerRunOnce.mockImplementation(() => new Promise<void>((r) => { pending.push(r); }));
    jobQueue = [
      job({ jobIdStr: 'j1', clientId: '7', integrationCode: 'trendyol' }),
      job({ jobIdStr: 'j2', clientId: '7', integrationCode: 'trendyol' }), // aynı tenant + aynı platform
      job({ jobIdStr: 'j3', clientId: '8', integrationCode: 'n11' }),
    ];

    ImportOrchestrator.start(appDb);
    await flush();

    expect(stagerRunOnce).toHaveBeenCalledTimes(3); // hiçbiri diğerini beklemedi
    expect(DatabaseManagerInstance.getClientDB.mock.calls.map((c: any[]) => c[0])).toEqual(['7', '7', '8']);
    const nins = (jobModel.findOneAndUpdate.mock.calls as any[]).map((c) => c[0]._id.$nin);
    expect(nins).toEqual([[], ['j1'], ['j1', 'j2'], ['j1', 'j2', 'j3']]); // 4. sorgu boş dönüp bekleme kurdu

    pending.forEach((r) => r()); // worker'lar biter -> finally aktif kimlikleri siler
    await flush();
    expect(ImportOrchestrator.activeImportJobIds.size).toBe(0);
    expect(jobModel.updateOne).toHaveBeenCalledTimes(3); // her iş için kilit bırakma (lockedBy:null)

    await jest.advanceTimersByTimeAsync(30000);
    const last = (jobModel.findOneAndUpdate.mock.calls as any[]).slice(-1)[0][0];
    expect(last._id.$nin).toEqual([]);
  });

  it('[MEVCUT DAVRANIŞ] bir tenant\'ın clientDB çözümü REDDEDERSE (null değil, throw) dispatch() reddeder ama finally ile aktif kimlik temizlenir ve kilit bırakılır; ana döngü başka tenant\'ın işini yine de işler (izolasyon: fire-and-forget)', async () => {
    const j7 = job({ jobIdStr: 'j7', clientId: '7' });
    DatabaseManagerInstance.getClientDB.mockRejectedValueOnce(new Error('tenant 7 db down'));
    await expect(ImportOrchestrator.dispatch(j7, appDb)).rejects.toThrow('tenant 7 db down');
    expect(ImportOrchestrator.activeImportJobIds.size).toBe(0);
    expect(jobModel.updateOne).toHaveBeenCalledWith({ _id: j7._id }, { $set: { lockedBy: null, updatedAt: expect.any(Date) } });

    // diğer tenant (8) normal işlenir
    await ImportOrchestrator.dispatch(job({ jobIdStr: 'j8', clientId: '8' }), appDb);
    expect(stagerRunOnce).toHaveBeenCalledWith('j8');
  });
});

describe('ImportOrchestrator - olay yolu ve log', () => {
  it('[MEVCUT DAVRANIŞ — İNCE] PROCESS_NEXT_IMPORT_JOB döngü BEKLEMEDE değilken (ör. iş seçim sorgusu sürerken) yayınlanırsa KAYBOLUR: Export\'taki `shouldWakeUp` bayrağı gibi bir kayıt yok; döngü sorgu boş dönünce yine tam 30sn bekler', async () => {
    // BACKLOG: şüpheli/ince - bayrak yok; olay kaybı en kötü ihtimalle importLoopDelay (30sn) gecikme yaratır (zararsız ama kasıtsız görünüyor).
    let resolveQuery: (v: any) => void = () => undefined;
    jobModel.findOneAndUpdate.mockImplementationOnce(() => ({ lean: () => new Promise((r) => { resolveQuery = r; }) }));
    ImportOrchestrator.start(appDb);
    await flush(); // sorgu askıda
    integrationEventBus.emit(EVENTS.PROCESS_NEXT_IMPORT_JOB); // wakeUp henüz null -> hiçbir şey olmaz
    jobModel.findOneAndUpdate.mockClear();

    resolveQuery(null); // iş yok
    await flush();
    expect(jobModel.findOneAndUpdate).not.toHaveBeenCalled(); // olay hatırlanmadı, hemen yeni tur YOK
    await jest.advanceTimersByTimeAsync(29999);
    expect(jobModel.findOneAndUpdate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(jobModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] PROCESS_NEXT_SIGNAL (Export olayı) Import döngüsünü UYANDIRMAZ: iki olay yolu ayrıdır', async () => {
    ImportOrchestrator.start(appDb);
    await flush();
    jobModel.findOneAndUpdate.mockClear();
    integrationEventBus.emit(EVENTS.PROCESS_NEXT_SIGNAL);
    await flush();
    expect(jobModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('[DÜZELTME 2026-09-28] ImportOrchestrator.dispatch hata logları DOĞRU önekle yazılır: "[ImportOrchestrator] ..." (eskiden "[ExportOrchestrator]" kopyala-yapıştır kalıntısıydı)', async () => {
    await ImportOrchestrator.dispatch(job({ jobIdStr: 'jx', clientId: undefined }), appDb);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'IMPORTORCHESTRATOR_CLIENT_ID_NOT_FOUND', msg: expect.stringContaining('Job ID: jx') }));

    cap.clear();
    DatabaseManagerInstance.getClientDB.mockResolvedValueOnce(null);
    await ImportOrchestrator.dispatch(job({ jobIdStr: 'jy', clientId: '9' }), appDb);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'IMPORTORCHESTRATOR_CLIENT_DB_NOT_FOUND', msg: expect.stringContaining('Client ID: 9') }));
  });
});

describe('ImportOrchestrator - kill-switch (ADR-0030 X6)', () => {
  it('[YENİ DAVRANIŞ] off: kapalı entegrasyon sorgudan dışlanır (iş kilitsiz kalır); global off: hiç iş seçilmez; açılınca filtre kalkar', async () => {
    const store = require('@integration/config/platformOverrideStore');
    store.setTargetIntake('trendyol', 'off');
    ImportOrchestrator.start(appDb);
    await flush();
    expect(jobModel.findOneAndUpdate.mock.calls[0][0].integrationCode).toEqual({ $nin: ['trendyol'] });

    store.setTargetIntake('_engine', 'off');
    const before = jobModel.findOneAndUpdate.mock.calls.length;
    await jest.advanceTimersByTimeAsync(15000);
    expect(jobModel.findOneAndUpdate.mock.calls.length).toBe(before); // hiç sorgu/kilit yok
    expect(stagerRunOnce).not.toHaveBeenCalled();

    store.setTargetIntake('_engine', 'on'); store.setTargetIntake('trendyol', 'on');
    await jest.advanceTimersByTimeAsync(15000); // kısıt varken bekleme <=15 sn: kısa sürede yeniden bakar
    const last = jobModel.findOneAndUpdate.mock.calls.at(-1);
    expect(last[0].integrationCode).toBeUndefined();
  });
});

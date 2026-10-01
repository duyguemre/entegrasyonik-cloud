/**
 * MODÜLER BAĞIMSIZLIK KAOSTESTİ (Faz 2 DoD, docs/QA_FAZ2.md madde 7)
 *
 * Amaç: bir entegrasyonu (N11) KASITLI olarak hata verdirip, orkestrasyon seviyesinde (OrderOrchestrator/
 * ExportOrchestrator) DİĞER entegrasyonların (Trendyol) VE SaaS çekirdeğinin (sistemin ayakta kalması,
 * diğer tenant/entegrasyonların işlenmeye DEVAM etmesi) ETKİLENMEDİĞİNİ doğrulamak — bu, komşu
 * `*.characterization.test.ts` dosyalarında (bu klasörde) TEK TEK gözlemlenen hata izolasyonu
 * mekanizmalarının BİR ARADA, "N11 kırık / Trendyol sağlam" somut senaryosuyla doğrulanmasıdır.
 *
 * Gerçek hata-izolasyon mekanizması (kod okuma + characterization testleriyle doğrulandı):
 *  - ExportOrchestrator/ImportOrchestrator: while(true) döngüsü, bulunan HER iş için `dispatch()`'i
 *    AWAIT ETMEDEN (fire-and-forget) çağırıp HEMEN bir sonraki işi aramaya döner. Bu yüzden bir işin
 *    (n11) worker hatası, aynı turda veya sonraki turda seçilen BAŞKA bir işin (trendyol) dispatch
 *    edilmesini ENGELLEMEZ — ne bir Promise.allSettled ne per-integration try/catch YAZILMIŞ, izolasyon
 *    "await etmemek" (yapısal fire-and-forget) sayesinde kendiliğinden ortaya çıkıyor.
 *  - ExportOrchestrator.dispatch(): try/catch VAR (workerError yakalanır, StatisticsTracker'a FAILED
 *    olarak işlenir); ImportOrchestrator.dispatch(): yalnızca try/FINALLY (catch YOK) — bir job'un
 *    post-worker adımı patlarsa dispatch()'in kendi promise'i reddeder ama ana döngü bunu HİÇ
 *    yakalamadığından sessiz bir "unhandled rejection" olur (ayrıntı: ImportOrchestrator.characterization.test.ts).
 *  - OrderOrchestrator: queueEvents 'completed'/'failed' olayları BullMQ tarafından HER İŞ İÇİN AYRI
 *    tetiklenir; bir job'un olay işleyicisindeki hata (ör. n11 job'unun errorHandler.handleJobFailure
 *    reddi) sonraki BAĞIMSIZ bir job'un (trendyol) olayını ETKİLEMEZ (ayrı ayrı invoke edilen callback'ler).
 *  - IntegrationEngine.start(): [IntegrationEngine başlatma izolasyonu düzeltmesi, 2026-09-27] ÖNCEDEN
 *    bunun TERSİ bir KRİTİK BULGU içeriyordu — Export/Import/OrderOrchestrator.start() çağrıları SIRALI ve
 *    try/catch'SİZ yazılmıştı; bir alt-sistemin SENKRON başlatma hatası SONRAKİ alt-sistemlerin hiç
 *    başlamamasına yol açıyordu. Artık `safeStartSubsystem` ile BAĞIMSIZ izole edildi (bkz.
 *    IntegrationEngine.characterization.test.ts) — bu YALNIZCA başlangıç anını ilgilendirir; döngüler bir
 *    kez başladıktan sonra aşağıda doğrulanan fire-and-forget izolasyonu zaten geçerliydi.
 *
 * SONUÇ (bu dosyada doğrulanan): ÇALIŞMA-ZAMANI (worker/iş seviyesi) hata izolasyonu VARDIR — N11 kırılınca
 * Trendyol/diğer tenant'lar işlenmeye devam eder, süreç çökmez, kırmızı test YOK (izolasyon YOK çıksaydı bu
 * test "[MEVCUT DAVRANIŞ: izolasyon YOK]" diye kırmızı bırakılmadan sabitlenecekti — ama izolasyon VAR).
 * BAŞLATMA-ZAMANI (IntegrationEngine.start sıralaması) izolasyonu da [2026-09-27] düzeltmesiyle artık
 * VARDIR (AYRI dosyada IntegrationEngine.characterization.test.ts içinde sabitlendi, burada tekrar edilmez).
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, jest } from '@jest/globals';

// --- Senaryo A: ExportOrchestrator ---
jest.mock('@integration/engine/catalog/export/Dispatcher', () => ({ __esModule: true, default: jest.fn(() => ({ run: jest.fn(async () => undefined) })) }));
jest.mock('@integration/engine/catalog/export/Validator', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/export/Publisher', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/export/Sentinel', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/export/Sync', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getClientDB: jest.fn() } }));
jest.mock('@services/storage/StorageService', () => ({ storageService: { uploadArchive: jest.fn(async () => ({ result: false })) } }));
jest.mock('@integration/engine/catalog/provider/IntegrationEngineProvider', () => ({ IntegrationEngineProvider: jest.fn() }));
jest.mock('@services/statistics/StatisticsTracker', () => ({ StatisticsTracker: { init: jest.fn(), track: jest.fn() } }));

// --- Senaryo B: OrderOrchestrator ---
class FakeQueueEvents {
  static instances: FakeQueueEvents[] = [];
  public handlers: Record<string, Function[]> = {};
  constructor(public queueName: any, public opts: any) { FakeQueueEvents.instances.push(this); }
  on(event: string, handler: Function) { (this.handlers[event] ??= []).push(handler); return this; }
  async emit(event: string, payload: any) { for (const h of this.handlers[event] || []) await h(payload); }
}
jest.mock('bullmq', () => ({ QueueEvents: FakeQueueEvents }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getConnectionConfig: jest.fn(() => ({})) } }));
jest.mock('@integration/engine/order/OrderQueueProducer', () => ({ OrderQueueProducer: jest.fn(() => ({ scheduleJobs: jest.fn(async () => undefined) })) }));
jest.mock('@integration/engine/order/OrderErrorHandler', () => ({ OrderErrorHandler: jest.fn() }));
jest.mock('@integration/engine/order/worker-runner', () => ({ startOrderWorkerConsumer: jest.fn() }));
jest.mock('@operations/integration/PostOrderOperations', () => ({ PostOrderOperations: jest.fn() }));

function chain(result: any) {
  const c: any = { calls: {} as Record<string, any[]> };
  for (const m of ['sort', 'limit', 'select']) c[m] = jest.fn((...a: any[]) => { c.calls[m] = a; return c; });
  c.lean = jest.fn(async () => result);
  return c;
}

async function flush() { await jest.advanceTimersByTimeAsync(0); }

describe('Kaostest A — ExportOrchestrator: N11 worker hatası Trendyol\'u ve döngünün genelini etkilemiyor', () => {
  it('N11 sinyali worker.runOnce\'ta throw eder; Trendyol sinyali AYNI süreçte AYRICA başarıyla işlenir; istisna dışarı sızıp döngüyü durdurmaz', async () => {
    jest.resetModules();
    jest.useFakeTimers();
    try {
      const { ExportOrchestrator } = require('@integration/engine/catalog/export/ExportOrchestrator');
      const { DatabaseManagerInstance } = require('@database/DatabaseManager');
      const { StatisticsTracker } = require('@services/statistics/StatisticsTracker');
      const ValidatorCtor = require('@integration/engine/catalog/export/Validator').default;

      const clientDb = { getExportStagedProductModel: () => ({ find: jest.fn(() => chain([])) }) };
      DatabaseManagerInstance.getClientDB.mockReset().mockResolvedValue(clientDb);

      const n11Signal = { _id: 'sig-n11', clientId: '1', integrationCode: 'n11', status: 'PREPARING', mode: 'TRANSFER', batchId: 'b-n11', itemCount: 1 };
      const trySignal = { _id: 'sig-try', clientId: '2', integrationCode: 'trendyol', status: 'PREPARING', mode: 'TRANSFER', batchId: 'b-try', itemCount: 1 };
      const queue = [n11Signal, trySignal];

      const signalModel = {
        findOneAndUpdate: jest.fn(async (filter: any) => {
          if (filter._id) return { status: 'COMPLETED' }; // dispatch() finally'sindeki serbest bırakma güncellemesi
          return queue.shift() ?? null; // sinyal seçimi (sırayla n11, sonra trendyol)
        }),
        findOne: jest.fn(() => chain(null)),
      };
      const appDb = { getExportSignalModel: () => signalModel };

      let runOnceCall = 0;
      ValidatorCtor.mockReset().mockImplementation(() => ({
        runOnce: jest.fn(async (_clientId: string, integrationCode: string) => {
          runOnceCall++;
          if (integrationCode === 'n11') throw new Error('N11 API 500 - servis çöktü (kaostest kasıtlı hatası)');
          return undefined; // trendyol başarılı
        }),
      }));

      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      cap = captureLogs();

      ExportOrchestrator.start(appDb);
      await flush();
      await jest.advanceTimersByTimeAsync(1000); // n11 turu sonrası 1sn sabit gecikme -> trendyol turu seçilir

      expect(runOnceCall).toBe(2); // HER İKİSİ de çağrıldı — n11 diğerini engellemedi
      const statuses = (StatisticsTracker.track.mock.calls as any[]).map((c: any) => [c[0].integrationCode, c[0].status]);
      expect(statuses).toEqual(expect.arrayContaining([
        ['n11', 'FAILED'],
        ['trendyol', 'SUCCESS'],
      ]));
      // N11 hatası CONSOLE'a loglandı (yutuldu), test sürecini/döngüyü ÇÖKERTMEDİ (SaaS çekirdeği ayakta kaldı)
      expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'EXPORTORCHESTRATOR_WORKER_DISPATCH_ERROR', err: expect.objectContaining({ message: expect.stringContaining('N11 API 500') }) }));
    } finally {
      jest.useRealTimers();
      jest.restoreAllMocks();
    }
  });
});

describe('Kaostest B — OrderOrchestrator: N11 job\'unun hata-işleme hatası Trendyol job\'unun "completed" olayını etkilemiyor', () => {
  it('errorHandler.handleJobFailure N11 job\'u için REDDEDER; Trendyol job\'unun BAĞIMSIZ "completed" olayı YİNE DE normal işlenir', async () => {
    jest.resetModules();
    jest.useFakeTimers();
    try {
      FakeQueueEvents.instances.length = 0;
      const { OrderOrchestrator } = require('@integration/engine/order/OrderOrchestrator');
      const { OrderErrorHandler } = require('@integration/engine/order/OrderErrorHandler');

      const handleJobFailure = jest.fn(async () => { throw new Error('DLQ yazımı başarısız (kaostest kasıtlı hatası)'); });
      (OrderErrorHandler as any).mockReset().mockImplementation(() => ({ handleJobFailure }));

      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      cap = captureLogs();

      OrderOrchestrator.start();
      await flush();
      await flush();

      expect(FakeQueueEvents.instances).toHaveLength(1);
      const qe = FakeQueueEvents.instances[0];

      // N11 job'u başarısız oldu -> errorHandler.handleJobFailure reddediyor (kaostest kasıtlı hatası)
      const n11Failed = qe.emit('failed', { jobId: 'n11-job-1', failedReason: '[UNAVAILABLE] N11 SOAP servis 500' });
      await expect(n11Failed).rejects.toThrow('DLQ yazımı başarısız'); // callback'in kendi promise'i reddediyor, ama bu İZOLE bir olay

      // Trendyol job'u TAMAMEN BAĞIMSIZ bir "completed" olayı yayınlıyor -> normal işleniyor, ETKİLENMEDİ
      await qe.emit('completed', { jobId: 'trendyol-job-1', returnvalue: { clientId: '9', marketplace: 'trendyol', processedOrderCount: 3, insertedIds: ['o1', 'o2', 'o3'] } });
      expect(cap.lines).toContainEqual(expect.objectContaining({ code: 'ORDERORCHESTRATOR_JOB_BASARIYLA_TAMAMLANDI_CLIENT', msg: expect.stringContaining('Job trendyol-job-1 başarıyla tamamlandı. Client: 9, Sipariş: 3') }));

      // İkinci, BAŞKA bir tenant'ın "failed" olayı da (n11 hatasından TAMAMEN bağımsız) kendi hata işleyicisini normal çağırıyor
      handleJobFailure.mockClear();
      (handleJobFailure as any).mockResolvedValueOnce(undefined);
      await qe.emit('failed', { jobId: 'hepsiburada-job-1', failedReason: 'transient' });
      expect(handleJobFailure).toHaveBeenCalledWith('hepsiburada-job-1', 'transient');
    } finally {
      jest.useRealTimers();
      jest.restoreAllMocks();
    }
  });
});

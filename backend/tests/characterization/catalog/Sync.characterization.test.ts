/**
 * CHARACTERIZATION: katalog export Sync (Catalog Synchronizer) runOnce
 * Kaynak: backend/src/integration/engine/catalog/export/Sync.ts
 *
 * IntegrationFactory jest.mock ile değiştirilir. Sahte engineProvider modelleri sahte; `prepareStagingUpdateOp` /
 * `prepareVariantPlatformUpdateOp` GERÇEK QueryBuilderOperations'a delege eder, böylece bulkWrite yükleri gerçek şekillidir.
 * DB/Redis/ağ/pazaryeri YOK; veriler sentetiktir. Config: export.config.json (synchronizer).
 *
 * [ADR-0006 Karar 4 — DÜZELTİLDİ, 2026-09-27] "kilitleme" ESKİDEN atomik DEĞİLDİ: `lockedBy: null` koşulu OLMADAN
 * toplu `updateMany` ile başka pod'un kilidi SESSİZCE ezilebiliyordu; değer yalnızca `process.env.POD_NAME`
 * (hostname yedeği yoktu, env boşsa `lockedBy: undefined` yazılıyordu). ARTIK: her batchId `@utils/podIdentity`
 * kimliğiyle TEK TEK `findOneAndUpdate({batchId, $or:[{lockedBy:null},{lockedBy:me}]})` ile atomik talep edilir;
 * talep edilemeyen (başka pod'da kilitli) batch'ler bu turda ATLANIR (hata değil, `allBatchIds`'e girmez).
 *
 * Bilinen gözlemler (BACKLOG: düzeltilince ilgili testler kasıtlı olarak güncellenecek):
 *  - WAITING kayıtların yeniden deneme mesajı "30dk sonra" der ama gerçek gecikme config.synchronizer.cooldownMinutes (=1) dakikadır;
 *  - hata durumunda 5 dk cooldown sabittir (config'ten gelmez) ve finalizeSignal atlanır (bu HALA DÜZELTİLMEDİ).
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import Sync from '@integration/engine/catalog/export/Sync';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { QueryBuilderOperations } from '@operations/integration/QueryBuilderOperations';
import config from '@integration/engine/catalog/export/export.config.json';

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;
const NOW = new Date('2026-05-01T10:00:00Z');
const MIN = 60000;

let signalModel: any;
let stagedModel: any;
let variantModel: any;
let provider: any;
let instance: any;
let getInstance: jest.Mock<any>;
let signalFind: any;
let staleEntries: any[];
let waitingEntries: any[];
let finalizeWaiting: Record<string, any[]>;
let deniedBatchIds: Set<string>;
const savedPod = process.env.POD_NAME;

const lean = (fnResult: () => any) => {
  const c: any = { calls: {} as Record<string, any[]> };
  c.select = jest.fn((...a: any[]) => { c.calls.select = a; return c; });
  c.lean = jest.fn(async () => fnResult());
  return c;
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  process.env.POD_NAME = 'pod-test';
  staleEntries = [];
  waitingEntries = [];
  finalizeWaiting = {};

  signalFind = [];
  deniedBatchIds = new Set(); // [ADR-0006] varsayılan: hepsi talep edilebilir (başka pod yok)
  signalModel = {
    find: jest.fn(() => lean(() => signalFind)),
    updateMany: jest.fn(async () => ({})),
    updateOne: jest.fn(async () => ({})),
    // [ADR-0006 Karar 4] Her batchId TEK TEK atomik olarak talep edilir. `deniedBatchIds` içindeki batch'ler
    // "başka bir pod'da kilitli" senaryosunu taklit eder (null döner -> Sync o batch'i dışlar).
    findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
      const batchId = filter.batchId;
      if (deniedBatchIds.has(batchId)) return null;
      return { batchId, lockedBy: update.$set.lockedBy };
    }),
  };
  stagedModel = {
    // 3 çağrı tipi: bayat (updatedAt), senkron (nextRunAt), finalize (tek batchId string)
    find: jest.fn((filter: any) => {
      if (filter.updatedAt) return lean(() => staleEntries);
      if (filter.nextRunAt) return lean(() => waitingEntries);
      return lean(() => finalizeWaiting[filter.batchId] ?? []);
    }),
    bulkWrite: jest.fn(async () => ({})),
  };
  variantModel = { bulkWrite: jest.fn(async () => ({})) };
  provider = {
    getExportSignalModel: () => signalModel,
    getExportStagedProductModel: () => stagedModel,
    getVariantModel: () => variantModel,
    prepareStagingUpdateOp: jest.fn((...a: any[]) => (QueryBuilderOperations as any).prepareStagingUpdateOp(...a)),
    prepareVariantPlatformUpdateOp: jest.fn((...a: any[]) => (QueryBuilderOperations as any).prepareVariantPlatformUpdateOp(...a)),
    markStatsAsDirty: jest.fn(async () => undefined),
  };
  instance = { getMatchKey: jest.fn(() => 'barcode'), updateProductStatuses: jest.fn(async () => []) };
  getInstance = jest.fn(async () => instance);
  factoryCtor.mockReset();
  factoryCtor.mockImplementation(() => ({ getInstance }));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  cap = captureLogs();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (savedPod === undefined) delete process.env.POD_NAME; else process.env.POD_NAME = savedPod;
});

const run = (initialBatch = 'b1') => new Sync(provider).runOnce('7', 'trendyol', 'TRANSFER' as any, initialBatch);
const entry = (id: string, barcode: string, mode = 'TRANSFER', batchId = 'b1') => ({ _id: id, barcode, mode, batchId });
const stagingUpdates = () => (stagedModel.bulkWrite.mock.calls as any[]).flatMap((c) => c[0]) as any[];
const variantUpdates = () => (variantModel.bulkWrite.mock.calls as any[]).flatMap((c) => c[0]) as any[];

describe('Sync.runOnce - kilitleme / toplulaştırma (ADR-0006 Karar 4: per-batch findOneAndUpdate)', () => {
  it('[MEVCUT DAVRANIŞ] aynı (clientId, integrationCode) altındaki kilitsiz WAITING sinyallerin batchId\'leri gelen batchId ile birleştirilir (uniq)', async () => {
    signalFind = [{ batchId: 'b2' }, { batchId: 'b1' }, { batchId: 'b3' }];
    await run('b1');
    expect(signalModel.find).toHaveBeenCalledWith({ clientId: '7', integrationCode: 'trendyol', status: 'WAITING', lockedBy: null });
    expect(signalModel.findOneAndUpdate.mock.calls.map((c: any[]) => c[0].batchId)).toEqual(['b1', 'b2', 'b3']);
  });

  it('[YENİ DAVRANIŞ — DÜZELTİLDİ] her batch TEK TEK atomik `findOneAndUpdate({batchId, $or:[{lockedBy:null},{lockedBy:me}]})` ile talep edilir (toplu/koşulsuz updateMany YOK); kimlik @utils/podIdentity\'den (env yoksa da ASLA undefined)', async () => {
    delete process.env.POD_NAME;
    await run('b1');
    const [filter, update] = signalModel.findOneAndUpdate.mock.calls[0] as any[];
    expect(filter).toEqual({ batchId: 'b1', $or: [{ lockedBy: null }, { lockedBy: expect.any(String) }] });
    expect(update.$set.lockedBy).toBeDefined();
    expect(update.$set.lockedBy).not.toBe('undefined');
    // İlk aşamada kilitleme artık updateMany İLE yapılmaz (updateMany yalnızca hata cooldown yolunda kullanılır)
    expect(signalModel.updateMany).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] başka bir podda kilitli (lease reddedilen) batch allBatchIds listesine girmez: senkronize edilmez, finalize edilmez', async () => {
    signalFind = [{ batchId: 'b2' }];
    deniedBatchIds.add('b2');
    waitingEntries = [entry('s1', 'A', 'TRANSFER', 'b1')];
    await run('b1');
    // b2 hiçbir aşamada işlenmez (finalize dahil)
    expect(signalModel.updateOne.mock.calls.map((c: any[]) => (c[0] as any).batchId)).toEqual(['b1']);
  });

  it('[YENİ DAVRANIŞ] HİÇBİR batch talep edilemezse (hepsi başka pod\'da) runOnce sessizce döner: platforma sorulmaz, finalize edilmez', async () => {
    deniedBatchIds.add('b1');
    await run('b1');
    expect(instance.updateProductStatuses).not.toHaveBeenCalled();
    expect(signalModel.updateOne).not.toHaveBeenCalled();
    expect(cap.lines).toContainEqual(expect.objectContaining({ code: 'SYNC_NO_BATCHES_CLAIMABLE' }));
  });

  it('[MEVCUT DAVRANIŞ] IntegrationFactory tenant clientId\'si Number() ile, instance integrationCode ile alınır', async () => {
    await run();
    expect(factoryCtor).toHaveBeenCalledWith(7);
    expect(getInstance).toHaveBeenCalledWith('trendyol');
  });
});

describe('Sync.runOnce - senkronizasyon sonuçları (durum geçişleri)', () => {
  const okEntries = () => [entry('s1', 'A'), entry('s2', 'B'), entry('s3', 'C'), entry('s4', 'D')];

  it('[MEVCUT DAVRANIŞ] WAITING kayıt sorgusu: batchId $in, status WAITING, nextRunAt <= şimdi; alan seçimi "_id <matchKey> batchId mode"', async () => {
    await run();
    const call = (stagedModel.find.mock.calls as any[]).find((c) => c[0].nextRunAt)!;
    expect(call[0]).toEqual({ batchId: { $in: ['b1'] }, status: 'WAITING', nextRunAt: { $lte: NOW } });
  });

  it('[MEVCUT DAVRANIŞ] COMPLETED -> staging COMPLETED (priorityScore 0, errorMessage null, completedAt, log "Onaylandı") + varyant platform statüsü COMPLETED', async () => {
    waitingEntries = [entry('s1', 'A')];
    instance.updateProductStatuses.mockResolvedValue([{ matchValue: 'A', status: 'COMPLETED', mapping: { platformId: 'P1' }, messages: [] }]);
    await run();

    const st = stagingUpdates()[0].updateOne;
    expect(st.filter).toEqual({ _id: 's1' });
    expect(st.update.$set).toMatchObject({ status: 'COMPLETED', priorityScore: 0, errorMessage: null, completedAt: NOW, lockedBy: null });
    expect(st.update.$push.logs.$each[0]).toMatchObject({ status: 'COMPLETED', worker: 'Catalog Synchronizer', message: 'Senkronizasyon: Onaylandı.' });
    expect(st.update.$push.logs.$slice).toBe(-20); // [DB-04] logs[] sınırı

    const v = variantUpdates()[0].updateOne;
    expect(v.filter).toEqual({ barcode: 'A' });
    expect(v.update.$set).toMatchObject({
      'platforms.trendyol.upload.TRANSFER.status': 'COMPLETED',
      'platforms.trendyol.mapping': { platformId: 'P1' },
    });
  });

  it('[MEVCUT DAVRANIŞ] COMPLETED dışındaki her sonuç (FAILED veya bilinmeyen statü) FAILED sayılır; hata mesajı "[..]" öneklerinden arındırılır', async () => {
    waitingEntries = [entry('s1', 'A'), entry('s2', 'B')];
    instance.updateProductStatuses.mockResolvedValue([
      { matchValue: 'A', status: 'FAILED', messages: '[Trendyol][E42] Barkod hatalı' },
      { matchValue: 'B', status: 'SOMETHING_ELSE', messages: ['[X] ilk mesaj', 'ikinci'] },
    ]);
    await run();
    const st = stagingUpdates();
    expect(st[0].updateOne.update.$set).toMatchObject({ status: 'FAILED', errorMessage: 'Barkod hatalı', priorityScore: 0 });
    expect(st[0].updateOne.update.$push.logs.$each[0].message).toBe('Senkronizasyon: Reddedildi.');
    expect(st[1].updateOne.update.$set).toMatchObject({ status: 'FAILED', errorMessage: 'ilk mesaj' }); // dizi -> ilk eleman
    expect(variantUpdates()[0].updateOne.update.$set['platforms.trendyol.upload.TRANSFER.messages']).toEqual(['Barkod hatalı']);
  });

  it('[MEVCUT DAVRANIŞ] mesaj yoksa/string değilse "İşlem tamamlandı." varsayılanı kullanılır', async () => {
    waitingEntries = [entry('s1', 'A'), entry('s2', 'B')];
    instance.updateProductStatuses.mockResolvedValue([
      { matchValue: 'A', status: 'FAILED' },
      { matchValue: 'B', status: 'FAILED', messages: [] },
    ]);
    await run();
    expect(stagingUpdates().map((o) => o.updateOne.update.$set.errorMessage)).toEqual(['İşlem tamamlandı.', 'İşlem tamamlandı.']);
  });

  it('[MEVCUT DAVRANIŞ] WAITING sonucu ve platformdan hiç sonuç gelmeyen kayıtlar WAITING kalır: nextRunAt = şimdi + config.cooldownMinutes(1 dk), varyant tablosuna YAZILMAZ', async () => {
    waitingEntries = [entry('s1', 'A'), entry('s2', 'B')];
    instance.updateProductStatuses.mockResolvedValue([{ matchValue: 'A', status: 'WAITING' }]); // B için sonuç yok
    await run();

    expect(config.synchronizer.cooldownMinutes).toBe(1);
    const st = stagingUpdates();
    for (const op of st) {
      expect(op.updateOne.update.$set.status).toBe('WAITING');
      expect(op.updateOne.update.$set.nextRunAt).toEqual(new Date(NOW.getTime() + 1 * MIN));
    }
    expect(st[0].updateOne.update.$push.logs.$each[0].message).toBe('Pazaryeri onayı bekleniyor (Sıradaki kontrol 30dk sonra).');
    expect(st[1].updateOne.update.$push.logs.$each[0].message).toBe('Pazaryeri servisinden durum bilgisi alınamadı (Sıradaki kontrol 30dk sonra).');
    expect(variantModel.bulkWrite).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] log mesajı "30dk sonra" der ama gerçek bekleme cooldownMinutes=1 dakikadır', async () => {
    // BACKLOG: şüpheli - mesaj (30dk) ile config (1 dk) uyuşmuyor; `|| 30` yedeği yalnızca config 0/eksikse devreye girer. Düzeltilince güncellenecek.
    waitingEntries = [entry('s1', 'A')];
    await run();
    const set = stagingUpdates()[0].updateOne.update.$set;
    expect(set.nextRunAt.getTime() - NOW.getTime()).toBe(60000);
    expect(stagingUpdates()[0].updateOne.update.$push.logs.$each[0].message).toContain('30dk');
  });

  it('[MEVCUT DAVRANIŞ] sonuç eşleştirme: (r.matchValue || r.barcode || r.stockCode) === kayıt matchKey değeri; eşleşmeyen sonuç yok sayılır', async () => {
    waitingEntries = [entry('s1', 'A'), entry('s2', 'B'), entry('s3', 'C')];
    instance.updateProductStatuses.mockResolvedValue([
      { barcode: 'A', status: 'COMPLETED' },
      { stockCode: 'B', status: 'COMPLETED' },
      { matchValue: 'ZZZ', status: 'COMPLETED' },
    ]);
    await run();
    const byId = Object.fromEntries(stagingUpdates().map((o) => [o.updateOne.filter._id, o.updateOne.update.$set.status]));
    expect(byId).toEqual({ s1: 'COMPLETED', s2: 'COMPLETED', s3: 'WAITING' });
  });

  it('[MEVCUT DAVRANIŞ] platform modülüne barcodes ve matchValues AYNI dizi içeriğiyle (matchKey değerleri) gönderilir; matchKey küçük harfe çevrilir', async () => {
    instance.getMatchKey.mockReturnValue('StockCode');
    waitingEntries = [{ _id: 's1', stockcode: 'SC1', mode: 'TRANSFER', batchId: 'b1' }];
    await run();
    expect(instance.updateProductStatuses).toHaveBeenCalledWith({ barcodes: ['SC1'], matchValues: ['SC1'] });
    const call = (stagedModel.find.mock.calls as any[]).find((c) => c[0].nextRunAt);
    expect(call).toBeDefined();
  });

  it('[MEVCUT DAVRANIŞ] kayıtlar 50\'lik (batchSize) parçalara bölünür; her parça sırayla platforma sorulur, her parça sonunda istatistik "dirty" işaretlenir', async () => {
    waitingEntries = Array.from({ length: 120 }, (_, i) => entry('s' + i, 'BC' + i));
    await run();
    expect(instance.updateProductStatuses).toHaveBeenCalledTimes(3);
    expect(instance.updateProductStatuses.mock.calls.map((c: any[]) => (c[0] as any).barcodes.length)).toEqual([50, 50, 20]);
    expect(provider.markStatsAsDirty).toHaveBeenCalledTimes(3);
  });

  it('[MEVCUT DAVRANIŞ] varyant güncellemesi entry.mode ile hedeflenir (platforms.<code>.upload.<mode>) ve filtre matchKey alanıyla String() kullanır', async () => {
    waitingEntries = [entry('s1', 'A', 'UPDATE_PRICE')];
    instance.updateProductStatuses.mockResolvedValue([{ matchValue: 'A', status: 'COMPLETED' }]);
    await run();
    const set = variantUpdates()[0].updateOne.update.$set;
    expect(Object.keys(set)).toContain('platforms.trendyol.upload.UPDATE_PRICE.status');
  });
});

describe('Sync.runOnce - bayat (stale) WAITING temizliği', () => {
  it('[MEVCUT DAVRANIŞ] updatedAt <= şimdi-14 gün olan WAITING kayıtlar FAILED yapılır (zaman aşımı mesajı), varyant FAILED, mapping yazılmaz; sorgu batchId listesiyle sınırlı', async () => {
    staleEntries = [{ _id: 'old1', barcode: 'OLD', mode: 'TRANSFER' }];
    await run();
    const staleCall = (stagedModel.find.mock.calls as any[]).find((c) => c[0].updatedAt)!;
    expect(staleCall[0]).toEqual({ batchId: { $in: ['b1'] }, status: 'WAITING', updatedAt: { $lte: new Date(NOW.getTime() - 14 * 24 * 60 * MIN) } });

    const msg = 'Onay süreci 14 gün içinde tamamlanmadığı için zaman aşımı.';
    const st = stagingUpdates()[0].updateOne;
    expect(st.filter).toEqual({ _id: 'old1' });
    expect(st.update.$set).toMatchObject({ status: 'FAILED', priorityScore: 0, errorMessage: msg });
    const v = variantUpdates()[0].updateOne;
    expect(v.filter).toEqual({ barcode: 'OLD' });
    expect(v.update.$set).toMatchObject({ 'platforms.trendyol.upload.TRANSFER.status': 'FAILED', 'platforms.trendyol.upload.TRANSFER.messages': [msg] });
    expect(Object.keys(v.update.$set)).not.toContain('platforms.trendyol.mapping');
  });

  it('[MEVCUT DAVRANIŞ] bayat kayıt yoksa temizlik hiçbir yazma yapmaz', async () => {
    await run();
    expect(stagedModel.bulkWrite).not.toHaveBeenCalled();
    expect(variantModel.bulkWrite).not.toHaveBeenCalled();
  });
});

describe('Sync.runOnce - finalizeSignal (sinyal durumu)', () => {
  it('[MEVCUT DAVRANIŞ] işlenecek kayıt yoksa her batch finalize edilir ve platforma HİÇ sorulmaz', async () => {
    signalFind = [{ batchId: 'b2' }];
    await run('b1');
    expect(instance.updateProductStatuses).not.toHaveBeenCalled();
    expect(signalModel.updateOne.mock.calls.map((c: any[]) => (c[0] as any).batchId)).toEqual(['b1', 'b2']);
  });

  it('[MEVCUT DAVRANIŞ] batch\'te WAITING kalan yoksa sinyal COMPLETED (completedAt=şimdi), kilit açılır, nextRunAt=şimdi', async () => {
    await run('b1');
    const [filter, update] = signalModel.updateOne.mock.calls[0] as any[];
    expect(filter).toEqual({ batchId: 'b1' }); // clientId filtresi YOK (batchId benzersizliğine güvenir)
    expect(update.$set).toEqual({ status: 'COMPLETED', lockedBy: null, nextRunAt: NOW, updatedAt: NOW, completedAt: NOW });
  });

  it('[MEVCUT DAVRANIŞ] batch\'te WAITING kalan varsa sinyal WAITING, nextRunAt = kalanların EN ERKEN nextRunAt\'i, completedAt null, kilit açılır', async () => {
    const early = new Date(NOW.getTime() + 1 * MIN);
    const late = new Date(NOW.getTime() + 9 * MIN);
    finalizeWaiting = { b1: [{ nextRunAt: late }, { nextRunAt: early }, { nextRunAt: null }] };
    await run('b1');
    const [, update] = signalModel.updateOne.mock.calls[0] as any[];
    expect(update.$set).toMatchObject({ status: 'WAITING', lockedBy: null, nextRunAt: early, completedAt: null });
  });

  it('[MEVCUT DAVRANIŞ] WAITING kalanların hiçbirinde nextRunAt yoksa sinyal WAITING ama nextRunAt=şimdi (hemen yeniden seçilebilir)', async () => {
    finalizeWaiting = { b1: [{ nextRunAt: undefined }] };
    await run('b1');
    expect((signalModel.updateOne.mock.calls[0][1] as any).$set).toMatchObject({ status: 'WAITING', nextRunAt: NOW });
  });

  it('[MEVCUT DAVRANIŞ] tam akışta önce tüm parçalar senkronlanır, sonra HER batch kendi WAITING durumuna göre finalize edilir', async () => {
    signalFind = [{ batchId: 'b2' }];
    waitingEntries = [entry('s1', 'A')];
    finalizeWaiting = { b2: [{ nextRunAt: new Date(NOW.getTime() + MIN) }] };
    instance.updateProductStatuses.mockResolvedValue([{ matchValue: 'A', status: 'COMPLETED' }]);
    await run('b1');
    const byBatch = Object.fromEntries((signalModel.updateOne.mock.calls as any[]).map((c) => [c[0].batchId, c[1].$set.status]));
    expect(byBatch).toEqual({ b1: 'COMPLETED', b2: 'WAITING' });
  });
});

describe('Sync.runOnce - hata yolu', () => {
  it('[MEVCUT DAVRANIŞ, ADR-0006\'ya göre güncellendi] platform hatası yakalanır (runOnce reddetmez): tüm TALEP EDİLMİŞ batch\'ler kilitten çıkarılır ve nextRunAt = şimdi + 5 dk (sabit cooldown); finalizeSignal ÇALIŞMAZ', async () => {
    // BACKLOG: şüpheli - sabit 5 dk (config değil) ve hata sinyal statüsünü değiştirmiyor; düzeltilince bu test kasıtlı olarak güncellenecek
    signalFind = [{ batchId: 'b2' }];
    waitingEntries = [entry('s1', 'A')];
    instance.updateProductStatuses.mockRejectedValue(new Error('platform 500'));
    await expect(run('b1')).resolves.toBeUndefined();

    // [ADR-0006] Kilitleme artık updateMany İLE yapılmaz (per-batch findOneAndUpdate); updateMany SADECE hata cooldown'unda çağrılır.
    const calls = signalModel.updateMany.mock.calls as any[];
    expect(calls).toHaveLength(1); // yalnızca hata cooldown
    expect(calls[0][0]).toEqual({ batchId: { $in: ['b1', 'b2'] } });
    expect(calls[0][1].$set).toEqual({ lockedBy: null, updatedAt: NOW, nextRunAt: new Date(NOW.getTime() + 5 * MIN) });
    expect(signalModel.updateOne).not.toHaveBeenCalled();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'SYNC_SYNCHRONIZER_AGGREGATION_ERROR', err: expect.objectContaining({ message: "platform 500" }) }));
  });

  it('[MEVCUT DAVRANIŞ] entegrasyon örneği alınamazsa da (cleanup içinde) aynı hata/cooldown yoluna düşer', async () => {
    getInstance.mockRejectedValue(new Error('no adapter'));
    await expect(run('b1')).resolves.toBeUndefined();
    expect((signalModel.updateMany.mock.calls[0][1] as any).$set.nextRunAt).toEqual(new Date(NOW.getTime() + 5 * MIN));
  });

  it('[MEVCUT DAVRANIŞ] toplu yazma (bulkWrite) hatası da hata yoluna düşer', async () => {
    waitingEntries = [entry('s1', 'A')];
    instance.updateProductStatuses.mockResolvedValue([{ matchValue: 'A', status: 'COMPLETED' }]);
    variantModel.bulkWrite.mockRejectedValue(new Error('bulk fail'));
    await expect(run()).resolves.toBeUndefined();
    expect(signalModel.updateOne).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ, ADR-0006\'ya göre güncellendi] hata yolundaki cooldown yazımı da patlarsa hata runOnce\'tan YAYILIR', async () => {
    instance.updateProductStatuses.mockRejectedValue(new Error('platform 500'));
    waitingEntries = [entry('s1', 'A')];
    // [ADR-0006] Artık tek bir updateMany çağrısı var (hata cooldown'u); onun hatası doğrudan yayılır.
    signalModel.updateMany.mockRejectedValueOnce(new Error('cooldown write fail'));
    await expect(run()).rejects.toThrow('cooldown write fail');
  });

  it('[YENİ DAVRANIŞ, ADR-0006] ilk kilitleme (per-batch findOneAndUpdate) hatası try dışındadır: doğrudan yayılır', async () => {
    signalModel.findOneAndUpdate.mockRejectedValueOnce(new Error('lock write fail'));
    await expect(run()).rejects.toThrow('lock write fail');
  });
});

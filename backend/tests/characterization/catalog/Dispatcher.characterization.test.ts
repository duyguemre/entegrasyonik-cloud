/**
 * CHARACTERIZATION: katalog export Dispatcher.run
 * Kaynak: backend/src/integration/engine/catalog/export/Dispatcher.ts
 *
 * DatabaseManager, IntegrationFactory ve IntegrationEngineProvider jest.mock ile değiştirilir; applicationDB/clientDB
 * zincirlenebilir sahte modellerdir (find().sort().limit().lean()). DB/Redis/ağ/pazaryeri YOK; veriler sentetiktir.
 * integrationEventBus gerçektir (emit dinlenir). Kod DEĞİŞTİRİLMEDİ.
 *
 * Bilinen gözlemler (docs/backlog-detail/backlog-1e.md L-08, backlog-1g-t4.md):
 *  - [ADR-0003 adım 8 — DÜZELTİLDİ] eskiden tenant ClientDB bulunamazsa `return` -> sonraki tüm bayraklar (ve uyandırma
 *    olayı) atlanıyordu; artık yalnızca o bayrak `continue` ile atlanır, döngü ve PROCESS_NEXT_SIGNAL devam eder.
 *    Ayrıca ACTIVE olmayan (ör. DELETION_PENDING) tenant'ların bayrakları da aynı şekilde atlanır (tek toplu sorgu).
 *  - [ADR-0006 Karar 4 — DÜZELTİLDİ] eskiden çok-pod kilidi YOK'tu: iki eşzamanlı run() aynı QUEUED kayıtlardan iki
 *    ayrı batch/sinyal üretebiliyordu. Artık her bayrak işlenmeden önce ExportFlag üzerinde `@utils/mongoLease`
 *    ile lease talep edilir (`leaseOwner`/`leaseUntil`, TTL 5 dk, kimlik `@utils/podIdentity`); lease alınamayan
 *    pod o turda bayrağı ATLAR (hata değil). İş bitince (başarılı/başarısız) `finally`'de lease bırakılır.
 *    [DÜZELTME 2026-09-28] Bu testteki `flagModel.findOneAndUpdate` sahtesi filtreyi DEĞERLENDİRMEZ (yalnızca
 *    `leaseClaimResult` döner); bu yüzden `acquireLease`'in `$lt`-null tip-kısıtı hatası burada görünmedi. Filtre semantiği
 *    gerçek Mongo'da tests/integration/mongoLease.realmongo.test.ts ile kanıtlanır.
 *  - StagedProduct güncellemesi `status: 'QUEUED'` koruması olmadan `_id $in` ile yapılır (BU HALA DÜZELTİLMEDİ —
 *    lease sadece "hangi pod bu bayrağı işler" sorusunu çözer, aynı pod içindeki sorgu şekli değişmedi).
 *  - staged güncelle -> sinyal oluştur -> sayaç düş adımları atomik değildir (BU HALA DÜZELTİLMEDİ).
 * BACKLOG: düzeltilince ilgili testler kasıtlı olarak güncellenecek.
 */
import { captureLogs, LogCapture } from '../../helpers/logCapture';
let cap: LogCapture;
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/catalog/provider/IntegrationEngineProvider', () => ({ IntegrationEngineProvider: jest.fn() }));
jest.mock('@services/billing/EntitlementService', () => ({ EntitlementService: { checkAccess: jest.fn() } }));

import Dispatcher from '@integration/engine/catalog/export/Dispatcher';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { IntegrationEngineProvider } from '@integration/engine/catalog/provider/IntegrationEngineProvider';
import { EVENTS, integrationEventBus } from '@integration/engine/IntegrationEventBus';
import { EntitlementService } from '@services/billing/EntitlementService';
import { setTargetIntake, resetPlatformOverrideStoreForTests } from '@integration/config/platformOverrideStore';

const dbm = DatabaseManagerInstance as any;
const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;
const providerCtor = IntegrationEngineProvider as unknown as jest.Mock<any>;

const order: string[] = [];
let flagModel: any;
let signalModel: any;
let stagedModel: any;
let appDb: any;
let clientDb: any;
let instance: any;
let getInstance: jest.Mock<any>;
let emitSpy: any;

/** find()/findOne() zincirini taklit eder: sort/limit/select kayıt altına alınır, lean() sonucu çözer. */
function chain(result: any) {
  const c: any = { calls: {} as Record<string, any[]> };
  for (const m of ['sort', 'limit', 'select']) c[m] = jest.fn((...a: any[]) => { c.calls[m] = a; return c; });
  c.lean = jest.fn(async () => result);
  return c;
}

let flagsResult: any[];
let signalsResult: any[];
let ongoingResult: any[];
let leadResult: any;
let queuedResult: any[];
let flagChain: any, signalChain: any, ongoingChain: any, leadChain: any, queuedChain: any;
let clientModel: any;
/** [ADR-0006 Karar 4] varsayılan olarak lease HER ZAMAN talep edende kalır (truthy döner); belirli bir testte
 * `null` yapmak "başka bir pod zaten lease sahibi" durumunu taklit eder. */
let leaseClaimResult: any;
/** [ADR-0003 adım 8] varsayılan olarak İSTENEN her tenant "ACTIVE" sayılır; belirli bir testte bir order'ı buraya
 * eklemek onu "aktif değil/bulunamadı" yapar (Dispatcher'ın toplu aktif-tenant sorgusunu taklit eder). */
let inactiveOrders: Set<number>;

const flag = (clientId: any, integrationCode = 'trendyol') => ({ clientId, integrationCode });
const items = (n: number, mode = 'TRANSFER', start = 0) => Array.from({ length: n }, (_, i) => ({ _id: `id${start + i}`, mode, barcode: `B${start + i}` }));

beforeEach(() => {
  order.length = 0;
  flagsResult = [flag('1')];
  signalsResult = [];
  ongoingResult = [];
  leadResult = { mode: 'TRANSFER' };
  queuedResult = items(3);
  inactiveOrders = new Set();
  leaseClaimResult = {}; // [ADR-0006 Karar 4] varsayılan: lease serbest, talep eden hemen alır
  delete process.env.ENTITLEMENT_GUARD_ENABLED; // varsayılan: bayrak KAPALI
  (EntitlementService.checkAccess as any).mockReset();

  flagModel = {
    find: jest.fn(() => (flagChain = chain(flagsResult))),
    // [ADR-0006 Karar 4] updateOne İKİ farklı amaçla çağrılır: (a) leadItem yoksa sayaç eşitleme (eski davranış,
    // update.$set.queuedCount), (b) releaseLease (update.$set.leaseOwner === null). Şekle göre ayrıştırılır.
    updateOne: jest.fn(async (_filter: any, update: any) => {
      if (update?.$set && update.$set.leaseOwner === null) { order.push('flag.lease.release'); return {}; }
      order.push('flag.updateOne');
      return {};
    }),
    // [ADR-0006 Karar 4] findOneAndUpdate İKİ farklı amaçla çağrılır: (a) lease talebi (update.$set.leaseOwner
    // tanımlı ve $inc YOK), (b) sayaç düşürme (update.$inc var). Şekle göre ayrıştırılır.
    findOneAndUpdate: jest.fn(async (_filter: any, update: any) => {
      if (update?.$inc) { order.push('flag.decrement'); return {}; }
      order.push('flag.lease.acquire');
      return leaseClaimResult;
    }),
  };
  signalModel = {
    find: jest.fn(() => (signalChain = chain(signalsResult))),
    create: jest.fn(async () => { order.push('signal.create'); }),
  };
  // [ADR-0003 adım 8] Dispatcher, bayraklardaki clientId'leri TOPLU olarak sorgular; requested order.$in içindeki
  // her sayı, `inactiveOrders`'ta değilse "ACTIVE" sayılır (varsayılan: hepsi aktif -> mevcut testler etkilenmez).
  clientModel = {
    find: jest.fn((filter: any) => {
      const requested: number[] = (filter && filter.order && filter.order.$in) || [];
      const rows = requested.filter((o: number) => !inactiveOrders.has(o)).map((o: number) => ({ order: o }));
      return chain(rows);
    }),
  };
  appDb = {
    getExportFlagModel: jest.fn(() => flagModel),
    getExportSignalModel: jest.fn(() => signalModel),
    getClientModel: jest.fn(() => clientModel),
  };

  stagedModel = {
    find: jest.fn((filter: any) => {
      if (filter.batchId) return (ongoingChain = chain(ongoingResult));
      return (queuedChain = chain(queuedResult));
    }),
    findOne: jest.fn(() => (leadChain = chain(leadResult))),
    updateMany: jest.fn(async () => { order.push('staged.updateMany'); }),
    countDocuments: jest.fn(async () => 5),
  };
  clientDb = { getExportStagedProductModel: jest.fn(() => stagedModel) };

  instance = { getMatchKey: jest.fn(() => 'barcode') };
  getInstance = jest.fn(async () => instance);
  factoryCtor.mockReset();
  factoryCtor.mockImplementation(() => ({ getInstance }));
  providerCtor.mockReset();
  dbm.getApplicationDB.mockReset();
  dbm.getApplicationDB.mockResolvedValue(appDb);
  dbm.getClientDB.mockReset();
  dbm.getClientDB.mockResolvedValue(clientDb);

  emitSpy = jest.spyOn(integrationEventBus, 'emit');
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  cap = captureLogs();
});

afterEach(() => {
  resetPlatformOverrideStoreForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete process.env.ENTITLEMENT_GUARD_ENABLED;
});

describe('Dispatcher.run - bayrak seçimi', () => {
  it('[MEVCUT DAVRANIŞ] bekleyen bayrak sorgusu: queuedCount>0, priority desc + lastUpdatedAt asc, EN FAZLA 20 bayrak (küresel FIFO; tenant başına kota yok)', async () => {
    await new Dispatcher().run();
    expect(flagModel.find).toHaveBeenCalledWith({ queuedCount: { $gt: 0 } });
    expect(flagChain.calls.sort).toEqual([{ priority: -1, lastUpdatedAt: 1 }]);
    expect(flagChain.calls.limit).toEqual([20]);
  });

  it('[MEVCUT DAVRANIŞ] bayrak yoksa erken çıkılır: tenant DB aranmaz, olay yayınlanmaz', async () => {
    flagsResult = [];
    await new Dispatcher().run();
    expect(dbm.getClientDB).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});

describe('Dispatcher.run - mutlu yol (vagon oluşturma)', () => {
  it('[MEVCUT DAVRANIŞ] QUEUED kayıtlar PREPARING+batchId yapılır, PREPARING sinyali oluşturulur, sayaç düşer, PROCESS_NEXT_SIGNAL yayınlanır', async () => {
    await new Dispatcher().run();

    expect(dbm.getClientDB).toHaveBeenCalledWith('1'); // clientId bayraktan olduğu gibi (Number() değil)
    expect(factoryCtor).toHaveBeenCalledWith(1); // IntegrationFactory Number(clientId) ile
    expect(getInstance).toHaveBeenCalledWith('trendyol');
    expect(providerCtor).toHaveBeenCalledWith(appDb, clientDb);

    const [filter, update] = stagedModel.updateMany.mock.calls[0] as any[];
    const batchId = update.$set.batchId;
    expect(filter).toEqual({ _id: { $in: ['id0', 'id1', 'id2'] } }); // status:'QUEUED' koruması YOK
    expect(batchId).toMatch(/^[0-9a-f]{24}$/);
    expect(update.$set).toMatchObject({ status: 'PREPARING', batchId });
    expect(update.$push.logs.$each[0]).toMatchObject({ status: 'PREPARING', worker: 'Catalog Dispatcher' });
    expect(update.$push.logs.$each[0].message).toContain(batchId);
    expect(update.$push.logs.$slice).toBe(-20); // [DB-04] logs[] sınırı

    const sig = signalModel.create.mock.calls[0][0] as any;
    expect(sig).toMatchObject({
      clientId: '1', integrationCode: 'trendyol', mode: 'TRANSFER', status: 'PREPARING', batchId,
      sequence: 1, totalBatches: 1, itemCount: 3, lockedBy: null,
    });
    expect(sig.groupId).toMatch(/^[0-9a-f]{24}$/);
    expect(sig.groupId).not.toBe(batchId);
    expect(sig.nextRunAt).toBeInstanceOf(Date);
    expect(sig.logs).toHaveLength(1);

    expect(flagModel.findOneAndUpdate).toHaveBeenCalledWith(
      { clientId: '1', integrationCode: 'trendyol' },
      { $inc: { queuedCount: -3 }, $set: { lastUpdatedAt: expect.any(Date) } },
      { new: true },
    );
    expect(emitSpy).toHaveBeenCalledWith(EVENTS.PROCESS_NEXT_SIGNAL);
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] adım sırası: staged güncelle -> sinyal oluştur -> sayaç düş (atomik değil; arada çökme = PREPARING kayıtlar sinyalsiz kalır); [ADR-0006] öncesinde lease alınır, sonrasında bırakılır', async () => {
    // BACKLOG: şüpheli - staged/sinyal/sayaç arasında işlem/transaction yok; düzeltilince bu test kasıtlı olarak güncellenecek
    await new Dispatcher().run();
    expect(order).toEqual(['flag.lease.acquire', 'staged.updateMany', 'signal.create', 'flag.decrement', 'flag.lease.release']);
  });

  it('[MEVCUT DAVRANIŞ] sorgu şekli: lead + paket sorguları priorityScore desc / createdAt asc sıralı, paket en çok 300 (BATCH_SIZE), yalnızca lead ürünün moduyla', async () => {
    leadResult = { mode: 'UPDATE_PRICE' };
    queuedResult = items(2, 'UPDATE_PRICE');
    await new Dispatcher().run();

    expect(leadChain.calls.sort).toEqual([{ priorityScore: -1, createdAt: 1 }]);
    expect(leadChain.calls.select).toEqual(['mode']);
    expect(stagedModel.findOne.mock.calls[0][0]).toMatchObject({ integrationCode: 'trendyol', status: 'QUEUED' });

    const queuedFilter = (stagedModel.find.mock.calls.find((c: any[]) => !c[0].batchId) as any[])[0];
    expect(queuedFilter).toMatchObject({ integrationCode: 'trendyol', status: 'QUEUED', mode: 'UPDATE_PRICE' });
    expect(queuedChain.calls.sort).toEqual([{ priorityScore: -1, createdAt: 1 }]);
    expect(queuedChain.calls.limit).toEqual([300]);
    expect((signalModel.create.mock.calls[0][0] as any).mode).toBe('UPDATE_PRICE');
  });

  it('[MEVCUT DAVRANIŞ] sinyal modu lead ürünün değil, paketteki İLK kaydın modundan alınır', async () => {
    leadResult = { mode: 'TRANSFER' };
    queuedResult = items(1, 'UPDATE_STOCK');
    await new Dispatcher().run();
    expect((signalModel.create.mock.calls[0][0] as any).mode).toBe('UPDATE_STOCK');
  });

  it('[MEVCUT DAVRANIŞ] birden çok bayrak sırayla işlenir; olay tüm döngü sonunda TEK kez yayınlanır', async () => {
    flagsResult = [flag('1'), flag('2', 'n11')];
    await new Dispatcher().run();
    expect(signalModel.create).toHaveBeenCalledTimes(2);
    expect(signalModel.create.mock.calls.map((c: any) => [(c[0] as any).clientId, (c[0] as any).integrationCode])).toEqual([['1', 'trendyol'], ['2', 'n11']]);
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Dispatcher.run - matchKey ve yoldaki (busy) kayıtlar', () => {
  it('[MEVCUT DAVRANIŞ] matchKey küçük harfe çevrilir ($expr $concat alanı için); boş gelirse "barcode"', async () => {
    instance.getMatchKey.mockReturnValue('StockCode');
    await new Dispatcher().run();
    expect(JSON.stringify(stagedModel.findOne.mock.calls[0][0].$expr)).toContain('$stockcode');

    stagedModel.findOne.mockClear();
    instance.getMatchKey.mockReturnValue('');
    await new Dispatcher().run();
    expect(JSON.stringify(stagedModel.findOne.mock.calls[0][0].$expr)).toContain('$barcode');
  });

  it('[MEVCUT DAVRANIŞ] aktif sinyal sorgusu: (clientId, integrationCode) + status PREPARING/PENDING/SENT/WAITING, yalnız batchId seçilir', async () => {
    await new Dispatcher().run();
    expect(signalModel.find).toHaveBeenCalledWith({
      clientId: '1', integrationCode: 'trendyol', status: { $in: ['PREPARING', 'PENDING', 'SENT', 'WAITING'] },
    });
    expect(signalChain.calls.select).toEqual(['batchId']);
  });

  it('[MEVCUT DAVRANIŞ] aktif sinyal yoksa "yoldaki" kayıt sorgusu HİÇ yapılmaz ve busy listesi boş kalır', async () => {
    await new Dispatcher().run();
    expect(stagedModel.find.mock.calls.every((c: any[]) => !c[0].batchId)).toBe(true);
    expect(stagedModel.findOne.mock.calls[0][0].$expr.$not.$in[1]).toEqual([]);
  });

  it('[MEVCUT DAVRANIŞ] aktif sinyalli batch\'lerdeki tamamlanmamış kayıtlar "<matchKey>_<mode>" olarak busy sayılır ve hem lead hem paket sorgusundan dışlanır', async () => {
    signalsResult = [{ batchId: 'b1' }, { batchId: 'b2' }];
    ongoingResult = [{ barcode: 'X1', mode: 'TRANSFER' }, { barcode: 'X2', mode: 'UPDATE_PRICE' }];
    await new Dispatcher().run();

    const ongoingFilter = (stagedModel.find.mock.calls.find((c: any[]) => c[0].batchId) as any[])[0];
    expect(ongoingFilter).toEqual({ integrationCode: 'trendyol', batchId: { $in: ['b1', 'b2'] }, status: { $nin: ['COMPLETED', 'FAILED'] } });
    expect(ongoingChain.calls.select).toEqual(['barcode mode']);

    const busy = ['X1_TRANSFER', 'X2_UPDATE_PRICE'];
    expect(stagedModel.findOne.mock.calls[0][0].$expr.$not.$in[1]).toEqual(busy);
    const queuedFilter = (stagedModel.find.mock.calls.find((c: any[]) => !c[0].batchId) as any[])[0];
    expect(queuedFilter.$expr.$not.$in[1]).toEqual(busy);
    expect(queuedFilter.$expr.$not.$in[0]).toEqual({ $concat: ['$barcode', '_', '$mode'] });
  });
});

describe('Dispatcher.run - lead bulunamadığında (hepsi yolda)', () => {
  it('[MEVCUT DAVRANIŞ] sinyal oluşturulmaz; sayaç gerçek QUEUED sayısıyla ÜZERİNE YAZILIR ($set) ve sonraki bayrağa geçilir; olay yayınlanmaz', async () => {
    leadResult = null;
    flagsResult = [flag('1'), flag('2', 'n11')];
    await new Dispatcher().run();

    expect(stagedModel.countDocuments).toHaveBeenCalledWith({ integrationCode: 'trendyol', status: 'QUEUED' });
    expect(flagModel.updateOne).toHaveBeenCalledWith(
      { clientId: '1', integrationCode: 'trendyol' },
      { $set: { queuedCount: 5, lastUpdatedAt: expect.any(Date) } },
    );
    // [ADR-0006] updateOne artık iki bayrak için HEM sayaç eşitleme HEM lease bırakma çağrısı alır: 2+2=4
    const syncCalls = flagModel.updateOne.mock.calls.filter((c: any[]) => c[1]?.$set?.queuedCount !== undefined);
    const releaseCalls = flagModel.updateOne.mock.calls.filter((c: any[]) => c[1]?.$set?.leaseOwner === null);
    expect(syncCalls).toHaveLength(2); // ikinci bayrak da işlendi
    expect(releaseCalls).toHaveLength(2); // her bayrak için lease bırakıldı
    expect(signalModel.create).not.toHaveBeenCalled();
    expect(stagedModel.updateMany).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});

describe('Dispatcher.run - askıdaki/aktif olmayan tenant (ADR-0003 adım 8, L-08 düzeltmesi)', () => {
  it('aktif tenant sorgusu: bayraklardaki TEKİL clientId listesiyle ve status:ACTIVE ile toplu yapılır', async () => {
    flagsResult = [flag('1'), flag('2', 'n11'), flag('1', 'n11')]; // '1' iki bayrakta -> tekilleştirilir
    await new Dispatcher().run();
    expect(appDb.getClientModel).toHaveBeenCalled();
    expect(clientModel.find).toHaveBeenCalledWith({ order: { $in: [1, 2] }, status: 'ACTIVE' });
  });

  it('ACTIVE olmayan (ör. DELETION_PENDING) tenant\'ın bayrağı atlanır: ClientDB o tenant için HİÇ aranmaz, diğer bayraklar işlenir', async () => {
    flagsResult = [flag('1'), flag('2', 'n11')];
    inactiveOrders.add(2);
    await new Dispatcher().run();

    expect(dbm.getClientDB).toHaveBeenCalledTimes(1);
    expect(dbm.getClientDB).toHaveBeenCalledWith('1');
    expect(signalModel.create).toHaveBeenCalledTimes(1);
    expect((signalModel.create.mock.calls[0][0] as any).clientId).toBe('1');
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'DISPATCHER_TENANT_NOT_ACTIVE', msg: expect.stringContaining('Tenant is not ACTIVE or not found (order: 2)') }));
    expect(emitSpy).toHaveBeenCalledTimes(1); // '1' başarıyla işlendiği için olay yine yayınlanır
  });

  it('bayraklardaki TÜM tenant\'lar aktif değilse: ClientDB hiç aranmaz, sinyal oluşmaz, olay yayınlanmaz', async () => {
    flagsResult = [flag('1'), flag('2', 'n11')];
    inactiveOrders.add(1);
    inactiveOrders.add(2);
    await new Dispatcher().run();

    expect(dbm.getClientDB).not.toHaveBeenCalled();
    expect(signalModel.create).not.toHaveBeenCalled();
    expect(emitSpy).not.toHaveBeenCalled();
  });
});

describe('Dispatcher.run - hata ve tenant yokluğu davranışları', () => {
  it('[ADR-0003 adım 8 — DÜZELTİLMİŞ DAVRANIŞ] bir bayrağın tenant ClientDB\'si yoksa `continue`: SONRAKİ BAYRAKLAR İŞLENİR ve PROCESS_NEXT_SIGNAL yine yayınlanır (L-08 düzeltmesi)', async () => {
    // Eskiden (MEVCUT DAVRANIŞ, artık geçersiz): `return` tüm run()'ı durdurup '3' hiç denenmez, olay hiç yayınlanmazdı.
    flagsResult = [flag('1'), flag('gone'), flag('3')];
    dbm.getClientDB.mockImplementation(async (id: string) => (id === 'gone' ? undefined : clientDb));
    await new Dispatcher().run();

    expect(dbm.getClientDB.mock.calls.map((c: any[]) => c[0])).toEqual(['1', 'gone', '3']); // '3' de artık denendi
    expect(signalModel.create).toHaveBeenCalledTimes(2); // '1' ve '3' için (gone atlandı)
    expect(signalModel.create.mock.calls.map((c: any) => (c[0] as any).clientId)).toEqual(['1', '3']);
    expect(emitSpy).toHaveBeenCalledWith(EVENTS.PROCESS_NEXT_SIGNAL); // artık yayınlanıyor
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'DISPATCHER_CLIENT_DB_NOT_FOUND', msg: expect.stringContaining('Client DB not found for Client ID: gone') }));
  });

  it('[ADR-0003 adım 8 — DÜZELTİLMİŞ DAVRANIŞ] silinmiş tenant en öncelikli bayraksa DİĞER tenant\'lar için vagon OLUŞUR (L-08 düzeltmesi)', async () => {
    flagsResult = [flag('gone'), flag('1')];
    dbm.getClientDB.mockImplementation(async (id: string) => (id === 'gone' ? undefined : clientDb));
    await new Dispatcher().run();
    expect(signalModel.create).toHaveBeenCalledTimes(1); // yalnızca '1'
    expect(emitSpy).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] bir bayraktaki iş hatası (ör. entegrasyon örneği alınamadı) yakalanır ve sonraki bayraklar işlenir; başarılı olanlar için olay yine yayınlanır', async () => {
    flagsResult = [flag('1', 'broken'), flag('2', 'n11')];
    getInstance.mockImplementation(async (code: string) => { if (code === 'broken') throw new Error('no adapter'); return instance; });
    await new Dispatcher().run();
    expect(signalModel.create).toHaveBeenCalledTimes(1);
    expect((signalModel.create.mock.calls[0][0] as any).clientId).toBe('2');
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'DISPATCHER_CLIENT_ERROR', err: expect.objectContaining({ message: "no adapter" }) }));
  });

  it('[MEVCUT DAVRANIŞ] lead bulundu ama paket sorgusu boş dönerse (yarış) TypeError yakalanır: sinyal yok, staged güncellenmez, sayaç düşmez (lease yine de alınıp bırakılır — [ADR-0006])', async () => {
    queuedResult = [];
    await new Dispatcher().run();
    expect(stagedModel.updateMany).not.toHaveBeenCalled();
    expect(signalModel.create).not.toHaveBeenCalled();
    // Sayaç düşürme ($inc içeren çağrı) YOK; lease talebi (findOneAndUpdate) HER ZAMAN yapılır ([ADR-0006]).
    expect(flagModel.findOneAndUpdate.mock.calls.some((c: any[]) => c[1]?.$inc)).toBe(false);
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'DISPATCHER_CLIENT_ERROR' }));
  });

  it('[MEVCUT DAVRANIŞ] sinyal oluşturma hatası (staged zaten PREPARING) yakalanır; sayaç düşürülmez, olay yayınlanmaz (kayıtlar sinyalsiz PREPARING kalır); lease bırakılır ([ADR-0006])', async () => {
    // BACKLOG: şüpheli - kısmi başarı durumu telafi edilmiyor; düzeltilince bu test kasıtlı olarak güncellenecek
    signalModel.create.mockRejectedValue(new Error('signal write fail'));
    await new Dispatcher().run();
    expect(stagedModel.updateMany).toHaveBeenCalledTimes(1);
    expect(flagModel.findOneAndUpdate.mock.calls.some((c: any[]) => c[1]?.$inc)).toBe(false);
    expect(flagModel.updateOne).toHaveBeenCalledWith(
      { clientId: '1', integrationCode: 'trendyol', leaseOwner: expect.any(String) },
      { $set: { leaseOwner: null, leaseUntil: null } },
    ); // finally bloğu lease'i bırakır
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] ApplicationDB hatası dış catch\'te yutulur (run() reddetmez), hiçbir şey yazılmaz', async () => {
    dbm.getApplicationDB.mockRejectedValue(new Error('app db down'));
    await expect(new Dispatcher().run()).resolves.toBeUndefined();
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'DISPATCHER_CRITICAL_ERROR', msg: expect.stringContaining('Critical Error on'), err: expect.objectContaining({ message: "app db down" }) }));
  });

  it('[MEVCUT DAVRANIŞ] bayrak sorgusu hatası da yutulur', async () => {
    flagModel.find.mockImplementation(() => { throw new Error('find failed'); });
    await expect(new Dispatcher().run()).resolves.toBeUndefined();
  });
});

describe('Dispatcher - çok-pod koruması (ADR-0006 Karar 4: ExportFlag lease)', () => {
  it('[YENİ DAVRANIŞ — DÜZELTİLDİ] iki pod aynı bayrağı eşzamanlı talep ederse SADECE lease\'i alan sinyal oluşturur; diğeri o turda ATLAR (eskiden: iki AYRI batch/sinyal, çift gönderim riski)', async () => {
    // Gerçek Mongo'nun findOneAndUpdate atomikliğini taklit eden basit, paylaşımlı bir lease durumu.
    let leaseOwner: string | null = null;
    let leaseUntilMs = 0;
    flagModel.findOneAndUpdate.mockImplementation(async (filter: any, update: any) => {
      if (update?.$inc) { order.push('flag.decrement'); return {}; }
      const owner = update.$set.leaseOwner;
      const now = Date.now();
      const free = leaseUntilMs < now || leaseOwner === owner;
      if (!free) { order.push(`flag.lease.denied:${owner}`); return null; }
      leaseOwner = owner;
      leaseUntilMs = update.$set.leaseUntil.getTime();
      order.push(`flag.lease.acquire:${owner}`);
      return { clientId: filter.clientId, integrationCode: filter.integrationCode };
    });
    flagModel.updateOne.mockImplementation(async (_filter: any, update: any) => {
      if (update?.$set?.leaseOwner === null) { leaseOwner = null; leaseUntilMs = 0; order.push('flag.lease.release'); return {}; }
      order.push('flag.updateOne');
      return {};
    });

    // Pod A'yı getInstance() içinde bekletiyoruz (lease'i tuttuğu sürece), böylece Pod B araya girebiliyor.
    let releaseGate: (() => void) | null = null;
    const gate = new Promise<void>((r) => { releaseGate = r; });
    let getInstanceCalls = 0;
    getInstance.mockImplementation(async () => {
      getInstanceCalls += 1;
      if (getInstanceCalls === 1) await gate;
      return instance;
    });

    const prevPod = process.env.POD_NAME;
    process.env.POD_NAME = 'pod-A';
    const podAPromise = new Dispatcher().run(); // senkron olarak lease'i alır, sonra getInstance() içinde bekler

    await new Promise((r) => setImmediate(r)); // Pod A'nın lease alıp gate'e kadar ilerlemesini bekle

    process.env.POD_NAME = 'pod-B';
    await new Dispatcher().run(); // aynı bayrağı talep eder; lease Pod A'da -> reddedilir, bu turda ATLAR

    releaseGate!(); // Pod A'nın devam etmesine izin ver
    await podAPromise;
    if (prevPod === undefined) delete process.env.POD_NAME; else process.env.POD_NAME = prevPod;

    expect(signalModel.create).toHaveBeenCalledTimes(1); // ARTIK ÇİFT GÖNDERİM YOK — sadece lease sahibi
    expect(order).toContain('flag.lease.acquire:pod-A');
    expect(order).toContain('flag.lease.denied:pod-B');
    expect(order).toContain('flag.lease.release'); // Pod A işini bitirince lease'i bıraktı
  });

  it('[YENİ DAVRANIŞ] lease reddedilirse (başka pod sahip) bayrak sessizce atlanır: sinyal/staged güncellemesi/sayaç düşürme YOK, hata değil', async () => {
    leaseClaimResult = null; // başka bir pod zaten bu bayrağın lease'ine sahip
    await new Dispatcher().run();
    expect(signalModel.create).not.toHaveBeenCalled();
    expect(stagedModel.updateMany).not.toHaveBeenCalled();
    expect(flagModel.findOneAndUpdate.mock.calls.some((c: any[]) => c[1]?.$inc)).toBe(false);
    expect(emitSpy).not.toHaveBeenCalled();
    expect(cap.filter((l) => l.level === 'error')).toHaveLength(0);
  });

  it('[YENİ DAVRANIŞ] POD_NAME artık lease sahipliğinde kullanılır (@utils/podIdentity ile); sinyal lockedBy yine her zaman null ile yaratılır', async () => {
    const prev = process.env.POD_NAME;
    process.env.POD_NAME = 'pod-x';
    try {
      await new Dispatcher().run();
      expect((signalModel.create.mock.calls[0][0] as any).lockedBy).toBeNull();
      // [ADR-0006] Eskiden POD_NAME hiçbir Mongo yazımında kullanılmıyordu; artık lease talebinde/bırakımında kullanılır.
      const leaseAcquireCall = flagModel.findOneAndUpdate.mock.calls.find((c: any[]) => !c[1]?.$inc);
      expect(leaseAcquireCall![1].$set.leaseOwner).toBe('pod-x');
      const leaseReleaseCall = flagModel.updateOne.mock.calls.find((c: any[]) => c[1]?.$set?.leaseOwner === null);
      expect(leaseReleaseCall![0]).toMatchObject({ leaseOwner: 'pod-x' });
    } finally {
      if (prev === undefined) delete process.env.POD_NAME; else process.env.POD_NAME = prev;
    }
  });
});

describe('Dispatcher.run - ADR-0008 §3(b) entitlement guard (ENTITLEMENT_GUARD_ENABLED, BAYRAK KORUMALI)', () => {
  it('[KARAKTERİZASYON] bayrak tanımsız/false (varsayılan): EntitlementService.checkAccess HİÇ ÇAĞRILMAZ, davranış birebir mevcut gibi', async () => {
    await new Dispatcher().run();
    expect(EntitlementService.checkAccess).not.toHaveBeenCalled();
    expect(signalModel.create).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ] bayrak true: ACTIVE (tenant altyapı durumu) + checkAccess allowed:true olan bayrak için vagon oluşur; checkAccess(clientId, "engine") ile çağrılır', async () => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: true, status: 'active' });
    await new Dispatcher().run();
    expect(EntitlementService.checkAccess).toHaveBeenCalledWith(1, 'engine');
    expect(signalModel.create).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ] bayrak true + allowed:false (ör. suspended): SADECE bu bayrak atlanır (vagon oluşmaz), diğer bayraklar için döngü devam eder', async () => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    flagsResult = [flag('1'), flag('2', 'n11')];
    (EntitlementService.checkAccess as any).mockImplementation(async (clientId: number) => (
      clientId === 1 ? { allowed: false, status: 'suspended' } : { allowed: true, status: 'active' }
    ));
    await new Dispatcher().run();
    expect(signalModel.create).toHaveBeenCalledTimes(1);
    expect((signalModel.create.mock.calls[0][0] as any).clientId).toBe('2');
    // Askıdaki tenant için ClientDB'ye HİÇ sorulmaz (kuyruğa almadan ÖNCEki kapı; ADR §3 (b))
    expect(dbm.getClientDB).toHaveBeenCalledTimes(1);
    expect(dbm.getClientDB).toHaveBeenCalledWith('2');
  });

  it.each(['suspended', 'canceled', 'expired', 'no_subscription'])('[YENİ DAVRANIŞ] durum makinesi kablolaması: %s x allowed:false -> bayrak atlanır', async (status) => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: false, status });
    await new Dispatcher().run();
    expect(signalModel.create).not.toHaveBeenCalled();
    expect(dbm.getClientDB).not.toHaveBeenCalled();
  });

  it.each(['trialing', 'active', 'past_due'])('[YENİ DAVRANIŞ] durum makinesi kablolaması: %s x allowed:true -> vagon oluşur', async (status) => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: true, status });
    await new Dispatcher().run();
    expect(signalModel.create).toHaveBeenCalledTimes(1);
  });
});

describe('Dispatcher.run - kill-switch (ADR-0030 X6)', () => {
  it.each([['drain', 'trendyol'], ['off', 'trendyol'], ['off', '_engine']])('[YENİ DAVRANIŞ] %s @ %s: vagon/sinyal OLUŞMAZ, dış çağrı yok, kuyruk kaydı ve sayaç dokunulmaz', async (intake, target) => {
    setTargetIntake(target, intake as any);
    await new Dispatcher().run();
    expect(signalModel.create).not.toHaveBeenCalled();
    expect(stagedModel.updateMany).not.toHaveBeenCalled();
    expect(getInstance).not.toHaveBeenCalled();
    expect(flagModel.findOneAndUpdate).not.toHaveBeenCalled(); // lease bile alınmaz
  });

  it('[YENİ DAVRANIŞ] başka entegrasyonun kapatılması bu bayrağı etkilemez; açılınca iş devam eder', async () => {
    setTargetIntake('hepsiburada', 'off');
    await new Dispatcher().run();
    expect(signalModel.create).toHaveBeenCalledTimes(1);

    signalModel.create.mockClear();
    setTargetIntake('trendyol', 'off');
    await new Dispatcher().run();
    expect(signalModel.create).not.toHaveBeenCalled();
    setTargetIntake('trendyol', 'on');
    await new Dispatcher().run();
    expect(signalModel.create).toHaveBeenCalledTimes(1);
  });
});

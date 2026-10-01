/**
 * CHARACTERIZATION + YENİ DAVRANIŞ: ClientDB (ADR-0024 D2 — tek kök bağlantı + useDb + Map<dbname>)
 * Kaynak: backend/src/database/client/ClientDB.ts
 *
 * Kök bağlantı (`@database/rootConnection`) ve ClientMongooseSchemas jest.mock ile değiştirilir; gerçek Mongo YOK
 * (gerçek useDb semantiği: tests/mongo-semantics/tenantUseDb.mongoSemantics.test.ts). Ad/kimlikler sentetiktir.
 *
 * Bugünkü davranıştan KASITLI değişenler (ADR-0024 D2): tenant başına bağlantı/havuz yok; LRU (max 100), dispose ve
 * initPromises kalktı; tahliyede bağlantı KAPANMAZ; `dbConfig.poolsize` okunmaz; anahtar `dbname`; izinsiz ad reddi;
 * kapanış bayrağı. Korunanlar: aynı tenant = aynı örnek, eşzamanlı çağrılar tek açılış, hata sonrası yeniden deneme,
 * invalidate idempotent, dropDatabase delege, model erişim tablosu.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@database/client/ClientMongooseSchemas', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@database/rootConnection', () => ({ __esModule: true, getRootDatabase: jest.fn(), getAppDbConfig: jest.fn() }));

import ClientDB from '@database/client/ClientDB';
import getModels from '@database/client/ClientMongooseSchemas';
import { getRootDatabase } from '@database/rootConnection';

const rootMock = getRootDatabase as unknown as jest.Mock<any>;

let dbSeq = 0;
let created: any[];
let useDb: jest.Mock<any>;

function fakeDatabase(name: string) {
  const db: any = {
    id: ++dbSeq, name,
    close: jest.fn(async () => undefined),
    getModel: jest.fn((n: string) => `MODEL:${n}`),
    dropDatabase: jest.fn(async () => undefined),
  };
  created.push(db);
  return db;
}

// [faz4-arch-p0db] ad kapısı yalnız `entegrasyonikClient_<n>` (n rakam) kabul eder: sayısal olmayan anahtarlar sabit bir sayıya eşlenir.
const nmIds = new Map<string, number>();
const nm = (n: string | number) => {
  const k = String(n);
  if (/^[1-9]\d*$/.test(k)) return 'entegrasyonikClient_' + k;
  if (!nmIds.has(k)) nmIds.set(k, 9000 + nmIds.size + 1);
  return 'entegrasyonikClient_' + nmIds.get(k);
};
const tenant = (id: any, name = nm(String(id))) => ({ _id: id, dbConfig: { dbname: name, poolsize: 2 } });

beforeEach(() => {
  created = [];
  ClientDB.resetForTests();
  useDb = jest.fn((name: string) => fakeDatabase(name));
  rootMock.mockReset();
  rootMock.mockImplementation(async () => ({ useDb }));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('ClientDB.getInstance - tutamak önbelleği (Map<dbname>)', () => {
  it('ilk çağrıda kökten useDb(dbname, getModels) ile tutamak türetir; kayıttaki url/user/password/poolsize KULLANILMAZ', async () => {
    const inst = await ClientDB.getInstance({ _id: '1', dbConfig: { dbname: nm(1), poolsize: 99, url: 'mongodb://legacy.invalid/x', user: 'legacy' } } as any);
    expect(rootMock).toHaveBeenCalledTimes(1);
    expect(useDb).toHaveBeenCalledTimes(1);
    expect(useDb).toHaveBeenCalledWith(nm(1), getModels);
    expect(inst).toBeDefined();
    expect(ClientDB.size).toBe(1);
  });

  it('aynı tenant aynı örneği döner (yeniden useDb/model derlemesi yok)', async () => {
    const a = await ClientDB.getInstance(tenant('1') as any);
    const b = await ClientDB.getInstance(tenant('1') as any);
    expect(b).toBe(a);
    expect(useDb).toHaveBeenCalledTimes(1);
  });

  it('farklı tenant farklı db adı/tutamak alır ama TEK kök kullanılır', async () => {
    const a = await ClientDB.getInstance(tenant('1') as any);
    const b = await ClientDB.getInstance(tenant('2') as any);
    expect(b).not.toBe(a);
    expect(useDb.mock.calls.map(c => c[0])).toEqual([nm(1), nm(2)]);
  });

  it('eşzamanlı çağrılar tek açılışı paylaşır', async () => {
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => ClientDB.getInstance(tenant('1') as any)));
    expect(a).toBe(b); expect(b).toBe(c);
    expect(useDb).toHaveBeenCalledTimes(1);
  });

  it('kök hatasında söz reddedilir, önbelleğe yazılmaz; sonraki çağrı yeniden dener', async () => {
    rootMock.mockRejectedValueOnce(new Error('connect fail'));
    await expect(ClientDB.getInstance(tenant('1') as any)).rejects.toThrow('connect fail');
    expect(ClientDB.size).toBe(0);
    await expect(ClientDB.getInstance(tenant('1') as any)).resolves.toBeDefined();
    expect(useDb).toHaveBeenCalledTimes(1);
  });

  it('anahtar dbname: aynı dbname e işaret eden iki kayıt aynı tutamağı paylaşır', async () => {
    const a = await ClientDB.getInstance(tenant('a', nm('shared')) as any);
    const b = await ClientDB.getInstance(tenant('b', nm('shared')) as any);
    expect(b).toBe(a);
  });

  it('LRU/tahliye YOK: 150 tenant açılsa da hiçbiri tahliye edilmez ve hiçbir tutamak close() edilmez', async () => {
    for (let i = 0; i < 150; i++) await ClientDB.getInstance(tenant(String(i)) as any);
    expect(ClientDB.size).toBe(150);
    expect(created.every(d => d.close.mock.calls.length === 0)).toBe(true);
    const again = await ClientDB.getInstance(tenant('0') as any);
    expect(again).toBeDefined();
    expect(useDb).toHaveBeenCalledTimes(150); // yeniden bağlanma fırtınası yok
  });
});

describe('ClientDB - tenant izolasyonu / izinli DB adı', () => {
  it.each([[undefined], [''], ['a/b'], ['x?y=1'], ['{{USER}}'], ['a b'], ['x'.repeat(64)]])(
    'geçersiz dbConfig.dbname (%p) reddedilir; kök bağlantıya gidilmez', async (bad) => {
      await expect(ClientDB.getInstance({ _id: 'e', dbConfig: { dbname: bad } } as any)).rejects.toThrow('izinli bir dbConfig.dbname');
      expect(rootMock).not.toHaveBeenCalled();
    });

  it.each([['admin'], ['local'], ['config'], ['otherproject_db'], ['db_1'], ['entegrasyonikDB']])(
    'izinli önek dışı / uygulama DB adı (%p) tenant olarak REDDEDİLİR (aynı cluster daki başka projeler + sistem DB leri)', async (bad) => {
      await expect(ClientDB.getInstance(tenant('z', bad) as any)).rejects.toThrow('izinli bir dbConfig.dbname');
      expect(useDb).not.toHaveBeenCalled();
    });

  it.each([['entegrasyonik'], ['entegrasyonik_client'], ['entegrasyonik_client_2'], ['entegrasyonik_client_24'], ['entegrasyonik_client_25'], ['entegrasyonikClient_1'], ['entegrasyonikClient_1234']])(
    'izinli ad (%p) kabul edilir', async (ok) => {
      await expect(ClientDB.getInstance(tenant('k', ok) as any)).resolves.toBeDefined();
    });
});

describe('ClientDB - kapanış', () => {
  it('kapanış bayrağı açıkken getInstance REDDEDİLİR (yeni bağlantı/tutamak yok)', async () => {
    ClientDB.beginShutdown();
    await expect(ClientDB.getInstance(tenant('1') as any)).rejects.toThrow('Kapanış başladı');
    expect(rootMock).not.toHaveBeenCalled();
  });

  it('kök çözülürken kapanış başlarsa açılış iptal edilir (tutamak kaydedilmez)', async () => {
    let release!: (v: any) => void;
    rootMock.mockImplementationOnce(() => new Promise(r => { release = r; }));
    const p = ClientDB.getInstance(tenant('1') as any);
    const settled = p.catch(e => e);
    ClientDB.beginShutdown();
    release({ useDb });
    expect(String(await settled)).toContain('Kapanış başladı');
    expect(ClientDB.size).toBe(0);
  });

  it('closeAll uçuştaki açılışı bekler ve tutamakları bırakır; hiçbir close() çağrılmaz (kökü DatabaseManager kapatır)', async () => {
    await ClientDB.getInstance(tenant('1') as any);
    await ClientDB.closeAll();
    expect(ClientDB.size).toBe(0);
    expect(created[0].close).not.toHaveBeenCalled();
  });
});

describe('ClientDB.dropDatabase / invalidate (ADR-0003 adım 8 — mock, GERÇEK silme YOK)', () => {
  it('dropDatabase() alttaki tutamağa delege eder; close değildir', async () => {
    const inst: any = await ClientDB.getInstance(tenant('p1') as any);
    await inst.dropDatabase();
    expect(created[0].dropDatabase).toHaveBeenCalledTimes(1);
    expect(created[0].close).not.toHaveBeenCalled();
  });

  it('invalidate(_id): tutamağı Map ten siler, bağlantıyı KAPATMAZ, idempotent; tekrar istenirse yeni tutamak', async () => {
    const inst = await ClientDB.getInstance(tenant('p2') as any);
    await ClientDB.invalidate('p2');
    expect(ClientDB.size).toBe(0);
    expect(created[0].close).not.toHaveBeenCalled();
    await expect(ClientDB.invalidate('p2')).resolves.toBeUndefined();
    const again = await ClientDB.getInstance(tenant('p2') as any);
    expect(again).not.toBe(inst);
    expect(useDb).toHaveBeenCalledTimes(2);
  });

  it('tahliyede uçuştaki sorgu korunur: invalidate sonrası eski örnek modelini kullanmaya devam eder', async () => {
    const inst: any = await ClientDB.getInstance(tenant('p3') as any);
    const model = inst.getOrderModel();
    await ClientDB.invalidate('p3');
    expect(inst.getOrderModel()).toBe(model);
    expect(created[0].close).not.toHaveBeenCalled();
  });
});

describe('ClientDB model erişim metotları', () => {
  const table: Array<[string, string]> = [
    ['getPlatformProcessModel', 'platform_process'], ['getPlatformProcessProductModel', 'platform_process_product'],
    ['getIntegrationCategoryModel', 'integration_category'], ['getIntegrationBrandModel', 'integration_brand'],
    ['getHashtagModel', 'hashtag'], ['getCategoryModel', 'category'], ['getClaimModel', 'claim'], ['getBrandModel', 'brand'],
    ['getChoiceModel', 'choice'], ['getProductModel', 'product'], ['getVariantModel', 'variant'], ['getImageModel', 'image'],
    ['getOrderModel', 'order'], ['getCustomerModel', 'customer'], ['getRoleModel', 'role'], ['getSettingModel', 'setting'],
    ['getFavoriteModel', 'favorite'], ['getInvoiceModel', 'invoice'], ['getCounterModel', 'counter'],
    ['getClientIntegrationModel', 'client_integration'], ['getStatisticsModel', 'statistics'],
    ['getAttributeMappingModel', 'attribute_mapping'], ['getNotificationModel', 'notification'],
    ['getExportStagedProductModel', 'export_staged_product'], ['getImportStagedProductModel', 'import_staged_product'],
    ['getImportStagedProductSummaryModel', 'import_staged_product_summary'], ['getImportJobReportModel', 'import_job_report'],
    ['getMessageModel', 'message'], ['getUserModel', 'user'], ['getFinancialTransactionModel', 'financial_transaction'],
    ['getCargoInvoiceModel', 'cargo_invoice'],
  ];

  it.each(table)('[MEVCUT DAVRANIŞ] %s -> database.getModel("%s")', async (method, modelName) => {
    const inst: any = await ClientDB.getInstance(tenant('m') as any);
    expect(inst[method]()).toBe(`MODEL:${modelName}`);
    expect(created[0].getModel).toHaveBeenCalledWith(modelName);
  });

  it('[MEVCUT DAVRANIŞ] tenant modeli kendi bağlantısından gelir: iki tenant farklı Database.getModel çağrısı kullanır', async () => {
    const a: any = await ClientDB.getInstance(tenant('a') as any);
    const b: any = await ClientDB.getInstance(tenant('b') as any);
    a.getOrderModel();
    expect(created[0].getModel).toHaveBeenCalledTimes(1);
    expect(created[1].getModel).not.toHaveBeenCalled();
    b.getOrderModel();
    expect(created[1].getModel).toHaveBeenCalledTimes(1);
  });
});

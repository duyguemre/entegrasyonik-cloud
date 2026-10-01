/**
 * CHARACTERIZATION: DatabaseManager (getClientDB, getAppDbConfig env şekli, closeAllConnections)
 * Kaynak: backend/src/database/DatabaseManager.ts
 *
 * ApplicationDB, Database ve ClientMongooseSchemas jest.mock ile değiştirilir; ClientDB GERÇEKTİR (Database mock'lu),
 * böylece closeAllConnections -> ClientDB.cache.clear() -> database.close() zinciri gözlenir. DB/ağ YOK.
 * Env değerleri sentetiktir; testten sonra orijinal env geri yüklenir.
 *
 * [ADR-0003 adım 5] getClientDB artık kaydın dbConfig'ini AYNEN geçirmez: tenant bağlantısı env'deki DB_URL/DB_USER/DB_PASSWORD'dan
 * kurulur, kayıttan yalnızca dbname/poolsize alınır (eski url/user/password yok sayılır). İlgili beklenti kasıtlı güncellendi.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/client/ClientMongooseSchemas', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@database/application/ApplicationDB', () => ({ __esModule: true, default: { getInstance: jest.fn(), peek: jest.fn() } }));

import { DatabaseManagerInstance } from '@database/DatabaseManager';
import ClientDB from '@database/client/ClientDB';
import ApplicationDB from '@database/application/ApplicationDB';

const appGetInstance = ApplicationDB.getInstance as unknown as jest.Mock<any>;
const appPeek = (ApplicationDB as any).peek as jest.Mock<any>;
let useDb: jest.Mock<any>;
const ENV_KEYS = ['DB_URL', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_POOL_SIZE'] as const;
const savedEnv: Record<string, string | undefined> = {};

let clientModel: { findOne: jest.Mock<any> };
let leanMock: jest.Mock<any>;
let appDb: { getClientModel: jest.Mock<any>; close: jest.Mock<any>; getRootDatabase: jest.Mock<any> };
let clientConns: any[];

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  // tenant bağlantısı env'den kurulur (ADR-0003 adım 5): sentetik uygulama bağlantı bilgisi
  process.env.DB_URL = 'mongodb://127.0.0.1/appdb?authSource=admin';
  process.env.DB_USER = 'env-user';
  process.env.DB_PASSWORD = 'env-pass';
  clientConns = [];
  leanMock = jest.fn(async () => null);
  clientModel = { findOne: jest.fn(() => ({ lean: leanMock })) };
  useDb = jest.fn((name: string) => {
    const c = { name, close: jest.fn(async () => undefined), getModel: jest.fn() };
    clientConns.push(c);
    return c;
  });
  appDb = { getClientModel: jest.fn(() => clientModel), close: jest.fn(async () => undefined), getRootDatabase: jest.fn(() => ({ useDb })) };
  appGetInstance.mockReset();
  appGetInstance.mockResolvedValue(appDb);
  appPeek.mockReset();
  appPeek.mockImplementation(() => appDb);
  DatabaseManagerInstance.resetForTests();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('DatabaseManager.getClientDB', () => {
  it.each([[0], [undefined], [null], [NaN]])(
    '[MEVCUT DAVRANIŞ] clientId falsy (%p) ise "Client ID is required" hatası; ApplicationDB\'ye HİÇ gidilmez',
    async (bad) => {
      await expect(DatabaseManagerInstance.getClientDB(bad as any)).rejects.toThrow('[DatabaseManager] Client ID is required');
      expect(appGetInstance).not.toHaveBeenCalled();
    },
  );

  it('[MEVCUT DAVRANIŞ] kayıt yoksa undefined döner (hata fırlatmaz)', async () => {
    leanMock.mockResolvedValueOnce(null);
    await expect(DatabaseManagerInstance.getClientDB(7)).resolves.toBeUndefined();
    expect(useDb).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] tenant kaydı `{ order: clientId }` ile aranır (clientId, Clients.order alanıyla eşleşir; _id ile DEĞİL) ve .lean() kullanılır', async () => {
    await DatabaseManagerInstance.getClientDB(7);
    expect(appDb.getClientModel).toHaveBeenCalledTimes(1);
    expect(clientModel.findOne).toHaveBeenCalledWith({ order: 7 });
    expect(leanMock).toHaveBeenCalledTimes(1);
  });

  it('[ADR-0024 D1/D2] kayıt varsa TenantRegistry -> ClientDB.getInstance({_id, dbConfig:{dbname}}) çağrılır; tutamak TEK kökten useDb(dbname) ile türetilir (kayıttaki url/user/password/poolsize yok sayılır)', async () => {
    const rec = { _id: 'rec1', order: 7, status: 'active', dbConfig: { url: 'mongodb://127.0.0.1', user: 'u', password: 'p', dbname: 'entegrasyonikClient_7', poolsize: 3 } };
    leanMock.mockResolvedValue(rec);
    const spy = jest.spyOn(ClientDB, 'getInstance');
    const res = await DatabaseManagerInstance.getClientDB(7);
    expect(spy).toHaveBeenCalledWith({ _id: 'rec1', dbConfig: { dbname: 'entegrasyonikClient_7' } });
    expect(res).toBeInstanceOf(ClientDB);
    expect(useDb.mock.calls[0][0]).toBe('entegrasyonikClient_7');
    expect(useDb).toHaveBeenCalledTimes(1);
  });

  it('[ADR-0024 D1 - KASITLI DEĞİŞİKLİK] aynı clientId için tekrar çağrı aynı ClientDB döner ve kayıt sorgusu TenantRegistry (TTL 30 sn) sayesinde BİR kez yapılır (eskiden her çağrıda)', async () => {
    leanMock.mockResolvedValue({ _id: 'rec1', order: 7, dbConfig: { dbname: 'entegrasyonikClient_7' } });
    const a = await DatabaseManagerInstance.getClientDB(7);
    const b = await DatabaseManagerInstance.getClientDB(7);
    expect(b).toBe(a);
    expect(useDb).toHaveBeenCalledTimes(1);
    expect(clientModel.findOne).toHaveBeenCalledTimes(1);
  });

  it('[ADR-0024 D1] getTenant(order) status dahil döner; kayıt yoksa undefined ve ÖNBELLEĞE ALINMAZ', async () => {
    leanMock.mockResolvedValueOnce(null);
    await expect(DatabaseManagerInstance.getTenant(9)).resolves.toBeUndefined();
    leanMock.mockResolvedValueOnce({ _id: 'r9', order: 9, status: 'suspended', dbConfig: { dbname: 'entegrasyonikClient_9' } });
    await expect(DatabaseManagerInstance.getTenant(9)).resolves.toEqual({ order: 9, _id: 'r9', status: 'suspended', dbname: 'entegrasyonikClient_9' });
  });

  it('[ADR-0024 D1] izinsiz dbname taşıyan tenant kaydı HATA verir (izolasyon); bağlantı denenmez', async () => {
    leanMock.mockResolvedValue({ _id: 'bad', order: 5, dbConfig: { dbname: 'someOtherProject' } });
    await expect(DatabaseManagerInstance.getClientDB(5)).rejects.toThrow('izinli tenant DB adları');
    expect(useDb).not.toHaveBeenCalled();
  });

  it('[ADR-0024 D1] ClientDB.invalidate(_id) TenantRegistry girdisini de siler: sonraki çağrı kaydı yeniden okur', async () => {
    leanMock.mockResolvedValue({ _id: 'rec1', order: 7, dbConfig: { dbname: 'entegrasyonikClient_7' } });
    await DatabaseManagerInstance.getClientDB(7);
    await ClientDB.invalidate('rec1');
    await DatabaseManagerInstance.getClientDB(7);
    expect(clientModel.findOne).toHaveBeenCalledTimes(2);
    expect(useDb).toHaveBeenCalledTimes(2);
  });

  it('[MEVCUT DAVRANIŞ] Mongo sorgu hatası çağırana olduğu gibi yayılır (yakalanmaz)', async () => {
    leanMock.mockRejectedValueOnce(new Error('query fail'));
    await expect(DatabaseManagerInstance.getClientDB(7)).rejects.toThrow('query fail');
  });

  it('[MEVCUT DAVRANIŞ] ApplicationDB bağlantı hatası çağırana olduğu gibi yayılır', async () => {
    appGetInstance.mockRejectedValueOnce(new Error('app down'));
    await expect(DatabaseManagerInstance.getClientDB(7)).rejects.toThrow('app down');
  });
});

describe('DatabaseManager.getApplicationDB / getAppDbConfig (env şekli)', () => {
  it('[MEVCUT DAVRANIŞ] getApplicationDB, ApplicationDB.getInstance(config) sonucunu döner', async () => {
    await expect(DatabaseManagerInstance.getApplicationDB()).resolves.toBe(appDb);
    expect(appGetInstance).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] config yalnızca DB_URL/DB_USER/DB_PASSWORD/DB_NAME/DB_POOL_SIZE env\'lerinden okunur: {url,user,password,dbname,poolsize}', async () => {
    process.env.DB_URL = 'synthetic-url';
    process.env.DB_USER = 'synthetic-user';
    process.env.DB_PASSWORD = 'synthetic-pass';
    process.env.DB_NAME = 'synthetic-name';
    process.env.DB_POOL_SIZE = '7';
    await DatabaseManagerInstance.getApplicationDB();
    const cfg: any = appGetInstance.mock.calls[0][0];
    expect(Object.keys(cfg).sort()).toEqual(['dbname', 'password', 'poolsize', 'url', 'user']);
    expect(cfg).toEqual({ url: 'synthetic-url', user: 'synthetic-user', password: 'synthetic-pass', dbname: 'synthetic-name', poolsize: 7 });
  });

  it('[MEVCUT DAVRANIŞ] env eksikse string alanlar boş string ("") olur (undefined değil), poolsize 20 varsayılanı', async () => {
    for (const k of ENV_KEYS) delete process.env[k];
    await DatabaseManagerInstance.getApplicationDB();
    expect(appGetInstance.mock.calls[0][0]).toEqual({ url: '', user: '', password: '', dbname: '', poolsize: 20 });
  });

  it.each([['abc', 20], ['0', 20], ['', 20], ['-3', -3], ['12', 12], ['2.5', 2.5]])(
    '[MEVCUT DAVRANIŞ] DB_POOL_SIZE=%p -> poolsize=%p (Number(x) || 20; NaN/0 -> 20, negatif/kesirli geçer)',
    async (raw, expected) => {
      process.env.DB_POOL_SIZE = raw;
      await DatabaseManagerInstance.getApplicationDB();
      expect((appGetInstance.mock.calls[0][0] as any).poolsize).toBe(expected);
    },
  );
});

describe('DatabaseManager.close / closeAllConnections (ADR-0024 D2, BA-03)', () => {
  it('sırayla: tutamaklar bırakılır (tenant close() ÇAĞRILMAZ), tek kök ApplicationDB.close() ile kapatılır; SABİT BEKLEME YOK (sahte zamanlayıcı ilerletilmeden biter)', async () => {
    jest.useFakeTimers();
    leanMock.mockResolvedValue({ _id: 'r1', order: 1, dbConfig: { dbname: 'entegrasyonikClient_9101' } });
    await DatabaseManagerInstance.getClientDB(1);
    leanMock.mockResolvedValue({ _id: 'r2', order: 2, dbConfig: { dbname: 'entegrasyonikClient_9102' } });
    await DatabaseManagerInstance.getClientDB(2);
    expect(clientConns).toHaveLength(2);

    await DatabaseManagerInstance.close();
    expect(clientConns[0].close).not.toHaveBeenCalled();
    expect(clientConns[1].close).not.toHaveBeenCalled();
    expect(appDb.close).toHaveBeenCalledTimes(1);
    expect(ClientDB.size).toBe(0);
  });

  it('eski ad closeAllConnections() takma addır ve idempotenttir (ikinci çağrı aynı sözü döner, kök bir kez kapanır)', async () => {
    const p1 = DatabaseManagerInstance.closeAllConnections();
    const p2 = DatabaseManagerInstance.close();
    expect(p2).toBe(p1);
    await p1;
    expect(appDb.close).toHaveBeenCalledTimes(1);
  });

  it('kapanış sırasında YENİ bağlantı açılmaz: getClientDB/getTenant/getApplicationDB reddedilir; ApplicationDB.getInstance ÇAĞRILMAZ', async () => {
    await DatabaseManagerInstance.close();
    appGetInstance.mockClear();
    await expect(DatabaseManagerInstance.getClientDB(7)).rejects.toThrow('Kapanış başladı');
    await expect(DatabaseManagerInstance.getTenant(7)).rejects.toThrow('Kapanış başladı');
    await expect(DatabaseManagerInstance.getApplicationDB()).rejects.toThrow('Kapanış başladı');
    expect(appGetInstance).not.toHaveBeenCalled();
    expect(useDb).not.toHaveBeenCalled();
  });

  it('beginShutdown() close() çağrılmadan da yeni bağlantıyı reddettirir', async () => {
    DatabaseManagerInstance.beginShutdown();
    expect(DatabaseManagerInstance.isClosing()).toBe(true);
    await expect(DatabaseManagerInstance.getClientDB(7)).rejects.toThrow('Kapanış başladı');
  });

  it('ApplicationDB hiç açılmadıysa (peek undefined) close() bağlantı AÇMAZ ve tamamlanır', async () => {
    appPeek.mockReturnValue(undefined);
    await expect(DatabaseManagerInstance.close()).resolves.toBeUndefined();
    expect(appGetInstance).not.toHaveBeenCalled();
  });

  it('ApplicationDB kapatma hatası yutulur (console.error) ve kapanış yine tamamlanır', async () => {
    appDb.close.mockRejectedValueOnce(new Error('close boom'));
    await expect(DatabaseManagerInstance.close()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

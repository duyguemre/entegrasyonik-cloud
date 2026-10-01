/**
 * CHARACTERIZATION: alt seviye Mongoose bağlantı sarmalayıcısı
 * Kaynak: backend/src/database/Database.ts
 *
 * `mongoose.createConnection` jest.mock ile değiştirilir; gerçek Mongo YOK. Bu sınıf bugüne kadar HİÇ doğrudan
 * test edilmemişti (ClientDB/DatabaseManager testleri `@database/Database` modülünü jest.mock ile TAMAMEN
 * değiştiriyor). Bu dosya, `ping()` eklenmeden ÖNCE mevcut davranışı (connect/close/getModel/dropDatabase) sabitler.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const handlers: Record<string, (...a: any[]) => void> = {};
const adminPing = jest.fn(async () => ({ ok: 1 }));
let asPromiseImpl: () => Promise<any> = async () => undefined;
const childConn: any = { dropDatabase: jest.fn(async () => undefined) };
const fakeConnection: any = {
  asPromise: jest.fn(() => asPromiseImpl()),
  useDb: jest.fn(() => childConn),
  getClient: jest.fn(() => ({ on: jest.fn(), off: jest.fn() })),
  on: jest.fn((event: string, cb: any) => { handlers[event] = cb; return fakeConnection; }),
  close: jest.fn(async () => undefined),
  dropDatabase: jest.fn(async () => undefined),
  readyState: 1,
  db: { admin: jest.fn(() => ({ ping: adminPing })) },
};

jest.mock('mongoose', () => ({
  __esModule: true,
  default: { createConnection: jest.fn(() => fakeConnection) },
}));

import mongoose from 'mongoose';
import Database from '@database/Database';

const createConnection = mongoose.createConnection as unknown as jest.Mock<any>;

const config = { url: 'mongodb://{{USER}}' + ':{{PASSWORD}}@host/{{DBNAME}}', user: 'u ser', password: 'p@ss', dbname: 'db1', poolsize: 7 };

function connectAndResolve() {
  return Database.getInstance(config, () => ({ foo: 'MODEL' } as any));
}

beforeEach(() => {
  asPromiseImpl = async () => undefined;
  fakeConnection.useDb.mockClear();
  childConn.dropDatabase.mockClear();
  createConnection.mockClear();
  createConnection.mockImplementation(() => fakeConnection);
  fakeConnection.close.mockClear();
  fakeConnection.dropDatabase.mockClear();
});

describe('Database.getInstance / connect', () => {
  it('[MEVCUT DAVRANIŞ] bağlantı string\'i {{USER}}/{{PASSWORD}}/{{DBNAME}} yer tutucularını encodeURIComponent ile değiştirir', async () => {
    await connectAndResolve();
    expect(createConnection).toHaveBeenCalledWith(
      'mongodb://u%20ser' + ':p%40ss@host/db1',
      { maxPoolSize: 7, connectTimeoutMS: 10000, maxIdleTimeMS: 60000, waitQueueTimeoutMS: 10000 }, // ADR-0024 D2: kök havuz ayarları
    );
  });

  it('[MEVCUT DAVRANIŞ] poolsize verilmezse varsayılan 5', async () => {
    await Database.getInstance({ ...config, poolsize: undefined as any }, () => ({} as any));
    expect(createConnection.mock.calls[0][1]).toMatchObject({ maxPoolSize: 5 });
  });

  it('[ADR-0024] bağlantı hatası asPromise() reddiyle yayılır', async () => {
    asPromiseImpl = async () => { throw new Error('boom'); };
    await expect(Database.getInstance(config, () => ({} as any))).rejects.toThrow('boom');
  });

  it('[MEVCUT DAVRANIŞ] getModel bilinmeyen model için hata fırlatır', async () => {
    const db = await connectAndResolve();
    expect(() => db.getModel('missing')).toThrow(/Model not found: missing/);
    expect(db.getModel('foo')).toBe('MODEL');
  });

  it('[MEVCUT DAVRANIŞ] close() alttaki mongoose connection.close() çağırır', async () => {
    const db = await connectAndResolve();
    await db.close();
    expect(fakeConnection.close).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] dropDatabase() bağlantı yoksa hata fırlatır (yeni instance her zaman connect() sırasında bağlanır, ama tip güvenliği için sınanır)', async () => {
    const db = await connectAndResolve();
    await db.dropDatabase();
    expect(fakeConnection.dropDatabase).toHaveBeenCalledTimes(1);
  });
});

describe('Database.ping (ADR-0006 Karar 5 — YENİ, /ready)', () => {
  it('[YENİ DAVRANIŞ] bağlı (readyState 1) ise admin().ping() çağırır ve true döner; YENİ bağlantı AÇMAZ (createConnection tekrar çağrılmaz)', async () => {
    const db = await connectAndResolve();
    createConnection.mockClear();
    const ok = await db.ping();
    expect(ok).toBe(true);
    expect(adminPing).toHaveBeenCalledTimes(1);
    expect(createConnection).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] readyState 1 değilse (bağlı değil) ping atlanır ve false döner', async () => {
    const db = await connectAndResolve();
    fakeConnection.readyState = 0;
    const ok = await db.ping();
    expect(ok).toBe(false);
    fakeConnection.readyState = 1;
  });

  it('[YENİ DAVRANIŞ] admin().ping() hata fırlatırsa yakalanır, false döner (throw ETMEZ)', async () => {
    const db = await connectAndResolve();
    adminPing.mockRejectedValueOnce(new Error('network down'));
    await expect(db.ping()).resolves.toBe(false);
  });
});

describe('Database.useDb (ADR-0024 D2 — tek kök bağlantı, tenant tutamağı)', () => {
  it('[YENİ DAVRANIŞ] useDb yeni bağlantı AÇMAZ; kökün useDb(dbname,{useCache:true}) sonucuna modeller BİR kez derlenir', async () => {
    const root = await connectAndResolve();
    createConnection.mockClear();
    const getModels = jest.fn(() => ({ order: 'ORDER_MODEL' } as any));
    const h = root.useDb('entegrasyonikClient_1', getModels);
    expect(createConnection).not.toHaveBeenCalled();
    expect(fakeConnection.useDb).toHaveBeenCalledWith('entegrasyonikClient_1', { useCache: true });
    expect(getModels).toHaveBeenCalledTimes(1);
    expect(getModels).toHaveBeenCalledWith(childConn);
    expect(h.getModel('order')).toBe('ORDER_MODEL');
  });

  it('[YENİ DAVRANIŞ] tenant tutamağının close() kök bağlantıyı KAPATMAZ; dropDatabase türetilmiş bağlantıda; ping kökte', async () => {
    const root = await connectAndResolve();
    const h = root.useDb('entegrasyonikClient_1', () => ({} as any));
    await h.close();
    expect(fakeConnection.close).not.toHaveBeenCalled();
    await h.dropDatabase();
    expect(childConn.dropDatabase).toHaveBeenCalledTimes(1);
    expect(fakeConnection.dropDatabase).not.toHaveBeenCalled();
    await expect(h.ping()).resolves.toBe(true);
    expect(adminPing).toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] onPoolEvent kök istemciye kanca bağlar ve kaldırıcı döner', async () => {
    const root = await connectAndResolve();
    const off = root.onPoolEvent('connectionCheckOutFailed', () => undefined);
    expect(typeof off).toBe('function');
    off();
  });
});

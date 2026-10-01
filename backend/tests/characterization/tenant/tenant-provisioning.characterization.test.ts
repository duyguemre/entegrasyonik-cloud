import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// CHARACTERIZATION (ADR-0003 adım 1, adım 3'te ters çevrildi): tenant oluşturma akışı — SecurityService.register + AdminService.createClient.
// Bu dosyanın önceki hâli (`[MEVCUT DAVRANIŞ]`) eski kodun davranışını sabitlemişti; kasıtlı değişiklikler `[ADR-0003 adım 3]` ile işaretlidir,
// KORUNAN davranışlar (tohum içerikleri, 8 varsayılan entegrasyon) `[MEVCUT DAVRANIŞ - KORUNDU]` etiketiyle aynen durur.
// DB katmanı, Redis ve nodeCache jest ile mock'lanır (DB/Redis/ağ YOK). Değerler sentetiktir; kaynaktaki gömülü kimlik
// bilgisi DEĞERLERİ assert EDİLMEZ (yalnızca varlık/tip).

const appDbRef: any = {};
const tenantDbs: Record<number, any> = {};
const getClientDB = jest.fn(async (id: number) => tenantDbs[id]);

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDbRef,
    getClientDB: (id: number) => getClientDB(id),
  },
}));
jest.mock('@utils/decorator/cache', () => ({ nodeCache: { getStats: () => ({}), keys: () => [] } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => ({}) } }));

import SecurityService from '../../../src/api/rpc/handlers/security-service';
import AdminService from '../../../src/api/rpc/handlers/admin-service';
import { makeCentralDb, makeTenantDb } from './_fakes';

let central: ReturnType<typeof makeCentralDb>;
let tenant: ReturnType<typeof makeTenantDb>;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  getClientDB.mockClear();
  central = makeCentralDb({ clients: [{ order: 4, clientId: 4, status: 'ACTIVE', dbConfig: { dbname: 'entegrasyonikClient_4' } }] });
  tenant = makeTenantDb();
  for (const k of Object.keys(appDbRef)) delete appDbRef[k];
  Object.assign(appDbRef, central.appDb);
  for (let i = 1; i <= 20; i++) tenantDbs[i] = tenant.db;
});
afterEach(() => { jest.restoreAllMocks(); });

async function svcOf<T>(Cls: any, request: any): Promise<T> {
  const s: any = new Cls(undefined, request);
  await s.init();
  return s;
}

const REG = (email: string, extra: any = {}) => ({ registerValues: { name: 'Ad', surname: 'Soyad', email, password: 'plain-pw-1', password2: 'plain-pw-1', ...extra } });
const createdClients = () => central.clientModel.create.mock.calls.map((c: any[]) => c[0]);
const useCentral = (c: ReturnType<typeof makeCentralDb>) => { central = c; for (const k of Object.keys(appDbRef)) delete appDbRef[k]; Object.assign(appDbRef, c.appDb); };

describe('tenant numarası yarışı (BACKLOG C6, L-05/L-06)', () => {
  it('[ADR-0003 adım 3] eşzamanlı iki register ARTIK farklı order ve farklı tenant DB adı alır (Counters atomik $inc; eskiden ikisi de order 5)', async () => {
    const [a, b] = await Promise.all([
      (await svcOf<any>(SecurityService, REG('a@x.y'))).register(),
      (await svcOf<any>(SecurityService, REG('b@x.y'))).register(),
    ]);
    const created = createdClients();
    expect(created).toHaveLength(2);
    expect(created.map((c: any) => c.order).sort()).toEqual([5, 6]); // mevcut max(order)=4 ile çakışma yok
    expect(new Set(created.map((c: any) => c.dbConfig.dbname)).size).toBe(2);
    expect(new Set([a.sessionClaims.tid, b.sessionClaims.tid]).size).toBe(2);
  });

  it('[ADR-0003 adım 3] numara Counters\'tan gelir (_id "tenant_order"); sayaç mevcut max(order) ile $max tohumlanır; numara asla geri gitmez', async () => {
    useCentral(makeCentralDb({ clients: [{ order: 4, clientId: 4, status: 'ACTIVE', dbConfig: { dbname: 'x4' } }], counters: { tenant_order: 1 } })); // sayaç geride
    await (await svcOf<any>(SecurityService, REG('c@x.y'))).register();
    expect(central.counterModel.updateOne).toHaveBeenCalledWith({ _id: 'tenant_order' }, { $max: { sequence_value: 4 } }, { upsert: true });
    expect(central.counterModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: 'tenant_order' }, { $inc: { sequence_value: 1 } }, { new: true, upsert: true });
    expect(createdClients()[0].order).toBe(5);
    expect(central.state.counters.tenant_order).toBe(5);
  });

  it('[ADR-0003 adım 3] sayaç ileride ise (silinmiş tenant numaraları) numara geri gitmez / yeniden kullanılmaz', async () => {
    useCentral(makeCentralDb({ clients: [{ order: 2, clientId: 2, status: 'ACTIVE', dbConfig: { dbname: 'x2' } }], counters: { tenant_order: 9 } }));
    await (await svcOf<any>(SecurityService, REG('e@x.y'))).register();
    expect(createdClients()[0].order).toBe(10);
  });

  it('[ADR-0003 adım 3] hiç client yoksa ilk order 1 olur ($max atlanır, upsert ile sayaç 1\'den başlar)', async () => {
    useCentral(makeCentralDb());
    await (await svcOf<any>(SecurityService, REG('first@x.y'))).register();
    expect(createdClients()[0].order).toBe(1);
    expect(central.counterModel.updateOne).not.toHaveBeenCalled();
  });

  it('[ADR-0003 adım 3] tekil indeks ihlali (E11000) yeni numara ile yeniden denenir', async () => {
    let calls = 0;
    const realCreate = central.clientModel.create.getMockImplementation() as any;
    central.clientModel.create.mockImplementation(async (p: any) => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('E11000'), { code: 11000 });
      return realCreate(p);
    });
    await (await svcOf<any>(SecurityService, REG('d@x.y'))).register();
    expect(calls).toBe(2);
    expect(central.state.clients.filter((c: any) => c.order >= 5)).toHaveLength(1);
    expect(central.state.clients.find((c: any) => c.order >= 5).order).toBe(6); // ilk numara (5) yeniden kullanılmadı
  });
});

describe('iki kopya akış: register / createClient (BACKLOG C6)', () => {
  it('[ADR-0003 adım 3] iki akış ARTIK aynı servisten geçer: kayıt şekli, 8 varsayılan entegrasyon ve tohumlar birebir aynı', async () => {
    await (await svcOf<any>(SecurityService, REG('r@x.y'))).register();
    const r = await (await svcOf<any>(AdminService, { clientData: { title: 'Yeni', name: 'Yeni' }, userData: { name: 'Ad', surname: 'Soyad', email: 's@x.y', password: 'plain-pw-2' } })).createClient();
    const [fromRegister, fromCreate] = createdClients();
    expect(fromRegister.integrations).toEqual(fromCreate.integrations);
    expect(fromRegister.integrations.map((i: any) => i.integrationCode)).toEqual(['trendyol', 'pazarama', 'n11', 'hepsiburada', 'ptt', 'ideasoft', 'bizimhesap', 'gib']);
    expect(Object.keys(fromRegister).sort()).toEqual(Object.keys(fromCreate).filter(k => k !== 'name').sort());
    expect(Object.keys(fromRegister.dbConfig).sort()).toEqual(Object.keys(fromCreate.dbConfig).sort());
    expect(fromRegister.title).toBe('Mağaza Adı 5');
    expect(fromCreate.title).toBe('Yeni');
    expect(r.success).toBe(true);
    expect(tenant.catModel.findOneAndUpdate.mock.calls[0]).toEqual(tenant.catModel.findOneAndUpdate.mock.calls[1]);
    expect(tenant.brandModel.findOneAndUpdate.mock.calls[0]).toEqual(tenant.brandModel.findOneAndUpdate.mock.calls[1]);
  });

  it('[ADR-0003 adım 3] merkezi Users.clientId ARTIK Number (= order); Clients._id (ObjectId) YAZILMAZ (ADR A.2)', async () => {
    await (await svcOf<any>(SecurityService, REG('o@x.y'))).register();
    const u = central.userModel.create.mock.calls[0][0] as any;
    expect(u.clientId).toBe(5);
    expect(u.order).toBe(5);
  });

  it('[ADR-0003 adım 3] createClient yanıtı Clients kaydını DTO olarak döner: dbConfig ve depolama anahtarları YOK', async () => {
    const r: any = await (await svcOf<any>(AdminService, { clientData: { title: 'Y' }, userData: { name: 'A', surname: 'B', email: 'n@x.y', password: 'plain-pw-3' } })).createClient();
    expect(r.client.order).toBe(5);
    expect(r.client.status).toBe('ACTIVE');
    expect(r.client.dbConfig).toBeUndefined();
    expect(r.client.archive?.secretAccessKey).toBeUndefined();
    expect(r.client.archive?.accessKeyId).toBeUndefined();
    expect(r.client.provisioning).toBeUndefined();
  });

  it('[ADR-0003 adım 3] createClient: istemci clientData/userData ALANLARI modele yayılmaz (order/status/isGlobalAdmin/roleCode/dbConfig sunucudan)', async () => {
    await (await svcOf<any>(AdminService, {
      clientData: { title: 'Y', order: 999, status: 'PASSIVE', dbConfig: { dbname: 'baska_db' }, clientId: 999 },
      userData: { name: 'A', surname: 'B', email: 'n2@x.y', password: 'plain-pw-3', isGlobalAdmin: true, roleCode: 'ROLE_ADMIN', owner: false },
    })).createClient();
    const cp = createdClients()[0];
    expect(cp).toMatchObject({ title: 'Y', order: 5, clientId: 5, status: 'PROVISIONING' });
    expect(cp.dbConfig.dbname).toBe('entegrasyonikClient_5');
    const up = central.userModel.create.mock.calls[0][0] as any;
    expect(up).toMatchObject({ owner: true, isGlobalAdmin: false, roleCode: 'ROLE_OWNER' });
  });

  it('[ADR-0003 adım 3] createClient: FE\'nin gönderdiği fullName son sözcüğe göre ad/soyada ayrılır', async () => {
    await (await svcOf<any>(AdminService, { clientData: { name: 'M' }, userData: { fullName: 'Ali Can Yılmaz', email: 'fn@x.y', password: 'plain-pw-4' } })).createClient();
    expect(central.userModel.create.mock.calls[0][0]).toMatchObject({ name: 'Ali Can', surname: 'Yılmaz' });
  });
});

describe('tohum içerikleri (varsayılan kategori/marka/entegrasyon listesi AYNEN korunmalı)', () => {
  it('[MEVCUT DAVRANIŞ - KORUNDU] ana kategori: filtre {isMain:true}, upsert; içerik parentId 0 / "Ana Kategori" / mdi-shape / order 1', async () => {
    await (await svcOf<any>(SecurityService, REG('t1@x.y'))).register();
    expect(tenant.catModel.findOneAndUpdate).toHaveBeenCalledWith(
      { isMain: true },
      { parentId: 0, title: 'Ana Kategori', isMain: true, icon: 'mdi-shape', order: 1 },
      { upsert: true },
    );
  });

  it('[MEVCUT DAVRANIŞ - KORUNDU] ana marka: filtre {isMain:true}, upsert; içerik "Genel"', async () => {
    await (await svcOf<any>(SecurityService, REG('t2@x.y'))).register();
    expect(tenant.brandModel.findOneAndUpdate).toHaveBeenCalledWith({ isMain: true }, { title: 'Genel', isMain: true }, { upsert: true });
  });

  it('[MEVCUT DAVRANIŞ - KORUNDU] tenant ClientIntegrations tohumu: 5 tip, sıra numaraları 1..8, hepsi status:true, settings {test:1}', async () => {
    await (await svcOf<any>(SecurityService, REG('t3@x.y'))).register();
    const seed = tenant.ciModel.create.mock.calls[0][0] as any;
    expect(Object.keys(seed)).toEqual(['marketplace', 'shipment', 'ecommerce', 'erp', 'einvoice']);
    const flat = Object.values(seed).flat() as any[];
    expect(flat.map(i => [i.order, i.code])).toEqual([
      [1, 'trendyol'], [2, 'pazarama'], [3, 'n11'], [4, 'hepsiburada'], [5, 'ptt'], [6, 'ideasoft'], [7, 'bizimhesap'], [8, 'gib'],
    ]);
    expect(flat.every(i => i.status === true && JSON.stringify(i.settings) === '{"test":1}')).toBe(true);
  });

  it('[ADR-0003 adım 3] ClientIntegrations tohumu ARTIK idempotent: kayıt zaten varsa yeniden oluşturulmaz (eskiden create her seferinde)', async () => {
    await (await svcOf<any>(SecurityService, REG('t3b@x.y'))).register();
    await (await svcOf<any>(SecurityService, REG('t3c@x.y'))).register();
    // fake tenant DB iki kayıt için aynı (paylaşımlı) koleksiyondur: ikinci provision tohumu tekrar eklemez
    expect(tenant.ciModel.create).toHaveBeenCalledTimes(1);
  });

  it('[ADR-0003 adım 3] tenant içi kullanıcı (owner) ARTIK tohumlanır: upsert by e-posta, owner:true, ROLE_OWNER, merkezle aynı parola özeti (eskiden yalnızca merkezi Users)', async () => {
    await (await svcOf<any>(SecurityService, REG('T4@X.Y'))).register();
    expect(tenant.tenantUserModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = tenant.tenantUserModel.findOneAndUpdate.mock.calls[0] as any[];
    expect(filter).toEqual({ email: 't4@x.y' });
    expect(opts).toEqual({ upsert: true });
    expect(update.$setOnInsert).toMatchObject({ email: 't4@x.y', roleCode: 'ROLE_OWNER', owner: true, isActive: true });
    expect(update.$setOnInsert.password).toBe(central.state.users[0].password);
  });

  it('[ADR-0003 adım 3] Clients.status önce PROVISIONING yazılır, tüm adımlardan sonra ACTIVE olur; provisioning yardımcı alanı temizlenir', async () => {
    await (await svcOf<any>(SecurityService, REG('t5@x.y'))).register();
    expect(createdClients()[0].status).toBe('PROVISIONING');
    const stored = central.state.clients.find((c: any) => c.order === 5);
    expect(stored.status).toBe('ACTIVE');
    expect(stored.provisioning).toBeUndefined();
  });

  it('[ADR-0003 adım 3] adım hatasında Clients kaydı PROVISIONING_FAILED olur (yetim ACTIVE tenant kalmaz), kullanıcıya iç ayrıntı sızmayan 500 döner', async () => {
    central.userModel.create.mockImplementation(async () => { throw new Error('boom mongodb://gizli-ayrinti'); });
    const err: any = await (await svcOf<any>(SecurityService, REG('t6@x.y'))).register().catch((e: any) => e);
    expect(err.statusCode).toBe(500);
    expect(String(err.message)).not.toContain('boom');
    expect(String(err.message)).not.toContain('mongodb');
    const stored = central.state.clients.find((c: any) => c.order === 5);
    expect(stored.status).toBe('PROVISIONING_FAILED');
    expect(stored.provisioning.failedStep).toBe('central-user');
  });

  it('[ADR-0003 adım 3] aynı e-postayla ikinci kayıt REDDEDİLİR (409); büyük/küçük harf farkı yok sayılır; ikinci tenant/kullanıcı oluşmaz', async () => {
    await (await svcOf<any>(SecurityService, REG('dup@x.y'))).register();
    const err: any = await (await svcOf<any>(SecurityService, REG('DUP@x.y '))).register().catch((e: any) => e);
    expect(err.statusCode).toBe(409);
    expect(central.state.users.filter((u: any) => u.email === 'dup@x.y')).toHaveLength(1);
    expect(central.state.clients.filter((c: any) => c.order >= 5)).toHaveLength(1);
  });

  it('[ADR-0003 adım 3] eşzamanlı aynı e-posta: tekil indeks (E11000) ikincisini reddeder', async () => {
    const results = await Promise.allSettled([
      (await svcOf<any>(SecurityService, REG('race@x.y'))).register(),
      (await svcOf<any>(SecurityService, REG('race@x.y'))).register(),
    ]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(central.state.users.filter((u: any) => u.email === 'race@x.y')).toHaveLength(1);
  });
});

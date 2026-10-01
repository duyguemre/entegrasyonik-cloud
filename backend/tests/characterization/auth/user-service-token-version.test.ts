import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// [ADR-0001 adım 6/7] UserService: parola değişimi, rol değişimi ve kullanıcı silme merkezi Users.tokenVersion'ı $inc:1 yapar (oturum iptali);
// kullanıcı ekleme/silme/parola/rol değişimi audit'lenir. DB katmanı jest ile mock'lanır; parolalar sahte test değerleridir.
//
// Bilinen hatalar (KAPSAM DIŞI, yalnızca sabitlenir; BACKLOG'a yazıldı):
//  - updateUser'ın merkezi filtresi YENİ e-postayı kullanır (eski e-posta yerine) -> e-posta değişince merkezi kayıt eşleşmez
//  - merkezi filtre clientId'yi Number ile eşler; register'ın oluşturduğu owner'ın merkezi clientId'si ObjectId'dir -> owner kaydı eşleşmez
//  - roleCode gövdeden serbest atanabilir (ADR-0003) -> [WP-A0] artık çağıranın kademesiyle sınırlı (user-service-target-rules.test.ts)
// [WP-A0, ADR-0028] updateUser artık parola YAZMAZ (403), hedef bulunamazsa 404, audit meta hedef/eski-yeni rol taşır.

const appDb: any = {};
const clientDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDb,
    getClientDB: async (_id: number) => clientDb,
  },
}));

import UserService from '../../../src/api/services/user-service';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';

const OID = '507f1f77bcf86cd799439011';
let centralFindOne: jest.Mock<(...a: any[]) => any>, centralUpdate: jest.Mock<(...a: any[]) => any>, centralDelete: jest.Mock<(...a: any[]) => any>, centralCreate: jest.Mock<(...a: any[]) => any>;
let clientUpdate: jest.Mock<(...a: any[]) => any>, clientFindOne: jest.Mock<(...a: any[]) => any>, clientDelete: jest.Mock<(...a: any[]) => any>, clientCreate: jest.Mock<(...a: any[]) => any>;
let records: any[];
const flush = () => new Promise(r => setImmediate(r));

beforeEach(() => {
  records = [];
  AuditLogger.setSink(async (r) => { records.push(r); });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  centralUpdate = jest.fn(async () => ({}));
  centralFindOne = jest.fn(async () => ({ reauthAt: new Date(), email: 'staff@x.y', order: 4, owner: false, roleCode: 'ROLE_OPERATOR' }));
  centralDelete = jest.fn(async () => ({}));
  centralCreate = jest.fn(async () => ({}));
  clientUpdate = jest.fn(async () => ({}));
  clientDelete = jest.fn(async () => ({}));
  clientCreate = jest.fn(async (p: any) => p);
  clientFindOne = jest.fn(async () => ({ _id: OID, email: 'staff@x.y', roleCode: 'ROLE_OPERATOR' }));
  Object.assign(appDb, { getUserModel: () => ({ updateOne: centralUpdate, deleteOne: centralDelete, create: centralCreate, findOne: centralFindOne, countDocuments: async () => 2 }) });
  Object.assign(clientDb, { getUserModel: () => ({ updateOne: clientUpdate, findOne: clientFindOne, deleteOne: clientDelete, create: clientCreate }) });
});
afterEach(() => { AuditLogger.setSink(undefined); jest.restoreAllMocks(); });

const PRINCIPAL = { sub: 'owner1', tid: 4, ga: false, tv: 0, imp: false };
const USER_CONTEXT = { email: 'owner@x.y', roleCode: 'ROLE_OWNER', owner: true, order: 4 };
async function svc(request: any) {
  const s: any = new UserService(4, { ...request, principal: PRINCIPAL, userContext: USER_CONTEXT, requestMeta: { ip: '203.0.113.5' } });
  await s.init();
  return s;
}

describe('UserService.updateUser: tokenVersion artışı (oturum iptali)', () => {
  it('parola bu uçtan yazılamaz (403; A-01/A-04); hiçbir güncelleme yapılmaz', async () => {
    const s = await svc({ user: { _id: OID, name: 'A', surname: 'B', email: 'staff@x.y', roleCode: 'ROLE_OPERATOR', password: 'Correct-Horse-Battery-9' } });
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(centralUpdate).not.toHaveBeenCalled();
    expect(clientUpdate).not.toHaveBeenCalled();
  });

  it('roleCode değişimi (ClientDB\'deki mevcut kayıtla karşılaştırılır) tokenVersion\'ı artırır', async () => {
    const s = await svc({ user: { _id: OID, name: 'A', surname: 'B', email: 'staff@x.y', roleCode: 'ROLE_ADMIN' } });
    await s.updateUser();
    expect(centralUpdate.mock.calls[0][1].$inc).toEqual({ tokenVersion: 1 });
  });

  it('parola ve rol DEĞİŞMEDEN yapılan güncelleme (yalnızca ad-soyad) tokenVersion\'ı ARTIRMAZ (gereksiz oturum düşmez)', async () => {
    const s = await svc({ user: { _id: OID, name: 'Yeni', surname: 'Ad', email: 'staff@x.y', roleCode: 'ROLE_OPERATOR' } });
    await s.updateUser();
    expect(centralUpdate.mock.calls[0][1].$inc).toBeUndefined();
    expect(records.map(r => r.event)).toEqual([]);
  });

  it('mevcut kayıt bulunamazsa 404 (eskiden temkinli iptalle yazılıyordu); hiçbir şey yazılmaz', async () => {
    clientFindOne.mockImplementation(async () => null);
    const s = await svc({ user: { _id: OID, name: 'A', surname: 'B', email: 'staff@x.y', roleCode: 'ROLE_OPERATOR' } });
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 404 });
    expect(centralUpdate).not.toHaveBeenCalled();
  });

  it('ClientDB kaydı da güncellenir ve $inc ClientDB güncellemesine EKLENMEZ (tokenVersion yalnızca merkezi Users\'ta)', async () => {
    const s = await svc({ user: { _id: OID, name: 'A', surname: 'B', email: 'staff@x.y', roleCode: 'ROLE_ADMIN' } });
    await s.updateUser();
    expect(clientUpdate).toHaveBeenCalledTimes(1);
    expect(clientUpdate.mock.calls[0][1].$inc).toBeUndefined();
  });

  it('başkasının e-postası değiştirilemez (403; WP-A0). [BİLİNEN HATA] kendi e-postasında merkezi filtre YENİ e-postayı kullanır — kapsam dışı', async () => {
    const s = await svc({ user: { _id: OID, name: 'A', surname: 'B', email: 'yeni@x.y', roleCode: 'ROLE_ADMIN' } });
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('audit: rol değişimi -> user.role_change (hedef + eski/yeni rol); sub/tid principal ve requestMeta kaynaklı sub/tid/ip; e-posta/parola/hash YOK', async () => {
    const s = await svc({ user: { _id: OID, name: 'A', surname: 'B', email: 'staff@x.y', roleCode: 'ROLE_ADMIN' } });
    await s.updateUser();
    await flush();
    expect(records.map(r => r.event)).toEqual(['user.role_change']);
    for (const r of records) {
      expect(r).toMatchObject({ result: 'ok', sub: 'owner1', tid: 4, ip: '203.0.113.5' });
      expect(JSON.stringify(r)).not.toMatch(/staff@x\.y|\$2/);
    }
    expect(records[0].meta).toEqual({ roleCode: 'ROLE_ADMIN', fromRole: 'ROLE_OPERATOR', toRole: 'ROLE_ADMIN', targetUserId: OID });
  });

  it('audit yazımı başarısız olsa bile işlem tamamlanır (best-effort)', async () => {
    AuditLogger.setSink(async () => { throw new Error('audit down'); });
    const s = await svc({ user: { _id: OID, name: 'A', surname: 'B', email: 'staff@x.y', roleCode: 'ROLE_ADMIN' } });
    await expect(s.updateUser()).resolves.toBe(true);
    await flush();
    expect(centralUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('UserService.deleteUser: tokenVersion artışı + audit', () => {
  it('silmeden ÖNCE merkezi kullanıcının tokenVersion\'ı $inc:1 yapılır, sonra merkezi kayıt silinir (ClientDB\'den de silinir)', async () => {
    const order: string[] = [];
    centralUpdate.mockImplementation(async () => { order.push('inc'); return {}; });
    centralDelete.mockImplementation(async () => { order.push('delete'); return {}; });
    const s = await svc({ userId: OID });
    await expect(s.deleteUser()).resolves.toBe(true);
    expect(order).toEqual(['inc', 'delete']);
    expect(centralUpdate.mock.calls[0]).toEqual([{ email: 'staff@x.y', clientId: 4 }, { $inc: { tokenVersion: 1 } }]);
    expect(centralDelete.mock.calls[0][0]).toEqual({ email: 'staff@x.y', clientId: 4 });
    expect(clientDelete).toHaveBeenCalledTimes(1);
  });

  it('audit: user.delete (sub/tid/ip; silinen kullanıcının e-postası YOK)', async () => {
    const s = await svc({ userId: OID });
    await s.deleteUser();
    await flush();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ event: 'user.delete', result: 'ok', sub: 'owner1', tid: 4, ip: '203.0.113.5' });
    expect(JSON.stringify(records[0])).not.toContain('staff@x.y');
  });

  it('kullanıcı bulunamazsa hiçbir şey yazılmaz/artırılmaz/audit\'lenmez ve true döner (mevcut davranış)', async () => {
    clientFindOne.mockImplementation(async () => null);
    const s = await svc({ userId: OID });
    await expect(s.deleteUser()).resolves.toBe(true);
    expect(centralUpdate).not.toHaveBeenCalled();
    expect(centralDelete).not.toHaveBeenCalled();
    await flush();
    expect(records).toHaveLength(0);
  });
});

describe('UserService.createUser: audit', () => {
  it('audit: user.create (yalnızca sub/tid/ip + roleCode meta); parola/e-posta YOK; merkezi kayıt owner:false ve tokenVersion set edilmez (varsayılan 0)', async () => {
    const s = await svc({ user: { name: 'A', surname: 'B', email: 'new@x.y', roleCode: 'ROLE_OPERATOR', password: 'Correct-Horse-Battery-9' } });
    await expect(s.createUser()).resolves.toBe(true);
    await flush();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ event: 'user.create', result: 'ok', sub: 'owner1', tid: 4, ip: '203.0.113.5', meta: { roleCode: 'ROLE_OPERATOR' } });
    expect(JSON.stringify(records[0])).not.toMatch(/new@x\.y|Correct-Horse|\$2/);
    expect(centralCreate.mock.calls[0][0]).toMatchObject({ owner: false, clientId: 4 });
    expect('tokenVersion' in centralCreate.mock.calls[0][0]).toBe(false);
  });

  it('kayıt başarısızsa (ClientDB hatası) audit YAZILMAZ ve hata fırlar', async () => {
    clientCreate.mockImplementation(async () => { throw new Error('dup'); });
    const s = await svc({ user: { name: 'A', surname: 'B', email: 'new@x.y', roleCode: 'ROLE_OPERATOR', password: 'Correct-Horse-Battery-9' } });
    await expect(s.createUser()).rejects.toThrow('dup');
    await flush();
    expect(records).toHaveLength(0);
  });
});

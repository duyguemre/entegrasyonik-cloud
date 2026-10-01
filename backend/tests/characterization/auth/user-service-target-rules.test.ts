import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// [ADR-0028 WP-A0 / denetim A-01, A-02, A-04] UserService hedef-kullanıcı kuralları. DB katmanı mock'lanır; parolalar sahte test değerleridir.
// Bu test bugünkü açıkları (admin -> owner devralma, owner silme, 50+ karakter düz metin parola...) kanıtlayan senaryolardır; düzeltme sonrası YEŞİLdir.

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
import { isBcryptHash } from '../../../src/operations/users/userRules';

const TARGET_ID = '507f1f77bcf86cd799439011';
type Fn = jest.Mock<(...a: any[]) => any>;
let centralUpdate: Fn, centralDelete: Fn, centralCreate: Fn, centralFindOne: Fn, centralCount: Fn;
let clientUpdate: Fn, clientFindOne: Fn, clientDelete: Fn, clientCreate: Fn;
let records: any[];
const flush = () => new Promise(r => setImmediate(r));

// Hedef varsayılanı: sıradan operatör
let targetTenantDoc: any, targetCentralDoc: any;

beforeEach(() => {
  records = [];
  AuditLogger.setSink(async (r) => { records.push(r); });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  targetTenantDoc = { _id: TARGET_ID, email: 'staff@x.y', roleCode: 'ROLE_OPERATOR' };
  targetCentralDoc = { reauthAt: new Date(), email: 'staff@x.y', order: 4, owner: false, roleCode: 'ROLE_OPERATOR' };
  centralUpdate = jest.fn(async () => ({}));
  centralDelete = jest.fn(async () => ({}));
  centralCreate = jest.fn(async () => ({}));
  centralFindOne = jest.fn(async () => targetCentralDoc);
  centralCount = jest.fn(async () => 2);
  clientUpdate = jest.fn(async () => ({}));
  clientDelete = jest.fn(async () => ({}));
  clientCreate = jest.fn(async (p: any) => ({ ...p, _id: 'newid' }));
  clientFindOne = jest.fn(async () => targetTenantDoc);
  Object.assign(appDb, { getUserModel: () => ({ updateOne: centralUpdate, deleteOne: centralDelete, create: centralCreate, findOne: centralFindOne, countDocuments: centralCount }) });
  Object.assign(clientDb, { getUserModel: () => ({ updateOne: clientUpdate, findOne: clientFindOne, deleteOne: clientDelete, create: clientCreate }) });
});
afterEach(() => { AuditLogger.setSink(undefined); jest.restoreAllMocks(); });

const ADMIN = { userContext: { email: 'admin@x.y', roleCode: 'ROLE_ADMIN', owner: false, order: 4 }, principal: { sub: 'a1', tid: 4, ga: false, tv: 0, imp: false } };
const OWNER = { userContext: { email: 'owner2@x.y', roleCode: 'ROLE_OWNER', owner: true, order: 4 }, principal: { sub: 'o1', tid: 4, ga: false, tv: 0, imp: false } };

async function svc(actor: any, request: any) {
  const s: any = new UserService(4, { ...request, ...actor, requestMeta: { ip: '203.0.113.5' } });
  await s.init();
  return s;
}
const asOwnerTarget = () => {
  targetTenantDoc = { _id: TARGET_ID, email: 'owner@x.y', roleCode: 'ROLE_OWNER' };
  targetCentralDoc = { reauthAt: new Date(), email: 'owner@x.y', order: 4, owner: true, roleCode: 'ROLE_OWNER' };
};
const upd = (over: any = {}) => ({ user: { _id: TARGET_ID, name: 'A', surname: 'B', email: 'staff@x.y', roleCode: 'ROLE_OPERATOR', ...over } });
const STRONG = 'Correct-Horse-Battery-9';

describe('updateUser: A-01 hedef-kullanıcı kuralları', () => {
  it('admin, sahibin parolasını yazamaz (hesap devralma kapatıldı) ve hiçbir şey yazılmaz', async () => {
    asOwnerTarget();
    const s = await svc(ADMIN, upd({ email: 'owner@x.y', roleCode: 'ROLE_OWNER', password: STRONG }));
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(clientUpdate).not.toHaveBeenCalled();
    expect(centralUpdate).not.toHaveBeenCalled();
  });

  it('admin, sahibe hiçbir yazma yapamaz (yalnız ad değişikliği bile)', async () => {
    asOwnerTarget();
    const s = await svc(ADMIN, upd({ email: 'owner@x.y', roleCode: 'ROLE_OWNER', name: 'Hack' }));
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(centralUpdate).not.toHaveBeenCalled();
  });

  it('admin, sahibin e-postasını değiştiremez', async () => {
    asOwnerTarget();
    const s = await svc(ADMIN, upd({ email: 'evil@x.y', roleCode: 'ROLE_OWNER' }));
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(centralUpdate).not.toHaveBeenCalled();
  });

  it('başkasının parolası hiçbir aktör tarafından (sahip dahil) yazılamaz; kendi parolası da bu uçtan yazılamaz', async () => {
    for (const actor of [ADMIN, OWNER]) {
      const s = await svc(actor, upd({ password: STRONG }));
      await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
    }
    const self = await svc({ ...ADMIN, userContext: { ...ADMIN.userContext, email: 'staff@x.y' } }, upd({ password: STRONG }));
    await expect(self.updateUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(centralUpdate).not.toHaveBeenCalled();
  });

  it('başkasının e-postası yazılamaz; kendi e-postası engellenmez', async () => {
    const s = await svc(ADMIN, upd({ email: 'other@x.y' }));
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
    const self = await svc({ ...ADMIN, userContext: { ...ADMIN.userContext, email: 'staff@x.y' } }, upd({ email: 'staff@x.y', name: 'Yeni' }));
    await expect(self.updateUser()).resolves.toBe(true);
  });

  it('admin, sahip kademesini yükseltemez: roleCode üst kademeye yalnız kendi tavanı kadar verilir (admin -> ROLE_ADMIN serbest)', async () => {
    const s = await svc(ADMIN, upd({ roleCode: 'ROLE_ADMIN' }));
    await expect(s.updateUser()).resolves.toBe(true);
  });

  it('member (kademesi düşük) çağıran admin rolü veremez (tavan)', async () => {
    const member = { ...ADMIN, userContext: { ...ADMIN.userContext, roleCode: 'ROLE_OPERATOR' } };
    const s = await svc(member, upd({ roleCode: 'ROLE_ADMIN' }));
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(centralUpdate).not.toHaveBeenCalled();
  });

  it('kişi kendi rolünü değiştiremez', async () => {
    const self = { ...ADMIN, userContext: { ...ADMIN.userContext, email: 'staff@x.y' } };
    const s = await svc(self, upd({ roleCode: 'ROLE_ADMIN' }));
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('sahip, başka sahibin rolünü düşürebilir (2 aktif sahip) ve tokenVersion artar; audit hedef + eski/yeni rol içerir', async () => {
    asOwnerTarget();
    const s = await svc(OWNER, upd({ email: 'owner@x.y', roleCode: 'ROLE_ADMIN' }));
    await expect(s.updateUser()).resolves.toBe(true);
    expect(centralUpdate.mock.calls[0][1].$inc).toEqual({ tokenVersion: 1 });
    await flush();
    const rec = records.find(r => r.event === 'user.role_change');
    expect(rec.meta).toMatchObject({ fromRole: 'ROLE_OWNER', toRole: 'ROLE_ADMIN', targetUserId: TARGET_ID });
  });

  it('son sahip düşürülemez (409)', async () => {
    asOwnerTarget();
    centralCount.mockImplementation(async () => 1);
    const s = await svc(OWNER, upd({ email: 'owner@x.y', roleCode: 'ROLE_ADMIN' }));
    await expect(s.updateUser()).rejects.toMatchObject({ statusCode: 409 });
    expect(centralUpdate).not.toHaveBeenCalled();
  });

  it('hedef bu tenant\'ta yoksa 404; başka tenant\'a ait merkezi kayıt hedef sayılmaz', async () => {
    clientFindOne.mockImplementation(async () => null);
    await expect((await svc(ADMIN, upd())).updateUser()).rejects.toMatchObject({ statusCode: 404 });
    clientFindOne.mockImplementation(async () => targetTenantDoc);
    targetCentralDoc = { ...targetCentralDoc, order: 99 };
    await expect((await svc(ADMIN, upd())).updateUser()).rejects.toMatchObject({ statusCode: 404 });
  });

  it('impersonation (imp:true) sırasında kullanıcı yazımı yasak', async () => {
    const imp = { userContext: ADMIN.userContext, principal: { ...ADMIN.principal, imp: true, ga: true } };
    await expect((await svc(imp, upd({ name: 'Yeni' }))).updateUser()).rejects.toMatchObject({ statusCode: 403 });
    await expect((await svc(imp, { user: { name: 'A', surname: 'B', email: 'n@x.y', roleCode: 'ROLE_OPERATOR', password: STRONG } })).createUser()).rejects.toMatchObject({ statusCode: 403 });
    await expect((await svc(imp, { userId: TARGET_ID })).deleteUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(clientUpdate).not.toHaveBeenCalled();
    expect(clientDelete).not.toHaveBeenCalled();
    expect(clientCreate).not.toHaveBeenCalled();
  });
});

describe('deleteUser: A-02 sahip koruması', () => {
  it('admin sahibi silemez', async () => {
    asOwnerTarget();
    await expect((await svc(ADMIN, { userId: TARGET_ID })).deleteUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(clientDelete).not.toHaveBeenCalled();
    expect(centralDelete).not.toHaveBeenCalled();
  });

  it('kişi kendini silemez', async () => {
    const self = { ...ADMIN, userContext: { ...ADMIN.userContext, email: 'staff@x.y' } };
    await expect((await svc(self, { userId: TARGET_ID })).deleteUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(clientDelete).not.toHaveBeenCalled();
  });

  it('son sahip (başka sahip bile olsa sayı 1 ise) silinemez (409); iki sahip varsa başka sahip silebilir', async () => {
    asOwnerTarget();
    centralCount.mockImplementation(async () => 1);
    await expect((await svc(OWNER, { userId: TARGET_ID })).deleteUser()).rejects.toMatchObject({ statusCode: 409 });
    expect(clientDelete).not.toHaveBeenCalled();
    centralCount.mockImplementation(async () => 2);
    await expect((await svc(OWNER, { userId: TARGET_ID })).deleteUser()).resolves.toBe(true);
    expect(clientDelete).toHaveBeenCalledTimes(1);
  });

  it('admin sıradan personeli silebilir; audit hedef kullanıcı + rol içerir', async () => {
    await expect((await svc(ADMIN, { userId: TARGET_ID })).deleteUser()).resolves.toBe(true);
    await flush();
    expect(records[0].meta).toMatchObject({ targetUserId: TARGET_ID, targetRole: 'ROLE_OPERATOR' });
  });
});

describe('createUser / A-04: parola özeti ve politika', () => {
  const create = (over: any = {}) => ({ user: { name: 'A', surname: 'B', email: 'new@x.y', roleCode: 'ROLE_OPERATOR', password: STRONG, ...over } });

  it('50+ karakterlik parola düz metin SAKLANMAZ: bcrypt ile özetlenir (hem tenant hem merkezi kayıt)', async () => {
    const long = 'Uzun-Parola-Cumlesi-Uzun-Parola-Cumlesi-9x'.padEnd(60, 'k').slice(0, 64);
    expect(long.length).toBeGreaterThanOrEqual(50);
    await (await svc(ADMIN, create({ password: long }))).createUser();
    expect(isBcryptHash(clientCreate.mock.calls[0][0].password)).toBe(true);
    expect(isBcryptHash(centralCreate.mock.calls[0][0].password)).toBe(true);
    expect(JSON.stringify(centralCreate.mock.calls[0][0])).not.toContain(long);
  });

  it('hazır bcrypt özeti parola olarak KABUL EDİLMEZ; zayıf parola WEAK_PASSWORD (400)', async () => {
    const fakeHash = '$2b$10$' + 'a'.repeat(53);
    await expect((await svc(ADMIN, create({ password: fakeHash }))).createUser()).rejects.toMatchObject({ statusCode: 400 });
    await expect((await svc(ADMIN, create({ password: 'kisa1' }))).createUser()).rejects.toMatchObject({ statusCode: 400, code: 'WEAK_PASSWORD' });
    expect(clientCreate).not.toHaveBeenCalled();
  });

  it('admin, kendi kademesinden yüksek rol vermez: member çağıran ROLE_ADMIN kullanıcı ekleyemez', async () => {
    const member = { ...ADMIN, userContext: { ...ADMIN.userContext, roleCode: 'ROLE_OPERATOR' } };
    await expect((await svc(member, create({ roleCode: 'ROLE_ADMIN' }))).createUser()).rejects.toMatchObject({ statusCode: 403 });
    expect(clientCreate).not.toHaveBeenCalled();
  });

  it('isBcryptHash: gerçek biçim (60 karakter) evet; 50+ düz metin hayır', () => {
    expect(isBcryptHash('$2a$10$' + 'A'.repeat(53))).toBe(true);
    expect(isBcryptHash('$2y$12$' + '1'.repeat(53))).toBe(true);
    expect(isBcryptHash('x'.repeat(60))).toBe(false);
    expect(isBcryptHash('p'.repeat(70))).toBe(false);
    expect(isBcryptHash(undefined)).toBe(false);
  });
});

// [ADR-0028 WP-A5 / Karar 8] Adım-yükseltmesi: admin rolü verme (createUser/updateUser) + sahip olmayanı kaldırma. Rol DÜŞÜRME / ad güncelleme step-up istemez.
describe('WP-A5 step-up: admin rolü verme ve sahip olmayanı kaldırma', () => {
  const noReauth = () => { delete targetCentralDoc.reauthAt; };
  const stale = () => { targetCentralDoc.reauthAt = new Date(Date.now() - 5 * 60 * 1000 - 1000); };

  it('updateUser operator -> ROLE_ADMIN: reauth yok/eski -> 401 REAUTH_REQUIRED ve hiçbir yazma yok; pencere içinde başarılı', async () => {
    noReauth();
    await expect((await svc(OWNER, upd({ roleCode: 'ROLE_ADMIN' }))).updateUser()).rejects.toMatchObject({ statusCode: 401, code: 'REAUTH_REQUIRED' });
    stale();
    await expect((await svc(OWNER, upd({ roleCode: 'ROLE_ADMIN' }))).updateUser()).rejects.toMatchObject({ statusCode: 401, code: 'REAUTH_REQUIRED' });
    expect(clientUpdate).not.toHaveBeenCalled();
    expect(centralUpdate).not.toHaveBeenCalled();
    targetCentralDoc.reauthAt = new Date();
    await expect((await svc(OWNER, upd({ roleCode: 'ROLE_ADMIN' }))).updateUser()).resolves.toBe(true);
    expect(centralUpdate.mock.calls[0][1].$inc).toEqual({ tokenVersion: 1 }); // rol değişimi: hedefin eski oturumları düşer
  });

  it('operator rolüne yazma / yalnız ad güncelleme step-up İSTEMEZ', async () => {
    noReauth();
    await expect((await svc(OWNER, upd({ name: 'Yeni' }))).updateUser()).resolves.toBe(true);
  });

  it('createUser ROLE_ADMIN step-up ister; operator istemez', async () => {
    noReauth();
    const mk = (roleCode: string) => ({ user: { name: 'A', surname: 'B', email: 'n@x.y', roleCode, password: STRONG } });
    await expect((await svc(OWNER, mk('ROLE_ADMIN'))).createUser()).rejects.toMatchObject({ statusCode: 401, code: 'REAUTH_REQUIRED' });
    expect(clientCreate).not.toHaveBeenCalled();
    await expect((await svc(OWNER, mk('ROLE_OPERATOR'))).createUser()).resolves.toBe(true);
  });

  it('deleteUser: sahip olmayan hedef için step-up (401, silme yok); sahip hedefte ADR gereği aranmaz (yalnız sahip zaten dokunabilir)', async () => {
    noReauth();
    await expect((await svc(ADMIN, { userId: TARGET_ID })).deleteUser()).rejects.toMatchObject({ statusCode: 401, code: 'REAUTH_REQUIRED' });
    expect(clientDelete).not.toHaveBeenCalled();
    expect(centralDelete).not.toHaveBeenCalled();
    targetCentralDoc.reauthAt = new Date();
    await expect((await svc(ADMIN, { userId: TARGET_ID })).deleteUser()).resolves.toBe(true);
    expect(centralDelete).toHaveBeenCalled();
  });
});

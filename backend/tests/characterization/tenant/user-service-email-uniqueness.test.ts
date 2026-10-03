import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ADR-0003 A.2: merkezi Users.email tekil indeksi (E11000) UserService.createUser'da ham Mongo mesajı yerine 409 olarak yüzeye çıkar.
// DB sahte; gerçek DB/ağ YOK.

const appDb: any = {};
const clientDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => clientDb },
}));

import UserService from '../../../src/api/services/user-service';

const dup = () => Object.assign(new Error('E11000 duplicate key collection: X index: uniq_email dup key: { email: "gizli@x.y" }'), { code: 11000 });
let clientCreate: any, clientDelete: any, centralCreate: any;

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  clientCreate = jest.fn(async (p: any) => ({ _id: 'tu1', ...p }));
  clientDelete = jest.fn(async () => ({}));
  centralCreate = jest.fn(async () => ({}));
  Object.assign(clientDb, { getUserModel: () => ({ create: clientCreate, deleteOne: clientDelete }) });
  Object.assign(appDb, { getUserModel: () => ({ create: centralCreate }) });
});
afterEach(() => { jest.restoreAllMocks(); });

async function svc(request: any) {
  const s: any = new UserService(4, request);
  await s.init();
  return s;
}
const userReq = () => ({ user: { email: 'p@x.y', name: 'A', surname: 'B', password: 'plain-pw-1', roleCode: 'ROLE_OPERATOR' }, principal: { sub: 'o', tid: 4 } });

describe('UserService.createUser e-posta tekilliği', () => {
  it('merkezi Users E11000: 409 (ham Mongo mesajı sızmaz) ve yarım kalan tenant içi kayıt geri alınır', async () => {
    centralCreate.mockRejectedValueOnce(dup());
    const err: any = await (await svc(userReq())).createUser().catch((e: any) => e);
    expect(err.statusCode).toBe(409);
    expect(String(err.message)).not.toMatch(/E11000|uniq_email|gizli/);
    expect(clientDelete).toHaveBeenCalledWith({ _id: 'tu1' });
  });

  it('tenant içi Users E11000: 409; merkezi kayıt hiç denenmez', async () => {
    clientCreate.mockRejectedValueOnce(dup());
    const err: any = await (await svc(userReq())).createUser().catch((e: any) => e);
    expect(err.statusCode).toBe(409);
    expect(centralCreate).not.toHaveBeenCalled();
  });

  it('başka hata olduğu gibi fırlatılır; başarıda true döner (davranış korundu)', async () => {
    clientCreate.mockRejectedValueOnce(new Error('başka'));
    await expect((await svc(userReq())).createUser()).rejects.toThrow('başka');
    expect(await (await svc(userReq())).createUser()).toBe(true);
  });
});

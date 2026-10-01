import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// [ADR-0028 WP-A5] updateUser rol değişimi: legacy modda yalnız merkezi/tenant alanları; dual/membership modda ayrıca Membership (MemberStore.writeRole)
// yazılır ve hedefin kimlik önbelleği temizlenir. tokenVersion++ üç modda da merkezi güncellemededir. DB/ağ yok (MemberStore mock).

const appDb: any = {}; const clientDb: any = {};
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => clientDb } }));
let mode = 'legacy';
const writeRole = jest.fn(async (..._a: any[]) => undefined);
const find = jest.fn(async (..._a: any[]) => ({ userId: 'central1', role: 'operator', central: {} }));
jest.mock('@operations/users/memberStore', () => ({
  sourceMode: () => mode,
  MemberStore: jest.fn().mockImplementation(() => ({ find, writeRole })),
}));

import UserService from '../../../src/api/rpc/handlers/user-service';
import { getIdentityCache } from '../../../src/platform/core/security/identityCache';

const OID = '507f1f77bcf86cd799439011';
let centralUpdate: jest.Mock<(...a: any[]) => any>;
beforeEach(() => {
  writeRole.mockClear(); find.mockClear();
  centralUpdate = jest.fn(async () => ({}));
  Object.assign(appDb, { getUserModel: () => ({ updateOne: centralUpdate, countDocuments: async () => 2, findOne: async () => ({ reauthAt: new Date(), email: 'staff@x.y', order: 4, owner: false, roleCode: 'ROLE_OPERATOR' }) }) });
  Object.assign(clientDb, { getUserModel: () => ({ updateOne: async () => ({}), findOne: async () => ({ _id: OID, email: 'staff@x.y', roleCode: 'ROLE_OPERATOR' }) }) });
});
async function change(roleCode: string) {
  const s: any = new UserService(4, {
    user: { _id: OID, name: 'A', surname: 'B', email: 'staff@x.y', roleCode },
    principal: { sub: 'o1', tid: 4, ga: false, tv: 0, imp: false }, userContext: { email: 'o@x.y', roleCode: 'ROLE_OWNER', owner: true, order: 4 }, requestMeta: { ip: '203.0.113.5' },
  });
  await s.init();
  return s.updateUser();
}

describe.each(['legacy', 'dual', 'membership'])('updateUser rol değişimi (MEMBERSHIP_SOURCE=%s)', (m) => {
  it('tokenVersion++ her modda; Membership yalnız dual/membership modunda yazılır; ROLE_ADMIN -> admin', async () => {
    mode = m;
    const inv = jest.spyOn(getIdentityCache(), 'invalidateUser');
    await change('ROLE_ADMIN');
    expect(centralUpdate.mock.calls[0][1].$inc).toEqual({ tokenVersion: 1 });
    if (m === 'legacy') { expect(writeRole).not.toHaveBeenCalled(); }
    else { expect(writeRole).toHaveBeenCalledWith(expect.anything(), 'admin'); expect(inv).toHaveBeenCalledWith('central1'); }
    inv.mockRestore();
  });
  it('ROLE_OPERATOR\'a düşürme dual/membership\'te operator yazar', async () => {
    mode = m;
    Object.assign(clientDb, { getUserModel: () => ({ updateOne: async () => ({}), findOne: async () => ({ _id: OID, email: 'staff@x.y', roleCode: 'ROLE_ADMIN' }) }) });
    await change('ROLE_OPERATOR');
    if (m !== 'legacy') expect(writeRole).toHaveBeenCalledWith(expect.anything(), 'operator');
  });
});

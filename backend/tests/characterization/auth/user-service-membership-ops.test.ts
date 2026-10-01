import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// [ADR-0028 WP-A4] UserService/AccountService yeni uçlarının ince bağlantısı: aktör kademesi userContext'ten, tenant currentClientId'den, sunucu alanları
// gövdeden ALINMAZ; iş kuralları operations/users/*'ta (bellek-içi Mongo testi: tests/mongo-semantics/users). DB/ağ/e-posta YOK.

const appDb: any = { tag: 'app' };
const clientDb: any = { tag: 'client' };
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => clientDb },
}));
const calls: any[] = [];
const mk = (name: string) => jest.fn(async (...a: any[]) => { calls.push([name, ...a]); return { ok: name }; });
jest.mock('@operations/users/invitations', () => ({
  InvitationService: jest.fn().mockImplementation(() => ({ invite: mk('invite'), resend: mk('resend'), revoke: mk('revoke'), list: mk('list'), getPublic: mk('getPublic'), accept: mk('accept') })),
}));
jest.mock('@operations/users/suspension', () => ({ SuspensionService: jest.fn().mockImplementation(() => ({ suspend: mk('suspend'), reactivate: mk('reactivate') })) }));
jest.mock('@operations/users/ownership', () => ({ OwnershipService: jest.fn().mockImplementation(() => ({ initiate: mk('initiate'), cancel: mk('cancel'), accept: mk('accOwn') })) }));

import UserService from '../../../src/api/rpc/handlers/user-service';
import AccountService from '../../../src/api/rpc/handlers/account-service';
import { OPERATION_POLICY, OPEN_OPERATIONS } from '../../../src/api/rpc/operationPolicy';

beforeEach(() => { calls.length = 0; });
const OWNER = { userContext: { email: 'o@x.y', roleCode: 'ROLE_OWNER', owner: true, order: 4 }, principal: { sub: 'o1', tid: 4, ga: false, tv: 0, imp: false } };
const ADMIN = { userContext: { email: 'a@x.y', roleCode: 'ROLE_ADMIN', owner: false, order: 4 }, principal: { sub: 'a1', tid: 4, ga: false, tv: 0, imp: true } };
async function svc(actor: any, request: any) {
  const s: any = new UserService(4, { ...request, ...actor, requestMeta: { ip: '203.0.113.5' } });
  await s.init();
  return s;
}

describe('UserService: davet/askı/devir uçları aktörü ve tenant\'ı sunucudan alır', () => {
  it('inviteUser/resend/revoke/list/suspend/reactivate/devir: (tid, actor{sub,rank,imp,ip}, girdi) ile ilgili işleme delege eder', async () => {
    await (await svc(OWNER, { email: 'n@x.y', role: 'admin' })).inviteUser();
    await (await svc(OWNER, { invitationId: 'i1' })).resendInvitation();
    await (await svc(OWNER, { invitationId: 'i1' })).revokeInvitation();
    await (await svc(OWNER, { status: 'pending' })).listInvitations();
    await (await svc(OWNER, { userId: 'u1', reason: 'r' })).suspendUser();
    await (await svc(OWNER, { userId: 'u1' })).reactivateUser();
    await (await svc(OWNER, { targetUserId: 'u2' })).initiateOwnershipTransfer();
    await (await svc(OWNER, {})).cancelOwnershipTransfer();
    await (await svc(OWNER, { token: 't'.repeat(43) })).acceptOwnershipTransfer();
    const byName = Object.fromEntries(calls.map((c) => [c[0], c]));
    const actor = { sub: 'o1', rank: 3, imp: false, ip: '203.0.113.5' };
    expect(byName.invite.slice(1)).toEqual([4, actor, { email: 'n@x.y', role: 'admin' }]);
    expect(byName.resend.slice(1)).toEqual([4, actor, 'i1']);
    expect(byName.list.slice(1)).toEqual([4, { status: 'pending' }]);
    expect(byName.suspend.slice(1)).toEqual([4, actor, { userId: 'u1', reason: 'r' }]);
    expect(byName.initiate.slice(1)).toEqual([4, actor, { targetUserId: 'u2' }]);
    expect(byName.accOwn.slice(1)).toEqual([4, actor, { token: 't'.repeat(43) }]);
  });

  it('impersonation oturumu (imp:true) aktör bayrağı olarak taşınır; admin kademesi rank=2', async () => {
    await (await svc(ADMIN, { email: 'n@x.y', role: 'operator' })).inviteUser();
    expect(calls[0][2]).toMatchObject({ sub: 'a1', rank: 2, imp: true });
  });

  it('AccountService açık uçlar (getInvitation/acceptInvitation) ve reauthenticate ilgili işleme delege eder', async () => {
    const s: any = new AccountService(undefined as any, { token: 'T'.repeat(43), name: 'N', surname: 'S', password: 'p', requestMeta: { ip: '203.0.113.5' } });
    s.applicationDB = appDb;
    await s.getInvitation();
    await s.acceptInvitation();
    expect(calls[0]).toEqual(['getPublic', 'T'.repeat(43), '203.0.113.5']);
    expect(calls[1]).toEqual(['accept', { token: 'T'.repeat(43), name: 'N', surname: 'S', password: 'p' }, '203.0.113.5']);
  });
});

describe('politika kaydı: yeni uçların kademeleri', () => {
  it('davet/askı: admin; sahiplik devri başlat/iptal: owner; devir kabulü + reauthenticate: member; açık uçlar OPEN_OPERATIONS\'ta, kayıtta YOK', () => {
    const u: any = OPERATION_POLICY.UserService;
    for (const o of ['inviteUser', 'resendInvitation', 'revokeInvitation', 'listInvitations', 'suspendUser', 'reactivateUser']) expect([o, u[o]]).toEqual([o, 'admin']);
    for (const o of ['initiateOwnershipTransfer', 'cancelOwnershipTransfer']) expect([o, u[o]]).toEqual([o, 'owner']);
    expect(u.acceptOwnershipTransfer).toBe('member');
    expect((OPERATION_POLICY as any).AccountService.reauthenticate).toBe('member');
    for (const o of ['getInvitation', 'acceptInvitation']) {
      expect(OPEN_OPERATIONS).toContain('AccountService/' + o);
      expect((OPERATION_POLICY as any).AccountService[o]).toBeUndefined();
    }
  });
});

/**
 * MCP-3: `resolveIdentity` (cerez hattiyla `/mcp` Bearer hattinin ORTAK kimlik cozumu). DB mock'lu (DB/Redis/ag YOK).
 * Cerez hatti davranisi tests/characterization/auth/authenticate.test.ts ile kilitlidir; burada /mcp'nin kullandigi cikarim kurallari:
 * tv uyusmazligi, ga tutarsizligi, pasif/kilitli hesap, tenant aktif degil/yok, tenant yalniz principal'dan, hassas alan sizmaz.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const appDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
    DatabaseManagerInstance: {
        getApplicationDB: async () => appDb,
        getTenant: async (order: number) => {
            const c: any = await appDb.getClientModel().findOne({ order }, 'status').lean();
            return c ? { order, _id: 'client-oid', status: c.status, dbname: 'entegrasyonikClient_' + order } : undefined;
        },
    },
}));

import { resolveIdentity } from '../../../src/api/http/authenticate';
import { getIdentityCache } from '../../../src/platform/core/security/identityCache';

let user: any;
let client: any;
beforeEach(() => {
    getIdentityCache().clear?.();
    user = { _id: 'u1', email: 'u@test.local', password: 'HASH', isGlobalAdmin: false, owner: true, roleCode: 'ROLE_OWNER', order: 3, tokenVersion: 0, failedLoginAttempts: 1 };
    client = { status: 'ACTIVE' };
    appDb.getUserModel = () => ({ findById: () => ({ lean: async () => user }) });
    appDb.getClientModel = () => ({ findOne: () => ({ lean: async () => client }) });
});
const P = (over: Record<string, unknown> = {}) => ({ sub: 'u1', tid: 3, tv: 0, ga: false as const, ...over });

describe('resolveIdentity', () => {
    it('gecerli: userContext.order = principal.tid, hassas alanlar (parola, tokenVersion, kilit) YOK, aktor owner izinleriyle kurulur, cerez/yenileme yok', async () => {
        const { result } = await resolveIdentity(P());
        expect(result.userContext.order).toBe(3);
        for (const k of ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil']) expect(k in result.userContext).toBe(false);
        expect(result.tenant).toMatchObject({ order: 3, status: 'ACTIVE' });
        expect(result.actor).toMatchObject({ sub: 'u1', tid: 3, role: 'owner', actorType: 'user' });
        expect(result.actor.permissions.has('app:use')).toBe(true);
        expect(result.actor.imp).toBeUndefined();
    });

    it('tv uyusmazligi, ga tutarsizligi, olmayan kullanici -> 401', async () => {
        user.tokenVersion = 2;
        await expect(resolveIdentity(P())).rejects.toMatchObject({ statusCode: 401 });
        user.tokenVersion = 0;
        user.isGlobalAdmin = true; // OAuth token'i ga tasimaz (false) -> sunucudaki gercek deger farkli
        await expect(resolveIdentity(P())).rejects.toMatchObject({ statusCode: 401 });
        user.isGlobalAdmin = false;
        appDb.getUserModel = () => ({ findById: () => ({ lean: async () => null }) });
        await expect(resolveIdentity(P({ sub: 'zz' }))).rejects.toMatchObject({ statusCode: 401 });
    });

    it('pasif/kilitli hesap 401; tenant aktif degil 403; tenant kaydi yok 401; kullanici belgesindeki order farkli (baska tenant) 401', async () => {
        user.isActive = false;
        await expect(resolveIdentity(P())).rejects.toMatchObject({ statusCode: 401 });
        user.isActive = true;
        user.lockUntil = new Date(Date.now() + 60_000);
        await expect(resolveIdentity(P())).rejects.toMatchObject({ statusCode: 401 });
        user.lockUntil = undefined;
        client = { status: 'SUSPENDED' };
        await expect(resolveIdentity(P())).rejects.toMatchObject({ statusCode: 403 });
        client = undefined;
        await expect(resolveIdentity(P())).rejects.toMatchObject({ statusCode: 401 });
        client = { status: 'ACTIVE' };
        await expect(resolveIdentity(P({ tid: 4 }))).rejects.toMatchObject({ statusCode: 401 }); // Users.order=3, token tid=4
    });
});

/**
 * MCP-1: modeller (autoIndex:false) <-> 0018 goc birebir; manifest; env dogrulamasi (MCP_ENABLED/JWT_OAUTH_SECRET); Mongo deposu atomik filtreleri (sahte modellerle). DB'siz.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { OAUTH_AUTH_CODE_INDEXES, OAuthAuthCodeSchema } from '../../../src/database/application/models/OAuthAuthCode';
import { OAUTH_CLIENT_INDEXES, OAuthClientSchema } from '../../../src/database/application/models/OAuthClient';
import { OAUTH_REFRESH_TOKEN_INDEXES, OAuthRefreshTokenSchema } from '../../../src/database/application/models/OAuthRefreshToken';
import { ConfigError, parseEnv } from '../../../src/config/env';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migrate = require('../../../dev-tools/migrate');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../../migrations/index-manifest.json');

const mig = migrate.findMigration(migrate.discoverMigrations(), '0018-oauth-app');
const toWanted = (xs: ReadonlyArray<{ fields: object; options: object }>) => xs.map((i) => ({ fields: i.fields, options: i.options }));

describe('0018-oauth-app', () => {
    it('bicim: app kapsami, index turu, plan/up/down var (CALISTIRILMADI; yalniz onayli goc)', () => {
        expect(mig).toMatchObject({ scope: 'app', kind: 'index' });
        for (const f of ['plan', 'up', 'down']) expect(typeof mig[f]).toBe('function');
    });
    it('goc hedefleri model *_INDEXES sabitleriyle birebir (alan + secenek)', () => {
        const by = Object.fromEntries((mig.TARGETS as any[]).map((t) => [t.defaultCollection, t.indexes]));
        expect(by.OAuthClients).toEqual(toWanted(OAUTH_CLIENT_INDEXES));
        expect(by.OAuthAuthCodes).toEqual(toWanted(OAUTH_AUTH_CODE_INDEXES));
        expect(by.OAuthRefreshTokens).toEqual(toWanted(OAUTH_REFRESH_TOKEN_INDEXES));
    });
    it('manifest: yalniz-ozet tekil indeksleri + TTL + aile/sub/tid indeksleri', () => {
        expect(manifest.app.OAuthClients.map((i: any) => i.name).sort()).toEqual(['ttl_unused_expire_at', 'uniq_client_id']);
        expect(manifest.app.OAuthAuthCodes.find((i: any) => i.name === 'uniq_code_hash')).toMatchObject({ fields: { codeHash: 1 }, options: { unique: true } });
        const rt = manifest.app.OAuthRefreshTokens as any[];
        expect(rt.find((i) => i.name === 'uniq_token_hash')).toMatchObject({ options: { unique: true } });
        expect(rt.map((i) => i.name)).toEqual(expect.arrayContaining(['familyId_1', 'sub_1_revokedAt_1', 'tid_1_revokedAt_1', 'ttl_purge_at']));
    });
    it('semalar autoIndex:false; duz belirtec/kod alani YOK (yalniz ozet), ga/imp alani yok', () => {
        for (const s of [OAuthClientSchema, OAuthAuthCodeSchema, OAuthRefreshTokenSchema]) expect(s.get('autoIndex')).toBe(false);
        const fields = (s: { paths: Record<string, unknown> }) => Object.keys(s.paths);
        expect(fields(OAuthRefreshTokenSchema as any)).toContain('tokenHash');
        expect(fields(OAuthRefreshTokenSchema as any)).not.toContain('token');
        expect(fields(OAuthAuthCodeSchema as any)).toContain('codeHash');
        expect(fields(OAuthAuthCodeSchema as any)).not.toContain('code');
        for (const s of [OAuthRefreshTokenSchema, OAuthAuthCodeSchema]) { expect(fields(s as any)).not.toContain('ga'); expect(fields(s as any)).not.toContain('imp'); }
    });
});

describe('env: MCP_ENABLED / JWT_OAUTH_SECRET', () => {
    const base = { JWT_SECRET: 'A'.repeat(48), FIELD_ENCRYPTION_KEYS: 'k1:' + Buffer.alloc(32, 1).toString('base64'), FIELD_ENCRYPTION_ACTIVE_KID: 'k1', DB_URL: 'mongodb://127.0.0.1:27017/x' };
    const env = (o: Record<string, string>) => ({ ...base, ...o } as NodeJS.ProcessEnv);
    const good = { MCP_ENABLED: 'true', JWT_OAUTH_SECRET: 'B'.repeat(48), PUBLIC_API_URL: 'https://api.example.test/', PUBLIC_APP_URL: 'https://app.example.test' };

    it('varsayilan KAPALI ve sirsiz baslar (MCP kapali)', () => {
        const c = parseEnv(env({}), { strict: true });
        expect(c.mcp.enabled).toBe(false);
        expect(c.mcp.oauthSecret).toBeUndefined();
    });
    it('MCP_ENABLED=true iken sir/PUBLIC_API_URL/PUBLIC_APP_URL zorunlu: eksikse surec baslamaz (yalniz degisken ADLARI, deger yok)', () => {
        for (const drop of ['JWT_OAUTH_SECRET', 'PUBLIC_API_URL', 'PUBLIC_APP_URL']) {
            const e = { ...good } as Record<string, string>; delete e[drop];
            expect(() => parseEnv(env(e), { strict: true })).toThrow(ConfigError);
            try { parseEnv(env(e), { strict: true }); } catch (err) { expect((err as ConfigError).issues.join(' ')).toContain(drop); expect((err as Error).message).not.toContain('B'.repeat(10)); }
        }
    });
    it('sir kisa (<32 bayt) ise MCP kapali olsa da surec baslamaz; onceki sir da ayni sart', () => {
        expect(() => parseEnv(env({ JWT_OAUTH_SECRET: 'kisa' }), { strict: true })).toThrow(ConfigError);
        expect(() => parseEnv(env({ ...good, JWT_OAUTH_SECRET_PREVIOUS: 'kisa' }), { strict: true })).toThrow(ConfigError);
    });
    it('gecerli yapilandirma: kaynak URI varsayilani ${PUBLIC_API_URL}/mcp (sondaki / atilir); MCP_RESOURCE_URI ezer; production https ister', () => {
        const c = parseEnv(env(good), { strict: true });
        expect(c.mcp).toMatchObject({ enabled: true, apiOrigin: 'https://api.example.test', appOrigin: 'https://app.example.test', resourceUri: 'https://api.example.test/mcp' });
        expect(parseEnv(env({ ...good, MCP_RESOURCE_URI: 'https://api.example.test/custom/' }), { strict: true }).mcp.resourceUri).toBe('https://api.example.test/custom');
        expect(() => parseEnv(env({ ...good, APP_ENV: 'production', PUBLIC_API_URL: 'http://api.example.test' }), { strict: true })).toThrow(ConfigError);
    });
});

describe('MongoOAuthStore atomik filtreleri (sahte modeller)', () => {
    async function withModels() {
        jest.resetModules();
        const calls: Array<[string, unknown[]]> = [];
        const chain = (name: string, result: unknown) => (...a: unknown[]) => { calls.push([name, a]); return { lean: async () => result }; };
        const rt = {
            findOneAndUpdate: chain('rt.findOneAndUpdate', { tokenHash: 'h' }), findOne: chain('rt.findOne', null),
            updateMany: async (...a: unknown[]) => { calls.push(['rt.updateMany', a]); return { modifiedCount: 3 }; },
            exists: async (...a: unknown[]) => { calls.push(['rt.exists', a]); return { _id: 1 }; },
            distinct: async (...a: unknown[]) => { calls.push(['rt.distinct', a]); return ['f1', 'f2']; },
        };
        const code = { findOneAndUpdate: chain('code.findOneAndUpdate', null), findOne: chain('code.findOne', { codeHash: 'c', familyId: 'f' }) };
        const client = { updateOne: async (...a: unknown[]) => { calls.push(['client.updateOne', a]); } };
        jest.doMock('@database/DatabaseManager', () => ({
            DatabaseManagerInstance: { getApplicationDB: async () => ({ getOAuthRefreshTokenModel: () => rt, getOAuthAuthCodeModel: () => code, getOAuthClientModel: () => client }) },
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- doMock sonrasi taze yukleme
        const { MongoOAuthStore } = require('../../../src/api/oauth/mongoStore');
        return { store: new MongoOAuthStore(), calls };
    }

    it('consumeRefresh: tek atomik findOneAndUpdate (usedAt:null + revokedAt:null kosullu)', async () => {
        const { store, calls } = await withModels();
        expect(await store.consumeRefresh('h', new Date(0))).toBe(true);
        const c = calls.find(([n]) => n === 'rt.findOneAndUpdate') as [string, any[]];
        expect(c[1][0]).toEqual({ tokenHash: 'h', usedAt: null, revokedAt: null });
        expect(c[1][1]).toMatchObject({ $set: { usedAt: new Date(0), lastUsedAt: new Date(0) } });
    });
    it('consumeCode: usedAt:null kosullu atomik; kazanamazsa mevcut belge reused', async () => {
        const { store, calls } = await withModels();
        const r = await store.consumeCode('c', new Date(0));
        expect(r).toMatchObject({ kind: 'reused', code: { familyId: 'f' } });
        expect((calls.find(([n]) => n === 'code.findOneAndUpdate') as [string, any[]])[1][0]).toEqual({ codeHash: 'c', usedAt: null });
    });
    it('revokeFamily yalniz iptal edilmemis uyeleri gunceller; isFamilyActive revokedAt:null + mutlak omur; markClientGranted TTL alanini $unset eder', async () => {
        const { store, calls } = await withModels();
        expect(await store.revokeFamily('f', 'user', new Date(0))).toBe(3);
        expect((calls.find(([n]) => n === 'rt.updateMany') as [string, any[]])[1][0]).toEqual({ familyId: 'f', revokedAt: null });
        expect(await store.isFamilyActive('f', new Date(5))).toBe(true);
        expect((calls.find(([n]) => n === 'rt.exists') as [string, any[]])[1][0]).toEqual({ familyId: 'f', revokedAt: null, familyExpiresAt: { $gt: new Date(5) } });
        await store.markClientGranted('cid', new Date(1));
        expect((calls.find(([n]) => n === 'client.updateOne') as [string, any[]])[1][1]).toMatchObject({ $unset: { unusedExpireAt: 1 } });
        expect(await store.revokeByTenant(7, 'admin', new Date(0))).toBe(2);
    });
});

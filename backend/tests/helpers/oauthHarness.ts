// MCP-1 test duzenegi: bellek-ici OAuthStore (Mongo atomiklik semantigini taklit eder), sahte kimlik portu, MemoryKv, kontrol edilen saat.
// DB/Redis/ag YOK. Uretim kodundaki `OAuthService` dogrudan kullanilir.
import crypto from 'crypto';
import { resetConfigForTests } from '@config';
import { MemoryKv } from '../../src/operations/agent/kv';
import { FamilyGate } from '../../src/api/oauth/familyGate';
import type { OAuthIdentity, OAuthTenantChoice } from '../../src/api/oauth/identity';
import { OAuthService, type ConsentSession, type OAuthServiceDeps } from '../../src/api/oauth/service';
import { summarizeHeads, type ConsumeCodeResult, type OAuthClientRecord, type OAuthCodeRecord, type OAuthFamilySummary, type OAuthRefreshRecord, type OAuthStore, type RevokedBy } from '../../src/api/oauth/store';
import type { OAuthAuditInput } from '../../src/api/oauth/audit';
import { setMcpAccessReader, type McpAccess } from '../../src/api/oauth/tenantAccess';
import type { Role } from '../../src/capabilities/roles';

export const API = 'https://api.example.test';
export const APP = 'https://app.example.test';
export const RESOURCE = API + '/mcp';
export const REDIRECT = 'https://client.example.test/callback';

export class MemoryOAuthStore implements OAuthStore {
    clients = new Map<string, OAuthClientRecord>();
    codes = new Map<string, OAuthCodeRecord>();
    refresh = new Map<string, OAuthRefreshRecord>();
    async insertClient(c: OAuthClientRecord) { this.clients.set(c.clientId, { ...c }); }
    async getClient(id: string) { const c = this.clients.get(id); return c ? { ...c } : null; }
    async markClientGranted(id: string, at: Date) { const c = this.clients.get(id); if (c) { c.lastGrantAt = at; delete c.unusedExpireAt; } }
    async insertCode(c: OAuthCodeRecord) { this.codes.set(c.codeHash, { ...c }); }
    async consumeCode(hash: string, at: Date): Promise<ConsumeCodeResult> {
        const c = this.codes.get(hash);
        if (!c) return { kind: 'missing' };
        if (c.usedAt) return { kind: 'reused', code: { ...c } };
        const before = { ...c };
        c.usedAt = at;
        return { kind: 'ok', code: before };
    }
    async insertRefresh(r: OAuthRefreshRecord) { this.refresh.set(r.tokenHash, { ...r }); }
    async getRefresh(hash: string) { const r = this.refresh.get(hash); return r ? { ...r } : null; }
    async consumeRefresh(hash: string, at: Date) {
        const r = this.refresh.get(hash);
        if (!r || r.usedAt || r.revokedAt) return false;
        r.usedAt = at; r.lastUsedAt = at;
        return true;
    }
    async revokeFamily(familyId: string, by: RevokedBy, at: Date) {
        let n = 0;
        for (const r of this.refresh.values()) if (r.familyId === familyId && !r.revokedAt) { r.revokedAt = at; r.revokedBy = by; n++; }
        return n;
    }
    async isFamilyActive(familyId: string, now: Date) {
        return [...this.refresh.values()].some((r) => r.familyId === familyId && !r.revokedAt && new Date(r.familyExpiresAt).getTime() > now.getTime());
    }
    async revokeBySub(sub: string, by: RevokedBy, at: Date) {
        const fams = new Set([...this.refresh.values()].filter((r) => r.sub === sub && !r.revokedAt).map((r) => r.familyId));
        for (const f of fams) await this.revokeFamily(f, by, at);
        return fams.size;
    }
    async revokeByTenant(tid: number, by: RevokedBy, at: Date) {
        const fams = new Set([...this.refresh.values()].filter((r) => r.tid === tid && !r.revokedAt).map((r) => r.familyId));
        for (const f of fams) await this.revokeFamily(f, by, at);
        return fams.size;
    }
    async listFamilies(q: { tid: number; sub?: string; familyId?: string }, now: Date): Promise<OAuthFamilySummary[]> {
        const t = now.getTime();
        return summarizeHeads([...this.refresh.values()].filter((r) => r.tid === q.tid && (!q.sub || r.sub === q.sub) && (!q.familyId || r.familyId === q.familyId)
            && !r.revokedAt && !r.usedAt && new Date(r.familyExpiresAt).getTime() > t && new Date(r.idleExpiresAt).getTime() > t));
    }
    familyDocs(familyId: string) { return [...this.refresh.values()].filter((r) => r.familyId === familyId); }
}

export interface FakeUser { tv: number; active: boolean; tenants: Map<number, { name: string; role: Role; active?: boolean }> }
export class FakeIdentity implements OAuthIdentity {
    users = new Map<string, FakeUser>();
    add(sub: string, tenants: Array<[number, string, Role]>, tv = 0) {
        this.users.set(sub, { tv, active: true, tenants: new Map(tenants.map(([tid, name, role]) => [tid, { name, role }])) });
    }
    async listTenants(sub: string): Promise<OAuthTenantChoice[]> {
        const u = this.users.get(sub);
        if (!u || !u.active) return [];
        return [...u.tenants.entries()].filter(([, t]) => t.active !== false).map(([tid, t]) => ({ tid, name: t.name, role: t.role }));
    }
    async check(sub: string, tid: number) {
        const u = this.users.get(sub);
        const t = u?.tenants.get(tid);
        if (!u || !u.active || !t || t.active === false) return { ok: false as const };
        return { ok: true as const, tv: u.tv, role: t.role };
    }
}

export function setMcpEnv(): () => void {
    const keys = ['MCP_ENABLED', 'JWT_OAUTH_SECRET', 'JWT_OAUTH_SECRET_PREVIOUS', 'PUBLIC_API_URL', 'PUBLIC_APP_URL', 'MCP_RESOURCE_URI'] as const;
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.MCP_ENABLED = 'true';
    process.env.JWT_OAUTH_SECRET = crypto.randomBytes(40).toString('hex');
    delete process.env.JWT_OAUTH_SECRET_PREVIOUS;
    process.env.PUBLIC_API_URL = API;
    process.env.PUBLIC_APP_URL = APP;
    delete process.env.MCP_RESOURCE_URI;
    resetConfigForTests();
    return () => {
        for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
        resetConfigForTests();
        setMcpAccessReader(undefined);
    };
}

export function pkce(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(48).toString('base64url');
    return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

export interface Harness {
    store: MemoryOAuthStore; kv: MemoryKv; identity: FakeIdentity; gate: FamilyGate; service: OAuthService;
    audit: OAuthAuditInput[]; clock: { t: number }; advance(ms: number): void;
}

export function buildHarness(opts: { familyLimit?: (f: string) => boolean; onConnected?: OAuthServiceDeps['onConnected'] } = {}): Harness {
    // Gerçek saat: verifyOAuthAccessToken jwt.verify ile gerçek zamanı kullanır; sabit tarih 15 dk sonra "süresi dolmuş" olurdu.
    const clock = { t: Date.now() };
    const now = () => clock.t;
    const store = new MemoryOAuthStore();
    const kv = new MemoryKv(now);
    const identity = new FakeIdentity();
    const gate = new FamilyGate(store, 60_000, now);
    const audit: OAuthAuditInput[] = [];
    const service = new OAuthService({
        store, kv: () => kv, identity, gate, audit: (e) => { audit.push(e); }, now,
        urls: () => ({ issuer: API, resource: RESOURCE, appOrigin: APP }), familyLimit: opts.familyLimit, onConnected: opts.onConnected,
    });
    return { store, kv, identity, gate, service, audit, clock, advance: (ms) => { clock.t += ms; } };
}

export const session = (sub: string, over: Partial<ConsentSession> = {}): ConsentSession => ({ sub, ga: false, imp: false, ip: '203.0.113.9', ...over });

export interface Connected {
    clientId: string; verifier: string; code: string; redirectUri: string; reqId: string;
}

/** DCR -> authorize -> onay (tid) -> kod. Kodu TOKEN'a cevirmez. */
export async function authorizeToCode(h: Harness, o: { sub?: string; tid?: number; scope?: string; approveScopes?: string[]; clientId?: string; redirectUri?: string } = {}): Promise<Connected> {
    const redirectUri = o.redirectUri ?? REDIRECT;
    let clientId = o.clientId;
    if (!clientId) {
        const reg = await h.service.register({ redirect_uris: [redirectUri], client_name: 'Test App', scope: 'mcp:read mcp:write' }) as { client_id: string };
        clientId = reg.client_id;
    }
    const { verifier, challenge } = pkce();
    const out = await h.service.authorize({
        response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256',
        state: 'st-1', resource: RESOURCE, scope: o.scope ?? 'mcp:read mcp:write',
    });
    if (out.type !== 'redirect') throw new Error('authorize beklenen yonlendirme vermedi');
    const reqId = new URL(out.url).searchParams.get('req') as string;
    const dec = await h.service.decide(reqId, session(o.sub ?? 'u1'), { approve: true, tid: o.tid ?? 1, scopes: o.approveScopes });
    const code = new URL(dec.redirectTo).searchParams.get('code') as string;
    return { clientId, verifier, code, redirectUri, reqId };
}

export const setAccess = (a: McpAccess | ((tid: number) => McpAccess)) => setMcpAccessReader(async (tid) => (typeof a === 'function' ? a(tid) : a));

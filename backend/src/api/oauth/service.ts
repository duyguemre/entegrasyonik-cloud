// ADR-0035 Karar 2 + ADR-0010: gomulu asgari OAuth 2.1 yetkilendirme sunucusu cekirdegi (HTTP'den bagimsiz; `routes.ts` ince sarmaldir).
// Yalniz authorization_code + PKCE(S256) ve refresh_token; public client'lar (sir yok); DCR (RFC 7591); revoke (RFC 7009).
// Belirtec/kod yalniz SHA-256 ozetiyle saklanir; hicbir belirtec/ozet/kod log/audit/hata iletisine girmez.
import { CAPABILITIES } from '../../capabilities';
import { ROLE_PERMISSIONS, type Role } from '../../capabilities/roles';
import type { AgentKv } from '@operations/agent/kv';
import {
    OAUTH_ACCESS_TTL_SECONDS, OAUTH_SCOPES, pkceS256Matches, randomToken, sha256Hex, signOAuthAccessToken, verifyOAuthAccessToken, type OAuthScope,
} from '@platform/core/security/oauthTokens';
import { OAUTH_CODE_RETENTION_SECONDS, OAUTH_CODE_TTL_SECONDS } from '@database/application/models/OAuthAuthCode';
import { OAUTH_CLIENT_UNUSED_TTL_DAYS } from '@database/application/models/OAuthClient';
import { OAUTH_REFRESH_IDLE_DAYS, OAUTH_REFRESH_MAX_DAYS } from '@database/application/models/OAuthRefreshToken';
import { CONSENT_NOTICE_TEXT, CONSENT_NOTICE_VERSION } from './consentNotice';
import { invalidClient, invalidClientMetadata, invalidGrant, invalidRequest, invalidScope, invalidTarget, rateLimited, unsupportedGrantType } from './errors';
import type { OAuthIdentity } from './identity';
import { knownClientName } from './knownClients';
import { MAX_REDIRECT_URIS, redirectHostOf, redirectMatches, validateRedirectUri } from './redirect';
import type { OAuditSink } from './audit';
import type { OAuthClientRecord, OAuthRefreshRecord, OAuthStore, RevokedBy } from './store';
import { getMcpAccess, type McpAccess } from './tenantAccess';
import type { FamilyGate } from './familyGate';

export const CONSENT_REQUEST_TTL_SEC = 10 * 60;
export const REFRESH_GRACE_MS = 10_000;
export const MAX_CLIENT_NAME = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const REQ_KEY = (id: string) => `oauth:req:${id}`;
const B64URL_43 = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const hasControl = (v: string): boolean => { for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true; } return false; };
const GRANTS = ['authorization_code', 'refresh_token'] as const;

export interface OAuthServiceDeps {
    store: OAuthStore;
    kv: () => AgentKv;
    identity: OAuthIdentity;
    audit: OAuditSink;
    gate: FamilyGate;
    /** Kaynak/yayimci URI'leri (her cagrida okunur: test/yeniden yukleme). */
    urls: () => { issuer: string; resource: string; appOrigin: string };
    /** Aile basina token hiz siniri (10/dk). true = izinli. */
    familyLimit?: (familyId: string) => boolean;
    /** MCP-2: yeni baglanti (ilk token) olustugunda bildirim/bilgilendirme kancasi. Hata YUTULUR; akisi bozmaz. */
    onConnected?: (e: ConnectedEvent) => void | Promise<void>;
    now?: () => number;
}

export interface ConnectedEvent { sub: string; tid: number; familyId: string; clientName: string; redirectHost: string; known: boolean }

/** Oturumdan (cerez) gelen, SUNUCUDA dogrulanmis kimlik. */
export interface ConsentSession { sub: string; ga: boolean; imp: boolean; ip?: string }

interface StoredRequest {
    clientId: string; clientName: string; redirectUri: string; scopes: OAuthScope[]; state: string; codeChallenge: string; resource: string; createdAt: number;
}

export type AuthorizeOutcome = { type: 'page_error' } | { type: 'redirect'; url: string };

export interface ConsentRequestView {
    id: string;
    state: 'pending';
    client: { name: string; known: boolean; redirectHost: string };
    requestedScopes: OAuthScope[];
    tenants: Array<{ tid: number; name: string; role: string; mcpAccess: McpAccess; writeAvailable: boolean }>;
    notice: { textVersion: string; text: string };
    expiresAt: string;
}

/** Onay ekrani uclarinin hatasi: `code` katalog kodudur (docs/ERROR_CODES.md). */
export class ConsentError extends Error {
    constructor(public readonly status: number, public readonly code: string, message?: string) { super(message ?? code); }
}

export interface TokenResponse { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/** Kapsam dizgesi -> dizi; bilinmeyen kapsam varsa null. */
export function parseScopes(v: unknown): OAuthScope[] | null {
    if (typeof v !== 'string') return null;
    const parts = v.split(' ').filter(Boolean);
    if (parts.length === 0) return null;
    const out: OAuthScope[] = [];
    for (const p of parts) {
        if (!(OAUTH_SCOPES as readonly string[]).includes(p)) return null;
        if (!out.includes(p as OAuthScope)) out.push(p as OAuthScope);
    }
    return out;
}

/** Rolun `mcp.exposed` YAZMA (confirm) yeteneklerinden en az birine izni var mi (mcp:write verilebilir mi). */
export function canWriteAny(role: Role): boolean {
    const perms = ROLE_PERMISSIONS[role];
    return CAPABILITIES.some((c) => !!c.mcp.exposed && c.mcp.exposed.confirm === 'confirm' && c.effect === 'write' && perms.has(c.permission as never));
}

export class OAuthService {
    constructor(private readonly d: OAuthServiceDeps) { }
    private now(): number { return (this.d.now ?? Date.now)(); }

    // ------------------------------------------------------------------ DCR (RFC 7591)
    async register(body: unknown, ip?: string): Promise<Record<string, unknown>> {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalidClientMetadata('Gecersiz istek govdesi.');
        const b = body as Record<string, unknown>;
        // `logo_uri`/`client_uri`/`jwks_uri`/`tos_uri`... YOK SAYILIR: sunucu dis URL cekmez (SSRF yuzeyi yok) ve saklamaz.
        if (b.token_endpoint_auth_method !== undefined && b.token_endpoint_auth_method !== 'none') throw invalidClientMetadata('Yalniz token_endpoint_auth_method=none desteklenir (istemci sirri verilmez).');
        if (b.client_secret !== undefined) throw invalidClientMetadata('client_secret istenemez.');
        let grants: string[] = [...GRANTS];
        if (b.grant_types !== undefined) {
            if (!Array.isArray(b.grant_types) || b.grant_types.length === 0 || b.grant_types.some((g) => typeof g !== 'string' || !(GRANTS as readonly string[]).includes(g))) {
                throw invalidClientMetadata('grant_types yalniz authorization_code ve refresh_token icerebilir.');
            }
            grants = [...new Set(b.grant_types as string[])];
            if (!grants.includes('authorization_code')) throw invalidClientMetadata('grant_types authorization_code icermeli.');
        }
        if (b.response_types !== undefined && !(Array.isArray(b.response_types) && b.response_types.length === 1 && b.response_types[0] === 'code')) {
            throw invalidClientMetadata('response_types yalniz ["code"] olabilir.');
        }
        const uris = b.redirect_uris;
        if (!Array.isArray(uris) || uris.length < 1 || uris.length > MAX_REDIRECT_URIS) throw invalidClientMetadata(`redirect_uris 1-${MAX_REDIRECT_URIS} adet olmali.`);
        let firstHost = '';
        for (const u of uris) {
            const r = validateRedirectUri(u);
            if (!r.ok) throw invalidClientMetadata(r.reason);
            if (!firstHost) firstHost = r.host;
        }
        const redirectUris = [...new Set(uris as string[])];
        let clientName = firstHost;
        if (b.client_name !== undefined) {
            if (typeof b.client_name !== 'string') throw invalidClientMetadata('client_name metin olmali.');
            const n = b.client_name.trim();
            if (n.length < 1 || n.length > MAX_CLIENT_NAME || hasControl(n)) throw invalidClientMetadata(`client_name 1-${MAX_CLIENT_NAME} karakter, kontrol karakteri icermemeli.`);
            clientName = n;
        }
        let scopes: OAuthScope[] = ['mcp:read'];
        if (b.scope !== undefined) {
            const s = parseScopes(b.scope);
            if (!s) throw invalidClientMetadata('scope yalniz mcp:read ve mcp:write icerebilir.');
            scopes = s;
        }
        const now = this.now();
        const clientId = `ec_${randomToken(18)}`;
        const rec: OAuthClientRecord = {
            clientId, clientName, redirectUris, scopes, createdAt: new Date(now), createdIp: ip?.slice(0, 64),
            unusedExpireAt: new Date(now + OAUTH_CLIENT_UNUSED_TTL_DAYS * DAY_MS),
        };
        await this.d.store.insertClient(rec);
        this.d.audit({ event: 'oauth.register', result: 'ok', ip, clientId });
        return {
            client_id: clientId, client_id_issued_at: Math.floor(now / 1000), client_name: clientName, redirect_uris: redirectUris,
            grant_types: grants, response_types: ['code'], token_endpoint_auth_method: 'none', scope: scopes.join(' '),
        };
    }

    // ------------------------------------------------------------------ authorize
    /** Gecersiz client_id/redirect_uri -> `page_error` (YONLENDIRME YOK; acik yonlendirici olmaz). Diger hatalar kayitli redirect'e `error=` ile doner. */
    async authorize(q: Record<string, unknown>, ip?: string): Promise<AuthorizeOutcome> {
        const clientId = str(q.client_id);
        const client = clientId ? await this.d.store.getClient(clientId) : null;
        if (!client || !redirectMatches(client.redirectUris, q.redirect_uri)) return { type: 'page_error' };
        const redirectUri = q.redirect_uri as string;
        const state = str(q.state);
        const fail = (error: string, description: string): AuthorizeOutcome => {
            const u = new URL(redirectUri);
            u.searchParams.set('error', error);
            u.searchParams.set('error_description', description);
            if (state && state.length <= 512) u.searchParams.set('state', state);
            return { type: 'redirect', url: u.toString() };
        };
        if (q.response_type !== 'code') return fail('unsupported_response_type', 'response_type=code olmali.');
        if (!state || state.length > 512) return fail('invalid_request', 'state zorunlu.');
        if (q.code_challenge_method !== 'S256') return fail('invalid_request', 'PKCE code_challenge_method=S256 zorunlu.');
        const challenge = str(q.code_challenge);
        if (!challenge || !B64URL_43.test(challenge)) return fail('invalid_request', 'code_challenge zorunlu (S256).');
        const resource = this.d.urls().resource;
        if (q.resource !== resource) {
            this.d.audit({ event: 'oauth.resource_rejected', result: 'fail', ip, clientId: client.clientId });
            return fail('invalid_target', 'resource MCP kaynak adresi olmali.');
        }
        let scopes = client.scopes;
        if (q.scope !== undefined) {
            const s = parseScopes(q.scope);
            if (!s || s.some((x) => !client.scopes.includes(x))) return fail('invalid_scope', 'Istenen kapsam kayitli kapsamlarin disinda.');
            scopes = s;
        }
        const id = randomToken(24);
        const stored: StoredRequest = { clientId: client.clientId, clientName: client.clientName, redirectUri, scopes, state, codeChallenge: challenge, resource, createdAt: this.now() };
        await this.d.kv().set(REQ_KEY(id), JSON.stringify(stored), CONSENT_REQUEST_TTL_SEC);
        const u = new URL('/oauth/consent', this.d.urls().appOrigin);
        u.searchParams.set('req', id);
        return { type: 'redirect', url: u.toString() };
    }

    // ------------------------------------------------------------------ onay ekrani (cerezli)
    private async loadRequest(id: string): Promise<StoredRequest> {
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(id)) throw new ConsentError(404, 'NOT_FOUND');
        const raw = await this.d.kv().get(REQ_KEY(id));
        if (!raw) throw new ConsentError(404, 'NOT_FOUND');
        try { return JSON.parse(raw) as StoredRequest; } catch { throw new ConsentError(404, 'NOT_FOUND'); }
    }

    private assertSession(s: ConsentSession): void {
        if (s.ga || s.imp) throw new ConsentError(403, 'IMPERSONATION_FORBIDDEN');
    }

    async getConsentRequest(id: string, session: ConsentSession): Promise<ConsentRequestView> {
        this.assertSession(session);
        const req = await this.loadRequest(id);
        const tenants = await this.d.identity.listTenants(session.sub);
        const wantsWrite = req.scopes.includes('mcp:write');
        const rows = await Promise.all(tenants.map(async (t) => {
            const access = await getMcpAccess(t.tid);
            return { tid: t.tid, name: t.name, role: t.role, mcpAccess: access, writeAvailable: wantsWrite && access === 'readwrite' && canWriteAny(t.role) };
        }));
        const client = await this.d.store.getClient(req.clientId);
        return {
            id, state: 'pending',
            client: { name: req.clientName, known: !!client && !!knownClientName(client.redirectUris), redirectHost: redirectHostOf(req.redirectUri) },
            requestedScopes: req.scopes, tenants: rows, notice: { textVersion: CONSENT_NOTICE_VERSION, text: CONSENT_NOTICE_TEXT },
            expiresAt: new Date(req.createdAt + CONSENT_REQUEST_TTL_SEC * 1000).toISOString(),
        };
    }

    /** Onay/ret. Basarida kod uretilir (yalniz ozeti saklanir) ve `redirectTo` doner. Istek TEK KULLANIMLIKTIR. */
    async decide(id: string, session: ConsentSession, body: { approve?: unknown; tid?: unknown; scopes?: unknown }): Promise<{ redirectTo: string }> {
        this.assertSession(session);
        const req = await this.loadRequest(id);
        const back = (params: Record<string, string>): string => {
            const u = new URL(req.redirectUri);
            for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
            u.searchParams.set('state', req.state);
            return u.toString();
        };
        if (typeof body.approve !== 'boolean') throw new ConsentError(400, 'OAUTH_INVALID_REQUEST');
        if (!body.approve) {
            if ((await this.d.kv().getDel(REQ_KEY(id))) === null) throw new ConsentError(404, 'NOT_FOUND');
            this.d.audit({ event: 'oauth.consent_denied', result: 'ok', sub: session.sub, ip: session.ip, clientId: req.clientId });
            return { redirectTo: back({ error: 'access_denied' }) };
        }
        if (!Number.isInteger(body.tid)) throw new ConsentError(400, 'OAUTH_INVALID_REQUEST');
        const tid = body.tid as number;
        const chosen = body.scopes === undefined ? req.scopes : Array.isArray(body.scopes) ? body.scopes : null;
        if (!chosen || chosen.some((x) => typeof x !== 'string' || !req.scopes.includes(x as OAuthScope))) throw new ConsentError(400, 'OAUTH_INVALID_REQUEST');
        const check = await this.d.identity.check(session.sub, tid);
        if (!check.ok) throw new ConsentError(403, 'OAUTH_ACCESS_DENIED');
        const access = await getMcpAccess(tid);
        if (access === 'off') throw new ConsentError(403, 'MCP_TENANT_OFF');
        // Okuma her zaman verilir; yazma YALNIZ tenant readwrite + rol en az bir exposed yazma yetenegine sahipse (aksi halde SESSIZCE dusurulur).
        const scopes: OAuthScope[] = ['mcp:read'];
        if ((chosen as string[]).includes('mcp:write') && access === 'readwrite' && canWriteAny(check.role)) scopes.push('mcp:write');
        // Istegi ATOMIK tuket (cift gonderim/es zamanli kararda yalniz biri kod uretir).
        if ((await this.d.kv().getDel(REQ_KEY(id))) === null) throw new ConsentError(404, 'NOT_FOUND');
        const now = this.now();
        const code = randomToken(32);
        const familyId = randomToken(16);
        await this.d.store.insertCode({
            codeHash: sha256Hex(code), clientId: req.clientId, redirectUri: req.redirectUri, codeChallenge: req.codeChallenge, resource: req.resource,
            sub: session.sub, tid, scopes, tv: check.tv, familyId, createdAt: new Date(now), expiresAt: new Date(now + OAUTH_CODE_TTL_SECONDS * 1000),
            purgeAt: new Date(now + OAUTH_CODE_RETENTION_SECONDS * 1000),
        });
        this.d.audit({ event: 'oauth.consent_granted', result: 'ok', sub: session.sub, tid, ip: session.ip, clientId: req.clientId, fam: familyId, detail: scopes.join(' ') });
        return { redirectTo: back({ code }) };
    }

    // ------------------------------------------------------------------ token
    async token(p: Record<string, unknown>, ip?: string): Promise<TokenResponse> {
        for (const v of Object.values(p)) if (typeof v !== 'string') throw invalidRequest('Parametreler metin olmali.');
        const grant = str(p.grant_type);
        if (!grant) throw invalidRequest('grant_type zorunlu.');
        const clientId = str(p.client_id);
        if (!clientId) throw invalidRequest('client_id zorunlu.');
        const client = await this.d.store.getClient(clientId);
        if (!client) throw invalidClient();
        if (grant === 'authorization_code') return this.grantCode(client, p, ip);
        if (grant === 'refresh_token') return this.grantRefresh(client, p, ip);
        throw unsupportedGrantType();
    }

    private async revoke(familyId: string, by: RevokedBy): Promise<void> {
        await this.d.store.revokeFamily(familyId, by, new Date(this.now()));
        this.d.gate.invalidate(familyId);
    }

    private async grantCode(client: OAuthClientRecord, p: Record<string, unknown>, ip?: string): Promise<TokenResponse> {
        const code = str(p.code);
        const verifier = str(p.code_verifier);
        if (!code || !verifier || !VERIFIER.test(verifier) || !str(p.redirect_uri)) throw invalidRequest('code, redirect_uri ve code_verifier zorunlu.');
        const res = await this.d.store.consumeCode(sha256Hex(code), new Date(this.now()));
        if (res.kind === 'missing') throw invalidGrant();
        if (res.kind === 'reused') {
            // Kodun ikinci kullanimi: o koddan verilmis aile (varsa) iptal edilir.
            await this.revoke(res.code.familyId, 'code_reuse');
            this.d.audit({ event: 'oauth.code_reuse', result: 'fail', sub: res.code.sub, tid: res.code.tid, ip, clientId: client.clientId, fam: res.code.familyId });
            throw invalidGrant();
        }
        const c = res.code;
        if (c.clientId !== client.clientId || c.redirectUri !== p.redirect_uri || this.now() > new Date(c.expiresAt).getTime() || !pkceS256Matches(verifier, c.codeChallenge)) {
            this.d.audit({ event: 'oauth.grant_invalid', result: 'fail', sub: c.sub, tid: c.tid, ip, clientId: client.clientId });
            throw invalidGrant();
        }
        if (p.resource !== undefined && p.resource !== c.resource) throw invalidTarget();
        const id = await this.d.identity.check(c.sub, c.tid);
        if (!id.ok || id.tv !== c.tv) throw invalidGrant();
        const now = this.now();
        const familyExpiresAt = new Date(now + OAUTH_REFRESH_MAX_DAYS * DAY_MS);
        const refresh = randomToken(32);
        await this.d.store.insertRefresh({
            tokenHash: sha256Hex(refresh), familyId: c.familyId, sub: c.sub, tid: c.tid, clientId: client.clientId, clientName: client.clientName, resource: c.resource,
            scopes: c.scopes, tv: c.tv, createdAt: new Date(now), familyCreatedAt: new Date(now), familyExpiresAt, idleExpiresAt: new Date(now + OAUTH_REFRESH_IDLE_DAYS * DAY_MS),
            purgeAt: new Date(familyExpiresAt.getTime() + 7 * DAY_MS),
        });
        await this.d.store.markClientGranted(client.clientId, new Date(now));
        this.d.audit({ event: 'oauth.token_issued', result: 'ok', sub: c.sub, tid: c.tid, ip, clientId: client.clientId, fam: c.familyId, detail: c.scopes.join(' ') });
        await this.notifyConnected(client, c.sub, c.tid, c.familyId);
        return this.response(c.sub, c.tid, id.role, id.tv, client.clientId, c.scopes, c.familyId, c.resource, refresh);
    }

    private async notifyConnected(client: OAuthClientRecord, sub: string, tid: number, familyId: string): Promise<void> {
        if (!this.d.onConnected) return;
        try {
            await this.d.onConnected({
                sub, tid, familyId, clientName: client.clientName, redirectHost: client.redirectUris[0] ? redirectHostOf(client.redirectUris[0]) : '',
                known: !!knownClientName(client.redirectUris),
            });
        } catch { /* bildirim hatasi baglantiyi bozmaz */ }
    }

    private async grantRefresh(client: OAuthClientRecord, p: Record<string, unknown>, ip?: string): Promise<TokenResponse> {
        const presented = str(p.refresh_token);
        if (!presented || presented.length > 256) throw invalidRequest('refresh_token zorunlu.');
        const hash = sha256Hex(presented);
        let rec = await this.d.store.getRefresh(hash);
        if (!rec) throw invalidGrant();
        if (this.d.familyLimit && !this.d.familyLimit(rec.familyId)) throw rateLimited();
        if (rec.revokedAt) throw invalidGrant();
        if (rec.clientId !== client.clientId) {
            // Baska istemci bu ailenin belirtecini sundu: belirtec sizmis sayilir, aile kapanir.
            await this.revoke(rec.familyId, 'client_mismatch');
            this.d.audit({ event: 'oauth.client_mismatch', result: 'fail', sub: rec.sub, tid: rec.tid, ip, clientId: client.clientId, fam: rec.familyId });
            throw invalidGrant();
        }
        const now = this.now();
        if (now > new Date(rec.familyExpiresAt).getTime() || now > new Date(rec.idleExpiresAt).getTime()) throw invalidGrant();
        let scopes = rec.scopes;
        if (p.scope !== undefined) {
            const s = parseScopes(p.scope);
            if (!s || s.some((x) => !rec!.scopes.includes(x))) throw invalidScope('Kapsam genisletilemez.');
            scopes = s; // yalniz daraltilabilir
        }
        if (p.resource !== undefined && p.resource !== rec.resource) throw invalidTarget();

        let reused = !!rec.usedAt;
        if (!reused && !(await this.d.store.consumeRefresh(hash, new Date(now)))) {
            // Yarista kaybettik: kazanan usedAt'i yazdi; grace penceresi icindeyse es zamanli yenileme sayilir.
            rec = (await this.d.store.getRefresh(hash)) ?? rec;
            if (rec.revokedAt) throw invalidGrant();
            reused = true;
        }
        if (reused) {
            if (!this.withinGrace(rec)) {
                await this.revoke(rec.familyId, 'reuse');
                this.d.audit({ event: 'oauth.refresh_reuse', result: 'fail', sub: rec.sub, tid: rec.tid, ip, clientId: client.clientId, fam: rec.familyId });
                throw invalidGrant();
            }
            this.d.audit({ event: 'oauth.refresh_grace', result: 'ok', sub: rec.sub, tid: rec.tid, ip, clientId: client.clientId, fam: rec.familyId });
        }
        const id = await this.d.identity.check(rec.sub, rec.tid);
        if (!id.ok) { await this.revoke(rec.familyId, 'tenant'); throw invalidGrant(); }
        if (id.tv !== rec.tv) {
            await this.revoke(rec.familyId, 'tv');
            this.d.audit({ event: 'oauth.grant_invalid', result: 'fail', sub: rec.sub, tid: rec.tid, ip, clientId: client.clientId, fam: rec.familyId, detail: 'tv' });
            throw invalidGrant();
        }
        const next = randomToken(32);
        const familyExpiresAt = new Date(rec.familyExpiresAt);
        await this.d.store.insertRefresh({
            tokenHash: sha256Hex(next), familyId: rec.familyId, sub: rec.sub, tid: rec.tid, clientId: rec.clientId, clientName: rec.clientName, resource: rec.resource,
            scopes, tv: rec.tv, createdAt: new Date(now), lastUsedAt: new Date(now), familyCreatedAt: rec.familyCreatedAt, familyExpiresAt, idleExpiresAt: new Date(now + OAUTH_REFRESH_IDLE_DAYS * DAY_MS),
            purgeAt: new Date(familyExpiresAt.getTime() + 7 * DAY_MS),
        });
        // Iptal ile yenileme yarisi: yeni uye yazildiktan SONRA aile hala aktif olmali (aksi halde yeni uye de iptal edilir).
        if (!(await this.d.store.isFamilyActive(rec.familyId, new Date(this.now())))) {
            await this.revoke(rec.familyId, 'user');
            throw invalidGrant();
        }
        this.d.audit({ event: 'oauth.refresh', result: 'ok', sub: rec.sub, tid: rec.tid, ip, clientId: client.clientId, fam: rec.familyId });
        return this.response(rec.sub, rec.tid, id.role, id.tv, rec.clientId, scopes, rec.familyId, rec.resource, next);
    }

    private withinGrace(rec: OAuthRefreshRecord): boolean {
        return !!rec.usedAt && this.now() - new Date(rec.usedAt).getTime() <= REFRESH_GRACE_MS;
    }

    private response(sub: string, tid: number, role: Role, tv: number, cid: string, scopes: OAuthScope[], fam: string, aud: string, refresh: string): TokenResponse {
        const access = signOAuthAccessToken({ sub, tid, role, tv, cid, scope: scopes, fam, aud }, this.now());
        return { access_token: access, token_type: 'Bearer', expires_in: OAUTH_ACCESS_TTL_SECONDS, refresh_token: refresh, scope: scopes.join(' ') };
    }

    // ------------------------------------------------------------------ revoke (RFC 7009)
    /** Bilinmeyen/gecersiz belirtec icin de SESSIZCE basari (bilgi sizdirmaz). Refresh ya da access (fam claim'i) verilirse TUM aile iptal edilir. */
    async revokeToken(p: Record<string, unknown>, ip?: string): Promise<void> {
        const token = str(p.token);
        if (!token || token.length > 4096) return;
        const clientId = str(p.client_id);
        let familyId: string | undefined; let cid: string | undefined; let sub: string | undefined; let tid: number | undefined;
        const rec = await this.d.store.getRefresh(sha256Hex(token));
        if (rec) { familyId = rec.familyId; cid = rec.clientId; sub = rec.sub; tid = rec.tid; }
        else if (token.includes('.')) {
            try {
                const a = verifyOAuthAccessToken(token, this.d.urls().resource);
                familyId = a.fam; cid = a.cid; sub = a.sub; tid = a.tid;
            } catch { /* gecersiz/suresi dolmus access token: yok say */ }
        }
        if (!familyId) return;
        if (clientId && cid && clientId !== cid) return; // baska istemcinin belirtecini iptal edemez (sessizce yok sayilir)
        await this.revoke(familyId, 'client');
        this.d.audit({ event: 'oauth.revoke', result: 'ok', sub, tid, ip, clientId: cid, fam: familyId });
    }
}

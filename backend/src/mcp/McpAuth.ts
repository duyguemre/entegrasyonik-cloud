// ADR-0035 Karar 1/2/6 / MCP-3: `/mcp` HER istekte kimlik + durum denetimi (durumsuz; oturum yok).
// Sira: Bearer imza/aud/exp (`aud` = MCP kaynak URI'si; web cerezi ve `aud:api` burada gecmez) -> aile iptal durumu (FamilyGate, <=60 sn) ->
// kullanici/tv/uyelik/tenant (cerez hattiyla AYNI `resolveIdentity`) -> `app:use` -> tenant `Settings.mcp.access` (HER cagrida yeniden okunur; off => 403).
// Etkin kapsam = token kapsami ∩ tenant tavani (`read` tenant'ta `mcp:write` dusurulur). Kullanici/tenant YALNIZ token'dan (govdeden degil).
// Impersonation yapisal olarak yoktur: token'da `imp`/`ga` yok (dogrulayici reddeder), burada ga/imp daima false kurulur.
import type { OAuthPrincipal, OAuthScope } from '@platform/core/security/oauthTokens';
import { resolveTier } from '@platform/core/authz/tier';
import { ApplicationError } from '@platform/core/errors';
import type { AgentCtx } from '@operations/agent/types';
import type { McpAccess } from '@operations/mcp/mcpSettings';
import type { AuthResult } from '../api/http/authenticate';

export type McpFailure = 'invalid_token' | 'insufficient_scope' | 'none';

/** Kimlik/durum reddi: HTTP durumu + katalog kodu + (401/403 icin) `WWW-Authenticate` hata turu. */
export class McpAuthError extends Error {
    constructor(readonly status: number, readonly code: string, readonly challenge: McpFailure = 'none') { super(code); }
}

export interface McpCaller {
    tid: number;
    userId: string;
    clientId: string;
    /** Baglanti (refresh ailesi) kimligi. */
    fam: string;
    access: Exclude<McpAccess, 'off'>;
    /** Etkin kapsam (token ∩ tenant tavani). */
    scopes: OAuthScope[];
    /** Sohbetle ORTAK arac katmani baglami (`surface:'mcp'`). */
    ctx: AgentCtx;
}

/** Tenant tavani: `read` -> yazma kapsami dusurulur; `readwrite` -> token kapsami aynen; `off` -> bos. */
export function effectiveScopes(token: ReadonlyArray<OAuthScope>, access: McpAccess): OAuthScope[] {
    if (access === 'off') return [];
    return token.filter((s) => s === 'mcp:read' || (s === 'mcp:write' && access === 'readwrite'));
}

export interface McpAuthDeps {
    /** Bearer dogrulama (`Security.verifyBearer(token, resourceUri)`); gecersizse ApplicationError(401) firlatir. */
    verify(token: string): OAuthPrincipal;
    /** Aile durumu (FamilyGate); depo hatasi firlar (fail-closed). */
    familyActive(fam: string): Promise<boolean>;
    /** Cerez hattiyla ayni kimlik cozumu (`resolveIdentity`). */
    identity(p: { sub: string; tid: number; tv: number; ga: false }): Promise<AuthResult>;
    access(tid: number): Promise<McpAccess>;
    readonly: () => boolean;
}

const unavailable = () => new McpAuthError(503, 'UNAVAILABLE');

export class McpAuth {
    constructor(private readonly deps: McpAuthDeps) { }

    /** `token` = `Authorization: Bearer` degeri (yoksa undefined -> 401, hata turu yok). */
    async authenticate(token: string | undefined, ip: string | undefined): Promise<McpCaller & { principal: OAuthPrincipal }> {
        if (!token) throw new McpAuthError(401, 'UNAUTHENTICATED', 'none');
        let p: OAuthPrincipal;
        try { p = this.deps.verify(token); } catch { throw new McpAuthError(401, 'UNAUTHENTICATED', 'invalid_token'); }

        let famOk: boolean;
        try { famOk = await this.deps.familyActive(p.fam); } catch { throw unavailable(); }
        if (!famOk) throw new McpAuthError(401, 'UNAUTHENTICATED', 'invalid_token');

        let id: AuthResult;
        try {
            id = await this.deps.identity({ sub: p.sub, tid: p.tid, tv: p.tv, ga: false });
        } catch (e) {
            if (e instanceof ApplicationError) {
                if (e.statusCode === 401) throw new McpAuthError(401, 'UNAUTHENTICATED', 'invalid_token');
                throw new McpAuthError(e.statusCode === 403 ? 403 : 401, 'FORBIDDEN');
            }
            throw unavailable(); // DB hatasi fail-open OLMAZ
        }
        if (!id.actor.permissions.has('app:use')) throw new McpAuthError(403, 'FORBIDDEN');

        let access: McpAccess;
        try { access = await this.deps.access(p.tid); } catch { throw unavailable(); }
        if (access === 'off') throw new McpAuthError(403, 'MCP_TENANT_OFF');
        const scopes = effectiveScopes(p.scope, access);
        if (!scopes.includes('mcp:read')) throw new McpAuthError(403, 'INSUFFICIENT_SCOPE', 'insufficient_scope');

        // ga/imp DAIMA false: OAuth token'inda yok; principal sunucuda kurulur (RunOperation/denetim ayni sekli bekler).
        const principal = {
            sub: p.sub, tid: p.tid, role: p.role, ga: false, tv: p.tv, imp: false, auth_time: p.iat, iat: p.iat, exp: p.exp, iss: p.iss, aud: p.aud,
        };
        const ctx: AgentCtx = {
            tid: p.tid, userId: p.sub, canConfigure: false, canConsent: false, readOnly: this.deps.readonly(), surface: 'mcp', mcpWrite: scopes.includes('mcp:write'),
            session: {
                actor: resolveTier(id.userContext, principal),
                invoke: { userContext: id.userContext, principal, tenant: id.tenant, ip },
            },
        };
        return { tid: p.tid, userId: p.sub, clientId: p.cid, fam: p.fam, access, scopes, ctx, principal: p };
    }
}

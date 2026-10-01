// ADR-0035 Karar 2/6 / MCP_PLAN MCP-2: "Bagli uygulamalar" (= refresh ailesi) listele / iptal / tumunu kes. Cerezli uclarin (`api/http/mcpRoutes.ts`) mantigi.
//  - Kapsam: kullanicinin KENDI baglantilari; `users:manage` olan icin tenant geneli (`scope=tenant`). Liste HER ZAMAN oturumun `tid`'i ile sinirlidir (tenant izolasyonu).
//  - Iptal: kendi baglantisi ya da `users:manage` ile baskasininki; baskasinin/baska tenant'in ailesi 404 (varlik sizdirilmaz). `FamilyGate.invalidate` ile bu surecte ANINDA,
//    diger replikalarda <= 60 sn (ADR-0035 Karar 2).
//  - Denetim: `mcp.connection.revoked` / `mcp.connections.revoked_all` (belirtec/ozet YOK).
import { AppError } from '@platform/core/errors';
import { getRequestId } from '@platform/core/context';
import { AuditLogger } from '@services/audit/AuditLogger';
import type { FamilyGate } from './familyGate';
import { knownClientName } from './knownClients';
import { redirectHostOf } from './redirect';
import type { OAuthFamilySummary, OAuthStore } from './store';

export interface McpConnectionDto {
    id: string;
    clientName: string;
    known: boolean;
    redirectHost: string;
    tenant: { tid: number; name: string };
    user?: { id: string; email: string };
    scopes: string[];
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string;
}

/** Oturumdan SUNUCUDA cozulmus kimlik (govdeden gelmez). */
export interface ConnectionsSession { tid: number; userId: string; canManageUsers: boolean; ip?: string }

export type ConnectionsAudit = (e: { event: 'mcp.connection.revoked' | 'mcp.connections.revoked_all'; sub: string; tid: number; ip?: string; meta: Record<string, string | number> }) => void;

const defaultAudit: ConnectionsAudit = (e) => {
    const reqId = getRequestId();
    void AuditLogger.log({ event: e.event, result: 'ok', sub: e.sub, tid: e.tid, ip: e.ip, surface: 'app', actorType: 'user', reqId, meta: e.meta });
};

export interface ConnectionsDeps {
    store: Pick<OAuthStore, 'listFamilies' | 'revokeFamily' | 'revokeByTenant' | 'getClient'>;
    gate: Pick<FamilyGate, 'invalidate' | 'clear'>;
    tenantName(tid: number): Promise<string>;
    /** Kullanici kimligi -> e-posta (yalniz `scope=tenant` listesinde, ayni tenant yoneticisine). */
    userEmails(ids: string[]): Promise<Map<string, string>>;
    audit?: ConnectionsAudit;
    now?: () => number;
}

export class ConnectionsService {
    constructor(private readonly d: ConnectionsDeps) { }
    private now(): Date { return new Date((this.d.now ?? Date.now)()); }

    /** `scope=tenant` yalniz `users:manage` (aksi 403 FORBIDDEN). */
    async list(s: ConnectionsSession, scope: 'me' | 'tenant'): Promise<{ items: McpConnectionDto[] }> {
        if (scope === 'tenant' && !s.canManageUsers) throw AppError.of('FORBIDDEN');
        const fams = await this.d.store.listFamilies({ tid: s.tid, ...(scope === 'me' ? { sub: s.userId } : {}) }, this.now());
        if (fams.length === 0) return { items: [] };
        const tenantName = await this.d.tenantName(s.tid);
        const emails = scope === 'tenant' ? await this.d.userEmails([...new Set(fams.map((f) => f.sub))]) : new Map<string, string>();
        const clients = new Map<string, { known: boolean; redirectHost: string }>();
        for (const f of fams) {
            if (clients.has(f.clientId)) continue;
            const c = await this.d.store.getClient(f.clientId);
            clients.set(f.clientId, { known: !!c && !!knownClientName(c.redirectUris), redirectHost: c?.redirectUris[0] ? redirectHostOf(c.redirectUris[0]) : '' });
        }
        return {
            items: fams.map((f) => ({
                id: f.familyId, clientName: f.clientName, ...(clients.get(f.clientId) as { known: boolean; redirectHost: string }),
                tenant: { tid: f.tid, name: tenantName },
                ...(scope === 'tenant' ? { user: { id: f.sub, email: emails.get(f.sub) ?? '' } } : {}),
                scopes: [...f.scopes], createdAt: f.createdAt.toISOString(), lastUsedAt: f.lastUsedAt ? f.lastUsedAt.toISOString() : null, expiresAt: f.expiresAt.toISOString(),
            })),
        };
    }

    /** Tenant genelinde aktif baglanti sayisi (ayar ekrani). */
    async count(tid: number): Promise<number> {
        return (await this.d.store.listFamilies({ tid }, this.now())).length;
    }

    private async findOwned(s: ConnectionsSession, familyId: string): Promise<OAuthFamilySummary> {
        const [fam] = await this.d.store.listFamilies({ tid: s.tid, familyId }, this.now());
        if (!fam || (fam.sub !== s.userId && !s.canManageUsers)) throw AppError.of('NOT_FOUND'); // baska tenant/baska kullanici: varlik sizdirilmaz
        return fam;
    }

    async revoke(s: ConnectionsSession, familyId: string): Promise<void> {
        const fam = await this.findOwned(s, familyId);
        const own = fam.sub === s.userId;
        await this.d.store.revokeFamily(fam.familyId, own ? 'user' : 'admin', this.now());
        this.d.gate.invalidate(fam.familyId);
        (this.d.audit ?? defaultAudit)({ event: 'mcp.connection.revoked', sub: s.userId, tid: s.tid, ip: s.ip, meta: { fam: fam.familyId, clientId: fam.clientId, by: own ? 'self' : 'admin' } });
    }

    /** Sahip/yonetici: tenant'taki TUM baglantilari keser. Donen sayi = kesilen aile sayisi. */
    async revokeAll(s: ConnectionsSession): Promise<{ revoked: number }> {
        if (!s.canManageUsers) throw AppError.of('FORBIDDEN');
        const revoked = await this.d.store.revokeByTenant(s.tid, 'admin', this.now());
        this.d.gate.clear(); // hangi ailelerin kesildigi bilinmez: bu surecin onbellegi tamamen dusurulur (diger replikalar <= 60 sn)
        (this.d.audit ?? defaultAudit)({ event: 'mcp.connections.revoked_all', sub: s.userId, tid: s.tid, ip: s.ip, meta: { count: revoked } });
        return { revoked };
    }
}

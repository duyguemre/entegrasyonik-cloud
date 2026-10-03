import { DatabaseManagerInstance } from '@database/DatabaseManager';
import { ROLE_PERMISSIONS, type Role } from '../../capabilities/roles';
import { legacyRoleOf, membershipSource } from '../membershipAuthz';

// ADR-0035 Karar 2 / ADR-0010 madde 5-6: OAuth kimlik/tenant dogrulama PORTU. Onay ekraninin tenant listesi ve kod/refresh yenilemede
// "kullanici hala gecerli mi" karari burada. Kurallar authenticate hattiyla AYNI kaynaklardan: Users (tokenVersion, isActive, lockUntil),
// Memberships (active), Clients.status == 'ACTIVE'. Platform yoneticisi (ga) icin tenant YOK (OAuth token'i alamaz).
export interface OAuthTenantChoice { tid: number; name: string; role: Role }
export type IdentityCheck = { ok: true; tv: number; role: Role } | { ok: false };

export interface OAuthIdentity {
    /** Kullanicinin secilebilir (aktif uyelik / legacy tenant, tenant ACTIVE) mağazalari. */
    listTenants(sub: string): Promise<OAuthTenantChoice[]>;
    /** Kod/refresh kullaniminda yeniden dogrulama: kullanici aktif + kilitsiz, tenant ACTIVE, uyelik gecerli. `tv` = GUNCEL tokenVersion. */
    check(sub: string, tid: number): Promise<IdentityCheck>;
}

const isSystemRole = (r: unknown): r is Role => typeof r === 'string' && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, r);

async function loadUser(sub: string): Promise<any | null> {
    const app = await DatabaseManagerInstance.getApplicationDB();
    try {
        return await app.getUserModel().findById(sub).lean();
    } catch (e: any) {
        if (e && e.name === 'CastError') return null;
        throw e;
    }
}

const userUsable = (u: any): boolean => !!u && u.isGlobalAdmin !== true && u.isActive !== false && !(u.lockUntil && new Date(u.lockUntil) > new Date());

/** tid -> rol (uyelik kazanir; `membership` kipinde yalniz uyelik, digerlerinde Users.order da sayilir). */
async function roleMap(sub: string, user: any): Promise<Map<number, Role>> {
    const app = await DatabaseManagerInstance.getApplicationDB();
    const rows: Array<{ tid: number; role: string }> = await app.getMembershipModel().find({ userId: sub, status: 'active' }, 'tid role').lean() as any;
    const out = new Map<number, Role>();
    for (const m of rows) if (Number.isInteger(m.tid) && isSystemRole(m.role)) out.set(m.tid, m.role);
    const order = Number(user.order);
    if (membershipSource() !== 'membership' && Number.isInteger(order) && order > 0 && !out.has(order)) {
        out.set(order, legacyRoleOf(user));
    }
    return out;
}

async function activeTenant(tid: number): Promise<boolean> {
    const t = await DatabaseManagerInstance.getTenant(tid);
    return !!t && t.status === 'ACTIVE';
}

export function createDbIdentity(): OAuthIdentity {
    return {
        async listTenants(sub) {
            const user = await loadUser(sub);
            if (!userUsable(user)) return [];
            const roles = await roleMap(sub, user);
            const tids = [...roles.keys()];
            if (tids.length === 0) return [];
            const app = await DatabaseManagerInstance.getApplicationDB();
            const docs: Array<{ order: number; title?: string; name?: string }> = await app.getClientModel().find({ order: { $in: tids } }, 'order title name').lean() as any;
            const out: OAuthTenantChoice[] = [];
            for (const tid of tids) {
                if (!(await activeTenant(tid))) continue;
                const d = docs.find((x) => x.order === tid);
                out.push({ tid, name: String(d?.title ?? d?.name ?? `#${tid}`).slice(0, 120), role: roles.get(tid) as Role });
            }
            return out.sort((a, b) => a.tid - b.tid);
        },
        async check(sub, tid) {
            const user = await loadUser(sub);
            if (!userUsable(user)) return { ok: false };
            const role = (await roleMap(sub, user)).get(tid);
            if (!role || !(await activeTenant(tid))) return { ok: false };
            return { ok: true, tv: Number.isInteger(user.tokenVersion) ? user.tokenVersion : 0, role };
        },
    };
}

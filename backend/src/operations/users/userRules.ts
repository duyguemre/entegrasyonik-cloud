import { ApplicationError } from '@platform/core/errors';
import { resolveTier, type TenantTier } from '@platform/core/authz/tier';
import { can } from '@platform/core/authz/can';
import type { Permission } from '../../capabilities/permissions';
import { assertPasswordStrength } from '../account/passwordPolicy';

// [ADR-0028 Karar 5 / WP-A0] Kullanıcı yönetimi hedef-kullanıcı kuralları + parola özet tespiti.
// Rol hiyerarşisi bugün üç örtük alandan türer (owner bayrağı, roleCode, isGlobalAdmin; ADR-0028 A-07). Türetme TEK yerde
// (`roleRank`): Memberships'e geçişte yalnız bu fonksiyon değişir.

export const ROLE_RANK: Record<TenantTier, number> = { member: 1, admin: 2, owner: 3 };

/** Bir kullanıcı belgesinin (merkezi Users; tenant kopyasında owner alanı yoktur) tenant içindeki rol kademesi. */
export function roleRank(userDoc: any): number {
    // resolveTier ile AYNI türetme (tek doğruluk kaynağı): owner:true -> owner; ROLE_ADMIN/ROLE_OWNER -> admin; diğer -> member.
    const tier = resolveTier(userDoc, { ga: false }).tier as TenantTier;
    return ROLE_RANK[tier];
}

/** Yalnızca bir `roleCode` değerinin (atanacak rol) kademesi. `owner` kademesi roleCode ile ASLA verilemez (owner bayrağı ayrı). */
export function roleCodeRank(roleCode: unknown): number {
    return roleRank({ roleCode, owner: false });
}

/** Çağıranın kademesi (doğrulanmış userContext + principal'dan). Platform yöneticisi tenant içinde admin kademesindedir. */
export function actorRank(userContext: any, principal: any): number {
    const tier = resolveTier(userContext, principal).tier;
    return tier ? ROLE_RANK[tier] : 0;
}

const forbidden = (msg: string) => new ApplicationError(msg, 403);

/** Impersonation (`imp:true`) sırasında kullanıcı/rol/parola yazımı yasak (ADR-0028 Karar 9). */
export function assertNotImpersonating(principal: any): void {
    if (principal?.imp === true) throw forbidden('Bu işlem başka bir mağaza görüntülenirken yapılamaz.');
}

/** Atanacak rol, çağıranın kademesini aşamaz. */
export function assertRoleCeiling(actor: number, roleCode: unknown): void {
    if (roleCodeRank(roleCode) > actor) throw forbidden('Kendi yetkinizden yüksek bir rol atayamazsınız.');
}

/** Sahibe (owner) yalnız sahip dokunabilir. */
export function assertOwnerTargetProtection(actor: number, targetRankValue: number): void {
    if (targetRankValue >= ROLE_RANK.owner && actor < ROLE_RANK.owner) throw forbidden('Mağaza sahibi üzerinde yalnızca sahip işlem yapabilir.');
}

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
/** bcrypt özeti mi (biçim: $2a$/$2b$/$2y$ + maliyet + 53 karakter; toplam 60). Uzunluk sezgisi DEĞİL. */
export function isBcryptHash(value: unknown): boolean {
    return typeof value === 'string' && value.length === 60 && BCRYPT_RE.test(value);
}

/**
 * Yönetici yoluyla gelen parola HER ZAMAN düz metindir: hazır özet olarak KABUL EDİLMEZ (aksi halde saldırgan kendi
 * özetini yazar; 60 karakterlik `$2b$...` dizisi de parola politikasında zayıf/yanlış sayılır). Politika uygulanır.
 */
export function assertAdminSuppliedPassword(password: unknown, ctx: { email?: string; name?: string; surname?: string }): string {
    if (isBcryptHash(password)) throw new ApplicationError('Parola özet biçiminde verilemez.', 400, 'WEAK_PASSWORD');
    return assertPasswordStrength(password, ctx);
}

/** [ADR-0028 WP-A1] İzin tabanlı yardımcı: bir kullanıcı belgesinin (merkezi Users; roleRank ile aynı türetme) rolü bu izne sahip mi. */
export function docCan(userDoc: any, permission: Permission): boolean {
    return can(resolveTier(userDoc, { ga: false }), permission).allowed;
}

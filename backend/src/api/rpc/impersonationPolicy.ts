// [B3 / ADR-0026 Karar 4.9.7 / ADR-0028 Karar 9] Impersonation (destek) oturumunda YASAK işlemlerin TEK karar noktası.
// Kural yetenek kaydından türer (servis servis dağıtılmaz): `effect:'destructive'` (hesap/tenant silme, kullanıcı silme, anonimleştirme...),
// `external:true` (dış dünyaya/e-postaya giden: üye daveti, sahiplik devri başlatma, checkout, pazaryeri yazımı), yasak izinler
// (kullanıcı yönetimi, faturalama, tenant dışa aktarma/silme) ve YAZMA olan `integrations:manage` / `tenant:transfer` (entegrasyon sırları, sahiplik).
// `integrations:manage` OKUMALARI (sağlık vb.) destek için açıktır; sırlar zaten hiçbir yanıtta dönmez ('sensitive' maskesi, ADR-0012).
// Yetenek kaydında görünmeyen, hedef kullanıcının kimlik bilgisini değiştiren hesap RPC'leri AÇIK küçük listededir (CREDENTIAL_RPCS);
// `impersonation-policy.test.ts` listedeki her girdinin kayıtta var olduğunu ve beklenen her yasağın türediğini kanıtlar (sürüklenme yakalanır).
import { CAPABILITY_BY_RPC } from '../../capabilities';

/** Tenant sahipliği/ödeme/kullanıcı yönetimi izinleri: okuma dahil yasak (mevcut davranış, ADR-0028 Karar 9). */
export const IMP_DENIED_PERMISSIONS: ReadonlySet<string> = new Set(['users:manage', 'billing:manage', 'tenant:export', 'tenant:delete']);
/** Yalnız YAZMA olarak yasak izinler (okumaları destek için açık). */
export const IMP_DENIED_WRITE_PERMISSIONS: ReadonlySet<string> = new Set(['integrations:manage', 'tenant:transfer']);
/** Hedef kullanıcının kimlik bilgisini/oturum güvenliğini değiştiren hesap işlemleri (kayıtta `self:manage`/`member` görünür). */
export const IMP_DENIED_CREDENTIAL_RPCS: ReadonlySet<string> = new Set([
    'AccountService/changePassword',
    'AccountService/reauthenticate',
    'UserService/acceptOwnershipTransfer',
]);

export type ImpersonationDenial = 'destructive' | 'external' | 'permission' | 'write-permission' | 'credential';

/** Bu RPC impersonation oturumunda reddedilmeli mi? Kayıtsız (drift) RPC'de karar üretmez (varsayılan ret `getRequiredTier`'da). */
export function impersonationDenial(rpc: string): ImpersonationDenial | undefined {
    if (IMP_DENIED_CREDENTIAL_RPCS.has(rpc)) return 'credential';
    const cap = CAPABILITY_BY_RPC.get(rpc);
    if (!cap) return undefined;
    if (cap.effect === 'destructive') return 'destructive';
    if (cap.external === true) return 'external';
    if (IMP_DENIED_PERMISSIONS.has(cap.permission)) return 'permission';
    if (cap.effect !== 'read' && IMP_DENIED_WRITE_PERMISSIONS.has(cap.permission)) return 'write-permission';
    return undefined;
}

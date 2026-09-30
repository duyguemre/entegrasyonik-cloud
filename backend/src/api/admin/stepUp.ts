// ADR-0026 Karar 4.6: adim-yukseltmesi (step-up). `effect:'destructive'` her yetenek + asagidaki `requiresReauth` islemleri son 5 dk icinde
// parola + TOTP ile yeniden dogrulama ister (`reauth_at` claim'i); yoksa `401 REAUTH_REQUIRED`. Bu islemler ayrica GEREKCE (>=10 karakter)
// ister; gerekce audit `meta.reason` alanina yazilir.
//
// SAPMA (gerekce): ADR/plan `requiresReauth` alanini yetenek tipine (capabilities/types.ts, S6) koymayi ongorur. O dosyalar baska
// paralel isle paylasimli oldugundan bu paket, `requiresReauth` kararini bu MODULDE tek kayit olarak tutar (`REAUTH_RPCS`);
// yetenek alani geldiginde yalniz bu kume bosaltilip `cap.requiresReauth` okunur (davranis ayni). Yeni servis eklerken buraya girin.
import { CAPABILITY_BY_RPC } from '../../capabilities';
import { ApplicationError } from '@api/Security';
import { ADMIN_REAUTH_SECONDS, type AdminPrincipal } from './adminSession';

export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

/** Destructive olmasa da step-up isteyen islemler (ADR Karar 4.6 listesi). Henuz var olmayan Backoffice* servisleri onceden listelenir (yoksa 403). */
export const REAUTH_RPCS: ReadonlySet<string> = new Set([
    'IntegrationConfigService/publish',
    'IntegrationConfigService/rollback',
    'IntegrationConfigService/setIntake',
    'BackofficeTenantService/startImpersonation',
    'BackofficeTenantService/cancelDeletion',
    'TenantDataService/cancelDeletion',
    'BackofficeBillingService/extendTrial',
    'BackofficeBillingService/cancelSubscription',
    'BackofficeBillingService/changePlan',
    'BackofficeAdminUserService/invite',
    'BackofficeAdminUserService/disable',
    'BackofficeAdminUserService/enable',
    'BackofficeAdminUserService/resetMfa',
    'BackofficeInfraService/flushCacheFamily',
    'BackofficeEngineService/retryJob',
    'BackofficeEngineService/discardJob',
    'BackofficeEngineService/releaseStuckLease',
    // ADR-0029 NB7/NB8: yazan bildirim/duyuru/uyari uclari (toplu e-posta dahil) step-up + gerekce
    'BackofficeNotificationService/createAnnouncement',
    'BackofficeNotificationService/updateAnnouncement',
    'BackofficeNotificationService/scheduleAnnouncement',
    'BackofficeNotificationService/cancelAnnouncement',
    'BackofficeNotificationService/retryDelivery',
    'BackofficeNotificationService/discardDelivery',
    'BackofficeNotificationService/sendTestEmail',
    'BackofficeNotificationService/muteAlert',
]);

/** Tenant PII'sine dokunan okumalar (`backoffice.sensitive_read` audit). Yetenekte `pii !== 'none'` olanlar da eklenir. */
export const SENSITIVE_READ_RPCS: ReadonlySet<string> = new Set([
    'AdminService/getClients',
    'AdminService/getClientStats',
    'AdminService/getClientIntegrations',
    'AdminService/getTickets',
    'BackofficeTenantService/getLifecycle',
]);

export function requiresStepUp(rpc: string): boolean {
    const cap = CAPABILITY_BY_RPC.get(rpc);
    return cap?.effect === 'destructive' || REAUTH_RPCS.has(rpc);
}

export function isSensitiveRead(rpc: string): boolean {
    const cap = CAPABILITY_BY_RPC.get(rpc);
    return SENSITIVE_READ_RPCS.has(rpc) || (!!cap && cap.effect === 'read' && cap.pii !== 'none');
}

/** Son `windowSec` icinde yeniden dogrulama var mi? (auth_time DEGIL, `reauth_at`.) */
export function isFreshReauth(p: Pick<AdminPrincipal, 'reauth_at'>, nowMs: number = Date.now(), windowSec: number = ADMIN_REAUTH_SECONDS): boolean {
    return typeof p.reauth_at === 'number' && Math.floor(nowMs / 1000) - p.reauth_at <= windowSec && p.reauth_at <= Math.floor(nowMs / 1000) + 5;
}

/** `requireStepUp(5dk)`: yoksa 401 REAUTH_REQUIRED. */
export function requireStepUp(p: Pick<AdminPrincipal, 'reauth_at'>, nowMs: number = Date.now()): void {
    if (!isFreshReauth(p, nowMs)) throw new ApplicationError('Bu işlem için yeniden doğrulama gerekli.', 401, 'REAUTH_REQUIRED');
}

/** Gerekce: string, kirpilmis >=10 karakter. Aksi 400 VALIDATION. Dondurulen deger kirpilmis+kisitli gerekcedir. */
export function requireReason(body: unknown): string {
    const reason = typeof (body as any)?.reason === 'string' ? (body as any).reason.trim() : '';
    if (reason.length < REASON_MIN_LENGTH) {
        throw new ApplicationError(`Gerekçe (reason) en az ${REASON_MIN_LENGTH} karakter olmalı.`, 400, 'VALIDATION');
    }
    return reason.slice(0, REASON_MAX_LENGTH);
}

// ADR-0018 Karar 2 "Alarm" / ADR-0017 R12 / ADR-0029 NB8: onaylanmis yuksek onemli uyum bulgusu -> platform bildirimi (`PLATFORM_COMPLIANCE_FINDING`).
// `FindingService.setAlertHook` bootstrap'ta buna baglanir. Bulgu icerigi/kanit bildirime GIRMEZ (yalniz kisa kimlik + entegrasyon kodu + onem).
// Golge modda (ALERT_SHADOW_UNTIL) yalniz defter. Hata/bastirma bulgu kaydini etkilemez.
import type { AlertContext, AlertHook, ChangeNoticeContext, ChangeNoticeHook } from '@integration/compliance/FindingService';
import type { NotifyOptions, NotifyResult } from '../notifications/notify';
import type { PlatformNotifyOptions } from '../notifications/platformNotify';

export interface FindingAlertDeps {
    platformNotify(code: string, params: Record<string, unknown>, opts?: PlatformNotifyOptions): Promise<NotifyResult>;
    /** Golge mod acik mi (evaluator ile ayni kural). */
    shadow(): boolean;
}

export function createFindingAlertHook(d: FindingAlertDeps): AlertHook {
    return async (c: AlertContext) => {
        await d.platformNotify('PLATFORM_COMPLIANCE_FINDING', { findingId: c.findingId, integ: c.integrationCode, level: 'warning' }, { idempotencyKey: `finding:${c.findingId}`, shadow: d.shadow(), module: 'compliance' });
    };
}

export interface ChangeNoticeDeps {
    tenantNotify(code: string, tid: number, params: Record<string, unknown>, opts?: NotifyOptions): Promise<NotifyResult>;
    shadow(): boolean;
}

/** ADR-0018 "Tenant görünürlüğü" / ADR-0029 NB8: `accepted` + severity ≥ high bulgu -> etkilenen her tenant'a `INTEGRATION_CHANGE_NOTICE`
 *  (kritik: warning, yüksek: info). Tekilleştirme katalogdaki `dedupeKey` (findingId) ile; tek tenant hatası diğerlerini durdurmaz. */
export function createChangeNoticeHook(d: ChangeNoticeDeps): ChangeNoticeHook {
    return async (c: ChangeNoticeContext) => {
        const level = c.severity === 'critical' ? 'warning' : 'info';
        for (const tid of c.tenants) {
            await d.tenantNotify('INTEGRATION_CHANGE_NOTICE', tid, { integ: c.integrationCode, findingId: c.findingId, level }, { module: 'compliance', shadow: d.shadow() }).catch(() => undefined);
        }
    };
}

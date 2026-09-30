// ADR-0018 Karar 2 "Alarm" / ADR-0017 R12 / ADR-0029 NB8: onaylanmis yuksek onemli uyum bulgusu -> platform bildirimi (`PLATFORM_COMPLIANCE_FINDING`).
// `FindingService.setAlertHook` bootstrap'ta buna baglanir. Bulgu icerigi/kanit bildirime GIRMEZ (yalniz kisa kimlik + entegrasyon kodu + onem).
// Golge modda (ALERT_SHADOW_UNTIL) yalniz defter. Hata/bastirma bulgu kaydini etkilemez.
import type { AlertContext, AlertHook } from '@integration/compliance/FindingService';
import type { NotifyResult } from '../notifications/notify';
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

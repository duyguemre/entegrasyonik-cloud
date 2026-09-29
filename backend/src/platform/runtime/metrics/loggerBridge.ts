// ADR-0017 Karar 2.4: `platform/core/logger`'ın `setErrorHook` genişleme noktasını (Sv2, bağımlılığı TERSİNE
// çevrilmiş) burada (Sv5, `logger`'a bağımlı olabilir) DOLDURUR. `logger.error(...)` çağrılan HER yerde
// (60 sn'lik taşkın denetiminden BAĞIMSIZ) bir `ErrorEvent` kaydı üretir (kendi 10 sn'lik penceresiyle).
import { setErrorHook } from '@platform/core/logger';
import { recordErrorEvent } from './errorEvents';

/** Bootstrap'te bir kez çağrılır (ADR-0017 Aşama A'daki `installConsoleBridge()` ile AYNI desen). */
export function installErrorEventLoggerBridge(): void {
    setErrorHook((payload) => {
        recordErrorEvent({
            source: 'server',
            module: payload.module,
            code: payload.code,
            message: payload.message,
            stack: payload.stack,
            tenantId: payload.tenantId,
            corrId: payload.corrId,
        });
    });
}

/** Yalnız testler için: kancayı kaldırır. */
export function uninstallErrorEventLoggerBridgeForTests(): void {
    setErrorHook(undefined);
}

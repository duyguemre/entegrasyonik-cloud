// MOB-08 / K55: müşteri yüzeyi RPC'lerinde günlük aktif kullanım kaydı (tenant + gün + platform). Fail-open, istek beklemez.
// Sayılmaz: tenant'sız oturum, platform yöneticisi (ga) ve impersonation (destek oturumu müşteri kullanımı değildir).
import type { SessionPrincipal } from '@platform/core/security/Security';
import { isClientPlatform } from '@platform/core/context';
import { UsageRecorder } from '../operations/usage/usageRecorder';

let recorder: UsageRecorder | undefined;
let injected = false;

function productionRecorder(): UsageRecorder {
    if (!recorder) {
        recorder = new UsageRecorder({
            model: async () => {
                // eslint-disable-next-line @typescript-eslint/no-require-imports -- tembel yükleme: bu modülü yüklemek DB katmanını yüklemez
                const { DatabaseManagerInstance } = (require('@database/DatabaseManager') as typeof import('@database/DatabaseManager'));
                const db = await DatabaseManagerInstance.getApplicationDB();
                return db.getUsageDailyModel();
            },
        });
    }
    return recorder;
}

/** Yalnız testler: üretim kaydedicisini değiştirir (undefined → varsayılan). */
export function setUsageRecorderForTests(r: UsageRecorder | undefined): void { recorder = r; injected = r !== undefined; }

export function recordUsageActivity(principal: Partial<SessionPrincipal> | undefined, platform: unknown): void {
    // USAGE_RECORD_DISABLED=true yalnız test/geliştirme (jest setup açar; AUDIT_LOG_DISABLED ile aynı desen).
    if (process.env.USAGE_RECORD_DISABLED === 'true' && !injected) return;
    if (!principal || principal.imp || principal.ga || typeof principal.sub !== 'string') return;
    const tid = Number(principal.tid);
    if (!Number.isInteger(tid) || tid <= 0 || !isClientPlatform(platform)) return;
    void productionRecorder().record({ tid, sub: principal.sub, platform });
}

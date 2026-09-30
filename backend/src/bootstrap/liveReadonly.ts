// LIVE-RO Katman B (açılış): canlı salt-okuma kipi (`LIVE_READONLY=1`) ön koşulları + açılış özeti. Docs: docs/LIVE_READONLY.md.
// Katman A (ağ: dev-tools/live-readonly-guard.js) ayrı süreç-öncesi yüklemedir; burada onun YÜKLÜ olduğu doğrulanır (ikinci kilit).
import { config } from '@config';
import { isLocalDbUrl, liveReadHostPatterns } from '@integration/modules/common/security/liveReadonlyPolicy';
import { SCHEDULES, LIVE_READONLY_SCHEDULE_IDS } from './schedules';

/** dev-tools/live-readonly-guard.js'in kurduğu işaret. */
export const LIVE_READONLY_GUARD_MARK = Symbol.for('entegrasyonik.liveReadonly.egressGuard');

/** Kip açık mı? (tek okuma noktası: `@config`) */
export function isLiveReadonly(): boolean {
    return config.liveReadonly.enabled;
}

/** Bu kipte BAŞLATILMAYAN motor bileşenleri (özet/log için; gerçek kapı IntegrationEngine + schedules'tadır). */
export const LIVE_READONLY_STOPPED_ENGINE = ['ExportOrchestrator (Dispatcher/Validator/Publisher/Sentinel/Sync)', 'OrderOrchestrator (+BullMQ sipariş işçisi, zamanlanmış sipariş çekimi)'] as const;

/** Ön koşullar sağlanmazsa FIRLATIR (süreç `bootApplication` tarafından kapatılır). Kip kapalıysa no-op. */
export function assertLiveReadonlyBoot(): void {
    if (!config.liveReadonly.enabled) return;
    if (!(globalThis as any)[LIVE_READONLY_GUARD_MARK]) {
        throw new Error('[live-readonly] Ağ katmanı (dev-tools/live-readonly-guard.js) yüklü değil; yalnızca `npm run start:live-readonly` ile başlatın.');
    }
    if (!isLocalDbUrl(config.db.url)) {
        throw new Error('[live-readonly] DB_URL yerel (127.0.0.1/localhost) bir MongoDB\'ye işaret etmiyor; Atlas\'a dokunulmaz.');
    }
    const mockOn = Object.entries(config.mock).filter(([, m]) => m.enabled).map(([p]) => p);
    if (mockOn.length) throw new Error(`[live-readonly] Mock kipleri açık (${mockOn.join(', ')}); bu kipte kapalı olmalı.`);
}

/** Açılış özeti (sır YOK: yalnız host desenleri, işçi/zamanlayıcı adları). */
export function liveReadonlyBootSummary() {
    return {
        mode: 'LIVE_READONLY',
        allowedHosts: liveReadHostPatterns(),
        methodsAllowed: ['GET', 'HEAD', 'POST: yalnız token ucu / N11 SOAP okuma operasyonları / Pazarama liste uçları (politika allowlist)'],
        tokenRefreshAllowedFor: config.liveReadonly.allowTokenRefresh,
        stoppedEngine: [...LIVE_READONLY_STOPPED_ENGINE],
        runningEngine: ['ImportOrchestrator (yalnız kullanıcı tetiklemeli içe alma; Stager/Importer)'],
        runningSchedules: [...LIVE_READONLY_SCHEDULE_IDS],
        stoppedSchedules: SCHEDULES.map(s => s.id).filter(id => !LIVE_READONLY_SCHEDULE_IDS.includes(id)),
        writeRpcs: '423 LIVE_READONLY (yetenek kaydı: external && effect!==read; istisna requestFetchFromPlatform)',
    };
}

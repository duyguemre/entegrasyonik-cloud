// ADR-0020 Karar 3.6 (Aşama B) — süreç-içi (bellek) "son bilinen yayınlanmış yapılandırma" deposu.
//
// `ConfigHeadPollScheduler` bu depoyu 15 sn'de bir günceller (`config-head-poll`, ADR-0017 JobRunRegistry altında).
// `ConfigResolver.resolveEffectiveConfig` bu depoyu YALNIZ çağıran açıkça `readPlatformOverride` GEÇMEDİYSE dener
// (bkz. ConfigResolver.ts `resolveWithPublishedOverridesFallback` — mevcut Aşama A karakterizasyon testi "opts
// verilmezse HİÇ çağrılmaz" davranışını KORUR, bkz. rapor: bilinçli, dar bir entegrasyon noktası).
//
// DB okunamazsa (Karar 3.6 son madde): son bilinen durum KORUNUR (fail-open, bilinçli). 3 ardışık hatada `warn` log +
// ADR-0017 sistem uyarısı (bkz. `notifySystemWarning`).
import { logger } from '@platform/core/logger';

export interface TargetOverrideState {
    version: number;
    overrides: Readonly<Record<string, unknown>>;
}

const state = new Map<string, TargetOverrideState>();
let consecutiveFailures = 0;
let lastSuccessAt: Date | undefined;
let lastFailureAt: Date | undefined;
let warnedForCurrentStreak = false;

/** Yalnız `ConfigHeadPollScheduler` çağırır: bir hedefin yayınlanmış görünümünü (varsa) ayarlar. */
export function setTargetOverride(target: string, version: number, overrides: Record<string, unknown>): void {
    state.set(target, { version, overrides: { ...overrides } });
}

/** Bir hedefin şu an bilinen yayın sürümü (hiç bilinmiyorsa 0 — `IntegrationFactory` önbellek anahtarı için). */
export function getKnownVersion(target: string): number {
    return state.get(target)?.version ?? 0;
}

/** Bir anahtarın yayınlanmış (platform) değeri; yoksa `undefined`. */
export function getPublishedOverrideValue(target: string, key: string): unknown | undefined {
    const t = state.get(target);
    if (!t) return undefined;
    return Object.prototype.hasOwnProperty.call(t.overrides, key) ? t.overrides[key] : undefined;
}

export function recordPollSuccess(now: () => Date = () => new Date()): void {
    consecutiveFailures = 0;
    warnedForCurrentStreak = false;
    lastSuccessAt = now();
}

/** 3 ardışık hatada BİR KEZ `warn` + sistem uyarısı üretir (aynı seri sürerken tekrar tekrar loglamaz). */
export function recordPollFailure(now: () => Date = () => new Date()): void {
    consecutiveFailures += 1;
    lastFailureAt = now();
    if (consecutiveFailures >= 3 && !warnedForCurrentStreak) {
        warnedForCurrentStreak = true;
        logger.warn(
            { module: 'config-head-poll', consecutiveFailures },
            'IntegrationConfigHeads 3 ardışık kez okunamadı; son bilinen yapılandırma kullanılıyor (fail-open, ADR-0020 Karar 3.6).',
        );
        notifySystemWarning(`config-head-poll: ${consecutiveFailures} ardışık hata — son bilinen yapılandırma kullanılıyor.`);
    }
}

/**
 * ADR-0017 sistem uyarısı KANCASİ. Bu görev sırasında ADR-0017'de genel bir "sistem uyarısı" kayıt mekanizması
 * (ör. `SystemWarnings` koleksiyonu / health bandı) henüz KODDA yok (yalnız `IntegrationHealthItem` kavramı ADR
 * metninde var). Bu yüzden bu fonksiyon şimdilik yapılandırılmış bir `logger.error` ile "yüksek görünürlük" sağlar
 * ve test edilebilir tek bir enjeksiyon noktası sunar (`setSystemWarningSink`) — ADR-0017'nin gerçek mekanizması
 * yazıldığında burası ona bağlanır (rapora yazılan bilinçli bir ara-durum, davranış DEĞİŞMEDEN).
 */
export type SystemWarningSink = (message: string) => void;
let systemWarningSink: SystemWarningSink = (message: string) => logger.error({ module: 'config-head-poll' }, message);

export function notifySystemWarning(message: string): void {
    try { systemWarningSink(message); } catch { /* uyarı asla akışı bozmaz */ }
}

export function setSystemWarningSink(sink: SystemWarningSink | undefined): void {
    systemWarningSink = sink ?? ((message: string) => logger.error({ module: 'config-head-poll' }, message));
}

export function getPollDiagnosticsForTests(): { consecutiveFailures: number; lastSuccessAt?: Date; lastFailureAt?: Date; targets: string[] } {
    return { consecutiveFailures, lastSuccessAt, lastFailureAt, targets: [...state.keys()] };
}

/** Yalnız testler: depoyu ve sayaçları sıfırlar. */
export function resetPlatformOverrideStoreForTests(): void {
    state.clear();
    consecutiveFailures = 0;
    warnedForCurrentStreak = false;
    lastSuccessAt = undefined;
    lastFailureAt = undefined;
    systemWarningSink = (message: string) => logger.error({ module: 'config-head-poll' }, message);
}

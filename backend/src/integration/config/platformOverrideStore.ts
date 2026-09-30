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

// ---------------------------------------------------------------------------------------------------------------------
// ADR-0020 Karar 3.8 (Aşama D) — kill-switch/bakım OKUMA yüzeyi. `ConfigHeadPollScheduler.pollOnce` HER turda
// (sürüm değişmese bile, `intake` yayın akışının DIŞINDadır — Karar 3.8 son paragraf) `setTargetIntake` çağırır;
// `IntegrationConfigService.setIntake` de YEREL pod'da ANINDA senkronlar (diğer pod'lar ≤15 sn'de yoklamayla alır).
//
// Bu dosya OKUNABİLİR durumu sağlar. Motor tüketicileri (ADR-0030 X6) durumu doğrudan değil `intakeGate.ts`
// üzerinden okur (global `_engine` + entegrasyon başına birleşik karar, atlama metriği + log).
// ---------------------------------------------------------------------------------------------------------------------
export type IntakeValue = 'on' | 'drain' | 'off';
export interface IntakeMaintenance { message?: { tr?: string; en?: string }; until?: Date }

const intakeState = new Map<string, { intake: IntakeValue; maintenance?: IntakeMaintenance }>();
const longIntakeWarned = new Set<string>();
/** Karar 3.8: "`drain/off` 24 saati aşarsa ADR-0017 uyarısı üretilir". */
const INTAKE_WARNING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** `ConfigHeadPollScheduler` (her turda, TÜM hedefler) VE `IntegrationConfigService.setIntake` (yerel pod, anında) çağırır. */
export function setTargetIntake(target: string, intake: IntakeValue, maintenance?: IntakeMaintenance): void {
    intakeState.set(target, { intake, maintenance: maintenance ? { ...maintenance } : undefined });
}

/** Bilinmeyen hedef → `'on'` (ADR §3.1 `IntegrationConfigHeads.intake` varsayılanıyla TUTARLI: hiç Head yoksa `'on'`). */
export function getIntake(target: string): IntakeValue {
    return intakeState.get(target)?.intake ?? 'on';
}

/** Karar 3.8 "drain: yeni iş alınmaz" — motor tüketicileri için tek satırlık okunabilir kapı (BAĞLANMADI, yukarı bkz). */
export function isIntakeOpen(target: string): boolean {
    return getIntake(target) === 'on';
}

/** Kapı yardımcıları için: `on` OLMAYAN hedefler (ucuz; bellek içi harita). */
export function listNonOpenIntakeTargets(): Array<{ target: string; intake: IntakeValue }> {
    const out: Array<{ target: string; intake: IntakeValue }> = [];
    for (const [target, s] of intakeState) if (s.intake !== 'on') out.push({ target, intake: s.intake });
    return out;
}

export function getMaintenance(target: string): IntakeMaintenance | undefined {
    return intakeState.get(target)?.maintenance;
}

/**
 * Karar 3.8 "24 saati aşarsa ADR-0017 uyarısı" — AYNI `notifySystemWarning` kancasını kullanır (gerçek ADR-0017
 * mekanizması (SystemWarnings/health bandı) henüz KODDA yok, bkz. dosya başı notu; no-op/log kalır). Bir hedef
 * `'on'`a dönene kadar YALNIZ BİR KEZ uyarır (poll'un her 15 sn'de tekrar tekrar uyarmaması için).
 */
export function checkIntakeDurationWarning(target: string, intake: IntakeValue, since: Date | undefined, now: () => Date = () => new Date()): void {
    if (intake === 'on') { longIntakeWarned.delete(target); return; }
    if (longIntakeWarned.has(target)) return;
    const sinceMs = since instanceof Date ? since.getTime() : NaN;
    if (!Number.isFinite(sinceMs)) return;
    if (now().getTime() - sinceMs >= INTAKE_WARNING_THRESHOLD_MS) {
        longIntakeWarned.add(target);
        notifySystemWarning(`${target}: entegrasyon '${intake}' durumunda 24 saati aştı (ADR-0020 Karar 3.8).`);
    }
}

export function getIntakeDiagnosticsForTests(): { entries: Array<{ target: string; intake: IntakeValue }>; warned: string[] } {
    return { entries: [...intakeState.entries()].map(([target, s]) => ({ target, intake: s.intake })), warned: [...longIntakeWarned] };
}

/** Yalnız testler: depoyu ve sayaçları sıfırlar. */
export function resetPlatformOverrideStoreForTests(): void {
    state.clear();
    intakeState.clear();
    longIntakeWarned.clear();
    consecutiveFailures = 0;
    warnedForCurrentStreak = false;
    lastSuccessAt = undefined;
    lastFailureAt = undefined;
    systemWarningSink = (message: string) => logger.error({ module: 'config-head-poll' }, message);
}

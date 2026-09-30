// ADR-0030 X6 — kill-switch'in (ADR-0020 Karar 3.8 `intake`) motor tüketicilerine tek kapısı.
//
// Granülerlik = mevcut model: global (`_engine` hedefi) + entegrasyon başına. Tenant boyutu YOK (icat edilmedi).
// Etkin durum en kısıtlayıcı olandır (off > drain > on). Anlam:
//  - `drain`: YENİ iş alınmaz (yeni sinyal/kuyruk kaydı/dış çekme); süren iş biter.
//  - `off`  : hiçbir dış çağrı yapılmaz; kuyruktaki/yarım işler SİLİNMEZ, açılınca kaldığı yerden devam eder.
// Okuma bellek içi haritadan (ConfigHeadPollScheduler 15 sn'de + setIntake yerelde anında besler): DB'ye gitmez.
import { eventLog } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics/MetricsRegistry';
import { ENGINE_TARGET } from './targets';
import { getIntake, listNonOpenIntakeTargets, type IntakeValue } from './platformOverrideStore';

const log = eventLog('engine', 'intakeGate');

const RANK: Record<IntakeValue, number> = { on: 0, drain: 1, off: 2 };

/** Etkin durum: `_engine` ile entegrasyonun en kısıtlayıcısı. */
export function effectiveIntake(integrationCode?: string): IntakeValue {
    const eng = getIntake(ENGINE_TARGET);
    const integ = integrationCode ? getIntake(integrationCode) : 'on';
    return RANK[eng] >= RANK[integ] ? eng : integ;
}

/** YENİ iş üreten girişler (yeni sinyal, kuyruk kaydı, dış çekme başlatma): yalnız `on`. */
export function allowNewWork(integrationCode?: string): boolean {
    return effectiveIntake(integrationCode) === 'on';
}

/** Süren işin dış çağrı yaptığı aşamalar: `off` dışında (drain'de) devam eder. */
export function allowInFlightWork(integrationCode?: string): boolean {
    return effectiveIntake(integrationCode) !== 'off';
}

/** Süren iş aşamalarında (`off`) sinyal seçiminden dışlanacak entegrasyonlar; `all:true` = global kapalı. */
export function inFlightBlocked(): { all: boolean; codes: string[] } {
    let all = false;
    const codes: string[] = [];
    for (const { target, intake } of listNonOpenIntakeTargets()) {
        if (intake !== 'off') continue;
        if (target === ENGINE_TARGET) all = true; else codes.push(target);
    }
    return { all, codes };
}

/** Herhangi bir kısıt var mı (döngü bekleme süresini kısaltmak için). */
export function anyIntakeRestricted(): boolean {
    return listNonOpenIntakeTargets().length > 0;
}

/** Atlamayı metrik + log ile kaydeder (asla fırlatmaz). */
export function recordIntakeSkip(consumer: string, integrationCode: string | undefined, kind: 'new' | 'inflight'): void {
    try {
        const state = effectiveIntake(integrationCode);
        metricsRegistry.incCounter('integration_intake_skipped', { consumer, integration: integrationCode ?? 'all', intake: state });
        log.warn('INTAKE_SKIPPED', `Kill-switch (${state}) nedeniyle ${consumer} atlandı; iş ertelendi.`, { integrationCode, kind });
    } catch { /* gözlem asla akışı bozmaz */ }
}

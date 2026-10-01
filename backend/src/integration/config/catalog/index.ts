// ADR-0020 Karar 2.3 — ayar kataloğunun BİRLEŞİK, salt-okunur görünümü. Saf; I/O yapmaz.
import type { SettingDef } from '../types';
import { ALL_ENGINE_SETTINGS } from './engine';
import { FINANCE_SETTINGS } from './finance';
import { INTEGRATION_HTTP_SETTINGS } from './integrationHttp';
import { MOCK_SETTINGS } from './mock';
import { PLATFORM_SETTINGS } from './platform';
import { FEATURE_SETTINGS } from './features';
import { ALERT_SETTINGS } from './alerts';

/**
 * [ADR-0020 Karar 3.1 `catalogVersion`, Aşama B] Kod ↔ DB uyumluluğu için sürüm damgası. Katalog anahtar KÜMESİ
 * (silme/ekleme) değişirse elle artırılır. Eski bir `catalogVersion` taşıyan revizyon okunduğunda
 * `IntegrationConfigService` yalnız BİLGİ amaçlı bir uyarı üretir (davranışı DEĞİŞTİRMEZ, ADR §A5).
 */
export const CATALOG_VERSION = '2026-10-01.b5';

/** Kod tabanının bugünkü (Aşama A, ADR-0020) TÜM ayar tanımları. Anahtar (`key`) BENZERSİZDİR (tutarlılık testi). */
export const SETTINGS_CATALOG: readonly SettingDef<any>[] = [
    ...ALL_ENGINE_SETTINGS,
    ...INTEGRATION_HTTP_SETTINGS,
    ...MOCK_SETTINGS,
    ...PLATFORM_SETTINGS,
    ...FEATURE_SETTINGS,
    ...FINANCE_SETTINGS,
    ...ALERT_SETTINGS,
];

export function listSettings(): SettingDef<any>[] {
    return [...SETTINGS_CATALOG];
}

export function getSettingDef(key: string): SettingDef<any> | undefined {
    return SETTINGS_CATALOG.find((s) => s.key === key);
}

export function listSettingsByGroup(group: SettingDef<any>['group']): SettingDef<any>[] {
    return SETTINGS_CATALOG.filter((s) => s.group === group);
}

export * from './engine';
export * from './finance';
export * from './integrationHttp';
export * from './mock';
export * from './platform';
export * from './features';

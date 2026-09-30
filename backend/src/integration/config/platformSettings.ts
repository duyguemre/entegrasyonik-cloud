// ADR-0031 BE-CFG-2 — `_platform` ayarlarının OKUMA yardımcısı. Bellek-içi `platformOverrideStore` (15 sn'lik
// `config-head-poll` doldurur) ile katalog varsayılanının birleşimi; DB okumaz (fail-open: store boşsa varsayılan).
import { getSettingDef, listSettings } from './catalog';
import { getKnownVersion, getPublishedOverrideValue } from './platformOverrideStore';
import { PLATFORM_TARGET } from './targets';
import type { SettingDef } from './types';

/** Tek `_platform` anahtarı: yayınlanmış değer, yoksa katalog varsayılanı. Yayınlanan değer şemayı geçmezse varsayılan (savunma). */
export function getPlatformSetting<T = unknown>(key: string): T {
    const def = getSettingDef(key);
    if (!def || def.scope !== 'platform') throw new Error(`Bilinmeyen platform ayarı: ${key}`);
    const v = getPublishedOverrideValue(PLATFORM_TARGET, key);
    if (v !== undefined && def.schema.safeParse(v).success) return v as T;
    return def.default as T;
}

/** `exposure:'public'` platform anahtarları (public-config'in izin listesi kaynağı). */
export function listPublicPlatformSettings(): SettingDef<any>[] {
    return listSettings().filter((s) => s.scope === 'platform' && s.exposure === 'public');
}

/** `_platform` yayın sürümü (hiç yayın yoksa 0). */
export function getPlatformVersion(): number {
    return getKnownVersion(PLATFORM_TARGET);
}

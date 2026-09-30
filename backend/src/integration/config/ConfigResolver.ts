// ADR-0020 Karar 1 — katmanlı çözümleyici (Aşama A: SALT OKUMA; `platform`/`tenant` katmanları iskelet, her zaman boş
// döner — Aşama B'de `IntegrationConfigRevisions`/`ClientIntegrations.<kategori>[].settings` doldurulur).
//
// Sıra (ADR §1.1): `env ?? tenant(Aşama B) ?? platform(Aşama B) ?? legacy(bu katalogdaki anahtarlar için YOK — yalnız
// `resolveLegacyIntegrationRecord` ile ayrı okunur, bkz. o dosya) ?? default`.
//
// BİLİNÇLİ SINIRLAMA (rapor edilir): bu çözümleyici yalnız `SETTINGS_CATALOG`'daki TİPLİ (int/duration/bool/...) ayarları
// çözer. `Integrations.urls` (host/yol) BURADAN OKUNMAZ — descriptor.ts dosyalarına `config.hosts/endpoints` alanı bu
// görevde EKLENEMEDİ (görev kısıtı: descriptor'lara yalnız oku/referans ver). URL/host çözümü `legacyIntegrationRecord.ts`
// içinde AYRI ve bugünküyle BİREBİR AYNI davranışla yapılır.
import { getSettingDef } from './catalog';
import { isPerIntegrationDefault, type ResolvedSetting, type SettingDef } from './types';
import { getPublishedOverrideValue, getKnownVersion } from './platformOverrideStore';
import { ENGINE_TARGET, PLATFORM_TARGET } from './targets';

export interface ResolveOptions {
    /** Yalnız `scope==='integration'|'engine+integration'` anahtarlar için: hangi entegrasyon kodu. */
    integrationCode?: string;
    /** Test/gelecek Aşama B kancası: platform katmanı okuyucusu (Aşama A'da HER ZAMAN `undefined` döner varsayılan). */
    readPlatformOverride?: (key: string, integrationCode?: string) => { value: unknown; revision: number } | undefined;
    /** Test/gelecek Aşama B kancası: tenant katmanı okuyucusu (Aşama A'da HER ZAMAN `undefined` döner varsayılan). */
    readTenantOverride?: (key: string, integrationCode?: string) => unknown | undefined;
}

export class UnknownSettingError extends Error {
    constructor(key: string) {
        super(`Bilinmeyen ayar anahtarı (katalogda yok): ${key}`);
        this.name = 'UnknownSettingError';
    }
}

function pickDefault<T>(def: SettingDef<T>, integrationCode?: string): T {
    const d = def.default;
    if (isPerIntegrationDefault<T>(d)) {
        if (integrationCode && Object.prototype.hasOwnProperty.call(d, integrationCode)) return (d as any)[integrationCode];
        return d._;
    }
    return d as T;
}

/** Env değerini ayar tipine göre ayrıştırır. Geçersiz/boş -> `undefined` (çağıran varsayılana düşer — ADR'nin lenient okuma ilkesi). */
function parseEnvValue<T>(def: SettingDef<T>, raw: string): T | undefined {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    switch (def.type) {
        case 'bool':
            if (trimmed === 'true') return true as unknown as T;
            if (trimmed === 'false') return false as unknown as T;
            return undefined;
        case 'int':
        case 'duration': {
            const n = Number(trimmed);
            return Number.isFinite(n) ? (n as unknown as T) : undefined;
        }
        case 'stringList':
            return trimmed.split(',').map((s) => s.trim()).filter((s) => s.length > 0) as unknown as T;
        default:
            return trimmed as unknown as T;
    }
}

/**
 * Tek ayarı çözer. Sıra: `env` (envLock tanımlıysa VE değişken set edilmişse) -> `tenant` (Aşama B iskeleti) ->
 * `platform` (Aşama B iskeleti) -> `default`. `legacy` katmanı bu fonksiyonda YOKTUR (bkz. dosya başı notu).
 */
export function resolveEffectiveConfig<T = unknown>(key: string, opts: ResolveOptions = {}): ResolvedSetting<T> {
    const def = getSettingDef(key) as SettingDef<T> | undefined;
    if (!def) throw new UnknownSettingError(key);

    if (def.envLock) {
        const raw = process.env[def.envLock];
        if (raw !== undefined) {
            const parsed = parseEnvValue(def, raw);
            if (parsed !== undefined) return { key, value: parsed, source: 'env', envVar: def.envLock };
        }
    }

    if (opts.readTenantOverride) {
        const t = opts.readTenantOverride(key, opts.integrationCode);
        if (t !== undefined) return { key, value: t as T, source: 'tenant' };
    }

    if (opts.readPlatformOverride) {
        const p = opts.readPlatformOverride(key, opts.integrationCode);
        if (p !== undefined) return { key, value: p.value as T, source: 'platform', revision: p.revision };
    }

    return { key, value: pickDefault(def, opts.integrationCode), source: 'default' };
}

/** Motor (engine-scope) tüketicileri için kısayol: yalnız değeri döner (source izlemek istemeyen çağıranlar için). */
export function getSetting<T = unknown>(key: string, opts: ResolveOptions = {}): T {
    return resolveEffectiveConfig<T>(key, opts).value;
}

/**
 * [ADR-0020 Aşama B, YENİ — 3.6] Aşama A'nın `resolveEffectiveConfig`/`getSetting` davranışı BİLEREK DEĞİŞMEDİ
 * (bkz. karakterizasyon testi "opts verilmezse HİÇ çağrılmaz", `ConfigResolver.test.ts`). Mevcut ~20 motor tüketicisi
 * bu görevde TEK TEK `readPlatformOverride` geçecek şekilde değiştirilmedi (Protokol 13 + görev kapsamı: "yalnızca
 * gerekiyorsa minimal dokunuş" — bu, her tüketicide ayrı bir karakterizasyon+geçiş gerektiren, riski bu görevin
 * bütçesini aşan ayrı bir iş olarak raporlanmıştır). Bu fonksiyon, YAYINLANMIŞ platform geçersiz kılmalarını
 * `platformOverrideStore`'dan (ConfigHeadPollScheduler'ın 15 sn'de bir doldurduğu bellek-içi görünüm) OKUYAN,
 * YENİ çağrı yerleri için önerilen, AÇIKÇA ADLANDIRILMIŞ giriş noktasıdır.
 */
export function resolveEffectiveConfigWithPublishedOverrides<T = unknown>(key: string, opts: ResolveOptions = {}): ResolvedSetting<T> {
    const def = getSettingDef(key) as SettingDef<T> | undefined;
    const target = def && def.scope === 'platform' ? PLATFORM_TARGET : def && def.scope === 'engine' ? ENGINE_TARGET : (opts.integrationCode ?? ENGINE_TARGET);
    return resolveEffectiveConfig<T>(key, {
        ...opts,
        readPlatformOverride: opts.readPlatformOverride ?? ((k) => {
            const v = getPublishedOverrideValue(target, k);
            return v === undefined ? undefined : { value: v, revision: getKnownVersion(target) };
        }),
    });
}

/** Kısayol: yalnız değeri döner (bkz. `resolveEffectiveConfigWithPublishedOverrides`). */
export function getSettingWithPublishedOverrides<T = unknown>(key: string, opts: ResolveOptions = {}): T {
    return resolveEffectiveConfigWithPublishedOverrides<T>(key, opts).value;
}

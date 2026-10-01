// ADR-0020 Karar 2.1 — Ayar kataloğu sözleşmesi (SettingDef). Bu dosya SALT TİP + zod şema TANIMI taşır; I/O yapmaz.
//
// AŞAMA A KAPSAMI (bkz. ADR-0020 Karar 7.2 satır "A"): yalnız katalog şeması + `default`/`legacy`/`env` katmanlarının
// SALT OKUMA çözümlenmesi. `platform` (ApplicationDB `IntegrationConfigRevisions/Heads`) ve `tenant` katmanları henüz
// YAZILMAZ — bu dosyada YER TUTUCU olarak tanımlanır (ADR Karar 1.1 tablosu, Aşama B).
//
// `SettingDef.key` KARARLIDIR: bir kez yayınlanan anahtar silinmez/yeniden kullanılmaz (ADR Karar 2.1 açıklaması).
import { z } from 'zod';

/** Tehlike sınıfı (ADR Karar 2.1 / Karar 9.3). */
export type SettingDanger = 'safe' | 'caution' | 'dangerous';

/** Değişikliğin ne zaman etkinleşeceği (ADR Karar 3.6). Aşama A'da yalnız BİLGİ amaçlıdır (yazma yok). */
export type SettingApplies = 'immediate' | 'next_cycle' | 'restart';

/** Ayar tipi (ADR Karar 2.1). Aşama A kataloğu yalnız `int|duration|bool|enum` kullanır; `host/pathTemplate` Aşama
 *  A'da (descriptor.ts'e `config` alanı eklenemediği için, bkz. rapor) MODELLENMEZ — bkz. `legacyIntegrationRecord.ts`. */
export type SettingType = 'int' | 'duration' | 'bool' | 'enum' | 'host' | 'pathTemplate' | 'stringList' | 'text' | 'decimal';

/** UI bölümü (ADR Karar 2.3 tablosu — motor ayarları ekranının sekmeleri, Aşama C). */
export type SettingGroup =
    | 'export.product' // "Ürün gönderimi (katalog aktarma)"
    | 'import.product'  // "Ürün içe aktarma"
    | 'order.sync'       // "Sipariş çekme"
    | 'order.support'    // "İade / soru / finans"
    | 'stock'             // "Stok ve fiyat yayını"
    | 'resilience'        // "Oran sınırı ve dayanıklılık"
    | 'endpoints'          // "Uç noktalar"
    | 'mock'                // "Mock / gerçek mod"
    | 'status'               // "Durum ve kapsam"
    | 'cache'                // "Önbellek"
    // ADR-0031: `_platform` hedefi (Sistem ayarları ekranı)
    | 'platform.support'
    | 'platform.announcement'
    | 'platform.maintenance'
    | 'platform.features'
    | 'platform.ui'
    | 'platform.alerts';

/** `platform` (ADR-0031): YALNIZ `_platform` hedefinde geçerli; `_engine`/entegrasyon çözümlemesinde görünmez. */
export type SettingScope = 'engine' | 'integration' | 'engine+integration' | 'platform';

export type ValueSource = 'default' | 'legacy' | 'platform' | 'tenant' | 'env';

/** Entegrasyon başına varsayılan haritası (ADR Karar 2.1: `default: T | { [code]: T; _: T }`). */
export type PerIntegrationDefault<T> = { readonly _: T } & Readonly<Record<string, T>>;

export function isPerIntegrationDefault<T>(v: T | PerIntegrationDefault<T>): v is PerIntegrationDefault<T> {
    return !!v && typeof v === 'object' && !Array.isArray(v) && '_' in (v as any);
}

export interface SettingDef<T = unknown> {
    /** 'export.publisher.chunkSize' — kararlı; nokta-ayrımlı ad alanı. */
    key: string;
    group: SettingGroup;
    scope: SettingScope;
    type: SettingType;
    /** Aralık dahil, strict zod şeması. */
    schema: z.ZodType<T>;
    unit?: 'ms' | 's' | 'min' | 'h' | 'day' | 'count' | 'perMin' | 'percent';
    default: T | PerIntegrationDefault<T>;
    safeRange?: { min: number; max: number };
    danger: SettingDanger;
    applies: SettingApplies;
    /** 'engine/catalog/export/Publisher.ts' biçiminde — katalog tutarlılık testi bu dosyaların VAR OLDUĞUNU doğrular. */
    consumers: string[];
    label: { tr: string; en: string };
    help: { tr: string; en: string };
    impact?: { tr: string; en: string };
    advanced?: boolean;
    /** false ise panelde salt-okunur (Aşama C). Aşama A'da yazma uçları yok; bu alan yalnız gelecekteki davranışı belgeler. */
    overridable: boolean;
    /** Tanımlıysa bu env değişkeni değeri kilitler (ADR Karar 1.3). */
    envLock?: string;
    tenantOverridable?: { bounds: { min: number; max: number } };
    since: string;
    deprecated?: { since: string; replacement?: string };
    /** Aşama A envanter notu: JSON/kod fallback çelişkisi varsa (K10) buraya yazılır — kataloğa yalnız BİLGİ olarak girer, davranışı değiştirmez. */
    knownDriftNote?: string;
    /** ADR-0031: 'public' ise `GET /api/public-config` bu anahtarı kimliksiz döner. Varsayılan (tanımsız) = yöneticiye özel. */
    exposure?: 'public';
}

export interface ResolvedSetting<T = unknown> {
    key: string;
    value: T;
    source: ValueSource;
    /** `source==='env'` ise okunan değişken adı. */
    envVar?: string;
    /** `source==='platform'`ise yayındaki revizyon numarası (Aşama A'da her zaman undefined). */
    revision?: number;
}

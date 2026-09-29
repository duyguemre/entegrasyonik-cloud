// [K7 / ADR-0020, 2026-09-28] Tenant entegrasyon ayarlarında (`ClientIntegrations.<tip>[].settings`) URL/host/endpoint niteliğindeki
// alanlar tenant tarafından YAZILAMAZ ve adaptörlere ULAŞMAZ.
//
// Gerekçe: dış istek hedefleri (temel adres, token adresi, uç yollar) YALNIZCA platform verisidir (`Integrations.urls`, süper-admin);
// tenant ayarı kimlik bilgisi + iş ayarı taşır. Tenant `settings.urls.BASEURL` yazabilirse sunucu kimlik bilgileriyle istediği
// host'a (iç ağ/metadata/saldırgan) istek atar (SSRF + kimlik bilgisi sızıntısı).
//
// Yazma kararı: REDDETMEK yerine YOK SAYMAK (+ denetim kaydı). Sebep (kanıtlı): FE ayar formları settings nesnesini sunucudan
// aldığı haliyle geri gönderir (tam-değiştirme semantiği; bkz. frontend/src/views/secure/integrations/*View.vue,
// `getClientIntegrations`/`retrieve*Settings` yanıtı -> `save*Settings`); DB'de kalıntı bir `urls` varsa 400 dönmek meşru bir
// tenant'ın ayarlarını kaydedememesine yol açar. Yok sayma kalıntıyı da temizler (whole-replace yolları). FE hiçbir formda URL/host
// alanı GÖNDERMEZ (yalnız Ideasoft `storeName` = alt alan etiketi; o ayrıca `hasInvalidStoreName` (+ adaptör tarafında `isValidStoreName`) ile doğrulanır).
//
// Kapsam: settings'in ÜST DÜZEY anahtarları (adaptörlerin okuduğu tek seviye). İç içe alanlara (ör. `catalog`, `auth`) dokunulmaz:
// bunlar sunucu-yazımlı meşru veri taşır (ör. marka `logoUrl`) ve adaptörler oradan hedef okumaz.
// Bilerek bağımlılıksız (adaptörler de içe aktarır): ApplicationError/bcrypt/jwt çekilmez.

/** Gerekçeli beyaz liste: bugün URL-benzeri anahtar adı taşıyan MEŞRU tenant ayarı YOKTUR (FE/adaptör taraması, 2026-09-28). */
export const TENANT_URL_KEY_ALLOWLIST: readonly string[] = [];

const norm = (k: string): string => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

const EXACT = new Set([
    'urls', 'url', 'uri', 'uris', 'host', 'hosts', 'hostname', 'endpoint', 'endpoints', 'baseurl', 'baseuri', 'base',
    'domain', 'domains', 'proxy', 'gateway', 'origin', 'server', 'wsdl',
]);
const SUFFIX = /(url|urls|uri|uris|host|hosts|hostname|endpoint|endpoints|domain|wsdl)$/;
const PREFIX = /^(url|uri|endpoint|host|baseurl|proxy|wsdl)/;

/** Anahtar bir dış hedef (URL/host/endpoint/base) belirtiyor mu? Büyük/küçük harf ve `_`/`-` duyarsız. */
export function isTenantUrlLikeKey(key: string): boolean {
    if (TENANT_URL_KEY_ALLOWLIST.includes(key)) return false;
    const n = norm(key);
    if (!n) return false;
    return EXACT.has(n) || SUFFIX.test(n) || PREFIX.test(n);
}

export interface StripResult { settings: any; removedKeys: string[] }

const isPlain = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && typeof v.toHexString !== 'function';

/** Girdiyi DEĞİŞTİRMEDEN, üst düzey URL-benzeri anahtarları çıkarılmış kopya + çıkarılan anahtar ADLARI (değer asla döndürülmez/loglanmaz). */
export function stripTenantUrlFields(settings: any): StripResult {
    if (!isPlain(settings)) return { settings, removedKeys: [] };
    const out: any = {};
    const removedKeys: string[] = [];
    for (const [k, v] of Object.entries(settings)) {
        if (isTenantUrlLikeKey(k)) removedKeys.push(k); else out[k] = v;
    }
    return { settings: out, removedKeys };
}

/** Ideasoft `storeName` -> `https://<storeName>.ideasoft.com.tr`: yalnızca tek DNS etiketi (nokta/eğik çizgi/`@`/`#` YOK). */
const STORE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
export function isValidStoreName(v: any): boolean {
    return typeof v === 'string' && STORE_NAME.test(v);
}

/** Yazma yolu: dolu bir `storeName` geçerli bir alt alan etiketi değil mi? (Boş/tanımsız serbest: henüz girilmemiş.) Çağıran 400 fırlatır. */
export function hasInvalidStoreName(settings: any): boolean {
    if (!isPlain(settings)) return false;
    const v = settings.storeName;
    if (v === undefined || v === null || v === '') return false;
    return !isValidStoreName(v);
}

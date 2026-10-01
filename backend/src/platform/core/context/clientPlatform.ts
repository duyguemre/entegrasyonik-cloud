// MOB-08 / K55: istemci platform sınıfı -- TEK KAYNAK (backend). Önyüzdeki eşi: frontend/packages/ui/src/platform/clientPlatform.ts
// (değer listesi iki tarafta AYNI; tests/unit/platform/clientPlatform.test.ts ve paket testi korur).
// İstemci `X-Client-Platform` başlığıyla bildirir; sunucu izinli listeyle doğrular. Başlık yoksa/geçersizse UA'dan KABA sınıf (yalnız yedek).
// KVKK: ham UA/IP hiçbir yerde SAKLANMAZ; yalnız buradan çıkan sınıf değeri bağlama/kayıtlara girer.
// Sv2 (`platform/core`): bağımlılıksız.

export const CLIENT_PLATFORM_HEADER = 'X-Client-Platform';

/** İzinli değerler (sıra = ekranlardaki gösterim sırası). `unknown` = belirlenemedi. */
export const CLIENT_PLATFORMS = ['desktop_web', 'electron', 'mobile_web', 'pwa', 'android_app', 'unknown'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

/** Ana kırılım: masaüstü / mobil (alt türler ayrıntıda). */
export const PLATFORM_CLASSES = ['desktop', 'mobile', 'unknown'] as const;
export type PlatformClass = (typeof PLATFORM_CLASSES)[number];

const CLASS_OF: Record<ClientPlatform, PlatformClass> = {
    desktop_web: 'desktop', electron: 'desktop',
    // `pwa`: istemci bu değeri YALNIZ dokunmatik/mobil cihazda kurulu (standalone) uygulama için gönderir; masaüstüne kurulu PWA `desktop_web` sayılır.
    mobile_web: 'mobile', pwa: 'mobile', android_app: 'mobile',
    unknown: 'unknown',
};

export function platformClassOf(p: ClientPlatform): PlatformClass {
    return CLASS_OF[p] ?? 'unknown';
}

export function isClientPlatform(v: unknown): v is ClientPlatform {
    return typeof v === 'string' && (CLIENT_PLATFORMS as readonly string[]).includes(v);
}

/** Sorgu süzgeci: tek alt tür ya da ana sınıf. `desktop`/`mobile` → o sınıfın alt türleri. */
export type PlatformFilter = ClientPlatform | Exclude<PlatformClass, 'unknown'>;
export const PLATFORM_FILTERS: readonly PlatformFilter[] = ['desktop', 'mobile', ...CLIENT_PLATFORMS];

export function platformsOfFilter(f: PlatformFilter | undefined | null): ClientPlatform[] | null {
    if (!f) return null;
    if (f === 'desktop' || f === 'mobile') return CLIENT_PLATFORMS.filter((p) => CLASS_OF[p] === f);
    return isClientPlatform(f) ? [f] : null;
}

/**
 * UA'dan KABA sınıf (yalnız başlık yoksa). PWA/kurulu uygulama UA'dan güvenilir ayırt edilemez → yalnız
 * electron / mobile_web / desktop_web / unknown döner. UA yalnız burada okunur ve saklanmaz.
 */
export function platformFromUserAgent(ua: unknown): ClientPlatform {
    if (typeof ua !== 'string' || ua.trim() === '') return 'unknown';
    const s = ua.slice(0, 512);
    if (/\bElectron\//i.test(s)) return 'electron';
    if (/Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(s)) return 'mobile_web';
    if (/Mozilla\/|AppleWebKit|Gecko\//i.test(s)) return 'desktop_web';
    return 'unknown';   // curl, betik, sunucu-sunucu: sınıflanmaz
}

/** Başlık izinli listedeyse aynen (küçük harfe indirilip kırpılarak), değilse UA yedeği. */
export function resolveClientPlatform(header: unknown, userAgent: unknown): ClientPlatform {
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw === 'string') {
        const v = raw.trim().toLowerCase();
        if (v.length <= 32 && isClientPlatform(v)) return v;
    }
    return platformFromUserAgent(userAgent);
}

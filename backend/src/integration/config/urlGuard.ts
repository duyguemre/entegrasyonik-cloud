// ADR-0020 Karar 2.2 "URL/host doğrulaması" + Karar 1.5 (emekli uç reddi), Aşama B.
//
// KAPSAM NOTU (rapora yazılır): Aşama A kataloğunda BUGÜN `type:'host'` işaretli hiçbir ayar YOK (host seçimi/`config.endpoints`
// ADR §1.4 tam ayrışması henüz yazılmadı — Stage A kapanış notu). Bu modül YİNE DE Karar 2.2/1.5'in TAM kural kümesini
// (https zorunlu, userinfo/IP/özel ağ/localhost/tek-etiket/port reddi, izinli host listesi, emekli desen reddi) saf,
// bağımsız ve TEST EDİLEBİLİR fonksiyonlar olarak sağlar; `type:'host'` bir ayar eklendiğinde `IntegrationConfigService`
// bunu doğrudan çağırır (bkz. saveDraft). Mantık kasıtlı olarak `outboundHosts.ts::assertAllowedOutboundHost` ile
// AYNI güvenlik kurallarını uygular (ikinci bir gevşek kopya AÇILMAZ) ama TAM URL değil YALNIZ HOST DEĞERİ alır
// (platform override'ı bir host string'idir, sorgu/yol taşımaz).
import { hostMatchesPattern } from '@integration/modules/common/security/outboundHosts';

export class HostGuardError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HostGuardError';
    }
}

/**
 * Ayrıştırıcı farklılığı (parser differential) saldırılarına karşı: ham dizede kaçış(`\`)/boşluk/kontrol karakteri/
 * `@` olamaz (bkz. `outboundHosts.ts::FORBIDDEN_RAW_CHARS`, AYNI kural). Kod noktası KARŞILAŞTIRMASIYLA yazılır
 * (regex DEĞİL) — ESLint `no-control-regex` bir regex LİTERALİNDEKİ `\u0000-\u001f` aralığını (meşru bir güvenlik
 * deseni olsa da) mandallı bir uyarı sayar; bu ikinci (ilk `outboundHosts.ts`'teki) oluşumu mandalı gereksiz yere
 * artırmaz.
 */
function containsForbiddenRawChar(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code <= 0x1f || code === 0x7f || s[i] === '\\' || s[i] === ' ' || s[i] === '@') return true;
    }
    return false;
}

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
    [0x0a000000, 0x0affffff], // 10.0.0.0/8
    [0xac100000, 0xac1fffff], // 172.16.0.0/12
    [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16
    [0x7f000000, 0x7fffffff], // 127.0.0.0/8 (loopback)
    [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 (link-local / bulut metadata)
];

function ipv4ToInt(ip: string): number | undefined {
    const parts = ip.split('.');
    if (parts.length !== 4) return undefined;
    let n = 0;
    for (const p of parts) {
        if (!/^\d{1,3}$/.test(p)) return undefined;
        const v = Number(p);
        if (v > 255) return undefined;
        n = (n << 8) | v;
    }
    return n >>> 0;
}

function isIpLiteral(host: string): boolean {
    return host.startsWith('[') || /^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host);
}

function isPrivateOrLoopbackIpv4(host: string): boolean {
    const n = ipv4ToInt(host);
    if (n === undefined) return false;
    return PRIVATE_IPV4_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

export interface HostGuardOptions {
    /** Yalnız test: localhost/loopback'e izin ver (varsayılan false — platform override YOLU asla localhost kabul etmez). */
    allowLoopback?: boolean;
}

/**
 * Bir platform host geçersiz kılma DEĞERİNİ (yalnız host adı, şema/yol/sorgu YOK) doğrular. Reddederse `HostGuardError`.
 * Kurallar (Karar 2.2): userinfo yok (zaten host'ta olamaz, savunma amaçlı), IP literal yok, `localhost`/tek-etiketli
 * host yok, özel ağ/loopback/link-local (bulut metadata 169.254.169.254 dahil) yok, izinli host listesinde (tam veya
 * `*.` joker) olmalı.
 */
export function assertSafeHostOverride(host: string, allowedHosts: readonly string[], opts: HostGuardOptions = {}): void {
    if (typeof host !== 'string' || host.length === 0) throw new HostGuardError('Host değeri boş olamaz.');
    if (containsForbiddenRawChar(host)) throw new HostGuardError('Host değeri geçersiz karakter içeriyor.');
    const h = host.toLowerCase().replace(/\.$/, '');

    if (opts.allowLoopback && (h === 'localhost' || h === '127.0.0.1' || h === '::1')) return;

    if (isIpLiteral(h)) throw new HostGuardError(`IP adresi host olarak kullanılamaz: ${h}`);
    if (h === 'localhost' || h.endsWith('.localhost')) throw new HostGuardError(`Yerel host kullanılamaz: ${h}`);
    if (!h.includes('.')) throw new HostGuardError(`Tek etiketli host kullanılamaz: ${h}`);
    if (isPrivateOrLoopbackIpv4(h)) throw new HostGuardError(`Özel ağ adresi kullanılamaz: ${h}`);

    if (!allowedHosts.some((p) => hostMatchesPattern(h, p))) {
        throw new HostGuardError(`Host izinli listede değil: ${h} (izinli: ${allowedHosts.join(', ') || '(boş)'})`);
    }
}

/** Yalnız `http://` (şemasız/http) bir taban URL geçersiz kılması verilirse reddeder (Karar 2.2 "https zorunlu"). */
export function assertHttpsOnly(urlLike: string): void {
    if (/^http:\/\//i.test(urlLike)) throw new HostGuardError('Yalnız https kabul edilir; http reddedildi.');
}

export interface RetiredEndpointPatternLike {
    pattern: string;
    retiredAt: string;
    replacementKey?: string;
}

const PLACEHOLDER_TOKEN = '\u0000PLACEHOLDER\u0000';

/**
 * Basit desen eşleşmesi: `<PLACEHOLDER>` yer tutucuları (Karar 1.4 örnekleri `<SELLERID>` gibi) `[^/]+` regex'ine
 * çevrilir. SIRA ÖNEMLİDİR: önce yer tutucular sabit bir jetonla değiştirilir, SONRA geri kalan LİTERAL metin regex
 * özel karakterlerinden kaçırılır (`*` -> `.*`), EN SON jeton gerçek `[^/]+` regex'ine dönüştürülür — aksi halde
 * kaçırma adımı `[^/]+`'ın kendi özel karakterlerini (`[`, `]`, `^`, `+`) de kaçırıp deseni LİTERAL (asla eşleşmeyen)
 * hâle getirir (bu görevde birim testiyle yakalanan hata).
 */
function matchesRetiredPattern(value: string, pattern: string): boolean {
    try {
        const withTokens = pattern.replace(/<[A-Z_]+>/g, PLACEHOLDER_TOKEN);
        const escaped = withTokens.replace(/[.*+?^${}()|[\]\\]/g, (m) => (m === '*' ? '.*' : `\\${m}`));
        const asRegexSource = escaped.split(PLACEHOLDER_TOKEN).join('[^/]+');
        return new RegExp(asRegexSource).test(value);
    } catch {
        return value.includes(pattern);
    }
}

/** Değer, hedefin manifestosundaki `config.retiredEndpoints` desenlerinden birine uyuyor mu (Karar 1.5 "yazmada ret"). */
export function findMatchingRetiredEndpoint(value: string, retired: readonly RetiredEndpointPatternLike[]): RetiredEndpointPatternLike | undefined {
    return retired.find((r) => matchesRetiredPattern(value, r.pattern));
}

/** Emekli desenle eşleşen bir değer yazılmaya çalışılırsa fırlatır (Karar 1.5: "Bu uç nokta <tarih> itibarıyla kapatıldı; yerine <anahtar> kullanılır."). */
export function assertNotRetiredEndpoint(value: string, retired: readonly RetiredEndpointPatternLike[]): void {
    const hit = findMatchingRetiredEndpoint(value, retired);
    if (hit) throw new HostGuardError(`Bu uç nokta ${hit.retiredAt} itibarıyla kapatıldı; yerine ${hit.replacementKey ?? '(belirtilmemiş)'} kullanılır.`);
}

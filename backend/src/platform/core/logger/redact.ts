// ADR-0017 Karar 1.4: log redaksiyonu, `utils/secretKeys.ts::redactForLog` (ADR-0003 D.17 "aynı anahtar listesi
// Faz 2 log redaction'ında kullanılır" -- tek kaynak) ÜZERİNE, axios hata nesnelerine özgü ek temizlik ekler.
import { redactForLog, normalizeKeyName } from '@utils/secretKeys';

const MAX_RESPONSE_DATA_CHARS = 500;

/** axios hatasından `config`/`request` (kimlik bilgisi/başlık içerebilir) ATILIR; `response.data` kesilir. */
function sanitizeAxiosLike(value: any): any {
    if (!value || typeof value !== 'object') return value;
    const isAxiosError = 'isAxiosError' in value || ('config' in value && 'request' in value && 'response' in value);
    if (!isAxiosError) return value;
    const out: any = { message: value.message, name: value.name, code: value.code };
    if (value.response) {
        let data = value.response.data;
        if (typeof data !== 'string') { try { data = JSON.stringify(data); } catch { data = String(data); } }
        if (typeof data === 'string' && data.length > MAX_RESPONSE_DATA_CHARS) data = data.slice(0, MAX_RESPONSE_DATA_CHARS) + '…';
        out.response = { status: value.response.status, statusText: value.response.statusText, data };
    }
    // `config`/`request` KASITLI olarak KOPYALANMAZ (Authorization/cookie/istek gövdesi içerebilir).
    return out;
}

/**
 * [F-06] Sunucu log'unda ZORUNLU PII/başlık anahtarları (normalize: küçük harf, `_-` ve boşluk atılmış).
 * `secretKeys.ts` sır adlarını (token/parola/appkey/appsecret...) zaten kapsar; bunlar EK olarak kişisel veri ve
 * kimlik başlıklarıdır (e-posta, telefon, TCKN, adres, Authorization/Cookie).
 */
export const LOG_PII_KEY_NAMES: ReadonlySet<string> = new Set<string>([
    'authorization', 'proxyauthorization', 'cookie', 'setcookie', 'xapikey',
    'email', 'eposta', 'emailaddress', 'customeremail', 'mail',
    'phone', 'phonenumber', 'gsm', 'mobile', 'mobilephone', 'telephone', 'telefon', 'customerphone',
    'tckn', 'tcknumber', 'tcidentitynumber', 'identitynumber', 'identityno', 'nationalid', 'tcno', 'tcknvkn',
    'address', 'fulladdress', 'addressline', 'addressline1', 'addressline2', 'shippingaddress', 'invoiceaddress',
    'billingaddress', 'deliveryaddress', 'streetaddress', 'adres', 'teslimatadresi', 'faturaadresi',
]);
export const LOG_PII_REDACTED = '[REDACTED_PII]';

const LOG_TEXT_PATTERNS: ReadonlyArray<{ re: RegExp; replacement: string }> = [
    { re: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi, replacement: '$1 [REDACTED]' },
    { re: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replacement: '[REDACTED_TOKEN]' },
    // anahtar=değer / "anahtar":"değer" biçimindeki sırlar (appkey, appsecret, api key/secret, token, password, authorization...)
    { re: /((?:app[_-]?key|app[_-]?secret|api[_-]?key|api[_-]?secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|passw(?:or)?d|secret|token|authorization)["']?\s*[:=]\s*["']?)(?!\[REDACTED)[^\s,;"'&}\]]+/gi, replacement: '$1[REDACTED]' },
    { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
    // URL sorgu dizesi (yalnız `?ad=değer...`; şema/yol AYNEN kalır)
    { re: /\?[\w%.[\]-]+=[^\s"'<>]*/g, replacement: '?[REDACTED_QUERY]' },
    { re: /\b[A-Fa-f0-9]{32,}\b/g, replacement: '[REDACTED_HEX]' },
    // TCKN: yalnız bağlamla ("TCKN: 123..." / "TC Kimlik No 123...") -- 11 haneli sipariş/kimlik numaralarını YANLIŞ maskelememek için
    { re: /((?:tckn|tc\s*kimlik(?:\s*no)?|identity\s*number|identityNumber)["']?\s*[:=]?\s*["']?)\d{11}\b/gi, replacement: '$1[REDACTED_TCKN]' },
    // TR cep telefonu: yalnız uluslararası önekli ya da baştaki 0 ile biçimli (10 haneli ham sayı sipariş no olabilir)
    { re: /(?<!\d)(?:\+90|0090)[\s-]?\(?5\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g, replacement: '[REDACTED_PHONE]' },
    { re: /(?<!\d)905\d{9}(?!\d)/g, replacement: '[REDACTED_PHONE]' },
    { re: /(?<!\d)05\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g, replacement: '[REDACTED_PHONE]' },
    // Adres: "adres: ..." / "address=..." satır sonuna (ya da `"`/`}`) kadar
    { re: /(\b(?:adres|address)\w*["']?\s*[:=]\s*["']?)[^\n\r"}]{6,}/gi, replacement: '$1[REDACTED_ADDRESS]' },
];

/** [F-06] Sunucu log metni (msg / string alanlar) maskesi: sır desenleri + PII (e-posta, telefon, TCKN, adres). Bkz. `LOG_TEXT_PATTERNS`. */
export function maskLogText(text: string): string {
    let out = text;
    for (const { re, replacement } of LOG_TEXT_PATTERNS) out = out.replace(re, replacement);
    return out;
}

function maskDeep(value: any, depth: number): any {
    if (typeof value === 'string') return maskLogText(value);
    if (value === null || typeof value !== 'object' || depth > 20) return value;
    if (ArrayBuffer.isView(value)) return value;
    if (Array.isArray(value)) return value.map((v) => maskDeep(v, depth + 1));
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = LOG_PII_KEY_NAMES.has(normalizeKeyName(k)) && v !== null && v !== undefined ? LOG_PII_REDACTED : maskDeep(v, depth + 1);
    }
    return out;
}

/**
 * Log alanı ağacını (derin) redakte eder: bilinen sır anahtarları (`secretKeys`) + PII anahtarları (`LOG_PII_KEY_NAMES`)
 * + string değerlerdeki sır/PII desenleri (`maskLogText`) + axios `config`/`request` atılır. Girdi değişmez.
 */
export function redactLogObject<T>(obj: T): T {
    if (obj && typeof obj === 'object') {
        const withAxios = Array.isArray(obj) ? obj.map(sanitizeAxiosLike) : sanitizeAxiosLike(obj);
        return maskDeep(redactForLog(withAxios), 0);
    }
    if (typeof obj === 'string') return maskLogText(obj) as unknown as T;
    return obj;
}

// ADR-0017 Karar 1.8 (`POST /client-log`): serbest metin (message/stack) İÇİNDEKİ olası sır DESENLERİ (anahtar
// adına değil, İÇERİĞE dayalı) temizlenir. `redactForLog` yalnızca OBJE ANAHTARLARINA bakar; bu fonksiyon
// istemciden gelen serbest metin için EK bir savunma katmanıdır (sunucu tarafı "ikinci redaksiyon").
const FREE_TEXT_PATTERNS: ReadonlyArray<{ re: RegExp; replacement: string }> = [
    // Bearer/Authorization benzeri token'lar (önce -- daha spesifik desenler daha sonraki genel desenlerden ÖNCE eşleşmeli)
    { re: /\bBearer\s+[A-Za-z0-9._-]+/gi, replacement: 'Bearer [REDACTED]' },
    // JWT biçimi: üç nokta-ayrılmış base64url segmenti
    { re: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replacement: '[REDACTED_TOKEN]' },
    // E-posta adresleri
    { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
    // URL sorgu dizesi (yalnızca `?` sonrası; şema/yol AYNEN kalır)
    { re: /\?[^\s"'<>]+/g, replacement: '?[REDACTED_QUERY]' },
    // Uzun hex/base64-benzeri diziler (olası API anahtarı/sır; 32+ karakter)
    { re: /\b[A-Fa-f0-9]{32,}\b/g, replacement: '[REDACTED_HEX]' },
    // TR cep telefonu biçimleri
    { re: /\b(?:\+?90|0)?5\d{9}\b/g, replacement: '[REDACTED_PHONE]' },
];

/** Serbest metindeki (email/telefon/URL sorgu dizesi/JWT/Bearer/uzun hex) olası sır desenlerini maskeler. */
export function redactFreeText(text: string): string {
    let out = text;
    for (const { re, replacement } of FREE_TEXT_PATTERNS) out = out.replace(re, replacement);
    return out;
}

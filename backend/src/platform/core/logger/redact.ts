// ADR-0017 Karar 1.4: log redaksiyonu, `utils/secretKeys.ts::redactForLog` (ADR-0003 D.17 "aynı anahtar listesi
// Faz 2 log redaction'ında kullanılır" -- tek kaynak) ÜZERİNE, axios hata nesnelerine özgü ek temizlik ekler.
import { redactForLog } from '@utils/secretKeys';

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

/** Log alanı ağacını (derin) redakte eder: bilinen sır anahtarları + axios `config`/`request` atılır. Girdi değişmez. */
export function redactLogObject<T>(obj: T): T {
    if (obj && typeof obj === 'object') {
        const withAxios = Array.isArray(obj) ? obj.map(sanitizeAxiosLike) : sanitizeAxiosLike(obj);
        return redactForLog(withAxios);
    }
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

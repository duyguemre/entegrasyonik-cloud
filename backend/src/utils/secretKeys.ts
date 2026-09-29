// ADR-0003 D.15/D.17 + C.10: "sır" anahtar ADLARININ TEK kaynağı. Üç tüketici aynı listeyi paylaşır:
//   - api/responseSanitizer.ts  (API yanıtı son savunma hattı: FORBIDDEN_RESPONSE_KEYS)
//   - api/integrationSecrets.ts (entegrasyon ayarı maskeleme/şifreleme: INTEGRATION_SECRET_FIELD_NAMES)
//   - redactForLog()            (log redaction; ADR D.17 "aynı anahtar listesi Faz 2 log redaction'ında kullanılır")
// Yalnızca ADLAR burada tutulur; hiçbir değer yoktur.

/** Normalize: küçük harf, `_`/`-`/boşluk atılmış. */
export const normalizeKeyName = (name: string): string => String(name).toLowerCase().replace(/[_\-\s]/g, '');

/** API yanıtında ASLA dönmemesi gereken (normalize) anahtar adları — ADR D.15. */
export const FORBIDDEN_RESPONSE_KEYS: ReadonlySet<string> = new Set<string>([
    'password', 'tokenversion', 'failedloginattempts', 'lockuntil',
    'dbconfig', 'secretaccesskey', 'accesskeyid',
    'accesstoken', 'refreshtoken', 'apisecret', 'clientsecret',
]);

/**
 * Entegrasyon SIR alan adları (normalize) — ADR C.10 listesi + kodda taranan gerçek alan adları
 * (adaptörler: APIKEY/APISECRET/key/secret/token/PASSWORD/appKey/appSecret; FE formları: key/secret/apikey/password; OAuth: auth.*).
 */
export const INTEGRATION_SECRET_FIELD_NAMES: ReadonlySet<string> = new Set<string>([
    'apikey', 'apisecret', 'appkey', 'appsecret',
    'key', 'secret', 'clientsecret',
    'password', 'passwd', 'passphrase',
    'token', 'accesstoken', 'refreshtoken', 'bearertoken',
    'privatekey',
]);

export const LOG_REDACTED = '[REDACTED]';
const ENCRYPTED_PREFIX = 'enc:v1:';
const MAX_DEPTH = 20;

/** Log için derin kopya: yasak/sır anahtarlarının değeri ve `enc:v1:` ile başlayan her string '[REDACTED]' olur. Girdi değişmez. */
export function redactForLog(value: any, depth = 0): any {
    if (typeof value === 'string') return value.startsWith(ENCRYPTED_PREFIX) ? LOG_REDACTED : value;
    if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value;
    if (ArrayBuffer.isView(value)) return value;
    if (Array.isArray(value)) return value.map(v => redactForLog(v, depth + 1));
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
        const n = normalizeKeyName(k);
        out[k] = FORBIDDEN_RESPONSE_KEYS.has(n) || INTEGRATION_SECRET_FIELD_NAMES.has(n) ? LOG_REDACTED : redactForLog(v, depth + 1);
    }
    return out;
}

// ADR-0003 D.17: API yanıtları için SON SAVUNMA HATTI. Birincil mekanizma servis düzeyindeki DTO/projeksiyonlardır
// (profileDto, clientDto, USER_LIST_PROJECTION, integrationSecrets); bu temizleyici yalnızca onların kaçırdığı sızıntıyı yakalar.
// TETİKLENMESİ BİR HATA SİNYALİDİR: olay `warn` seviyesinde loglanır (anahtar ADI + yol; DEĞER ASLA loglanmaz) ve alan yanıttan silinir.
//
// Not: 'captcha' D.15 listesinde olmasına rağmen burada YOK — mevcut (sahte) captcha akışı FE'ye değeri bilerek döner
// (SecurityService.getCaptcha; BACKLOG C1/C12 captcha sahte). Captcha gerçek doğrulamaya geçince eklenecek.

// Yasak anahtar adları TEK kaynaktan (utils/secretKeys.ts; ADR-0003 adım 6 (f): log redaction ile paylaşılır).
import { FORBIDDEN_RESPONSE_KEYS as FORBIDDEN_KEYS, normalizeKeyName as normalize } from '../utils/secretKeys';

// Maskelenmiş sır sentinel'i / boş değer sızıntı değildir (ör. entegrasyon ayarı 'sensitive' veya '')
const isMaskedValue = (v: any) => v === 'sensitive' || v === '' || v === null || v === undefined;

// ADR-0003 adım 6: alan şifreleme çıktısı (`enc:v1:...`) hangi anahtar adıyla olursa olsun yanıta ÇIKMAZ (şifreli değer de 'sensitive' sayılır, sızıntıdır)
const isCiphertext = (v: any) => typeof v === 'string' && v.startsWith('enc:v1:');

const MAX_DEPTH = 40;

interface Finding { key: string; path: string }

function isTraversable(v: any): boolean {
    // Buffer/TypedArray (ikili içerik) taranmaz
    return v !== null && typeof v === 'object' && !ArrayBuffer.isView(v);
}

/** Mongoose doc / ObjectId / Date gibi toJSON'lu nesneler serileştirilecekleri biçimde ele alınır. */
function view(v: any): any {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.toJSON === 'function') {
        try { return v.toJSON(); } catch { return v; }
    }
    return v;
}

function scan(value: any, path: string, out: Finding[], seen: WeakSet<object>, depth: number): void {
    if (depth > MAX_DEPTH || !isTraversable(value)) return;
    const v = view(value);
    if (!isTraversable(v)) return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) scan(v[i], path + '[]', out, seen, depth + 1);
        return;
    }
    for (const k of Object.keys(v)) {
        const child = v[k];
        if ((FORBIDDEN_KEYS.has(normalize(k)) && !isMaskedValue(child)) || isCiphertext(child)) {
            out.push({ key: k, path: path ? path + '.' + k : k });
            continue;
        }
        scan(child, path ? path + '.' + k : k, out, seen, depth + 1);
    }
}

function strip(value: any, depth: number): any {
    if (depth > MAX_DEPTH || !isTraversable(value)) return value;
    const v = view(value);
    if (!isTraversable(v)) return v;
    if (Array.isArray(v)) return v.map(x => strip(x, depth + 1));
    const out: any = {};
    for (const k of Object.keys(v)) {
        const child = v[k];
        if ((FORBIDDEN_KEYS.has(normalize(k)) && !isMaskedValue(child)) || isCiphertext(child)) continue;
        out[k] = strip(child, depth + 1);
    }
    return out;
}

export interface SanitizeContext { service?: string; operation?: string }

/**
 * Sızıntı yoksa girdiyi AYNEN (aynı referans, kopyasız) döner. Varsa yasak anahtarları silinmiş derin kopyayı döner ve
 * `console.warn` ile olayı loglar (yalnızca anahtar adları/yollar; değer yok).
 */
export function sanitizeResponse<T = any>(body: T, ctx: SanitizeContext = {}): T {
    if (!isTraversable(body)) return body;
    const findings: Finding[] = [];
    scan(body, '', findings, new WeakSet<object>(), 0);
    if (findings.length === 0) return body;

    const keys = Array.from(new Set(findings.map(f => f.key))).slice(0, 10);
    const paths = Array.from(new Set(findings.map(f => f.path))).slice(0, 10);
    console.warn('[ResponseSanitizer] HATA SİNYALİ: yanıtta yasak alan yakalandı ve silindi', {
        service: ctx.service, operation: ctx.operation, keys, paths, count: findings.length,
    });
    return strip(body, 0) as T;
}

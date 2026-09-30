// ADR-0003 C.10 + D.16: entegrasyon SIR alanları kaydı ve "yazılabilir-yalnız" (write-only) maskeleme.
//
// Yanıtta: sır alanı değer içeriyorsa sabit 'sensitive', yoksa '' (FE'nin mevcut sözleşmesi; bkz. IdeasoftComponent.vue).
// Güncellemede gelen değer: 'sensitive' -> mevcut değer KORUNUR; '' -> alan TEMİZLENİR; başka değer -> yeni sır.
//   (Gövdede hiç bulunmayan sır alanı da DOKUNULMADAN korunur: FE sürümünden bağımsız veri kaybı olmaz.)
// Şifreleme (ADR-0003 adım 6, C.10-C.12): `resolveSecretsForWrite` çıktısı DB'ye yazılmadan önce `encryptSecrets`'ten geçer
// (AES-256-GCM, `enc:v1:<kid>:...`); şifre çözme YALNIZCA adaptör yapılandırması kurulurken `decryptSecrets` ile yapılır
// (IntegrationFactory, Ideasoft token okuma). Şifreli değer de 'sensitive' sayılır (hasValue) ve API yanıtına ASLA çıkmaz.

import { decryptField, encryptField, isEncrypted } from '../../../utils/FieldCrypto';
import { INTEGRATION_SECRET_FIELD_NAMES, normalizeKeyName } from '../../../utils/secretKeys';

export const SENSITIVE_MASK = 'sensitive';

// Sır alan adları: utils/secretKeys.ts (responseSanitizer ve log redaction ile paylaşılan TEK liste; ADR C.10).
const SECRET_FIELD_NAMES = INTEGRATION_SECRET_FIELD_NAMES;

/**
 * Entegrasyon koduna göre SIR OLMAYAN istisnalar (aynı ada sahip alan bu entegrasyonda kimlik tanımlayıcısıdır ve FE'nin çalışması için gerekir).
 * ideasoft: `key` OAuth client_id'dir; FE yetkilendirme URL'ini bu değerle kurar (IdeasoftComponent.vue setAuthUrl). `secret` sırdır.
 */
const NON_SECRET_OVERRIDES: Record<string, string[]> = {
    ideasoft: ['key'],
};

const normalizeName = normalizeKeyName;

export function isSecretField(fieldName: string, integrationCode?: string): boolean {
    const n = normalizeName(fieldName);
    if (!SECRET_FIELD_NAMES.has(n)) return false;
    const overrides = integrationCode ? NON_SECRET_OVERRIDES[String(integrationCode).toLowerCase()] : undefined;
    if (overrides && overrides.includes(n)) return false;
    return true;
}

const isPlainObject = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && typeof v.toHexString !== 'function';
const hasValue = (v: any): boolean => {
    if (v === undefined || v === null || v === '') return false;
    if (typeof v === 'number') return true;
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
};

/** Girdiyi DEĞİŞTİRMEDEN, sır alanları maskelenmiş derin kopya döner (iç içe nesne/dizi dahil, ör. settings.auth.*). */
export function maskSettings(settings: any, integrationCode?: string): any {
    if (Array.isArray(settings)) return settings.map(v => maskSettings(v, integrationCode));
    if (!isPlainObject(settings)) return settings;
    const out: any = {};
    for (const [k, v] of Object.entries(settings)) {
        if (isSecretField(k, integrationCode)) out[k] = hasValue(v) ? SENSITIVE_MASK : '';
        else if (isPlainObject(v) || Array.isArray(v)) out[k] = maskSettings(v, integrationCode);
        else out[k] = v;
    }
    return out;
}

const INTEGRATION_TYPES = ['marketplace', 'shipment', 'ecommerce', 'erp', 'einvoice'] as const;

const toPlain = (doc: any): any => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

/** Tek entegrasyon öğesi ({ code, settings, ... }): settings maskelenir. */
export function maskIntegrationItem(item: any): any {
    if (!item) return item;
    const src = toPlain(item);
    if (!isPlainObject(src)) return src;
    return { ...src, settings: src.settings === undefined ? src.settings : maskSettings(src.settings, src.code) };
}

/** ClientIntegrations belgesi (5 tip dizisi): her öğenin settings'i maskelenir. */
export function maskClientIntegrationsDoc(doc: any): any {
    if (!doc) return doc;
    const src = toPlain(doc);
    if (!isPlainObject(src)) return src;
    const out: any = { ...src };
    for (const t of INTEGRATION_TYPES) {
        if (Array.isArray(src[t])) out[t] = src[t].map(maskIntegrationItem);
    }
    return out;
}

/**
 * Yazma yolu: gelen settings'i mevcut (DB'deki) settings ile birleştirir.
 *  - sır alanı 'sensitive' -> mevcut değer korunur (mevcut yoksa alan yazılmaz)
 *  - sır alanı ''          -> ''  (temizlenir)
 *  - sır alanı başka değer -> yeni sır (şimdilik düz; şifreleme 3b)
 *  - gövdede olmayan mevcut sır alanı -> korunur
 * Sır olmayan alanlar gelen değerle (whole-replace semantiği korunarak) yazılır. İç içe nesneler özyinelemeli işlenir.
 */
export function resolveSecretsForWrite(incoming: any, existing: any, integrationCode?: string): any {
    if (!isPlainObject(incoming)) return incoming;
    const prev = isPlainObject(existing) ? existing : {};
    const out: any = {};
    for (const [k, v] of Object.entries(incoming)) {
        if (isSecretField(k, integrationCode)) {
            if (v === SENSITIVE_MASK) {
                if (prev[k] !== undefined) out[k] = prev[k];
            } else {
                out[k] = v;
            }
        } else if (isPlainObject(v)) {
            out[k] = resolveSecretsForWrite(v, prev[k], integrationCode);
        } else {
            out[k] = v;
        }
    }
    // Gövdede hiç olmayan mevcut sır alanları (ve sır içeren iç içe nesneler, ör. OAuth `auth`) korunur
    for (const [k, v] of Object.entries(prev)) {
        if (k in out) continue;
        if (isSecretField(k, integrationCode) ? hasValue(v) : (isPlainObject(v) && containsSecret(v, integrationCode))) out[k] = v;
    }
    return out;
}

function containsSecret(obj: any, integrationCode?: string): boolean {
    if (!isPlainObject(obj)) return false;
    return Object.entries(obj).some(([k, v]) => (isSecretField(k, integrationCode) && hasValue(v)) || containsSecret(v, integrationCode));
}


/**
 * Yazma yolu (ADR C.10): sır alanlarındaki DÜZ METİN string değerleri şifreler (derin kopya; girdi değişmez).
 *  - zaten `enc:v1:` ile başlıyorsa DOKUNULMAZ (idempotent; `resolveSecretsForWrite` ile korunan mevcut şifreli değer)
 *  - '' (temizleme), 'sensitive' sentinel'i ve string OLMAYAN değerler (sayı/nesne) şifrelenmez (bkz. BACKLOG: sır alanı string olmalı)
 * Anahtar yapılandırması yoksa FieldCryptoError fırlatır (fail-closed: sır düz yazılmaz).
 */
export function encryptSecrets(settings: any, integrationCode?: string): any {
    return transformSecrets(settings, integrationCode, (v) => (typeof v === 'string' && v !== '' && v !== SENSITIVE_MASK && !isEncrypted(v) ? encryptField(v) : v));
}

/**
 * Okuma yolu (ADR C.11): YALNIZCA adaptör yapılandırması kurulurken çağrılır. Sır alanlarındaki `enc:v1:` değerleri çözer;
 * düz metin geçiş dönemi uyumu için olduğu gibi döner (ADR C.12). Çözülmüş değer loglanmaz/API'ye/Redis'e girmez.
 * Hata mesajı alan ADINI içerir, değer içermez.
 */
export function decryptSecrets(settings: any, integrationCode?: string): any {
    return transformSecrets(settings, integrationCode, (v, path) => {
        if (!isEncrypted(v)) return v;
        try { return decryptField(v); } catch (e: any) {
            throw new Error(`Entegrasyon sırrı çözülemedi (alan: ${path}): ${e && e.message ? e.message : 'bilinmeyen hata'}`);
        }
    });
}

/** Sır alanlarına `fn` uygular (iç içe nesne/dizi dahil); sır olmayan değerler aynen kopyalanır. */
function transformSecrets(node: any, integrationCode: string | undefined, fn: (v: any, path: string) => any, path = ''): any {
    if (Array.isArray(node)) return node.map((v, i) => transformSecrets(v, integrationCode, fn, `${path}[${i}]`));
    if (!isPlainObject(node)) return node;
    const out: any = {};
    for (const [k, v] of Object.entries(node)) {
        const p = path ? `${path}.${k}` : k;
        if (isSecretField(k, integrationCode) && !isPlainObject(v) && !Array.isArray(v)) out[k] = fn(v, p);
        else if (isPlainObject(v) || Array.isArray(v)) out[k] = transformSecrets(v, integrationCode, fn, p);
        else out[k] = v;
    }
    return out;
}

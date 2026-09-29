import crypto from 'crypto';

/**
 * ADR-0003 Karar C (10-14): tenant'a özgü sırların (pazaryeri anahtarı, OAuth token vb.) uygulama düzeyi alan şifrelemesi.
 *
 * Algoritma : AES-256-GCM (Node `crypto`, bağımlılık yok). Her değer için RASTGELE 12 bayt IV.
 * Biçim     : `enc:v1:<kid>:<iv>:<ciphertext>:<tag>`  (iv/ciphertext/tag = standart base64; kid `[A-Za-z0-9_-]{1,32}`)
 *             GCM ek doğrulanan veri (AAD) = `enc:v1:<kid>` -> kid alanı kurcalanırsa çözme başarısız olur.
 * Anahtarlar: ortam değişkenleri (kaynak koda/repoya/loga ASLA yazılmaz; `.env.example` yalnızca değişken adlarını içerir)
 *   FIELD_ENCRYPTION_KEYS       = "<kid1>:<base64(32 bayt)>,<kid2>:<base64(32 bayt)>"   (virgülle ayrılmış kid:anahtar çiftleri)
 *   FIELD_ENCRYPTION_ACTIVE_KID = "<kid>"  (yeni şifrelemede kullanılan; FIELD_ENCRYPTION_KEYS içinde bulunmalı)
 *   Anahtar üretimi (insan, Protokol 12):  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Rotasyon (C.13): yeni kid eklenir + aktif yapılır -> `migrate-encrypt-integration-secrets.js --rotate` -> eski kid kaldırılır.
 * Fail-fast: `assertFieldCryptoConfig()` süreç başlangıcında (entegrasyonik.ts) çağrılır; tanımsız/geçersizse süreç BAŞLAMAZ.
 *
 * Hata mesajları anahtar/açık metin/şifreli değer İÇERMEZ (yalnızca değişken adı, kid ve alan yapısı).
 */

export const ENCRYPTED_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const KID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export class FieldCryptoError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FieldCryptoError';
    }
}

export interface Keyring {
    keys: Map<string, Buffer>;
    activeKid: string;
}

/** Ham env değerlerinden anahtar halkası kurar ve doğrular. Geçersizse FieldCryptoError (değer içermeyen mesajla). */
export function parseKeyring(rawKeys: string | undefined, activeKid: string | undefined): Keyring {
    if (!rawKeys || !rawKeys.trim()) throw new FieldCryptoError('FIELD_ENCRYPTION_KEYS tanımlı değil (biçim: "kid:base64(32 bayt)[,kid2:base64(32 bayt)]").');
    if (!activeKid || !activeKid.trim()) throw new FieldCryptoError('FIELD_ENCRYPTION_ACTIVE_KID tanımlı değil.');

    const keys = new Map<string, Buffer>();
    for (const pair of rawKeys.split(',')) {
        const trimmed = pair.trim();
        if (!trimmed) continue;
        const idx = trimmed.indexOf(':');
        if (idx <= 0) throw new FieldCryptoError('FIELD_ENCRYPTION_KEYS geçersiz: her öğe "kid:base64" biçiminde olmalı.');
        const kid = trimmed.slice(0, idx);
        const b64 = trimmed.slice(idx + 1);
        if (!KID_RE.test(kid)) throw new FieldCryptoError('FIELD_ENCRYPTION_KEYS geçersiz: kid yalnızca [A-Za-z0-9_-] (en fazla 32 karakter) içerebilir.');
        if (keys.has(kid)) throw new FieldCryptoError(`FIELD_ENCRYPTION_KEYS geçersiz: "${kid}" kid'i birden fazla tanımlı.`);
        const buf = B64_RE.test(b64) ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
        if (buf.length !== KEY_BYTES || buf.toString('base64') !== b64) {
            throw new FieldCryptoError(`FIELD_ENCRYPTION_KEYS geçersiz: "${kid}" anahtarı standart base64 kodlu tam ${KEY_BYTES} bayt olmalı.`);
        }
        keys.set(kid, buf);
    }
    if (keys.size === 0) throw new FieldCryptoError('FIELD_ENCRYPTION_KEYS geçersiz: en az bir anahtar gerekli.');
    const active = activeKid.trim();
    if (!keys.has(active)) throw new FieldCryptoError(`FIELD_ENCRYPTION_ACTIVE_KID ("${active}") FIELD_ENCRYPTION_KEYS içinde yok.`);
    return { keys, activeKid: active };
}

let cache: { sig: string; keyring: Keyring } | undefined;

/** Ortamdan (önbellekli; env değişirse yeniden kurulur) anahtar halkasını döner. Geçersizse FieldCryptoError. */
export function getKeyring(env: NodeJS.ProcessEnv = process.env): Keyring {
    const rawKeys = env.FIELD_ENCRYPTION_KEYS;
    const active = env.FIELD_ENCRYPTION_ACTIVE_KID;
    const sig = `${rawKeys ?? ''}\u0000${active ?? ''}`;
    if (cache && cache.sig === sig) return cache.keyring;
    const keyring = parseKeyring(rawKeys, active);
    cache = { sig, keyring };
    return keyring;
}

/** Süreç başlangıcı (fail-fast, ADR C.10): tanımsız/geçersizse fırlatır. */
export function assertFieldCryptoConfig(env: NodeJS.ProcessEnv = process.env): void {
    getKeyring(env);
}

export function isEncrypted(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/** `enc:v1:<kid>:...` değerinin kid'i (biçim bozuksa undefined). */
export function kidOf(value: unknown): string | undefined {
    if (!isEncrypted(value)) return undefined;
    const parts = value.split(':');
    return parts.length === 6 ? parts[2] : undefined;
}

export function getActiveKid(env: NodeJS.ProcessEnv = process.env): string {
    return getKeyring(env).activeKid;
}

/** Açık metni aktif anahtarla şifreler. Boş string dahil her string kabul edilir; çağıran boşu şifrelememeyi seçer (bkz. integrationSecrets). */
export function encryptField(plaintext: string): string {
    if (typeof plaintext !== 'string') throw new FieldCryptoError('encryptField yalnızca string kabul eder.');
    const { keys, activeKid } = getKeyring();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, keys.get(activeKid) as Buffer, iv);
    cipher.setAAD(Buffer.from(`${ENCRYPTED_PREFIX}${activeKid}`));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENCRYPTED_PREFIX}${activeKid}:${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}

/**
 * `enc:v1:` değerini çözer. `enc:v1:` ile BAŞLAMAYAN değer (geçiş dönemi düz metni, ADR C.12) OLDUĞU GİBİ döner.
 * Şifreli ama bozuk/bilinmeyen kid/yanlış anahtar/kurcalanmış değer -> FieldCryptoError (mesajda değer/anahtar YOK).
 */
export function decryptField(value: string): string {
    if (!isEncrypted(value)) return value;
    const parts = value.split(':');
    if (parts.length !== 6) throw new FieldCryptoError('Şifreli alan biçimi geçersiz.');
    const [, , kid, ivB64, ctB64, tagB64] = parts;
    const key = getKeyring().keys.get(kid);
    if (!key) throw new FieldCryptoError(`Şifreli alanın anahtarı ("${kid}") FIELD_ENCRYPTION_KEYS içinde yok.`);
    if (!B64_RE.test(ivB64) || !B64_RE.test(ctB64) || !B64_RE.test(tagB64)) throw new FieldCryptoError('Şifreli alan biçimi geçersiz.');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== 16) throw new FieldCryptoError('Şifreli alan biçimi geçersiz.');
    try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAAD(Buffer.from(`${ENCRYPTED_PREFIX}${kid}`));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
    } catch {
        throw new FieldCryptoError('Şifreli alan çözülemedi (yanlış anahtar veya kurcalanmış değer).');
    }
}

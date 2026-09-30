import { createHash, randomBytes } from 'crypto';
import { rawEnv } from '@config';

/**
 * ADR-0027 §C: ürün görseli doğrudan-yükleme POLİTİKASI — SAF (ağ/DB yok). Tek yerde:
 *  - tür izin listesi + sihirli bayt (magic byte) doğrulaması (istemcinin bildirdiği Content-Type'a GÜVENİLMEZ),
 *  - boyut tavanı / imza TTL'i (env ile ayarlanabilir, üst sınırlı),
 *  - nesne anahtarı üreticileri (tenant önekli; kesin anahtar İÇERİK-ADRESLİ ve sunucuda hesaplanır),
 *  - herkese açık URL ve boyutlandırma (Cloudflare Image Transformations) URL üreticisi.
 *
 * Anahtar şeması (ADR-0013 B3 ile uyumlu `<tür>/<clientId>/…`; `t/<tenantId>/…` göçü o ADR'de iptal edildi):
 *   geçici  : `uploads/<clientId>/<uploadId>`                        (imzalı PUT hedefi; R2 yaşam döngüsü 1 gün)
 *   kalıcı  : `products/<clientId>/<productRef>/<sha256[0:32]>.<ext>` (onaydan sonra sunucu yazar; değişmez)
 */

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export type ImageContentType = typeof IMAGE_CONTENT_TYPES[number];

export const EXTENSION_BY_TYPE: Readonly<Record<ImageContentType, string>> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
};

/** Pazaryerlerinin genelde kabul ettiği biçimler; dışındakiler pazaryerine dönüştürülmüş (jpeg) URL ile gider. */
export const MARKETPLACE_SAFE_TYPES: ReadonlyArray<ImageContentType> = ['image/jpeg', 'image/png'];

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const UPLOAD_PREFIX = 'uploads';
export const PRODUCT_PREFIX = 'products';

const HARD_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_TTL_SEC = 300;
const HARD_MAX_TTL_SEC = 900;
/** Sıkıştırma bombası / aşırı büyük piksel sayısı kapısı (sharp başlık okuması; tam çözme yapılmaz). */
export const MAX_PIXELS = 50_000_000;

export interface ImageUploadSettings {
    maxBytes: number;
    ttlSec: number;
    /** Kalıcı görsellerin genel kökü (R2 özel alan adı), sonda `/` YOK. Örn. `https://cdn.entegrasyonik.com`. */
    publicBaseUrl?: string;
    /** Cloudflare Image Transformations alanda açık mı (varsayılan KAPALI → boyutlandırma URL'i = orijinal URL). */
    transformationsEnabled: boolean;
}

const posInt = (v: string | undefined, def: number, max: number): number => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def;
};

export function readImageUploadSettings(env: NodeJS.ProcessEnv = rawEnv()): ImageUploadSettings {
    const base = (env.R2_PUBLIC_URL_IMAGE || '').trim().replace(/\/+$/, '');
    return {
        maxBytes: posInt(env.IMAGE_UPLOAD_MAX_BYTES, DEFAULT_MAX_BYTES, HARD_MAX_BYTES),
        ttlSec: posInt(env.IMAGE_UPLOAD_URL_TTL_SEC, DEFAULT_TTL_SEC, HARD_MAX_TTL_SEC),
        publicBaseUrl: base || undefined,
        transformationsEnabled: String(env.IMAGE_TRANSFORMATIONS_ENABLED || '').trim().toLowerCase() === 'true',
    };
}

export function isAllowedImageType(t: unknown): t is ImageContentType {
    return typeof t === 'string' && (IMAGE_CONTENT_TYPES as ReadonlyArray<string>).includes(t);
}

/** Sihirli bayt ile GERÇEK türü belirler; izin listesinde yoksa `undefined` (SVG/HTML/GIF vb. reddedilir). */
export function sniffImageType(buf: Buffer): ImageContentType | undefined {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return undefined;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
    if (buf.toString('latin1', 4, 8) === 'ftyp') {
        const boxSize = Math.min(buf.readUInt32BE(0), buf.length, 64);
        const brands: string[] = [buf.toString('latin1', 8, 12)];
        for (let o = 16; o + 4 <= boxSize; o += 4) brands.push(buf.toString('latin1', o, o + 4));
        if (brands.some((b) => b === 'avif' || b === 'avis')) return 'image/avif';
    }
    return undefined;
}

export function newUploadId(): string {
    return randomBytes(16).toString('hex');
}

export const UPLOAD_ID_RE = /^[a-f0-9]{32}$/;
/** Ürün başvurusu (tempId/ObjectId): anahtar segmentine gömüldüğü için dar küme. */
export const PRODUCT_REF_RE = /^[A-Za-z0-9_-]{1,64}$/;

const assertClientId = (clientId: string | number): string => {
    const id = String(clientId);
    if (!/^\d{1,10}$/.test(id)) throw new Error('imagePolicy: geçersiz clientId');
    return id;
};

export function stagingKey(clientId: string | number, uploadId: string): string {
    if (!UPLOAD_ID_RE.test(uploadId)) throw new Error('imagePolicy: geçersiz uploadId');
    return `${UPLOAD_PREFIX}/${assertClientId(clientId)}/${uploadId}`;
}

export function sha256Hex(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
}

export function productImageKey(clientId: string | number, productRef: string, sha256: string, type: ImageContentType): string {
    if (!PRODUCT_REF_RE.test(productRef)) throw new Error('imagePolicy: geçersiz ürün başvurusu');
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('imagePolicy: geçersiz sha256');
    return `${PRODUCT_PREFIX}/${assertClientId(clientId)}/${productRef}/${sha256.slice(0, 32)}.${EXTENSION_BY_TYPE[type]}`;
}

/** Anahtar, bu tenant'ın kalıcı ürün görseli önekinde mi (silme/yeniden kullanım koruması; kardeş tenant `1`/`10` ayrımı dahil). */
export function isTenantProductKey(clientId: string | number, key: unknown): key is string {
    if (typeof key !== 'string') return false;
    const prefix = `${PRODUCT_PREFIX}/${assertClientId(clientId)}/`;
    return key.startsWith(prefix) && !key.includes('..') && /^[A-Za-z0-9_\-./]+$/.test(key);
}

/** Kalıcı görselin herkese açık HTTPS URL'i. Kök yoksa/HTTPS değilse hata (pazaryerleri HTTPS + herkese açık ister). */
export function publicImageUrl(key: string, settings: ImageUploadSettings = readImageUploadSettings()): string {
    const base = settings.publicBaseUrl;
    if (!base || !/^https:\/\//i.test(base)) throw new Error('Storage: R2_PUBLIC_URL_IMAGE https:// ile başlayan bir kök olmalı (ADR-0027).');
    return `${base}/${key}`;
}

export interface ImageVariantOptions { width?: number; height?: number; format?: 'auto' | 'jpeg' | 'webp' | 'avif'; fit?: 'scale-down' | 'contain' | 'cover' }

/**
 * Boyutlandırılmış görsel URL'i — TEK ÜRETİCİ. Image Transformations kapalıysa ORİJİNAL URL döner (kırılmaz; yalnız
 * boyutlandırma yapılmaz). Açıksa: `https://cdn…/cdn-cgi/image/width=300,format=auto/<anahtar>`.
 */
export function imageVariantUrl(key: string, opts: ImageVariantOptions, settings: ImageUploadSettings = readImageUploadSettings()): string {
    const original = publicImageUrl(key, settings);
    if (!settings.transformationsEnabled) return original;
    const parts: string[] = [];
    if (opts.width && Number.isInteger(opts.width) && opts.width > 0) parts.push(`width=${Math.min(opts.width, 4000)}`);
    if (opts.height && Number.isInteger(opts.height) && opts.height > 0) parts.push(`height=${Math.min(opts.height, 4000)}`);
    if (opts.fit) parts.push(`fit=${opts.fit}`);
    parts.push(`format=${opts.format || 'auto'}`);
    return `${settings.publicBaseUrl}/cdn-cgi/image/${parts.join(',')}/${key}`;
}

/** Liste/ızgara küçük resmi (eski `_t` 300px küçük resminin karşılığı). */
export const THUMB_WIDTH = 300;

/**
 * Pazaryerine gidecek URL: HTTPS + herkese açık; pazaryeri-güvenli olmayan biçim (webp/avif) dönüşüm açıksa jpeg'e
 * çevrilmiş URL ile, kapalıysa orijinal URL ile gider (çağıran uyarı üretebilir: `needsConversion`).
 */
export function marketplaceImageUrl(key: string, type: ImageContentType, settings: ImageUploadSettings = readImageUploadSettings()): { url: string; needsConversion: boolean } {
    if (MARKETPLACE_SAFE_TYPES.includes(type)) return { url: publicImageUrl(key, settings), needsConversion: false };
    if (settings.transformationsEnabled) return { url: imageVariantUrl(key, { format: 'jpeg' }, settings), needsConversion: false };
    return { url: publicImageUrl(key, settings), needsConversion: true };
}

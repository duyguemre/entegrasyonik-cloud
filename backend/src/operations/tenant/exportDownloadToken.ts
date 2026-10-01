import crypto from 'crypto';
import Security from '@platform/core/security/Security';

/**
 * ADR-0003 adım 8 (KVKK dışa aktarma, Karar F.22): "24 saat geçerli imzalı URL".
 * BULGU / doğrulanamadı: gerçek bir R2 presigned URL (S3 SigV4) ÜRETİLMİYOR — StorageService/S3Manager'da bu
 * yetenek yok (bu ADR aşamasında eklenmedi). Bunun yerine BASİT bir HMAC imzalı token şeması kullanılır (yeni sır
 * YOK: mevcut JWT_SECRET'ın imzalama amaçlı yeniden kullanımı — Security.loadConfig zaten fail-fast).
 * [API_TENANT_SURFACE §5] Token artık `GET /api/tenant-data/export/download?token=...` rotasında tüketilir
 * (api/files/ExportDownloadApiManager.ts + operations/tenant/exportDownload.ts): oturumlu owner, tenant bağlı, tek kullanım, akış.
 * Token biçimi DEĞİŞMEDİ (tenant bağı anahtar yolundaki `exports/<clientId>/` ile sağlanır).
 */

export interface ExportDownloadTokenPayload {
    key: string;
    expiresAt: number; // epoch ms
}

function hmac(data: string): string {
    const secret = Security.loadConfig().secret;
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/** `<base64url(key)>.<expiresAt>.<hmac hex>` biçiminde imzalı token üretir. */
export function signExportDownloadToken(payload: ExportDownloadTokenPayload): string {
    const encodedKey = Buffer.from(payload.key, 'utf8').toString('base64url');
    const data = `${encodedKey}.${payload.expiresAt}`;
    return `${data}.${hmac(data)}`;
}

/** Token geçerli VE süresi dolmamışsa payload'ı döner; aksi hâlde null (asla fırlatmaz). */
export function verifyExportDownloadToken(token: string, now: () => Date = () => new Date()): ExportDownloadTokenPayload | null {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedKey, expiresAtStr, signature] = parts;
    const data = `${encodedKey}.${expiresAtStr}`;
    let expected: string;
    try { expected = hmac(data); } catch { return null; }
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || expiresAt <= now().getTime()) return null;
    let key: string;
    try { key = Buffer.from(encodedKey, 'base64url').toString('utf8'); } catch { return null; }
    return { key, expiresAt };
}

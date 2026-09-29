import { S3Config } from '@interfaces/index';
import { rawEnv } from '@config';

/**
 * ADR-0003 B.8 (adım 5): R2 depolama yapılandırması YALNIZCA env'den okunur (tenant kaydından değil).
 * Tek erişim anahtarı, yalnızca iki bucket'a (arşiv, görsel) yetkili kapsamlı token olmalıdır (rotasyon: insan, Protokol 12).
 *
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   erişim anahtarı çifti (zorunlu)
 *   R2_ENDPOINT                              https://<hesap>.r2.cloudflarestorage.com (zorunlu)
 *   R2_REGION                                isteğe bağlı, varsayılan 'auto'
 *   R2_BUCKET_IMAGE, R2_BUCKET_ARCHIVE       bucket adları (zorunlu; ortama göre ayrı: NODE_ENV=production iken '-dev' ile biten ad reddedilir)
 *   R2_PUBLIC_URL_IMAGE, R2_PUBLIC_URL_ARCHIVE  isteğe bağlı genel CDN kökleri (sır değil)
 *
 * Tenant ayrımı nesne anahtarı önekiyle yapılır: `<tür>/<clientId>/…` (ör. `products/<clientId>/…`,
 * `clients/<clientId>/…`, `exports/<clientId>/…`) — bu, mevcut ve fiilen kullanılan tek şema (ADR-0013 B3,
 * 2026-09-27: tek anahtarlı `t/<tenantId>/…` şemasına göç güvenlik kazanımı sağlamadığından İPTAL edildi;
 * ADR-0003 B.8 güncellendi). Önceki `storageKeyPrefix()` yardımcı fonksiyonu hiçbir çağıran tarafından
 * kullanılmıyordu (tüm yol üreticileri `<tür>/<clientId>/…` desenini doğrudan üretiyordu) ve silindi —
 * tekrar eden bir soyutlamaya gerek yok.
 * Hata mesajları yalnızca değişken ADLARINI içerir, değer içermez.
 */
export type StorageType = 'image' | 'archive';

export interface StorageEnvConfig extends S3Config {
    publicUrl?: string;
}

export function readStorageEnv(type: StorageType, env: NodeJS.ProcessEnv = rawEnv()): StorageEnvConfig {
    if (type !== 'image' && type !== 'archive') throw new Error(`Storage: geçersiz depolama türü.`);
    const bucketVar = type === 'image' ? 'R2_BUCKET_IMAGE' : 'R2_BUCKET_ARCHIVE';
    const publicVar = type === 'image' ? 'R2_PUBLIC_URL_IMAGE' : 'R2_PUBLIC_URL_ARCHIVE';
    const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', bucketVar];
    const missing = required.filter(n => !env[n] || !String(env[n]).trim());
    if (missing.length > 0) throw new Error(`Storage yapılandırması eksik (env): ${missing.join(', ')}`);

    const bucketName = String(env[bucketVar]).trim();
    if (env.NODE_ENV === 'production' && /-dev$/i.test(bucketName)) {
        throw new Error(`Storage: ${bucketVar} üretimde '-dev' bucket'ına işaret edemez (ADR-0003 B.8).`);
    }
    const cfg: StorageEnvConfig = {
        accessKeyId: String(env.R2_ACCESS_KEY_ID),
        secretAccessKey: String(env.R2_SECRET_ACCESS_KEY),
        bucketName,
        endpoint: String(env.R2_ENDPOINT).trim(),
        region: (env.R2_REGION && env.R2_REGION.trim()) || 'auto',
    };
    if (env[publicVar] && env[publicVar]!.trim()) cfg.publicUrl = env[publicVar]!.trim();
    return cfg;
}

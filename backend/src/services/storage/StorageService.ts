import { IClientOperations, S3Config } from '@interfaces/index';
import S3Manager, { UploadObject } from './S3Manager';
import { parseExportArchiveKey } from '../../utils/exportKey';
import { presignUrl } from './presign';
import { eventLog } from '@platform/core/logger';

const log = eventLog('api', 'StorageService');
import {
    ImageContentType, IMMUTABLE_CACHE_CONTROL, isAllowedImageType, isTenantProductKey, newUploadId, readImageUploadSettings, stagingKey, UPLOAD_PREFIX,
} from './imagePolicy';

export interface ImageUploadTicket {
    uploadId: string;
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
    maxBytes: number;
}

/**
 * StorageService: Sistem genelinde Cloudflare R2 işlemlerini yöneten merkezi servis.
 * Kullanım: storage.uploadArchive(...)
 */
class StorageService {
    private clientOps!: IClientOperations;

    constructor() { }

    /**
     * Uygulama başlangıcında (app.ts) merkezi veritabanı instance'ını enjekte eder.
     */
    public initialize(clientOps: IClientOperations): void {
        log.info('STORAGE_INITIALIZED', '[StorageService] Initialized...');

        this.clientOps = clientOps;
    }



    private async getClientStorageConfig(clientId: string, type: 'image' | 'archive'): Promise<S3Config> {
        if (!this.clientOps) {
            throw new Error("StorageService: ClientOperations not initialized. Call initialize(clientOps) at app startup.");
        }

        // Doğrudan diğer domain servisindeki metodumuzu kullanıyoruz
        return await this.clientOps.getStorageConfig(clientId, type);
    }

    /**
     * Arşiv Dosyası Yükle (JSON vb.)
     */
    public async uploadArchive(clientId: string, data: any, directory: string, fileName: string) {
        const config = await this.getClientStorageConfig(clientId, 'archive');

        return await S3Manager.uploadArchive(config, {
            data,
            directory,
            fileName
        });
    }

    /**
     * Resim / Dosya Yükle (Buffer)
     */
    public async uploadImage(clientId: string, uploadData: Omit<UploadObject, 'config'>) {
        const config = await this.getClientStorageConfig(clientId, 'image');

        return await S3Manager.upload(config, uploadData as UploadObject);
    }

    /**
     * Tekil Dosya Sil
     */
    public async deleteFile(clientId: string, type: 'image' | 'archive', fileName: string, directory: string, extension?: string) {
        const config = await this.getClientStorageConfig(clientId, type);

        return await S3Manager.delete(config, {
            directory,
            fileName,
            fileExtension: extension
        });
    }

    /**
     * Klasör / Prefix Bazlı Çoklu Silme
     */
    public async deleteFolder(clientId: string, type: 'image' | 'archive', directory: string, prefix: string) {
        const config = await this.getClientStorageConfig(clientId, type);

        return await S3Manager.deleteMany(config, {
            directory,
            fileName: prefix
        });
    }

    /**
     * ADR-0003 adım 8 (KVKK dışa aktarma): tenant veri dışa aktarma zip arşivini `exports/<clientId>/` altına yükler
     * (archive bucket). Gerçek R2 isteği `S3Manager.upload` üzerinden gider; testlerde mock'lanır.
     */
    public async uploadExportArchive(clientId: string, buffer: Buffer, directory: string, fileName: string) {
        const config = await this.getClientStorageConfig(clientId, 'archive');
        return await S3Manager.upload(config, { file: { buffer, mimetype: 'application/zip' }, directory, fileName, fileExtension: 'zip' });
    }

    /**
     * KVKK dışa aktarma indirmesi: arşivi AKIŞ olarak açar. Anahtar `exports/<clientId>/export_<clientId>_<ts>.zip` biçimine ve
     * `clientId`'ye (tenant) uymuyorsa R2'ye HİÇ dokunulmaz (null). Nesne yoksa null.
     */
    public async openExportArchive(clientId: string, key: string): Promise<{ body: any; contentLength?: number } | null> {
        const parsed = parseExportArchiveKey(key);
        if (!parsed || parsed.clientId !== String(clientId)) return null;
        const config = await this.getClientStorageConfig(clientId, 'archive');
        return await S3Manager.getObject(config, key);
    }

    /** Tek kullanımlık indirme sonrası arşivi siler (aynı anahtar/tenant doğrulaması). true = silme denendi ve hata yok. */
    public async deleteExportArchive(clientId: string, key: string): Promise<boolean> {
        const parsed = parseExportArchiveKey(key);
        if (!parsed || parsed.clientId !== String(clientId)) return false;
        const config = await this.getClientStorageConfig(clientId, 'archive');
        const res: any = await S3Manager.delete(config, { directory: parsed.directory, fileName: parsed.fileName, fileExtension: 'zip' });
        return !(res && res.result === false);
    }

    /**
     * ADR-0003 adım 8 (purge): tenant'a ait TÜM nesneleri (arşiv + görsel bucket'ları) siler. Gerçek R2 çağrısı
     * `S3Manager.deleteMany` üzerinden gider; bu servis çağrıyı hiçbir koşulda otomatik/zamanlı TETİKLEMEZ
     * (yalnızca purge işi çağırır). Best-effort: bir dizin hata verirse diğerleri denenir, tümü raporlanır.
     *
     * Düzeltildi (2026-09-27, R2 isimlendirme incelemesi): kod okumasıyla doğrulandı — ÜRÜN görselleri de
     * clientId'ye göre ayrışıyor (`products/<clientId>/<productId>/…`, bkz. `image-service.ts:addImages`,
     * `ImageOperations.imageFilesPath="products/"`); önceki not ("ayrışmıyor") YANLIŞTI, düzeltildi. Gerçek eksik
     * şuydu: bu metot `products/<clientId>` dizinini hiç TEMİZLEMİYORDU (purge sonrası ürün görselleri R2'de kalıyordu
     * — KVKK açısından critical) — artık temizleniyor. Ayrıca prefix eşleşmesi `S3Manager.deleteMany`'de tam bir
     * `directory/fileName` string'idir (S3 Prefix, dizin sınırı DEĞİL): `clients/1` öneki `clients/10`, `clients/123`
     * gibi BAŞKA tenant'ların nesnelerini de eşleştirirdi (sayısal clientId'lerde ortak önek çakışması — critical
     * cross-tenant silme riski). Bu yüzden burada `fileName` her zaman sonda `/` ile geçirilir (`"<clientId>/"`),
     * prefix tam dizin sınırında biter (`clients/1/`, `products/1/`) ve kardeş tenant'a asla değmez.
     *
     * `exports/<clientId>/…` (ExportOrchestrator.archiveAndCleanup, arşiv bucket) zaten aynı düzeltmeyle temizlenir.
     * Kapsam dışı bırakılan (henüz uygulanmadı, insan kararı): ADR-0003 B.8'deki tek `t/<tenantId>/…` önek şeması —
     * bu, gerçek Cloudflare R2'deki MEVCUT nesnelerin taşınmasını (fiziksel rename/copy) gerektirir; buradaki DB
     * `Image.url` alanı yükleme anında SABİT string olarak yazıldığından şema değişikliği zaten servis edilen
     * görsellerin URL'sini bozmaz, ama gerçek R2'de nesne taşımak gerçek kimlik bilgisi + insan onayı ister.
     */
    public async deletePrefix(clientId: string): Promise<Record<'image' | 'archive', { result: boolean; error?: string }>> {
        const id = String(clientId);
        const safeDelete = async (type: 'image' | 'archive', directory: string) => {
            try {
                const config = await this.getClientStorageConfig(clientId, type);
                // Sonda '/' ZORUNLU: prefix'in dizin sınırında bitmesini sağlar, kardeş tenant'ı (örn. "1" vs "10") eşlemez.
                await S3Manager.deleteMany(config, { directory, fileName: `${id}/` });
                return { result: true };
            } catch (error: any) {
                log.error('STORAGE_DELETE_PREFIX_FAILED', `[StorageService] deletePrefix (${type}/${directory}) hata:`, { err: error?.message });
                return { result: false, error: error?.message };
            }
        };

        // ADR-0027: doğrudan yüklemenin geçici öneki (`uploads/<clientId>/`) da purge kapsamındadır.
        const [imageClients, imageProducts, imageUploads, archive] = await Promise.all([
            safeDelete('image', 'clients'),
            safeDelete('image', 'products'),
            safeDelete('image', UPLOAD_PREFIX),
            safeDelete('archive', 'exports'),
        ]);
        const image = (imageClients.result && imageProducts.result && imageUploads.result)
            ? { result: true }
            : { result: false, error: [imageClients.error, imageProducts.error, imageUploads.error].filter(Boolean).join(' | ') };
        return { image, archive };
    }

    // --- ADR-0027: tarayıcıdan doğrudan R2'ye (imzalı PUT) görsel yükleme ---------------------------------------

    /**
     * İmzalı PUT bileti üretir (R2'ye İSTEK ATMAZ; yalnız yerel HMAC). Tür izin listesi + boyut tavanı burada;
     * `Content-Type` ve `Content-Length` imzaya dahildir (farklı tür/boyutla PUT R2'de 403 alır). Hedef: tenant önekli,
     * rastgele GEÇİCİ anahtar (`uploads/<clientId>/<uploadId>`) — kalıcı nesnelerin üzerine yazmak imkânsızdır.
     */
    public async createImageUploadTicket(clientId: string | number, contentType: string, size: number): Promise<ImageUploadTicket> {
        const settings = readImageUploadSettings();
        if (!isAllowedImageType(contentType)) throw new Error('Storage: görsel türü izinli değil');
        if (!Number.isInteger(size) || size < 1 || size > settings.maxBytes) throw new Error('Storage: görsel boyutu tavanı aşıyor');
        const config = await this.getClientStorageConfig(String(clientId), 'image');
        const uploadId = newUploadId();
        const signed = presignUrl({
            method: 'PUT', endpoint: config.endpoint as string, bucket: config.bucketName, key: stagingKey(clientId, uploadId),
            region: config.region || 'auto', accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey,
            expiresInSec: settings.ttlSec, signedHeaders: { 'Content-Type': contentType, 'Content-Length': size },
        });
        return { uploadId, method: 'PUT', url: signed.url, headers: signed.headers, expiresAt: signed.expiresAt, maxBytes: settings.maxBytes };
    }

    /** Geçici yüklemeyi (tavanlı) okur. Yoksa null; tavan aşılırsa `{ tooLarge: true }`. */
    public async readStagedImage(clientId: string | number, uploadId: string): Promise<{ buffer?: Buffer; tooLarge?: boolean } | null> {
        const config = await this.getClientStorageConfig(String(clientId), 'image');
        return await S3Manager.getObjectBuffer(config, stagingKey(clientId, uploadId), readImageUploadSettings().maxBytes);
    }

    /** Geçici yüklemeyi siler (best-effort; kalan yetimi R2 yaşam döngüsü kuralı `uploads/` 1 günde temizler). */
    public async discardStagedImage(clientId: string | number, uploadId: string): Promise<boolean> {
        try {
            const config = await this.getClientStorageConfig(String(clientId), 'image');
            await S3Manager.deleteKey(config, stagingKey(clientId, uploadId));
            return true;
        } catch (error: any) {
            log.error('STORAGE_DISCARD_STAGED_FAILED', '[StorageService] discardStagedImage hata:', { err: error?.name || error?.message });
            return false;
        }
    }

    /** Doğrulanmış içeriği kalıcı içerik-adresli anahtara yazar (değişmez önbellek başlığıyla). */
    public async commitProductImage(clientId: string | number, key: string, buffer: Buffer, contentType: ImageContentType): Promise<void> {
        if (!isTenantProductKey(clientId, key)) throw new Error('Storage: anahtar tenant ürün öneki dışında');
        const config = await this.getClientStorageConfig(String(clientId), 'image');
        await S3Manager.putObject(config, key, buffer, contentType, IMMUTABLE_CACHE_CONTROL);
    }

    /** Kalıcı ürün görselini TAM anahtarla siler; anahtar bu tenant'ın `products/<clientId>/` önekinde değilse DOKUNMAZ. */
    public async deleteProductImageKey(clientId: string | number, key: string): Promise<boolean> {
        if (!isTenantProductKey(clientId, key)) return false;
        try {
            const config = await this.getClientStorageConfig(String(clientId), 'image');
            await S3Manager.deleteKey(config, key);
            return true;
        } catch (error: any) {
            log.error('STORAGE_DELETE_IMAGE_KEY_FAILED', '[StorageService] deleteProductImageKey hata:', { err: error?.name || error?.message });
            return false;
        }
    }

    /**
     * Dosya Kopyala (Bucket içi)
     */
    public async copyFile(clientId: string, fileName: string, extension: string, fromDir: string, toDir: string) {
        const config = await this.getClientStorageConfig(clientId, 'image');

        return await S3Manager.copy(config, {
            directory: toDir,
            copyDirectory: fromDir,
            fileName,
            fileExtension: extension
        });
    }
}

// Instance olarak export ediyoruz: import { storage } from '...'
export const storageService = new StorageService();
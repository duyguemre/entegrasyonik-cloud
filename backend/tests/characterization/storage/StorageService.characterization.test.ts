/**
 * CHARACTERIZATION: StorageService (backend/src/services/storage/StorageService.ts)
 * S3Manager tamamen mock'lanır: gerçek R2/AWS SDK çağrısı YOK, ağ YOK. `clientOps.getStorageConfig` sahte, sentetik config döner.
 *
 * [ADR-0003 adım 8] `deletePrefix(clientId)` — purge işinin R2 temizliği için kullanılır. Gerçek silme YOK;
 * yalnızca `S3Manager.deleteMany` mock'unun doğru config/prefix ile çağrıldığı doğrulanır.
 *
 * [2026-09-27, R2 isimlendirme incelemesi — critical düzeltme] `deletePrefix` artık:
 *  (a) `products/<clientId>/` dizinini de siler (ürün görselleri de clientId'ye göre ayrışıyor; önceki
 *      varsayım YANLIŞTI — bkz. StorageService.ts yorum), purge sonrası artık R2'de kalmıyor;
 *  (b) prefix her zaman sonda "/" ile biter — S3 Prefix eşleşmesi dizin sınırı BİLMEZ, sonda "/" olmadan
 *      "clients/1" öneki "clients/10", "clients/123" gibi BAŞKA tenant'ları da eşlerdi (cross-tenant silme riski).
 * Bu dosyadaki testler bu iki noktayı özellikle doğrular.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  CopyObjectCommand: jest.fn(),
  ListObjectsV2Command: jest.fn(),
}));

import { captureLogs } from '../../helpers/logCapture';
import S3Manager from '../../../src/services/storage/S3Manager';
import { storageService } from '../../../src/services/storage/StorageService';

const IMAGE_CONFIG = { accessKeyId: 'img-key', secretAccessKey: 'img-secret', bucketName: 'img-bucket', endpoint: 'https://img.invalid' };
const ARCHIVE_CONFIG = { accessKeyId: 'arc-key', secretAccessKey: 'arc-secret', bucketName: 'arc-bucket', endpoint: 'https://arc.invalid' };

function makeClientOps() {
  return {
    getStorageConfig: jest.fn(async (clientId: string, type: 'image' | 'archive') => (type === 'image' ? IMAGE_CONFIG : ARCHIVE_CONFIG)),
    saveNotification: jest.fn(async () => undefined),
  };
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(S3Manager, 'deleteMany').mockResolvedValue({ result: true } as any);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('StorageService.deleteFolder (mevcut davranış): prefix bazlı çoklu silme', () => {
  it('config clientOps.getStorageConfig(clientId, type) ile alınır, S3Manager.deleteMany(directory, prefix) ile çağrılır', async () => {
    const clientOps = makeClientOps();
    storageService.initialize(clientOps as any);

    await storageService.deleteFolder('42', 'archive', 'exports', '42');

    expect(clientOps.getStorageConfig).toHaveBeenCalledWith('42', 'archive');
    // NOT: deleteFolder burada fileName'i AYNEN geçirir (imageId gibi bir DOSYA öneki için trailing-slash
    // eklenmez — bu genel amaçlı metot, tenant-dizin sınırı garantisi vermez; o garanti yalnızca deletePrefix'te).
    expect(S3Manager.deleteMany).toHaveBeenCalledWith(ARCHIVE_CONFIG, { directory: 'exports', fileName: '42' });
  });
});

describe('StorageService.deletePrefix (ADR-0003 adım 8, purge — mock, GERÇEK R2 çağrısı YOK)', () => {
  it('görsel bucket\'ında HEM clients/<id>/ HEM products/<id>/ dizinlerini, arşivde exports/<id>/ dizinini siler', async () => {
    const clientOps = makeClientOps();
    storageService.initialize(clientOps as any);

    const result = await storageService.deletePrefix('7');

    expect(clientOps.getStorageConfig).toHaveBeenCalledWith('7', 'image');
    expect(clientOps.getStorageConfig).toHaveBeenCalledWith('7', 'archive');
    expect(S3Manager.deleteMany).toHaveBeenCalledWith(IMAGE_CONFIG, { directory: 'clients', fileName: '7/' });
    expect(S3Manager.deleteMany).toHaveBeenCalledWith(IMAGE_CONFIG, { directory: 'products', fileName: '7/' });
    expect(S3Manager.deleteMany).toHaveBeenCalledWith(ARCHIVE_CONFIG, { directory: 'exports', fileName: '7/' });
    // [ADR-0027] doğrudan yüklemenin geçici öneki de purge edilir.
    expect(S3Manager.deleteMany).toHaveBeenCalledWith(IMAGE_CONFIG, { directory: 'uploads', fileName: '7/' });
    expect(S3Manager.deleteMany).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ image: { result: true }, archive: { result: true } });
  });

  it('CRITICAL: prefix sonda "/" içerir — "1" tenant\'ı asla "10"/"123" gibi kardeş tenant öneklerini eşlemez', async () => {
    const clientOps = makeClientOps();
    storageService.initialize(clientOps as any);

    await storageService.deletePrefix('1');

    expect((S3Manager.deleteMany as jest.Mock<any>).mock.calls.length).toBeGreaterThan(0);
    for (const call of (S3Manager.deleteMany as jest.Mock<any>).mock.calls) {
      const [, deleteObject] = call as [any, { directory: string; fileName: string }];
      expect(deleteObject.fileName).toBe('1/'); // sonda "/" zorunlu
      const fullPrefix = `${deleteObject.directory}/${deleteObject.fileName}`; // örn. "clients/1/"
      // Gerçek S3 Prefix semantiğiyle aynı kontrol: bu prefix kendi tenant'ının nesnesini eşler, kardeşini eşlemez.
      expect(`${deleteObject.directory}/1/x.jpg`.startsWith(fullPrefix)).toBe(true);
      expect(`${deleteObject.directory}/10/x.jpg`.startsWith(fullPrefix)).toBe(false);
      expect(`${deleteObject.directory}/123/y.jpg`.startsWith(fullPrefix)).toBe(false);
    }
  });

  it('bir dizin hata verirse DİĞERLERİ yine denenir; hata sonuçta raporlanır, fırlatılmaz (purge devam edebilir)', async () => {
    const clientOps = makeClientOps();
    storageService.initialize(clientOps as any);
    (S3Manager.deleteMany as jest.Mock<any>).mockImplementation(async (config: any) => {
      if (config === ARCHIVE_CONFIG) throw new Error('R2 down');
      return { result: true };
    });

    const cap = captureLogs();
    const result = await storageService.deletePrefix('9');

    expect(result.image).toEqual({ result: true }); // clients/9/ ve products/9/ ikisi de görsel config'i kullanıyor, ikisi de başarılı
    expect(result.archive).toEqual({ result: false, error: 'R2 down' });
    // F-06: hata eventLog ile yazılır (STORAGE_DELETE_PREFIX_FAILED); console.error değil.
    expect(cap.find((l) => l.code === 'STORAGE_DELETE_PREFIX_FAILED' && String(l.msg).includes('deletePrefix (archive/exports)') && l.err === 'R2 down')).toBeDefined();
    cap.restore();
  });

  it('görsel bucket\'ında SADECE bir alt dizin (örn. products) hata verirse image.result false olur ve iki hata da yansır', async () => {
    const clientOps = makeClientOps();
    storageService.initialize(clientOps as any);
    (S3Manager.deleteMany as jest.Mock<any>).mockImplementation(async (config: any, deleteObject: any) => {
      if (config === IMAGE_CONFIG && deleteObject.directory === 'products') throw new Error('products silinemedi');
      return { result: true };
    });

    const result = await storageService.deletePrefix('9');

    expect(result.image.result).toBe(false);
    expect(result.image.error).toContain('products silinemedi');
    expect(result.archive).toEqual({ result: true });
  });

  it('getClientStorageConfig hatası (initialize edilmemiş) de yakalanır: sonuç {result:false}, fırlatılmaz', async () => {
    const uninitialized: any = new (Object.getPrototypeOf(storageService).constructor)();
    await expect(uninitialized.deletePrefix('1')).resolves.toEqual({
      image: { result: false, error: expect.stringContaining('not initialized') },
      archive: { result: false, error: expect.stringContaining('not initialized') },
    });
  });
});

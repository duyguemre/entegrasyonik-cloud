/**
 * CHARACTERIZATION: ProductService.copyTempImages / updateTempImageDocuments
 * (backend/src/api/rpc/handlers/product-service.ts)
 *
 * [ADR-0013 B3, 2026-09-27] BACKLOG.md ("R2 isimlendirme incelemesi", 2026-09-27) bulgusu: bu iki metot
 * taslak (tempId) -> kalıcı ürün görseli kopyalama/URL yazımını YANLIŞ kuruyordu:
 *  - `copyTempImages` clientId'yi hiç eklemiyordu VE kaynak/hedef dizinleri TERS kurmuştu (kaynak olarak
 *    "products/<yeniÜrünId>" -- hiç var olmamış bir yol -- hedef olarak sabit "products/temp/" kullanıyordu).
 *    Gerçek yükleme yeri (`ImageService.addImages`) HER ZAMAN `products/<clientId>/<tempId>/…` idi; bu yüzden
 *    kopyalama sessizce (S3Manager.copy hatasını yutar) hiçbir zaman gerçek bir nesneyi eşlemiyordu.
 *  - `updateTempImageDocuments` üretilen `Image.url` alanına clientId eklemiyordu.
 * Bu dosya ÖNCEKİ testi (yalnızca DB katmanı sahte; gerçek R2/ağ YOK, `storageService.copyFile` mock'lanır)
 * BUGÜNKÜ (düzeltilmiş) davranışı sabitler: kaynak=`products/<clientId>/<tempId>`,
 * hedef=`products/<clientId>/<yeniÜrünId>`; URL=`<BASE_IMAGE_URL><clientId>/<productId>/<imageId>.<ext>`.
 * Bu, `ImageService.addImages`'ın gerçek yükleme yoluyla (`imageFilesPath + clientId + '/' + productId`) birebir
 * tutarlıdır (bkz. image-service.ts:91,144,180).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

import ProductService from '../../../src/api/rpc/handlers/product-service';
import { storageService } from '@services/index';

const CLIENT_ID = 42;
const TEMP_ID = 'temp-abc-123';

function makeService(images: any[]) {
  const svc: any = new (ProductService as any)(CLIENT_ID, {});
  svc.clientDB = {
    getImageModel: () => ({
      find: jest.fn(async () => images),
      bulkWrite: jest.fn(async () => undefined),
    }),
  };
  return svc;
}

// [ADR-0031 BE-CFG-1] Karakterizasyon "env tanımsızken" davranışını kilitler: jest kurulumu R2_PUBLIC_URL_IMAGE'i
// tanımladığı için burada geçici olarak kaldırılır (eski kök = bugünkü URL biçimi, bayt bayt).
const SAVED_R2_PUBLIC = process.env.R2_PUBLIC_URL_IMAGE;
beforeEach(() => {
  delete process.env.R2_PUBLIC_URL_IMAGE;
  jest.spyOn(storageService, 'copyFile').mockResolvedValue({ result: true } as any);
});
afterEach(() => {
  jest.restoreAllMocks();
  if (SAVED_R2_PUBLIC === undefined) delete process.env.R2_PUBLIC_URL_IMAGE; else process.env.R2_PUBLIC_URL_IMAGE = SAVED_R2_PUBLIC;
});

describe('ProductService.copyTempImages (ADR-0013 B3): tenant\'lı, doğru yönlü kaynak/hedef', () => {
  it('kaynak = products/<clientId>/<tempId>, hedef = products/<clientId>/<yeniÜrünId> (görsel + thumbnail)', async () => {
    const newProductId = new ObjectId();
    const tempImageId = new ObjectId();
    const svc = makeService([{ _id: tempImageId, extension: 'jpg', productId: TEMP_ID }]);

    const res = await svc.copyTempImages(newProductId, TEMP_ID);
    expect(res).toBe(true);

    const expectedSource = `products/${CLIENT_ID}/${TEMP_ID}`;
    const expectedDest = `products/${CLIENT_ID}/${newProductId}`;

    expect(storageService.copyFile).toHaveBeenCalledWith(CLIENT_ID, tempImageId, 'jpg', expectedSource, expectedDest);
    expect(storageService.copyFile).toHaveBeenCalledWith(CLIENT_ID, tempImageId + '_t', 'jpg', expectedSource, expectedDest);
    expect(storageService.copyFile).toHaveBeenCalledTimes(2);
  });

  it('birden fazla geçici görsel: her biri aynı kaynak/hedef çiftiyle (yalnızca dosya adı değişir) kopyalanır', async () => {
    const newProductId = new ObjectId();
    const img1 = new ObjectId();
    const img2 = new ObjectId();
    const svc = makeService([
      { _id: img1, extension: 'png', productId: TEMP_ID },
      { _id: img2, extension: 'webp', productId: TEMP_ID },
    ]);

    await svc.copyTempImages(newProductId, TEMP_ID);

    const expectedSource = `products/${CLIENT_ID}/${TEMP_ID}`;
    const expectedDest = `products/${CLIENT_ID}/${newProductId}`;
    expect(storageService.copyFile).toHaveBeenCalledWith(CLIENT_ID, img1, 'png', expectedSource, expectedDest);
    expect(storageService.copyFile).toHaveBeenCalledWith(CLIENT_ID, img2, 'webp', expectedSource, expectedDest);
    expect(storageService.copyFile).toHaveBeenCalledTimes(4);
  });

  it('hiç geçici görsel yoksa storageService.copyFile hiç çağrılmaz, true döner', async () => {
    const svc = makeService([]);
    const res = await svc.copyTempImages(new ObjectId(), TEMP_ID);
    expect(res).toBe(true);
    expect(storageService.copyFile).not.toHaveBeenCalled();
  });
});

describe('ProductService.updateTempImageDocuments (ADR-0013 B3): URL clientId içerir', () => {
  it('Image.url = BASE_IMAGE_URL + clientId/productId/imageId.extension; productId ve isTempImage:false yazılır', async () => {
    const newProductId = new ObjectId();
    const imageId = new ObjectId();
    const svc = makeService([]);
    const model = { find: jest.fn(async () => [{ _id: imageId, extension: 'jpg', productId: TEMP_ID }]), bulkWrite: jest.fn(async (_ops: any[]) => undefined) };
    svc.clientDB.getImageModel = () => model;

    const res = await svc.updateTempImageDocuments(newProductId, TEMP_ID);
    expect(res).toBe(true);
    expect(model.bulkWrite).toHaveBeenCalledTimes(1);
    const ops = model.bulkWrite.mock.calls[0][0] as any[];
    expect(ops).toHaveLength(1);
    const set = ops[0].updateOne.update.$set;
    expect(set.productId).toBe(newProductId);
    expect(set.isTempImage).toBe(false);
    expect(set.url).toBe(`https://images.entegrasyonik.com/products/${CLIENT_ID}/${newProductId}/${imageId}.jpg`);
  });

  it('extension eksikse varsayılan "jpg" kullanılır (mevcut davranış korunur)', async () => {
    const newProductId = new ObjectId();
    const imageId = new ObjectId();
    const model = { find: jest.fn(async () => [{ _id: imageId, productId: TEMP_ID }]), bulkWrite: jest.fn(async (_ops: any[]) => undefined) };
    const svc = makeService([]);
    svc.clientDB.getImageModel = () => model;

    await svc.updateTempImageDocuments(newProductId, TEMP_ID);
    const set = (model.bulkWrite.mock.calls[0][0] as any[])[0].updateOne.update.$set;
    expect(set.url).toBe(`https://images.entegrasyonik.com/products/${CLIENT_ID}/${newProductId}/${imageId}.jpg`);
  });

  it('hiç görsel yoksa bulkWrite çağrılmaz, true döner', async () => {
    const model = { find: jest.fn(async () => []), bulkWrite: jest.fn(async (_ops: any[]) => undefined) };
    const svc = makeService([]);
    svc.clientDB.getImageModel = () => model;

    const res = await svc.updateTempImageDocuments(new ObjectId(), TEMP_ID);
    expect(res).toBe(true);
    expect(model.bulkWrite).not.toHaveBeenCalled();
  });
});

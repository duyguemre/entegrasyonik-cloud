/**
 * CHARACTERIZATION: ImageService (backend/src/api/rpc/handlers/image-service.ts) — ADR-0016 B-R-T3.
 * DB/Redis/ağ YOK; `clientDB`/`applicationDB` sahte model nesneleridir; `ImageOperations.prepareImageQueries`
 * ve `storageService.*` jest ile mock'lanır (sharp/R2'ye hiç dokunulmaz). Kod DEĞİŞTİRİLMEDİ, yalnızca
 * mevcut davranış sabitlenir. (NOT: bu dosya `ProductService.copyTempImages`i test eden
 * `tests/characterization/product/copy-temp-images.characterization.test.ts`'ten AYRIDIR — o dosya farklı
 * bir servisi (ProductService) hedefler.)
 *
 * Tenant izolasyonu: `get/getProduct/getImages/deleteImage/deleteImages/sortImages/addImages/assignImages`
 * tümü `this.clientDB` kullanır (izolasyon clientDB seçimine dayanır — BrandService ile aynı desen).
 * `getIntegrations` İSTİSNADIR: `this.applicationDB.getIntegrationModel()` kullanır — platform-geneli bir
 * kaynak (entegrasyon KATALOĞU, tenant'a özgü değil; kural B2 burada UYGULANMAZ, gerekçe: platform-scoped).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

import ImageService from '@api/rpc/handlers/image-service';
import { storageService } from '@services/index';
import { imageOperations as ImageOperations } from '@operations/catalog/images/image-operations';

let productModel: any;
let variantModel: any;
let imageModel: any;
let integrationModel: any;

function chainableFind(result: any[]) {
  return { sort: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => result) };
}
function chainableFindOne(result: any) {
  return { select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => result) };
}

function makeService(request: any = {}, clientId: any = 42) {
  const svc: any = new (ImageService as any)(clientId, request);
  svc.clientDB = {
    getProductModel: () => productModel,
    getVariantModel: () => variantModel,
    getImageModel: () => imageModel,
  };
  svc.applicationDB = { getIntegrationModel: () => integrationModel };
  return svc;
}

beforeEach(() => {
  productModel = {
    // NOT: ImageService.getProduct() find() sonucunu `.lean()` ÇAĞIRMADAN döner (gerçek mongoose Query
    // thenable'dır ve await edilince dizi/döküman(lar) verir) — bu yüzden mock DOĞRUDAN Promise<array>.
    find: jest.fn(async () => [{ _id: 'p1' }]),
    findOne: jest.fn(() => chainableFindOne({ tempId: 'temp1', maincode: 'MC1', images: [] })),
    findById: jest.fn(() => ({ lean: jest.fn(async () => ({ _id: 'p1', variants: [] })) })),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    findOneAndUpdate: jest.fn(() => ({ lean: jest.fn(async () => ({ images: [{ _id: 'img1' }] })) })),
    bulkWrite: jest.fn(async () => ({ ok: 1 })),
  };
  variantModel = { updateMany: jest.fn(async () => ({ modifiedCount: 1 })) };
  imageModel = { find: jest.fn(() => chainableFind([])) };
  integrationModel = { find: jest.fn(async () => [{ code: 'trendyol' }]) };
});
afterEach(() => { jest.restoreAllMocks(); });

describe('ImageService.get', () => {
  it('[MEVCUT DAVRANIŞ] find({}).sort({order:1}).lean() zinciri; sonuç aynen döner', async () => {
    imageModel.find.mockReturnValue(chainableFind([{ _id: 'i1' }]));
    const res = await makeService().get();
    expect(imageModel.find).toHaveBeenCalledWith({});
    expect(res).toEqual([{ _id: 'i1' }]);
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('boom');
    imageModel.find.mockReturnValue({ sort: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => { throw err; }) });
    await expect(makeService().get()).rejects.toBe(err);
  });
});

describe('ImageService.getIntegrations (platform-geneli, applicationDB)', () => {
  it('[DÜZELTİLDİ, 2026-09-29] find({}, {settings:0}) ÇAĞRILIR — projeksiyon DOĞRU şekilde doğrudan verilir', async () => {
    // BULGU DÜZELTMESİ: eskiden mongoose `find(filter, projection)` ikinci argümanı `{projection:{settings:0}}`
    // ile YANLIŞ SARMALANMIŞTI. Gerçek Mongo'da (mongodb-memory-server ile doğrulandı, bkz.
    // tests/mongo-semantics/integrationProjectionShape.mongoSemantics.test.ts) bu HATA FIRLATMIYORDU, sessizce
    // TÜM alanları (settings dahil) döndürüyordu — B4 gereksiz alan sızıntısı. Şimdi projeksiyon DOĞRUDAN geçiriliyor.
    const res = await makeService().getIntegrations();
    expect(integrationModel.find).toHaveBeenCalledWith({}, { settings: 0 });
    expect(res).toEqual([{ code: 'trendyol' }]);
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('boom');
    integrationModel.find.mockRejectedValue(err);
    await expect(makeService().getIntegrations()).rejects.toBe(err);
  });
});

describe('ImageService.getProduct', () => {
  it('[MEVCUT DAVRANIŞ] _id undefined ise Error("no id") SENKRON fırlatılır (try/catch DIŞINDA), DB\'ye dokunulmaz', async () => {
    const svc = makeService();
    await expect(svc.getProduct(undefined as any)).rejects.toThrow('no id');
    expect(productModel.find).not.toHaveBeenCalled();
  });

  it('[DÜZELTİLDİ, 2026-09-29] geçerli _id: find({_id}, {title:1,_id:0}) çağrılır (aynı sarmalama hatası düzeltildi)', async () => {
    const id = new ObjectId().toString();
    const res = await makeService().getProduct(id);
    expect(productModel.find).toHaveBeenCalledWith({ _id: new ObjectId(id) }, { title: 1, _id: 0 });
    expect(res).toEqual([{ _id: 'p1' }]);
  });

  it('[MEVCUT DAVRANIŞ] geçersiz ObjectId ise try/catch içinde yakalanıp yeniden fırlatılır', async () => {
    await expect(makeService().getProduct('not-a-valid-id')).rejects.toThrow();
  });
});

describe('ImageService.getImages', () => {
  it('[MEVCUT DAVRANIŞ] tempId = ObjectId(request.productId); resp.images `order` alanına göre ARTAN sıralanır (mutasyonla)', async () => {
    const productId = new ObjectId().toString();
    const unsorted = [{ _id: 'i2', order: 2 }, { _id: 'i1', order: 1 }];
    productModel.findOne.mockReturnValue(chainableFindOne({ _id: 'p1', images: unsorted }));
    const res = await makeService({ productId }).getImages();
    expect(productModel.findOne).toHaveBeenCalledWith({ tempId: new ObjectId(productId) });
    expect(res.images.map((i: any) => i._id)).toEqual(['i1', 'i2']);
  });

  it('[MEVCUT DAVRANIŞ] resp null ise (ürün yok) null aynen döner', async () => {
    productModel.findOne.mockReturnValue(chainableFindOne(null));
    const res = await makeService({ productId: new ObjectId().toString() }).getImages();
    expect(res).toBeNull();
  });

  it('[MEVCUT DAVRANIŞ] resp.images yoksa sıralama atlanır, resp aynen döner', async () => {
    productModel.findOne.mockReturnValue(chainableFindOne({ _id: 'p1' }));
    const res = await makeService({ productId: new ObjectId().toString() }).getImages();
    expect(res).toEqual({ _id: 'p1' });
  });

  it('[MEVCUT DAVRANIŞ] request.productId tanımsızsa ObjectId("undefined") geçersiz olduğundan hata fırlatılır', async () => {
    await expect(makeService({}).getImages()).rejects.toThrow();
  });
});

describe('ImageService.deleteImage', () => {
  const imgId = new ObjectId();

  it('[MEVCUT DAVRANIŞ] imageId/tempProductId eksikse Error senkron fırlatılır (try/catch DIŞINDA), DB\'ye dokunulmaz', async () => {
    for (const req of [{}, { imageId: imgId }, { tempProductId: 't1' }]) {
      const svc = makeService(req);
      await expect(svc.deleteImage()).rejects.toThrow('no imageId or productId for delete');
    }
    expect(productModel.findOne).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] eşleşen ürün yoksa false döner', async () => {
    productModel.findOne.mockReturnValue(chainableFindOne(null));
    const res = await makeService({ imageId: imgId, tempProductId: 't1' }).deleteImage();
    expect(res).toBe(false);
  });

  it('[MEVCUT DAVRANIŞ] eşleşen görsel (transferFromPlatformId YOK): storageService.deleteFile 2 kez (asıl+thumbnail) çağrılır; variant images de pull edilir; true döner', async () => {
    const product = { tempId: 'temp1', maincode: 'MC1', images: [{ _id: imgId, url: 'u1', extension: 'jpg' }] };
    productModel.findOne.mockReturnValue(chainableFindOne(product));
    const delFile = jest.spyOn(storageService, 'deleteFile').mockResolvedValue(undefined as any);
    const res = await makeService({ imageId: imgId, tempProductId: 't1' }, 42).deleteImage();

    expect(productModel.updateOne).toHaveBeenCalledWith({ tempId: 'temp1' }, { $pull: { images: { _id: imgId } } });
    expect(delFile).toHaveBeenCalledTimes(2);
    expect(delFile).toHaveBeenCalledWith(42, 'image', imgId, ImageOperations.imageFilesPath + '42/temp1', 'jpg');
    expect(delFile).toHaveBeenCalledWith(42, 'image', imgId + '_t', ImageOperations.imageFilesPath + '42/temp1', 'jpg');
    expect(variantModel.updateMany).toHaveBeenCalledWith({ maincode: 'MC1' }, { $pull: { images: 'u1' } });
    expect(res).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ] transferFromPlatformId DOLU ise storageService.deleteFile HİÇ çağrılmaz (yine de true döner)', async () => {
    const product = { tempId: 'temp1', maincode: 'MC1', images: [{ _id: imgId, url: 'u1', extension: 'jpg', transferFromPlatformId: 'trendyol:1' }] };
    productModel.findOne.mockReturnValue(chainableFindOne(product));
    const delFile = jest.spyOn(storageService, 'deleteFile').mockResolvedValue(undefined as any);
    const res = await makeService({ imageId: imgId, tempProductId: 't1' }).deleteImage();
    expect(delFile).not.toHaveBeenCalled();
    expect(res).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ/BACKLOG-adayı] request.imageId product.images içinde EŞLEŞMEZSE TypeError fırlatılır (image undefined -> image._id)', async () => {
    // BACKLOG: şüpheli - `updateOne({...}, {$pull:{images:{_id: image._id}}})` çağrısı `image` bulunamadığı
    // durumda korunmasız; 404 gibi anlamlı bir hata yerine ham TypeError sızıyor.
    const product = { tempId: 'temp1', maincode: 'MC1', images: [{ _id: new ObjectId(), url: 'other', extension: 'jpg' }] };
    productModel.findOne.mockReturnValue(chainableFindOne(product));
    await expect(makeService({ imageId: new ObjectId(), tempProductId: 't1' }).deleteImage()).rejects.toThrow(TypeError);
  });

  it('[MEVCUT DAVRANIŞ] updateOne hatası olduğu gibi yeniden fırlatılır', async () => {
    const product = { tempId: 'temp1', maincode: 'MC1', images: [{ _id: imgId, url: 'u1', extension: 'jpg' }] };
    productModel.findOne.mockReturnValue(chainableFindOne(product));
    const err = new Error('write conflict');
    productModel.updateOne.mockRejectedValue(err);
    await expect(makeService({ imageId: imgId, tempProductId: 't1' }).deleteImage()).rejects.toBe(err);
  });
});

describe('ImageService.deleteImages', () => {
  it('[MEVCUT DAVRANIŞ] selectedImages tanımsızsa Error senkron fırlatılır, DB\'ye dokunulmaz', async () => {
    await expect(makeService({}).deleteImages()).rejects.toThrow('no imageIds for delete');
    expect(productModel.findOne).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] eşleşen ürün yoksa false döner', async () => {
    productModel.findOne.mockReturnValue(chainableFindOne(null));
    const res = await makeService({ selectedImages: ['x'], tempProductId: 't1' }).deleteImages();
    expect(res).toBe(false);
  });

  it('[MEVCUT DAVRANIŞ] eşleşen görseller: imageIds/imageUrls toplanır, product + variant pull edilir; storageService.deleteFolder HER selectedImage için çağrılır (transferFromPlatformId kontrolü ETKİSİZ — bkz. BACKLOG)', async () => {
    // BACKLOG: şüpheli - `!selectedImage.transferFromPlatformId` burada `selectedImage`, request'ten gelen
    // HAM id (örn. string) — eşleşen görsel NESNESİ değil. String'in `transferFromPlatformId` alanı hiç
    // olmadığından bu kontrol HER ZAMAN true'dur -> deleteFolder her zaman çağrılır. `deleteImage` (tekil)
    // metodu aynı kontrolü DOĞRU şekilde (eşleşen `image` nesnesi üzerinde) yapıyor — kardeş metotta doğru
    // yapılan desenin burada eksik/yanlış uygulanması.
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    const product = { tempId: 'temp1', maincode: 'MC1', images: [{ _id: id1, url: 'u1', transferFromPlatformId: 'trendyol:1' }, { _id: id2, url: 'u2' }] };
    productModel.findOne.mockReturnValue(chainableFindOne(product));
    const delFolder = jest.spyOn(storageService, 'deleteFolder').mockResolvedValue(undefined as any);

    const res = await makeService({ selectedImages: [id1, id2], tempProductId: 't1' }, 42).deleteImages();

    expect(productModel.updateOne).toHaveBeenCalledWith({ tempId: 'temp1' }, { $pull: { images: { _id: { $in: [id1, id2] } } } });
    expect(variantModel.updateMany).toHaveBeenCalledWith({ maincode: 'MC1' }, { $pull: { images: { $in: ['u1', 'u2'] } } });
    expect(delFolder).toHaveBeenCalledTimes(2); // ikisi de çağrıldı; ilkinin transferFromPlatformId'si YOK SAYILDI
    expect(res).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ/BACKLOG-adayı] selectedImages içinde eşleşmeyen bir id varsa TypeError fırlatılır (image undefined -> image._id)', async () => {
    const product = { tempId: 'temp1', maincode: 'MC1', images: [{ _id: new ObjectId(), url: 'u1' }] };
    productModel.findOne.mockReturnValue(chainableFindOne(product));
    await expect(makeService({ selectedImages: [new ObjectId()], tempProductId: 't1' }).deleteImages()).rejects.toThrow(TypeError);
  });

  it('[MEVCUT DAVRANIŞ] updateOne hatası olduğu gibi yeniden fırlatılır', async () => {
    const id1 = new ObjectId();
    const product = { tempId: 'temp1', maincode: 'MC1', images: [{ _id: id1, url: 'u1' }] };
    productModel.findOne.mockReturnValue(chainableFindOne(product));
    const err = new Error('boom');
    productModel.updateOne.mockRejectedValue(err);
    await expect(makeService({ selectedImages: [id1], tempProductId: 't1' }).deleteImages()).rejects.toBe(err);
  });
});

describe('ImageService.sortImages', () => {
  it('[MEVCUT DAVRANIŞ] sortedImageIds sırasına göre order 0\'DAN başlayarak artan bulkWrite dizisi kurulur (MenuService.sortFavorites 1\'den başlar — tutarsız ama zararsız)', async () => {
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    await makeService({ sortedImageIds: [id1, id2], tempProductId: 't1' }).sortImages();
    expect(productModel.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { tempId: 't1', 'images._id': id1 }, update: { $set: { 'images.$.order': 0 } } } },
      { updateOne: { filter: { tempId: 't1', 'images._id': id2 }, update: { $set: { 'images.$.order': 1 } } } },
    ]);
  });

  it('[MEVCUT DAVRANIŞ] her zaman true döner (bulkWrite sonucu YOK SAYILIR)', async () => {
    const res = await makeService({ sortedImageIds: [], tempProductId: 't1' }).sortImages();
    expect(res).toBe(true);
    expect(productModel.bulkWrite).toHaveBeenCalledWith([]);
  });

  it('[MEVCUT DAVRANIŞ] sortedImageIds tanımsızsa try/catch İÇİNDE yakalanıp yeniden fırlatılır', async () => {
    await expect(makeService({ tempProductId: 't1' }).sortImages()).rejects.toThrow();
    expect(productModel.bulkWrite).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] bulkWrite hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('bulk failed');
    productModel.bulkWrite.mockRejectedValue(err);
    await expect(makeService({ sortedImageIds: [new ObjectId()], tempProductId: 't1' }).sortImages()).rejects.toBe(err);
  });
});

describe('ImageService.addImages', () => {
  const files = [{ originalname: 'a.jpg', buffer: Buffer.from('x'), mimetype: 'image/jpeg' }];
  const imgId = new ObjectId();

  function stubPrepareImageQueries(imageUploadOverrides: any = {}) {
    jest.spyOn(ImageOperations, 'prepareImageQueries').mockResolvedValue({
      imageDocuments: [{ _id: imgId, originalname: 'a.jpg', extension: 'jpg' }],
      imageUploads: [{ originalname: 'a.jpg', image: { fileName: 'NA', ...imageUploadOverrides.image }, thumbnail: { fileName: 'NA' } }],
    } as any);
  }

  it('[MEVCUT DAVRANIŞ] mutlu yol: prepareImageQueries(directory, files) çağrılır; eşleşen görseller için uploadImage(image)+uploadImage(thumbnail) çağrılır; resp.images döner', async () => {
    stubPrepareImageQueries();
    const upload = jest.spyOn(storageService, 'uploadImage').mockResolvedValue({ result: true } as any);
    productModel.findOneAndUpdate.mockReturnValue({ lean: jest.fn(async () => ({ images: [{ _id: imgId }] })) });

    const res = await makeService({ uploadImageForm: { tempProductId: 'p1' }, files }, 42).addImages();

    expect(ImageOperations.prepareImageQueries).toHaveBeenCalledWith('42/p1', files);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(res).toEqual([{ _id: imgId }]);
  });

  it('[MEVCUT DAVRANIŞ/BACKLOG-adayı] findOneAndUpdate (DB yazma) hata verirse İÇ try/catch YUTAR (console.error), rethrow OLMAZ; resp undefined -> false döner', async () => {
    // BACKLOG: şüpheli - iç içe try/catch, DB yazma hatasını SESSİZCE yutuyor (yalnızca console.error);
    // çağıran taraf (API katmanı) bir hata mı yoksa "kayıt yok" mu olduğunu ayırt edemez, ikisi de `false`.
    stubPrepareImageQueries();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    productModel.findOneAndUpdate.mockImplementation(() => { throw new Error('write failed'); });
    const res = await makeService({ uploadImageForm: { tempProductId: 'p1' }, files }).addImages();
    expect(res).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] prepareImageQueries hatası DIŞ catch tarafından yeniden fırlatılır (yutulmaz — #2\'deki DB hatasından FARKLI)', async () => {
    const err = new Error('sharp boom');
    jest.spyOn(ImageOperations, 'prepareImageQueries').mockRejectedValue(err);
    await expect(makeService({ uploadImageForm: { tempProductId: 'p1' }, files }).addImages()).rejects.toBe(err);
  });

  it('[MEVCUT DAVRANIŞ] storageService.uploadImage bir görsel için reddedilse bile per-item catch yutar (console.log), Promise.all reddetmez, resp.images YİNE döner', async () => {
    stubPrepareImageQueries();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(storageService, 'uploadImage').mockRejectedValue(new Error('R2 down'));
    productModel.findOneAndUpdate.mockReturnValue({ lean: jest.fn(async () => ({ images: [{ _id: imgId }] })) });

    const res = await makeService({ uploadImageForm: { tempProductId: 'p1' }, files }).addImages();
    expect(res).toEqual([{ _id: imgId }]);
    expect(console.log).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] originalname eşleşmezse (insertedDoc bulunamaz) uploadImage o kayıt için HİÇ çağrılmaz', async () => {
    jest.spyOn(ImageOperations, 'prepareImageQueries').mockResolvedValue({
      imageDocuments: [{ _id: imgId, originalname: 'FARKLI.jpg', extension: 'jpg' }],
      imageUploads: [{ originalname: 'a.jpg', image: { fileName: 'NA' }, thumbnail: { fileName: 'NA' } }],
    } as any);
    const upload = jest.spyOn(storageService, 'uploadImage').mockResolvedValue({ result: true } as any);
    productModel.findOneAndUpdate.mockReturnValue({ lean: jest.fn(async () => ({ images: [{ _id: imgId }] })) });

    await makeService({ uploadImageForm: { tempProductId: 'p1' }, files }).addImages();
    expect(upload).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] request.uploadImageForm tanımsızsa senkron TypeError DIŞ catch tarafından yakalanıp yeniden fırlatılır', async () => {
    await expect(makeService({ files }).addImages()).rejects.toThrow(TypeError);
  });
});

describe('ImageService.assignImages', () => {
  it('[MEVCUT DAVRANIŞ] eşleşen choice\'lı variant\'a selectedImages BENZERSİZ şekilde eklenir (includes ile dedupe); updateOne ile kaydedilir', async () => {
    const productId = new ObjectId().toString();
    const variant = { _id: 'v1', choices: [{ choiceId: 'c1', choiceValueId: 'cv1' }], images: ['existing.jpg'] };
    productModel.findById.mockReturnValue({ lean: jest.fn(async () => ({ _id: productId, variants: [variant] })) });

    const res = await makeService({ productId, selectedChoice: { choiceId: 'c1', choiceValueId: 'cv1' }, selectedImages: ['existing.jpg', 'new.jpg'] }).assignImages();

    const [query, update] = productModel.updateOne.mock.calls[0];
    expect(query).toEqual({ _id: productId });
    expect(update.$set.variants[0].images).toEqual(['existing.jpg', 'new.jpg']); // dedupe: existing tekrar eklenmedi
    expect(res).toEqual({ modifiedCount: 1 });
  });

  it('[MEVCUT DAVRANIŞ] eşleşen choice yoksa variant.images HİÇ oluşturulmaz/değiştirilmez', async () => {
    const productId = new ObjectId().toString();
    const variant = { _id: 'v1', choices: [{ choiceId: 'other', choiceValueId: 'x' }] };
    productModel.findById.mockReturnValue({ lean: jest.fn(async () => ({ _id: productId, variants: [variant] })) });

    await makeService({ productId, selectedChoice: { choiceId: 'c1', choiceValueId: 'cv1' }, selectedImages: ['a.jpg'] }).assignImages();
    const [, update] = productModel.updateOne.mock.calls[0];
    expect(update.$set.variants[0].images).toBeUndefined();
  });

  it('[MEVCUT DAVRANIŞ] ürün bulunamazsa (findById null) TypeError fırlatılır (product.variants)', async () => {
    productModel.findById.mockReturnValue({ lean: jest.fn(async () => null) });
    await expect(makeService({ productId: new ObjectId().toString(), selectedChoice: {}, selectedImages: [] }).assignImages()).rejects.toThrow(TypeError);
  });

  it('[MEVCUT DAVRANIŞ] updateOne hatası olduğu gibi yeniden fırlatılır', async () => {
    const productId = new ObjectId().toString();
    productModel.findById.mockReturnValue({ lean: jest.fn(async () => ({ _id: productId, variants: [] })) });
    const err = new Error('write conflict');
    productModel.updateOne.mockRejectedValue(err);
    await expect(makeService({ productId, selectedChoice: {}, selectedImages: [] }).assignImages()).rejects.toBe(err);
  });
});

describe('ImageService: tenant izolasyonu (get, iki farklı tenant)', () => {
  it('her tenant yalnızca KENDİ clientDB\'sindeki görselleri görür; sorgularda clientId hiç yer almaz', async () => {
    const tenantAImages = [{ _id: 'a1', url: 'a.jpg' }];
    const tenantBImages = [{ _id: 'b1', url: 'b.jpg' }];

    const svcA: any = new (ImageService as any)(4, {});
    svcA.clientDB = { getImageModel: () => ({ find: jest.fn(() => chainableFind(tenantAImages)) }) };

    const svcB: any = new (ImageService as any)(7, {});
    svcB.clientDB = { getImageModel: () => ({ find: jest.fn(() => chainableFind(tenantBImages)) }) };

    const resA = await svcA.get();
    const resB = await svcB.get();

    expect(resA).toEqual(tenantAImages);
    expect(resB).toEqual(tenantBImages);
    expect(JSON.stringify(resA)).not.toMatch(/b\.jpg/);
    expect(JSON.stringify(resB)).not.toMatch(/a\.jpg/);
  });
});

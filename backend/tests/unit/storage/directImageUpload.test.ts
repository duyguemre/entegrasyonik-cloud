/**
 * ADR-0027 §C: doğrudan (imzalı PUT) görsel yükleme — StorageService bileti + ImageService onay/silme akışı.
 * Ağ/DB/R2 YOK: `@aws-sdk/client-s3` S3Client'ı sahte `send` ile değiştirilir; `clientDB` sahte modeldir; sharp
 * (`ImageOperations.getMetadata`) jest ile mock'lanır.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const sent: any[] = [];
let sendImpl: (cmd: any) => Promise<any> = async () => ({});
jest.mock('@aws-sdk/client-s3', () => {
  const mk = (name: string) => class { public readonly __name = name; constructor(public input: any) {} };
  return {
    S3Client: class { send(cmd: any) { sent.push(cmd); return sendImpl(cmd); } },
    PutObjectCommand: mk('Put'), DeleteObjectCommand: mk('Delete'), CopyObjectCommand: mk('Copy'),
    ListObjectsV2Command: mk('List'), GetObjectCommand: mk('Get'),
  };
});

import ImageService from '@api/rpc/handlers/image-service';
import { storageService } from '@services/index';
import { imageOperations as ImageOperations } from '@operations/catalog/images/image-operations';

const CFG = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'example-not-a-secret', bucketName: 'img-bucket', endpoint: 'https://acct.r2.cloudflarestorage.com', region: 'auto' };
const UPLOAD_ID = '0123456789abcdef0123456789abcdef';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 7)]);
const ENV_KEYS = ['R2_PUBLIC_URL_IMAGE', 'IMAGE_UPLOAD_MAX_BYTES', 'IMAGE_TRANSFORMATIONS_ENABLED'] as const;
const savedEnv: Record<string, string | undefined> = {};

function bodyOf(buf: Buffer) {
  return { Body: (async function* () { yield buf; })(), ContentLength: buf.length };
}

let productModel: any;
function makeService(request: any, clientId: any = 42) {
  const svc: any = new (ImageService as any)(clientId, request);
  svc.clientDB = { getProductModel: () => productModel, getVariantModel: () => ({ updateMany: jest.fn(async () => ({})) }) };
  return svc;
}
const findOneReturning = (doc: any) => jest.fn(() => ({ select: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => doc) }));

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.R2_PUBLIC_URL_IMAGE = 'https://cdn.example.test';
  delete process.env.IMAGE_UPLOAD_MAX_BYTES;
  delete process.env.IMAGE_TRANSFORMATIONS_ENABLED;
  sent.length = 0;
  sendImpl = async () => ({});
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  storageService.initialize({ getStorageConfig: jest.fn(async () => CFG) } as any);
  jest.spyOn(ImageOperations, 'getMetadata').mockImplementation(async () => ({ width: 1200, height: 1800 }));
  productModel = { findOne: findOneReturning({ _id: 'p', images: [] }), updateOne: jest.fn(async () => ({ modifiedCount: 1 })) };
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  jest.restoreAllMocks();
});

describe('ImageService.createUploadUrl (imzalı PUT bileti)', () => {
  it('R2\'ye istek ATMADAN tenant önekli geçici anahtara imzalı PUT URL üretir; content-type/length imzada', async () => {
    const res = await makeService({ tempProductId: 'tmp1', contentType: 'image/png', size: 2048 }).createUploadUrl();
    expect(sent).toHaveLength(0);
    expect(res.method).toBe('PUT');
    expect(res.uploadId).toMatch(/^[a-f0-9]{32}$/);
    const u = new URL(res.url);
    expect(u.origin).toBe('https://acct.r2.cloudflarestorage.com');
    expect(u.pathname).toBe(`/img-bucket/uploads/42/${res.uploadId}`);
    expect(u.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(res.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(res.maxBytes).toBe(10485760);
    expect(JSON.stringify(res)).not.toContain(CFG.secretAccessKey);
  });

  it('ortam tavanını aşan boyut 413, izinli olmayan tür 415', async () => {
    process.env.IMAGE_UPLOAD_MAX_BYTES = '1000';
    await expect(makeService({ tempProductId: 't', contentType: 'image/png', size: 1001 }).createUploadUrl()).rejects.toMatchObject({ statusCode: 413, code: 'IMAGE_TOO_LARGE' });
    await expect(makeService({ tempProductId: 't', contentType: 'image/gif', size: 10 }).createUploadUrl()).rejects.toMatchObject({ statusCode: 415 });
  });
});

describe('ImageService.confirmUpload (onay: doğrula → içerik-adresli kalıcı anahtar → DB)', () => {
  it('geçici nesne yoksa 404 UPLOAD_NOT_FOUND (DB\'ye dokunulmaz)', async () => {
    sendImpl = async () => { const e: any = new Error('nf'); e.name = 'NoSuchKey'; throw e; };
    await expect(makeService({ tempProductId: 't', uploadId: UPLOAD_ID }).confirmUpload()).rejects.toMatchObject({ statusCode: 404, code: 'UPLOAD_NOT_FOUND' });
    expect(productModel.updateOne).not.toHaveBeenCalled();
  });

  it('başarılı onay: sha256 sunucuda hesaplanır, kalıcı PUT immutable Cache-Control ile, geçici silinir, görsel push edilir', async () => {
    sendImpl = async (cmd: any) => (cmd.__name === 'Get' ? bodyOf(JPEG) : {});
    const res = await makeService({ tempProductId: 'tmp1', uploadId: UPLOAD_ID, originalname: 'kapak.jpg' }).confirmUpload();

    const put = sent.find((c) => c.__name === 'Put');
    expect(put.input.Key).toMatch(/^products\/42\/tmp1\/[a-f0-9]{32}\.jpg$/);
    expect(put.input.CacheControl).toBe('public, max-age=31536000, immutable');
    expect(put.input.ContentType).toBe('image/jpeg');
    const del = sent.find((c) => c.__name === 'Delete');
    expect(del.input.Key).toBe(`uploads/42/${UPLOAD_ID}`);

    expect(res.deduped).toBe(false);
    expect(res.image).toMatchObject({ key: put.input.Key, url: `https://cdn.example.test/${put.input.Key}`, contentType: 'image/jpeg', width: 1200, height: 1800, size: JPEG.length, extension: 'jpg', originalname: 'kapak.jpg', order: 0 });
    expect(res.image.thumbUrl).toBe(res.image.url); // dönüşüm kapalı → orijinal
    const [filter, update, opts] = productModel.updateOne.mock.calls[0];
    expect(filter).toEqual({ tempId: 'tmp1' });
    expect(update.$push.images.key).toBe(put.input.Key);
    expect(update.$setOnInsert).toMatchObject({ maincode: 'tmp1' });
    expect(opts).toEqual({ upsert: true });
  });

  it('dönüşüm açıkken thumbUrl /cdn-cgi/image/width=300', async () => {
    process.env.IMAGE_TRANSFORMATIONS_ENABLED = 'true';
    sendImpl = async (cmd: any) => (cmd.__name === 'Get' ? bodyOf(JPEG) : {});
    const res = await makeService({ tempProductId: 'tmp1', uploadId: UPLOAD_ID }).confirmUpload();
    expect(res.image.thumbUrl).toMatch(/^https:\/\/cdn\.example\.test\/cdn-cgi\/image\/width=300,format=auto\/products\/42\/tmp1\//);
  });

  it('dedupe: aynı içerik aynı üründe varsa yeni nesne YAZILMAZ, mevcut döner', async () => {
    sendImpl = async (cmd: any) => (cmd.__name === 'Get' ? bodyOf(JPEG) : {});
    const first = await makeService({ tempProductId: 'tmp1', uploadId: UPLOAD_ID }).confirmUpload();
    sent.length = 0;
    productModel.findOne = findOneReturning({ _id: 'p', images: [first.image] });
    productModel.updateOne.mockClear();
    const again = await makeService({ tempProductId: 'tmp1', uploadId: UPLOAD_ID }).confirmUpload();
    expect(again.deduped).toBe(true);
    expect(again.image.key).toBe(first.image.key);
    expect(sent.some((c) => c.__name === 'Put')).toBe(false);
    expect(productModel.updateOne).not.toHaveBeenCalled();
  });

  it('sahte tür (SVG içerik) 415 + geçici nesne silinir; tavan aşımı 413 + silinir', async () => {
    sendImpl = async (cmd: any) => (cmd.__name === 'Get' ? bodyOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')) : {});
    await expect(makeService({ tempProductId: 't', uploadId: UPLOAD_ID }).confirmUpload()).rejects.toMatchObject({ statusCode: 415 });
    expect(sent.filter((c) => c.__name === 'Delete').map((c) => c.input.Key)).toEqual([`uploads/42/${UPLOAD_ID}`]);

    sent.length = 0;
    process.env.IMAGE_UPLOAD_MAX_BYTES = '10';
    sendImpl = async (cmd: any) => (cmd.__name === 'Get' ? bodyOf(JPEG) : {});
    await expect(makeService({ tempProductId: 't', uploadId: UPLOAD_ID }).confirmUpload()).rejects.toMatchObject({ statusCode: 413 });
    expect(sent.some((c) => c.__name === 'Delete')).toBe(true);
    expect(productModel.updateOne).not.toHaveBeenCalled();
  });

  it('piksel bombası (>50 MP) reddedilir', async () => {
    (ImageOperations.getMetadata as any).mockImplementation(async () => ({ width: 10000, height: 10000 }));
    sendImpl = async (cmd: any) => (cmd.__name === 'Get' ? bodyOf(JPEG) : {});
    await expect(makeService({ tempProductId: 't', uploadId: UPLOAD_ID }).confirmUpload()).rejects.toMatchObject({ statusCode: 415, code: 'IMAGE_INVALID' });
  });
});

describe('silme: doğrudan yüklenen görsel TAM anahtarla, yalnız kendi tenant önekinde', () => {
  it('deleteImage key\'li görselde tek Delete(key) gönderir (eski _id/_t silmesi YOK)', async () => {
    const key = 'products/42/tmp1/' + 'b'.repeat(32) + '.webp';
    productModel.findOne = findOneReturning({ tempId: 'tmp1', maincode: 'M', images: [{ _id: 'i1', key, url: 'u' }] });
    await makeService({ imageId: 'i1', tempProductId: 'tmp1' }).deleteImage();
    expect(sent.map((c) => [c.__name, c.input.Key])).toEqual([['Delete', key]]);
  });

  it('başka tenant önekli anahtar (DB\'de bozuk/enjekte) R2\'de SİLİNMEZ', async () => {
    productModel.findOne = findOneReturning({ tempId: 'tmp1', maincode: 'M', images: [{ _id: 'i1', key: 'products/43/x/y.jpg', url: 'u' }] });
    await makeService({ imageId: 'i1', tempProductId: 'tmp1' }).deleteImage();
    expect(sent).toHaveLength(0);
  });

  it('deleteImages karışık liste: key\'li → Delete(key), eski → deleteFolder(prefix)', async () => {
    const key = 'products/42/tmp1/' + 'c'.repeat(32) + '.png';
    productModel.findOne = findOneReturning({ tempId: 'tmp1', maincode: 'M', images: [{ _id: 'n1', key, url: 'u1' }, { _id: 'o1', url: 'u2' }] });
    sendImpl = async (cmd: any) => (cmd.__name === 'List' ? { Contents: [] } : {});
    await makeService({ tempProductId: 'tmp1', selectedImages: ['n1', 'o1'] }).deleteImages();
    expect(sent.filter((c) => c.__name === 'Delete').map((c) => c.input.Key)).toEqual([key]);
    expect(sent.filter((c) => c.__name === 'List').map((c) => c.input.Prefix)).toEqual(['products/42/tmp1/o1']);
  });
});

describe('getImages + eski URL düzeltmesi', () => {
  it('getImages: key\'li görsele thumbUrl eklenir, eski görsel aynı nesne olarak kalır', async () => {
    const legacy = { _id: 'o', url: 'u', order: 1 };
    productModel.findOne = findOneReturning({ _id: 'p', images: [legacy, { _id: 'n', key: 'products/42/t/' + 'd'.repeat(32) + '.jpg', url: 'x', order: 0 }] });
    const res = await makeService({ productId: '0123456789abcdef01234567' }).getImages();
    expect(res.images[0].thumbUrl).toBe(`https://cdn.example.test/products/42/t/${'d'.repeat(32)}.jpg`);
    expect(res.images[1]).toBe(legacy);
  });

  it('[ADR-0027] eski multipart yolunun URL kökü doğru alan adı (yazım hatası "entegrasrasyonik" düzeltildi)', () => {
    // [ADR-0031] R2_PUBLIC_URL_IMAGE tanımlıyken (bu dosyada cdn.example.test) kök odur; tanımsızken eski kök (config.images).
    expect(ImageOperations.BASE_IMAGE_URL).toBe('https://cdn.example.test/products/');
    delete process.env.R2_PUBLIC_URL_IMAGE;
    expect(ImageOperations.BASE_IMAGE_URL).toBe('https://images.entegrasyonik.com/products/');
    expect(ImageOperations.BASE_CLIENT_URL).toBe('https://images.entegrasyonik.com/clients/');
  });
});

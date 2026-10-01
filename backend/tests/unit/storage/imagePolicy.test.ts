/**
 * ADR-0027 §C: görsel yükleme politikası (SAF) + rpc-input şemaları + purge/anahtar tenant sınırları. Ağ/DB YOK.
 */
import { describe, it, expect } from '@jest/globals';
import {
  IMAGE_CONTENT_TYPES, imageVariantUrl, isTenantProductKey, marketplaceImageUrl, productImageKey, publicImageUrl,
  readImageUploadSettings, sha256Hex, sniffImageType, stagingKey,
} from '../../../src/services/storage/imagePolicy';
import { MEDIA_IMAGE_CONTENT_TYPES, MEDIA_RPC_INPUT } from '../../../src/capabilities/rpc-input/media';
import { CAPABILITY_BY_RPC, RPC_INPUT_BY_RPC } from '../../../src/capabilities';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const AVIF = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif'), Buffer.from([0, 0, 0, 0]), Buffer.from('avifmif1miaf')]);
const AVIF_COMPAT = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmif1'), Buffer.from([0, 0, 0, 0]), Buffer.from('mif1avif')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const GIF = Buffer.from('GIF89a......');
const SHA = 'a'.repeat(64);

describe('sniffImageType (istemcinin bildirdiği türe güvenilmez)', () => {
  it('jpeg/png/webp/avif tanınır', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(WEBP)).toBe('image/webp');
    expect(sniffImageType(AVIF)).toBe('image/avif');
    expect(sniffImageType(AVIF_COMPAT)).toBe('image/avif');
  });
  it('SVG/GIF/HTML/kısa tampon reddedilir', () => {
    expect(sniffImageType(SVG)).toBeUndefined();
    expect(sniffImageType(GIF)).toBeUndefined();
    expect(sniffImageType(Buffer.from('<html>'))).toBeUndefined();
    expect(sniffImageType(Buffer.alloc(3))).toBeUndefined();
  });
});

describe('anahtar üreticileri (tenant öneki, içerik-adresli)', () => {
  it('geçici: uploads/<clientId>/<uploadId>; kalıcı: products/<clientId>/<ref>/<sha[0:32]>.<ext>', () => {
    expect(stagingKey(7, 'f'.repeat(32))).toBe(`uploads/7/${'f'.repeat(32)}`);
    expect(productImageKey('7', 'temp_1', SHA, 'image/webp')).toBe(`products/7/temp_1/${'a'.repeat(32)}.webp`);
    expect(productImageKey(7, 'p', sha256Hex(Buffer.from('x')), 'image/jpeg')).toMatch(/^products\/7\/p\/[a-f0-9]{32}\.jpg$/);
  });
  it('geçersiz girdiler fırlatır (yol enjeksiyonu / sayısal olmayan tenant)', () => {
    expect(() => stagingKey(7, '../x')).toThrow();
    expect(() => stagingKey('7/../8', 'f'.repeat(32))).toThrow();
    expect(() => productImageKey(7, '../8', SHA, 'image/png')).toThrow();
    expect(() => productImageKey(7, 'p', 'nothex', 'image/png')).toThrow();
  });
  it('isTenantProductKey kardeş tenant (1 vs 10) ve başka öneki reddeder', () => {
    expect(isTenantProductKey(1, 'products/1/p/abc.jpg')).toBe(true);
    expect(isTenantProductKey(1, 'products/10/p/abc.jpg')).toBe(false);
    expect(isTenantProductKey(1, 'clients/1/logo.png')).toBe(false);
    expect(isTenantProductKey(1, 'products/1/../2/x.jpg')).toBe(false);
    expect(isTenantProductKey(1, 42 as any)).toBe(false);
  });
});

describe('ayarlar ve URL üreticisi (tek yer)', () => {
  const on = { maxBytes: 1, ttlSec: 1, publicBaseUrl: 'https://cdn.example.test', transformationsEnabled: true };
  const off = { ...on, transformationsEnabled: false };
  it('varsayılanlar ve üst sınırlar', () => {
    expect(readImageUploadSettings({} as any)).toEqual({ maxBytes: 10485760, ttlSec: 300, publicBaseUrl: undefined, transformationsEnabled: false });
    const s = readImageUploadSettings({ IMAGE_UPLOAD_MAX_BYTES: '999999999', IMAGE_UPLOAD_URL_TTL_SEC: '99999', R2_PUBLIC_URL_IMAGE: 'https://cdn.example.test/', IMAGE_TRANSFORMATIONS_ENABLED: 'true' } as any);
    expect(s).toEqual({ maxBytes: 25 * 1024 * 1024, ttlSec: 900, publicBaseUrl: 'https://cdn.example.test', transformationsEnabled: true });
    expect(readImageUploadSettings({ IMAGE_UPLOAD_MAX_BYTES: '-5' } as any).maxBytes).toBe(10485760);
  });
  it('publicImageUrl yalnız https kök kabul eder (pazaryerleri HTTPS ister)', () => {
    expect(publicImageUrl('products/1/p/a.jpg', on)).toBe('https://cdn.example.test/products/1/p/a.jpg');
    expect(() => publicImageUrl('k', { ...on, publicBaseUrl: 'http://cdn.example.test' })).toThrow(/https/);
    expect(() => publicImageUrl('k', { ...on, publicBaseUrl: undefined })).toThrow();
  });
  it('imageVariantUrl: dönüşüm kapalıyken orijinal, açıkken /cdn-cgi/image/...', () => {
    expect(imageVariantUrl('products/1/p/a.jpg', { width: 300 }, off)).toBe('https://cdn.example.test/products/1/p/a.jpg');
    expect(imageVariantUrl('products/1/p/a.jpg', { width: 300 }, on)).toBe('https://cdn.example.test/cdn-cgi/image/width=300,format=auto/products/1/p/a.jpg');
    expect(imageVariantUrl('k', { width: 99999, fit: 'cover', format: 'webp' }, on)).toBe('https://cdn.example.test/cdn-cgi/image/width=4000,fit=cover,format=webp/k');
  });
  it('marketplaceImageUrl: jpeg/png doğrudan; webp/avif dönüşüm açıkken jpeg, kapalıyken needsConversion', () => {
    expect(marketplaceImageUrl('k.jpg', 'image/jpeg', off)).toEqual({ url: 'https://cdn.example.test/k.jpg', needsConversion: false });
    expect(marketplaceImageUrl('k.webp', 'image/webp', on)).toEqual({ url: 'https://cdn.example.test/cdn-cgi/image/format=jpeg/k.webp', needsConversion: false });
    expect(marketplaceImageUrl('k.avif', 'image/avif', off)).toEqual({ url: 'https://cdn.example.test/k.avif', needsConversion: true });
  });
});

describe('rpc-input şemaları (ADR-0023 deseni)', () => {
  it('tür listesi politika ile aynı ve bağlar kayıtlı/şemalı', () => {
    expect([...MEDIA_IMAGE_CONTENT_TYPES]).toEqual([...IMAGE_CONTENT_TYPES]);
    for (const rpc of ['ImageService/createUploadUrl', 'ImageService/confirmUpload']) {
      expect(CAPABILITY_BY_RPC.get(rpc)?.id).toBe('images.upload');
      expect(RPC_INPUT_BY_RPC.has(rpc)).toBe(true);
    }
  });
  const create = MEDIA_RPC_INPUT['ImageService/createUploadUrl']!;
  const confirm = MEDIA_RPC_INPUT['ImageService/confirmUpload']!;
  it('createUploadUrl: izinli tür + tamsayı boyut; bilinmeyen alan / svg / NoSQL nesnesi reddedilir', () => {
    expect(create.safeParse({ tempProductId: 'abc_1', contentType: 'image/png', size: 100 }).success).toBe(true);
    expect(create.safeParse({ tempProductId: 'abc', contentType: 'image/svg+xml', size: 100 }).success).toBe(false);
    expect(create.safeParse({ tempProductId: 'abc', contentType: 'image/png', size: 1.5 }).success).toBe(false);
    expect(create.safeParse({ tempProductId: 'abc', contentType: 'image/png', size: 26 * 1024 * 1024 }).success).toBe(false);
    expect(create.safeParse({ tempProductId: { $ne: 1 }, contentType: 'image/png', size: 1 }).success).toBe(false);
    expect(create.safeParse({ tempProductId: '../x', contentType: 'image/png', size: 1 }).success).toBe(false);
    expect(create.safeParse({ tempProductId: 'a', contentType: 'image/png', size: 1, key: 'products/2/x' }).success).toBe(false);
  });
  it('confirmUpload: 32 hex uploadId zorunlu', () => {
    expect(confirm.safeParse({ tempProductId: 'a', uploadId: 'f'.repeat(32), originalname: 'x.jpg' }).success).toBe(true);
    expect(confirm.safeParse({ tempProductId: 'a', uploadId: 'F'.repeat(32) }).success).toBe(false);
    expect(confirm.safeParse({ tempProductId: 'a', uploadId: 'x' }).success).toBe(false);
  });
});

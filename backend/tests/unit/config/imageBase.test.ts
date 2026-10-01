/**
 * ADR-0031 BE-CFG-1: tek görsel tabanı çözümleyicisi (`config.images`).
 * (a) env tanımsızken URL'ler bugünküyle bayt bayt aynı, (b) R2_PUBLIC_URL_IMAGE (sonda / olsun olmasın) kök olur,
 * uyarı yalnız production/staging + eski kök kullanımında. DB/ağ YOK; ham env enjekte edilir.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { getConfig, resetConfigForTests } from '@config';

afterEach(() => resetConfigForTests());
const env = (o: Record<string, string | undefined> = {}) => o as unknown as NodeJS.ProcessEnv;

describe('config.images', () => {
  it('(a) env tanımsız: eski sabitlerle BİREBİR aynı', () => {
    const c = getConfig(env());
    expect(c.images.productBaseUrl).toBe('https://images.entegrasyonik.com/products/');
    expect(c.images.clientBaseUrl).toBe('https://images.entegrasyonik.com/clients/');
    expect(c.images.publicRoot).toBe('https://images.entegrasyonik.com');
    expect(c.images.usingLegacyRoot).toBe(true);
  });

  it.each(['https://cdn.example.test', 'https://cdn.example.test/', 'https://cdn.example.test//'])('(b) R2_PUBLIC_URL_IMAGE=%s -> <kök>/products/', (root) => {
    const c = getConfig(env({ R2_PUBLIC_URL_IMAGE: root }));
    expect(c.images.productBaseUrl).toBe('https://cdn.example.test/products/');
    expect(c.images.clientBaseUrl).toBe('https://cdn.example.test/clients/');
    expect(c.images.usingLegacyRoot).toBe(false);
  });

  it('IMAGE_FILES_PATH ürün yolunu belirler (sonda / olsun olmasın)', () => {
    expect(getConfig(env({ IMAGE_FILES_PATH: 'p2' })).images.productBaseUrl).toBe('https://images.entegrasyonik.com/p2/');
  });

  it('boş/boşluk R2_PUBLIC_URL_IMAGE eski kökü kullanır', () => {
    expect(getConfig(env({ R2_PUBLIC_URL_IMAGE: '   ' })).images.usingLegacyRoot).toBe(true);
  });

  it('eski kök + production/staging: uyarı; local ya da kök tanımlı: uyarı yok', () => {
    const has = (e: Record<string, string>) => getConfig(env(e)).warnings.some(w => w.includes('R2_PUBLIC_URL_IMAGE'));
    expect(has({ APP_ENV: 'production' })).toBe(true);
    expect(has({ APP_ENV: 'staging' })).toBe(true);
    expect(has({ APP_ENV: 'local' })).toBe(false);
    expect(has({ APP_ENV: 'production', R2_PUBLIC_URL_IMAGE: 'https://cdn.example.test' })).toBe(false);
  });
});

// ADR-0031 yan bulgu: BE görsel URL'i HER ZAMAN clientId içerir (FE ProductImageComponent.vue clientId'siz kuruyor; FE değişmedi).
import { jest } from '@jest/globals';
import { imageOperations as ImageOperations } from '@operations/catalog/images/image-operations';

describe('yan bulgu: BE yazdığı görsel URL biçimi clientId içerir', () => {
  it('prepareImageQueries: <taban>products/<clientId>/<tempId>/<imageId>.<uzantı> (image-service.addImages dizin = clientId/tempId)', async () => {
    jest.spyOn(ImageOperations, 'getThumbnailBuffer').mockResolvedValue(Buffer.from('t'));
    jest.spyOn(ImageOperations, 'getMetadata').mockResolvedValue({ width: 10, height: 10 });
    const { imageDocuments } = await ImageOperations.prepareImageQueries('42/tmp1', [{ buffer: Buffer.from('x'), originalname: 'a.jpg', mimetype: 'image/jpeg', size: 1 }]);
    expect(imageDocuments[0].url).toBe(`${ImageOperations.BASE_IMAGE_URL}42/tmp1/${imageDocuments[0]._id}.jpg`);
    expect(imageDocuments[0].url).toMatch(/\/products\/42\/tmp1\/[0-9a-f]{24}\.jpg$/);
    jest.restoreAllMocks();
  });
});

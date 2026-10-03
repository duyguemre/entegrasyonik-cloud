/**
 * CHARACTERIZATION: ImageOperations (src/services/image/image-operations.ts) — GERÇEK sharp, küçük sentetik görsel.
 * Amaç: sharp sürüm yükseltmesi (BACKLOG C18b) davranışı değiştirmesin. Ağ/R2/DB YOK.
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import sharp from 'sharp';
import { imageOperations } from '../../../src/services/image/image-operations';

const makePng = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
const makeJpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 0, g: 128, b: 255 } } }).jpeg().toBuffer();

afterEach(() => { jest.restoreAllMocks(); });

describe('ImageOperations (gerçek sharp)', () => {
  it('[MEVCUT DAVRANIŞ] getMetadata: format/width/height döner', async () => {
    const md = await imageOperations.getMetadata(await makePng(40, 20));
    expect(md.format).toBe('png');
    expect(md.width).toBe(40);
    expect(md.height).toBe(20);
  });

  it('[MEVCUT DAVRANIŞ] getThumbnailBuffer: genişlik 300\'e ölçeklenir, oran korunur, format korunur', async () => {
    const out = await imageOperations.getThumbnailBuffer(await makeJpeg(600, 300));
    expect(Buffer.isBuffer(out)).toBe(true);
    const md = await sharp(out).metadata();
    expect(md.format).toBe('jpeg');
    expect(md.width).toBe(300);
    expect(md.height).toBe(150);
  });

  it('[MEVCUT DAVRANIŞ] küçük görsel de 300 genişliğe BÜYÜTÜLÜR (withoutEnlargement yok)', async () => {
    const out = await imageOperations.getThumbnailBuffer(await makePng(30, 30));
    const md = await sharp(out).metadata();
    expect(md.width).toBe(300);
    expect(md.height).toBe(300);
  });

  it('[MEVCUT DAVRANIŞ] bozuk girdi: hata YAYILMAZ, {result:false, error} döner', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const t = await imageOperations.getThumbnailBuffer(Buffer.from('bu bir gorsel degil'));
    expect(t.result).toBe(false);
    expect(typeof t.error).toBe('string');
    const m = await imageOperations.getMetadata(Buffer.from('bu bir gorsel degil'));
    expect(m.result).toBe(false);
    expect(typeof m.error).toBe('string');
  });

  it('[MEVCUT DAVRANIŞ] prepareImageQueries: dosya başına doküman (width/height/extension) + orijinal/thumbnail yükleme kaydı', async () => {
    const buffer = await makePng(50, 10);
    const res = await imageOperations.prepareImageQueries('7/abc', [{ buffer, originalname: 'a.png', mimetype: 'image/png', size: buffer.length }]);
    expect(res.imageDocuments).toHaveLength(1);
    expect(res.imageDocuments[0]).toMatchObject({ extension: 'png', width: 50, height: 10, originalname: 'a.png', size: buffer.length });
    expect(res.imageUploads[0].image.directory).toBe('products/7/abc');
    const thumbMd = await sharp(res.imageUploads[0].thumbnail.file.buffer).metadata();
    expect(thumbMd.width).toBe(300);
  });
});

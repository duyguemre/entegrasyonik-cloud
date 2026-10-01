/**
 * CHARACTERIZATION: SettingService (backend/src/api/rpc/handlers/setting-service.ts) — ADR-0016 B-R-T3.
 * DB/Redis/ağ YOK; `clientDB` sahte model, `ImageOperations`/`storageService` jest ile mock'lanır (R2/S3'e
 * hiç dokunulmaz). Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut davranış sabitlenir.
 *
 * Tenant izolasyonu: tüm metotlar `this.clientDB` (tenant başına ayrı Mongo DB) kullanır; sorgularda hiçbir
 * clientId/tenant alanı yoktur — izolasyon tamamen `this.clientDB` seçimine dayanır (BrandService/MenuService
 * characterization'larında sabitlenen aynı mimari desen).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

import SettingService from '@api/rpc/handlers/setting-service';
import { storageService } from '@services/index';
import { imageOperations as ImageOperations } from '@operations/catalog/images/image-operations';

let settingModel: any;

function makeService(request: any = {}, clientId: any = 42) {
  const svc: any = new SettingService(clientId, request);
  svc.clientDB = { getSettingModel: () => settingModel };
  return svc;
}

beforeEach(() => {
  settingModel = {
    findOne: jest.fn(() => ({ lean: jest.fn(async () => ({ docId: 1, logo: 'old-logo.png' })) })),
    findOneAndUpdate: jest.fn(() => ({ lean: jest.fn(async () => ({ docId: 1, logo: 'new-logo.png' })) })),
  };
});
afterEach(() => { jest.restoreAllMocks(); });

describe('SettingService.get (IService no-op)', () => {
  it('[MEVCUT DAVRANIŞ] gövdesi boş: her zaman undefined döner, hiçbir DB çağrısı yapmaz', async () => {
    const svc: any = new SettingService(1, {}); // clientDB kasıtlı kurulmadı
    await expect(svc.get()).resolves.toBeUndefined();
  });
});

describe('SettingService.getSettings', () => {
  it('[MEVCUT DAVRANIŞ] findOne({}).lean() sonucu {settings: res} şeklinde SARMALANIR', async () => {
    const res = await makeService().getSettings();
    expect(settingModel.findOne).toHaveBeenCalledWith({});
    expect(res).toEqual({ settings: { docId: 1, logo: 'old-logo.png' } });
  });

  it('[MEVCUT DAVRANIŞ] sonuç null/undefined ise {} döner (hata fırlatılmaz)', async () => {
    settingModel.findOne.mockReturnValue({ lean: jest.fn(async () => null) });
    const res = await makeService().getSettings();
    expect(res).toEqual({});
  });

  it('[MEVCUT DAVRANIŞ] DB hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('mongo down');
    settingModel.findOne.mockReturnValue({ lean: jest.fn(async () => { throw err; }) });
    await expect(makeService().getSettings()).rejects.toBe(err);
  });
});

describe('SettingService.updateSettings', () => {
  it('[MEVCUT DAVRANIŞ] request.settings NESNESİ MUTE EDİLİR (docId:1 eklenir) ve $set: settings ile upsert edilir', async () => {
    const settings = { theme: 'dark' };
    const res = await makeService({ settings }).updateSettings();
    expect(settings).toEqual({ theme: 'dark', docId: 1 }); // yan etki: girdi nesnesi değiştirildi
    expect(settingModel.findOneAndUpdate).toHaveBeenCalledWith(
      { docId: 1 },
      { $set: { theme: 'dark', docId: 1 } },
      { new: true, upsert: true },
    );
    expect(res).toEqual({ docId: 1, logo: 'new-logo.png' });
  });

  it('[MEVCUT DAVRANIŞ] sonuç null/undefined ise {} döner', async () => {
    settingModel.findOneAndUpdate.mockReturnValue({ lean: jest.fn(async () => null) });
    const res = await makeService({ settings: { a: 1 } }).updateSettings();
    expect(res).toEqual({});
  });

  it('[MEVCUT DAVRANIŞ/BACKLOG-adayı] request.settings TANIMSIZSA senkron TypeError fırlatılır (settings.docId=1 -> "Cannot set properties of undefined")', async () => {
    // BACKLOG: şüpheli - girdi doğrulaması yok; FE her zaman `settings` gönderiyor olabilir ama sözleşme
    // savunmasız (bkz. BrandService/MenuService'teki benzer "doğrulama yok" bulguları).
    await expect(makeService({}).updateSettings()).rejects.toThrow(TypeError);
    expect(settingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] findOneAndUpdate hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('write conflict');
    settingModel.findOneAndUpdate.mockReturnValue({ lean: jest.fn(async () => { throw err; }) });
    await expect(makeService({ settings: { a: 1 } }).updateSettings()).rejects.toBe(err);
  });
});

describe('SettingService.uploadLogo', () => {
  const file = { originalname: 'logo.png', buffer: Buffer.from('x'), mimetype: 'image/png' };

  beforeEach(() => {
    jest.spyOn(ImageOperations, 'prepareIdentityImage').mockResolvedValue({
      url: 'https://images.entegrasyonik.com/clients/42/logo.png',
      imageUpload: { directory: 'clients/42', file, fileExtension: 'png', fileName: 'NA' },
    } as any);
    jest.spyOn(storageService, 'uploadImage').mockResolvedValue({ result: true } as any);
  });

  it('[MEVCUT DAVRANIŞ] request.files[0] kullanılır; prepareIdentityImage(clientId.toString(), file, "logo") çağrılır', async () => {
    const res = await makeService({ files: [file] }, 42).uploadLogo();
    expect(ImageOperations.prepareIdentityImage).toHaveBeenCalledWith('42', file, 'logo');
    expect(storageService.uploadImage).toHaveBeenCalledWith('42', expect.objectContaining({ directory: 'clients/42' }));
    expect(res).toEqual({ result: true, url: 'https://images.entegrasyonik.com/clients/42/logo.png' });
  });

  it('[MEVCUT DAVRANIŞ] settings.logo = url ile $set güncellenir (docId:1 filtresi, upsert)', async () => {
    await makeService({ files: [file] }, 42).uploadLogo();
    expect(settingModel.findOneAndUpdate).toHaveBeenCalledWith(
      { docId: 1 },
      { $set: { logo: 'https://images.entegrasyonik.com/clients/42/logo.png' } },
      { new: true, upsert: true },
    );
  });

  it('[MEVCUT DAVRANIŞ] request.files boşsa (files[0] undefined) prepareIdentityImage undefined dosya ile çağrılır ve reddedilir (rethrow)', async () => {
    (ImageOperations.prepareIdentityImage as any).mockRestore();
    jest.spyOn(ImageOperations, 'prepareIdentityImage').mockImplementation(async () => { throw new Error('Image File buffer is invalid.'); });
    await expect(makeService({ files: [] }).uploadLogo()).rejects.toThrow('Image File buffer is invalid.');
  });

  it('[MEVCUT DAVRANIŞ] storageService.uploadImage hatası olduğu gibi yeniden fırlatılır; DB HİÇ güncellenmez', async () => {
    const err = new Error('R2 down');
    (storageService.uploadImage as any).mockRejectedValue(err);
    await expect(makeService({ files: [file] }).uploadLogo()).rejects.toBe(err);
    expect(settingModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

/**
 * CHARACTERIZATION: IntegrationService import-job IDOR (BACKLOG C4 / QA-FAZ2 kritik-1)
 * Kaynak: backend/src/api/rpc/handlers/integration-service.ts  getImportJobByJobId (~862), archiveImportJobs (~904)
 *
 * DÜZELTME (QA-FAZ2 kritik-1, L-04): getImportJobByJobId ve archiveImportJobs artık `getImportJobs` ile
 * AYNI DESENİ kullanıyor: sorgu/filtre nesnesine `clientId: this.currentClientId` eklendi. Tenant A artık
 * tenant B'nin jobId/_id değerini bilse bile B'nin işini okuyamaz/arşivleyemez (Mongo filtresi eşleşmediği
 * için `findOne`/`updateMany` gerçek DB'de sonuç döndürmez — bu testlerde bu durum `lean`/`updateMany`
 * mock'unun "eşleşme yok" sonucuyla simüle edilir).
 *
 * Bu dosya, düzeltme ÖNCESİ [QA-FAZ2 kritik-1] etiketiyle KASITLI TERS ÇEVRİLDİ:
 * - Filtre-şekli testleri artık filtrenin `clientId` İÇERDİĞİNİ doğruluyor (önceden İÇERMEDİĞİNİ doğruluyordu).
 * - Çapraz-tenant okuma/yazma testleri artık ENGELLENDİĞİNİ doğruluyor (önceden başarılı olduğunu doğruluyordu).
 * Aynı-tenant davranışı (kendi job'unu okuma/arşivleme) REGRESYONDUR — DEĞİŞMEMELİ, bu yüzden ayrı testlerle
 * ayrıca sabitlendi.
 *
 * Mongoose model çağrıları jest.fn ile taklit edilir; çağrılan FİLTRE NESNESİ assert edilir. DB YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/IntegrationEventBus', () => ({
  EVENTS: {},
  integrationEventBus: { emit: jest.fn(), on: jest.fn() },
}));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: {} }));

import IntegrationService from '@api/rpc/handlers/integration-service';

const anyFn = (): any => jest.fn();

const TENANT_A = 1;
const TENANT_B = 2;
const TENANT_A_JOB = { jobId: 'JOB-OF-TENANT-A', clientId: TENANT_A, status: 'COMPLETED' };
const TENANT_B_JOB = { jobId: 'JOB-OF-TENANT-B', clientId: TENANT_B, status: 'COMPLETED' };

let findOne: any;
let lean: any;
let updateMany: any;
let find: any;

function makeService(clientId: number, request: any): any {
  const svc: any = new IntegrationService(clientId, request);
  svc.applicationDB = {
    getImportJobModel: () => ({ findOne, updateMany, find, countDocuments: anyFn().mockResolvedValue(0) }),
  };
  return svc;
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  lean = anyFn().mockResolvedValue(TENANT_A_JOB);
  findOne = anyFn().mockReturnValue({ lean });
  updateMany = anyFn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  // getImportJobs zinciri: find().sort().skip().limit().lean()
  const chain: any = {};
  chain.sort = () => chain; chain.skip = () => chain; chain.limit = () => chain; chain.lean = async () => [];
  find = anyFn().mockReturnValue(chain);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('getImportJobByJobId (IDOR düzeltmesi - QA-FAZ2 kritik-1 / BACKLOG C4)', () => {
  it('[QA-FAZ2 kritik-1] sorgu filtresi { jobId, clientId } - clientId artık MEVCUT', async () => {
    await makeService(TENANT_A, { jobId: 'JOB-OF-TENANT-A' }).getImportJobByJobId();

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith({ jobId: 'JOB-OF-TENANT-A', clientId: TENANT_A });
    expect(Object.keys(findOne.mock.calls[0][0] as object)).toContain('clientId');
  });

  it('[QA-FAZ2 kritik-1] tenant 1 isteği, başka tenant (2) a ait jobId verirse artık bulunamaz (çapraz-tenant okuma ENGELLENDİ)', async () => {
    // Gerçek Mongo'da { jobId, clientId: TENANT_A } filtresi TENANT_B_JOB'a eşleşmez -> null döner.
    lean.mockResolvedValue(null);
    const res = await makeService(TENANT_A, { jobId: TENANT_B_JOB.jobId }).getImportJobByJobId();

    expect(findOne).toHaveBeenCalledWith({ jobId: TENANT_B_JOB.jobId, clientId: TENANT_A });
    expect(res).toEqual({ success: false, message: 'Belirtilen ID ile eşleşen bir işlem bulunamadı.' });
  });

  it('[REGRESYON] kendi tenant\'ının job\'unu okuma DAVRANIŞI DEĞİŞMEDİ: success:true + job verisi döner', async () => {
    const res = await makeService(TENANT_A, { jobId: TENANT_A_JOB.jobId }).getImportJobByJobId();
    expect(findOne).toHaveBeenCalledWith({ jobId: TENANT_A_JOB.jobId, clientId: TENANT_A });
    expect(res).toEqual({ success: true, data: TENANT_A_JOB });
  });

  it('[MEVCUT DAVRANIŞ] jobId yoksa model hiç çağrılmaz, hata mesajı döner', async () => {
    const res = await makeService(TENANT_A, {}).getImportJobByJobId();
    expect(res).toEqual({ success: false, message: 'jobId parametresi eksik.' });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] kayıt bulunamazsa success:false ve mesaj döner', async () => {
    lean.mockResolvedValue(null);
    const res = await makeService(TENANT_A, { jobId: 'X' }).getImportJobByJobId();
    expect(res).toEqual({ success: false, message: 'Belirtilen ID ile eşleşen bir işlem bulunamadı.' });
  });

  it('[MEVCUT DAVRANIŞ] model hatası yakalanır: success:false + error mesajı (fırlatmaz)', async () => {
    findOne.mockImplementation(() => { throw new Error('mongo down'); });
    const res = await makeService(TENANT_A, { jobId: 'X' }).getImportJobByJobId();
    expect(res).toMatchObject({ success: false, error: 'mongo down' });
  });
});

describe('archiveImportJobs (IDOR düzeltmesi - QA-FAZ2 kritik-1 / BACKLOG C4)', () => {
  it('[QA-FAZ2 kritik-1] updateMany filtresi { _id:{$in}, clientId, status:{$in:[COMPLETED,FAILED]} } - clientId artık MEVCUT', async () => {
    await makeService(TENANT_A, { ids: ['id-a-1', 'id-a-2'] }).archiveImportJobs();

    expect(updateMany).toHaveBeenCalledTimes(1);
    const [filter, update] = updateMany.mock.calls[0] as any[];
    expect(filter).toEqual({
      _id: { $in: ['id-a-1', 'id-a-2'] },
      clientId: TENANT_A,
      status: { $in: ['COMPLETED', 'FAILED'] },
    });
    expect(Object.keys(filter)).toContain('clientId');
    expect(update.$set.status).toBe('ARCHIVED');
    expect(update.$set.archivedAt).toBeInstanceOf(Date);
  });

  it('[QA-FAZ2 kritik-1] tenant 1, başka tenantın kayıt ID\'lerini gönderirse artık arşivleyemez (çapraz-tenant yazma ENGELLENDİ)', async () => {
    // Gerçek Mongo'da { _id:{$in}, clientId: TENANT_A, ... } filtresi tenant B'nin kayıtlarına eşleşmez -> matchedCount 0.
    updateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    const res = await makeService(TENANT_A, { ids: ['id-of-tenant-b-1'] }).archiveImportJobs();

    expect((updateMany.mock.calls[0] as any[])[0]).toMatchObject({ clientId: TENANT_A });
    expect(res).toEqual({ success: false, message: 'Arşivlenebilir (tamamlanmış) kayıt bulunamadı.' });
  });

  it('[REGRESYON] kendi tenant\'ının job\'unu arşivleme DAVRANIŞI DEĞİŞMEDİ: success:true + modifiedCount', async () => {
    const res = await makeService(TENANT_A, { ids: ['id-a-1'] }).archiveImportJobs();
    expect((updateMany.mock.calls[0] as any[])[0]).toMatchObject({ clientId: TENANT_A });
    expect(res).toEqual({ success: true, message: '1 kayıt başarıyla arşivlendi.', modifiedCount: 1 });
  });

  it('[MEVCUT DAVRANIŞ] devam eden işler korunur: filtre status yalnızca COMPLETED/FAILED (iş kuralı)', async () => {
    await makeService(TENANT_A, { ids: ['a'] }).archiveImportJobs();
    expect((updateMany.mock.calls[0] as any[])[0].status).toEqual({ $in: ['COMPLETED', 'FAILED'] });
  });

  it('[MEVCUT DAVRANIŞ] boş/dizi olmayan ids reddedilir, model çağrılmaz', async () => {
    for (const ids of [undefined, [], 'abc']) {
      const res = await makeService(TENANT_A, { ids }).archiveImportJobs();
      expect(res).toEqual({ success: false, message: 'Geçerli ID listesi gerekli.' });
    }
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] matchedCount 0 ise success:false', async () => {
    updateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    const res = await makeService(TENANT_A, { ids: ['a'] }).archiveImportJobs();
    expect(res).toEqual({ success: false, message: 'Arşivlenebilir (tamamlanmış) kayıt bulunamadı.' });
  });

  it('[MEVCUT DAVRANIŞ] model hatası yakalanır (fırlatmaz)', async () => {
    updateMany.mockRejectedValue(new Error('boom'));
    const res = await makeService(TENANT_A, { ids: ['a'] }).archiveImportJobs();
    expect(res).toEqual({ success: false, message: 'Arşivleme işlemi sırasında hata oluştu.' });
  });
});

describe('getImportJobs (karşılaştırma: doğru izolasyon örneği - referans desen)', () => {
  it('[MEVCUT DAVRANIŞ] liste sorgusu clientId ve status != ARCHIVED filtresi kullanır (C4 metotları artık bu desenle TUTARLI)', async () => {
    await makeService(TENANT_A, { integrationCode: 'trendyol' }).getImportJobs();
    expect(find).toHaveBeenCalledWith({ clientId: TENANT_A, status: { $ne: 'ARCHIVED' }, integrationCode: 'trendyol' });
  });
});

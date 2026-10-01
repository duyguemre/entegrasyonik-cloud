/**
 * CHARACTERIZATION: ClaimService.approveClaim / rejectClaim / bulkApproveClaim
 * (backend/src/api/rpc/handlers/claim-service.ts)
 *
 * Kapsam: approveClaim (BACKLOG C22 bulgusu, KAPANDI) + rejectClaim/bulkApproveClaim (BACKLOG "4 birikmiş
 * hata düzeltmesi" notundaki AÇIK uç: "claim-service.ts'teki AYNI if(!marketplaceResult) deseni
 * rejectClaim/bulkApproveClaim'de de var" — `IPlatform.rejectClaim`/`approveClaim` HER ZAMAN
 * `IPlatformResponse` ({success:boolean,message?}) döner, ASLA falsy değil; pazaryeri {success:false,...}
 * döndürdüğünde eski `if(!marketplaceResult)` kontrolü truthy obje için HER ZAMAN false olduğundan iade/onay
 * sessizce yerelde başarılı sayılıyordu). DatabaseManager/IntegrationFactory jest.mock; clientDB sahte model.
 * DB/Redis/ağ/pazaryeri YOK; veriler sentetiktir.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import ClaimService from '@api/rpc/handlers/claim-service';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { ClaimInternalStatusEnum } from '@interfaces/claim';

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;

let claimModel: any;
let instance: any;
let getInstance: jest.Mock<any>;

function makeService(request: any, clientId: any = 42) {
  const svc: any = new ClaimService(clientId, request);
  svc.clientDB = { getClaimModel: jest.fn(() => claimModel) };
  return svc;
}

function makeClaim(over: any = {}) {
  return {
    _id: 'c1',
    externalClaimId: 'EXT-C1',
    integrationCode: 'trendyol',
    items: [{ externalItemId: 'I1' }],
    meta: { packageId: 'PKG-1' },
    ...over,
  };
}

beforeEach(() => {
  claimModel = {
    findById: jest.fn(async () => makeClaim()),
    findByIdAndUpdate: jest.fn(async () => ({ _id: 'c1', updated: true })),
    aggregate: jest.fn(async () => [{ totalNumberOfRecords: [{ count: 0 }], claims: [] }]),
  };
  instance = { approveClaim: jest.fn(async () => ({ success: true, message: 'ok' })) };
  getInstance = jest.fn(async () => instance);
  factoryCtor.mockReset();
  factoryCtor.mockImplementation(() => ({ getInstance }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ClaimService.approveClaim', () => {
  it('[MEVCUT DAVRANIŞ] mutlu yol: pazaryeri onaylarsa (success:true) talep APPROVED yapılır + history eklenir', async () => {
    const res = await makeService({ claimId: 'c1' }).approveClaim();

    expect(claimModel.findById).toHaveBeenCalledWith('c1');
    expect(factoryCtor).toHaveBeenCalledWith(42);
    expect(getInstance).toHaveBeenCalledWith('trendyol');
    expect(instance.approveClaim).toHaveBeenCalledWith('EXT-C1', { meta: { packageId: 'PKG-1' }, claimItemIdList: ['I1'] });

    const [id, update, opts] = claimModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('c1');
    expect(opts).toEqual({ new: true });
    expect(update.$set.internalStatus).toBe(ClaimInternalStatusEnum.APPROVED);
    expect(update.$push.history).toMatchObject({ status: ClaimInternalStatusEnum.APPROVED, actionBy: 'USER' });
    expect(res).toEqual({ success: true, message: 'Talep başarıyla onaylandı.', data: { _id: 'c1', updated: true } });
  });

  it.each([[undefined], [null], [false], [0]])(
    '[MEVCUT DAVRANIŞ] pazaryeri %p (falsy) döndürürse "Pazar yeri onay işlemini reddetti." hatası, DB güncellenmez',
    async (val) => {
      instance.approveClaim.mockResolvedValue(val);
      await expect(makeService({ claimId: 'c1' }).approveClaim()).rejects.toThrow('Pazar yeri onay işlemini reddetti.');
      expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
    },
  );

  it('[DÜZELTME 2026-09-29, BACKLOG C22, KASITLI TERS ÇEVRİLDİ] pazaryeri {success:false,...} (truthy OBJE) döndürdüğünde ARTIK hata fırlatılır (pazaryeri mesajıyla) ve talep APPROVED YAPILMAZ -- eskiden `if(!marketplaceResult)` truthy-obje için HER ZAMAN false olduğundan bu sessizce başarı sayılıyordu', async () => {
    instance.approveClaim.mockResolvedValue({ success: false, message: 'Pazaryeri: talep zaten kapalı.' });

    await expect(makeService({ claimId: 'c1' }).approveClaim()).rejects.toThrow('Pazaryeri: talep zaten kapalı.');
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[DÜZELTME 2026-09-29, BACKLOG C22] pazaryeri {success:false} ama message YOKSA jenerik "Pazar yeri onay işlemini reddetti." hatası fırlatılır', async () => {
    instance.approveClaim.mockResolvedValue({ success: false });

    await expect(makeService({ claimId: 'c1' }).approveClaim()).rejects.toThrow('Pazar yeri onay işlemini reddetti.');
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] talep bulunamazsa "Talep bulunamadı." hatası; pazaryeri/DB çağrılmaz', async () => {
    claimModel.findById.mockResolvedValue(null);
    await expect(makeService({ claimId: 'x' }).approveClaim()).rejects.toThrow('Talep bulunamadı.');
    expect(factoryCtor).not.toHaveBeenCalled();
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] entegrasyon approveClaim desteklemiyorsa (instance.approveClaim yok) hata fırlatılır', async () => {
    instance.approveClaim = undefined;
    await expect(makeService({ claimId: 'c1' }).approveClaim()).rejects.toThrow('Bu entegrasyon için approveClaim metodu henüz yazılmadı.');
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] claim.items boşsa claimItemIdList boş dizi ile çağrılır', async () => {
    claimModel.findById.mockResolvedValue(makeClaim({ items: [] }));
    await makeService({ claimId: 'c1' }).approveClaim();
    expect(instance.approveClaim).toHaveBeenCalledWith('EXT-C1', { meta: { packageId: 'PKG-1' }, claimItemIdList: [] });
  });
});

describe('ClaimService.rejectClaim', () => {
  beforeEach(() => {
    instance.rejectClaim = jest.fn(async () => ({ success: true, message: 'ok' }));
  });

  it('[MEVCUT DAVRANIŞ] mutlu yol: pazaryeri kabul ederse (success:true) talep REJECTED yapılır + history eklenir', async () => {
    const res = await makeService({ claimId: 'c1', rejectData: { reason: 'Ürün iade koşullarını sağlamıyor', reasonId: 7 } }).rejectClaim();

    expect(claimModel.findById).toHaveBeenCalledWith('c1');
    expect(factoryCtor).toHaveBeenCalledWith(42);
    expect(getInstance).toHaveBeenCalledWith('trendyol');
    expect(instance.rejectClaim).toHaveBeenCalledWith('EXT-C1', {
      reasonId: '7',
      description: 'Ürün iade koşullarını sağlamıyor',
      claimItemIdList: ['I1'],
      meta: { packageId: 'PKG-1' },
    });

    const [id, update, opts] = claimModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('c1');
    expect(opts).toEqual({ new: true });
    expect(update.$set.internalStatus).toBe(ClaimInternalStatusEnum.REJECTED);
    expect(update.$set['meta.rejectReason']).toBe('Ürün iade koşullarını sağlamıyor');
    expect(update.$push.history).toMatchObject({ status: ClaimInternalStatusEnum.REJECTED, actionBy: 'USER' });
    expect(res).toEqual({ success: true, message: 'Talep pazar yerinde ve sistemde başarıyla reddedildi.', data: { _id: 'c1', updated: true } });
  });

  it.each([[undefined], [null], [false], [0]])(
    '[MEVCUT DAVRANIŞ] pazaryeri %p (falsy) döndürürse "Pazar yeri red işlemini reddetti veya bir sorun oluştu." hatası, DB güncellenmez',
    async (val) => {
      instance.rejectClaim.mockResolvedValue(val);
      await expect(makeService({ claimId: 'c1', rejectData: { reason: 'r', reasonId: 1 } }).rejectClaim()).rejects.toThrow(
        'Pazar yeri red işlemini reddetti veya bir sorun oluştu.',
      );
      expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
    },
  );

  it('[DÜZELTME, BACKLOG "4 birikmiş hata düzeltmesi" AÇIK ucu, KASITLI TERS ÇEVRİLDİ] pazaryeri {success:false,...} (truthy OBJE) döndürdüğünde ARTIK hata fırlatılır (pazaryeri mesajıyla) ve talep REJECTED YAPILMAZ -- eskiden `if(!marketplaceResult)` truthy-obje için HER ZAMAN false olduğundan bu sessizce başarı sayılıyordu', async () => {
    instance.rejectClaim.mockResolvedValue({ success: false, message: 'Pazaryeri: red penceresi kapandı.' });

    await expect(
      makeService({ claimId: 'c1', rejectData: { reason: 'r', reasonId: 1 } }).rejectClaim(),
    ).rejects.toThrow('Pazaryeri: red penceresi kapandı.');
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[DÜZELTME] pazaryeri {success:false} ama message YOKSA jenerik "Pazar yeri red işlemini reddetti veya bir sorun oluştu." hatası fırlatılır', async () => {
    instance.rejectClaim.mockResolvedValue({ success: false });

    await expect(makeService({ claimId: 'c1', rejectData: { reason: 'r', reasonId: 1 } }).rejectClaim()).rejects.toThrow(
      'Pazar yeri red işlemini reddetti veya bir sorun oluştu.',
    );
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] talep bulunamazsa "Talep bulunamadı." hatası; pazaryeri/DB çağrılmaz', async () => {
    claimModel.findById.mockResolvedValue(null);
    await expect(makeService({ claimId: 'x', rejectData: { reason: 'r', reasonId: 1 } }).rejectClaim()).rejects.toThrow('Talep bulunamadı.');
    expect(factoryCtor).not.toHaveBeenCalled();
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] entegrasyon rejectClaim desteklemiyorsa (instance.rejectClaim yok) hata fırlatılır', async () => {
    instance.rejectClaim = undefined;
    await expect(makeService({ claimId: 'c1', rejectData: { reason: 'r', reasonId: 1 } }).rejectClaim()).rejects.toThrow(
      'Bu entegrasyon için rejectClaim metodu henüz yazılmadı.',
    );
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('ClaimService.bulkApproveClaim', () => {
  function makeBulkService(claimIds: string[]) {
    const svc: any = new ClaimService(42, { claimIds });
    svc.clientDB = { getClaimModel: jest.fn(() => claimModel) };
    return svc;
  }

  it('[MEVCUT DAVRANIŞ] tüm talepler pazaryerinde onaylanırsa (success:true) hepsi APPROVED yapılır, successCount doğru', async () => {
    claimModel.findById.mockImplementation(async (id: string) => makeClaim({ _id: id, externalClaimId: `EXT-${id}` }));

    const res = await makeBulkService(['c1', 'c2']).bulkApproveClaim();

    expect(claimModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    expect(res.data.successCount).toBe(2);
    expect(res.data.failedCount).toBe(0);
    expect(res.data.successful).toEqual([
      { claimId: 'c1', externalClaimId: 'EXT-c1' },
      { claimId: 'c2', externalClaimId: 'EXT-c2' },
    ]);
    expect(res).toMatchObject({ success: true });
  });

  it('[MEVCUT DAVRANIŞ] talep bulunamayan claimId "failed" listesine düşer, diğerleri etkilenmez', async () => {
    claimModel.findById.mockImplementation(async (id: string) => (id === 'missing' ? null : makeClaim({ _id: id, externalClaimId: `EXT-${id}` })));

    const res = await makeBulkService(['c1', 'missing']).bulkApproveClaim();

    expect(res.data.successCount).toBe(1);
    expect(res.data.failedCount).toBe(1);
    expect(res.data.failed).toEqual([{ claimId: 'missing', errorMessage: 'missing nolu talep sistemde bulunamadı.' }]);
    expect(res.success).toBe(false);
  });

  it.each([[undefined], [null], [false], [0]])(
    '[MEVCUT DAVRANIŞ] pazaryeri %p (falsy) döndürürse ilgili talep "failed" sayılır, DB o talep için güncellenmez',
    async (val) => {
      claimModel.findById.mockResolvedValue(makeClaim());
      instance.approveClaim.mockResolvedValue(val);

      const res = await makeBulkService(['c1']).bulkApproveClaim();

      expect(res.data.failedCount).toBe(1);
      expect(res.data.failed).toEqual([{ claimId: 'c1', errorMessage: 'Pazar yeri bu onayı kabul etmedi.' }]);
      expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
    },
  );

  it('[DÜZELTME, BACKLOG "4 birikmiş hata düzeltmesi" AÇIK ucu, KASITLI TERS ÇEVRİLDİ] pazaryeri {success:false,...} (truthy OBJE) döndürdüğünde ARTIK "failed" sayılır ve talep APPROVED YAPILMAZ -- eskiden `if(!marketplaceResult)` truthy-obje için HER ZAMAN false olduğundan bu sessizce "successful" sayılıyordu', async () => {
    claimModel.findById.mockResolvedValue(makeClaim());
    instance.approveClaim.mockResolvedValue({ success: false, message: 'Pazaryeri: talep zaten kapalı.' });

    const res = await makeBulkService(['c1']).bulkApproveClaim();

    expect(res.data.failedCount).toBe(1);
    expect(res.data.successCount).toBe(0);
    expect(res.data.failed).toEqual([{ claimId: 'c1', errorMessage: 'Pazaryeri: talep zaten kapalı.' }]);
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[DÜZELTME] pazaryeri {success:false} ama message YOKSA jenerik "Pazar yeri bu onayı kabul etmedi." hatası "failed" listesine yazılır', async () => {
    claimModel.findById.mockResolvedValue(makeClaim());
    instance.approveClaim.mockResolvedValue({ success: false });

    const res = await makeBulkService(['c1']).bulkApproveClaim();

    expect(res.data.failed).toEqual([{ claimId: 'c1', errorMessage: 'Pazar yeri bu onayı kabul etmedi.' }]);
    expect(claimModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] claimIds boş dizi ise hata fırlatılır', async () => {
    await expect(makeBulkService([]).bulkApproveClaim()).rejects.toThrow('Onaylanacak talep seçilmedi.');
  });
});

// ---------------------------------------------------------------------------------------------
describe('ClaimService.getClaims: sort.field', () => {
  const pipelineOf = () => claimModel.aggregate.mock.calls[0][0] as any[];

  it('[MEVCUT DAVRANIŞ] sort yoksa varsayılan {claimedAt:-1}', async () => {
    await makeService({}).getClaims();
    expect(pipelineOf()[1]).toEqual({ $sort: { claimedAt: -1 } });
  });

  it('[DÜZELTME, MM-08, KASITLI TERS ÇEVRİLDİ] sort.field artık İZİN LİSTESİYLE doğrulanır — bilinmeyen alan 400 fırlatır (eskiden $sort\'a doğrudan yazılıyordu)', async () => {
    // OrderService.getOrders'ın ADR-0021/GV-01 ile kapattığı AYNI riski (keyfi alan adı $sort'a yazılabiliyordu) kapatır.
    for (const field of ['$where', 'password', 'billingAddress.phone', { $gt: 1 }]) {
      await expect(makeService({ searchClaimForm: { sort: { field, direction: 'asc' } } }).getClaims()).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('[DÜZELTME, MM-08] izin listesindeki HER alan geçer ve direction doğru uygulanır', async () => {
    for (const field of ['claimedAt', 'externalClaimId', 'externalOrderId', 'integrationCode', 'internalStatus', 'type', 'totalRefundAmount']) {
      claimModel.aggregate.mockClear();
      await makeService({ searchClaimForm: { sort: { field, direction: 'desc' } } }).getClaims();
      expect(pipelineOf()[1]).toEqual({ $sort: { [field]: -1 } });
    }
    claimModel.aggregate.mockClear();
    await makeService({ searchClaimForm: { sort: { field: 'totalRefundAmount', direction: 'asc' } } }).getClaims();
    expect(pipelineOf()[1]).toEqual({ $sort: { totalRefundAmount: 1 } });
  });
});

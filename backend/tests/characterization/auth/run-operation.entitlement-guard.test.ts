/**
 * CHARACTERIZATION + YENİ: backend/src/api/RunOperation.ts — ADR-0008 §3(a) `EntitlementService.checkAccess`
 * guard'ının API katmanına BAYRAK KORUMALI (`ENTITLEMENT_GUARD_ENABLED`, varsayılan `false`) bağlanması.
 *
 * Gerçek `capabilities` kaydı (mock'lanmaz) kullanılır: `MenuService/get` (effect: read, minTier: member),
 * `MenuService/addFavorite` (effect: write, minTier: member), `MenuService/deleteFavorite` (effect: destructive,
 * minTier: member) — üçü de gerçek ADR-0019 kaydında VAR (bkz. capabilities/domains/account.ts), böylece bu test
 * gerçek `CAPABILITY_BY_RPC` çözümlemesini (effect -> erişim boyutu) sınar, sahte bir kayıt İCAT ETMEZ.
 * `EntitlementService.checkAccess` mock'lanır (DB YOK); ADR-0008 durum-makinesi x boyut TAM matrisi zaten
 * `tests/unit/billing/EntitlementService.test.ts`'te kanıtlıdır -- burada yalnızca KABLOLAMA (RunOperation'ın
 * doğru anda doğru argümanlarla çağırıp kararına uyması) sınanır.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const checkAccess: jest.Mock<any> = jest.fn();

class MenuService {
  constructor(public clientId: any, public request: any) {}
  async init() {}
  async get() { return 'get-ok'; }
  async addFavorite() { return 'add-ok'; }
  async deleteFavorite() { return 'delete-ok'; }
}

function loadRun() {
  let run: any;
  jest.isolateModules(() => {
    jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { MenuService } }));
    jest.doMock('@services/billing/EntitlementService', () => ({ EntitlementService: { checkAccess } }));
    run = require('../../../src/api/RunOperation').default;
  });
  return run as (userContext: any, service: string, operation: string, request: any, principal?: any) => Promise<any>;
}

const PR = { sub: 'u1', tid: 1, ga: false, tv: 0, imp: false }; // member kademesi

beforeEach(() => {
  checkAccess.mockReset();
  delete process.env.ENTITLEMENT_GUARD_ENABLED; // varsayılan: bayrak KAPALI
});

afterEach(() => {
  delete process.env.ENTITLEMENT_GUARD_ENABLED;
  jest.restoreAllMocks();
});

describe('[KARAKTERİZASYON] ENTITLEMENT_GUARD_ENABLED tanımsız/false (varsayılan): davranış BİREBİR mevcut gibi', () => {
  it('EntitlementService.checkAccess HİÇ ÇAĞRILMAZ (read); işlem normal çalışır', async () => {
    const run = loadRun();
    const resp = await run({ order: 1 }, 'MenuService', 'get', {}, PR);
    expect(resp).toBe('get-ok');
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('EntitlementService.checkAccess HİÇ ÇAĞRILMAZ (write); işlem normal çalışır', async () => {
    const run = loadRun();
    const resp = await run({ order: 1 }, 'MenuService', 'addFavorite', {}, PR);
    expect(resp).toBe('add-ok');
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('ENTITLEMENT_GUARD_ENABLED=false (açıkça) iken de ÇAĞRILMAZ', async () => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'false';
    const run = loadRun();
    await run({ order: 1 }, 'MenuService', 'addFavorite', {}, PR);
    expect(checkAccess).not.toHaveBeenCalled();
  });
});

describe('[YENİ DAVRANIŞ] ENTITLEMENT_GUARD_ENABLED=true: authorize() sonrası, iş yapılmadan ÖNCE checkAccess çağrılır', () => {
  beforeEach(() => { process.env.ENTITLEMENT_GUARD_ENABLED = 'true'; });

  it('effect:read -> dimension "read" ile çağrılır; allowed:true ise işlem normal çalışır', async () => {
    checkAccess.mockResolvedValue({ allowed: true, status: 'active' });
    const run = loadRun();
    const resp = await run({ order: 7 }, 'MenuService', 'get', {}, PR);
    expect(resp).toBe('get-ok');
    expect(checkAccess).toHaveBeenCalledWith(7, 'read');
  });

  it('effect:write -> dimension "write" ile çağrılır', async () => {
    checkAccess.mockResolvedValue({ allowed: true, status: 'active' });
    const run = loadRun();
    await run({ order: 7 }, 'MenuService', 'addFavorite', {}, PR);
    expect(checkAccess).toHaveBeenCalledWith(7, 'write');
  });

  it('effect:destructive -> dimension "write" İLE eşlenir (ADR-0008 §3: API katmanında yalnızca read/write sütunu var)', async () => {
    checkAccess.mockResolvedValue({ allowed: true, status: 'active' });
    const run = loadRun();
    await run({ order: 7 }, 'MenuService', 'deleteFavorite', {}, PR);
    expect(checkAccess).toHaveBeenCalledWith(7, 'write');
  });

  it('allowed:false ise 403 SUBSCRIPTION_RESTRICTED ile REDDEDİLİR; servis metodu HİÇ ÇAĞRILMAZ (reason mesajı olduğu gibi geçer)', async () => {
    checkAccess.mockResolvedValue({ allowed: false, status: 'suspended', reason: 'Aboneliğiniz askıya alındı; yazma işlemi şu an kullanılamıyor.' });
    const spy = jest.spyOn(MenuService.prototype, 'addFavorite');
    const run = loadRun();
    await expect(run({ order: 7 }, 'MenuService', 'addFavorite', {}, PR)).rejects.toMatchObject({
      statusCode: 403, code: 'SUBSCRIPTION_RESTRICTED', message: 'Aboneliğiniz askıya alındı; yazma işlemi şu an kullanılamıyor.',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reason tanımsızsa güvenli varsayılan mesaj kullanılır', async () => {
    checkAccess.mockResolvedValue({ allowed: false, status: 'expired' });
    const run = loadRun();
    await expect(run({ order: 7 }, 'MenuService', 'addFavorite', {}, PR)).rejects.toMatchObject({
      statusCode: 403, code: 'SUBSCRIPTION_RESTRICTED', message: 'Aboneliğiniz bu işlem için yeterli erişime sahip değil.',
    });
  });

  it.each(['active', 'trialing', 'past_due'])('durum makinesi kablolaması: %s x allowed:true -> geçer', async (status) => {
    checkAccess.mockResolvedValue({ allowed: true, status });
    const run = loadRun();
    await expect(run({ order: 7 }, 'MenuService', 'get', {}, PR)).resolves.toBe('get-ok');
  });

  it.each(['suspended', 'canceled', 'expired', 'no_subscription'])('durum makinesi kablolaması: %s x allowed:false -> reddedilir', async (status) => {
    checkAccess.mockResolvedValue({ allowed: false, status, reason: `${status} reddi` });
    const run = loadRun();
    await expect(run({ order: 7 }, 'MenuService', 'addFavorite', {}, PR)).rejects.toMatchObject({ statusCode: 403, code: 'SUBSCRIPTION_RESTRICTED' });
  });

  it('tenant kimliği sayısal DEĞİLSE (ör. mağaza seçmemiş süper yönetici) guard ATLANIR (fail-open, yeni bir kısıtlama İCAT ETMEZ)', async () => {
    const run = loadRun();
    const resp = await run({}, 'MenuService', 'get', {}, PR);
    expect(resp).toBe('get-ok');
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('RPC bir yetenek kaydına ÇÖZÜLEMİYORSA (capability-drift) guard ATLANIR (fail-open); işlem normal çalışır', async () => {
    let run: any;
    jest.isolateModules(() => {
      jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { FakeService: class { constructor() {} async init() {} async echo() { return 'echo-ok'; } } } }));
      jest.doMock('@services/billing/EntitlementService', () => ({ EntitlementService: { checkAccess } }));
      const policy = require('../../../src/api/operationPolicy');
      Object.assign(policy.OPERATION_POLICY, { FakeService: { echo: 'member' } });
      run = require('../../../src/api/RunOperation').default;
    });
    const resp = await run({ order: 7 }, 'FakeService', 'echo', {}, PR);
    expect(resp).toBe('echo-ok');
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('açık operasyonlar (ör. logout) guard\'a HİÇ takılmaz (isOpenOperation dalı authorize\'dan önce döner)', async () => {
    let run: any;
    jest.isolateModules(() => {
      class SecurityService { constructor() {} async init() {} async logout() { return 'captcha-ok'; } }
      jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { SecurityService } }));
      jest.doMock('@services/billing/EntitlementService', () => ({ EntitlementService: { checkAccess } }));
      run = require('../../../src/api/RunOperation').default;
    });
    const resp = await run(undefined, 'SecurityService', 'logout', {});
    expect(resp).toBe('captcha-ok');
    expect(checkAccess).not.toHaveBeenCalled();
  });

  it('runImageApi da AYNI guard\'dan geçer: "ImageApi" sözde-servis adıyla çözümlenir', async () => {
    checkAccess.mockResolvedValue({ allowed: false, status: 'suspended', reason: 'Aboneliğiniz askıya alındı.' });
    let runImageApi: any;
    jest.isolateModules(() => {
      class ImageService { constructor() {} async init() {} async addImages() { return 'upload-ok'; } }
      jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { ImageService } }));
      jest.doMock('@services/billing/EntitlementService', () => ({ EntitlementService: { checkAccess } }));
      runImageApi = require('../../../src/api/RunOperation').runImageApi;
    });
    // IMAGE_API_TARGETS['upload'] gerçek kayıtta ['ImageService', 'addImages'] (ADR-0001 Karar 9); guard 'ImageApi'
    // sözde-servis adıyla çözer (capability rpc 'ImageApi/upload', effect:write) -- gerçek hedef metot adı ayrıdır.
    await expect(runImageApi('upload', { order: 7 }, {}, PR)).rejects.toMatchObject({ statusCode: 403, code: 'SUBSCRIPTION_RESTRICTED' });
    expect(checkAccess).toHaveBeenCalledWith(7, 'write');
  });
});

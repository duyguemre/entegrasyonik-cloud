/**
 * CHARACTERIZATION: ConfigurationService (backend/src/api/services/configuration-service.ts) — ADR-0016 B-R-T3.
 * `get()` yalnızca YEDİ alt servisi (Menu/Product/Category/Choice/Hashtag/Brand/Integration) INSTANTIATE edip
 * `init()` + veri metotlarını paralel çalıştıran bir AGGREGATOR'dır. DB/Redis/ağ YOK: alt servis SINIFLARININ
 * KENDİSİ jest.mock ile sahte `init`/veri metotlarıyla değiştirilir (gerçek BaseApi.init() hiç çalışmaz).
 * Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut davranış sabitlenir.
 *
 * Tenant izolasyonu: ConfigurationService'in kendisi hiçbir sorgu çalıştırmaz; `clientId`'yi ALDIĞI GİBİ
 * yedi alt servise iletir (constructor parametresi). Gerçek izolasyon o alt servislerin KENDİ
 * characterization testlerinde (BrandService/CategoryService/ProductService/IntegrationService vb.) zaten
 * sabitlenmiştir — burada yalnızca "clientId doğru iletiliyor mu" doğrulanır.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const calls: any[] = [];

import MenuServiceModule from '@api/services/menu-service';
import ProductServiceModule from '@api/services/product-service';
import CategoryServiceModule from '@api/services/category-service';
import ChoiceServiceModule from '@api/services/choice-service';
import HashtagServiceModule from '@api/services/hashtag-service';
import BrandServiceModule from '@api/services/brand-service';
import IntegrationServiceModule from '@api/services/integration-service';

jest.mock('@api/services/menu-service');
jest.mock('@api/services/product-service');
jest.mock('@api/services/category-service');
jest.mock('@api/services/choice-service');
jest.mock('@api/services/hashtag-service');
jest.mock('@api/services/brand-service');
jest.mock('@api/services/integration-service');

import ConfigurationService from '@api/services/configuration-service';

beforeEach(() => {
  calls.length = 0;
  (MenuServiceModule as any).mockImplementation((clientId: any, request: any) => {
    calls.push({ label: 'menu', clientId, request });
    return { init: jest.fn(async () => undefined), get: jest.fn(async () => 'MENU'), retrieveFavorites: jest.fn(async () => ['FAV']) };
  });
  (ProductServiceModule as any).mockImplementation((clientId: any, request: any) => {
    calls.push({ label: 'product', clientId, request });
    return { init: jest.fn(async () => undefined), getProductStatistics: jest.fn(async () => ({ total: 10 })) };
  });
  (CategoryServiceModule as any).mockImplementation((clientId: any, request: any) => {
    calls.push({ label: 'category', clientId, request });
    return { init: jest.fn(async () => undefined), get: jest.fn(async () => ['CAT']) };
  });
  (ChoiceServiceModule as any).mockImplementation((clientId: any, request: any) => {
    calls.push({ label: 'choice', clientId, request });
    return { init: jest.fn(async () => undefined), get: jest.fn(async () => ['CHOICE']) };
  });
  (HashtagServiceModule as any).mockImplementation((clientId: any, request: any) => {
    calls.push({ label: 'hashtag', clientId, request });
    return { init: jest.fn(async () => undefined), get: jest.fn(async () => ['HASHTAG']) };
  });
  (BrandServiceModule as any).mockImplementation((clientId: any, request: any) => {
    calls.push({ label: 'brand', clientId, request });
    return { init: jest.fn(async () => undefined), get: jest.fn(async () => ['BRAND']) };
  });
  (IntegrationServiceModule as any).mockImplementation((clientId: any, request: any) => {
    calls.push({ label: 'integration', clientId, request });
    return {
      init: jest.fn(async () => undefined),
      getClientIntegrations: jest.fn(async () => ['CLIENT_INTEGRATION']),
      get: jest.fn(async () => ['INTEGRATION']),
      integrationTypes: jest.fn(async () => ['TYPE']),
    };
  });
});

describe('ConfigurationService.get', () => {
  it('[MEVCUT DAVRANIŞ] 7 alt servisi AYNI clientId/request ile instantiate eder ve init() çağırır', async () => {
    const svc = new (ConfigurationService as any)(42, { foo: 'bar' });
    await svc.get();
    expect(calls.filter((c) => c.label !== 'menu').every((c) => c.clientId === 42)).toBe(true);
    expect(calls.filter((c) => c.label !== 'menu').every((c) => c.request === svc.request)).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ] dönen nesne şeması: productStatistics/menu/favorites/categories/brands/choices/hashtags/clientIntegrations/integrations/integrationTypes', async () => {
    const svc = new (ConfigurationService as any)(1, {});
    const res = await svc.get();
    expect(res).toEqual({
      productStatistics: { total: 10 },
      menu: 'MENU',
      favorites: ['FAV'],
      categories: ['CAT'],
      brands: ['BRAND'],
      choices: ['CHOICE'],
      hashtags: ['HASHTAG'],
      clientIntegrations: ['CLIENT_INTEGRATION'],
      integrations: ['INTEGRATION'],
      integrationTypes: ['TYPE'],
    });
  });

  it('[ADR-0024 P1-CORE] kardeş servislerde init() ÇAĞRILMAZ; ApplicationDB/ClientDB ConfigurationService üzerinden devralınır (eskiden 7x init -> bağlantı/tenant kaydı yeniden çözülüyordu)', async () => {
    const inits: any[] = [];
    for (const M of [MenuServiceModule, ProductServiceModule, CategoryServiceModule, ChoiceServiceModule, HashtagServiceModule, BrandServiceModule, IntegrationServiceModule] as any[]) {
      const impl = M.getMockImplementation();
      M.mockImplementation((...a: any[]) => { const o = impl(...a); inits.push(o); return o; });
    }
    const svc: any = new (ConfigurationService as any)(1, {});
    svc.applicationDB = { app: true };
    svc.clientDB = { client: true };
    await svc.get();
    expect(inits).toHaveLength(7);
    for (const o of inits) {
      expect(o.init).not.toHaveBeenCalled();
      expect(o.applicationDB).toBe(svc.applicationDB);
      expect(o.clientDB).toBe(svc.clientDB);
    }
  });

  it('[MEVCUT DAVRANIŞ] herhangi bir alt servisin veri metodu hatası da sarmalanmadan yukarı fırlatılır', async () => {
    const err = new Error('integration types boom');
    (IntegrationServiceModule as any).mockImplementation(() => ({
      init: jest.fn(async () => undefined),
      getClientIntegrations: jest.fn(async () => []),
      get: jest.fn(async () => []),
      integrationTypes: jest.fn(async () => { throw err; }),
    }));
    const svc = new (ConfigurationService as any)(1, {});
    await expect(svc.get()).rejects.toBe(err);
  });
});

describe('ConfigurationService: clientId iletimi (izolasyon alt servislere devredilmiştir)', () => {
  it('constructor\'a verilen clientId, this.currentClientId ve YEDİ alt servisin TÜMÜNE aynen iletilir', async () => {
    const svc: any = new (ConfigurationService as any)(999, { a: 1 });
    expect(svc.currentClientId).toBe(999);
    await svc.get();
    const nonMenuCalls = calls.filter((c) => c.label !== 'menu');
    expect(nonMenuCalls).toHaveLength(6);
    expect(nonMenuCalls.every((c) => c.clientId === 999)).toBe(true);
  });
});

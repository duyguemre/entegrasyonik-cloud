/**
 * [K7 2026-09-28] OKUMA yolu: IntegrationFactory adaptör yapılandırmasını kurarken tenant `settings` içindeki URL/host/endpoint
 * benzeri üst düzey anahtarları (DB'deki kalıntılar dahil) adaptöre VERMEZ; platform `Integrations.urls` olduğu gibi geçer.
 * DB/ağ YOK; adaptörler sahte sınıflardır. Tüm değerler sentetiktir.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const clientDb: any = {};
const appDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getClientDB: async () => clientDb, getApplicationDB: async () => appDb },
}));

const built: any[] = [];
const fakeAdapter = () => ({ __esModule: true, default: class { constructor(public config: any) { built.push(config); } } });
jest.mock('../../../src/integration/modules/marketplace/trendyol', () => fakeAdapter());
jest.mock('../../../src/integration/modules/marketplace/pazarama', () => fakeAdapter());
jest.mock('../../../src/integration/modules/marketplace/n11', () => fakeAdapter());
jest.mock('../../../src/integration/modules/marketplace/hepsiburada', () => fakeAdapter());
jest.mock('../../../src/integration/modules/ecommerce/ideasoft', () => fakeAdapter());
jest.mock('../../../src/integration/modules/erp/bizimhesap', () => fakeAdapter());
jest.mock('../../../src/integration/modules/provider/PlatformMappingProvider', () => ({ PlatformMappingProvider: class { } }));

import IntegrationFactory from '../../../src/integration/modules/IntegrationFactory';

const lean = (v: any) => ({ lean: async () => v });
let clientId = 500;
const PLATFORM_URLS = { BASEURL: 'https://mpop.hepsiburada.com', LISTINGBASEURL: 'https://listing-external.hepsiburada.com' };

beforeEach(() => {
  built.length = 0;
  IntegrationFactory.clearCache();
  clientId += 1;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  Object.assign(appDb, { getIntegrationModel: () => ({ find: () => lean([{ code: 'hepsiburada', urls: PLATFORM_URLS }, { code: 'ideasoft', urls: { baseUrl: 'https://<STORENAME>.myideasoft.com' } }]) }) });
});

const useTenant = (doc: any) => Object.assign(clientDb, { getClientIntegrationModel: () => ({ findOne: () => lean(doc) }), getSettingModel: () => ({ findOne: () => lean({}) }) });

describe('IntegrationFactory: tenant URL alanları adaptöre verilmez (K7 okuma yolu)', () => {
  it('[K7 2026-09-28] tenant settings.urls (kalıntı/saldırı) çıkarılır; platform urls DEĞİŞMEDEN gelir; meşru ayarlar korunur', async () => {
    useTenant({ marketplace: [{ code: 'hepsiburada', settings: {
      APIKEY: 'k', SELLERID: 'M', MATCHKEY: 'barcode',
      urls: { BASEURL: 'https://tenant-controlled.example' }, baseUrl: 'https://tenant-controlled.example', tokenUrl: 'https://tenant-controlled.example/t', host: 'tenant-controlled.example',
    } }] });
    await new IntegrationFactory(clientId).getInstance('hepsiburada');
    const cfg = built[0].integrationSettings;
    expect(cfg.urls).toEqual(PLATFORM_URLS);
    expect(cfg.settings).toEqual({ APIKEY: 'k', SELLERID: 'M', MATCHKEY: 'barcode' });
  });

  it('[K7 2026-09-28] ecommerce (Ideasoft): storeName ve auth korunur, URL benzeri alan çıkar', async () => {
    useTenant({ ecommerce: [{ code: 'ideasoft', settings: { storeName: 'magazam', key: 'c', auth: { access_token: 'x', redirectUrl: 'https://app.example.test/cb' }, endpoint: 'https://tenant-controlled.example' } }] });
    await new IntegrationFactory(clientId).getInstance('ideasoft');
    const s = built[0].integrationSettings.settings;
    expect(s.storeName).toBe('magazam');
    expect(s.auth).toEqual({ access_token: 'x', redirectUrl: 'https://app.example.test/cb' }); // iç içe alanlara dokunulmaz
    expect('endpoint' in s).toBe(false);
  });
});

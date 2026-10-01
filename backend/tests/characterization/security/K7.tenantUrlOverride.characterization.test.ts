/**
 * CHARACTERIZATION (Protokol 13) — ADR-0020 K7 / K8: tenant ayarı üzerinden dış istek hedefi (host) kontrolü.
 *
 * Bu dosya önce bugünkü SÖMÜRÜLEBİLİR davranışı sabitledi (commit 5156ad5: HB tenant `settings.urls.BASEURL` ile başka host'a gidiyordu;
 * Ideasoft `storeName` host'a gömülüyordu; yazma yolu URL alanlarını süzmüyordu; `IntegrationService.get` yalnızca `settings.urls`/`token`
 * gizliyordu). Düzeltmeyle senaryolar KASITLI TERS ÇEVRİLDİ (`[K7 2026-09-28]`, `[K8 2026-09-28]`); ters çevrilen her test başlığı
 * "ÖNCEKİ:" ile eski davranışı belirtir.
 * DB/Redis/ağ YOK (axios spy'lı, GERÇEK dış isteğe çıkılmaz); tüm değerler sentetiktir (RFC 2606 `.example` alanları).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import axios from 'axios';

const appDb: any = {};
const clientDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => clientDb },
}));
jest.mock('@utils/decorator/cache', () => ({ nodeCache: { getStats: () => ({}), keys: () => [] } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => ({}) } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/IntegrationEventBus', () => ({ EVENTS: {}, integrationEventBus: { emit: jest.fn(), on: jest.fn() } }));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: {} }));

import HbService from '@integration/modules/marketplace/hepsiburada/services/Service';
import IdeasoftService from '@integration/modules/ecommerce/ideasoft/services/Service';
import { ResilientHttpClient } from '@integration/modules/common/http/ResilientHttpClient';
import IntegrationService from '../../../src/api/rpc/handlers/integration-service';
import { AuditLogger } from '@services/audit/AuditLogger';

const MOCK_ENVS = ['HEPSIBURADA_MOCK_MODE', 'IDEASOFT_MOCK_MODE'];
beforeEach(() => {
  for (const k of MOCK_ENVS) delete process.env[k];
  ResilientHttpClient.resetAllState();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

const hbParams = (tenantSettings: any, platformUrls: any = {}) => ({
  clientId: 7,
  integrationSettings: { code: 'hepsiburada', urls: platformUrls, settings: { APIKEY: 'k', APISECRET: 's', SELLERID: 'M-1', ...tenantSettings } },
});

describe('K7 (1) Hepsiburada: tenant settings.urls ARTIK kullanılmaz (yalnız platform urls)', () => {
  it('[K7 2026-09-28] ÖNCEKİ: tenant settings.urls.BASEURL isteği başka host\'a yönlendirirdi. ŞİMDİ: platform varsayılan/urls host\'u kullanılır', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: {} } as any);
    const svc = new HbService(hbParams({ urls: { BASEURL: 'https://tenant-controlled.example' } }));
    await svc.get('orders/merchantid/M-1');
    const [url, cfg]: any = spy.mock.calls[0];
    expect(new URL(url).hostname).toBe('mpop.hepsiburada.com');
    expect(cfg.auth).toEqual({ username: 'k', password: 's' });
  });

  it('[K7 2026-09-28] platform Integrations.urls (üst düzey) hâlâ geçerli kaynaktır', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: {} } as any);
    const svc = new HbService(hbParams({}, { BASEURL: 'https://mpop.hepsiburada.com', LISTINGBASEURL: 'https://listing-external.hepsiburada.com' }));
    await svc.get('orders/x'); await svc.get('listings/x');
    expect(spy.mock.calls.map((c: any) => new URL(c[0]).hostname)).toEqual(['mpop.hepsiburada.com', 'listing-external.hepsiburada.com']);
  });

  it('[K7 2026-09-28] ÖNCEKİ: listing/settlement/ticket tabanları tenant ile değişirdi. ŞİMDİ: varsayılan platform host\'ları', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: {} } as any);
    const svc = new HbService(hbParams({ urls: { LISTINGBASEURL: 'https://l.example', ACCOUNTINGBASEURL: 'https://a.example', TICKETBASEURL: 'https://t.example' } }));
    await svc.get('listings/x'); await svc.get('settlements/x'); await svc.get('ticket-api/x');
    expect(spy.mock.calls.map((c: any) => new URL(c[0]).hostname)).toEqual(
      ['listing-external.hepsiburada.com', 'accounting-external.hepsiburada.com', 'ticket-api.hepsiburada.com']);
  });

  it('[K7 2026-09-28] savunma derinliği: platform urls\'e (hatayla) yabancı host yazılsa bile istek AĞA ÇIKMAZ (VALIDATION, OUTBOUND_HOST_NOT_ALLOWED)', async () => {
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ status: 200, data: {} } as any);
    const svc = new HbService(hbParams({}, { BASEURL: 'https://evil.example' }));
    await expect(svc.get('orders/x')).rejects.toMatchObject({ name: 'IntegrationError', code: 'VALIDATION', platformCode: 'OUTBOUND_HOST_NOT_ALLOWED' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('K7 (2) Ideasoft: storeName yalnızca tek DNS etiketi', () => {
  it('[K7 2026-09-28] ÖNCEKİ: storeName "evil.example/#" temel URL\'yi evil.example\'a çevirirdi. ŞİMDİ: IntegrationError(VALIDATION)', () => {
    expect(() => new IdeasoftService({ clientId: 7, integrationSettings: { urls: { baseUrl: 'https://<STORENAME>.ideasoft.com.tr' }, settings: { storeName: 'evil.example/#' } } }))
      .toThrow(/storeName geçersiz/);
  });
  it('[K7 2026-09-28] geçerli etiket: mağaza alt alanı host\'a gömülür (davranış değişmedi)', () => {
    const svc: any = new IdeasoftService({ clientId: 7, integrationSettings: { urls: { baseUrl: 'https://<STORENAME>.myideasoft.com' }, settings: { storeName: 'magazam' } } });
    expect(new URL(svc.baseUrl).hostname).toBe('magazam.myideasoft.com');
  });
});

const lean = (v: any): any => { const c: any = { lean: jest.fn(async () => v) }; c.sort = jest.fn(() => c); return c; };

describe('K7 (3) tenant yazma yolu: URL/host/endpoint alanları YOK SAYILIR + denetim kaydı', () => {
  let ciModel: any;
  beforeEach(() => {
    ciModel = {
      findOne: jest.fn((..._a: any[]) => lean({
        marketplace: [{ code: 'hepsiburada', settings: { SELLERID: '1', urls: { BASEURL: 'https://kalinti.example' } } }],
        ecommerce: [{ code: 'ideasoft', settings: { storeName: 'a', urls: { baseUrl: 'https://kalinti.example' }, key: 'k' } }],
      })),
      findOneAndUpdate: jest.fn((..._a: any[]) => {
        const doc = { marketplace: [{ code: 'hepsiburada', settings: {} }], erp: [{ code: 'x', settings: {} }], shipment: [{ code: 'x', settings: {} }], ecommerce: [{ code: 'ideasoft', settings: {} }] };
        return Object.assign(Promise.resolve(doc), { lean: async () => doc });
      }),
    };
    Object.assign(clientDb, { getClientIntegrationModel: () => ciModel });
  });
  const marketplaceSave = async (settings: any) => {
    const s: any = new IntegrationService(4, { clientMarketplace: { code: 'hepsiburada', settings } });
    await s.init(); await s.saveClientMarketplaceSettings();
    return ciModel.findOneAndUpdate.mock.calls[0][1].$set['marketplace.$.settings'];
  };

  it('[K7 2026-09-28] ÖNCEKİ: settings.urls.BASEURL DB\'ye AYNEN yazılırdı. ŞİMDİ: yazılmaz; diğer alanlar korunur', async () => {
    const written = await marketplaceSave({ SELLERID: '1', taxPercentage: 18, urls: { BASEURL: 'https://tenant-controlled.example' } });
    expect(written).toEqual({ SELLERID: '1', taxPercentage: 18 });
  });

  it('[K7 2026-09-28] anahtar deseni: baseUrl/BASEURL/*Url/host/endpoint (büyük-küçük harf, _ ve - duyarsız) hepsi düşer', async () => {
    const written = await marketplaceSave({
      SELLERID: '1', baseUrl: 'a', BASEURL: 'a', tokenUrl: 'a', orderList_url: 'a', 'api-host': 'a', Host: 'a', hostname: 'a', endpoint: 'a', Endpoints: {}, urls: {}, url: 'a', proxy: 'a',
    });
    expect(written).toEqual({ SELLERID: '1' });
  });

  it('[K7 2026-09-28] meşru alanlar düşmez (false-positive koruması: FE\'nin gönderdiği anahtarlar)', async () => {
    const legit = { status: true, taxPercentage: 18, storename: 's', SELLERID: '1', maxPurchaseQuantity: 5, constantProductDesc: 'x', barcodeIntegration: true,
      autoProcessOrders: true, shippingId: 1, shippingaddress: 'a', returnaddress: 'b', cities: ['x'], integrationMethod: 'm', MATCHKEY: 'barcode', firmCode: 'f', invoiceType: 'i' };
    expect(await marketplaceSave(legit)).toEqual(legit);
  });

  it('[K7 2026-09-28] DB\'deki kalıntı `urls` yazımla TEMİZLENİR (mevcut ayar birleştirmesine taşınmaz)', async () => {
    const written = await marketplaceSave({ SELLERID: '2' });
    expect('urls' in written).toBe(false);
  });

  it('[K7 2026-09-28] yok sayılan anahtar ADLARI denetim kaydına yazılır (değer YOK)', async () => {
    const spy = jest.spyOn(AuditLogger, 'fromRequest').mockResolvedValue(undefined as any);
    await marketplaceSave({ SELLERID: '1', urls: { BASEURL: 'https://gizli-deger.example' }, host: 'x' });
    const call: any[] = spy.mock.calls.find((c: any[]) => c[1] === 'integration.settings.url_field_ignored') as any[];
    expect(call).toBeDefined();
    expect(call[3]).toMatchObject({ type: 'marketplace', integrationCode: 'hepsiburada', ignoredKeys: 'urls,host' });
    expect(JSON.stringify(call.slice(1))).not.toContain('gizli-deger');
  });

  it('[K7 2026-09-28] e-ticaret (per-anahtar $set): URL alanı $set edilmez; DB kalıntısı $unset ile silinir; geçerli storeName yazılır', async () => {
    const s: any = new IntegrationService(4, { clientECommerce: { code: 'ideasoft', settings: { storeName: 'magazam', key: 'k', urls: { baseUrl: 'https://tenant-controlled.example' }, auth: { access_token: 'x' } } } });
    await s.init(); await s.saveClientECommerceSettings();
    const update = ciModel.findOneAndUpdate.mock.calls[0][1];
    expect(Object.keys(update.$set).sort()).toEqual(['ecommerce.$.settings.key', 'ecommerce.$.settings.storeName']);
    expect(update.$unset).toEqual({ 'ecommerce.$.settings.urls': '' });
  });

  it('[K7 2026-09-28] e-ticaret: geçersiz storeName (host enjeksiyonu) 400 ile REDDEDİLİR, DB\'ye hiç yazılmaz', async () => {
    const s: any = new IntegrationService(4, { clientECommerce: { code: 'ideasoft', settings: { storeName: 'evil.example/#', key: 'k' } } });
    await s.init();
    await expect(s.saveClientECommerceSettings()).rejects.toMatchObject({ statusCode: 400 });
    expect(ciModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('[K7 2026-09-28] erp ve shipment yazma yolları da aynı süzgeçten geçer', async () => {
    for (const [type, method, key] of [['erp', 'saveClientErpSettings', 'clientErp'], ['shipment', 'saveClientShipmentSettings', 'clientShipment']] as const) {
      ciModel.findOneAndUpdate.mockClear();
      const s: any = new IntegrationService(4, { [key]: { code: 'x', settings: { MATCHKEY: 'barcode', baseUrl: 'https://tenant-controlled.example' } } });
      await s.init(); await s[method]();
      expect(ciModel.findOneAndUpdate.mock.calls[0][1].$set[`${type}.$.settings`]).toEqual({ MATCHKEY: 'barcode' });
    }
  });
});

describe('K8 IntegrationService.get (member yanıtı)', () => {
  const run = async (docs: any[]) => {
    const chain: any = {}; chain.sort = jest.fn(() => chain); chain.populate = jest.fn(() => chain); chain.lean = jest.fn(async () => docs);
    const find: any = jest.fn((..._a: any[]) => chain);
    Object.assign(appDb, { getIntegrationModel: () => ({ find }) });
    const s: any = new IntegrationService(4, {}); await s.init();
    return { out: await s.get(), find };
  };
  it('[K8 2026-09-28] ÖNCEKİ: yalnızca settings.urls/token gizliydi. ŞİMDİ: profitRate/commissin de projeksiyonla çıkar', async () => {
    const { find } = await run([]);
    expect(find.mock.calls[0][1]).toEqual({ projection: { 'settings.urls': 0, token: 0, profitRate: 0, commissin: 0 } });
  });
  it('[K8 2026-09-28] ÖNCEKİ: üst düzey urls tüm platformlar için dönerdi. ŞİMDİ: yalnız ideasoft/bizimhesap için ve yalnız FE\'nin okuduğu 3 anahtar; diğerlerinde urls YOK', async () => {
    const { out } = await run([
      { code: 'trendyol', urls: { baseUrl: 'https://apigw.trendyol.com' }, title: 'T' },
      { code: 'hepsiburada', urls: { BASEURL: 'https://mpop.hepsiburada.com' } },
      { code: 'ideasoft', urls: { baseUrl: 'https://<STORENAME>.myideasoft.com', authorizationUrl: 'panel/auth', redirectUrl: 'cb', tokenUrl: 'x', orderListUrl: 'y' } },
      { code: 'ptt', title: 'ptt' },
    ]);
    expect(out[0]).toEqual({ code: 'trendyol', title: 'T' });
    expect('urls' in out[1]).toBe(false);
    expect(out[2].urls).toEqual({ baseUrl: 'https://<STORENAME>.myideasoft.com', authorizationUrl: 'panel/auth', redirectUrl: 'cb' });
    expect(out[3]).toEqual({ code: 'ptt', title: 'ptt' });
  });
});

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// INT-09: entegrasyon ayarı kaydedilince IntegrationFactory örnek/ayar önbelleği (5 dk) o tenant+kod için düşürülür.
// DB/Redis/ağ YOK; tüm değerler sentetiktir.

const appDb: any = {};
const clientDb: any = {};
const invalidate = jest.fn();
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => clientDb },
}));
jest.mock('@utils/decorator/cache', () => ({ nodeCache: { getStats: () => ({}), keys: () => [] } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => ({}) } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: Object.assign(jest.fn(), { invalidate: (...a: unknown[]) => invalidate(...a) }) }));
jest.mock('@integration/engine/IntegrationEventBus', () => ({ EVENTS: {}, integrationEventBus: { emit: jest.fn(), on: jest.fn() } }));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: {} }));

import IntegrationService from '../../../src/api/services/integration-service';

const lean = (v: any): any => { const c: any = { lean: jest.fn(async () => v) }; c.sort = jest.fn(() => c); return c; };
// findOneAndUpdate hem `await` edilir hem `.lean()` zincirlenir (ecommerce): ikisini de karşılayan thenable
const updateResult = (doc: any): any => { const p: any = Promise.resolve(doc); p.lean = async () => doc; return p; };

const DOC = {
  marketplace: [{ code: 'trendyol', order: 1, status: true, settings: { SELLERID: '1', stockPolicy: {} } }],
  erp: [{ code: 'bizimhesap', settings: { key: 'k' } }],
  shipment: [{ code: 'yurtici', settings: {} }],
  ecommerce: [{ code: 'ideasoft', settings: { storeName: 'magaza' } }],
};

beforeEach(() => {
  invalidate.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const ciModel = { findOne: jest.fn(() => lean(DOC)), findOneAndUpdate: jest.fn(() => updateResult(DOC)) };
  Object.assign(clientDb, { getClientIntegrationModel: () => ciModel });
});
afterEach(() => { jest.restoreAllMocks(); });

async function run(method: string, request: any): Promise<any> {
  const s: any = new IntegrationService(4, request);
  await s.init();
  return s[method]();
}

describe('ayar kaydetme yolları IntegrationFactory önbelleğini düşürür (INT-09)', () => {
  it.each([
    ['saveClientMarketplaceSettings', { clientMarketplace: { code: 'trendyol', settings: { SELLERID: '2' } } }, 'trendyol'],
    ['saveClientErpSettings', { clientErp: { code: 'bizimhesap', settings: { key: 'k2' } } }, 'bizimhesap'],
    ['saveClientShipmentSettings', { clientShipment: { code: 'yurtici', settings: { a: 1 } } }, 'yurtici'],
    ['saveClientECommerceSettings', { clientECommerce: { code: 'ideasoft', settings: { storeName: 'magaza2' } } }, 'ideasoft'],
    ['saveChannelStockPolicy', { integrationCode: 'trendyol', stockPolicy: { bufferUnits: 2 } }, 'trendyol'],
  ])('%s -> invalidate(clientId, code)', async (method, request, code) => {
    await run(method as string, request);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(4, code);
  });

  it('önbellek düşürme hatası kaydı BOZMAZ (en iyi çaba; TTL zaten sınırlar)', async () => {
    invalidate.mockImplementation(() => { throw new Error('önbellek hatası'); });
    await expect(run('saveClientMarketplaceSettings', { clientMarketplace: { code: 'trendyol', settings: { SELLERID: '2' } } })).resolves.toBeTruthy();
  });

  it('kayıt başarısızsa (DB hatası) önbellek DÜŞÜRÜLMEZ', async () => {
    Object.assign(clientDb, { getClientIntegrationModel: () => ({ findOne: jest.fn(() => lean(DOC)), findOneAndUpdate: jest.fn(async () => { throw new Error('db'); }) }) });
    await expect(run('saveClientMarketplaceSettings', { clientMarketplace: { code: 'trendyol', settings: {} } })).rejects.toThrow('db');
    expect(invalidate).not.toHaveBeenCalled();
  });
});

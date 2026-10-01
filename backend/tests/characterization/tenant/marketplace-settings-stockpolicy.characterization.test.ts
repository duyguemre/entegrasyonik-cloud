import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// CHARACTERIZATION (Protokol 13; N5 ön koşulu, FRONTEND_GAP_ANALYSIS §6-6): IntegrationService.saveClientMarketplaceSettings
// `marketplace.$.settings` nesnesinin TAMAMINI değiştirir. Sır olmayan bir alan (ör. `stockPolicy`) gelen gövdede yoksa
// DB'den SİLİNİR. DB/Redis/ağ YOK; tüm değerler sentetiktir.

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

import IntegrationService from '../../../src/api/services/integration-service';
import { decryptSecrets } from '../../../src/platform/core/security/integrationSecrets';

const lean = (v: any): any => { const c: any = { lean: jest.fn(async () => v) }; c.sort = jest.fn(() => c); return c; };
const EXISTING_POLICY = { bufferUnits: 3, bufferPercent: 10, graceMinutes: 45, autoCancelOversold: false };

let ciModel: any;
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const existing = { marketplace: [{ code: 'trendyol', order: 1, status: true, settings: { SELLERID: '123', APIKEY: 'k-trendyol', APISECRET: 's-trendyol', stockPolicy: { ...EXISTING_POLICY } } }] };
  ciModel = {
    findOne: jest.fn(() => lean(existing)),
    findOneAndUpdate: jest.fn(async () => ({ marketplace: [{ code: 'trendyol', settings: {} }] })),
  };
  Object.assign(clientDb, { getClientIntegrationModel: () => ciModel });
});
afterEach(() => { jest.restoreAllMocks(); });

async function save(settings: any): Promise<any> {
  const s: any = new IntegrationService(4, { clientMarketplace: { code: 'trendyol', settings } });
  await s.init();
  await s.saveClientMarketplaceSettings();
  return ciModel.findOneAndUpdate.mock.calls[0][1].$set['marketplace.$.settings'];
}

describe('saveClientMarketplaceSettings ↔ settings.stockPolicy (kanal başına stok politikası)', () => {
  it('[N5 / ADR-0004] gövdede stockPolicy YOKSA mevcut politika KORUNUR (eskiden settings tamamen değiştiği için SESSİZCE SİLİNİRDİ)', async () => {
    const written = await save({ SELLERID: '999' });
    expect(written.stockPolicy).toEqual(EXISTING_POLICY);
    expect(decryptSecrets(written, 'trendyol')).toEqual({ SELLERID: '999', APIKEY: 'k-trendyol', APISECRET: 's-trendyol', stockPolicy: EXISTING_POLICY });
  });

  it('[N5 / ADR-0004] gövdedeki stockPolicy bu genel uçta YOK SAYILIR: politika yalnızca doğrulamalı özel uçtan yazılır (mevcut değer korunur)', async () => {
    const written = await save({ SELLERID: '999', stockPolicy: { bufferUnits: -5, graceMinutes: 'x', evil: true } });
    expect(written.stockPolicy).toEqual(EXISTING_POLICY);
  });

  it('mevcut politika hiç yoksa ve gövdede de gelirse alan YAZILMAZ (doğrulanmamış değer DB\'ye giremez)', async () => {
    ciModel.findOne = jest.fn(() => lean({ marketplace: [{ code: 'trendyol', settings: { SELLERID: '1' } }] }));
    const written = await save({ SELLERID: '2', stockPolicy: { bufferUnits: 99 } });
    expect('stockPolicy' in written).toBe(false);
  });

  it('sır olmayan diğer alanlar (SELLERID/taxPercentage) gelen değerle yazılır — genel whole-replace davranışı DEĞİŞMEDİ', async () => {
    const written = await save({ SELLERID: '999', taxPercentage: 18 });
    expect(written.SELLERID).toBe('999');
    expect(written.taxPercentage).toBe(18);
  });
});

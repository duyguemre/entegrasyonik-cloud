/**
 * CHARACTERIZATION: Trendyol sipariş durumu webhook alıcısı (ADR-0005 Karar 8 — Aşama B, YENİ özellik).
 * Kaynak: backend/src/api/WebhookApiManager.ts
 *
 * `OrderQueueProducer` tamamen mock'lanır (kendi jobId/dedup mantığı `OrderQueueProducer.characterization.test.ts`
 * içinde AYRICA test edilir -- burada yalnızca WebhookApiManager'ın onu DOĞRU argümanlarla çağırdığı doğrulanır).
 * DatabaseManager mock'lanır: DB YOK. Gerçek Express HTTP sunucusu/supertest KULLANILMAZ (bu repo'da supertest
 * bağımlılığı yok; proje genelindeki auth characterization testleriyle AYNI desen: middleware/route mantığı
 * fonksiyon seviyesinde -- `handleTrendyolWebhook(hookToken)` -- test edilir, gerçek soket YOK). Gövde/JSON hiç
 * parse edilmediği/okunmadığı için (route seviyesinde `express.raw`) gövde içeriğinin test edilmesi de bu
 * fonksiyon seviyesinde ANLAMSIZ -- ayrı bir test `configureWebhookRoutes`'un gövdeyi OKUMADIĞINI (route
 * handler'ının `req.body`'ye hiç dokunmadığını) statik olarak doğrular.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

let producer: any;
jest.mock('@integration/engine/order/OrderQueueProducer', () => ({
  OrderQueueProducer: jest.fn().mockImplementation(() => {
    producer = { enqueueWebhookTriggeredSync: jest.fn(async () => ({ jobId: 'webhook_1_trendyol_123', skipped: false })) };
    return producer;
  }),
}));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));

import { handleTrendyolWebhook, configureWebhookRoutes } from '@api/WebhookApiManager';
import { DatabaseManagerInstance } from '@database/DatabaseManager';

function mockClientLookup(client: any, updateOne = jest.fn(async () => ({}))) {
  const findOne = jest.fn(() => ({ lean: jest.fn(async () => client) }));
  (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
    getClientModel: () => ({ findOne, updateOne }),
  });
  return { findOne, updateOne };
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  // `producer` MODÜL YÜKLENİRKEN (import sırasında, WebhookApiManager.ts'teki tek satırlık modül-seviyesi
  // singleton `new OrderQueueProducer()` çağrısıyla) BİR KEZ kurulur -- burada YENİDEN atanmaz, yalnızca
  // mock çağrı geçmişi temizlenir.
  producer?.enqueueWebhookTriggeredSync?.mockClear();
});

describe('handleTrendyolWebhook - geçerli token', () => {
  it('[YENİ DAVRANIŞ] eşleşen aktif trendyol entegrasyonu varsa 200 döner, order-sync işi HEMEN eklenir, webhook sağlık alanları güncellenir', async () => {
    const now = new Date('2026-01-10T10:00:00.000Z');
    const client = {
      clientId: 5, status: 'ACTIVE',
      integrations: [{ integrationCode: 'trendyol', webhookToken: 'tok-abc', lastSuccessfulOrderSync: now }],
    };
    const { findOne, updateOne } = mockClientLookup(client);

    const result = await handleTrendyolWebhook('tok-abc');

    expect(result).toEqual({ statusCode: 200 });
    expect(findOne).toHaveBeenCalledWith({ status: 'ACTIVE', 'integrations.webhookToken': 'tok-abc' });
    expect(updateOne).toHaveBeenCalledWith(
      { clientId: 5, 'integrations.integrationCode': 'trendyol' },
      { $set: expect.objectContaining({ 'integrations.$.webhookHealthy': true, 'integrations.$.webhookLastReceivedAt': expect.any(Date) }) },
    );
    expect(producer.enqueueWebhookTriggeredSync).toHaveBeenCalledWith(5, 'trendyol', now);
  });

  it('[YENİ DAVRANIŞ] lastSuccessfulOrderSync hiç yoksa (ilk webhook) 24 saatlik fallback ile order-sync işi eklenir', async () => {
    const client = { clientId: 5, status: 'ACTIVE', integrations: [{ integrationCode: 'trendyol', webhookToken: 'tok-abc' }] };
    mockClientLookup(client);

    await handleTrendyolWebhook('tok-abc');

    const [, , lastSyncTimestamp] = producer.enqueueWebhookTriggeredSync.mock.calls[0];
    expect(lastSyncTimestamp).toBeInstanceOf(Date);
  });
});

describe('handleTrendyolWebhook - geçersiz/olmayan token', () => {
  it('[YENİ DAVRANIŞ] hiçbir aktif client\'ta eşleşen webhookToken yoksa 404 döner (varlığı sızdırmaz -- 401 DEĞİL)', async () => {
    const { findOne, updateOne } = mockClientLookup(null);

    const result = await handleTrendyolWebhook('bilinmeyen-token');

    expect(result).toEqual({ statusCode: 404 });
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(updateOne).not.toHaveBeenCalled();
    expect(producer.enqueueWebhookTriggeredSync).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] hookToken boş/undefined ise DB\'ye hiç sorulmadan 404 döner', async () => {
    const { findOne } = mockClientLookup(null);

    const result = await handleTrendyolWebhook('' as any);

    expect(result).toEqual({ statusCode: 404 });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] eşleşen client bulunsa da integrations dizisinde o token\'a sahip kayıt trendyol DEĞİLSE 404 döner (varsayımsal/savunmacı)', async () => {
    const client = { clientId: 5, status: 'ACTIVE', integrations: [{ integrationCode: 'hepsiburada', webhookToken: 'tok-abc' }] };
    const { updateOne } = mockClientLookup(client);

    const result = await handleTrendyolWebhook('tok-abc');

    expect(result).toEqual({ statusCode: 404 });
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe('handleTrendyolWebhook - gövde veri kaynağı olarak KULLANILMAZ', () => {
  it('[YENİ DAVRANIŞ] fonksiyon imzası hiçbir gövde/body parametresi ALMAZ -- yalnızca hookToken; zararlı/bozuk gövde ile çağrılan gerçek HTTP isteği bu fonksiyona hiçbir gövde veri aktarmaz (bkz. configureWebhookRoutes)', async () => {
    const client = { clientId: 5, status: 'ACTIVE', integrations: [{ integrationCode: 'trendyol', webhookToken: 'tok-abc' }] };
    mockClientLookup(client);

    // Aynı token ile davranış, "gövde" kavramı hiç var olmadan (fonksiyon body almıyor) İKİ farklı çağrıda AYNI:
    const r1 = await handleTrendyolWebhook('tok-abc');
    const r2 = await handleTrendyolWebhook('tok-abc');
    expect(r1).toEqual({ statusCode: 200 });
    expect(r2).toEqual({ statusCode: 200 });
  });

  it('[STATİK DOĞRULAMA] route handler `req.body`\'ye HİÇ dokunmaz (kaynak taraması) -- gövde yalnızca express.raw ile drenaj için tamponlanır', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../src/api/WebhookApiManager.ts'), 'utf8');
    const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/req\.body/);
    expect(withoutComments).toMatch(/express\.raw\(/);
  });
});

describe('handleTrendyolWebhook - beklenmeyen hata', () => {
  it('[YENİ DAVRANIŞ] DB hatası fırlarsa 500 döner (200 DÖNMEZ -- Trendyol\'un kendi retry/pasife-alma mekanizması devam etsin, ADR-0005 Bağlam)', async () => {
    (DatabaseManagerInstance.getApplicationDB as any).mockRejectedValue(new Error('mongo down'));

    const result = await handleTrendyolWebhook('tok-abc');

    expect(result).toEqual({ statusCode: 500 });
  });
});

describe('configureWebhookRoutes - Express\'e bağlanma (ADR-0005 Karar 8)', () => {
  it('[YENİ DAVRANIŞ] "/hooks/trendyol/:hookToken" için POST rotası kaydeder', () => {
    const routes: Array<{ method: string; path: string }> = [];
    const fakeApp: any = {
      post: (routePath: string, ..._handlers: any[]) => routes.push({ method: 'POST', path: routePath }),
    };

    configureWebhookRoutes(fakeApp);

    expect(routes).toEqual([{ method: 'POST', path: '/hooks/trendyol/:hookToken' }]);
  });
});

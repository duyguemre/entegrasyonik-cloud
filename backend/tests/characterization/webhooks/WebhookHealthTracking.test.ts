/**
 * CHARACTERIZATION: Webhook sağlık izleme + polling geri düşüş (ADR-0005 Karar 7/Karar 8 — Aşama B).
 * Kaynak: OrderQueueProducer.scheduleJobs() (evaluateWebhookHealth + reconciliation gate), OrderWorker.process()
 * (lastOrderDetectedAt sinyali). `bullmq`/`RedisService`/DatabaseManager tamamen mock'lanır: DB/Redis/ağ YOK.
 *
 * Senaryolar:
 *  1. webhookHealthy alanı YOKSA (varsayılan/eski kayıtlar): davranış DEĞİŞMEZ -- sipariş her turda gating'siz çekilir.
 *  2. webhookHealthy=true VE mutabakat aralığı (5 dk) henüz DOLMADIYSA: bu turda iş EKLENMEZ.
 *  3. webhookHealthy=true VE mutabakat aralığı DOLDUYSA: iş normal şekilde eklenir.
 *  4. webhookHealthy=true ama son 30 dk'da webhook'suz YENİ sipariş algılandıysa (lastOrderDetectedAt var,
 *     webhookLastReceivedAt ondan eski/yok): "şüpheli" -- DB'de webhookHealthy=false'a düşürülür VE bu turda
 *     (henüz DB yazısı tamamlanmamış olsa da) 60 sn davranışına (job eklenir) geri dönülür.
 *  5. OrderWorker: yalnızca GERÇEKTEN yeni sipariş bulunduğunda (insertedExternalIds.length>0) lastOrderDetectedAt ilerler.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const queueInstances: any[] = [];
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => {
    const q: any = { add: jest.fn(async () => undefined), getJobs: jest.fn(async () => []) };
    queueInstances.push(q);
    return q;
  }),
}));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getConnectionConfig: jest.fn(() => ({ host: 'mock', port: 1 })) } }));
jest.mock('@database/index', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn() } }));

import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { DatabaseManagerInstance } from '@database/index';
import { RedisService } from '@services/redis/RedisService';

function mockActiveClients(clients: any[], updateOne = jest.fn(async () => ({}))) {
  (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
    getClientModel: () => ({ find: jest.fn(() => ({ lean: jest.fn(async () => clients) })), updateOne }),
  });
  return updateOne;
}

beforeEach(() => {
  queueInstances.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (RedisService as any).isReady = jest.fn(() => true);
});

afterEach(() => { jest.useRealTimers(); });

describe('OrderQueueProducer.scheduleJobs - webhook sağlık izleme + polling geri düşüş (ADR-0005 Karar 8 — YENİ)', () => {
  it('[MEVCUT DAVRANIŞ, korunuyor] webhookHealthy alanı YOKSA sipariş her turda gating\'SİZ çekilir (davranış DEĞİŞMEDİ)', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{ clientId: 1, order: 1, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastSuccessfulOrderSync: new Date(now - 5000) }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ] webhookHealthy=true ve mutabakat aralığı (5dk) henüz DOLMADIYSA bu turda iş EKLENMEZ', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: new Date(now - 60 * 1000), // 1 dk önce < 5 dk
        webhookHealthy: true,
      }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] webhookHealthy=true ve mutabakat aralığı (5dk) DOLDUYSA iş normal şekilde eklenir', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: new Date(now - 6 * 60 * 1000), // 6 dk önce > 5 dk
        webhookHealthy: true,
      }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ] webhookHealthy=true ama son 30 dk\'da webhook\'suz YENİ sipariş algılandıysa (lastOrderDetectedAt var, webhookLastReceivedAt YOK): şüpheli -> DB\'de webhookHealthy=false\'a düşürülür VE bu turda job yine eklenir (60sn davranışına dönüş)', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const updateOne = mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: new Date(now - 60 * 1000), // 1 dk önce -- webhookHealthy sürseydi ATLANIRDI
        webhookHealthy: true,
        lastOrderDetectedAt: new Date(now - 10 * 60 * 1000), // 10 dk önce (< 30 dk)
        // webhookLastReceivedAt YOK -> webhook hiç gelmemiş
      }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(updateOne).toHaveBeenCalledWith(
      { clientId: 1, 'integrations.integrationCode': 'trendyol' },
      { $set: { 'integrations.$.webhookHealthy': false } },
    );
    // Bu turdan itibaren şüpheli sayıldığı için 5dk gate UYGULANMADI -> iş eklendi
    expect(q.add).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ] webhookLastReceivedAt lastOrderDetectedAt\'TAN SONRA ise (webhook zaten geldi) düşürülmez, healthy kalır ve gate uygulanır', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const updateOne = mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: new Date(now - 60 * 1000),
        webhookHealthy: true,
        lastOrderDetectedAt: new Date(now - 10 * 60 * 1000),
        webhookLastReceivedAt: new Date(now - 5 * 60 * 1000), // detection'dan SONRA (10dk önce -> 5dk önce)
      }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(updateOne).not.toHaveBeenCalled();
    expect(q.add).not.toHaveBeenCalled(); // healthy kaldı, 5dk gate hâlâ uygulanıyor (1dk < 5dk)
  });

  it('[YENİ DAVRANIŞ] lastOrderDetectedAt 30 dk\'dan ESKİYSE (bayat tespit) düşürme TETİKLENMEZ, healthy kalır', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const updateOne = mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: new Date(now - 60 * 1000),
        webhookHealthy: true,
        lastOrderDetectedAt: new Date(now - 40 * 60 * 1000), // 40 dk önce > 30 dk
      }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(updateOne).not.toHaveBeenCalled();
    expect(q.add).not.toHaveBeenCalled(); // healthy + henüz 5dk dolmadı -> atlandı
  });

  it('[YENİ DAVRANIŞ] webhookHealthy=false (önceden düşürülmüş) ise davranış "yok" ile AYNI: gating yok, her turda çekilir', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: new Date(now - 1000),
        webhookHealthy: false,
      }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).toHaveBeenCalledTimes(1);
  });
});

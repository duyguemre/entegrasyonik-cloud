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
    const q: any = { add: jest.fn(async () => undefined), addBulk: jest.fn(async () => []), getJobs: jest.fn(async () => []) };
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
    getClientModel: () => ({ find: jest.fn(() => { const c: any = { sort: () => c, limit: () => c, lean: jest.fn(async () => clients) }; return c; }), updateOne }),
  });
  return updateOne;
}

// [eslesme-fiyat WP7a] Kanal kuyruğuna addBulk; sipariş işi = kind 'orders'. Son koşu = imleç + 5 dk örtüşme (imleç `başlangıç − örtüşme` yazılır).
const ordersAdded = () => queueInstances.flatMap((q: any) => q.addBulk.mock.calls.flatMap(([items]: any[]) => items)).filter((it: any) => it.data.kind === 'orders').length;
const OVERLAP = 5 * 60 * 1000;
const cursorRanAgo = (now: number, agoMs: number) => new Date(now - agoMs - OVERLAP);

beforeEach(() => {
  queueInstances.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (RedisService as any).isReady = jest.fn(() => true);
});

afterEach(() => { jest.useRealTimers(); });

describe('OrderQueueProducer.scheduleJobs - webhook sağlık izleme + polling geri düşüş (ADR-0005 Karar 8 — YENİ)', () => {
  it('[WP7a, PLAN §3.6] ÖNCEKİ: webhookHealthy YOKSA sipariş her 60 sn turunda çekilirdi. ŞİMDİ: webhook\'suz 5 dk — son koşu 6 dk önceyse iş eklenir', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{ clientId: 1, order: 1, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastSuccessfulOrderSync: cursorRanAgo(now, 6 * 60 * 1000) }] }]);
    const producer = new OrderQueueProducer();

    await producer.scheduleJobs();

    expect(ordersAdded()).toBe(1);
  });

  it('[WP7a] webhookHealthy YOK ve son koşu 1 dk önce (5 dk dolmadı) → iş EKLENMEZ', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{ clientId: 1, order: 1, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastSuccessfulOrderSync: cursorRanAgo(now, 60 * 1000) }] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(ordersAdded()).toBe(0);
  });

  it('webhookHealthy=true ve mutabakat aralığı (WP7a: 10 dk) henüz DOLMADIYSA bu turda iş EKLENMEZ', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: cursorRanAgo(now, 6 * 60 * 1000), // 6 dk önce < 10 dk
        webhookHealthy: true,
      }],
    }]);
    const producer = new OrderQueueProducer();

    await producer.scheduleJobs();

    expect(ordersAdded()).toBe(0);
  });

  it('webhookHealthy=true ve mutabakat aralığı (WP7a: 10 dk) DOLDUYSA iş normal şekilde eklenir', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: cursorRanAgo(now, 11 * 60 * 1000), // 11 dk önce > 10 dk
        webhookHealthy: true,
      }],
    }]);
    const producer = new OrderQueueProducer();

    await producer.scheduleJobs();

    expect(ordersAdded()).toBe(1);
  });

  it('[YENİ DAVRANIŞ] webhookHealthy=true ama son 30 dk\'da webhook\'suz YENİ sipariş algılandıysa (lastOrderDetectedAt var, webhookLastReceivedAt YOK): şüpheli -> DB\'de webhookHealthy=false\'a düşürülür VE bu turda job yine eklenir (60sn davranışına dönüş)', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const updateOne = mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: cursorRanAgo(now, 6 * 60 * 1000), // 6 dk önce -- webhookHealthy sürseydi (10 dk) ATLANIRDI
        webhookHealthy: true,
        lastOrderDetectedAt: new Date(now - 10 * 60 * 1000), // 10 dk önce (< 30 dk)
        // webhookLastReceivedAt YOK -> webhook hiç gelmemiş
      }],
    }]);
    const producer = new OrderQueueProducer();

    await producer.scheduleJobs();

    expect(updateOne).toHaveBeenCalledWith(
      { clientId: 1, 'integrations.integrationCode': 'trendyol' },
      { $set: { 'integrations.$.webhookHealthy': false } },
    );
    // Bu turdan itibaren şüpheli sayıldığı için webhook'suz aralık (5 dk) uygulandı -> iş eklendi
    expect(ordersAdded()).toBe(1);
  });

  it('[YENİ DAVRANIŞ] webhookLastReceivedAt lastOrderDetectedAt\'TAN SONRA ise (webhook zaten geldi) düşürülmez, healthy kalır ve gate uygulanır', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const updateOne = mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: cursorRanAgo(now, 60 * 1000),
        webhookHealthy: true,
        lastOrderDetectedAt: new Date(now - 10 * 60 * 1000),
        webhookLastReceivedAt: new Date(now - 5 * 60 * 1000), // detection'dan SONRA (10dk önce -> 5dk önce)
      }],
    }]);
    const producer = new OrderQueueProducer();

    await producer.scheduleJobs();

    expect(updateOne).not.toHaveBeenCalled();
    expect(ordersAdded()).toBe(0); // healthy kaldı, 5dk gate hâlâ uygulanıyor (1dk < 5dk)
  });

  it('[YENİ DAVRANIŞ] lastOrderDetectedAt 30 dk\'dan ESKİYSE (bayat tespit) düşürme TETİKLENMEZ, healthy kalır', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const updateOne = mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: cursorRanAgo(now, 60 * 1000),
        webhookHealthy: true,
        lastOrderDetectedAt: new Date(now - 40 * 60 * 1000), // 40 dk önce > 30 dk
      }],
    }]);
    const producer = new OrderQueueProducer();

    await producer.scheduleJobs();

    expect(updateOne).not.toHaveBeenCalled();
    expect(ordersAdded()).toBe(0); // healthy + henüz 5dk dolmadı -> atlandı
  });

  it('webhookHealthy=false (önceden düşürülmüş) ise davranış "yok" ile AYNI: webhook\'suz aralık (5 dk)', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 1,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastSuccessfulOrderSync: cursorRanAgo(now, 6 * 60 * 1000),
        webhookHealthy: false,
      }],
    }]);
    const producer = new OrderQueueProducer();

    await producer.scheduleJobs();

    expect(ordersAdded()).toBe(1);
  });
});

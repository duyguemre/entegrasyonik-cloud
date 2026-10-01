/**
 * CHARACTERIZATION: OrderQueueProducer (backend/src/integration/engine/order/OrderQueueProducer.ts)
 * `bullmq.Queue` ve `RedisService` tamamen mock'lanır: gerçek Redis/ağ YOK. Veriler sentetiktir.
 *
 * [ADR-0003 adım 8] Yeni: `cancelJobsForClient(clientId)` — yumuşak silme akışının "zamanlanmış sync işlerinin
 * iptali" adımı. Gerçek BullMQ'ya dokunulmaz; yalnızca mock `orderQueue.getJobs/job.remove()` çağrıldığı doğrulanır.
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
jest.mock('@services/billing/EntitlementService', () => ({ EntitlementService: { checkAccess: jest.fn() } }));

import { OrderQueueProducer } from '@integration/engine/order/OrderQueueProducer';
import { DatabaseManagerInstance } from '@database/index';
import { RedisService } from '@services/redis/RedisService';
import { EntitlementService } from '@services/billing/EntitlementService';

const job = (data: any, id = 'j1') => ({ id, data, remove: jest.fn(async () => undefined) });

function mockActiveClients(clients: any[]) {
  (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
    getClientModel: () => ({ find: jest.fn(() => ({ lean: jest.fn(async () => clients) })) }),
  });
}

beforeEach(() => {
  queueInstances.length = 0;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (RedisService as any).isReady = jest.fn(() => true);
  delete process.env.ENTITLEMENT_GUARD_ENABLED; // varsayılan: bayrak KAPALI
  (EntitlementService.checkAccess as any).mockReset();
});

afterEach(() => {
  delete process.env.ENTITLEMENT_GUARD_ENABLED;
});

describe('OrderQueueProducer.scheduleJobs - Redis dayanıklılığı (ADR-0005 Karar 2 — YENİ)', () => {
  it('[YENİ DAVRANIŞ] RedisService.isReady() false ise hiçbir iş EKLENMEZ (queue.add hiç çağrılmaz), ApplicationDB\'ye bile sorulmaz', async () => {
    (RedisService as any).isReady = jest.fn(() => false);
    mockActiveClients([{ clientId: 1, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).not.toHaveBeenCalled();
    expect(DatabaseManagerInstance.getApplicationDB).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ, korunuyor] RedisService.isReady() true ise normal akış çalışır', async () => {
    (RedisService as any).isReady = jest.fn(() => true);
    mockActiveClients([{ clientId: 1, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).toHaveBeenCalledTimes(1);
  });
});

describe('OrderQueueProducer.scheduleJobs - kaynak başına ayrı imleç + gating (ADR-0005 Karar 7 — YENİ)', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('[YENİ DAVRANIŞ] hiçbir kaynağın imleci yoksa (ilk çalıştırma): claimSync/financeSync/messageSync hepsi "due", claim/finance tam pencere gün sayısıyla, message 1 gün ile bootstrap eder', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-03-01T03:00:00.000Z') }); // stagger'a denk gelmese de "hiç cursor yok" dalı her zaman due
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    const jobData = q.add.mock.calls[0][1];
    expect(jobData.claimSync).toMatchObject({ due: true, isFullSweep: false });
    expect(jobData.claimSync.startDate.getTime()).toBe(Date.now() - 32 * 24 * 60 * 60 * 1000);
    expect(jobData.financeSync).toMatchObject({ due: true, isFullSweep: false });
    expect(jobData.financeSync.startDate.getTime()).toBe(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(jobData.messageSync).toMatchObject({ due: true, isFullSweep: false });
    expect(jobData.messageSync.startDate.getTime()).toBe(Date.now() - 1 * 24 * 60 * 60 * 1000);
  });

  it('[YENİ DAVRANIŞ] iade imleci 15 dk\'dan yeniyse bu turda ATLANIR (claimSync alanı jobData\'da hiç YOK)', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 7,
      integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastClaimSync: new Date(now - 5 * 60 * 1000) }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add.mock.calls[0][1]).not.toHaveProperty('claimSync');
  });

  it('[YENİ DAVRANIŞ] iade imleci 15 dk\'dan eskiyse delta pencere ile due olur: startDate = lastClaimSync - 1 sa', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const lastClaimSync = new Date(now - 20 * 60 * 1000); // 20 dk önce > 15 dk aralık
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastClaimSync }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    const claimSync = q.add.mock.calls[0][1].claimSync;
    expect(claimSync).toMatchObject({ due: true, isFullSweep: false });
    expect(claimSync.startDate.getTime()).toBe(lastClaimSync.getTime() - 60 * 60 * 1000);
  });

  it('[YENİ DAVRANIŞ] günlük tam süpürme: staggerHour (Client.order % 24) şu anki UTC saate denk geliyorsa VE son süpürmeden 24 sa geçtiyse -> isFullSweep=true, 32 günlük pencere (delta due olsa bile tam süpürme ÖNCELİKLİDİR)', async () => {
    const now = Date.parse('2026-03-01T05:00:00.000Z'); // UTC saat 5
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 5, // staggerHour = 5 % 24 = 5 -> şu anki saatle eşleşir
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastClaimSync: new Date(now - 20 * 60 * 1000),
        lastClaimFullSweepAt: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 gün önce
      }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    const claimSync = q.add.mock.calls[0][1].claimSync;
    expect(claimSync).toMatchObject({ due: true, isFullSweep: true });
    expect(claimSync.startDate.getTime()).toBe(now - 32 * 24 * 60 * 60 * 1000);
  });

  it('[YENİ DAVRANIŞ] staggerHour eşleşse de son süpürmeden 24 sa geçmediyse tam süpürme TETİKLENMEZ (delta pencereye düşer)', async () => {
    const now = Date.parse('2026-03-01T05:00:00.000Z');
    jest.useFakeTimers({ now });
    const lastClaimSync = new Date(now - 20 * 60 * 1000);
    mockActiveClients([{
      clientId: 1, order: 5,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastClaimSync,
        lastClaimFullSweepAt: new Date(now - 1 * 60 * 60 * 1000), // 1 sa önce -> henüz 24 sa geçmedi
      }],
    }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    const claimSync = q.add.mock.calls[0][1].claimSync;
    expect(claimSync).toMatchObject({ isFullSweep: false });
  });

  it('[MEVCUT DAVRANIŞ, ADR-0005 Karar 7 ile korunuyor] sipariş imleci (lastSyncTimestamp) her turda AYNI ŞEKİLDE okunur — gating YOK (60 sn zaten en sık kaynak)', async () => {
    const lastSync = new Date('2026-01-01T00:00:00.000Z');
    mockActiveClients([{ clientId: 1, order: 3, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastSuccessfulOrderSync: lastSync }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add.mock.calls[0][1].lastSyncTimestamp).toBe(lastSync);
  });
});

describe('OrderQueueProducer.enqueueWebhookTriggeredSync (ADR-0005 Karar 8 — YENİ)', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('[YENİ DAVRANIŞ] Redis hazırsa "webhook_<clientId>_<integrationCode>_<10sn penceresi>" jobId ile normal jobId önekinden (sync_) FARKLI bir iş ekler', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-03-01T03:00:00.000Z') });
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    const res = await producer.enqueueWebhookTriggeredSync(7, 'trendyol', new Date('2026-01-01T00:00:00.000Z'));

    expect(res.skipped).toBe(false);
    expect(q.add).toHaveBeenCalledTimes(1);
    const [name, jobData, opts] = q.add.mock.calls[0];
    expect(name).toBe('fetch-orders-trendyol');
    expect(opts.jobId).toBe(`webhook_7_trendyol_${Math.floor(Date.now() / 10000)}`);
    expect(jobData).toEqual({ clientId: 7, integrationCode: 'trendyol', lastSyncTimestamp: new Date('2026-01-01T00:00:00.000Z'), isManualTrigger: false, correlationId: expect.stringMatching(/^wh-/) });
  });

  it('[YENİ DAVRANIŞ] aynı 10 sn penceresi içindeki İKİNCİ çağrı AYNI jobId\'yi üretir (BullMQ\'nun kendi tekilleştirmesine düşer — gerçek Redis burada YOK, jobId eşitliği doğrulanır)', async () => {
    const now = Date.parse('2026-03-01T03:00:03.000Z'); // 10sn penceresinin içinde, aynı bucket
    jest.useFakeTimers({ now });
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.enqueueWebhookTriggeredSync(7, 'trendyol', new Date());
    jest.setSystemTime(now + 4000); // hâlâ aynı 10sn penceresinde (bucket sınırı 10000ms)
    await producer.enqueueWebhookTriggeredSync(7, 'trendyol', new Date());

    expect(q.add).toHaveBeenCalledTimes(2);
    expect(q.add.mock.calls[0][2].jobId).toBe(q.add.mock.calls[1][2].jobId);
  });

  it('[YENİ DAVRANIŞ] 10 sn penceresi DEĞİŞTİĞİNDE jobId de değişir (farklı pencere = tekilleştirilmez, yeni iş)', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.enqueueWebhookTriggeredSync(7, 'trendyol', new Date());
    jest.setSystemTime(now + 11000); // 10sn penceresini AŞTI
    await producer.enqueueWebhookTriggeredSync(7, 'trendyol', new Date());

    expect(q.add.mock.calls[0][2].jobId).not.toBe(q.add.mock.calls[1][2].jobId);
  });

  it('[YENİ DAVRANIŞ] RedisService.isReady() false ise iş EKLENMEZ, skipped:true döner, hata FIRLATILMAZ', async () => {
    (RedisService as any).isReady = jest.fn(() => false);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    const res = await producer.enqueueWebhookTriggeredSync(7, 'trendyol', new Date());

    expect(res).toEqual({ jobId: '', skipped: true });
    expect(q.add).not.toHaveBeenCalled();
  });
});

describe('OrderQueueProducer.cancelJobsForClient (ADR-0003 adım 8 — mock, GERÇEK Redis YOK)', () => {
  it('delayed/waiting/waiting-children/prioritized durumlarını sorgular ve sadece verilen clientId\'ye ait işleri kaldırır', async () => {
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];
    const mine1 = job({ clientId: '5', integrationCode: 'trendyol' }, 'a');
    const mine2 = job({ clientId: '5', integrationCode: 'n11' }, 'b');
    const other = job({ clientId: '6', integrationCode: 'trendyol' }, 'c');
    q.getJobs.mockImplementation(async ([state]: any[]) => (state === 'waiting' ? [mine1, other] : state === 'delayed' ? [mine2] : []));

    const removed = await producer.cancelJobsForClient('5');

    expect(q.getJobs).toHaveBeenCalledWith(['delayed']);
    expect(q.getJobs).toHaveBeenCalledWith(['waiting']);
    expect(q.getJobs).toHaveBeenCalledWith(['waiting-children']);
    expect(q.getJobs).toHaveBeenCalledWith(['prioritized']);
    expect(mine1.remove).toHaveBeenCalledTimes(1);
    expect(mine2.remove).toHaveBeenCalledTimes(1);
    expect(other.remove).not.toHaveBeenCalled();
    expect(removed).toBe(2);
  });

  it('eşleşen iş yoksa 0 döner ve hiçbir remove() çağrılmaz', async () => {
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];
    q.getJobs.mockResolvedValue([job({ clientId: '999' })]);
    const removed = await producer.cancelJobsForClient('5');
    expect(removed).toBe(0);
  });

  it('clientId tip farkına (string/number) rağmen eşleşir (String() karşılaştırması)', async () => {
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];
    const j = job({ clientId: 5 }); // number
    q.getJobs.mockResolvedValueOnce([j]).mockResolvedValue([]);
    const removed = await producer.cancelJobsForClient('5');
    expect(j.remove).toHaveBeenCalledTimes(1);
    expect(removed).toBe(1);
  });
});

describe('OrderQueueProducer.scheduleJobs - ADR-0008 §3(b) entitlement guard (ENTITLEMENT_GUARD_ENABLED, BAYRAK KORUMALI)', () => {
  it('[KARAKTERİZASYON] bayrak tanımsız/false (varsayılan): EntitlementService.checkAccess HİÇ ÇAĞRILMAZ, davranış birebir mevcut gibi', async () => {
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).toHaveBeenCalledTimes(1);
    expect(EntitlementService.checkAccess).not.toHaveBeenCalled();
  });

  it('[YENİ DAVRANIŞ] bayrak true: her aktif tenant için checkAccess(clientId, "engine") çağrılır', async () => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: true, status: 'active' });
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(EntitlementService.checkAccess).toHaveBeenCalledWith(1, 'engine');
    expect(q.add).toHaveBeenCalledTimes(1);
  });

  it('[YENİ DAVRANIŞ] bayrak true + allowed:false (ör. suspended): bu tenant için İŞ EKLENMEZ, diğer tenant\'lar etkilenmez', async () => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockImplementation(async (clientId: number) => (
      clientId === 1 ? { allowed: false, status: 'suspended' } : { allowed: true, status: 'active' }
    ));
    mockActiveClients([
      { clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] },
      { clientId: 2, order: 8, integrations: [{ status: true, type: 'marketplace', integrationCode: 'n11' }] },
    ]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).toHaveBeenCalledTimes(1);
    expect(q.add.mock.calls[0][1].clientId).toBe('2');
  });

  it.each(['suspended', 'canceled', 'expired', 'no_subscription'])('[YENİ DAVRANIŞ] durum makinesi kablolaması: %s x allowed:false -> tur atlanır', async (status) => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: false, status });
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).not.toHaveBeenCalled();
  });

  it.each(['trialing', 'active', 'past_due'])('[YENİ DAVRANIŞ] durum makinesi kablolaması: %s x allowed:true -> iş eklenir', async (status) => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: true, status });
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();
    const q = queueInstances[0];

    await producer.scheduleJobs();

    expect(q.add).toHaveBeenCalledTimes(1);
  });
});

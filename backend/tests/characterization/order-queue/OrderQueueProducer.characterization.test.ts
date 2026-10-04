/**
 * CHARACTERIZATION: OrderQueueProducer (backend/src/integration/engine/order/OrderQueueProducer.ts)
 * `bullmq.Queue` ve `RedisService` tamamen mock'lanır: gerçek Redis/ağ YOK. Veriler sentetiktir.
 *
 * [ADR-0003 adım 8] Yeni: `cancelJobsForClient(clientId)` — yumuşak silme akışının "zamanlanmış sync işlerinin
 * iptali" adımı. Gerçek BullMQ'ya dokunulmaz; yalnızca mock `orderQueue.getJobs/job.remove()` çağrıldığı doğrulanır.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// [eslesme-fiyat WP7a] Kuyruklar tembel ve kanal başına kurulur (`order-sync-<kod>`); üretici `addBulk` kullanır.
const queueInstances: any[] = [];
let sharedGetJobs: any = jest.fn(async () => []);
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: any) => {
    const q: any = {
      name,
      add: jest.fn(async (_n: string, _d: any, opts: any) => ({ id: `auto-${opts?.deduplication?.id ?? 'x'}` })),
      addBulk: jest.fn(async (items: any[]) => items.map((_, i) => ({ id: `b${i}` }))),
      getJobs: (...args: any[]) => sharedGetJobs(name, ...args),
    };
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

let findMock: any;
function mockActiveClients(clients: any[]) {
  findMock = jest.fn(() => {
    const chain: any = { sort: () => chain, limit: () => chain, lean: jest.fn(async () => clients) };
    return chain;
  });
  (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue({
    getClientModel: () => ({ find: findMock, updateOne: jest.fn(async () => ({})) }),
  });
}

/** Tüm kuyruklara `addBulk` ile eklenen işler: { queue, name, data, opts }. */
const allJobs = () => queueInstances.flatMap((q: any) => q.addBulk.mock.calls.flatMap(([items]: any[]) => items.map((it: any) => ({ queue: q.name, ...it }))));
const jobOf = (kind: string) => allJobs().find((j: any) => j.data.kind === kind);
const webhookQueue = () => queueInstances.find((q: any) => q.add.mock.calls.length > 0);

beforeEach(() => {
  queueInstances.length = 0;
  sharedGetJobs = jest.fn(async () => []);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (RedisService as any).isReady = jest.fn(() => true);
  delete process.env.ENTITLEMENT_GUARD_ENABLED; // varsayılan: bayrak KAPALI
  (EntitlementService.checkAccess as any).mockReset();
});

afterEach(() => {
  delete process.env.ENTITLEMENT_GUARD_ENABLED;
});

describe('OrderQueueProducer.scheduleJobs - Redis dayanıklılığı (ADR-0005 Karar 2)', () => {
  it('RedisService.isReady() false ise hiçbir iş EKLENMEZ, ApplicationDB\'ye bile sorulmaz; sonuç skipped=redis_unavailable', async () => {
    (RedisService as any).isReady = jest.fn(() => false);
    mockActiveClients([{ clientId: 1, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();

    const out = await producer.scheduleJobs();

    expect(out).toEqual({ skipped: 'redis_unavailable' });
    expect(allJobs()).toHaveLength(0);
    expect(DatabaseManagerInstance.getApplicationDB).not.toHaveBeenCalled();
  });

  it('[WP7a ŞİMDİ] Redis hazırsa yapıcı kuyruk KURMAZ (tembel); tur kanal kuyruğuna (order-sync-trendyol) addBulk ile yazar', async () => {
    mockActiveClients([{ clientId: 1, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer = new OrderQueueProducer();
    expect(queueInstances).toHaveLength(0);

    const out = await producer.scheduleJobs();

    expect(queueInstances.map(q => q.name)).toEqual(['order-sync-trendyol']);
    expect(queueInstances[0].add).not.toHaveBeenCalled();
    expect(allJobs().map((j: any) => j.data.kind).sort()).toEqual(['claims', 'finance', 'messages', 'orders']);
    expect(out).toMatchObject({ processed: 4, failed: 0 });
  });
});

describe('[eslesme-fiyat WP7a, F-01/F-02] kind başına iş, çift+kind tekilleştirme, projeksiyonlu sayfalı okuma, tenant dilimi', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('ÖNCEKİ: tek iş `fetch-orders-<kod>`, jobId `sync_<c>_<kod>_<60 sn penceresi>`. ŞİMDİ: iş adı `<kind>-<kod>`, sabit jobId YOK, deduplication.id = sync_<c>_<kod>_<kind>', async () => {
    mockActiveClients([{ clientId: 9, order: 0, integrations: [{ status: true, type: 'marketplace', integrationCode: 'n11' }] }]);
    await new OrderQueueProducer().scheduleJobs();

    const orders = jobOf('orders');
    expect(orders.queue).toBe('order-sync-n11');
    expect(orders.name).toBe('orders-n11');
    expect(orders.opts).toEqual({ deduplication: { id: 'sync_9_n11_orders' } });
    expect(orders.opts).not.toHaveProperty('jobId');
    expect(jobOf('claims').opts.deduplication.id).toBe('sync_9_n11_claims');
    expect(jobOf('orders').data).not.toHaveProperty('claimSync'); // sipariş işi iade penceresi taşımaz
  });

  it('tenant dilimi: Client.order % 60 saniye gecikme (order=125 → 5 sn)', async () => {
    mockActiveClients([{ clientId: 1, order: 125, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(allJobs().every((j: any) => j.opts.delay === 5000)).toBe(true);
  });

  it('Clients projeksiyonla (yalnız imleç/durum alanları) ve ACTIVE filtresiyle okunur', async () => {
    mockActiveClients([]);
    const out = await new OrderQueueProducer().scheduleJobs();
    const [filter, projection] = findMock.mock.calls[0];
    expect(filter).toEqual({ status: 'ACTIVE' });
    expect(projection).toMatchObject({ clientId: 1, order: 1, 'integrations.integrationCode': 1, 'integrations.lastSuccessfulOrderSync': 1, 'integrations.needsAttention': 1 });
    expect(projection).not.toHaveProperty('integrations');
    expect(out).toMatchObject({ processed: 0, note: 'no_active_clients' });
  });

  it('[F-04] needsAttention işaretli entegrasyon için iş ÜRETİLMEZ; diğerleri etkilenmez', async () => {
    mockActiveClients([{ clientId: 1, order: 0, integrations: [
      { status: true, type: 'marketplace', integrationCode: 'trendyol', needsAttention: { reason: 'AUTH' } },
      { status: true, type: 'marketplace', integrationCode: 'n11' },
    ] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(new Set(allJobs().map((j: any) => j.data.integrationCode))).toEqual(new Set(['n11']));
  });

  it('bilinmeyen kanal kodu ortak kuyruğa (order-sync-other) düşer', async () => {
    mockActiveClients([{ clientId: 1, order: 0, integrations: [{ status: true, type: 'ecommerce', integrationCode: 'yenikanal' }] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(new Set(allJobs().map((j: any) => j.queue))).toEqual(new Set(['order-sync-other']));
  });

  it('[PLAN §3.6] sipariş: webhook\'suz 5 dk — son koşu (imleç + 5 dk örtüşme) 4 dk önceyse iş YOK, 6 dk önceyse var', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const overlap = 5 * 60 * 1000;
    mockActiveClients([{ clientId: 1, order: 0, integrations: [{ status: true, type: 'marketplace', integrationCode: 'n11', lastSuccessfulOrderSync: new Date(now - 4 * 60 * 1000 - overlap), lastClaimSync: new Date(now), lastFinanceSync: new Date(now), lastMessageSync: new Date(now) }] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(allJobs()).toHaveLength(0);

    queueInstances.length = 0;
    mockActiveClients([{ clientId: 1, order: 0, integrations: [{ status: true, type: 'marketplace', integrationCode: 'n11', lastSuccessfulOrderSync: new Date(now - 6 * 60 * 1000 - overlap), lastClaimSync: new Date(now), lastFinanceSync: new Date(now), lastMessageSync: new Date(now) }] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(allJobs().map((j: any) => j.data.kind)).toEqual(['orders']);
  });

  it('[PLAN §3.6] mesaj 10 dk (önceden 5 dk): imleç 7 dk önceyse mesaj işi YOK', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'n11', lastMessageSync: new Date(now - 7 * 60 * 1000) }] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(jobOf('messages')).toBeUndefined();
  });

  it('addBulk hatası turu düşürmez: failed sayılır, sonuç döner', async () => {
    mockActiveClients([{ clientId: 1, order: 0, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    const producer2 = new OrderQueueProducer();
    const origQueue = (producer2 as any).queue.bind(producer2);
    (producer2 as any).queue = (name: string) => { const q = origQueue(name); q.addBulk.mockRejectedValueOnce(new Error('redis down')); return q; };
    const out2 = await producer2.scheduleJobs();
    expect(out2).toMatchObject({ processed: 0, failed: 4 });
  });
});

describe('OrderQueueProducer.scheduleJobs - kaynak başına ayrı imleç + gating (ADR-0005 Karar 7)', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('hiçbir kaynağın imleci yoksa (ilk çalıştırma): claims/finance/messages işleri "due", claim/finance tam pencere gün sayısıyla, message 1 gün ile bootstrap eder', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-03-01T03:00:00.000Z') });
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] }]);
    await new OrderQueueProducer().scheduleJobs();

    const claimSync = jobOf('claims').data.claimSync;
    const financeSync = jobOf('finance').data.financeSync;
    const messageSync = jobOf('messages').data.messageSync;
    expect(claimSync).toMatchObject({ due: true, isFullSweep: false });
    expect(claimSync.startDate.getTime()).toBe(Date.now() - 32 * 24 * 60 * 60 * 1000);
    expect(financeSync).toMatchObject({ due: true, isFullSweep: false });
    expect(financeSync.startDate.getTime()).toBe(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(messageSync).toMatchObject({ due: true, isFullSweep: false });
    expect(messageSync.startDate.getTime()).toBe(Date.now() - 1 * 24 * 60 * 60 * 1000);
  });

  it('iade imleci 15 dk\'dan yeniyse bu turda iade işi EKLENMEZ', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 7,
      integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastClaimSync: new Date(now - 5 * 60 * 1000) }],
    }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(jobOf('claims')).toBeUndefined();
  });

  it('iade imleci 15 dk\'dan eskiyse delta pencere ile due olur: startDate = lastClaimSync - 1 sa', async () => {
    const now = Date.parse('2026-03-01T03:00:00.000Z');
    jest.useFakeTimers({ now });
    const lastClaimSync = new Date(now - 20 * 60 * 1000);
    mockActiveClients([{ clientId: 1, order: 7, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastClaimSync }] }]);
    await new OrderQueueProducer().scheduleJobs();

    const claimSync = jobOf('claims').data.claimSync;
    expect(claimSync).toMatchObject({ due: true, isFullSweep: false });
    expect(claimSync.startDate.getTime()).toBe(lastClaimSync.getTime() - 60 * 60 * 1000);
  });

  it('günlük tam süpürme: staggerHour (Client.order % 24) şu anki UTC saate denk geliyorsa VE son süpürmeden 24 sa geçtiyse -> isFullSweep=true, 32 günlük pencere', async () => {
    const now = Date.parse('2026-03-01T05:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 5,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastClaimSync: new Date(now - 20 * 60 * 1000),
        lastClaimFullSweepAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
      }],
    }]);
    await new OrderQueueProducer().scheduleJobs();

    const claimSync = jobOf('claims').data.claimSync;
    expect(claimSync).toMatchObject({ due: true, isFullSweep: true });
    expect(claimSync.startDate.getTime()).toBe(now - 32 * 24 * 60 * 60 * 1000);
  });

  it('staggerHour eşleşse de son süpürmeden 24 sa geçmediyse tam süpürme TETİKLENMEZ (delta pencereye düşer)', async () => {
    const now = Date.parse('2026-03-01T05:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{
      clientId: 1, order: 5,
      integrations: [{
        status: true, type: 'marketplace', integrationCode: 'trendyol',
        lastClaimSync: new Date(now - 20 * 60 * 1000),
        lastClaimFullSweepAt: new Date(now - 1 * 60 * 60 * 1000),
      }],
    }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(jobOf('claims').data.claimSync).toMatchObject({ isFullSweep: false });
  });

  it('[PLAN §3.6] finans tam süpürmesi haftalık (önceden günlük): son süpürme 2 gün önce + stagger saati → tam süpürme YOK', async () => {
    const now = Date.parse('2026-03-01T05:00:00.000Z');
    jest.useFakeTimers({ now });
    mockActiveClients([{ clientId: 1, order: 5, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol',
      lastFinanceSync: new Date(now - 7 * 60 * 60 * 1000), lastFinanceFullSweepAt: new Date(now - 2 * 24 * 60 * 60 * 1000) }] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(jobOf('finance').data.financeSync).toMatchObject({ isFullSweep: false });
  });

  it('sipariş işi lastSyncTimestamp\'ı imleçten taşır', async () => {
    const lastSync = new Date('2026-01-01T00:00:00.000Z');
    mockActiveClients([{ clientId: 1, order: 3, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol', lastSuccessfulOrderSync: lastSync }] }]);
    await new OrderQueueProducer().scheduleJobs();
    expect(jobOf('orders').data.lastSyncTimestamp).toBe(lastSync);
  });
});

describe('OrderQueueProducer.enqueueWebhookTriggeredSync (ADR-0005 Karar 8)', () => {
  afterEach(() => { jest.useRealTimers(); });

  it('ÖNCEKİ: jobId `webhook_<c>_<kod>_<10 sn penceresi>`. ŞİMDİ: kanal kuyruğuna kind=orders, deduplication {id: webhook_<c>_<kod>, ttl: 10 sn} (zamanlanmış sync_ kimliğinden farklı)', async () => {
    jest.useFakeTimers({ now: Date.parse('2026-03-01T03:00:00.000Z') });
    const producer = new OrderQueueProducer();

    const res = await producer.enqueueWebhookTriggeredSync(7, 'trendyol', new Date('2026-01-01T00:00:00.000Z'));

    expect(res.skipped).toBe(false);
    const q = webhookQueue();
    expect(q.name).toBe('order-sync-trendyol');
    expect(q.add).toHaveBeenCalledTimes(1);
    const [name, jobData, opts] = q.add.mock.calls[0];
    expect(name).toBe('orders-trendyol');
    expect(opts).toEqual({ deduplication: { id: 'webhook_7_trendyol', ttl: 10000 } });
    expect(jobData).toEqual({ clientId: 7, integrationCode: 'trendyol', lastSyncTimestamp: new Date('2026-01-01T00:00:00.000Z'), isManualTrigger: false, kind: 'orders', correlationId: expect.stringMatching(/^wh-/) });
    expect(res.jobId).toBe('auto-webhook_7_trendyol');
  });

  it('RedisService.isReady() false ise iş EKLENMEZ, skipped:true döner, hata FIRLATILMAZ', async () => {
    (RedisService as any).isReady = jest.fn(() => false);
    const producer = new OrderQueueProducer();

    const res = await producer.enqueueWebhookTriggeredSync(7, 'trendyol', new Date());

    expect(res).toEqual({ jobId: '', skipped: true });
    expect(queueInstances).toHaveLength(0);
  });
});

describe('OrderQueueProducer.cancelJobsForClient (ADR-0003 adım 8 — mock, GERÇEK Redis YOK)', () => {
  it('[WP7a] eski + tüm kanal kuyruklarında delayed/waiting/waiting-children/prioritized durumlarını sorgular ve sadece verilen clientId\'ye ait işleri kaldırır', async () => {
    const producer = new OrderQueueProducer();
    const mine1 = job({ clientId: '5', integrationCode: 'trendyol' }, 'a');
    const mine2 = job({ clientId: '5', integrationCode: 'n11' }, 'b');
    const other = job({ clientId: '6', integrationCode: 'trendyol' }, 'c');
    sharedGetJobs = jest.fn(async (qn: string, [state]: any[]) => (
      qn === 'order-sync-queue' && state === 'waiting' ? [mine1, other] : qn === 'order-sync-n11' && state === 'delayed' ? [mine2] : []));

    const removed = await producer.cancelJobsForClient('5');

    const names = new Set(sharedGetJobs.mock.calls.map((c: any[]) => c[0]));
    expect(names).toEqual(new Set(['order-sync-queue', 'order-sync-trendyol', 'order-sync-hepsiburada', 'order-sync-n11', 'order-sync-pazarama', 'order-sync-ideasoft', 'order-sync-bizimhesap', 'order-sync-other']));
    const states = new Set(sharedGetJobs.mock.calls.map((c: any[]) => c[1][0]));
    expect(states).toEqual(new Set(['delayed', 'waiting', 'waiting-children', 'prioritized']));
    expect(mine1.remove).toHaveBeenCalledTimes(1);
    expect(mine2.remove).toHaveBeenCalledTimes(1);
    expect(other.remove).not.toHaveBeenCalled();
    expect(removed).toBe(2);
  });

  it('eşleşen iş yoksa 0 döner ve hiçbir remove() çağrılmaz', async () => {
    const producer = new OrderQueueProducer();
    sharedGetJobs = jest.fn(async () => [job({ clientId: '999' })]);
    const removed = await producer.cancelJobsForClient('5');
    expect(removed).toBe(0);
  });

  it('clientId tip farkına (string/number) rağmen eşleşir (String() karşılaştırması)', async () => {
    const producer = new OrderQueueProducer();
    const j = job({ clientId: 5 });
    let given = false;
    sharedGetJobs = jest.fn(async () => { if (given) return []; given = true; return [j]; });
    const removed = await producer.cancelJobsForClient('5');
    expect(j.remove).toHaveBeenCalledTimes(1);
    expect(removed).toBe(1);
  });
});

describe('OrderQueueProducer.scheduleJobs - ADR-0008 §3(b) entitlement guard (ENTITLEMENT_GUARD_ENABLED, BAYRAK KORUMALI)', () => {
  const trendyolClient = (clientId = 1, order = 7) => ({ clientId, order, integrations: [{ status: true, type: 'marketplace', integrationCode: 'trendyol' }] });

  it('bayrak tanımsız/false (varsayılan): EntitlementService.checkAccess HİÇ ÇAĞRILMAZ', async () => {
    mockActiveClients([trendyolClient()]);
    await new OrderQueueProducer().scheduleJobs();
    expect(allJobs().length).toBeGreaterThan(0);
    expect(EntitlementService.checkAccess).not.toHaveBeenCalled();
  });

  it('bayrak true: her aktif tenant için checkAccess(clientId, "engine") çağrılır', async () => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: true, status: 'active' });
    mockActiveClients([trendyolClient()]);
    await new OrderQueueProducer().scheduleJobs();
    expect(EntitlementService.checkAccess).toHaveBeenCalledWith(1, 'engine');
    expect(allJobs().length).toBeGreaterThan(0);
  });

  it('bayrak true + allowed:false (ör. suspended): bu tenant için İŞ EKLENMEZ, diğer tenant\'lar etkilenmez', async () => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockImplementation(async (clientId: number) => (
      clientId === 1 ? { allowed: false, status: 'suspended' } : { allowed: true, status: 'active' }
    ));
    mockActiveClients([
      trendyolClient(1, 7),
      { clientId: 2, order: 8, integrations: [{ status: true, type: 'marketplace', integrationCode: 'n11' }] },
    ]);
    await new OrderQueueProducer().scheduleJobs();
    expect(new Set(allJobs().map((j: any) => j.data.clientId))).toEqual(new Set(['2']));
  });

  it.each(['suspended', 'canceled', 'expired', 'no_subscription'])('durum makinesi kablolaması: %s x allowed:false -> tur atlanır', async (status) => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: false, status });
    mockActiveClients([trendyolClient()]);
    await new OrderQueueProducer().scheduleJobs();
    expect(allJobs()).toHaveLength(0);
  });

  it.each(['trialing', 'active', 'past_due'])('durum makinesi kablolaması: %s x allowed:true -> iş eklenir', async (status) => {
    process.env.ENTITLEMENT_GUARD_ENABLED = 'true';
    (EntitlementService.checkAccess as any).mockResolvedValue({ allowed: true, status });
    mockActiveClients([trendyolClient()]);
    await new OrderQueueProducer().scheduleJobs();
    expect(allJobs().length).toBeGreaterThan(0);
  });
});

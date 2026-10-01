/**
 * TenantLifecycleService (ADR-0003 adım 8: yumuşak silme + purge). Yeni kod — TDD/tasarım testleri (characterization
 * DEĞİL; modül bu görevde ilk kez yazıldı). DB/Redis/ağ/R2 YOK: applicationDB `_fakes.ts`'teki in-memory sahte,
 * ClientDB/StorageService/OrderQueueProducer/IntegrationFactory tamamen mock. KRİTİK: aşağıdaki testler
 * `dropDatabase`/`deletePrefix`/gerçek silme ÇAĞRILARININ YALNIZCA MOCK olduğunu ve GERÇEK bir bağlantıda hiçbir
 * silme işleminin yürütülmediğini doğrular.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { makeCentralDb } from './_fakes';
import { AuditLogger } from '@services/audit/AuditLogger';
import {
  TenantLifecycleService,
  TENANT_LIFECYCLE_STATUS,
  DELETION_GRACE_PERIOD_DAYS,
} from '../../../src/operations/tenant/TenantLifecycleService';

const FIXED_NOW = new Date('2026-09-27T00:00:00.000Z');

function makeDeps(seedClients: any[]) {
  const central = makeCentralDb({ clients: seedClients });
  const clientDbDrop = jest.fn(async () => undefined);
  const getClientDB = jest.fn(async (order: number) => {
    const c = central.state.clients.find((d: any) => d.order === order);
    if (!c || c.status === 'PURGED') return undefined;
    return { dropDatabase: clientDbDrop } as any;
  });
  const deletePrefix = jest.fn(async (_clientId: string) => ({ image: { result: true }, archive: { result: true } }));
  const storage = { deletePrefix };
  const cancelJobsForClient = jest.fn(async () => 0);
  const orderQueueProducer = { cancelJobsForClient };
  const invalidateClientCache = jest.fn(async () => undefined);
  const clearIntegrationFactoryCache = jest.fn(() => undefined);

  const svc = new TenantLifecycleService({
    applicationDB: central.appDb,
    getClientDB,
    storage,
    orderQueueProducer,
    invalidateClientCache,
    clearIntegrationFactoryCache,
    now: () => FIXED_NOW,
  });

  return { svc, central, getClientDB, clientDbDrop, deletePrefix, cancelJobsForClient, invalidateClientCache, clearIntegrationFactoryCache };
}

const auditLog: any[] = [];
beforeEach(() => {
  auditLog.length = 0;
  AuditLogger.setSink(async (record) => { auditLog.push(record); });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { AuditLogger.setSink(undefined); jest.restoreAllMocks(); });

describe('TenantLifecycleService.requestDeletion (ADR F.20)', () => {
  it('ACTIVE tenant: DELETION_PENDING olur, deletionScheduledAt = now + 30 gün, requester kaydedilir', async () => {
    const { svc, central } = makeDeps([{ order: 1, status: 'ACTIVE', title: 'Mağaza 1' }]);
    const r = await svc.requestDeletion(1, { actorSub: 'owner-1', actor: 'owner' });

    expect(r.status).toBe(TENANT_LIFECYCLE_STATUS.DELETION_PENDING);
    const expected = new Date(FIXED_NOW.getTime() + DELETION_GRACE_PERIOD_DAYS * 86400000);
    expect(r.deletionScheduledAt).toEqual(expected);

    const doc = central.state.clients[0];
    expect(doc.status).toBe('DELETION_PENDING');
    expect(doc.deletionScheduledAt).toEqual(expected);
    expect(doc.deletionRequestedBy).toBe('owner-1');
  });

  it('bekleyen zamanlanmış sync işlerini iptal etmeye çalışır (best-effort; OrderQueueProducer mock)', async () => {
    const { svc, cancelJobsForClient } = makeDeps([{ order: 2, status: 'ACTIVE' }]);
    await svc.requestDeletion(2, { actorSub: 'owner-2', actor: 'owner' });
    expect(cancelJobsForClient).toHaveBeenCalledWith('2');
  });

  it('iptal çağrısı hata verirse talep yine BAŞARILI olur (best-effort, engellenmez)', async () => {
    const { svc, cancelJobsForClient, central } = makeDeps([{ order: 3, status: 'ACTIVE' }]);
    cancelJobsForClient.mockRejectedValueOnce(new Error('redis down'));
    const r = await svc.requestDeletion(3, { actorSub: 'o3', actor: 'owner' });
    expect(r.status).toBe(TENANT_LIFECYCLE_STATUS.DELETION_PENDING);
    expect(central.state.clients[0].status).toBe('DELETION_PENDING');
  });

  it('zaten DELETION_PENDING ise İDEMPOTENT: hata fırlatmaz, mevcut zamanlamayı döner, tekrar 30 gün eklemez', async () => {
    const existing = new Date('2026-10-01T00:00:00.000Z');
    const { svc } = makeDeps([{ order: 4, status: 'DELETION_PENDING', deletionScheduledAt: existing }]);
    const r = await svc.requestDeletion(4, { actorSub: 'o4', actor: 'owner' });
    expect(r.status).toBe('DELETION_PENDING');
    expect(r.deletionScheduledAt).toEqual(existing);
  });

  it('PROVISIONING/PURGING/PURGED gibi durumlarda 409 (silme talebi kabul edilmez)', async () => {
    for (const status of ['PROVISIONING', 'PURGING', 'PURGED', 'PROVISIONING_FAILED']) {
      const { svc } = makeDeps([{ order: 5, status }]);
      await expect(svc.requestDeletion(5, { actorSub: 'x', actor: 'owner' })).rejects.toMatchObject({ statusCode: 409 });
    }
  });

  it('tenant bulunamazsa 404', async () => {
    const { svc } = makeDeps([]);
    await expect(svc.requestDeletion(999, { actorSub: 'x', actor: 'owner' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('audit log: tenant.deletion.requested "ok" yazılır (tid=order, sub=actorSub)', async () => {
    const { svc } = makeDeps([{ order: 6, status: 'ACTIVE' }]);
    await svc.requestDeletion(6, { actorSub: 'owner-6', actor: 'owner' });
    expect(auditLog.some((r) => r.event === 'tenant.deletion.requested' && r.result === 'ok' && r.tid === 6 && r.sub === 'owner-6')).toBe(true);
  });
});

describe('TenantLifecycleService.cancelDeletion (ADR F.20: platformAdmin geri alabilir)', () => {
  it('DELETION_PENDING -> ACTIVE, deletionScheduledAt/deletionRequestedBy temizlenir', async () => {
    const { svc, central } = makeDeps([{ order: 1, status: 'DELETION_PENDING', deletionScheduledAt: new Date(), deletionRequestedBy: 'owner-1' }]);
    const r = await svc.cancelDeletion(1, { actorSub: 'platform-admin-1' });
    expect(r.status).toBe('ACTIVE');
    const doc = central.state.clients[0];
    expect(doc.status).toBe('ACTIVE');
    expect(doc.deletionScheduledAt).toBeUndefined();
    expect(doc.deletionRequestedBy).toBeUndefined();
  });

  it('DELETION_PENDING dışı durumda 409; tenant yoksa 404', async () => {
    const { svc } = makeDeps([{ order: 1, status: 'ACTIVE' }]);
    await expect(svc.cancelDeletion(1, { actorSub: 'x' })).rejects.toMatchObject({ statusCode: 409 });
    const { svc: svc2 } = makeDeps([]);
    await expect(svc2.cancelDeletion(1, { actorSub: 'x' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('TenantLifecycleService.purgeTenant (ADR F.21) — SIRALI adımlar, TAMAMI MOCK, GERÇEK silme YOK', () => {
  it('sırasıyla: PURGING işaretlenir -> ClientDB.dropDatabase (mock) -> R2 deletePrefix (mock) -> ApplicationDB koleksiyonları (mock deleteMany) -> BullMQ iptali (mock) -> cache temizliği (mock) -> mezar taşı', async () => {
    const { svc, central, getClientDB, clientDbDrop, deletePrefix, cancelJobsForClient, invalidateClientCache, clearIntegrationFactoryCache } = makeDeps([
      { order: 10, status: 'DELETION_PENDING', title: 'Silinecek Mağaza', dbConfig: { dbname: 'entegrasyonikClient_10' }, deletionScheduledAt: new Date('2026-09-01'), deletionRequestedBy: 'owner-10' },
    ]);

    const r = await svc.purgeTenant(10);

    expect(r.status).toBe(TENANT_LIFECYCLE_STATUS.PURGED);
    expect(getClientDB).toHaveBeenCalledWith(10);
    expect(clientDbDrop).toHaveBeenCalledTimes(1); // GERÇEK dropDatabase ASLA çağrılmadı — bu MOCK fonksiyon
    expect(deletePrefix).toHaveBeenCalledWith('10'); // GERÇEK R2 isteği YOK — mock
    expect(central.exportSignalModel.deleteMany).toHaveBeenCalledWith({ clientId: 10 });
    expect(central.exportFlagModel.deleteMany).toHaveBeenCalledWith({ clientId: '10' });
    expect(central.importJobModel.deleteMany).toHaveBeenCalledWith({ clientId: 10 });
    expect(central.operationLogModel.deleteMany).toHaveBeenCalledWith({ clientId: 10 });
    expect(central.deadLetterQueueModel.deleteMany).toHaveBeenCalledWith({ clientId: 10 });
    expect(central.ticketModel.deleteMany).toHaveBeenCalledWith({ clientId: 10 });
    expect(central.userModel.deleteMany).toHaveBeenCalledWith({ order: 10 });
    expect(cancelJobsForClient).toHaveBeenCalledWith('10');
    expect(invalidateClientCache).toHaveBeenCalledWith('10');
    expect(clearIntegrationFactoryCache).toHaveBeenCalledTimes(1);
  });

  it('mezar taşı: yalnızca order/status/purgedAt/purgedBy KALIR; title/dbConfig/deletionScheduledAt/deletionRequestedBy SİLİNİR', async () => {
    const { svc, central } = makeDeps([
      { order: 11, status: 'DELETION_PENDING', title: 'Gizli Mağaza Adı', dbConfig: { dbname: 'entegrasyonikClient_11' }, deletionScheduledAt: new Date(), deletionRequestedBy: 'owner-11', integrations: [{ x: 1 }] },
    ]);
    await svc.purgeTenant(11, { actorSub: 'platform-admin-9' });
    const doc = central.state.clients[0];
    expect(Object.keys(doc).sort()).toEqual(['order', 'purgedAt', 'purgedBy', 'status'].sort());
    expect(doc.status).toBe('PURGED');
    expect(doc.purgedAt).toEqual(FIXED_NOW);
    expect(doc.purgedBy).toBe('platform-admin-9');
    expect(doc.title).toBeUndefined();
    expect(doc.dbConfig).toBeUndefined();
  });

  it('actorSub verilmezse (otomatik purge işi) mezar taşındaki purgedBy ORİJİNAL silme talebini yapan kişiye (deletionRequestedBy) düşer', async () => {
    const { svc, central } = makeDeps([{ order: 12, status: 'DELETION_PENDING', deletionRequestedBy: 'owner-12' }]);
    await svc.purgeTenant(12); // opts.actorSub YOK
    expect(central.state.clients[0].purgedBy).toBe('owner-12');
  });

  it('tenant zaten PURGED ise İDEMPOTENT: hiçbir adım tekrar çalışmaz, hata fırlatmaz', async () => {
    const { svc, getClientDB, deletePrefix } = makeDeps([{ order: 13, status: 'PURGED', purgedAt: new Date(), purgedBy: 'x' }]);
    const r = await svc.purgeTenant(13);
    expect(r.status).toBe('PURGED');
    expect(getClientDB).not.toHaveBeenCalled();
    expect(deletePrefix).not.toHaveBeenCalled();
  });

  it('ACTIVE tenant purge edilemez (409): önce yumuşak silme talebi gerekir', async () => {
    const { svc } = makeDeps([{ order: 14, status: 'ACTIVE' }]);
    await expect(svc.purgeTenant(14)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('bir adım (ör. R2 silme) hata verirse: durum PURGE_FAILED olur, hata YUKARI fırlatılır, sonraki adımlar ÇALIŞMAZ', async () => {
    const { svc, central, deletePrefix, cancelJobsForClient } = makeDeps([{ order: 15, status: 'DELETION_PENDING' }]);
    deletePrefix.mockRejectedValueOnce(new Error('R2 down'));
    await expect(svc.purgeTenant(15)).rejects.toThrow('R2 down');
    expect(central.state.clients[0].status).toBe(TENANT_LIFECYCLE_STATUS.PURGE_FAILED);
    expect(cancelJobsForClient).not.toHaveBeenCalled(); // storage adımından SONRAKİ adımlar çalışmadı
  });

  it('PURGE_FAILED tenant tekrar purgeTenant ile denenebilir (telafi/idempotent): bu sefer başarılı olursa PURGED olur', async () => {
    const { svc, central, deletePrefix } = makeDeps([{ order: 16, status: 'PURGE_FAILED', purgeFailedStep: 'storage' }]);
    const r = await svc.purgeTenant(16);
    expect(r.status).toBe('PURGED');
    expect(deletePrefix).toHaveBeenCalledWith('16');
  });

  it('ClientDB zaten yoksa (undefined) dropDatabase ÇAĞRILMAZ ama purge yine devam eder (tenant DB'
    + ' zaten silinmiş/hiç kurulmamış olabilir)', async () => {
    const { svc, getClientDB, clientDbDrop } = makeDeps([{ order: 17, status: 'DELETION_PENDING' }]);
    getClientDB.mockResolvedValueOnce(undefined);
    const r = await svc.purgeTenant(17);
    expect(r.status).toBe('PURGED');
    expect(clientDbDrop).not.toHaveBeenCalled();
  });

  it('audit log: başarı "tenant.purge" ok; hata "tenant.purge" error + step meta', async () => {
    const { svc, deletePrefix } = makeDeps([{ order: 18, status: 'DELETION_PENDING' }, { order: 19, status: 'DELETION_PENDING' }]);
    await svc.purgeTenant(18);
    expect(auditLog.some((r) => r.event === 'tenant.purge' && r.result === 'ok' && r.tid === 18)).toBe(true);

    deletePrefix.mockRejectedValueOnce(new Error('fail'));
    await expect(svc.purgeTenant(19)).rejects.toThrow();
    expect(auditLog.some((r) => r.event === 'tenant.purge' && r.result === 'error' && r.tid === 19 && r.meta?.step === 'storage')).toBe(true);
  });
});

describe('TenantLifecycleService.runPurgeForDueTenants', () => {
  it('yalnızca deletionScheduledAt <= now olan DELETION_PENDING/PURGE_FAILED tenant\'ları purge eder', async () => {
    const past = new Date(FIXED_NOW.getTime() - 1000);
    const future = new Date(FIXED_NOW.getTime() + 1000);
    const { svc, central } = makeDeps([
      { order: 20, status: 'DELETION_PENDING', deletionScheduledAt: past },
      { order: 21, status: 'DELETION_PENDING', deletionScheduledAt: future }, // henüz süresi gelmedi
      { order: 22, status: 'ACTIVE' }, // aday değil
      { order: 23, status: 'PURGE_FAILED', deletionScheduledAt: past }, // telafi adayı
    ]);

    const results = await svc.runPurgeForDueTenants();

    expect(results.map((r) => r.order).sort()).toEqual([20, 23]);
    expect(results.every((r) => r.status === 'PURGED')).toBe(true);
    expect(central.state.clients.find((c: any) => c.order === 21).status).toBe('DELETION_PENDING'); // dokunulmadı
    expect(central.state.clients.find((c: any) => c.order === 22).status).toBe('ACTIVE'); // dokunulmadı
  });

  it('bir tenant\'ın purge\'ü hata verirse DİĞERLERİ yine denenir; sonuç listesinde hata raporlanır', async () => {
    const past = new Date(FIXED_NOW.getTime() - 1000);
    const { svc, deletePrefix } = makeDeps([
      { order: 30, status: 'DELETION_PENDING', deletionScheduledAt: past },
      { order: 31, status: 'DELETION_PENDING', deletionScheduledAt: past },
    ]);
    deletePrefix.mockImplementation(async (id: string) => {
      if (id === '30') throw new Error('boom');
      return { image: { result: true }, archive: { result: true } };
    });

    const results = await svc.runPurgeForDueTenants();
    const r30 = results.find((r) => r.order === 30);
    const r31 = results.find((r) => r.order === 31);
    expect(r30).toMatchObject({ status: 'PURGE_FAILED', error: 'boom' });
    expect(r31).toMatchObject({ status: 'PURGED' });
  });

  it('süresi geçmiş tenant yoksa boş liste döner, hiçbir şey çağrılmaz', async () => {
    const { svc, getClientDB } = makeDeps([{ order: 40, status: 'ACTIVE' }]);
    const results = await svc.runPurgeForDueTenants();
    expect(results).toEqual([]);
    expect(getClientDB).not.toHaveBeenCalled();
  });
});

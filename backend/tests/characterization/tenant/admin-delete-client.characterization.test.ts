/**
 * AdminService.deleteClient — ADR-0003 adım 8 (Karar F.20) davranış değişikliği.
 * Kaynak: backend/src/api/rpc/handlers/admin-service.ts (deleteClient). DB/Redis/ağ YOK; `_fakes.ts` in-memory sahte.
 *
 * ESKİ (ADR-0003 adım 8'den ÖNCE, artık GEÇERSİZ) davranış: yalnızca merkezi Clients + Users kayıtlarını GERÇEKTEN
 * SİLERDİ (hard delete); tenant DB, R2 nesneleri, ExportSignals/ExportFlag/ImportJobs/Tickets/OperationLogs/
 * DeadLetterQueue kayıtları ve ClientDB önbelleği kalırdı (DATA_ARCHITECTURE_AUDIT.md §8, L-11/C17). Bu davranış
 * `git log`'daki önceki commit'te sabitlenmişti; ADR-0003 adım 8 refactor'ü ile aşağıdaki [ADR-0003 adım 8] testleriyle
 * KASITLI OLARAK TERS ÇEVRİLDİ.
 *
 * YENİ davranış: `deleteClient` artık gerçek silme YAPMAZ; `TenantLifecycleService.requestDeletion`'a devrederek
 * yumuşak silme (askı + 30 gün) başlatır. Kalıcı silme (purge) ayrı işten (bkz. tenant-lifecycle-service.test.ts).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { makeCentralDb } from './_fakes';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: async () => appDbRef, getClientDB: async () => undefined } }));
jest.mock('@utils/decorator/cache', () => ({ nodeCache: { getStats: () => ({}), keys: () => [] } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => ({}) } }));
jest.mock('@services/storage/StorageService', () => ({ storageService: { deletePrefix: jest.fn(async () => ({})) } }));
jest.mock('@integration/engine/order/OrderQueueProducer', () => ({ OrderQueueProducer: jest.fn().mockImplementation(() => ({ cancelJobsForClient: jest.fn(async () => 0) })) }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: { clearCache: jest.fn() } }));
jest.mock('@database/client/ClientDB', () => ({ __esModule: true, default: { invalidate: jest.fn(async () => undefined) } }));

import AdminService from '../../../src/api/rpc/handlers/admin-service';
import { TENANT_LIFECYCLE_STATUS } from '../../../src/operations/tenant/TenantLifecycleService';

let appDbRef: any;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

async function make(request: any) {
  const s: any = new (AdminService as any)(undefined, request);
  await s.init();
  return s;
}

describe('[ADR-0003 adım 8] AdminService.deleteClient artık YUMUŞAK silme başlatır (gerçek silme YOK)', () => {
  it('targetClientId yoksa hata fırlatır, hiçbir şey değişmez', async () => {
    const central = makeCentralDb({ clients: [{ order: 1, status: 'ACTIVE' }] });
    appDbRef = central.appDb;
    await expect((await make({})).deleteClient()).rejects.toThrow('targetClientId gereklidir.');
    expect(central.state.clients[0].status).toBe('ACTIVE');
  });

  it('Clients kaydı SİLİNMEZ: status DELETION_PENDING olur, deletionScheduledAt = +30 gün, kayıt varlığını sürdürür', async () => {
    const central = makeCentralDb({ clients: [{ order: 7, status: 'ACTIVE', title: 'Silinecek' }] });
    appDbRef = central.appDb;
    const r = await (await make({ targetClientId: 7, principal: { sub: 'platform-admin-1' } })).deleteClient();

    expect(r.success).toBe(true);
    expect(r.status).toBe(TENANT_LIFECYCLE_STATUS.DELETION_PENDING);
    expect(central.state.clients).toHaveLength(1); // eskiden burada 0 olurdu (hard delete)
    expect(central.state.clients[0].status).toBe('DELETION_PENDING');
    expect(central.state.clients[0].deletionRequestedBy).toBe('platform-admin-1');
    const days = (new Date(r.deletionScheduledAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('merkezi Users kayıtları SİLİNMEZ (eskiden order eşleşenler hard-delete edilirdi)', async () => {
    const central = makeCentralDb({
      clients: [{ order: 8, status: 'ACTIVE' }],
      users: [{ email: 'a@x.com', order: 8 }, { email: 'b@x.com', order: 8 }],
    });
    appDbRef = central.appDb;
    await (await make({ targetClientId: 8 })).deleteClient();
    expect(central.state.users).toHaveLength(2); // dokunulmadı
  });

  it('tenant DB/R2/ExportSignals/ExportFlag/ImportJobs/Tickets/OperationLogs/DeadLetterQueue: yumuşak silmede HİÇBİRİNE dokunulmaz (yalnızca purge aşamasında)', async () => {
    const central = makeCentralDb({ clients: [{ order: 9, status: 'ACTIVE' }] });
    appDbRef = central.appDb;
    await (await make({ targetClientId: 9 })).deleteClient();
    for (const m of [central.exportSignalModel, central.exportFlagModel, central.importJobModel, central.operationLogModel, central.deadLetterQueueModel, central.ticketModel]) {
      expect(m.deleteMany).not.toHaveBeenCalled();
    }
  });

  it('mevcut olmayan targetClientId için 404 fırlatır (TenantLifecycleService.requestDeletion) — eskiden sessizce "başarılı" dönerdi', async () => {
    const central = makeCentralDb({ clients: [{ order: 1, status: 'ACTIVE' }] });
    appDbRef = central.appDb;
    await expect((await make({ targetClientId: 999 })).deleteClient()).rejects.toMatchObject({ statusCode: 404 });
  });

  it('zaten ACTIVE olmayan (ör. PROVISIONING) tenant için 409 (silme talebi kabul edilmez)', async () => {
    const central = makeCentralDb({ clients: [{ order: 2, status: 'PROVISIONING' }] });
    appDbRef = central.appDb;
    await expect((await make({ targetClientId: 2 })).deleteClient()).rejects.toMatchObject({ statusCode: 409 });
  });
});

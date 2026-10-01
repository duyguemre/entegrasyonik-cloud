import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Characterization: backend/src/api/rpc/handlers/admin-service.ts
// Odak: hiçbir metot userContext / rol kontrolü yapmaz (servis katmanında). BACKLOG C2.
// ADR-0001 adım 3 sonrası: HTTP'den bu servise artık token'sız ulaşılamaz (authenticate middleware 401; bkz. authenticate.test.ts/auth-pipeline.test.ts).
// [ADR-0001 adım 5] Yetki kısıtı SERVİS SINIFINDA DEĞİL, RunOperation politika katmanındadır (OPERATION_POLICY.AdminService = tamamı platformAdmin;
// kimlikli sıradan kullanıcı/owner bile 403 alır, servis örneklenmez: bkz. operation-policy.test.ts, auth-pipeline.test.ts).
// Bu dosya sınıfı DOĞRUDAN çağırır (RPC katmanı atlanır); sınıfın kendisi hâlâ rol kontrolü yapmaz — bu bilinçli: tek yetki noktası politika kaydı.
// Dolayısıyla buradaki [MEVCUT DAVRANIŞ] testleri değişmeden geçerlidir (servis iç davranışı).
// DB katmanı, Redis ve nodeCache jest ile mock'lanır. Değerler sahte/test amaçlıdır.
// [ADR-0003 adım 3/4] getClients/getClientIntegrations/updateClient/createClient davranışları kasıtlı olarak değişti (DTO/maskeleme, izinli alan
// listesi, TenantProvisioningService); ilgili testler `[ADR-0003 adım N]` ile ters çevrildi. Ayrıntılar: tests/characterization/tenant/.

const appDb: any = {};
const clientDbs: Record<number, any> = {};
const getClientDB = jest.fn(async (id: number) => clientDbs[id]);

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDb,
    getClientDB: (id: number) => getClientDB(id),
  },
}));
jest.mock('@utils/decorator/cache', () => ({
  nodeCache: { keys: () => ['t:7:trendyol:ctx.Svc.a:h1', 't:8:trendyol:ctx.Svc.a:h2', 'g:trendyol:ctx.Svc.b:h3'] },
  getCacheMetrics: () => ({ size: 3, maxKeys: 5000, inflight: 0, totals: { hit: 5, miss: 2, set: 2, evict: 0 }, families: { 'ctx.Svc.a': { hit: 5, miss: 1, set: 1, hitRatio: 5 / 6 } } }),
}));
const redisMock: any = { info: jest.fn(async () => 'redis_version:7.0\r\nused_memory_human:1M\r\nconnected_clients:2\r\nuptime_in_seconds:10\r\n'), llen: jest.fn(async () => 0), zcard: jest.fn(async () => 0) };
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => redisMock } }));

import AdminService from '../../../src/api/rpc/handlers/admin-service';
import Security from '../../../src/platform/core/security/Security';
import { makeCentralDb, makeTenantDb } from '../tenant/_fakes';

function chain(result: any) {
  const c: any = {};
  ['sort', 'skip', 'limit', 'select'].forEach(m => { c[m] = jest.fn(() => c); });
  c.lean = jest.fn(async () => result);
  c.exec = jest.fn(async () => result);
  return c;
}

let counterModel: any, integrationModel: any, clientModel: any, userModel: any, ticketModel: any, exportSignalModel: any, importJobModel: any, exportFlagModel: any, opLogModel: any;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined); // BaseApi: clientId yoksa uyarı basar (token'sız çağrı)
  getClientDB.mockClear();
  clientModel = {
    find: jest.fn(() => chain([{ order: 1, title: 'T1', dbConfig: { user: 'u', password: 'db-pass-placeholder' } }])),
    countDocuments: jest.fn(async () => 1),
    findOne: jest.fn(() => chain({ order: 4 })),
    create: jest.fn(async (p: any) => ({ _id: 'client-oid', ...p })),
    findOneAndUpdate: jest.fn(async (_f: any, u: any) => ({ updated: u })),
    deleteOne: jest.fn(async () => ({})),
    updateOne: jest.fn(async () => ({})), // [ADR-0003 adım 8] TenantLifecycleService.requestDeletion/cancelDeletion/purgeTenant
  };
  userModel = {
    create: jest.fn(async (p: any) => ({ _id: 'user-oid', ...p })),
    deleteMany: jest.fn(async () => ({})),
  };
  ticketModel = {
    find: jest.fn(() => chain([{ subject: 's' }])),
    countDocuments: jest.fn(async () => 1),
    create: jest.fn(async (p: any) => p),
    findByIdAndDelete: jest.fn(async () => ({})),
    findByIdAndUpdate: jest.fn(async () => ({})),
  };
  let seq = 0;
  counterModel = { findOneAndUpdate: jest.fn(async () => ({ sequence_value: ++seq })) };
  exportSignalModel = { aggregate: jest.fn(async () => []), distinct: jest.fn(async () => []), countDocuments: jest.fn(async () => 0), find: jest.fn(() => chain([])) };
  importJobModel = { aggregate: jest.fn(async () => []), distinct: jest.fn(async () => []), countDocuments: jest.fn(async () => 0) };
  exportFlagModel = { find: jest.fn(() => chain([{ queuedCount: 2 }, { queuedCount: 3 }])) };
  opLogModel = { aggregate: jest.fn(async () => []) };
  Object.assign(appDb, {
    getClientModel: () => clientModel,
    getUserModel: () => userModel,
    getTicketModel: () => ticketModel,
    getExportSignalModel: () => exportSignalModel,
    getImportJobModel: () => importJobModel,
    getExportFlagModel: () => exportFlagModel,
    getOperationLogModel: () => opLogModel,
    getCounterModel: () => counterModel, // [ADR-0021 D5] destek talep numarası atomik sayaçtan
  });
  integrationModel = { find: jest.fn(() => chain([{ code: 'trendyol', settings: { apiKey: 'key-placeholder' } }])), create: jest.fn(async () => ({})) };
  const catModel = { findOneAndUpdate: jest.fn(async () => ({})) };
  const targetDb = {
    getProductModel: () => ({ countDocuments: async () => 10 }),
    getVariantModel: () => ({ countDocuments: async () => 20 }),
    getOrderModel: () => ({ countDocuments: async () => 30 }),
    getClaimModel: () => ({ countDocuments: async () => 4 }),
    getUserModel: () => ({ countDocuments: async () => 5 }),
    getStatisticsModel: () => ({ findOne: () => chain({ totalOrderAmount: 100, totalReturnAmount: 7 }) }),
    getClientIntegrationModel: () => integrationModel,
    getCategoryModel: () => catModel,
    getBrandModel: () => catModel,
  };
  clientDbs[3] = targetDb; // hedef tenant
  clientDbs[5] = targetDb; // createClient sonrası (order 4+1)
});

/** Servisi verilen istekle, clientId ve userContext OLMADAN örnekler ve init eder (RunOperation'ın token'sız çağrısı). */
async function make(request: any = {}, clientId: any = undefined) {
  const svc: any = new AdminService(clientId, request);
  await svc.init();
  return svc;
}

// Farklı kimlik durumları: hiçbiri sonucu değiştirmemeli
const identities: Array<[string, any]> = [
  ['userContext YOK (token\'sız)', {}],
  ['userContext = sıradan tenant kullanıcısı (isGlobalAdmin=false)', { userContext: { order: 2, isGlobalAdmin: false, roleCode: 'ROLE_USER' } }],
];

describe('AdminService: kimliksiz çağrılabilirlik (BACKLOG C2)', () => {
  for (const [label, extra] of identities) {
    describe(label, () => {
      it('[ADR-0003 adım 4] getClients tüm tenant\'ları döner AMA dbConfig (parola dahil) yanıtta YOK (DTO) ve sorguda select ile hariç tutulur (eskiden dbConfig.password dönerdi)', async () => {
        const svc = await make({ ...extra });
        const r = await svc.getClients();
        expect(r.success).toBe(true);
        expect(r.clients[0]).toEqual({ order: 1, title: 'T1' });
        expect(JSON.stringify(r)).not.toContain('db-pass-placeholder');
        expect(clientModel.find).toHaveBeenCalledWith({}); // filtre değişmedi
        expect(clientModel.find.mock.results[0].value.select).toHaveBeenCalledWith(expect.stringContaining('-dbConfig'));
      });

      it('[MEVCUT DAVRANIŞ] getClientStats başka tenant\'ın DB\'sine targetClientId ile bağlanır', async () => {
        // BACKLOG C2
        const svc = await make({ ...extra, targetClientId: '3' });
        const r = await svc.getClientStats();
        expect(getClientDB).toHaveBeenCalledWith(3);
        expect(r.metrics).toEqual({ productCount: 10, variantCount: 20, orderCount: 30, claimCount: 4, userCount: 5, totalRevenue: 100, totalReturnAmount: 7 });
      });

      it('[ADR-0003 adım 4] getClientIntegrations başka tenant\'ın entegrasyon kayıtlarını döner AMA settings sırları maskelidir (eskiden apiKey düz metin)', async () => {
        const svc = await make({ ...extra, targetClientId: 3 });
        const r = await svc.getClientIntegrations();
        expect(r.integrations[0].settings.apiKey).toBe('sensitive');
        expect(JSON.stringify(r)).not.toContain('key-placeholder');
      });

      it('[ADR-0003 adım 3] updateClient: filtre { order: Number(targetClientId) }; yalnızca title/status/integrations $set edilir, dbConfig gövdede olsa da YOK SAYILIR (eskiden clientData AYNEN yazılırdı)', async () => {
        const clientData = { title: 'X', dbConfig: { url: 'mongodb://attacker.invalid/db' }, status: 'ACTIVE' };
        const svc = await make({ ...extra, targetClientId: '2', clientData });
        const r = await svc.updateClient();
        expect(clientModel.findOneAndUpdate).toHaveBeenCalledWith({ order: 2 }, { $set: { title: 'X', status: 'ACTIVE' } }, { new: true });
        expect(r.success).toBe(true);
      });

      it('[ADR-0003 adım 8] deleteClient: artık GERÇEK silme YAPMAZ; TenantLifecycleService.requestDeletion üzerinden yumuşak silme (DELETION_PENDING) başlatır (eskiden hard-delete: deleteOne+deleteMany)', async () => {
        clientModel.findOne.mockReturnValueOnce(chain({ order: 2, status: 'ACTIVE' }));
        const svc = await make({ ...extra, targetClientId: '2' });
        const r = await svc.deleteClient();
        expect(clientModel.deleteOne).not.toHaveBeenCalled(); // eskiden hard-delete ediyordu
        expect(userModel.deleteMany).not.toHaveBeenCalled();
        expect(getClientDB).not.toHaveBeenCalled();
        expect(clientModel.updateOne).toHaveBeenCalledWith(
          { order: 2 },
          { $set: expect.objectContaining({ status: 'DELETION_PENDING', deletionScheduledAt: expect.any(Date) }) },
        );
        expect(r).toEqual({ success: true, status: 'DELETION_PENDING', deletionScheduledAt: expect.any(Date) });
      });

      it('[MEVCUT DAVRANIŞ] deleteTicket / replyToTicket / createTicket kimliksiz çalışır', async () => {
        // BACKLOG C2
        expect((await (await make({ ...extra, ticketId: 't1' })).deleteTicket()).success).toBe(true);
        expect(ticketModel.findByIdAndDelete).toHaveBeenCalledWith('t1');

        const rep = await (await make({ ...extra, ticketId: 't1', content: 'merhaba' })).replyToTicket();
        expect(rep.success).toBe(true);

        const cr = await (await make({ ...extra, targetClientId: '9', subject: 's', content: 'c' })).createTicket();
        expect(cr.ticket.clientId).toBe(9);
      });

      it('[MEVCUT DAVRANIŞ] getGlobalMetrics / getTickets / getSystemHealth kimliksiz çalışır ve success:true döner', async () => {
        // BACKLOG C2
        expect((await (await make({ ...extra })).getGlobalMetrics()).success).toBe(true);
        expect((await (await make({ ...extra })).getTickets()).success).toBe(true);
        expect((await (await make({ ...extra })).getSystemHealth()).success).toBe(true);
      });

      it('[ADR-0003 adım 3] createClient: yeni tenant + sahip kullanıcı TenantProvisioningService ile oluşturulur (servis sınıfı hâlâ kimlik kontrolü yapmaz; yetki politika katmanında)', async () => {
        const central = makeCentralDb({ clients: [{ order: 4, clientId: 4, status: 'ACTIVE', dbConfig: { dbname: 'x4' } }] });
        Object.assign(appDb, central.appDb);
        clientDbs[5] = makeTenantDb().db;
        const svc = await make({ ...extra, clientData: { title: 'Yeni' }, userData: { name: 'Ad', surname: 'Soyad', email: 'n@x.y', password: 'dummy-pw' } });
        const r = await svc.createClient();
        expect(r.success).toBe(true);
        expect(central.clientModel.create).toHaveBeenCalledTimes(1);
        expect(central.userModel.create).toHaveBeenCalledTimes(1);
      });
    });
  }
});

describe('AdminService: gizli iş kuralları / ayrıntılar', () => {
  it('[MEVCUT DAVRANIŞ] getClients varsayılanları: page=1, limit=50, sort {order: 1}; skip 0', async () => {
    const svc = await make({});
    const r = await svc.getClients();
    expect(r).toMatchObject({ page: 1, limit: 50, total: 1 });
    const c = clientModel.find.mock.results[0].value;
    expect(c.sort).toHaveBeenCalledWith({ order: 1 });
    expect(c.skip).toHaveBeenCalledWith(0);
    expect(c.limit).toHaveBeenCalledWith(50);
  });

  it('[MEVCUT DAVRANIŞ] getClients search: name/title regex (küçük harfe çevrilmiş) + arama sayısal ise order eşleşmesi de eklenir', async () => {
    const svc = await make({ search: '12', page: 3, limit: 10 });
    await svc.getClients();
    expect(clientModel.find.mock.calls[0][0]).toEqual({
      $or: [{ name: { $regex: '12', $options: 'i' } }, { title: { $regex: '12', $options: 'i' } }, { order: 12 }],
    });
    const c = clientModel.find.mock.results[0].value;
    expect(c.skip).toHaveBeenCalledWith(20);
  });

  it('[ADR-0003 adım 4] getClients sortField beyaz listeden değilse order\'a düşer (eskiden istemci alan adı doğrudan kullanılırdı: dbConfig.password sıralama oracle\'ı)', async () => {
    const svc = await make({ sortField: 'dbConfig.password', sortOrder: -1 });
    await svc.getClients();
    expect(clientModel.find.mock.results[0].value.sort).toHaveBeenCalledWith({ order: -1 });
  });

  it('[MEVCUT DAVRANIŞ] getClientStats/getClientIntegrations targetClientId yoksa hata: "targetClientId gereklidir."', async () => {
    await expect((await make({})).getClientStats()).rejects.toThrow('targetClientId gereklidir.');
    await expect((await make({})).getClientIntegrations()).rejects.toThrow('targetClientId gereklidir.');
  });

  it('[MEVCUT DAVRANIŞ] getClientStats hedef DB bulunamazsa "Hedef dükkan veritabanı bulunamadı." hatası', async () => {
    await expect((await make({ targetClientId: 999 })).getClientStats()).rejects.toThrow('Hedef dükkan veritabanı bulunamadı.');
  });

  it('[MEVCUT DAVRANIŞ] getClientIntegrations filtresi { isActive: true } (kayıt şemasında "status" var; "isActive" alanının varlığı DOĞRULANMADI)', async () => {
    // Şüpheli: Client.integrations alanları "status" kullanıyor; ClientIntegration modelinde isActive olup olmadığı belirsiz. BACKLOG 'İncelenmesi gereken davranışlar' (1g-T1).
    const svc = await make({ targetClientId: 3 });
    await svc.getClientIntegrations();
    expect(integrationModel.find).toHaveBeenCalledWith({ isActive: true });
  });

  it('[MEVCUT DAVRANIŞ] getGlobalMetrics targetClientId varsa $match { clientId: Number }, yoksa {} (tüm tenant\'lar)', async () => {
    await (await make({})).getGlobalMetrics();
    expect(exportSignalModel.aggregate.mock.calls[0][0][0]).toEqual({ $match: {} });
    await (await make({ targetClientId: '7' })).getGlobalMetrics();
    expect(exportSignalModel.aggregate.mock.calls[1][0][0]).toEqual({ $match: { clientId: 7 } });
  });

  it('[MEVCUT DAVRANIŞ] getTickets: status "ALL" filtre eklemez; search + sayısal ise clientId eşleşmesi eklenir; varsayılan sıralama lastMessageAt -1', async () => {
    await (await make({ status: 'ALL', search: '5' })).getTickets();
    const q = ticketModel.find.mock.calls[0][0];
    expect(q.status).toBeUndefined();
    expect(q.$or).toEqual([
      { subject: { $regex: '5', $options: 'i' } },
      { ticketNumber: { $regex: '5', $options: 'i' } },
      { lastMessageSnippet: { $regex: '5', $options: 'i' } },
      { clientId: 5 },
    ]);
    expect(ticketModel.find.mock.results[0].value.sort).toHaveBeenCalledWith({ lastMessageAt: -1 });
  });

  it('[ADR-0021 2026-09-28 / D5] createTicket: eksik alanda hata; 6 haneli SIRALI ticketNumber (Counters atomik $inc; eskiden Math.random); durum OPEN, öncelik MEDIUM, tip GENERAL; ilk mesaj senderId "admin"; snippet 100 karakter', async () => {
    await expect((await make({ subject: 's' })).createTicket()).rejects.toThrow('Eksik bilgi: targetClientId, subject ve content gereklidir.');
    expect(counterModel.findOneAndUpdate).not.toHaveBeenCalled(); // eksik alanda sayaç harcanmaz
    const randomSpy = jest.spyOn(Math, 'random');
    const long = 'x'.repeat(150);
    const r = await (await make({ targetClientId: 1, subject: 's', content: long })).createTicket();
    expect(randomSpy).not.toHaveBeenCalled();
    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith({ _id: 'ticket_number' }, { $inc: { sequence_value: 1 } }, { new: true, upsert: true });
    expect(r.ticket.ticketNumber).toBe('100001');
    const r2 = await (await make({ targetClientId: 1, subject: 's', content: 'c' })).createTicket();
    expect(r2.ticket.ticketNumber).toBe('100002');
    randomSpy.mockRestore();
    expect(r.ticket.ticketNumber).toMatch(/^\d{6}$/);
    expect(r.ticket).toMatchObject({ status: 'OPEN', priority: 'MEDIUM', type: 'GENERAL', clientId: 1 });
    expect(r.ticket.lastMessageSnippet).toHaveLength(100);
    expect(r.ticket.messages[0]).toMatchObject({ senderType: 'SUPPORT', senderId: 'admin', senderName: 'Sistem Yöneticisi' });
  });

  it('[MEVCUT DAVRANIŞ] replyToTicket: admin cevabı ticket durumunu HER ZAMAN RESOLVED yapar; adminId/adminName istemciden gelir (kimlikten değil)', async () => {
    const svc = await make({ ticketId: 't1', content: 'c', adminId: 'kendi-uydurdugum-id', adminName: 'Sahte Admin' });
    await svc.replyToTicket();
    const [id, upd] = ticketModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('t1');
    expect(upd.$set.status).toBe('RESOLVED');
    expect(upd.$push.messages).toMatchObject({ senderId: 'kendi-uydurdugum-id', senderName: 'Sahte Admin' });
  });

  it('[MEVCUT DAVRANIŞ] replyToTicket ticketId/content yoksa hata; deleteTicket ticketId yoksa hata', async () => {
    await expect((await make({ ticketId: 't' })).replyToTicket()).rejects.toThrow('Eksik bilgi: ticketId ve content gereklidir.');
    await expect((await make({})).deleteTicket()).rejects.toThrow('ticketId gereklidir.');
  });

  it('[ADR-0003 adım 3] createClient: yeni order = Counters ile max(order)+1 (kayıt yoksa 1); istemci clientData\'sı modele YAYILMAZ (order/status sunucudan); parola bcrypt ile özetlenir; kullanıcı ROLE_OWNER/isGlobalAdmin=false zorlanır; Users.clientId = order (Number)', async () => {
    const central = makeCentralDb({ clients: [{ order: 4, clientId: 4, status: 'ACTIVE', dbConfig: { dbname: 'x4' } }] });
    Object.assign(appDb, central.appDb);
    clientDbs[5] = makeTenantDb().db;
    const svc = await make({
      clientData: { title: 'Y', order: 999, status: 'PASSIVE' },
      userData: { name: 'Ad', surname: 'Soyad', email: 'n@x.y', password: 'dummy-pw', isGlobalAdmin: true, roleCode: 'ROLE_ADMIN' },
    });
    await svc.createClient();
    const cp: any = central.clientModel.create.mock.calls[0][0];
    expect(cp).toMatchObject({ title: 'Y', order: 5, clientId: 5, status: 'PROVISIONING' }); // ACTIVE geçişi provisioning sonunda
    expect(cp.dbConfig.dbname).toBe('entegrasyonikClient_5');
    expect(cp.integrations).toHaveLength(8);
    expect(central.state.clients.find((c: any) => c.order === 5).status).toBe('ACTIVE');
    const up: any = central.userModel.create.mock.calls[0][0];
    expect(up).toMatchObject({ email: 'n@x.y', clientId: 5, order: 5, owner: true, isGlobalAdmin: false, roleCode: 'ROLE_OWNER' });
    expect(up.password).not.toBe('dummy-pw');
    expect(await Security.getInstance().comparePassword('dummy-pw', up.password)).toBe(true);

    const empty = makeCentralDb();
    Object.assign(appDb, empty.appDb);
    clientDbs[1] = clientDbs[5];
    await (await make({ clientData: {}, userData: { name: 'A', surname: 'B', email: 'p@x.y', password: 'dummy-pw2' } })).createClient();
    expect((empty.clientModel.create.mock.calls[0][0] as any).order).toBe(1);
  });

  it('[MEVCUT DAVRANIŞ - KORUNDU] createClient clientData/userData eksikse "Eksik bilgi (clientData veya userData)." hatası (artık ApplicationError 400)', async () => {
    await expect((await make({ clientData: {} })).createClient()).rejects.toThrow('Eksik bilgi (clientData veya userData).');
  });

  it('[MEVCUT DAVRANIŞ] updateClient/deleteClient targetClientId yoksa hata', async () => {
    await expect((await make({})).updateClient()).rejects.toThrow('targetClientId gereklidir.');
    await expect((await make({})).deleteClient()).rejects.toThrow('targetClientId gereklidir.');
  });

  it('[MEVCUT DAVRANIŞ] getSystemHealth: Redis + kuyruk özeti; export kuyruğu bekleyen = export flag queuedCount toplamı (2+3)', async () => {
    const r = await (await make({})).getSystemHealth();
    expect(r.infrastructure.redis).toEqual({ usedMemory: '1M', connectedClients: '2', uptime: '10', version: '7.0' });
    expect(r.infrastructure.queues.export.wait).toBe(5);
    expect(r.traffic.exports).toEqual([{ _id: 'QUEUED', count: 5 }]);
    expect(r.infrastructure.memoryCache.breakdown.map((b: any) => [b.name, b.count])).toEqual([['ctx.Svc.a', 2], ['ctx.Svc.b', 1]]);
    expect(r.infrastructure.memoryCache).toMatchObject({ hits: 5, misses: 2, keys: 3 });
    expect(JSON.stringify(r.infrastructure.memoryCache)).not.toMatch(/t:7|t:8|h1|h2|h3/);
  });

  it('[MEVCUT DAVRANIŞ] hatalar console.error ile loglanıp AYNEN yeniden fırlatılır', async () => {
    await expect((await make({})).deleteTicket()).rejects.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] get() boş (undefined) döner', async () => {
    expect(await (await make({})).get()).toBeUndefined();
  });
});

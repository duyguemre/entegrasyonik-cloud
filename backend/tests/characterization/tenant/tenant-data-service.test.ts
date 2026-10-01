/**
 * TenantDataService (ADR-0003 adım 8: requestDeletion/cancelDeletion/exportTenantData). Yeni servis — DB/Redis/ağ/R2
 * YOK: DatabaseManager, StorageService, bullmq.Queue, RedisService tamamen mock. GERÇEK bir R2/ağ isteği YAPILMAZ
 * (uploadExportArchive mock'lu); gerçek Redis'e bağlanılmaz (Queue/RedisService mock'lu, purge/lifecycle testlerindeki
 * gibi eager bağlantı riskine karşı).
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { GETTER_NAMES_FOR_TEST } from '../../../src/operations/tenant/exportCollections';

const appDb: any = {};
let clientDb: any;
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => clientDb },
}));
jest.mock('bullmq', () => ({ Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(async () => undefined), getJobs: jest.fn(async () => []) })) }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getConnectionConfig: jest.fn(() => ({ host: 'mock', port: 1 })) } }));

const uploadExportArchive = jest.fn(async (_clientId: string, _buf: Buffer, directory: string, fileName: string) => ({ result: true, key: `${directory}/${fileName}.zip` }));
jest.mock('@services/storage/StorageService', () => ({ storageService: { uploadExportArchive: (...a: any[]) => (uploadExportArchive as any)(...a) } }));

// archiver tamamen mock: GERÇEK zip binary'si üretilmez (gerekmiyor); `append` çağrıları (dosya adı + NDJSON içerik)
// doğrudan yakalanır — bu, sır maskeleme/sanitize zincirini zip formatını çözmeden doğrulamayı sağlar.
let appendCalls: Array<{ content: Buffer; name: string }>;
jest.mock('archiver', () => jest.fn(() => {
  const handlers: Record<string, Array<(...a: any[]) => void>> = {};
  const instance: any = {
    on: jest.fn((evt: string, cb: (...a: any[]) => void) => { (handlers[evt] ||= []).push(cb); return instance; }),
    append: jest.fn((content: Buffer, meta: { name: string }) => { appendCalls.push({ content, name: meta.name }); }),
    finalize: jest.fn(async () => {
      (handlers['data'] || []).forEach((cb) => cb(Buffer.from('MOCKZIP')));
      (handlers['end'] || []).forEach((cb) => cb());
    }),
  };
  return instance;
}));

import TenantDataService from '../../../src/api/rpc/handlers/tenant-data-service';
import Security from '../../../src/platform/core/security/Security';
import { TENANT_LIFECYCLE_STATUS } from '../../../src/operations/tenant/TenantLifecycleService';
import { verifyExportDownloadToken } from '../../../src/operations/tenant/exportDownloadToken';
import { captureLogs } from '../../helpers/logCapture';

function chain(result: any) {
  const c: any = {};
  c.lean = jest.fn(async () => result);
  return c;
}

function makeEmptyClientDb(overrides: Record<string, any> = {}) {
  const db: any = {};
  for (const name of GETTER_NAMES_FOR_TEST) {
    db[name] = jest.fn(() => ({ find: jest.fn(() => chain([])) }));
  }
  Object.assign(db, overrides);
  return db;
}

let userDoc: any;
let clientDoc: any;
let clientUpdateOneCalls: any[];

function setupAppDb(opts: { userPasswordHash?: string; clientTitle?: string; clientStatus?: string } = {}) {
  userDoc = opts.userPasswordHash ? { _id: 'u1', password: opts.userPasswordHash } : null;
  clientDoc = { order: 7, title: opts.clientTitle ?? 'Mağazam', status: opts.clientStatus ?? 'ACTIVE' };
  clientUpdateOneCalls = [];
  appDb.getUserModel = () => ({ findById: jest.fn(async () => userDoc) });
  appDb.getClientModel = () => ({
    findOne: jest.fn(() => chain(clientDoc)),
    updateOne: jest.fn(async (filter: any, update: any) => { clientUpdateOneCalls.push({ filter, update }); return {}; }),
  });
}

async function make(request: any, clientId: any = 7) {
  const svc: any = new (TenantDataService as any)(clientId, request);
  await svc.init();
  return svc;
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  clientDb = makeEmptyClientDb();
  uploadExportArchive.mockClear();
  appendCalls = [];
});
afterEach(() => { jest.restoreAllMocks(); });

describe('TenantDataService.requestDeletion (owner; parola + tenant adı doğrulaması)', () => {
  it('parola verilmezse 400, hiçbir model çağrılmaz', async () => {
    setupAppDb({ userPasswordHash: 'x' });
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' }, confirmTenantName: 'Mağazam' });
    await expect(svc.requestDeletion()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('yanlış parola 401', async () => {
    const hash = await Security.getInstance().hashPassword('dogru-parola');
    setupAppDb({ userPasswordHash: hash });
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' }, password: 'yanlis-parola', confirmTenantName: 'Mağazam' });
    await expect(svc.requestDeletion()).rejects.toMatchObject({ statusCode: 401 });
  });

  it('doğru parola ama yanlış/boş tenant adı 400', async () => {
    const hash = await Security.getInstance().hashPassword('dogru-parola');
    setupAppDb({ userPasswordHash: hash, clientTitle: 'Gerçek Mağaza Adı' });
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' }, password: 'dogru-parola', confirmTenantName: 'Yanlış Ad' });
    await expect(svc.requestDeletion()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('doğru parola + doğru tenant adı: DELETION_PENDING başlatılır (TenantLifecycleService.requestDeletion)', async () => {
    const hash = await Security.getInstance().hashPassword('dogru-parola');
    setupAppDb({ userPasswordHash: hash, clientTitle: 'Gerçek Mağaza Adı' });
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' }, password: 'dogru-parola', confirmTenantName: 'Gerçek Mağaza Adı' });
    const r = await svc.requestDeletion();
    expect(r.status).toBe(TENANT_LIFECYCLE_STATUS.DELETION_PENDING);
    expect(clientUpdateOneCalls[0].update.$set).toMatchObject({ status: 'DELETION_PENDING', deletionRequestedBy: 'u1' });
  });

  it('userContext.order yoksa 400 (tenant bağlamı olmayan çağrı)', async () => {
    setupAppDb({ userPasswordHash: 'x' });
    const svc = await make({ principal: { sub: 'u1' }, password: 'x', confirmTenantName: 'y' }, undefined);
    await expect(svc.requestDeletion()).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('TenantDataService.cancelDeletion (platformAdmin; targetClientId gövdeden)', () => {
  it('targetClientId yoksa 400', async () => {
    setupAppDb();
    const svc = await make({});
    await expect(svc.cancelDeletion()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('DELETION_PENDING tenant -> ACTIVE', async () => {
    setupAppDb({ clientStatus: 'DELETION_PENDING' });
    const svc = await make({ targetClientId: 7, principal: { sub: 'platform-admin-1' } });
    const r = await svc.cancelDeletion();
    expect(r).toEqual({ order: 7, status: 'ACTIVE' });
    expect(clientUpdateOneCalls[0].update.$set).toEqual({ status: 'ACTIVE' });
  });

  it('ACTIVE tenant için 409 (silme talebi yok)', async () => {
    setupAppDb({ clientStatus: 'ACTIVE' });
    const svc = await make({ targetClientId: 7 });
    await expect(svc.cancelDeletion()).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('TenantDataService.exportTenantData (owner) — GERÇEK R2/ağ YOK, tamamen mock', () => {
  it('clientDB yoksa 500 (userContext.order var ama constructor clientId tutarsız/yok — BaseApi.init() bu durumda fırlatmaz, servis kendi kontrol eder)', async () => {
    setupAppDb();
    clientDb = undefined as any;
    // clientId (constructor) BİLEREK undefined: BaseApi.initClientDB no-op olur (throw yok), clientDB tanımsız kalır;
    // exportTenantData KENDİ savunma kontrolüyle 500 fırlatır (userContext.order=7 ile "tenant bulunamadı" 400'ünden ayrışır).
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' } }, null);
    await expect(svc.exportTenantData()).rejects.toMatchObject({ statusCode: 500 });
  });

  it('userContext.order yoksa 400', async () => {
    setupAppDb();
    const svc = await make({ principal: { sub: 'u1' } }, undefined);
    await expect(svc.exportTenantData()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('başarılı: storageService.uploadExportArchive("exports/<order>" altına) çağrılır, 24 saat geçerli imzalı token döner', async () => {
    setupAppDb();
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' } });
    const before = Date.now();
    const r = await svc.exportTenantData();

    expect(r.success).toBe(true);
    expect(uploadExportArchive).toHaveBeenCalledTimes(1);
    const [clientIdArg, bufferArg, directoryArg] = uploadExportArchive.mock.calls[0];
    expect(clientIdArg).toBe('7');
    expect(Buffer.isBuffer(bufferArg)).toBe(true);
    expect(directoryArg).toBe('exports/7');

    const verified = verifyExportDownloadToken(r.downloadToken);
    expect(verified).not.toBeNull();
    expect(verified!.key).toBe(r.key);
    const ttlMs = r.expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThan(24.1 * 60 * 60 * 1000);
  });

  it('client_integration koleksiyonu maskClientIntegrationsDoc ile maskelenir: pazaryeri sırları arşiv içeriğinde AÇIK GEÇMEZ', async () => {
    setupAppDb();
    const rawDoc = { marketplace: [{ order: 1, status: true, code: 'trendyol', settings: { apiKey: 'GERÇEK-GİZLİ-ANAHTAR', test: 1 } }] };
    clientDb.getClientIntegrationModel = jest.fn(() => ({ find: jest.fn(() => chain([rawDoc])) }));

    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' } });
    await svc.exportTenantData();

    const call = appendCalls.find((c) => c.name === 'client_integrations.ndjson');
    expect(call).toBeDefined();
    const content = call!.content.toString('utf8');
    expect(content).not.toContain('GERÇEK-GİZLİ-ANAHTAR');
    expect(content).toContain('sensitive');
  });

  it('her koleksiyon için bir NDJSON dosyası appendlenir (client_integrations.ndjson, products.ndjson, orders.ndjson dahil 23 dosya; commission_overrides + stock_movements tenant verisi, PII yok)', async () => {
    setupAppDb();
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' } });
    await svc.exportTenantData();
    const names = appendCalls.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['commission_overrides.ndjson', 'stock_movements.ndjson', 'client_integrations.ndjson', 'products.ndjson', 'orders.ndjson', 'customers.ndjson', 'users.ndjson']));
    expect(names).toHaveLength(23);
  });

  it('tenant Users koleksiyonundaki bcrypt parola özeti son savunma hattı (sanitizeResponse) ile silinir', async () => {
    setupAppDb();
    clientDb.getUserModel = jest.fn(() => ({ find: jest.fn(() => chain([{ email: 'a@x.com', password: '$2b$10$gizlihash' }])) }));
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' } });
    await svc.exportTenantData();
    const usersFile = appendCalls.find((c) => c.name === 'users.ndjson')!.content.toString('utf8');
    expect(usersFile).not.toContain('gizlihash');
    expect(usersFile).toContain('a@x.com');
  });

  it('bir koleksiyon okunamazsa (DB hatası) o dosya boş geçilir, export yine BAŞARILI olur', async () => {
    setupAppDb();
    clientDb.getProductModel = jest.fn(() => ({ find: jest.fn(() => ({ lean: jest.fn(async () => { throw new Error('mongo down'); }) })) }));
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' } });
    const cap = captureLogs();
    try {
      const r = await svc.exportTenantData();
      expect(r.success).toBe(true);
      expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error', code: 'TENANT_EXPORT_FILE_SKIPPED', file: 'products.ndjson', err: 'mongo down' }));
    } finally { cap.restore(); }
  });

  it('yükleme başarısız olursa (uploadExportArchive result:false) hata fırlatılır', async () => {
    setupAppDb();
    uploadExportArchive.mockResolvedValueOnce({ result: false, error: 'R2 down' } as any);
    const svc = await make({ userContext: { order: 7 }, principal: { sub: 'u1' } });
    await expect(svc.exportTenantData()).rejects.toThrow('R2 down');
  });
});

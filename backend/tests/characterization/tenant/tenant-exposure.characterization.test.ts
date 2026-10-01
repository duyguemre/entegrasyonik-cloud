import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// CHARACTERIZATION (ADR-0003 adım 1; adım 3/4'te ters çevrildi): yanıtlarda sır ifşası ve mass-assignment.
//   AdminService.updateClient/getClients/getClientIntegrations, UserService.getUsers, IntegrationService.getClientIntegrations /
//   retrieveClient{Erp,Marketplace,Shipment,ECommerce}Settings / saveClient*Settings.
// Eski davranış `[MEVCUT DAVRANIŞ]` ile sabitlenmişti; kasıtlı değişiklikler `[ADR-0003 adım N]` ile işaretlidir.
// DB/Redis/ağ YOK; tüm değerler sentetiktir.

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

import AdminService from '../../../src/api/rpc/handlers/admin-service';
import UserService from '../../../src/api/rpc/handlers/user-service';
import IntegrationService from '../../../src/api/rpc/handlers/integration-service';
import { decryptSecrets } from '../../../src/platform/core/security/integrationSecrets';
import { isEncrypted } from '../../../src/utils/FieldCrypto';

// [ADR-0003 adım 6] Yazma yolunda sır alanları artık `enc:v1:` ile şifreli yazılır (eskiden düz metin). Testler yazılan değeri
// çözerek eski beklentiyi korur ve ayrıca ham değerin şifreli olduğunu doğrular.
const written = (mockCall: any[], path: string): any => mockCall[1].$set[path];

function chain(result: any) {
  const c: any = {};
  ['sort', 'skip', 'limit', 'select'].forEach(m => { c[m] = jest.fn(() => c); });
  c.lean = jest.fn(async () => result);
  c.exec = jest.fn(async () => result);
  return c;
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

async function make<T>(Cls: any, clientId: any, request: any): Promise<T> {
  const s: any = new Cls(clientId, request);
  await s.init();
  return s;
}

describe('AdminService.updateClient mass-assignment (BACKLOG C2/C6)', () => {
  let clientModel: any;
  beforeEach(() => {
    clientModel = { findOneAndUpdate: jest.fn(async (_f: any, u: any) => ({ _id: 'x', order: 2, clientId: 2, dbConfig: { dbname: 'gercek_db' }, archive: { accessKeyId: 'a', secretAccessKey: 's', bucketName: 'b' }, ...u.$set })) };
    Object.assign(appDb, { getClientModel: () => clientModel });
  });

  it('[ADR-0003 adım 3] YALNIZCA title/status/integrations güncellenir; order/clientId/dbConfig/archive/image gövdede olsa bile YOK SAYILIR (eskiden hepsi $set edilirdi)', async () => {
    const clientData = {
      title: 'T', status: 'ACTIVE', integrations: [{ integrationCode: 'n11', status: false }], order: 99, clientId: 99,
      dbConfig: { url: 'mongodb://attacker.invalid/x', user: 'u', password: 'p', dbname: 'baska_db', poolsize: 1 },
      archive: { bucketName: 'baska-bucket' }, image: { bucketName: 'baska-bucket' }, name: 'ad', lastSuccessfulOrderSync: 'x',
    };
    const r: any = await (await make<any>(AdminService, undefined, { targetClientId: '2', clientData })).updateClient();
    expect(clientModel.findOneAndUpdate).toHaveBeenCalledWith(
      { order: 2 },
      { $set: { title: 'T', status: 'ACTIVE', integrations: clientData.integrations } },
      { new: true },
    );
    expect(r.client.order).toBe(2);
    expect(r.client.dbConfig).toBeUndefined(); // yanıt DTO: dbConfig YOK
    expect(r.client.archive.secretAccessKey).toBeUndefined();
    expect(r.client.archive.accessKeyId).toBeUndefined();
  });

  it('[ADR-0003 adım 3] yaşam döngüsü durumları API\'den atanamaz: status yalnızca ACTIVE/PASSIVE (PROVISIONING_FAILED/DELETION_PENDING/PURGED yok sayılır)', async () => {
    for (const bad of ['PURGED', 'DELETION_PENDING', 'PROVISIONING', 'PROVISIONING_FAILED', { $ne: 1 }, 5]) {
      clientModel.findOneAndUpdate.mockClear();
      await (await make<any>(AdminService, undefined, { targetClientId: 2, clientData: { title: 'T', status: bad } })).updateClient();
      expect(clientModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { title: 'T' } });
    }
    await (await make<any>(AdminService, undefined, { targetClientId: 2, clientData: { status: 'PASSIVE' } })).updateClient();
    expect(clientModel.findOneAndUpdate.mock.calls.at(-1)[1]).toEqual({ $set: { status: 'PASSIVE' } });
  });

  it('clientData yoksa/nesne değilse boş $set (hiçbir alan yazılmaz)', async () => {
    await (await make<any>(AdminService, undefined, { targetClientId: 2 })).updateClient();
    await (await make<any>(AdminService, undefined, { targetClientId: 2, clientData: 'x' })).updateClient();
    expect(clientModel.findOneAndUpdate.mock.calls.map((c: any[]) => c[1])).toEqual([{ $set: {} }, { $set: {} }]);
  });
});

describe('AdminService.getClients (BACKLOG C2/C12)', () => {
  it('[ADR-0003 adım 4] dbConfig/depolama anahtarları ARTIK yanıtta yok (DTO) ve sorguda hiç çekilmez (select); eskiden dbConfig.password dönerdi', async () => {
    const row = { _id: 'c1', order: 1, clientId: 1, title: 'T', status: 'ACTIVE', dbConfig: { user: 'u', password: 'db-pass-placeholder', dbname: 'd' },
      archive: { code: 'A', accessKeyId: 'ak', secretAccessKey: 'sk', bucketName: 'b', endpoint: 'e', isActive: true }, provisioning: { ownerEmail: 'x@y.z' }, extra: 'z' };
    const clientModel: any = { find: jest.fn(() => chain([row])), countDocuments: jest.fn(async () => 1) };
    Object.assign(appDb, { getClientModel: () => clientModel });
    const r: any = await (await make<any>(AdminService, undefined, {})).getClients();
    expect(r.clients[0]).toEqual({ _id: 'c1', order: 1, clientId: 1, title: 'T', status: 'ACTIVE', archive: { code: 'A', bucketName: 'b', endpoint: 'e', isActive: true } });
    const c = clientModel.find.mock.results[0].value;
    expect(c.select).toHaveBeenCalledWith(expect.stringContaining('-dbConfig'));
  });

  it('[ADR-0003 adım 4] sortField beyaz listeden gelmiyorsa order\'a düşer (dbConfig.password sıralama oracle\'ı kapandı)', async () => {
    const clientModel: any = { find: jest.fn(() => chain([])), countDocuments: jest.fn(async () => 0) };
    Object.assign(appDb, { getClientModel: () => clientModel });
    await (await make<any>(AdminService, undefined, { sortField: 'dbConfig.password', sortOrder: -1 })).getClients();
    expect(clientModel.find.mock.results[0].value.sort).toHaveBeenCalledWith({ order: -1 });
    await (await make<any>(AdminService, undefined, { sortField: 'title', sortOrder: 1 })).getClients();
    expect(clientModel.find.mock.results[1].value.sort).toHaveBeenCalledWith({ title: 1 });
  });
});

describe('UserService.getUsers (BACKLOG C12)', () => {
  it('[ADR-0003 adım 4] pipeline beyaz liste $project içerir: parola özeti, kilit sayaçları ve tokenVersion projeksiyonla dışarıda bırakılır', async () => {
    const aggregate = jest.fn(async (..._a: any[]) => [{ totalNumberOfRecords: [{ count: 1 }], users: [{ _id: 'u1', email: 'a@x.y', name: 'A', surname: 'B', roleCode: 'ROLE_OWNER' }] }]);
    Object.assign(clientDb, { getUserModel: () => ({ aggregate }) });
    const r: any = await (await make<any>(UserService, 4, { pagination: { page: 1, limit: 10 } })).getUsers();
    const pipeline: any[] = aggregate.mock.calls[0][0];
    const project = pipeline[2].$facet.users.find((s: any) => s.$project).$project;
    for (const f of ['email', 'name', 'surname', 'roleCode', 'owner', 'isGlobalAdmin', 'createdAt']) expect(project[f]).toBe(1);
    for (const f of ['password', 'tokenVersion', 'failedLoginAttempts', 'lockUntil']) expect(project[f]).toBeUndefined();
    expect(Object.values(project).every(v => v === 1)).toBe(true); // yalnızca beyaz liste (dahil etme) — hariç tutma listesi değil
    expect(r.totalNumberOfRecords).toBe(1);
  });

  it('[DÜZELTİLDİ, 2026-09-29] sortBy artık pipeline\'a UYGULANIR ($sort, $skip/$limit\'ten ÖNCE facet içinde) — ÖNCEDEN sessizce yok sayılıyordu', async () => {
    const aggregate = jest.fn(async (..._a: any[]) => [{ totalNumberOfRecords: [], users: [] }]);
    Object.assign(clientDb, { getUserModel: () => ({ aggregate }) });
    const r: any = await (await make<any>(UserService, 4, { pagination: { page: 3, limit: 10 }, sortBy: { key: 'email', order: 'desc' } })).getUsers();
    const pipeline: any[] = aggregate.mock.calls[0][0];
    expect(pipeline[1]).toEqual({ $sort: { email: -1 } });
    expect(pipeline[2].$facet.users.slice(0, 2)).toEqual([{ $skip: 20 }, { $limit: 10 }]);
    expect(r).toEqual({ totalNumberOfRecords: 0, users: [] });
  });

  // [MM-08 / ADR-0021 aynı desen] `sortBy.key` DOĞRULAMASIZ bir nesneye yazılıyordu; OrderService.getOrders'ın
  // ADR-0021/GV-01 ile kapattığı AYNI riski kapatır.
  it('[DÜZELTME, MM-08, KASITLI TERS ÇEVRİLDİ] sortBy.key artık İZİN LİSTESİYLE doğrulanır — bilinmeyen alan 400 fırlatır (eskiden doğrulamasız bir nesneye yazılıyordu)', async () => {
    const aggregate = jest.fn(async (..._a: any[]) => [{ totalNumberOfRecords: [], users: [] }]);
    Object.assign(clientDb, { getUserModel: () => ({ aggregate }) });
    for (const key of ['$where', 'password', 'tokenVersion', { $gt: 1 }]) {
      const svc: any = await make<any>(UserService, 4, { pagination: { page: 1, limit: 10 }, sortBy: { key, order: 'asc' } });
      await expect(svc.getUsers()).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('[DÜZELTİLDİ, 2026-09-29] izin listesindeki alanlar 400 FIRLATMAZ; facet.users dalına artık DOĞRU $sort UYGULANIR', async () => {
    const aggregate = jest.fn(async (..._a: any[]) => [{ totalNumberOfRecords: [], users: [] }]);
    Object.assign(clientDb, { getUserModel: () => ({ aggregate }) });
    for (const key of ['_id', 'name', 'email', 'roleCode']) {
      aggregate.mockClear();
      const svc: any = await make<any>(UserService, 4, { pagination: { page: 1, limit: 10 }, sortBy: { key, order: 'asc' } });
      await expect(svc.getUsers()).resolves.toEqual({ totalNumberOfRecords: 0, users: [] });
      expect(aggregate.mock.calls[0][0][1]).toEqual({ $sort: { [key]: 1 } });
    }
  });
});

describe('IntegrationService: entegrasyon sırları yanıtlarda (BACKLOG C12)', () => {
  const settingsDoc = (): any => ({
    _id: 'ci1',
    marketplace: [
      { code: 'trendyol', order: 1, status: true, settings: { SELLERID: '123', APIKEY: 'k-trendyol', APISECRET: 's-trendyol', taxPercentage: 20 } },
      { code: 'n11', order: 3, status: true, settings: { APIKEY: '', APISECRET: 's-n11' } },
    ],
    shipment: [{ code: 'ptt', order: 5, status: true, settings: { key: 'musteri-no', secret: 'ptt-sifre' } }],
    ecommerce: [{ code: 'ideasoft', order: 6, status: true, settings: { storeName: 'magaza', key: 'client-id', secret: 'client-secret', auth: { access_token: 'at', refresh_token: 'rt', createdAt: 1 } } }],
    erp: [{ code: 'bizimhesap', order: 7, status: true, settings: { key: 'bh-key', secret: 'bh-secret' } }],
    einvoice: [{ code: 'gib', order: 8, status: true, settings: { username: 'vkn', password: 'gib-sifre' } }],
  });
  let ciModel: any;
  const lean = (v: any): any => { const c: any = { lean: jest.fn(async () => v) }; c.sort = jest.fn(() => c); return c; };
  beforeEach(() => {
    ciModel = { findOne: jest.fn(() => lean(settingsDoc())), findOneAndUpdate: jest.fn(async () => settingsDoc()) };
    Object.assign(clientDb, { getClientIntegrationModel: () => ciModel });
  });

  it('[ADR-0003 adım 4] getClientIntegrations: TÜM tiplerde sır alanları "sensitive" (değer varsa) / "" (yoksa); sır olmayanlar aynen; ideasoft key (client_id) hariç', async () => {
    const r: any = await (await make<any>(IntegrationService, 4, {})).getClientIntegrations();
    expect(r.marketplace[0].settings).toEqual({ SELLERID: '123', APIKEY: 'sensitive', APISECRET: 'sensitive', taxPercentage: 20 });
    expect(r.marketplace[1].settings).toEqual({ APIKEY: '', APISECRET: 'sensitive' }); // boş değer '' kalır
    expect(r.shipment[0].settings).toEqual({ key: 'sensitive', secret: 'sensitive' });
    expect(r.ecommerce[0].settings).toEqual({ storeName: 'magaza', key: 'client-id', secret: 'sensitive', auth: { access_token: 'sensitive', refresh_token: 'sensitive', createdAt: 1 } });
    expect(r.erp[0].settings).toEqual({ key: 'sensitive', secret: 'sensitive' });
    expect(r.einvoice[0].settings).toEqual({ username: 'vkn', password: 'sensitive' });
    expect(JSON.stringify(r)).not.toMatch(/k-trendyol|s-trendyol|ptt-sifre|client-secret|"at"|"rt"|bh-secret|gib-sifre/);
  });

  it('[ADR-0003 adım 4] getClientIntegrations kaynak nesneyi DEĞİŞTİRMEZ (kopya maskelenir)', async () => {
    const doc = settingsDoc();
    ciModel.findOne = jest.fn(() => lean(doc));
    await (await make<any>(IntegrationService, 4, {})).getClientIntegrations();
    expect(doc.marketplace[0].settings.APIKEY).toBe('k-trendyol');
  });

  it.each([
    ['retrieveClientMarketplaceSettings', 'marketplace', 'trendyol', { SELLERID: '123', APIKEY: 'sensitive', APISECRET: 'sensitive', taxPercentage: 20 }],
    ['retrieveClientErpSettings', 'erp', 'bizimhesap', { key: 'sensitive', secret: 'sensitive' }],
    ['retrieveClientShipmentSettings', 'shipment', 'ptt', { key: 'sensitive', secret: 'sensitive' }],
  ] as Array<[string, string, string, any]>)('[ADR-0003 adım 4] %s sır alanlarını maskeler', async (op, type, code, expected) => {
    const doc = settingsDoc();
    ciModel.findOne = jest.fn(() => lean({ [type]: [doc[type].find((x: any) => x.code === code)] }));
    const r: any = await (await make<any>(IntegrationService, 4, { integrationCode: code }))[op]();
    expect(r.settings).toEqual(expected);
    expect(r.code).toBe(code);
  });

  it('[ADR-0003 adım 4] kayıt yoksa null döner (davranış korundu)', async () => {
    ciModel.findOne = jest.fn(() => lean({}));
    expect(await (await make<any>(IntegrationService, 4, { integrationCode: 'x' })).retrieveClientErpSettings()).toBeNull();
  });

  it('[ADR-0003 adım 4] retrieveClientECommerceSettings TÜM sır alanlarını maskeler (auth.* dahil; eskiden yalnız auth.access_token/refresh_token); ideasoft key düz kalır (FE yetkilendirme URL\'i client_id ister)', async () => {
    const doc = settingsDoc();
    ciModel.findOne = jest.fn(() => lean({ ecommerce: [doc.ecommerce[0]] }));
    const r: any = await (await make<any>(IntegrationService, 4, { integrationCode: 'ideasoft' })).retrieveClientECommerceSettings();
    expect(r.settings.auth.access_token).toBe('sensitive');
    expect(r.settings.auth.refresh_token).toBe('sensitive'); // FE: refresh_token == 'sensitive' => YETKİLİ (sözleşme korundu)
    expect(r.settings.secret).toBe('sensitive');
    expect(r.settings.key).toBe('client-id');
  });

  it('[ADR-0003 adım 4] saveClientMarketplaceSettings: gelen "sensitive" mevcut değeri KORUR, "" temizler, başka değer yeni sırdır; dönen kayıt maskelidir', async () => {
    const existing = { marketplace: [settingsDoc().marketplace[0]] };
    // ilk findOne = mevcut ayar okuması (resolveSettingsForWrite), findOneAndUpdate = güncel belge
    ciModel.findOne = jest.fn(() => lean(existing));
    const incoming = { code: 'trendyol', settings: { SELLERID: '123', APIKEY: 'sensitive', APISECRET: 'yeni-sir', taxPercentage: 18 } };
    const r: any = await (await make<any>(IntegrationService, 4, { clientMarketplace: incoming })).saveClientMarketplaceSettings();
    expect(ciModel.findOne).toHaveBeenCalledWith({ 'marketplace.code': 'trendyol' }, { marketplace: { $elemMatch: { code: 'trendyol' } }, _id: 0 });
    const call1: any[] = ciModel.findOneAndUpdate.mock.calls[0];
    expect(call1[0]).toEqual({ 'marketplace.code': 'trendyol' });
    expect(call1[2]).toEqual({ upsert: false, returnDocument: 'after' });
    const w1 = written(call1, 'marketplace.$.settings');
    // [ADR-0003 adım 6] ham değerler ŞİFRELİ (eskiden düz 'yeni-sir'); korunan eski düz metin de yazarken şifrelenir (fırsatçı göç)
    expect(isEncrypted(w1.APIKEY)).toBe(true);
    expect(isEncrypted(w1.APISECRET)).toBe(true);
    expect(JSON.stringify(w1)).not.toMatch(/yeni-sir|k-trendyol/);
    expect(decryptSecrets(w1, 'trendyol')).toEqual({ SELLERID: '123', APIKEY: 'k-trendyol', APISECRET: 'yeni-sir', taxPercentage: 18 });
    expect(r.settings.APISECRET).toBe('sensitive'); // dönen kayıtta sır YOK
    expect(JSON.stringify(r)).not.toMatch(/s-trendyol|yeni-sir/);

    ciModel.findOneAndUpdate.mockClear();
    await (await make<any>(IntegrationService, 4, { clientMarketplace: { code: 'trendyol', settings: { APIKEY: '', APISECRET: 'sensitive' } } })).saveClientMarketplaceSettings();
    expect(decryptSecrets(written(ciModel.findOneAndUpdate.mock.calls[0], 'marketplace.$.settings'), 'trendyol')).toEqual({ APIKEY: '', APISECRET: 's-trendyol' }); // '' şifrelenmez (temizleme)
    expect(written(ciModel.findOneAndUpdate.mock.calls[0], 'marketplace.$.settings').APIKEY).toBe('');
  });

  it('[ADR-0003 adım 4] saveClientMarketplaceSettings: gövdede hiç olmayan mevcut sır alanı KORUNUR (FE sürümünden bağımsız veri kaybı yok)', async () => {
    ciModel.findOne = jest.fn(() => lean({ marketplace: [settingsDoc().marketplace[0]] }));
    await (await make<any>(IntegrationService, 4, { clientMarketplace: { code: 'trendyol', settings: { SELLERID: '999' } } })).saveClientMarketplaceSettings();
    expect(decryptSecrets(written(ciModel.findOneAndUpdate.mock.calls[0], 'marketplace.$.settings'), 'trendyol')).toEqual({ SELLERID: '999', APIKEY: 'k-trendyol', APISECRET: 's-trendyol' });
  });

  it('[ADR-0003 adım 4] saveClientErpSettings / saveClientShipmentSettings aynı sentinel sözleşmesini uygular', async () => {
    ciModel.findOne = jest.fn(() => lean({ erp: [settingsDoc().erp[0]] }));
    ciModel.findOneAndUpdate = jest.fn(async () => settingsDoc());
    const r: any = await (await make<any>(IntegrationService, 4, { clientErp: { code: 'bizimhesap', settings: { key: 'sensitive', secret: 'yeni' } } })).saveClientErpSettings();
    expect(decryptSecrets(written(ciModel.findOneAndUpdate.mock.calls[0], 'erp.$.settings'), 'bizimhesap')).toEqual({ key: 'bh-key', secret: 'yeni' });
    expect(isEncrypted(written(ciModel.findOneAndUpdate.mock.calls[0], 'erp.$.settings').secret)).toBe(true);
    expect(r.settings).toEqual({ key: 'sensitive', secret: 'sensitive' });

    ciModel.findOne = jest.fn(() => lean({ shipment: [settingsDoc().shipment[0]] }));
    await (await make<any>(IntegrationService, 4, { clientShipment: { code: 'ptt', settings: { key: 'sensitive', secret: 'sensitive' } } })).saveClientShipmentSettings();
    expect(decryptSecrets(written(ciModel.findOneAndUpdate.mock.calls[1], 'shipment.$.settings'), 'ptt')).toEqual({ key: 'musteri-no', secret: 'ptt-sifre' });
  });

  it('[ADR-0003 adım 4] saveClientECommerceSettings: auth silinir (davranış korundu); "sensitive" sır alanı $set EDİLMEZ (mevcut korunur); yeni/boş değer yazılır', async () => {
    ciModel.findOneAndUpdate = jest.fn(() => ({ lean: async () => settingsDoc() }));
    const settings = { storeName: 'm', key: 'client-id', secret: 'sensitive', auth: { access_token: 'hack' } };
    const r: any = await (await make<any>(IntegrationService, 4, { clientECommerce: { code: 'ideasoft', settings } })).saveClientECommerceSettings();
    expect(ciModel.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $set: { 'ecommerce.$.settings.storeName': 'm', 'ecommerce.$.settings.key': 'client-id' },
    });
    expect(r.settings.secret).toBe('sensitive');
    expect(r.settings.auth.refresh_token).toBe('sensitive');

    await (await make<any>(IntegrationService, 4, { clientECommerce: { code: 'ideasoft', settings: { secret: 'yeni-secret' } } })).saveClientECommerceSettings();
    const eSecret = ciModel.findOneAndUpdate.mock.calls[1][1].$set['ecommerce.$.settings.secret'];
    expect(isEncrypted(eSecret)).toBe(true); // [ADR-0003 adım 6] şifreli yazılır (eskiden düz 'yeni-secret')
    expect(decryptSecrets({ secret: eSecret }, 'ideasoft')).toEqual({ secret: 'yeni-secret' });
    await (await make<any>(IntegrationService, 4, { clientECommerce: { code: 'ideasoft', settings: { secret: '' } } })).saveClientECommerceSettings();
    expect(ciModel.findOneAndUpdate.mock.calls[2][1]).toEqual({ $set: { 'ecommerce.$.settings.secret': '' } });
  });
});

describe('AdminService.getClientIntegrations (başka tenant)', () => {
  it('[ADR-0003 adım 4] entegrasyon kayıtlarının settings sırları maskelidir (eskiden düz metin)', async () => {
    Object.assign(clientDb, { getClientIntegrationModel: () => ({ find: () => chain([{ code: 'trendyol', settings: { APIKEY: 'k', APISECRET: 's', SELLERID: '1' } }]) }) });
    const r: any = await (await make<any>(AdminService, undefined, { targetClientId: 3 })).getClientIntegrations();
    expect(r.integrations[0].settings).toEqual({ APIKEY: 'sensitive', APISECRET: 'sensitive', SELLERID: '1' });
  });
});

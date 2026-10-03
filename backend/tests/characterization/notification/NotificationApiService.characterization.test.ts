/**
 * CHARACTERIZATION: NotificationService (backend/src/api/services/notification-service.ts) -- ADR-0016 B-R-T3 + ADR-0029 NB4.
 *
 * DIKKAT: `@services/notification/NotificationService` (event-bus tuketicisi, Notification.characterization.test.ts) ile AYNI
 * ADLI ama FARKLI sinif: bu dosya REST katmaninin cagirdigi API servisini kapsar. DB/Redis/ag YOK; `clientDB` sahte model.
 *
 * NB4 (N-01) ile davranis BILINCLI degisti: eski testler "sorguda userId yok / tum tenant" davranisini sabitliyordu (denetim N-01);
 * artik HER sorgu `userId = ctx.actor.sub` ile suzulur. Yanit SEKILLERI korunur (yalniz ekleme: nextCursor).
 * Gercek Mongo semantigi: tests/mongo-semantics/notifications/notificationApi.mongoSemantics.test.ts.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

import NotificationService from '@api/services/notification-service';

const UID = 'aaaaaaaaaaaaaaaaaaaaaaa1';
let notificationModel: any;

function chainableFind(result: any[]) {
  return {
    sort: jest.fn(function (this: any) { return this; }),
    limit: jest.fn(function (this: any) { return this; }),
    lean: jest.fn(async () => result),
  };
}

function makeService(body: any = {}, clientId: any = 42, principal: any = { sub: UID, tid: 42 }) {
  const svc: any = new NotificationService(clientId, { ...body, principal, userContext: {} });
  svc.clientDB = { getNotificationModel: () => notificationModel };
  return svc;
}

const OWN_READ = { $or: [{ userId: UID }, { userId: { $exists: false } }] };

beforeEach(() => {
  notificationModel = {
    find: jest.fn(() => chainableFind([{ _id: 'n1', userId: UID, title: 'Stok uyarısı' }])),
    countDocuments: jest.fn(async () => 3),
    updateMany: jest.fn(async () => ({ matchedCount: 2, modifiedCount: 2 })),
    aggregate: jest.fn(async () => []),
  };
});
afterEach(() => { jest.restoreAllMocks(); });

describe('NotificationService.get', () => {
  it('varsayılan: limit=20 (+1 sonraki-sayfa denemesi); filtre kullanıcı kapsamlı; yanıt şekli {result,data,unreadCount}+nextCursor', async () => {
    const res = await makeService({}).get();
    expect(notificationModel.find).toHaveBeenCalledWith({ isDeleted: false, ...OWN_READ, isArchived: { $ne: true } });
    const chain = notificationModel.find.mock.results[0].value;
    expect(chain.sort).toHaveBeenCalledWith({ _id: -1 });
    expect(chain.limit).toHaveBeenCalledWith(21);
    expect(res).toEqual({ result: true, data: [{ _id: 'n1', userId: UID, title: 'Stok uyarısı' }], unreadCount: 3, nextCursor: null });
  });

  it('onlyUnread=true: yalnız KENDİ belgeleri (eski userId\'siz kayıtlar okunmamış sayılmaz) + isRead=false', async () => {
    await makeService({ onlyUnread: true }).get();
    expect(notificationModel.find).toHaveBeenCalledWith({ isDeleted: false, userId: UID, isArchived: { $ne: true }, isRead: false });
  });

  it('limit clampLimit ile sınırlanır (geçersiz -> 20, imleçsiz üst sınır 200, imleçli 50)', async () => {
    await makeService({ limit: 0 }).get();
    expect(notificationModel.find.mock.results[0].value.limit).toHaveBeenCalledWith(21);
    await makeService({ limit: 99999 }).get();
    expect(notificationModel.find.mock.results[1].value.limit).toHaveBeenCalledWith(201);
    await makeService({ limit: 99999, cursor: new ObjectId().toString() }).get();
    expect(notificationModel.find.mock.results[2].value.limit).toHaveBeenCalledWith(51);
  });

  it('unreadCount bayraklardan/limitten bağımsız: yalnız kendi okunmamış, silinmemiş, arşivsiz', async () => {
    await makeService({ onlyUnread: true, limit: 5 }).get();
    expect(notificationModel.countDocuments).toHaveBeenCalledWith({ userId: UID, isRead: false, isDeleted: false, isArchived: { $ne: true } });
  });

  it('DB hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('mongo down');
    notificationModel.find.mockReturnValue({ sort: jest.fn(function (this: any) { return this; }), limit: jest.fn(function (this: any) { return this; }), lean: jest.fn(async () => { throw err; }) });
    await expect(makeService({}).get()).rejects.toBe(err);
  });

  it('kimliksiz istek (principal yok) -> 401 (fail-closed)', async () => {
    await expect(makeService({}, 42, null).get()).rejects.toMatchObject({ statusCode: 401 });
    expect(notificationModel.find).not.toHaveBeenCalled();
  });
});

describe('NotificationService.markAsRead', () => {
  it('all=false + notificationIds: filtre {userId, isDeleted:false, _id:{$in}}', async () => {
    const id1 = new ObjectId().toString();
    const id2 = new ObjectId().toString();
    const res = await makeService({ notificationIds: [id1, id2] }).markAsRead();
    const [query, update] = notificationModel.updateMany.mock.calls[0];
    expect(query).toEqual({ userId: UID, isDeleted: false, _id: { $in: [new ObjectId(id1), new ObjectId(id2)] } });
    expect(update.$set.isRead).toBe(true);
    expect(update.$set.readAt).toBeInstanceOf(Date);
    expect(res).toEqual({ result: true, message: 'Okundu olarak işaretlendi.' });
  });

  it('notificationIds boş/tanımsız: DB\'ye dokunmadan {result:false, message:"ID listesi boş."}', async () => {
    for (const ids of [undefined, []]) {
      notificationModel.updateMany.mockClear();
      const res = await makeService({ notificationIds: ids }).markAsRead();
      expect(res).toEqual({ result: false, message: 'ID listesi boş.' });
      expect(notificationModel.updateMany).not.toHaveBeenCalled();
    }
  });

  it('all=true: notificationIds yok sayılır; YALNIZ kendi okunmamış/arşivsiz belgeleri', async () => {
    await makeService({ all: true, notificationIds: ['ignored'] }).markAsRead();
    expect(notificationModel.updateMany.mock.calls[0][0]).toEqual({ userId: UID, isDeleted: false, isRead: false, isArchived: { $ne: true } });
  });

  it('geçersiz ObjectId -> 400 (N-12), updateMany çağrılmaz', async () => {
    await expect(makeService({ notificationIds: ['not-a-valid-id'] }).markAsRead()).rejects.toMatchObject({ statusCode: 400 });
    expect(notificationModel.updateMany).not.toHaveBeenCalled();
  });

  it('kimlik verildi ama hiçbiri kendi belgem değil (matched=0) -> 404', async () => {
    notificationModel.updateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    await expect(makeService({ notificationIds: [new ObjectId().toString()] }).markAsRead()).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updateMany hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('write conflict');
    notificationModel.updateMany.mockRejectedValue(err);
    await expect(makeService({ all: true }).markAsRead()).rejects.toBe(err);
  });
});

describe('NotificationService.delete', () => {
  it('notificationIds: filtre {userId, _id:{$in}} (isDeleted filtresi yok: tekrar silme idempotent)', async () => {
    const id1 = new ObjectId().toString();
    const res = await makeService({ notificationIds: [id1] }).delete();
    const [query, update] = notificationModel.updateMany.mock.calls[0];
    expect(query).toEqual({ userId: UID, _id: { $in: [new ObjectId(id1)] } });
    expect(update).toEqual({ $set: { isDeleted: true } });
    expect(res).toEqual({ result: true, message: 'Bildirimler silindi.' });
  });

  it('notificationIds boş: DB\'ye dokunmadan {result:false}', async () => {
    const res = await makeService({ notificationIds: [] }).delete();
    expect(res).toEqual({ result: false, message: 'ID listesi boş.' });
    expect(notificationModel.updateMany).not.toHaveBeenCalled();
  });

  it('N-01: all=true TÜM tenant\'ı DEĞİL yalnız çağıranın belgelerini siler (query userId içerir, boş {} DEĞİL)', async () => {
    await makeService({ all: true }).delete();
    const [query, update] = notificationModel.updateMany.mock.calls[0];
    expect(query).toEqual({ userId: UID, isDeleted: false });
    expect(update).toEqual({ $set: { isDeleted: true } });
  });

  it('başka kullanıcının kimliği (matched=0) -> 404', async () => {
    notificationModel.updateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    await expect(makeService({ notificationIds: [new ObjectId().toString()] }).delete()).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updateMany hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('boom');
    notificationModel.updateMany.mockRejectedValue(err);
    await expect(makeService({ all: true }).delete()).rejects.toBe(err);
  });
});

describe('NotificationService.getUnreadCount', () => {
  it('kendi {isRead:false,isDeleted:false,arşivsiz} sayılır; {result:true, unreadCount}', async () => {
    const res = await makeService({}).getUnreadCount();
    expect(notificationModel.countDocuments).toHaveBeenCalledWith({ userId: UID, isRead: false, isDeleted: false, isArchived: { $ne: true } });
    expect(res).toEqual({ result: true, unreadCount: 3 });
  });

  it('byCategory: kategori kırılımı eklenir', async () => {
    notificationModel.aggregate.mockResolvedValue([{ _id: 'order', n: 2 }, { _id: null, n: 1 }]);
    const res = await makeService({ byCategory: true }).getUnreadCount();
    expect(res).toEqual({ result: true, unreadCount: 3, unreadByCategory: { order: 2, uncategorized: 1 } });
  });

  it('countDocuments hatası olduğu gibi yeniden fırlatılır', async () => {
    const err = new Error('boom');
    notificationModel.countDocuments.mockRejectedValue(err);
    await expect(makeService({}).getUnreadCount()).rejects.toBe(err);
  });
});

describe('NotificationService: tenant izolasyonu (iki farklı tenant)', () => {
  it('her tenant yalnızca KENDİ clientDB\'sindeki bildirimleri görür', async () => {
    const tenantANotifs = [{ _id: 'a1', userId: UID, title: 'A bildirimi' }];
    const tenantBNotifs = [{ _id: 'b1', userId: UID, title: 'B bildirimi' }];

    const svcA: any = new NotificationService(4, { principal: { sub: UID, tid: 4 } });
    svcA.clientDB = { getNotificationModel: () => ({ find: jest.fn(() => chainableFind(tenantANotifs)), countDocuments: jest.fn(async () => 0) }) };

    const svcB: any = new NotificationService(7, { principal: { sub: UID, tid: 7 } });
    svcB.clientDB = { getNotificationModel: () => ({ find: jest.fn(() => chainableFind(tenantBNotifs)), countDocuments: jest.fn(async () => 0) }) };

    const resA = await svcA.get();
    const resB = await svcB.get();

    expect(resA.data).toEqual(tenantANotifs);
    expect(resB.data).toEqual(tenantBNotifs);
    expect(JSON.stringify(resA)).not.toMatch(/B bildirimi/);
    expect(JSON.stringify(resB)).not.toMatch(/A bildirimi/);
  });
});

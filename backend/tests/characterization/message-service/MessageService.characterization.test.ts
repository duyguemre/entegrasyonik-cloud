/**
 * CHARACTERIZATION: MessageService (backend/src/api/rpc/handlers/message-service.ts)
 *
 * Kapsam: get, getMessages, replyMessage, markAsRead, deleteMessage, bulkDeleteMessages
 * (tenant/clientId kullanımı dahil).
 *
 * DatabaseManager/IntegrationFactory jest.mock ile değiştirilir; clientDB sahte model nesneleridir.
 * DB/Redis/ağ/pazaryeri YOK; veriler sentetiktir. Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut davranış
 * sabitlenir (Protokol 13).
 *
 * Tenant izolasyonu (PLATFORM_BASELINE B2): MessageService içindeki HİÇBİR sorgu clientId ile
 * filtrelemez; izolasyon tamamen `this.clientDB` seçimine dayanır (order-service/claim-service ile
 * AYNI mimari desen). `clientId` yalnızca `new IntegrationFactory(Number(this.currentClientId))` için
 * kullanılır (replyMessage).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ObjectId } from 'mongodb';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import MessageService from '@api/rpc/handlers/message-service';
import IntegrationFactory from '@integration/modules/IntegrationFactory';

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;

// bulkDeleteMessages `new ObjectId(id)` çağırır -> geçerli hex string gerekir.
const MSG_ID_1 = new ObjectId().toString();
const MSG_ID_2 = new ObjectId().toString();

let messageModel: any;
let instance: any;
let getInstance: jest.Mock<any>;

function makeService(request: any, clientId: any = 42, clientDb?: any) {
  const svc: any = new MessageService(clientId, request);
  svc.clientDB = clientDb || { getMessageModel: jest.fn(() => messageModel) };
  return svc;
}

function makeMessage(over: any = {}) {
  return { _id: 'm1', integrationCode: 'trendyol', externalMessageId: 'EXT-M1', status: 'UNREAD', ...over };
}

beforeEach(() => {
  messageModel = {
    aggregate: jest.fn(async () => [{ metadata: [], data: [] }]),
    findById: jest.fn(async () => makeMessage()),
    findByIdAndUpdate: jest.fn(async () => ({ _id: 'm1', updated: true })),
    findByIdAndDelete: jest.fn(async () => ({ _id: 'm1' })),
    deleteMany: jest.fn(async () => ({ deletedCount: 2 })),
  };
  instance = { answerMessage: jest.fn(async () => true) };
  getInstance = jest.fn(async () => instance);
  factoryCtor.mockReset();
  factoryCtor.mockImplementation(() => ({ getInstance }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe('MessageService.get', () => {
  it('[MEVCUT DAVRANIŞ] henüz uygulanmamış: undefined döner', async () => {
    await expect(makeService({}).get()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
describe('MessageService.getMessages', () => {
  const pipelineOf = () => messageModel.aggregate.mock.calls[0][0] as any[];

  it('[MEVCUT DAVRANIŞ] filtresiz çağrı: $match {}, varsayılan sort {date:-1}, sayfa1/limit15', async () => {
    await makeService({}).getMessages();
    const pipe = pipelineOf();
    expect(pipe[0]).toEqual({ $match: {} });
    const facet = (pipe[2] as any).$facet;
    expect(pipe[1]).toEqual({ $sort: { date: -1 } }); // [DB-02] $sort artık $facet dışında
    expect(facet.data[0]).toEqual({ $skip: 0 });
    expect(facet.data[1]).toEqual({ $limit: 15 });
  });

  it('[MEVCUT DAVRANIŞ] sortBy.order yalnızca "asc" ise 1 verir, HER BAŞKA değer (ör. eksik, "garbage") -1 verir (customer-service\'in AKSİNE order-service ile AYNI kural)', async () => {
    await makeService({ sortBy: { key: 'status', order: 'asc' } }).getMessages();
    expect(pipelineOf()[1]).toEqual({ $sort: { status: 1 } });

    messageModel.aggregate.mockClear();
    await makeService({ sortBy: { key: 'status', order: 'garbage' } }).getMessages();
    expect(pipelineOf()[1]).toEqual({ $sort: { status: -1 } });
  });

  it('[MEVCUT DAVRANIŞ] globalSearch: 5 alanda KAÇIŞLI case-insensitive $regex ile $or kurulur (text/answer/rejectionReason/context.orderNumber/context.productName, GV-01)', async () => {
    await makeService({ searchMessageForm: { data: { globalSearch: '(a+)+$' } } }).getMessages();
    const re = { $regex: '\\(a\\+\\)\\+\\$', $options: 'i' };
    expect(pipelineOf()[0]).toEqual({
      $match: { $or: [{ text: re }, { answer: re }, { rejectionReason: re }, { 'context.orderNumber': re }, { 'context.productName': re }] },
    });
  });

  it('[MEVCUT DAVRANIŞ] status/type eşitlikle eklenir; integrationCodes $in ile eklenir (boş dizi eklenmez)', async () => {
    await makeService({ searchMessageForm: { data: { status: 'ANSWERED', type: 'QUESTION', integrationCodes: ['n11'] } } }).getMessages();
    expect(pipelineOf()[0]).toEqual({ $match: { status: 'ANSWERED', type: 'QUESTION', integrationCode: { $in: ['n11'] } } });

    messageModel.aggregate.mockClear();
    await makeService({ searchMessageForm: { data: { integrationCodes: [] } } }).getMessages();
    expect(pipelineOf()[0]).toEqual({ $match: {} });
  });

  it('[MEVCUT DAVRANIŞ] isRejected yalnızca AÇIKÇA true/false ise filtreye eklenir; null/undefined/başka değer YOK SAYILIR', async () => {
    await makeService({ searchMessageForm: { data: { isRejected: false } } }).getMessages();
    expect(pipelineOf()[0]).toEqual({ $match: { isRejected: false } });

    messageModel.aggregate.mockClear();
    await makeService({ searchMessageForm: { data: { isRejected: null } } }).getMessages();
    expect(pipelineOf()[0]).toEqual({ $match: {} });
  });

  it('[MEVCUT DAVRANIŞ] tarih filtresi `date` alanında; endDate SUNUCU YEREL saatinde 23:59:59.999\'a çekilir (order-service\'in Europe/Istanbul-farkındalı $gte/$lte hesaplamasından FARKLI, TZ-yardımcısı KULLANMAZ)', async () => {
    await makeService({ searchMessageForm: { data: { startDate: '2026-01-01', endDate: '2026-01-10' } } }).getMessages();
    const d = (pipelineOf()[0] as any).$match.date;
    expect(d.$gte).toEqual(new Date('2026-01-01'));
    // setHours(23,59,59,999) SÜREÇ YEREL saatinde çalışır; TZ'den bağımsız olarak getHours() AYNI değeri okur (deterministik).
    expect(d.$lte.getHours()).toBe(23);
    expect(d.$lte.getMinutes()).toBe(59);
    expect(d.$lte.getSeconds()).toBe(59);
    expect(d.$lte.getMilliseconds()).toBe(999);
  });

  it('[MEVCUT DAVRANIŞ] yalnızca startDate verilirse $lte yok, sadece $gte', async () => {
    await makeService({ searchMessageForm: { data: { startDate: '2026-01-01' } } }).getMessages();
    const d = (pipelineOf()[0] as any).$match.date;
    expect(Object.keys(d)).toEqual(['$gte']);
  });

  it('[MEVCUT DAVRANIŞ] Customers/Orders $lookup + $unwind (preserveNullAndEmptyArrays) HER ZAMAN pipeline\'a eklenir', async () => {
    await makeService({}).getMessages();
    const facetData = (pipelineOf()[2] as any).$facet.data;
    expect(facetData[2]).toEqual({ $lookup: { from: 'Customers', localField: 'customerId', foreignField: '_id', as: 'customer' } });
    expect(facetData[3]).toEqual({ $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } });
    expect(facetData[4]).toEqual({ $lookup: { from: 'Orders', localField: 'orderId', foreignField: '_id', as: 'order' } });
    expect(facetData[5]).toEqual({ $unwind: { path: '$order', preserveNullAndEmptyArrays: true } });
  });

  it('[MEVCUT DAVRANIŞ] toplam/sayfa/mesaj sonucu $facet çıktısından hesaplanır', async () => {
    messageModel.aggregate.mockResolvedValue([{ metadata: [{ total: 31 }], data: [{ _id: 'a' }] }]);
    await expect(makeService({ pagination: { page: 3, limit: 15 } }).getMessages()).resolves.toEqual({
      totalNumberOfRecords: 31, totalNumberOfPages: 3, messages: [{ _id: 'a' }],
    });
  });

  it('[MEVCUT DAVRANIŞ] pagination üst sınırı: limit>200 -> 200; limit<1 -> varsayılan 15; page<1 -> 1', async () => {
    await makeService({ pagination: { page: 0, limit: 100000 } }).getMessages();
    const facet = (pipelineOf()[2] as any).$facet;
    expect(facet.data[0]).toEqual({ $skip: 0 });
    expect(facet.data[1]).toEqual({ $limit: 200 });
  });

  it('[MEVCUT DAVRANIŞ] hata console.error ile loglanıp olduğu gibi yeniden fırlatılır', async () => {
    messageModel.aggregate.mockRejectedValue(new Error('agg fail'));
    await expect(makeService({}).getMessages()).rejects.toThrow('agg fail');
    expect(console.error).toHaveBeenCalled();
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] $match içinde clientId/tenant alanı YOK; izolasyon clientDB seçimine bağlıdır', async () => {
    await makeService({ searchMessageForm: { data: { status: 'ANSWERED' } } }, 99).getMessages();
    expect(JSON.stringify(pipelineOf()[0])).not.toMatch(/clientId/i);
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] iki farklı tenant/clientDB ile çağrıldığında her biri YALNIZ kendi clientDB\'sinin modelini çağırır (çapraz-tenant sızıntısı yok)', async () => {
    const messageModelA = { aggregate: jest.fn(async () => [{ metadata: [], data: [] }]) };
    const messageModelB = { aggregate: jest.fn(async () => [{ metadata: [], data: [] }]) };
    const clientDbA = { getMessageModel: jest.fn(() => messageModelA) };
    const clientDbB = { getMessageModel: jest.fn(() => messageModelB) };

    await makeService({}, 1, clientDbA).getMessages();
    await makeService({}, 2, clientDbB).getMessages();

    expect(messageModelA.aggregate).toHaveBeenCalledTimes(1);
    expect(messageModelB.aggregate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('MessageService.replyMessage', () => {
  it('[MEVCUT DAVRANIŞ] messageId veya answerText eksikse hata; hiçbir model/pazaryeri çağrılmaz', async () => {
    await expect(makeService({ messageId: 'm1' }).replyMessage()).rejects.toThrow('messageId ve answerText gereklidir.');
    await expect(makeService({ answerText: 'cevap' }).replyMessage()).rejects.toThrow('messageId ve answerText gereklidir.');
    expect(messageModel.findById).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] mesaj bulunamazsa hata; pazaryeri çağrılmaz', async () => {
    messageModel.findById.mockResolvedValue(null);
    await expect(makeService({ messageId: 'x', answerText: 'a' }).replyMessage()).rejects.toThrow('Mesaj bulunamadı.');
    expect(factoryCtor).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] entegrasyon answerMessage DESTEKLEMİYORSA (metod yok) hata fırlatılır (mesaj integrationCode içerir)', async () => {
    instance.answerMessage = undefined;
    await expect(makeService({ messageId: 'm1', answerText: 'a' }).replyMessage()).rejects.toThrow('trendyol için answerMessage metodu desteklenmiyor.');
  });

  it('[MEVCUT DAVRANIŞ] mutlu yol (trendyol): pazaryeri true dönerse status=ANSWERED, answer/answeredAt/isRejected=false/rejectionReason=null set edilir', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    const res = await makeService({ messageId: 'm1', answerText: 'Merhaba' }).replyMessage();

    expect(factoryCtor).toHaveBeenCalledWith(42);
    expect(getInstance).toHaveBeenCalledWith('trendyol');
    expect(instance.answerMessage).toHaveBeenCalledWith('EXT-M1', 'Merhaba');

    const [id, update, opts] = messageModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('m1');
    expect(opts).toEqual({ new: true });
    expect(update.$set).toEqual({ status: 'ANSWERED', answer: 'Merhaba', answeredAt: new Date('2026-05-01T10:00:00Z'), isRejected: false, rejectionReason: null });
    expect(res).toEqual({ success: true, message: { _id: 'm1', updated: true } });
  });

  it('[MEVCUT DAVRANIŞ] pazarama\'da nextStatus WAITING_APPROVAL olur (cevap onay bekler), diğer platformlarda ANSWERED', async () => {
    messageModel.findById.mockResolvedValue(makeMessage({ integrationCode: 'pazarama' }));
    await makeService({ messageId: 'm1', answerText: 'a' }).replyMessage();
    expect(messageModel.findByIdAndUpdate.mock.calls[0][1].$set.status).toBe('WAITING_APPROVAL');
  });

  it.each([[false], [null], [undefined], [0], ['']])('[MEVCUT DAVRANIŞ] pazaryeri %p (falsy) döndürürse "Pazar yeri mesajı cevaplamayı reddetti." hatası, DB güncellenmez', async (val) => {
    instance.answerMessage.mockResolvedValue(val);
    await expect(makeService({ messageId: 'm1', answerText: 'a' }).replyMessage()).rejects.toThrow('Pazar yeri mesajı cevaplamayı reddetti.');
    expect(messageModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] pazaryeri istisnası olduğu gibi yayılır (console.error ile loglanır); DB güncellenmez', async () => {
    instance.answerMessage.mockRejectedValue(new Error('market down'));
    await expect(makeService({ messageId: 'm1', answerText: 'a' }).replyMessage()).rejects.toThrow('market down');
    expect(console.error).toHaveBeenCalled();
    expect(messageModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
describe('MessageService.markAsRead', () => {
  it('[MEVCUT DAVRANIŞ] messageId yoksa hata; hiçbir model çağrılmaz', async () => {
    await expect(makeService({}).markAsRead()).rejects.toThrow('messageId gereklidir.');
    expect(messageModel.findById).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] mesaj bulunamazsa hata', async () => {
    messageModel.findById.mockResolvedValue(null);
    await expect(makeService({ messageId: 'x' }).markAsRead()).rejects.toThrow('Mesaj bulunamadı.');
  });

  it('[MEVCUT DAVRANIŞ] status UNREAD ise READ yapılır ve GÜNCELLENMİŞ DOKÜMAN `message` alanında döner', async () => {
    const res = await makeService({ messageId: 'm1' }).markAsRead();
    expect(messageModel.findByIdAndUpdate).toHaveBeenCalledWith('m1', { $set: { status: 'READ' } }, { new: true });
    expect(res).toEqual({ success: true, message: { _id: 'm1', updated: true } });
  });

  it('[MEVCUT DAVRANIŞ - BULGU] status UNREAD DEĞİLSE güncelleme YAPILMAZ ve `message` alanı bu kez BİR DOKÜMAN DEĞİL, DÜZ METİN döner (aynı yanıt şeklinin iki farklı tip taşıması: obje | string)', async () => {
    messageModel.findById.mockResolvedValue(makeMessage({ status: 'ANSWERED' }));
    const res = await makeService({ messageId: 'm1' }).markAsRead();
    expect(messageModel.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, message: 'Mesaj durumu değiştirilmeye uygun değil (zaten okunmuş veya işlem bekliyor olabilir).' });
    expect(typeof res.message).toBe('string');
  });

  it('[MEVCUT DAVRANIŞ] hata console.error ile loglanıp yeniden fırlatılır', async () => {
    messageModel.findById.mockRejectedValue(new Error('db down'));
    await expect(makeService({ messageId: 'm1' }).markAsRead()).rejects.toThrow('db down');
    expect(console.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
describe('MessageService.deleteMessage', () => {
  it('[MEVCUT DAVRANIŞ] messageId yoksa hata; model çağrılmaz', async () => {
    await expect(makeService({}).deleteMessage()).rejects.toThrow('messageId gereklidir.');
    expect(messageModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] mutlu yol: findByIdAndDelete çağrılır, sonucu KONTROL EDİLMEZ (bulunamasa da) HER ZAMAN {success:true} döner', async () => {
    await expect(makeService({ messageId: 'm1' }).deleteMessage()).resolves.toEqual({ success: true, message: 'Mesaj silindi.' });
    expect(messageModel.findByIdAndDelete).toHaveBeenCalledWith('m1');
  });

  it('[MEVCUT DAVRANIŞ - BULGU] silinecek mesaj YOKSA (findByIdAndDelete null döner) YİNE DE {success:true} döner (var/yok ayrımı yapılmaz)', async () => {
    messageModel.findByIdAndDelete.mockResolvedValue(null);
    await expect(makeService({ messageId: 'yok' }).deleteMessage()).resolves.toEqual({ success: true, message: 'Mesaj silindi.' });
  });

  it('[MEVCUT DAVRANIŞ] DB hatası console.error ile loglanıp yeniden fırlatılır', async () => {
    messageModel.findByIdAndDelete.mockRejectedValue(new Error('db down'));
    await expect(makeService({ messageId: 'm1' }).deleteMessage()).rejects.toThrow('db down');
    expect(console.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
describe('MessageService.bulkDeleteMessages', () => {
  it.each([[undefined], [null], ['not-an-array']])('[MEVCUT DAVRANIŞ] messageIds=%p -> hata fırlatılır', async (ids) => {
    await expect(makeService({ messageIds: ids }).bulkDeleteMessages()).rejects.toThrow('messageIds listesi gereklidir.');
  });

  it('[MEVCUT DAVRANIŞ] boş dizi HATA FIRLATMAZ: deleteMany {_id:{$in:[]}} ile çağrılır, "0 mesaj başarıyla silindi." döner', async () => {
    const res = await makeService({ messageIds: [] }).bulkDeleteMessages();
    expect(messageModel.deleteMany).toHaveBeenCalledWith({ _id: { $in: [] } });
    expect(res).toEqual({ success: true, message: '0 mesaj başarıyla silindi.' });
  });

  it('[MEVCUT DAVRANIŞ] mutlu yol: her id `new ObjectId(...)`ye çevrilip $in ile deleteMany çağrılır; mesaj sayısı REQUEST uzunluğundan (deleteMany sonucundan DEĞİL) hesaplanır', async () => {
    messageModel.deleteMany.mockResolvedValue({ deletedCount: 1 }); // yalnızca 1 gerçekten silinse bile...
    const res = await makeService({ messageIds: [MSG_ID_1, MSG_ID_2] }).bulkDeleteMessages();
    const [filter] = messageModel.deleteMany.mock.calls[0];
    expect(filter._id.$in.map((o: any) => o.toString())).toEqual([MSG_ID_1, MSG_ID_2]);
    expect(res).toEqual({ success: true, message: '2 mesaj başarıyla silindi.' }); // istek uzunluğu kullanılıyor
  });

  it('[MEVCUT DAVRANIŞ] geçersiz bir ObjectId formatı senkron olarak fırlar; console.error ile loglanıp yeniden fırlatılır (deleteMany hiç çağrılmaz)', async () => {
    await expect(makeService({ messageIds: ['not-a-valid-object-id'] }).bulkDeleteMessages()).rejects.toThrow();
    expect(messageModel.deleteMany).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] DB hatası console.error ile loglanıp yeniden fırlatılır', async () => {
    messageModel.deleteMany.mockRejectedValue(new Error('db down'));
    await expect(makeService({ messageIds: [MSG_ID_1] }).bulkDeleteMessages()).rejects.toThrow('db down');
    expect(console.error).toHaveBeenCalled();
  });
});

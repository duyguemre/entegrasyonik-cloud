/**
 * CHARACTERIZATION: OrderService (backend/src/api/rpc/handlers/order-service.ts)
 *
 * Kapsam: getOrders, cancelOrder, bulkCancelOrder, approveOrder, bulkApproveOrder, updateOrderStatus,
 * markAsPrinted, getOrderRejectionReasons, getOrderDashboardInsights, tenant (clientId) kullanımı.
 *
 * DatabaseManager ve IntegrationFactory jest.mock ile değiştirilir; clientDB sahte model nesneleridir.
 * DB/Redis/ağ/pazaryeri YOK; veriler sentetiktir. Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut davranış sabitlenir.
 *
 * Tenant izolasyonu: OrderService içindeki HİÇBİR sorgu clientId ile filtrelemez; izolasyon tamamen
 * `this.clientDB` (tenant başına ayrı Mongo DB) seçimine dayanır. `clientId` yalnızca `new IntegrationFactory(Number(clientId))`
 * için kullanılır. (Bkz. docs/backlog-detail/backlog-1g-t4.md)
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import OrderService from '@api/rpc/handlers/order-service';
import { DatabaseManagerInstance } from '@database/DatabaseManager';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { captureLogs, type LogCapture } from '../../helpers/logCapture';

// F-06 (ADR-0024 P4): api/** console -> eventLog; loglar stdout JSON satırlarından doğrulanır.
let cap: LogCapture;
beforeEach(() => { cap = captureLogs(); });
afterEach(() => { cap.restore(); });

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;
const dbm = DatabaseManagerInstance as any;

let orderModel: any;
let claimModel: any;
let messageModel: any;
let instance: any;
let getInstance: jest.Mock<any>;

function makeService(request: any, clientId: any = 42) {
  const svc: any = new OrderService(clientId, request);
  svc.clientDB = {
    getOrderModel: jest.fn(() => orderModel),
    getClaimModel: jest.fn(() => claimModel),
    getMessageModel: jest.fn(() => messageModel),
  };
  return svc;
}

function makeOrder(over: any = {}) {
  return {
    _id: 'o1',
    orderNumber: 'ORD-1',
    externalOrderId: 'EXT-1',
    integrationCode: 'trendyol',
    internalStatus: 'AWAITING_APPROVAL',
    items: [{ externalItemId: 'ITEM-1', externalLineItemId: 'LINE-1', quantity: 2 }, { externalItemId: 'ITEM-2', externalLineItemId: 'LINE-2', quantity: 1 }],
    meta: { packageId: 'PKG-1' },
    ...over,
  };
}

beforeEach(() => {
  orderModel = {
    findById: jest.fn(async () => makeOrder()),
    findByIdAndUpdate: jest.fn(async () => ({ _id: 'o1', updated: true })),
    aggregate: jest.fn(async () => []),
    countDocuments: jest.fn(async () => 0),
  };
  claimModel = { aggregate: jest.fn(async () => []), countDocuments: jest.fn(async () => 0) };
  messageModel = { countDocuments: jest.fn(async () => 0) };
  instance = {
    rejectOrder: jest.fn(async () => true),
    approveOrder: jest.fn(async () => true),
    retrieveOrderRejectionReasons: jest.fn(async () => [{ id: 1, name: 'Stok yok' }]),
  };
  getInstance = jest.fn(async () => instance);
  factoryCtor.mockReset();
  factoryCtor.mockImplementation(() => ({ getInstance }));
  dbm.getApplicationDB.mockReset();
  dbm.getClientDB.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe('OrderService - tenant / clientId kullanımı', () => {
  it('[MEVCUT DAVRANIŞ] init(): ClientDB, DatabaseManager.getClientDB(clientId) ile alınır (tenant seçimi burada)', async () => {
    const fakeClientDb = { tag: 'tenant-42' };
    dbm.getApplicationDB.mockResolvedValue({ tag: 'app' });
    dbm.getClientDB.mockResolvedValue(fakeClientDb);
    const svc: any = new OrderService(42, {});
    await svc.init();
    expect(dbm.getClientDB).toHaveBeenCalledWith(42);
    expect(svc.clientDB).toBe(fakeClientDb);
  });

  it('[ADR-0024 P1-CORE] init(): clientId için tenant kaydı/ClientDB yoksa 500 DEĞİL 404 Tenant not found (ApplicationError; eskiden genel Error -> 500)', async () => {
    dbm.getApplicationDB.mockResolvedValue({});
    dbm.getClientDB.mockResolvedValue(undefined);
    const svc: any = new OrderService(42, {});
    await expect(svc.init()).rejects.toMatchObject({ statusCode: 404, message: 'Tenant not found' });
  });

  it('[MEVCUT DAVRANIŞ] init(): clientId falsy ise ClientDB kurulmaz ama HATA da fırlatılmaz (clientDB undefined kalır; sonraki metot TypeError verir)', async () => {
    // BACKLOG: şüpheli - sessiz başarısızlık; düzeltilince bu test kasıtlı olarak güncellenecek
    dbm.getApplicationDB.mockResolvedValue({});
    const svc: any = new OrderService(0, { searchOrderForm: {} });
    await expect(svc.init()).resolves.toBeUndefined();
    expect(dbm.getClientDB).not.toHaveBeenCalled();
    expect(svc.clientDB).toBeUndefined();
    await expect(svc.getOrders()).rejects.toThrow(TypeError);
  });

  it('[MEVCUT DAVRANIŞ] pazaryeri işlemlerinde IntegrationFactory tenant clientId\'si Number() ile oluşturulur', async () => {
    const svc = makeService({ orderId: 'o1', cancelData: { reason: 'r', reasonId: 1 } }, '42');
    await svc.cancelOrder();
    expect(factoryCtor).toHaveBeenCalledWith(42);
  });

  it('[MEVCUT DAVRANIŞ] hiçbir Order sorgusu clientId ile filtrelenmez: findById yalnızca istekteki orderId\'yi alır (izolasyon tamamen clientDB seçimine bağlı)', async () => {
    // BACKLOG: incelenmesi gereken davranış - defense-in-depth yok; clientDB yanlış bağlanırsa cross-tenant erişim olur
    const svc = makeService({ orderId: 'someone-elses-id' }, 42);
    await svc.approveOrder().catch(() => undefined);
    expect(orderModel.findById).toHaveBeenCalledWith('someone-elses-id');
  });
});

// ---------------------------------------------------------------------------------------------
describe('OrderService.getOrders', () => {
  const pipelineOf = () => orderModel.aggregate.mock.calls[0][0] as any[];

  it('[ADR-0021 2026-09-28] filtresiz çağrı: $match {}, $sort {dates.orderDate:-1} (eskiden şemada olmayan orderDate), sayfa 1 / limit 15 -> $skip 0, $limit 15; boş sonuçta sayfa sayısı 1', async () => {
    const res = await makeService({}).getOrders();
    expect(pipelineOf()).toEqual([
      { $match: {} },
      { $sort: { 'dates.orderDate': -1 } },
      { $facet: { totalNumberOfRecords: [{ $count: 'count' }], orders: [{ $skip: 0 }, { $limit: 15 }] } },
    ]);
    expect(res).toEqual({ totalNumberOfRecords: 0, totalNumberOfPages: 1, orders: [] });
  });

  it('[ADR-0021 2026-09-28 / GV-02] varsayılan sıralama ve tarih filtresi şema alanı `dates.orderDate` kullanır (eskiden üst düzey `orderDate` -> tarih aralığı hiç kayıt döndürmüyordu)', async () => {
    await makeService({ searchOrderForm: { filter: { startDate: '2026-01-01' } } }).getOrders();
    const stages = pipelineOf();
    expect(Object.keys(stages[0].$match)).toEqual(['dates.orderDate']);
    expect(stages[1]).toEqual({ $sort: { 'dates.orderDate': -1 } });
  });

  it('[ADR-0021 2026-09-28] sort.field izin listesi: FE alanları geçer, eski `orderDate` -> dates.orderDate, bilinmeyen alan 400', async () => {
    await makeService({ searchOrderForm: { sort: { field: 'orderDate', direction: 'asc' } } }).getOrders();
    expect(pipelineOf()[1]).toEqual({ $sort: { 'dates.orderDate': 1 } });
    for (const field of ['internalStatus', 'dates.orderDate', 'orderNumber', 'financials.grandTotal']) {
      orderModel.aggregate.mockClear();
      await makeService({ searchOrderForm: { sort: { field, direction: 'desc' } } }).getOrders();
      expect(pipelineOf()[1]).toEqual({ $sort: { [field]: -1 } });
    }
    for (const field of ['password', '$where', 'billingAddress.phone', { $gt: 1 }]) {
      await expect(makeService({ searchOrderForm: { sort: { field, direction: 'asc' } } }).getOrders()).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('[ADR-0021 2026-09-28] geçersiz startDate/endDate 400 (eskiden Mongo cast hatası)', async () => {
    await expect(makeService({ searchOrderForm: { filter: { startDate: 'garbage' } } }).getOrders()).rejects.toMatchObject({ statusCode: 400 });
    await expect(makeService({ searchOrderForm: { filter: { endDate: 'garbage' } } }).getOrders()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('[MEVCUT DAVRANIŞ] toplam/sayfa/sipariş sonucu $facet çıktısından hesaplanır', async () => {
    orderModel.aggregate.mockResolvedValue([{ totalNumberOfRecords: [{ count: 31 }], orders: [{ _id: 'a' }, { _id: 'b' }] }]);
    const res = await makeService({ searchOrderForm: { pagination: { page: 2, limit: 15 } } }).getOrders();
    expect(res).toEqual({ totalNumberOfRecords: 31, totalNumberOfPages: 3, orders: [{ _id: 'a' }, { _id: 'b' }] });
    expect((pipelineOf()[2] as any).$facet.orders).toEqual([{ $skip: 15 }, { $limit: 15 }]);
  });

  it('[MEVCUT DAVRANIŞ] aggregate boş dizi dönerse sıfır sonuç (hata yok)', async () => {
    orderModel.aggregate.mockResolvedValue([]);
    await expect(makeService({}).getOrders()).resolves.toEqual({ totalNumberOfRecords: 0, totalNumberOfPages: 1, orders: [] });
  });

  it.each([
    [{ field: 'financials.grandTotal', direction: 'asc' }, { 'financials.grandTotal': 1 }],
    [{ field: 'financials.grandTotal', direction: 'desc' }, { 'financials.grandTotal': -1 }],
    [{ field: 'orderNumber', direction: 'garbage' }, { orderNumber: -1 }], // 'asc' dışındaki HER değer -> -1
    [{ field: 'orderNumber' }, { orderNumber: -1 }],
    [{ direction: 'asc' }, { 'dates.orderDate': -1 }], // field yoksa varsayılan; direction yok sayılır
  ])('[MEVCUT DAVRANIŞ] sort %p -> $sort %p (izin listesindeki alan iletilir)', async (sort, expected) => {
    await makeService({ searchOrderForm: { sort } }).getOrders();
    expect(pipelineOf()[1]).toEqual({ $sort: expected });
  });

  it('[ADR-0021 2026-09-28 / GV-01] globalSearch: 6 alanda KAÇIŞLI case-insensitive $regex ile $or kurulur (eskiden ham girdi -> regex enjeksiyonu/ReDoS)', async () => {
    await makeService({ searchOrderForm: { filter: { globalSearch: '(a+)+$' } } }).getOrders();
    const re = { $regex: '\\(a\\+\\)\\+\\$', $options: 'i' };
    expect(pipelineOf()[0]).toEqual({
      $match: {
        $or: [
          { orderNumber: re }, { externalOrderId: re },
          { 'billingAddress.firstName': re }, { 'billingAddress.lastName': re },
          { 'billingAddress.phone': re }, { 'fulfillment.trackingCode': re },
        ],
      },
    });
  });

  it('[ADR-0021 2026-09-28] startDate -> Europe/Istanbul günün başı $gte; endDate -> Europe/Istanbul günün sonu $lte (sunucu saat diliminden bağımsız; UTC+3)', async () => {
    // 2026-03-01 (yalnız tarih => UTC gece yarısı = 03:00 İstanbul) -> İstanbul 1 Mart 00:00 = 2026-02-28T21:00Z
    await makeService({ searchOrderForm: { filter: { startDate: '2026-03-01', endDate: '2026-03-10T05:00:00Z' } } }).getOrders();
    const od = (pipelineOf()[0] as any).$match['dates.orderDate'];
    expect(od.$gte).toEqual(new Date('2026-02-28T21:00:00.000Z'));
    expect(od.$lte).toEqual(new Date('2026-03-10T20:59:59.999Z')); // İstanbul 10 Mart 23:59:59.999
  });

  it('[ADR-0021 2026-09-28] FE tarih seçici İstanbul gece yarısını UTC ISO gönderir (…T21:00:00.000Z) -> aynı takvim günü', async () => {
    await makeService({ searchOrderForm: { filter: { startDate: '2026-02-28T21:00:00.000Z', endDate: '2026-02-28T21:00:00.000Z' } } }).getOrders();
    const od = (pipelineOf()[0] as any).$match['dates.orderDate'];
    expect(od.$gte).toEqual(new Date('2026-02-28T21:00:00.000Z'));
    expect(od.$lte).toEqual(new Date('2026-03-01T20:59:59.999Z'));
  });

  it('[MEVCUT DAVRANIŞ] yalnızca endDate verilirse $gte yok, sadece $lte', async () => {
    await makeService({ searchOrderForm: { filter: { endDate: '2026-03-10T05:00:00Z' } } }).getOrders();
    const od = (pipelineOf()[0] as any).$match['dates.orderDate'];
    expect(Object.keys(od)).toEqual(['$lte']);
  });

  it('[MEVCUT DAVRANIŞ] integrationCodes / internalStatuses $in ile eklenir; boş dizi filtre EKLEMEZ', async () => {
    await makeService({ searchOrderForm: { filter: { integrationCodes: ['trendyol', 'n11'], internalStatuses: ['APPROVED'] } } }).getOrders();
    expect((pipelineOf()[0] as any).$match).toEqual({
      integrationCode: { $in: ['trendyol', 'n11'] },
      internalStatus: { $in: ['APPROVED'] },
    });
    orderModel.aggregate.mockClear();
    await makeService({ searchOrderForm: { filter: { integrationCodes: [], internalStatuses: [] } } }).getOrders();
    expect((pipelineOf()[0] as any).$match).toEqual({});
  });

  it('[MEVCUT DAVRANIŞ] $match içinde clientId/tenant filtresi YOK (yalnızca istemci filtreleri)', async () => {
    await makeService({ searchOrderForm: { filter: { integrationCodes: ['n11'] } } }, 99).getOrders();
    expect(JSON.stringify(pipelineOf()[0])).not.toMatch(/clientId/i);
  });

  it('[ADR-0021 2026-09-28 / GV-01] sayfalama sınırları: page<1 -> 1 ($skip 0, eskiden negatif); limit<1 -> varsayılan 15 (eskiden $limit 0 / Infinity sayfa); limit üst sınırı 200', async () => {
    await makeService({ searchOrderForm: { pagination: { page: 0, limit: 10 } } }).getOrders();
    expect((pipelineOf()[2] as any).$facet.orders).toEqual([{ $skip: 0 }, { $limit: 10 }]);

    orderModel.aggregate.mockResolvedValue([{ totalNumberOfRecords: [{ count: 30 }], orders: [] }]);
    const res = await makeService({ searchOrderForm: { pagination: { page: 1, limit: 0 } } }).getOrders();
    expect(res.totalNumberOfPages).toBe(2); // 30 / 15

    orderModel.aggregate.mockClear();
    await makeService({ searchOrderForm: { pagination: { page: 2, limit: 100000 } } }).getOrders();
    expect((pipelineOf()[2] as any).$facet.orders).toEqual([{ $skip: 200 }, { $limit: 200 }]);
  });

  it('[MEVCUT DAVRANIŞ] hata console.error ile loglanıp olduğu gibi yeniden fırlatılır', async () => {
    orderModel.aggregate.mockRejectedValue(new Error('agg fail'));
    await expect(makeService({}).getOrders()).rejects.toThrow('agg fail');
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error' })); // F-06: console.error -> eventLog
  });

  it('[MEVCUT DAVRANIŞ] get() tekil sipariş için henüz yok: undefined döner', async () => {
    await expect(makeService({}).get()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
describe('OrderService.cancelOrder', () => {
  const req = (over: any = {}) => ({ orderId: 'o1', cancelData: { reason: 'Stok yok', reasonId: 7 }, ...over });

  it('[MEVCUT DAVRANIŞ] mutlu yol: pazaryerine reddet (evrensel IOrderRejectParams), sonra DB\'de CANCELLED + platformOperation PENDING (+5 dk kilit) + history', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    const res = await makeService(req()).cancelOrder();

    expect(orderModel.findById).toHaveBeenCalledWith('o1');
    expect(getInstance).toHaveBeenCalledWith('trendyol');
    expect(instance.rejectOrder).toHaveBeenCalledWith('EXT-1', {
      reasonId: '7',
      description: 'Stok yok',
      source: 'SELLER',
      lineItems: [{ externalLineId: 'ITEM-1', quantity: 2 }, { externalLineId: 'ITEM-2', quantity: 1 }],
      meta: { packageId: 'PKG-1' },
    });

    const [id, update, opts] = orderModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('o1');
    expect(opts).toEqual({ new: true });
    expect(update.$set).toMatchObject({
      internalStatus: 'CANCELLED',
      'items.$[].itemStatus': 'CANCELLED',
      cancelReason: 'Stok yok',
      cancelSource: 'SELLER',
      platformOperation: {
        status: 'PENDING',
        message: 'Sipariş iptal ediliyor, pazar yeri onayı bekleniyor...',
        lockedUntil: new Date('2026-05-01T10:05:00Z'),
      },
    });
    expect(update.$push.history).toMatchObject({ status: 'CANCELLED', actionBy: 'USER', description: 'Sipariş kullanıcı tarafından iptal edildi. Sebep: Stok yok' });
    expect(res).toEqual({ success: true, message: 'Sipariş başarıyla iptal edildi.', data: { _id: 'o1', updated: true } });
  });

  it('[MEVCUT DAVRANIŞ] satır eşleştirmesi `externalItemId` -> externalLineId (approve ise `externalLineItemId` kullanır: alan adı tutarsızlığı)', async () => {
    // BACKLOG: şüpheli - iptalde externalItemId, onayda externalLineItemId; şemada ikisi de var. Düzeltilince güncellenecek.
    await makeService(req()).cancelOrder();
    expect((instance.rejectOrder.mock.calls[0][1] as any).lineItems[0].externalLineId).toBe('ITEM-1');
  });

  it('[MEVCUT DAVRANIŞ] cancelData yoksa reason/reasonId doğrudan request\'ten okunur; reasonId yoksa String(undefined)="undefined" gider', async () => {
    await makeService({ orderId: 'o1', reason: 'sebep' }).cancelOrder();
    expect(instance.rejectOrder.mock.calls[0][1]).toMatchObject({ reasonId: 'undefined', description: 'sebep' });
  });

  it('[MEVCUT DAVRANIŞ] sipariş yoksa "Sipariş bulunamadı." hatası; pazaryeri ve DB güncellemesi çağrılmaz', async () => {
    orderModel.findById.mockResolvedValue(null);
    await expect(makeService(req()).cancelOrder()).rejects.toThrow('Sipariş bulunamadı.');
    expect(factoryCtor).not.toHaveBeenCalled();
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] pazaryeri === false dönerse hata fırlatılır ve DB GÜNCELLENMEZ', async () => {
    instance.rejectOrder.mockResolvedValue(false);
    await expect(makeService(req()).cancelOrder()).rejects.toThrow('Pazar yeri iptal işlemini reddetti veya bir sorun oluştu.');
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [0], [''], [{ success: false }]])(
    '[MEVCUT DAVRANIŞ] pazaryeri sonucu %p (=== false değil) BAŞARI sayılır ve sipariş yerelde CANCELLED yapılır',
    async (val) => {
      // BACKLOG: şüpheli - yalnızca `=== false` reddi; approve tarafı `!result` kullanır (asimetri). Düzeltilince güncellenecek.
      instance.rejectOrder.mockResolvedValue(val);
      const res = await makeService(req()).cancelOrder();
      expect(res.success).toBe(true);
      expect(orderModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    },
  );

  it('[MEVCUT DAVRANIŞ] iptal öncesi statü/ön koşul kontrolü YOK: SHIPPED/DELIVERED/CANCELLED sipariş de pazaryerine reddedilip yerelde CANCELLED yapılır', async () => {
    // BACKLOG: şüpheli - approve AWAITING_APPROVAL şartı arar, cancel hiçbir statü şartı aramaz
    for (const st of ['SHIPPED', 'DELIVERED', 'CANCELLED']) {
      orderModel.findById.mockResolvedValue(makeOrder({ internalStatus: st }));
      instance.rejectOrder.mockClear();
      const res = await makeService(req()).cancelOrder();
      expect(res.success).toBe(true);
      expect(instance.rejectOrder).toHaveBeenCalledTimes(1);
    }
  });

  it('[MEVCUT DAVRANIŞ] pazaryeri istisnası olduğu gibi yayılır; DB güncellenmez', async () => {
    instance.rejectOrder.mockRejectedValue(new Error('market down'));
    await expect(makeService(req()).cancelOrder()).rejects.toThrow('market down');
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] pazaryeri iptali başarılı ama DB güncellemesi patlarsa hata yayılır (pazaryeri geri alınmaz: yerel/uzak tutarsızlık)', async () => {
    orderModel.findByIdAndUpdate.mockRejectedValue(new Error('db write fail'));
    await expect(makeService(req()).cancelOrder()).rejects.toThrow('db write fail');
    expect(instance.rejectOrder).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] güncelleme null dönerse (yarışta silinmiş) yine success:true, data:null', async () => {
    orderModel.findByIdAndUpdate.mockResolvedValue(null);
    await expect(makeService(req()).cancelOrder()).resolves.toMatchObject({ success: true, data: null });
  });
});

// ---------------------------------------------------------------------------------------------
describe('OrderService.bulkCancelOrder', () => {
  it.each([[undefined], [null], [[]], ['o1'], [{}]])('[MEVCUT DAVRANIŞ] orderIds=%p -> "İptal edilecek sipariş seçilmedi." hatası', async (ids) => {
    await expect(makeService({ orderIds: ids, cancelData: { reasonId: 1, reason: 'x' } }).bulkCancelOrder()).rejects.toThrow('İptal edilecek sipariş seçilmedi.');
  });

  it('[MEVCUT DAVRANIŞ] karışık sonuç: başarılar/başarısızlar ayrı listelenir, success=false, mesaj sayıları içerir; her kayıt bağımsız (bir hata diğerlerini durdurmaz)', async () => {
    orderModel.findById.mockImplementation(async (id: string) => {
      if (id === 'missing') return null;
      return makeOrder({ _id: id, orderNumber: 'N-' + id, externalOrderId: 'E-' + id });
    });
    instance.rejectOrder.mockImplementation(async (ext: string) => ext !== 'E-refused');
    const res = await makeService({ orderIds: ['a', 'missing', 'refused', 'b'], cancelData: { reasonId: 3, reason: 'sebep' } }).bulkCancelOrder();

    expect(res.success).toBe(false);
    expect(res.message).toBe('2 sipariş iptal edildi, 2 hata alındı.');
    expect(res.data.successful).toEqual([{ orderId: 'a', orderNumber: 'N-a' }, { orderId: 'b', orderNumber: 'N-b' }]);
    expect(res.data.failed).toEqual([
      { orderId: 'missing', errorMessage: 'missing nolu sipariş sistemde bulunamadı.' },
      { orderId: 'refused', errorMessage: 'Pazar yeri bu iptal isteğine onay vermedi.' },
    ]);
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('[MEVCUT DAVRANIŞ] hepsi başarılıysa success=true; toplu güncelleme {new:true} KULLANMAZ ve history metni "Toplu iptal işlemiyle reddedildi"', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    const res = await makeService({ orderIds: ['a'], cancelData: { reasonId: 3, reason: 'sebep' } }).bulkCancelOrder();
    expect(res.success).toBe(true);
    const call = orderModel.findByIdAndUpdate.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[1].$push.history.description).toBe('Toplu iptal işlemiyle reddedildi. Sebep: sebep');
    expect(call[1].$set.platformOperation.lockedUntil).toEqual(new Date('2026-05-01T10:05:00Z'));
    expect(call[1].$set.platformOperation.message).toBe('Sipariş toplu işlem ile iptal ediliyor...');
  });

  it('[MEVCUT DAVRANIŞ] entegrasyon örneği integrationCode başına önbelleğe alınır (getInstance kod başına 1 kez)', async () => {
    orderModel.findById.mockImplementation(async (id: string) => makeOrder({ _id: id, integrationCode: id.startsWith('t') ? 'trendyol' : 'n11' }));
    await makeService({ orderIds: ['t1', 't2', 'n1', 't3'], cancelData: { reasonId: 1, reason: 'r' } }).bulkCancelOrder();
    expect(getInstance).toHaveBeenCalledTimes(2);
    expect(factoryCtor).toHaveBeenCalledTimes(1); // tek factory, tenant clientId ile
    expect(factoryCtor).toHaveBeenCalledWith(42);
  });

  it('[MEVCUT DAVRANIŞ] pazaryeri sonucu === false dışındaki falsy değerler (undefined) burada da başarı sayılır; error.message yoksa "Bilinmeyen hata"', async () => {
    instance.rejectOrder.mockResolvedValueOnce(undefined);
    instance.rejectOrder.mockRejectedValueOnce({});
    const res = await makeService({ orderIds: ['a', 'b'], cancelData: { reasonId: 1, reason: 'r' } }).bulkCancelOrder();
    expect(res.data.successCount).toBe(1);
    expect(res.data.failed).toEqual([{ orderId: 'b', errorMessage: 'Bilinmeyen hata' }]);
  });

  it('[MEVCUT DAVRANIŞ] cancelData yoksa reasonId "undefined" ve reason undefined ile pazaryerine gider (doğrulama yok)', async () => {
    await makeService({ orderIds: ['a'] }).bulkCancelOrder();
    expect(instance.rejectOrder.mock.calls[0][1]).toMatchObject({ reasonId: 'undefined', description: undefined });
  });
});

// ---------------------------------------------------------------------------------------------
describe('OrderService.approveOrder', () => {
  it('[MEVCUT DAVRANIŞ] mutlu yol: pazaryerine onay (meta: externalLineItemId + order.meta), sonra APPROVED + platformOperation PENDING (+2 dk) + history', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    const res = await makeService({ orderId: 'o1' }).approveOrder();

    expect(instance.approveOrder).toHaveBeenCalledWith('EXT-1', { meta: { externalLineItemId: 'LINE-1', packageId: 'PKG-1' } });
    const [id, update, opts] = orderModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('o1');
    expect(opts).toEqual({ new: true });
    expect(update.$set.internalStatus).toBe('APPROVED');
    expect(update.$set.platformOperation.lockedUntil).toEqual(new Date('2026-05-01T10:02:00Z'));
    expect(update.$set.fulfillment).toBeUndefined();
    expect(update.$push.history).toMatchObject({ status: 'APPROVED', actionBy: 'USER', description: 'Sipariş kullanıcı tarafından onaylandı.' });
    expect(res).toEqual({ success: true, message: 'Sipariş onaylandı.', data: { _id: 'o1', updated: true } });
  });

  it('[MEVCUT DAVRANIŞ] order.meta içindeki externalLineItemId, items[0]\'dan gelen değeri EZER (spread sırası)', async () => {
    orderModel.findById.mockResolvedValue(makeOrder({ meta: { externalLineItemId: 'FROM-META' } }));
    await makeService({ orderId: 'o1' }).approveOrder();
    expect((instance.approveOrder.mock.calls[0][1] as any).meta.externalLineItemId).toBe('FROM-META');
  });

  it('[MEVCUT DAVRANIŞ] items boşsa externalLineItemId undefined, meta yoksa da hata yok', async () => {
    orderModel.findById.mockResolvedValue(makeOrder({ items: [], meta: undefined }));
    await makeService({ orderId: 'o1' }).approveOrder();
    expect(instance.approveOrder).toHaveBeenCalledWith('EXT-1', { meta: { externalLineItemId: undefined } });
  });

  it('[MEVCUT DAVRANIŞ] sipariş yoksa hata', async () => {
    orderModel.findById.mockResolvedValue(null);
    await expect(makeService({ orderId: 'x' }).approveOrder()).rejects.toThrow('Sipariş bulunamadı.');
  });

  it.each(['UNAPPROVED', 'APPROVED', 'SHIPPED', 'CANCELLED'])(
    '[MEVCUT DAVRANIŞ] statü %s ise (yalnız AWAITING_APPROVAL onaylanabilir) hata; pazaryeri çağrılmaz',
    async (st) => {
      orderModel.findById.mockResolvedValue(makeOrder({ internalStatus: st }));
      await expect(makeService({ orderId: 'o1' }).approveOrder()).rejects.toThrow('Sadece "Satıcı Onayı Bekliyor" durumundaki siparişler onaylanabilir.');
      expect(factoryCtor).not.toHaveBeenCalled();
    },
  );

  it.each([[false], [null], [undefined], [0]])('[MEVCUT DAVRANIŞ] pazaryeri sonucu %p (falsy) -> "Pazar yeri onay işlemini reddetti." ve DB güncellenmez', async (val) => {
    instance.approveOrder.mockResolvedValue(val);
    await expect(makeService({ orderId: 'o1' }).approveOrder()).rejects.toThrow('Pazar yeri onay işlemini reddetti.');
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] platform detaylı sonuç döndürürse (success + rawResponse.barcode|trackingCode|labelUrl) fulfillment TEK elemanlı dizi olarak YAZILIR (mevcut fulfillment ezilir)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    instance.approveOrder.mockResolvedValue({ success: true, rawResponse: { barcode: 'BC1', trackingCode: 'TC1', labelUrl: 'http://x/l', packageNumber: 'PN1' } });
    await makeService({ orderId: 'o1' }).approveOrder();
    expect(orderModel.findByIdAndUpdate.mock.calls[0][1].$set.fulfillment).toEqual([
      { shipmentMethod: 'MARKETPLACE', status: 'PENDING', trackingCode: 'BC1', labelUrl: 'http://x/l', campaignCode: 'PN1', createdAt: new Date('2026-05-01T10:00:00Z') },
    ]);
  });

  it('[MEVCUT DAVRANIŞ] barcode yoksa trackingCode kullanılır; yalnızca labelUrl varsa trackingCode undefined ile yine yazılır', async () => {
    instance.approveOrder.mockResolvedValue({ success: true, rawResponse: { trackingCode: 'TC1' } });
    await makeService({ orderId: 'o1' }).approveOrder();
    expect(orderModel.findByIdAndUpdate.mock.calls[0][1].$set.fulfillment[0].trackingCode).toBe('TC1');

    orderModel.findByIdAndUpdate.mockClear();
    instance.approveOrder.mockResolvedValue({ success: true, rawResponse: { labelUrl: 'L' } });
    await makeService({ orderId: 'o1' }).approveOrder();
    const f = orderModel.findByIdAndUpdate.mock.calls[0][1].$set.fulfillment[0];
    expect(f.trackingCode).toBeUndefined();
    expect(f.labelUrl).toBe('L');
  });

  it.each([
    [{ success: false, rawResponse: { barcode: 'B' } }],
    [{ success: true }],
    [{ success: true, rawResponse: { other: 1 } }],
    [true],
  ])('[MEVCUT DAVRANIŞ] sonuç %p -> fulfillment güncellenmez', async (val) => {
    instance.approveOrder.mockResolvedValue(val);
    await makeService({ orderId: 'o1' }).approveOrder();
    expect(orderModel.findByIdAndUpdate.mock.calls[0][1].$set.fulfillment).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
describe('OrderService.bulkApproveOrder', () => {
  it.each([[undefined], [[]], ['x']])('[MEVCUT DAVRANIŞ] orderIds=%p -> "Onaylanacak sipariş seçilmedi." hatası', async (ids) => {
    await expect(makeService({ orderIds: ids }).bulkApproveOrder()).rejects.toThrow('Onaylanacak sipariş seçilmedi.');
  });

  it('[MEVCUT DAVRANIŞ] karışık sonuç: bulunamadı / statü uygun değil / platform reddetti hataları kayıt bazında toplanır; başarılılar APPROVED yapılır (+5 dk kilit, {new:true} yok)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    orderModel.findById.mockImplementation(async (id: string) => {
      if (id === 'missing') return null;
      if (id === 'wrongstate') return makeOrder({ _id: id, internalStatus: 'APPROVED' });
      return makeOrder({ _id: id, orderNumber: 'N-' + id, externalOrderId: 'E-' + id });
    });
    instance.approveOrder.mockImplementation(async (ext: string) => ext !== 'E-refused');
    const res = await makeService({ orderIds: ['ok1', 'missing', 'wrongstate', 'refused', 'ok2'] }).bulkApproveOrder();

    expect(res.success).toBe(false);
    expect(res.message).toBe('2 sipariş onaylandı, 3 hata.');
    expect(res.data.successful).toEqual([{ orderId: 'ok1', orderNumber: 'N-ok1' }, { orderId: 'ok2', orderNumber: 'N-ok2' }]);
    expect(res.data.failed).toEqual([
      { orderId: 'missing', errorMessage: 'Bulunamadı.' },
      { orderId: 'wrongstate', errorMessage: 'Statü uygun değil.' },
      { orderId: 'refused', errorMessage: 'Platform reddetti.' },
    ]);
    const call = orderModel.findByIdAndUpdate.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call[1].$set.platformOperation.lockedUntil).toEqual(new Date('2026-05-01T10:05:00Z'));
    expect(call[1].$push.history.description).toBe('Toplu onay işlemiyle onaylandı.');
  });

  it('[MEVCUT DAVRANIŞ] toplu onayda fulfillment/kargo bilgisi işlenmez (tekil onaydan farklı) ve `dates.externalUpdatedAt` set edilmez', async () => {
    instance.approveOrder.mockResolvedValue({ success: true, rawResponse: { barcode: 'B' } });
    await makeService({ orderIds: ['a'] }).bulkApproveOrder();
    const set = orderModel.findByIdAndUpdate.mock.calls[0][1].$set;
    expect(set.fulfillment).toBeUndefined();
    expect(set['dates.externalUpdatedAt']).toBeUndefined();
    expect(set['dates.approvedDate']).toBeInstanceOf(Date);
  });

  it('[MEVCUT DAVRANIŞ] entegrasyon örneği integrationCode başına önbelleğe alınır; tüm siparişler başarılıysa success=true', async () => {
    const res = await makeService({ orderIds: ['a', 'b', 'c'] }).bulkApproveOrder();
    expect(getInstance).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.message).toBe('3 sipariş onaylandı, 0 hata.');
  });
});

// ---------------------------------------------------------------------------------------------
describe('OrderService.markAsPrinted / getOrderRejectionReasons', () => {
  it('[MEVCUT DAVRANIŞ] markAsPrinted: flags.isBarcodePrinted=true set edilir ve platformActions\'a SYSTEM/BARCODE_PRINT kaydı push edilir', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    const res = await makeService({ orderId: 'o1' }).markAsPrinted();
    const [id, update, opts] = orderModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('o1');
    expect(opts).toEqual({ new: true });
    expect(update.$set).toEqual({ 'flags.isBarcodePrinted': true });
    expect(update.$push.platformActions).toEqual({
      actionType: 'BARCODE_PRINT',
      platform: 'SYSTEM',
      status: 'SUCCESS',
      requestPayload: { printedAt: new Date('2026-05-01T10:00:00Z') },
      responsePayload: { message: 'Barkod başarıyla yazdırıldı.' },
      createdAt: new Date('2026-05-01T10:00:00Z'),
    });
    expect(res).toEqual({ success: true, message: 'Barkod basıldı olarak işaretlendi.', data: { _id: 'o1', updated: true } });
  });

  it('[MEVCUT DAVRANIŞ] markAsPrinted: sipariş yoksa yine success:true, data:null', async () => {
    orderModel.findByIdAndUpdate.mockResolvedValue(null);
    await expect(makeService({ orderId: 'nope' }).markAsPrinted()).resolves.toMatchObject({ success: true, data: null });
  });

  it('[MEVCUT DAVRANIŞ] getOrderRejectionReasons: tenant factory ile modülün retrieveOrderRejectionReasons() sonucunu döner', async () => {
    const res = await makeService({ integrationCode: 'hepsiburada' }).getOrderRejectionReasons();
    expect(factoryCtor).toHaveBeenCalledWith(42);
    expect(getInstance).toHaveBeenCalledWith('hepsiburada');
    expect(res).toEqual({ success: true, message: 'İptal nedenleri başarıyla getirildi.', data: [{ id: 1, name: 'Stok yok' }] });
  });

  it('[MEVCUT DAVRANIŞ] getOrderRejectionReasons: modül hatası yayılır', async () => {
    getInstance.mockRejectedValue(new Error('no such integration'));
    await expect(makeService({ integrationCode: 'zzz' }).getOrderRejectionReasons()).rejects.toThrow('no such integration');
  });
});

// ---------------------------------------------------------------------------------------------
describe('OrderService.getOrderDashboardInsights', () => {
  beforeEach(() => {
    // [ADR-0021 2026-09-28 / GV-03] 15 Haziran 2026 12:00 İstanbul (09:00Z) -> "bugün" sınırı İstanbul gece yarısı (14 Haziran 21:00Z), sunucu TZ'sinden bağımsız
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T09:00:00.000Z'));
  });

  it('[MEVCUT DAVRANIŞ] hiç veri yokken sıfır değerli yapı döner; last7Days 7 gün (6 gün önce ... bugün), hepsi 0', async () => {
    const res = await makeService({}).getOrderDashboardInsights();
    expect(res.totals).toEqual({ orderCount: 0, revenue: 0, returnCount: 0, returnAmount: 0 });
    expect(res.today).toEqual({ count: 0, revenue: 0 });
    expect(res.trend).toEqual({ countChange: 0, revenueChange: 0 });
    expect(res.statusDistribution).toEqual({ UNAPPROVED: 0, AWAITING_APPROVAL: 0, APPROVED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0, RETURNED: 0, total: 0 });
    expect(res.pending).toEqual({ invoiceCount: 0, shippingCount: 0, claimCount: 0, messageCount: 0 });
    expect(res.last7Days.map((d: any) => d.date)).toEqual([
      '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15',
    ]);
    expect(res.last7Days.every((d: any) => d.count === 0 && d.revenue === 0)).toBe(true);
  });

  it('[MEVCUT DAVRANIŞ] 10 paralel sorgu kurulur: 5 Order aggregate, 1 Claim aggregate, 2 Order + 1 Claim + 1 Message count; HİÇBİRİ tenant/clientId filtresi içermez', async () => {
    await makeService({}).getOrderDashboardInsights();
    expect(orderModel.aggregate).toHaveBeenCalledTimes(5);
    expect(claimModel.aggregate).toHaveBeenCalledTimes(1);
    expect(orderModel.countDocuments).toHaveBeenCalledTimes(2);
    expect(claimModel.countDocuments).toHaveBeenCalledTimes(1);
    expect(messageModel.countDocuments).toHaveBeenCalledTimes(1);
    const all = JSON.stringify([orderModel.aggregate.mock.calls, claimModel.aggregate.mock.calls, orderModel.countDocuments.mock.calls]);
    expect(all).not.toMatch(/clientId/i);
    expect(orderModel.countDocuments).toHaveBeenCalledWith({ internalStatus: 'APPROVED', 'flags.isInvoiceGenerated': { $ne: true } });
    expect(orderModel.countDocuments).toHaveBeenCalledWith({ internalStatus: 'APPROVED' });
    expect(claimModel.countDocuments).toHaveBeenCalledWith({ internalStatus: { $in: ['WAITING', 'SHIPPED', 'DELIVERED'] } });
    expect(messageModel.countDocuments).toHaveBeenCalledWith({ status: 'WAITING_SELLER', isRejected: { $ne: true } });
  });

  it('[MEVCUT DAVRANIŞ] toplam ciro yalnızca CANCELLED hariç; dashboard tarih sorguları `dates.orderDate` kullanır (getOrders ise `orderDate`)', async () => {
    await makeService({}).getOrderDashboardInsights();
    const pipes = orderModel.aggregate.mock.calls.map((c: any) => c[0]);
    expect(pipes[1][0]).toEqual({ $match: { internalStatus: { $nin: ['CANCELLED'] } } });
    expect(Object.keys(pipes[2][0].$match)).toEqual(['dates.orderDate']);
    expect(pipes[2][0].$match['dates.orderDate'].$gte).toEqual(new Date('2026-06-08T21:00:00.000Z'));
    expect(pipes[3][0].$match['dates.orderDate'].$gte).toEqual(new Date('2026-06-14T21:00:00.000Z'));
    expect(pipes[4][0].$match['dates.orderDate']).toEqual({ $gte: new Date('2026-06-13T21:00:00.000Z'), $lt: new Date('2026-06-14T21:00:00.000Z') });
    // günlük gruplama da İstanbul günüyle (Mongo timezone seçeneği)
    expect(JSON.stringify(pipes[2][1].$group._id)).toContain('"timezone":"Europe/Istanbul"');
    expect(claimModel.aggregate.mock.calls[0][0][0]).toEqual({ $match: { internalStatus: { $nin: ['CANCELLED', 'REJECTED'] } } });
  });

  it('[MEVCUT DAVRANIŞ] sonuçlar birleştirilir: statü haritası, toplamlar, günlük seri (boş günler 0), bekleyen sayılar', async () => {
    orderModel.aggregate
      .mockResolvedValueOnce([{ _id: 'APPROVED', count: 3 }, { _id: 'SHIPPED', count: 2 }, { _id: 'WEIRD', count: 5 }]) // statusDist
      .mockResolvedValueOnce([{ _id: null, totalRevenue: 1500, totalCount: 9 }]) // total
      .mockResolvedValueOnce([{ _id: { year: 2026, month: 6, day: 14 }, count: 4, revenue: 400 }, { _id: { year: 2026, month: 6, day: 15 }, count: 6, revenue: 600 }]) // daily
      .mockResolvedValueOnce([{ _id: null, count: 6, revenue: 600 }]) // today
      .mockResolvedValueOnce([{ _id: null, count: 4, revenue: 400 }]); // yesterday
    claimModel.aggregate.mockResolvedValueOnce([{ _id: null, totalReturnCount: 2, totalReturnAmount: 120 }]);
    orderModel.countDocuments.mockResolvedValueOnce(5).mockResolvedValueOnce(7);
    claimModel.countDocuments.mockResolvedValueOnce(3);
    messageModel.countDocuments.mockResolvedValueOnce(8);

    const res = await makeService({}).getOrderDashboardInsights();
    expect(res.totals).toEqual({ orderCount: 9, revenue: 1500, returnCount: 2, returnAmount: 120 });
    expect(res.today).toEqual({ count: 6, revenue: 600 });
    expect(res.trend).toEqual({ countChange: 50, revenueChange: 50 });
    expect(res.statusDistribution).toMatchObject({ APPROVED: 3, SHIPPED: 2, UNAPPROVED: 0, total: 10 }); // bilinmeyen statü de total'e girer
    expect(res.pending).toEqual({ invoiceCount: 5, shippingCount: 7, claimCount: 3, messageCount: 8 });
    expect(res.last7Days.slice(-2)).toEqual([{ date: '2026-06-14', count: 4, revenue: 400 }, { date: '2026-06-15', count: 6, revenue: 600 }]);
    expect(res.last7Days[0]).toEqual({ date: '2026-06-09', count: 0, revenue: 0 });
  });

  it('[ADR-0021 2026-09-28 / GV-03] gece yarısından sonra UTC henüz önceki gün: 15 Haz 01:30 İstanbul (14 Haz 22:30Z) -> "bugün" 15 Haziran', async () => {
    jest.setSystemTime(new Date('2026-06-14T22:30:00.000Z'));
    const res = await makeService({}).getOrderDashboardInsights();
    const pipes = orderModel.aggregate.mock.calls.map((c: any) => c[0]);
    expect(pipes[3][0].$match['dates.orderDate'].$gte).toEqual(new Date('2026-06-14T21:00:00.000Z'));
    expect(res.last7Days.map((d: any) => d.date).slice(-2)).toEqual(['2026-06-14', '2026-06-15']);
  });

  it.each([
    [{ count: 0, revenue: 0 }, { count: 5, revenue: 50 }, 100, 100], // dün 0, bugün >0 -> +100
    [{ count: 0, revenue: 0 }, { count: 0, revenue: 0 }, 0, 0],
    [{ count: 10, revenue: 200 }, { count: 5, revenue: 50 }, -50, -75],
    [{ count: 3, revenue: 100 }, { count: 4, revenue: 133 }, 33, 33], // Math.round
  ])('[MEVCUT DAVRANIŞ] trend: dün %p, bugün %p -> count %p%%, revenue %p%%', async (y, t, cc, rc) => {
    orderModel.aggregate
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ _id: null, ...t }])
      .mockResolvedValueOnce([{ _id: null, ...y }]);
    const res = await makeService({}).getOrderDashboardInsights();
    expect(res.trend).toEqual({ countChange: cc, revenueChange: rc });
  });

  it('[MEVCUT DAVRANIŞ] herhangi bir sorgu hatası tüm çağrıyı reddeder (kısmi sonuç yok)', async () => {
    claimModel.countDocuments.mockRejectedValue(new Error('claim db down'));
    await expect(makeService({}).getOrderDashboardInsights()).rejects.toThrow('claim db down');
  });
});

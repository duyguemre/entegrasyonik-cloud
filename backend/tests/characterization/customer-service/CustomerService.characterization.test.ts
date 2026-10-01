/**
 * CHARACTERIZATION: CustomerService (backend/src/api/rpc/handlers/customer-service.ts)
 *
 * Kapsam: get, getCustomers, getCustomerDetail, updateCustomer (tenant/clientId kullanımı dahil).
 * `anonymizeCustomer` KAPSAM DIŞI — bkz. tests/characterization/tenant/customer-service-anonymize.test.ts
 * (bu dosyada TEKRAR EDİLMEDİ, çakışma yaratılmadı).
 *
 * DB/Redis/ağ YOK; `clientDB` tamamen sahte model nesneleridir. Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut
 * davranış sabitlenir (Protokol 13).
 *
 * Tenant izolasyonu (PLATFORM_BASELINE B2): CustomerService içindeki HİÇBİR sorgu clientId ile
 * filtrelemez; izolasyon tamamen `this.clientDB` (tenant başına ayrı Mongo bağlantısı) seçimine
 * dayanır — bu, order-service/claim-service ile AYNI mimari desendir (bkz. OrderService.characterization.test.ts
 * satır 10-12). Aşağıda iki ayrı tenant/clientDB ile çapraz-sızıntı olmadığı ayrıca kanıtlanır.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ObjectId } from 'mongodb';

import CustomerService from '@api/rpc/handlers/customer-service';

// getCustomerDetail `new ObjectId(customerId)` çağırır (recentOrders/recentClaims filtresi) -> geçersiz
// hex string senkron fırlatır; bu yüzden test genelinde GEÇERLİ bir ObjectId hex string kullanılır.
const CUSTOMER_ID = new ObjectId().toString();

let customerModel: any;
let orderModel: any;
let claimModel: any;

function chain(result: any) {
  const c: any = {};
  c.sort = jest.fn(() => c);
  c.limit = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

function makeService(request: any, clientId: any = 42, clientDb?: any) {
  const svc: any = new CustomerService(clientId, request);
  svc.clientDB = clientDb || {
    getCustomerModel: jest.fn(() => customerModel),
    getOrderModel: jest.fn(() => orderModel),
    getClaimModel: jest.fn(() => claimModel),
  };
  return svc;
}

beforeEach(() => {
  customerModel = {
    aggregate: jest.fn(async () => [{ metadata: [], data: [] }]),
    findById: jest.fn(() => chain(null)),
    findByIdAndUpdate: jest.fn(async () => ({ _id: CUSTOMER_ID, updated: true })),
  };
  orderModel = { find: jest.fn(() => chain([])) };
  claimModel = { find: jest.fn(() => chain([])) };
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe('CustomerService.get', () => {
  it('[MEVCUT DAVRANIŞ] henüz uygulanmamış: undefined döner', async () => {
    await expect(makeService({}).get()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
describe('CustomerService.getCustomers', () => {
  const pipelineOf = () => customerModel.aggregate.mock.calls[0][0] as any[];

  it('[MEVCUT DAVRANIŞ] filtresiz çağrı: $match {}, varsayılan sort alanı createdAt YÖN 1 (artan; sortBy verilmezse "desc" DEĞİL "asc" varsayılır), sayfa1/limit15', async () => {
    await makeService({}).getCustomers();
    const pipe = pipelineOf();
    expect(pipe[0]).toEqual({ $match: {} });
    const facet = (pipe[2] as any).$facet;
    expect(pipe[1]).toEqual({ $sort: { createdAt: 1 } }); // [DB-02] $sort artık $facet dışında
    expect(facet.data[0]).toEqual({ $skip: 0 });
    expect(facet.data[1]).toEqual({ $limit: 15 });
  });

  it('[DB-02] sıralama alanı izin listesi: bilinmeyen/nesne/operatör alan => varsayılan createdAt (hata yok); izinli alan (metrics.totalSpent) geçer', async () => {
    for (const key of ['passwordHash', '$where', 'meta.x', { $gt: 1 }, '']) {
      customerModel.aggregate.mockClear();
      await makeService({ sortBy: { key, order: 'desc' } }).getCustomers();
      expect(pipelineOf()[1]).toEqual({ $sort: { createdAt: -1 } });
    }
    customerModel.aggregate.mockClear();
    await makeService({ sortBy: { key: 'metrics.totalSpent', order: 'desc' } }).getCustomers();
    expect(pipelineOf()[1]).toEqual({ $sort: { 'metrics.totalSpent': -1 } });
  });

  it('[MEVCUT DAVRANIŞ] sortBy.order yalnızca tam "desc" ise -1 verir; başka HER değer (ör. "asc", "garbage", eksik) 1 verir (order-service\'in "asc" dışındaki HER şeyi -1 yapan tersine mantığından FARKLI)', async () => {
    await makeService({ sortBy: { key: 'email', order: 'desc' } }).getCustomers();
    expect(pipelineOf()[1]).toEqual({ $sort: { email: -1 } });

    customerModel.aggregate.mockClear();
    await makeService({ sortBy: { key: 'email', order: 'garbage' } }).getCustomers();
    expect(pipelineOf()[1]).toEqual({ $sort: { email: 1 } });
  });

  it('[MEVCUT DAVRANIŞ] globalSearch: 6 alanda KAÇIŞLI case-insensitive $regex ile $or kurulur (GV-01)', async () => {
    await makeService({ searchCustomerForm: { data: { globalSearch: '(a+)+$' } } }).getCustomers();
    const re = { $regex: '\\(a\\+\\)\\+\\$', $options: 'i' };
    expect(pipelineOf()[0]).toEqual({
      $match: { $or: [{ firstName: re }, { lastName: re }, { email: re }, { phone: re }, { taxNumber: re }, { companyName: re }] },
    });
  });

  it('[MEVCUT DAVRANIŞ] cities/tags $in ile eklenir (boş dizi eklenmez); status eşitlikle eklenir', async () => {
    await makeService({ searchCustomerForm: { data: { cities: ['İstanbul'], tags: ['vip'], status: 'active' } } }).getCustomers();
    expect(pipelineOf()[0]).toEqual({
      $match: { 'addresses.city': { $in: ['İstanbul'] }, tags: { $in: ['vip'] }, status: 'active' },
    });

    customerModel.aggregate.mockClear();
    await makeService({ searchCustomerForm: { data: { cities: [], tags: [] } } }).getCustomers();
    expect(pipelineOf()[0]).toEqual({ $match: {} });
  });

  it('[MEVCUT DAVRANIŞ] $addFields ile returnRate/netRevenue hesaplama ifadeleri pipeline\'a EKLENİR (statik ifade; veri Mongo\'da hesaplanır, burada yalnızca şekil sabitlenir)', async () => {
    await makeService({}).getCustomers();
    const addFields = (pipelineOf()[2] as any).$facet.data[2].$addFields;
    expect(addFields.returnRate.$cond[0]).toEqual({ $gt: ['$metrics.totalOrderCount', 0] });
    expect(addFields.netRevenue.$subtract).toEqual([{ $ifNull: ['$metrics.totalSpent', 0] }, { $ifNull: ['$metrics.totalReturnAmount', 0] }]);
  });

  it('[MEVCUT DAVRANIŞ] pagination: page/limit normalize edilir (page<1 -> 1, limit>200 -> 200, limit<1 -> varsayılan 15)', async () => {
    await makeService({ pagination: { page: 0, limit: 100000 } }).getCustomers();
    const facet = (pipelineOf()[2] as any).$facet;
    expect(facet.data[0]).toEqual({ $skip: 0 });
    expect(facet.data[1]).toEqual({ $limit: 200 });

    customerModel.aggregate.mockClear();
    await makeService({ pagination: { page: 2, limit: 0 } }).getCustomers();
    expect((pipelineOf()[2] as any).$facet.data[0]).toEqual({ $skip: 15 });
    expect((pipelineOf()[2] as any).$facet.data[1]).toEqual({ $limit: 15 });
  });

  it('[MEVCUT DAVRANIŞ] toplam/sayfa sayısı metadata.total\'dan hesaplanır; metadata boşsa 0 kayıt / 1 sayfa', async () => {
    await expect(makeService({}).getCustomers()).resolves.toEqual({ totalNumberOfRecords: 0, totalNumberOfPages: 1, customers: [] });

    customerModel.aggregate.mockResolvedValue([{ metadata: [{ total: 31 }], data: [{ _id: 'a' }] }]);
    await expect(makeService({ pagination: { page: 1, limit: 15 } }).getCustomers()).resolves.toEqual({
      totalNumberOfRecords: 31, totalNumberOfPages: 3, customers: [{ _id: 'a' }],
    });
  });

  it('[MEVCUT DAVRANIŞ] hata console.error ile loglanıp olduğu gibi yeniden fırlatılır', async () => {
    customerModel.aggregate.mockRejectedValue(new Error('agg fail'));
    await expect(makeService({}).getCustomers()).rejects.toThrow('agg fail');
    expect(console.error).toHaveBeenCalled();
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] $match içinde clientId/tenant alanı YOK (yalnızca istemci filtreleri); sorgu izolasyonu clientDB seçimine bağlıdır', async () => {
    await makeService({ searchCustomerForm: { data: { status: 'active' } } }, 99).getCustomers();
    expect(JSON.stringify(pipelineOf()[0])).not.toMatch(/clientId/i);
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] iki farklı tenant/clientDB ile çağrıldığında her biri YALNIZ kendi clientDB\'sinin modelini çağırır (çapraz-tenant sızıntısı yok)', async () => {
    const customerModelA = { aggregate: jest.fn(async () => [{ metadata: [], data: [] }]) };
    const customerModelB = { aggregate: jest.fn(async () => [{ metadata: [], data: [] }]) };
    const clientDbA = { getCustomerModel: jest.fn(() => customerModelA), getOrderModel: jest.fn(), getClaimModel: jest.fn() };
    const clientDbB = { getCustomerModel: jest.fn(() => customerModelB), getOrderModel: jest.fn(), getClaimModel: jest.fn() };

    await makeService({}, 1, clientDbA).getCustomers();
    await makeService({}, 2, clientDbB).getCustomers();

    expect(customerModelA.aggregate).toHaveBeenCalledTimes(1);
    expect(customerModelB.aggregate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('CustomerService.getCustomerDetail', () => {
  it('[MEVCUT DAVRANIŞ] customerId yoksa "Müşteri ID gerekli" hatası; hiçbir model çağrılmaz', async () => {
    await expect(makeService({}).getCustomerDetail()).rejects.toThrow('Müşteri ID gerekli');
    expect(customerModel.findById).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] müşteri bulunamazsa "Müşteri bulunamadı" hatası; recentOrders/recentClaims sorgulanmaz', async () => {
    await expect(makeService({ customerId: CUSTOMER_ID }).getCustomerDetail()).rejects.toThrow('Müşteri bulunamadı');
    expect(orderModel.find).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] mutlu yol: recentOrders/recentClaims customerId ile (createdAt:-1, limit 20) getirilir; insights hesaplanır', async () => {
    customerModel.findById.mockReturnValue(chain({ _id: CUSTOMER_ID, metrics: { totalSpent: 1000, totalReturnAmount: 200, totalOrderCount: 10, totalClaimCount: 2 } }));
    orderModel.find.mockReturnValue(chain([{ _id: 'o1' }]));
    claimModel.find.mockReturnValue(chain([{ _id: 'cl1' }]));

    const res = await makeService({ customerId: CUSTOMER_ID }).getCustomerDetail();

    const [filter] = orderModel.find.mock.calls[0];
    expect(filter.customerId.toString()).toBe(CUSTOMER_ID);
    const orderChain = orderModel.find.mock.results[0].value;
    expect(orderChain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(orderChain.limit).toHaveBeenCalledWith(20);

    expect(res.recentOrders).toEqual([{ _id: 'o1' }]);
    expect(res.recentClaims).toEqual([{ _id: 'cl1' }]);
    expect(res.insights).toEqual({ netRevenue: 800, returnRate: 20, customerScore: 10 }); // (10*2)-(2*5)=10
  });

  it('[MEVCUT DAVRANIŞ] metrics yoksa tüm değerler 0 kabul edilir: netRevenue 0, returnRate 0, customerScore 0', async () => {
    customerModel.findById.mockReturnValue(chain({ _id: CUSTOMER_ID }));
    const res = await makeService({ customerId: CUSTOMER_ID }).getCustomerDetail();
    expect(res.insights).toEqual({ netRevenue: 0, returnRate: 0, customerScore: 0 });
  });

  it('[MEVCUT DAVRANIŞ] customerScore Math.min(20,...) ile 20\'de, Math.max(0,...) ile 0\'da sınırlanır (uç değerler)', async () => {
    customerModel.findById.mockReturnValue(chain({ _id: CUSTOMER_ID, metrics: { totalOrderCount: 1000, totalClaimCount: 0 } }));
    let res = await makeService({ customerId: CUSTOMER_ID }).getCustomerDetail();
    expect(res.insights.customerScore).toBe(20);

    customerModel.findById.mockReturnValue(chain({ _id: CUSTOMER_ID, metrics: { totalOrderCount: 0, totalClaimCount: 1000 } }));
    res = await makeService({ customerId: CUSTOMER_ID }).getCustomerDetail();
    expect(res.insights.customerScore).toBe(0);
  });

  it('[MEVCUT DAVRANIŞ] mevcut customer.insights alanları SPREAD ile KORUNUR, sadece hesaplanan 3 alan üstüne yazılır', async () => {
    customerModel.findById.mockReturnValue(chain({ _id: CUSTOMER_ID, insights: { customLabel: 'VIP' }, metrics: { totalOrderCount: 1, totalClaimCount: 0 } }));
    const res = await makeService({ customerId: CUSTOMER_ID }).getCustomerDetail();
    expect(res.insights).toMatchObject({ customLabel: 'VIP', customerScore: 2 });
  });

  it('[MEVCUT DAVRANIŞ] hata console.error ile loglanıp yeniden fırlatılır (ör. recentOrders sorgusu patlarsa)', async () => {
    customerModel.findById.mockReturnValue(chain({ _id: CUSTOMER_ID }));
    orderModel.find.mockImplementation(() => { throw new Error('order db down'); });
    await expect(makeService({ customerId: CUSTOMER_ID }).getCustomerDetail()).rejects.toThrow('order db down');
    expect(console.error).toHaveBeenCalled();
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] recentOrders/recentClaims sorguları clientId/tenant alanı içermez (yalnızca customerId); izolasyon clientDB seçimine bağlıdır', async () => {
    customerModel.findById.mockReturnValue(chain({ _id: CUSTOMER_ID }));
    await makeService({ customerId: CUSTOMER_ID }, 99).getCustomerDetail();
    const [orderFilter] = orderModel.find.mock.calls[0];
    const [claimFilter] = claimModel.find.mock.calls[0];
    expect(Object.keys(orderFilter)).toEqual(['customerId']);
    expect(Object.keys(claimFilter)).toEqual(['customerId']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('CustomerService.updateCustomer', () => {
  it('[MEVCUT DAVRANIŞ] mutlu yol: findByIdAndUpdate(customerId, updateData) İKİ argümanla (options/runValidators YOK) çağrılır; her zaman {success:true} döner', async () => {
    const res = await makeService({ customerId: CUSTOMER_ID, updateData: { firstName: 'Yeni' } }).updateCustomer();
    expect(customerModel.findByIdAndUpdate).toHaveBeenCalledWith(CUSTOMER_ID, { firstName: 'Yeni' });
    expect(customerModel.findByIdAndUpdate.mock.calls[0]).toHaveLength(2);
    expect(res).toEqual({ success: true });
  });

  it('[MEVCUT DAVRANIŞ - BULGU, bkz. BACKLOG.md] customerId/updateData olmasa BİLE (undefined,undefined) ile çağrı yapılır ve yine {success:true} döner: girdi doğrulaması YOK (MM-08/GV-06 ile aynı aile)', async () => {
    const res = await makeService({}).updateCustomer();
    expect(customerModel.findByIdAndUpdate).toHaveBeenCalledWith(undefined, undefined);
    expect(res).toEqual({ success: true });
  });

  it('[MEVCUT DAVRANIŞ] findByIdAndUpdate\'in dönüş değeri (bulundu/bulunamadı) HİÇ kontrol edilmez: null dönse bile {success:true}', async () => {
    customerModel.findByIdAndUpdate.mockResolvedValue(null);
    await expect(makeService({ customerId: 'yok', updateData: {} }).updateCustomer()).resolves.toEqual({ success: true });
  });

  it('[MEVCUT DAVRANIŞ] DB hatası console.error ile loglanıp yeniden fırlatılır', async () => {
    customerModel.findByIdAndUpdate.mockRejectedValue(new Error('cast error'));
    await expect(makeService({ customerId: CUSTOMER_ID, updateData: {} }).updateCustomer()).rejects.toThrow('cast error');
    expect(console.error).toHaveBeenCalled();
  });
});

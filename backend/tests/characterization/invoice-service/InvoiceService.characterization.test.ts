/**
 * CHARACTERIZATION: InvoiceService (backend/src/api/rpc/handlers/invoice-service.ts)
 *
 * Kapsam: createManualInvoice, getInvoices, deleteInvoice, createInvoice, bulkCreateInvoice,
 * resolveAndReissueInvoice, syncInvoiceToPlatform (private, createInvoice üzerinden dolaylı).
 *
 * DatabaseManager/IntegrationFactory jest.mock ile değiştirilir; clientDB sahte model nesneleridir.
 * DB/Redis/ağ/pazaryeri YOK; veriler sentetiktir. Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut davranış
 * sabitlenir (Protokol 13).
 *
 * Tenant izolasyonu (PLATFORM_BASELINE B2): InvoiceService içindeki HİÇBİR sorgu clientId ile
 * filtrelemez; izolasyon tamamen `this.clientDB` (tenant başına ayrı Mongo bağlantısı) seçimine
 * dayanır (order-service/claim-service ile AYNI mimari desen). `clientId` yalnızca
 * `new IntegrationFactory(Number(this.currentClientId))` için kullanılır (syncInvoiceToPlatform).
 *
 * BULGU (bkz. BACKLOG.md "İncelenmesi gereken davranışlar"): `createInvoice` içinde
 * `hasIntegratedProvider` SABİT `false`dur (henüz gerçek bir e-fatura entegratörü yok — CLAUDE.md
 * "Shipping/e-invoice ... exist only as UI forms"). `bulkCreateInvoice` her sipariş için `this.request`'i
 * yalnızca `{ orderId }` ile YENİDEN KURAR (invoiceData YOK), bu yüzden `createInvoice` HER ZAMAN
 * `OPEN_MANUAL_INVOICE_FORM` dalına düşer ve `success:false` döner -> bulkCreateInvoice'daki HER
 * kayıt "failed" listesine düşer (bu kök neden HÂLÂ AÇIK — gerçek e-fatura entegratörü bağlanana
 * kadar bu uç fiilen kullanılamaz durumda, ayrı/insan kararı gerektirir).
 *
 * [DÜZELTİLDİ, 2026-09-29, orkestratör] Dış zarfın `success` alanı ÖNCEDEN koşulsuz `true` dönerdi
 * (failedCount tüm siparişlere eşit olsa bile) — OrderService/ClaimService'in bulk uçlarındaki
 * "hepsi başarısızsa success:false" asimetrisinden FARKLIYDI. `claim-service.ts bulkApproveClaim`
 * ile AYNI desene (`success: failedCount===0`) getirildi; ilgili test kasıtlı ters çevrildi.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import InvoiceService from '@api/rpc/handlers/invoice-service';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { captureLogs, type LogCapture } from '../../helpers/logCapture';

// F-06 (ADR-0024 P4): api/** console -> eventLog; loglar stdout JSON satırlarından doğrulanır.
let cap: LogCapture;
beforeEach(() => { cap = captureLogs(); });
afterEach(() => { cap.restore(); });

const factoryCtor = IntegrationFactory as unknown as jest.Mock<any>;

let orderModel: any;
let invoiceModel: any;
let instance: any;
let getInstance: jest.Mock<any>;

/** `.lean()`ile biten basit zincir (findOne). */
function chain(result: any) {
  const c: any = {};
  c.lean = jest.fn(async () => result);
  return c;
}

/**
 * Mongoose `findById(...)` Query nesnesi taklidi: hem DOĞRUDAN `await` edilebilir (thenable) hem de
 * `.select(...)` ile zincirlenebilir (InvoiceService iki farklı kullanım biçimini de kullanıyor:
 * `bulkCreateInvoice` -> `findById(id).select('orderNumber')`, `createInvoice` -> `await findById(id)`).
 */
function findByIdChain(result: any) {
  const c: any = {};
  c.select = jest.fn(() => c);
  c.then = (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function makeService(request: any, clientId: any = 42, clientDb?: any) {
  const svc: any = new InvoiceService(clientId, request);
  svc.clientDB = clientDb || {
    getOrderModel: jest.fn(() => orderModel),
    getInvoiceModel: jest.fn(() => invoiceModel),
  };
  return svc;
}

function makeOrder(over: any = {}) {
  return {
    _id: 'o1', orderNumber: 'ORD-1', externalOrderId: 'EXT-1', integrationCode: 'trendyol',
    internalStatus: 'APPROVED', customerId: 'cust-1',
    financials: { grandTotal: 500, currencyCode: 'TRY' },
    ...over,
  };
}

beforeEach(() => {
  orderModel = {
    findOne: jest.fn(() => chain(null)),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    findById: jest.fn(() => findByIdChain(makeOrder())),
    findByIdAndUpdate: jest.fn(async () => ({ _id: 'o1', updated: true })),
  };
  invoiceModel = {
    findByIdAndDelete: jest.fn(async () => null),
    findOneAndUpdate: jest.fn(async (_f: any, update: any) => ({ _id: 'inv1', ...update.$set })),
    updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
    aggregate: jest.fn(async () => [{ totalNumberOfRecords: [{ count: 0 }], invoices: [] }]),
  };
  instance = { sendOrderInvoice: jest.fn(async () => ({ success: true, rawResponse: { ok: true } })) };
  getInstance = jest.fn(async () => instance);
  factoryCtor.mockReset();
  factoryCtor.mockImplementation(() => ({ getInstance }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe('InvoiceService - tenant / clientId kullanımı', () => {
  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] getInvoices $match içinde clientId/tenant alanı YOK; izolasyon clientDB seçimine bağlıdır', async () => {
    await makeService({ filters: { type: 'SALES' } }, 99).getInvoices();
    const pipe = invoiceModel.aggregate.mock.calls[0][0] as any[];
    expect(JSON.stringify(pipe[0])).not.toMatch(/clientId/i);
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] iki farklı tenant/clientDB ile çağrıldığında her biri YALNIZ kendi clientDB\'sinin modelini çağırır', async () => {
    const invoiceModelA = { aggregate: jest.fn(async () => [{ totalNumberOfRecords: [], invoices: [] }]) };
    const invoiceModelB = { aggregate: jest.fn(async () => [{ totalNumberOfRecords: [], invoices: [] }]) };
    const clientDbA = { getOrderModel: jest.fn(), getInvoiceModel: jest.fn(() => invoiceModelA) };
    const clientDbB = { getOrderModel: jest.fn(), getInvoiceModel: jest.fn(() => invoiceModelB) };

    await makeService({}, 1, clientDbA).getInvoices();
    await makeService({}, 2, clientDbB).getInvoices();

    expect(invoiceModelA.aggregate).toHaveBeenCalledTimes(1);
    expect(invoiceModelB.aggregate).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] syncInvoiceToPlatform (createInvoice üzerinden): IntegrationFactory tenant clientId\'si Number() ile oluşturulur', async () => {
    const svc = makeService({ orderId: 'o1', invoiceData: { invoiceNumber: 'INV-1' } }, '42');
    await svc.createInvoice();
    expect(factoryCtor).toHaveBeenCalledWith(42);
  });
});

// ---------------------------------------------------------------------------------------------
describe('InvoiceService.createManualInvoice', () => {
  it('[MEVCUT DAVRANIŞ] data yoksa {success:false, message} döner (throw ETMEZ)', async () => {
    await expect(makeService({}).createManualInvoice()).resolves.toEqual({ success: false, message: 'Fatura verisi boş olamaz.' });
  });

  it('[MEVCUT DAVRANIŞ] ettn verilmezse "SYS-MANUAL-<timestamp>" üretilir; sipariş eşleşmezse yalnızca Invoice kaydı oluşturulur, Order güncellenmez', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    const saveFn = jest.fn(async function (this: any) { return this; });
    const Ctor: any = jest.fn(function (this: any, payload: any) { Object.assign(this, payload); this.save = saveFn; });
    const svc = makeService({ data: { totalAmount: '150.5' } });
    svc.clientDB.getInvoiceModel = jest.fn(() => Ctor);
    const res = await svc.createManualInvoice();

    expect(Ctor).toHaveBeenCalledWith(expect.objectContaining({
      integrationCode: 'MANUAL', invoiceMethod: 'MANUAL', ettn: 'SYS-MANUAL-' + Date.now(),
      status: 'APPROVED', totalAmount: 150.5, currency: 'TRY',
    }));
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(orderModel.updateOne).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, message: 'Fatura başarıyla sisteme kaydedildi.' });
  });

  it('[MEVCUT DAVRANIŞ] externalOrderId eşleşen sipariş varsa orderId/customerId/integrationCode kopyalanır VE Order flags.isInvoiceGenerated=true / invoice.status=SUCCESS yapılır', async () => {
    const saveFn = jest.fn(async function (this: any) { return this; });
    const Ctor: any = jest.fn(function (this: any, payload: any) { Object.assign(this, payload); this.save = saveFn; });
    const svc = makeService({ data: { externalOrderId: 'EXT-1' } });
    svc.clientDB.getInvoiceModel = jest.fn(() => Ctor);
    orderModel.findOne.mockReturnValue(chain(makeOrder({ _id: 'oX', customerId: 'custX', integrationCode: 'n11' })));

    await svc.createManualInvoice();

    expect(Ctor).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'oX', customerId: 'custX', integrationCode: 'n11' }));
    expect(orderModel.updateOne).toHaveBeenCalledWith({ _id: 'oX' }, { $set: { 'flags.isInvoiceGenerated': true, 'invoice.status': 'SUCCESS' } });
  });

  it('[MEVCUT DAVRANIŞ] ETTN/Fatura no çakışması (Mongo 11000) throw ETMEZ, dostane {success:false} mesajı döner', async () => {
    const saveFn = jest.fn(async () => { const e: any = new Error('dup'); e.code = 11000; throw e; });
    const Ctor: any = jest.fn(function (this: any) { this.save = saveFn; });
    const svc = makeService({ data: {} });
    svc.clientDB.getInvoiceModel = jest.fn(() => Ctor);
    await expect(svc.createManualInvoice()).resolves.toEqual({ success: false, message: 'Bu ETTN veya Fatura no ile kayıt zaten mevcut!' });
  });

  it('[MEVCUT DAVRANIŞ] diğer hatalarda error.message (yoksa jenerik mesaj) ile {success:false} döner', async () => {
    const saveFn = jest.fn(async () => { throw new Error('disk full'); });
    const Ctor: any = jest.fn(function (this: any) { this.save = saveFn; });
    const svc = makeService({ data: {} });
    svc.clientDB.getInvoiceModel = jest.fn(() => Ctor);
    await expect(svc.createManualInvoice()).resolves.toEqual({ success: false, message: 'disk full' });
  });
});

// ---------------------------------------------------------------------------------------------
describe('InvoiceService.getInvoices', () => {
  const pipelineOf = () => invoiceModel.aggregate.mock.calls[0][0] as any[];

  it('[MEVCUT DAVRANIŞ] filtresiz/sortBy yoksa varsayılan sort {createdAt:-1}; sayfa1/limit15', async () => {
    await makeService({}).getInvoices();
    const pipe = pipelineOf();
    expect(pipe[0]).toEqual({ $match: {} });
    expect(pipe[5]).toEqual({ $sort: { createdAt: -1 } });
    expect((pipe[6] as any).$facet.invoices).toEqual([{ $skip: 0 }, { $limit: 15 }]);
  });

  it('[MEVCUT DAVRANIŞ] sortBy verilirse order "asc" -> 1, HER BAŞKA değer -1 (order-service ile AYNI kural, customer-service ile FARKLI)', async () => {
    await makeService({ sortBy: { key: 'totalAmount', order: 'asc' } }).getInvoices();
    expect(pipelineOf()[5]).toEqual({ $sort: { totalAmount: 1 } });

    invoiceModel.aggregate.mockClear();
    await makeService({ sortBy: { key: 'totalAmount', order: 'garbage' } }).getInvoices();
    expect(pipelineOf()[5]).toEqual({ $sort: { totalAmount: -1 } });
  });

  it('[DÜZELTME, MM-08, KASITLI TERS ÇEVRİLDİ] sortBy.key artık İZİN LİSTESİYLE doğrulanır — bilinmeyen alan 400 fırlatır (eskiden $sort\'a doğrudan yazılıyordu)', async () => {
    // OrderService.getOrders'ın ADR-0021/GV-01 ile kapattığı AYNI riski (keyfi alan adı $sort'a yazılabiliyordu) kapatır.
    for (const key of ['$where', 'password', 'billingAddress.phone', { $gt: 1 }]) {
      await expect(makeService({ sortBy: { key, order: 'asc' } }).getInvoices()).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('[DÜZELTME, MM-08] izin listesindeki HER alan geçer ve direction doğru uygulanır', async () => {
    for (const key of ['createdAt', 'invoiceNumber', 'issueDate', 'totalAmount', 'status']) {
      invoiceModel.aggregate.mockClear();
      await makeService({ sortBy: { key, order: 'desc' } }).getInvoices();
      expect(pipelineOf()[5]).toEqual({ $sort: { [key]: -1 } });
    }
  });

  it('[DÜZELTME, MM-08] sortBy verilir ama .key eksikse (ör. {}) varsayılan {createdAt:-1} kullanılır (eskiden sortBy["undefined"]=dir gibi tuhaf bir anahtar üretiyordu)', async () => {
    await makeService({ sortBy: {} }).getInvoices();
    expect(pipelineOf()[5]).toEqual({ $sort: { createdAt: -1 } });
  });

  it('[MEVCUT DAVRANIŞ] Orders/Customers $lookup + $unwind (preserveNullAndEmptyArrays) HER ZAMAN pipeline\'a eklenir', async () => {
    await makeService({}).getInvoices();
    const pipe = pipelineOf();
    expect(pipe[1]).toEqual({ $lookup: { from: 'Orders', localField: 'orderId', foreignField: '_id', as: 'order' } });
    expect(pipe[2]).toEqual({ $unwind: { path: '$order', preserveNullAndEmptyArrays: true } });
    expect(pipe[3]).toEqual({ $lookup: { from: 'Customers', localField: 'customerId', foreignField: '_id', as: 'customer' } });
    expect(pipe[4]).toEqual({ $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } });
  });

  it('[MEVCUT DAVRANIŞ] filters.status/type/startDate/endDate ve search (3 alanda KAÇIŞLI $regex, GV-01) $match\'e eklenir', async () => {
    await makeService({
      filters: { status: ['APPROVED'], type: 'SALES', startDate: '2026-01-01', endDate: '2026-01-10' },
      search: 'INV(1)',
    }).getInvoices();
    const match = (pipelineOf()[0] as any).$match;
    expect(match.status).toEqual({ $in: ['APPROVED'] });
    expect(match.type).toBe('SALES');
    expect(match.issueDate.$gte).toEqual(new Date('2026-01-01'));
    expect(match.issueDate.$lte.getHours()).toBe(23);
    expect(match.issueDate.$lte.getMinutes()).toBe(59);
    const re = { $regex: 'INV\\(1\\)', $options: 'i' };
    expect(match.$or).toEqual([{ invoiceNumber: re }, { externalOrderId: re }, { integrationCode: re }]);
  });

  it('[MEVCUT DAVRANIŞ] pagination üst sınırı: limit>200 -> 200', async () => {
    await makeService({ pagination: { page: 1, limit: 100000 } }).getInvoices();
    expect((pipelineOf()[6] as any).$facet.invoices).toEqual([{ $skip: 0 }, { $limit: 200 }]);
  });

  it('[MEVCUT DAVRANIŞ] totalNumberOfRecords/invoices facet\'ten okunur; sonuç boşsa 0/[]', async () => {
    invoiceModel.aggregate.mockResolvedValue([]);
    await expect(makeService({}).getInvoices()).resolves.toEqual({ totalNumberOfRecords: 0, invoices: [] });
  });

  it('[MEVCUT DAVRANIŞ] hata console.error KULLANMADAN (diğer servislerden farklı) olduğu gibi yeniden fırlatılır', async () => {
    invoiceModel.aggregate.mockRejectedValue(new Error('agg fail'));
    await expect(makeService({}).getInvoices()).rejects.toThrow('agg fail');
  });
});

// ---------------------------------------------------------------------------------------------
describe('InvoiceService.deleteInvoice', () => {
  it('[MEVCUT DAVRANIŞ] invoiceId yoksa hata; hiçbir model çağrılmaz', async () => {
    await expect(makeService({}).deleteInvoice()).rejects.toThrow('Fatura ID gereklidir.');
    expect(invoiceModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] bulunamazsa/zaten silinmişse hata (findByIdAndDelete null)', async () => {
    await expect(makeService({ invoiceId: 'inv1' }).deleteInvoice()).rejects.toThrow('Fatura bulunamadı veya daha önce silinmiş.');
  });

  it('[MEVCUT DAVRANIŞ] silinen faturanın orderId\'si varsa Order.flags.isInvoiceGenerated=false yapılır', async () => {
    invoiceModel.findByIdAndDelete.mockResolvedValue({ _id: 'inv1', orderId: 'o1' });
    const res = await makeService({ invoiceId: 'inv1' }).deleteInvoice();
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledWith('o1', { $set: { 'flags.isInvoiceGenerated': false } });
    expect(res).toEqual({ success: true, message: 'Fatura başarıyla silindi.' });
  });

  it('[MEVCUT DAVRANIŞ] silinen faturada orderId YOKSA Order güncellenmez', async () => {
    invoiceModel.findByIdAndDelete.mockResolvedValue({ _id: 'inv1' });
    await makeService({ invoiceId: 'inv1' }).deleteInvoice();
    expect(orderModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
describe('InvoiceService.createInvoice', () => {
  it('[MEVCUT DAVRANIŞ - BULGU] hasIntegratedProvider SABİT false: invoiceData VERİLMEZSE her zaman OPEN_MANUAL_INVOICE_FORM ile success:false döner, hiçbir DB yazımı/platform çağrısı yapılmaz', async () => {
    const res = await makeService({ orderId: 'o1' }).createInvoice();
    expect(res).toEqual({ success: false, action: 'OPEN_MANUAL_INVOICE_FORM', message: 'Fatura bilgileri eksik. Lütfen manuel giriş yapın.' });
    expect(invoiceModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(factoryCtor).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] sipariş bulunamazsa "Sipariş bulunamadı." hatası', async () => {
    orderModel.findById.mockResolvedValue(null);
    await expect(makeService({ orderId: 'x' }).createInvoice()).rejects.toThrow('Sipariş bulunamadı.');
  });

  it('[MEVCUT DAVRANIŞ] mutlu yol: invoiceData verilirse upsert edilir, platforma iletilir (success), sonra Order.dates.invoiceDate + invoice + flags.isInvoiceGenerated=true set edilir + history push', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-01T10:00:00Z'));
    const res = await makeService({ orderId: 'o1', invoiceData: { invoiceNumber: 'INV-9', ettn: 'ETTN-9' } }).createInvoice();

    const [filter, update, opts] = invoiceModel.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ orderId: 'o1', type: 'SALES' });
    expect(opts).toEqual({ upsert: true, new: true });
    expect(update.$set).toMatchObject({ integrationCode: 'trendyol', invoiceNumber: 'INV-9', ettn: 'ETTN-9', type: 'SALES', status: 'APPROVED' });

    expect(instance.sendOrderInvoice).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'EXT-1', invoiceNumber: 'INV-9' }));

    // findByIdAndUpdate 2 kez çağrılır: [0] syncInvoiceToPlatform'un platformActions LOG kaydı, [1] KÖK sipariş güncellemesi.
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    expect(orderModel.findByIdAndUpdate.mock.calls[0][1]).toMatchObject({ $push: { platformActions: { status: 'SUCCESS' } } });
    const [id, orderUpdate] = orderModel.findByIdAndUpdate.mock.calls[1];
    expect(id).toBe('o1');
    expect(orderUpdate.$set['flags.isInvoiceGenerated']).toBe(true);
    expect(orderUpdate.$set.invoice.status).toBe('SUCCESS');
    expect(orderUpdate.$push.history.description).toBe('Fatura oluşturuldu ve pazaryerine başarıyla iletildi.');

    expect(res).toEqual({ success: true, message: 'Fatura başarıyla işlendi ve platforma iletildi.', data: { order: { _id: 'o1', updated: true }, invoice: expect.anything() } });
  });

  it('[MEVCUT DAVRANIŞ] platform bildirimi success:false dönerse (throw DEĞİL) Order KÖK şeması güncellenmez, dostane mesajla success:false döner', async () => {
    instance.sendOrderInvoice.mockResolvedValue({ success: false, message: 'Pazaryeri: geçersiz belge.' });
    const res = await makeService({ orderId: 'o1', invoiceData: { invoiceNumber: 'INV-1' } }).createInvoice();
    expect(res).toEqual({
      success: false,
      message: 'Fatura oluşturuldu ancak pazaryerine iletilemedi: Pazaryeri: geçersiz belge.',
      data: { invoice: expect.anything() },
    });
    // syncInvoiceToPlatform YİNE DE platformActions LOG kaydı yazar (status FAILED); başarı güncellemesi
    // (dates.invoiceDate/invoice SUCCESS/flags.isInvoiceGenerated) YAPILMAZ.
    // [BİLİNÇLİ DEĞİŞİKLİK, eslesme-fiyat WP6 F-P1-2(e)] 2. çağrı artık başarısızlığı işler: invoice.status FAILED + denetim izi
    // (eskiden sipariş özetinde hiç iz kalmıyordu); isInvoiceGenerated DOKUNULMAZ.
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    expect(orderModel.findByIdAndUpdate.mock.calls[0][1]).toMatchObject({ $push: { platformActions: { status: 'FAILED' } } });
    const failUpd = orderModel.findByIdAndUpdate.mock.calls[1][1];
    expect(failUpd.$set['invoice.status']).toBe('FAILED');
    expect(failUpd.$set['flags.isInvoiceGenerated']).toBeUndefined();
    expect(failUpd.$push.history.action).toBe('INVOICE_FAILED');
  });

  it('[MEVCUT DAVRANIŞ] platform entegrasyonu sendOrderInvoice DESTEKLEMİYORSA (metod yok) sessizce success:true sayılır ve akış NORMAL devam eder (platforma HİÇ bildirim gitmez)', async () => {
    instance.sendOrderInvoice = undefined;
    const res = await makeService({ orderId: 'o1', invoiceData: { invoiceNumber: 'INV-1' } }).createInvoice();
    expect(res.success).toBe(true);
    expect(orderModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('[MEVCUT DAVRANIŞ] syncInvoiceToPlatform içindeki İSTİSNA (IntegrationFactory/adapter hatası) DIŞARI FIRLATILMAZ, {success:false, message} olarak YUTULUR; createInvoice dostane mesajla devam eder', async () => {
    getInstance.mockRejectedValue(new Error('adapter crashed'));
    const res = await makeService({ orderId: 'o1', invoiceData: { invoiceNumber: 'INV-1' } }).createInvoice();
    expect(res).toEqual({
      success: false,
      message: 'Fatura oluşturuldu ancak pazaryerine iletilemedi: adapter crashed',
      data: { invoice: expect.anything() },
    });
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error' })); // F-06: console.error -> eventLog
  });

  it('[MEVCUT DAVRANIŞ] Mongo 11000 (aynı sipariş için fatura kaydı) özel mesajla YENİDEN fırlatılır (orijinal hata mesajı DEĞİL)', async () => {
    const dupErr: any = new Error('E11000 duplicate key'); dupErr.code = 11000;
    invoiceModel.findOneAndUpdate.mockRejectedValue(dupErr);
    await expect(makeService({ orderId: 'o1', invoiceData: {} }).createInvoice()).rejects.toThrow('Bu sipariş için zaten bir fatura kaydı mevcut.');
  });
});

// ---------------------------------------------------------------------------------------------
describe('InvoiceService.bulkCreateInvoice', () => {
  it.each([[undefined], [[]], ['x']])('[MEVCUT DAVRANIŞ] orderIds=%p -> hata fırlatılır', async (ids) => {
    await expect(makeService({ orderIds: ids }).bulkCreateInvoice()).rejects.toThrow('Lütfen işlem yapılacak en az bir sipariş seçin.');
  });

  it('[DÜZELTİLDİ, 2026-09-29] her sipariş için this.request YALNIZ {orderId} ile YENİDEN KURULUR (invoiceData YOK) -> createInvoice HER ZAMAN OPEN_MANUAL_INVOICE_FORM döner -> TÜM siparişler "failed" olur, dış zarf artık DOĞRU şekilde success:false döner', async () => {
    const res = await makeService({ orderIds: ['o1', 'o2'] }).bulkCreateInvoice();
    expect(res.success).toBe(false); // DÜZELTİLDİ: hepsi başarısızsa üst düzey artık false (claim-service ile TUTARLI)
    expect(res.data.successCount).toBe(0);
    expect(res.data.failedCount).toBe(2);
    expect(res.data.failed).toEqual([
      { orderId: 'o1', orderNumber: 'ORD-1', reason: 'Fatura bilgileri eksik. Lütfen manuel giriş yapın.' },
      { orderId: 'o2', orderNumber: 'ORD-1', reason: 'Fatura bilgileri eksik. Lütfen manuel giriş yapın.' },
    ]);
    expect(res.message).toBe('Toplu fatura işlemi tamamlandı. 0 başarılı, 2 başarısız.');
  });

  it('[MEVCUT DAVRANIŞ] orderNumber ön-arama (select) boş dönerse (ör. yarış durumu) orderNumber olarak orderId\'nin KENDİSİ kullanılır (ayrı bir sonraki adımda sipariş yine de bulunabilir)', async () => {
    // findById iki KERE çağrılır: 1) bulkCreateInvoice'un orderNumber ön-araması (.select), 2) createInvoice'un
    // kendi sipariş sorgusu. Burada 1. çağrı boş (orderRecord=null), 2. çağrı siparişi BULUR -> "Sipariş
    // bulunamadı" hatası YERİNE normal OPEN_MANUAL_INVOICE_FORM dalına düşer ve orderNumber fallback'i görünür olur.
    let call = 0;
    orderModel.findById.mockImplementation(() => {
      call++;
      return call === 1 ? findByIdChain(null) : findByIdChain(makeOrder({ _id: 'missing-order' }));
    });
    const res = await makeService({ orderIds: ['missing-order'] }).bulkCreateInvoice();
    expect(res.data.failed[0]).toEqual({ orderId: 'missing-order', orderNumber: 'missing-order', reason: 'Fatura bilgileri eksik. Lütfen manuel giriş yapın.' });
  });

  it('[MEVCUT DAVRANIŞ] bir sipariş bulunamazsa (createInvoice throw eder) o kayıt "failed"e errorMessage ile düşer, DİĞER siparişler ETKİLENMEZ', async () => {
    orderModel.findById.mockImplementation((id: string) => findByIdChain(id === 'bad' ? null : makeOrder({ _id: id })));
    const res = await makeService({ orderIds: ['bad', 'ok1'] }).bulkCreateInvoice();
    expect(res.data.failed).toEqual([
      { orderId: 'bad', reason: 'Sipariş bulunamadı.' },
      { orderId: 'ok1', orderNumber: 'ORD-1', reason: 'Fatura bilgileri eksik. Lütfen manuel giriş yapın.' },
    ]);
    expect(res.data.failedCount).toBe(2);
  });

  it('[MEVCUT DAVRANIŞ] işlem bitince this.request ORİJİNAL haline geri döner', async () => {
    const originalRequest = { orderIds: ['o1'], extra: 'kept' };
    const svc = makeService(originalRequest);
    await svc.bulkCreateInvoice();
    expect(svc.request).toEqual(originalRequest);
  });
});

// ---------------------------------------------------------------------------------------------
describe('InvoiceService.resolveAndReissueInvoice', () => {
  it('[MEVCUT DAVRANIŞ] sipariş yoksa VEYA platformDiscrepancy.hasDiscrepancy yoksa hata', async () => {
    orderModel.findById.mockResolvedValue(null);
    await expect(makeService({ orderId: 'o1' }).resolveAndReissueInvoice()).rejects.toThrow('Çözümlenecek bir uyumsuzluk bulunamadı.');

    orderModel.findById.mockResolvedValue(makeOrder({ platformDiscrepancy: { hasDiscrepancy: false } }));
    await expect(makeService({ orderId: 'o1' }).resolveAndReissueInvoice()).rejects.toThrow('Çözümlenecek bir uyumsuzluk bulunamadı.');
  });

  it('[MEVCUT DAVRANIŞ] tüm platformItems ACTIVE değilse (hepsi iptal): fatura CANCELLED yapılır, sipariş CANCELLED + toplamlar 0, invoice/discrepancy alanları $unset edilir; createInvoice ÇAĞRILMAZ', async () => {
    orderModel.findById.mockResolvedValue(makeOrder({
      platformDiscrepancy: { hasDiscrepancy: true, platformItems: [{ itemStatus: 'CANCELLED', totalPrice: 100 }] },
    }));
    const res = await makeService({ orderId: 'o1' }).resolveAndReissueInvoice();

    expect(invoiceModel.updateMany).toHaveBeenCalledWith({ orderId: 'o1' }, { $set: { status: 'CANCELLED', cancellationDate: expect.any(Date) } });
    const [id, update] = orderModel.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('o1');
    expect(update.$set).toMatchObject({ internalStatus: 'CANCELLED', 'financials.grandTotal': 0, 'financials.subTotal': 0 });
    // [BİLİNÇLİ DEĞİŞİKLİK, eslesme-fiyat WP6 F-P1-2(c)] şemadaki alan `dates.invoiceDate` (eski `invoicedAt` şemada yoktu).
    expect(update.$unset).toEqual({ invoice: '', 'dates.invoiceDate': '', platformDiscrepancy: '' });
    expect(res).toEqual({ success: true, message: 'Tüm ürünler iptal edildiği için fatura iptal edildi.', data: { _id: 'o1', updated: true } });
    expect(instance.sendOrderInvoice).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] kısmi iptal varsa: items/finansal alanlar güncellenir, statü APPROVED\'a ÇEKİLİR, eski invoice/discrepancy $unset edilir, SONRA createInvoice YENİDEN ÇAĞRILIR (invoiceData OLMADAN -> OPEN_MANUAL_INVOICE_FORM)', async () => {
    orderModel.findById.mockResolvedValue(makeOrder({
      platformDiscrepancy: { hasDiscrepancy: true, platformItems: [{ itemStatus: 'ACTIVE', totalPrice: 150 }, { itemStatus: 'CANCELLED', totalPrice: 50 }] },
    }));
    const res = await makeService({ orderId: 'o1' }).resolveAndReissueInvoice();

    const firstUpdateCall = orderModel.findByIdAndUpdate.mock.calls[0];
    expect(firstUpdateCall[1].$set).toMatchObject({ 'financials.grandTotal': 150, 'financials.subTotal': 150, internalStatus: 'APPROVED', 'flags.isInvoiceGenerated': false });
    expect(invoiceModel.updateMany).toHaveBeenCalledWith({ orderId: 'o1', status: { $ne: 'CANCELLED' } }, { $set: { status: 'CANCELLED', cancellationDate: expect.any(Date) } });
    // createInvoice invoiceData'sız çağrıldığından manuel form dalına düşer
    expect(res).toEqual({ success: false, action: 'OPEN_MANUAL_INVOICE_FORM', message: 'Fatura bilgileri eksik. Lütfen manuel giriş yapın.' });
  });

  it('[MEVCUT DAVRANIŞ] hata console.error ile loglanıp yeniden fırlatılır', async () => {
    orderModel.findById.mockRejectedValue(new Error('db down'));
    await expect(makeService({ orderId: 'o1' }).resolveAndReissueInvoice()).rejects.toThrow('db down');
    expect(cap.lines).toContainEqual(expect.objectContaining({ level: 'error' })); // F-06: console.error -> eventLog
  });
});

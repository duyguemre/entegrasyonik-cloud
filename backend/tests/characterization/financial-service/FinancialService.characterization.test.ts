/**
 * CHARACTERIZATION: FinancialService (backend/src/api/rpc/handlers/financial-service.ts)
 *
 * Kapsam: get, getTransactionData, getCargoInvoices, getFinancialSummary (deprecated), getPayoutDetails
 * (tenant/clientId kullanımı dahil).
 *
 * DatabaseManager jest.mock ile değiştirilir; clientDB sahte model nesneleridir. DB/Redis/ağ YOK;
 * veriler sentetiktir. Kod DEĞİŞTİRİLMEDİ, yalnızca mevcut davranış sabitlenir (Protokol 13).
 *
 * Tenant izolasyonu (PLATFORM_BASELINE B2): FinancialService HİÇBİR entegrasyon/tenant kimliğine
 * bağımlı değildir (IntegrationFactory KULLANMAZ); tüm sorgular filtresiz `this.clientDB` model
 * çağrılarıdır — izolasyon tamamen clientDB (tenant başına ayrı Mongo bağlantısı) seçimine dayanır
 * (order-service/claim-service ile AYNI mimari desen).
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import FinancialService, { CARGO_INVOICES_MAX_ROWS } from '@api/rpc/handlers/financial-service';

let financialModel: any;
let cargoInvoiceModel: any;

function chain(result: any) {
  const c: any = {};
  c.sort = jest.fn(() => c);
  c.skip = jest.fn(() => c);
  c.limit = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

function makeService(request: any, clientId: any = 42, clientDb?: any) {
  const svc: any = new FinancialService(clientId, request);
  svc.clientDB = clientDb || {
    getFinancialTransactionModel: jest.fn(() => financialModel),
    getCargoInvoiceModel: jest.fn(() => cargoInvoiceModel),
  };
  return svc;
}

beforeEach(() => {
  financialModel = {
    countDocuments: jest.fn(async () => 0),
    find: jest.fn(() => chain([])),
    aggregate: jest.fn(async () => []),
  };
  cargoInvoiceModel = { find: jest.fn(() => chain([])) };
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------------------------
describe('FinancialService.get', () => {
  it('[MEVCUT DAVRANIŞ] boş nesne döner (diğer servislerdeki undefined\'dan FARKLI)', async () => {
    await expect(makeService({}).get()).resolves.toEqual({});
  });
});

// ---------------------------------------------------------------------------------------------
describe('FinancialService.getTransactionData', () => {
  it('[MEVCUT DAVRANIŞ] filtresiz çağrı: boş filterQuery, varsayılan sort {transactionDate:-1}, sayfa1/limit20 (diğer servislerin limit15\'inden FARKLI varsayılan)', async () => {
    await makeService({}).getTransactionData();
    expect(financialModel.countDocuments).toHaveBeenCalledWith({});
    const findChain = financialModel.find.mock.results[0].value;
    expect(financialModel.find).toHaveBeenCalledWith({});
    expect(findChain.sort).toHaveBeenCalledWith({ transactionDate: -1 });
    expect(findChain.skip).toHaveBeenCalledWith(0);
    expect(findChain.limit).toHaveBeenCalledWith(20);
  });

  it('[MEVCUT DAVRANIŞ] integrationCodes/transactionTypes $in ile eklenir; externalIdSearch KAÇIŞLI $regex olur (GV-01)', async () => {
    await makeService({ integrationCodes: ['trendyol'], transactionTypes: ['SALE'], externalIdSearch: 'TX(1)' }).getTransactionData();
    expect(financialModel.countDocuments).toHaveBeenCalledWith({
      integrationCode: { $in: ['trendyol'] },
      transactionType: { $in: ['SALE'] },
      externalId: { $regex: 'TX\\(1\\)', $options: 'i' },
    });
  });

  it('[MEVCUT DAVRANIŞ] tarih aralığı transactionDate.$gte/$lte olarak eklenir (SAAT/DAKİKA kırpması YOK, order-service\'in Europe/Istanbul gün-sınırı mantığından FARKLI: ham new Date())', async () => {
    await makeService({ startDate: '2026-01-01T05:00:00Z', endDate: '2026-01-10T05:00:00Z' }).getTransactionData();
    const [filter] = financialModel.countDocuments.mock.calls[0];
    expect(filter.transactionDate).toEqual({ $gte: new Date('2026-01-01T05:00:00Z'), $lte: new Date('2026-01-10T05:00:00Z') });
  });

  it('[MEVCUT DAVRANIŞ] sortBy dizisi (çoklu alan) birleştirilerek uygulanır; "asc" -> 1, HER BAŞKA değer -1', async () => {
    await makeService({ sortBy: [{ key: 'credit', order: 'asc' }, { key: 'debt', order: 'desc' }] }).getTransactionData();
    const findChain = financialModel.find.mock.results[0].value;
    expect(findChain.sort).toHaveBeenCalledWith({ credit: 1, debt: -1 });
  });

  it('[MEVCUT DAVRANIŞ] page/limit clampPage/clampLimit ile normalize edilir (limit varsayılanı 20, sınır 200)', async () => {
    await makeService({ page: 0, limit: 100000 }).getTransactionData();
    const findChain = financialModel.find.mock.results[0].value;
    expect(findChain.skip).toHaveBeenCalledWith(0);
    expect(findChain.limit).toHaveBeenCalledWith(200);
  });

  it('[MEVCUT DAVRANIŞ] countDocuments / find / aggregate PARALEL (Promise.all) çalışır; summary boşsa sıfır özet döner', async () => {
    financialModel.countDocuments.mockResolvedValue(7);
    financialModel.find.mockReturnValue(chain([{ _id: 't1' }]));
    const res = await makeService({}).getTransactionData();
    expect(res).toEqual({
      transactions: [{ _id: 't1' }],
      totalNumberOfRecords: 7,
      summary: { totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 },
    });
  });

  it('[MEVCUT DAVRANIŞ] aggregate sonucu varsa summary DOĞRUDAN result[0] olarak döner', async () => {
    financialModel.aggregate.mockResolvedValue([{ _id: null, totalCredit: 100, totalDebt: 20, totalCargo: 5, netAmount: 75, transactionCount: 3 }]);
    const res = await makeService({}).getTransactionData();
    expect(res.summary).toEqual({ _id: null, totalCredit: 100, totalDebt: 20, totalCargo: 5, netAmount: 75, transactionCount: 3 });
  });

  it('[MEVCUT DAVRANIŞ] filtre ve sonuç sayısı console.log ile loglanır (mevcut debug logu; kod DEĞİŞTİRİLMEDİ)', async () => {
    financialModel.find.mockReturnValue(chain([{ _id: 't1', integrationCode: 'trendyol', transactionType: 'SALE' }]));
    await makeService({}).getTransactionData();
    expect(console.log).toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] hata olduğu gibi yeniden fırlatılır (console.error KULLANILMAZ)', async () => {
    financialModel.countDocuments.mockRejectedValue(new Error('count fail'));
    await expect(makeService({}).getTransactionData()).rejects.toThrow('count fail');
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] filtre nesnesinde clientId/tenant alanı YOK; izolasyon clientDB seçimine bağlıdır', async () => {
    await makeService({ integrationCodes: ['trendyol'] }, 99).getTransactionData();
    const [filter] = financialModel.countDocuments.mock.calls[0];
    expect(JSON.stringify(filter)).not.toMatch(/clientId/i);
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] iki farklı tenant/clientDB ile çağrıldığında her biri YALNIZ kendi clientDB\'sinin modelini çağırır (çapraz-tenant sızıntısı yok)', async () => {
    const modelA = { countDocuments: jest.fn(async () => 0), find: jest.fn(() => chain([])), aggregate: jest.fn(async () => []) };
    const modelB = { countDocuments: jest.fn(async () => 0), find: jest.fn(() => chain([])), aggregate: jest.fn(async () => []) };
    const clientDbA = { getFinancialTransactionModel: jest.fn(() => modelA), getCargoInvoiceModel: jest.fn() };
    const clientDbB = { getFinancialTransactionModel: jest.fn(() => modelB), getCargoInvoiceModel: jest.fn() };

    await makeService({}, 1, clientDbA).getTransactionData();
    await makeService({}, 2, clientDbB).getTransactionData();

    expect(modelA.countDocuments).toHaveBeenCalledTimes(1);
    expect(modelB.countDocuments).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('FinancialService.getCargoInvoices', () => {
  it('[MEVCUT DAVRANIŞ] filtresiz çağrı: boş filtre, sort {transactionDate:-1}, limit CARGO_INVOICES_MAX_ROWS (5000) HER ZAMAN uygulanır (SAYFALAMA YOK)', async () => {
    await makeService({}).getCargoInvoices();
    const findChain = cargoInvoiceModel.find.mock.results[0].value;
    expect(cargoInvoiceModel.find).toHaveBeenCalledWith({});
    expect(findChain.sort).toHaveBeenCalledWith({ transactionDate: -1 });
    expect(findChain.limit).toHaveBeenCalledWith(CARGO_INVOICES_MAX_ROWS);
    expect(CARGO_INVOICES_MAX_ROWS).toBe(5000);
  });

  it('[MEVCUT DAVRANIŞ] integrationCode/invoiceNumber/orderNumber TAM EŞLEŞME (regex DEĞİL) ile filtrelenir', async () => {
    await makeService({ integrationCode: 'n11', invoiceNumber: 'INV-1', orderNumber: 'ORD-1' }).getCargoInvoices();
    expect(cargoInvoiceModel.find).toHaveBeenCalledWith({ integrationCode: 'n11', invoiceNumber: 'INV-1', orderNumber: 'ORD-1' });
  });

  it('[MEVCUT DAVRANIŞ] tarih aralığı transactionDate.$gte/$lte (ham new Date(), saat kırpması yok)', async () => {
    await makeService({ startDate: '2026-01-01', endDate: '2026-01-10' }).getCargoInvoices();
    const [filter] = cargoInvoiceModel.find.mock.calls[0];
    expect(filter.transactionDate).toEqual({ $gte: new Date('2026-01-01'), $lte: new Date('2026-01-10') });
  });

  it('[MEVCUT DAVRANIŞ] sonuç doğrudan diziyi döner (sarmalayıcı obje YOK — getTransactionData/getInvoices\'ten FARKLI)', async () => {
    cargoInvoiceModel.find.mockReturnValue(chain([{ _id: 'ci1' }]));
    await expect(makeService({}).getCargoInvoices()).resolves.toEqual([{ _id: 'ci1' }]);
  });

  it('[MEVCUT DAVRANIŞ] hata olduğu gibi yeniden fırlatılır', async () => {
    cargoInvoiceModel.find.mockImplementation(() => { throw new Error('find fail'); });
    await expect(makeService({}).getCargoInvoices()).rejects.toThrow('find fail');
  });

  it('[TENANT İZOLASYONU, PLATFORM_BASELINE B2] filtre nesnesinde clientId/tenant alanı YOK', async () => {
    await makeService({ integrationCode: 'n11' }, 99).getCargoInvoices();
    const [filter] = cargoInvoiceModel.find.mock.calls[0];
    expect(JSON.stringify(filter)).not.toMatch(/clientId/i);
  });
});

// ---------------------------------------------------------------------------------------------
describe('FinancialService.getFinancialSummary (deprecated)', () => {
  it('[MEVCUT DAVRANIŞ] filtresiz çağrı: $match {} ile aggregate; sonuç yoksa sıfır özet döner', async () => {
    await expect(makeService({}).getFinancialSummary()).resolves.toEqual({ totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 });
    const pipe = financialModel.aggregate.mock.calls[0][0] as any[];
    expect(pipe[0]).toEqual({ $match: {} });
  });

  it('[MEVCUT DAVRANIŞ] getTransactionData ile AYNI filtre kurallarını (integrationCodes/transactionTypes/externalIdSearch/tarih) BAĞIMSIZ şekilde TEKRAR uygular (kod tekrarı; ortak yardımcı YOK)', async () => {
    await makeService({ integrationCodes: ['trendyol'], externalIdSearch: 'TX(1)' }).getFinancialSummary();
    const pipe = financialModel.aggregate.mock.calls[0][0] as any[];
    expect((pipe[0] as any).$match).toEqual({ integrationCode: { $in: ['trendyol'] }, externalId: { $regex: 'TX\\(1\\)', $options: 'i' } });
  });

  it('[MEVCUT DAVRANIŞ] sonuç varsa result[0] DOĞRUDAN döner', async () => {
    financialModel.aggregate.mockResolvedValue([{ _id: null, totalCredit: 1 }]);
    await expect(makeService({}).getFinancialSummary()).resolves.toEqual({ _id: null, totalCredit: 1 });
  });

  it('[MEVCUT DAVRANIŞ] hata olduğu gibi yeniden fırlatılır', async () => {
    financialModel.aggregate.mockRejectedValue(new Error('agg fail'));
    await expect(makeService({}).getFinancialSummary()).rejects.toThrow('agg fail');
  });
});

// ---------------------------------------------------------------------------------------------
describe('FinancialService.getPayoutDetails', () => {
  it('[MEVCUT DAVRANIŞ] paymentOrderId yoksa hata; model çağrılmaz', async () => {
    await expect(makeService({}).getPayoutDetails()).rejects.toThrow('Ödeme emri ID (paymentOrderId) gereklidir.');
    expect(financialModel.find).not.toHaveBeenCalled();
  });

  it.each([[{ $ne: null }], [['x']], [{}]])('[TENANT/GÜVENLİK, API_TENANT_SURFACE §6] paymentOrderId nesne/dizi ise (%p) ApplicationError 400 fırlatılır — operatör enjeksiyonu ile TÜM kayıtları listeleme engellenir', async (val) => {
    const svc = makeService({ paymentOrderId: val });
    await expect(svc.getPayoutDetails()).rejects.toMatchObject({ statusCode: 400, message: 'paymentOrderId geçersiz.' });
    expect(financialModel.find).not.toHaveBeenCalled();
  });

  it('[MEVCUT DAVRANIŞ] string/number paymentOrderId KABUL edilir; skaler eşitlik filtresiyle transactionDate ARTAN sıralı sorgulanır (SAYFALAMA/LİMİT YOK)', async () => {
    financialModel.find.mockReturnValue(chain([{ _id: 'p1' }]));
    const res = await makeService({ paymentOrderId: 'PO-1' }).getPayoutDetails();
    expect(financialModel.find).toHaveBeenCalledWith({ paymentOrderId: 'PO-1' });
    const findChain = financialModel.find.mock.results[0].value;
    expect(findChain.sort).toHaveBeenCalledWith({ transactionDate: 1 });
    expect(findChain.limit).not.toHaveBeenCalled();
    expect(res).toEqual([{ _id: 'p1' }]);
  });

  it('[MEVCUT DAVRANIŞ] numeric paymentOrderId de kabul edilir', async () => {
    await makeService({ paymentOrderId: 12345 }).getPayoutDetails();
    expect(financialModel.find).toHaveBeenCalledWith({ paymentOrderId: 12345 });
  });

  it('[MEVCUT DAVRANIŞ] hata olduğu gibi yeniden fırlatılır', async () => {
    financialModel.find.mockImplementation(() => { throw new Error('find fail'); });
    await expect(makeService({ paymentOrderId: 'PO-1' }).getPayoutDetails()).rejects.toThrow('find fail');
  });
});

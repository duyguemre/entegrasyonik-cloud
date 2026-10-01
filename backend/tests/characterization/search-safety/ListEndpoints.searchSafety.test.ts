/**
 * GV-01 / MM-08 (BACKEND_CODE_AUDIT): liste uçlarında kaçışsız $regex ve sınırsız limit — Protokol 13.
 * Mock'lu (DB/Redis/ağ YOK): her servis kayıt tutan sahte modellerle çalıştırılır ve modele giden sorgu incelenir.
 * Bu servislerin hiçbirinde daha önce test yoktu (audit TB-01). Eski davranış: girdi `$regex`'e HAM verilir, limit sınırsız;
 * [ADR-0021 2026-09-28] artık kaçışlı ve limit ≤ 200 (admin müşteri listesi ≤ 1000).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@utils/decorator/cache', () => ({ nodeCache: { getStats: () => ({}), keys: () => [] }, Cache: () => () => undefined }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => ({}) } }));

import ClaimService from '@api/rpc/handlers/claim-service';
import CustomerService from '@api/rpc/handlers/customer-service';
import MessageService from '@api/rpc/handlers/message-service';
import InvoiceService from '@api/rpc/handlers/invoice-service';
import FinancialService from '@api/rpc/handlers/financial-service';
import TicketService from '@api/rpc/handlers/ticket-service';
import NotificationService from '@api/rpc/handlers/notification-service';
import AdminService from '@api/rpc/handlers/admin-service';
import ProductService from '@api/rpc/handlers/product-service';

const RAW = '(a+)+$';
const ESC = '\\(a\\+\\)\\+\\$';
const HUGE = 100000;

type Call = { fn: string; args: any[] };

/** Her yöntemi kaydeden, zincirlenebilir ve await edilince [] dönen sahte model. */
function recorder() {
  const calls: Call[] = [];
  const query: any = new Proxy(function () { /* noop */ }, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any) => Promise.resolve([{ metadata: [], data: [], totalNumberOfRecords: [] }]).then(res);
      return (...args: any[]) => { calls.push({ fn: prop, args }); return query; };
    },
  });
  const model: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return undefined;
      return (...args: any[]) => { calls.push({ fn: prop, args }); return query; };
    },
  });
  return { model, calls, query };
}

/** Kayıtlı çağrılardaki tüm `$regex` değerleri ve tüm limit değerleri ($limit aşaması / .limit()). */
function inspect(calls: Call[]) {
  const regexes: string[] = [];
  const limits: number[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (k === '$regex' && typeof val === 'string') regexes.push(val);
        if (k === '$limit' && typeof val === 'number') limits.push(val);
        walk(val);
      }
    }
  };
  for (const c of calls) {
    if (c.fn === 'limit' && typeof c.args[0] === 'number') limits.push(c.args[0]);
    walk(c.args);
  }
  return { regexes, limits };
}

function svc<T>(Cls: new (id: number, req: any) => T, request: any, clientModels: Record<string, any> = {}, appModels: Record<string, any> = {}): T {
  const s: any = new Cls(7, request);
  s.clientDB = new Proxy({}, { get: (_t, p: string) => () => clientModels[p] ?? recorder().model });
  s.applicationDB = new Proxy({}, { get: (_t, p: string) => () => appModels[p] ?? recorder().model });
  return s;
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('liste uçları: regex kaçışı + limit üst sınırı', () => {
  it('ClaimService.getClaims', async () => {
    const r = recorder();
    await svc(ClaimService, { searchClaimForm: { filter: { globalSearch: RAW }, pagination: { page: 0, limit: HUGE } } }, { getClaimModel: r.model }).getClaims();
    const { regexes, limits } = inspect(r.calls);
    expect(regexes.length).toBeGreaterThan(0);
    expect(new Set(regexes)).toEqual(new Set([ESC]));
    expect(Math.max(...limits)).toBe(200);
  });

  it('CustomerService.getCustomers', async () => {
    const r = recorder();
    await svc(CustomerService, { searchCustomerForm: { data: { globalSearch: RAW } }, pagination: { page: -3, limit: HUGE } }, { getCustomerModel: r.model }).getCustomers();
    const { regexes, limits } = inspect(r.calls);
    expect(new Set(regexes)).toEqual(new Set([ESC]));
    expect(Math.max(...limits)).toBe(200);
    expect(JSON.stringify(r.calls)).not.toContain('"$skip":-');
  });

  it('MessageService.getMessages', async () => {
    const r = recorder();
    await svc(MessageService, { searchMessageForm: { data: { globalSearch: RAW } }, pagination: { page: 1, limit: HUGE } }, { getMessageModel: r.model }).getMessages();
    const { regexes, limits } = inspect(r.calls);
    expect(new Set(regexes)).toEqual(new Set([ESC]));
    expect(Math.max(...limits)).toBe(200);
  });

  it('InvoiceService.getInvoices', async () => {
    const r = recorder();
    await svc(InvoiceService, { search: RAW, pagination: { page: 1, limit: HUGE } }, { getInvoiceModel: r.model }).getInvoices();
    const { regexes, limits } = inspect(r.calls);
    expect(new Set(regexes)).toEqual(new Set([ESC]));
    expect(Math.max(...limits)).toBe(200);
  });

  it('FinancialService.getTransactionData', async () => {
    const r = recorder();
    await svc(FinancialService, { externalIdSearch: RAW, page: 0, limit: HUGE }, { getFinancialTransactionModel: r.model }).getTransactionData();
    const { regexes, limits } = inspect(r.calls);
    expect(new Set(regexes)).toEqual(new Set([ESC]));
    expect(Math.max(...limits)).toBe(200);
    expect(r.calls.find((c) => c.fn === 'skip')?.args[0]).toBe(0);
  });

  it('TicketService.getTickets (tenant)', async () => {
    const r = recorder();
    await svc(TicketService, { searchTicketForm: { data: { globalSearch: RAW } }, pagination: { page: 1, limit: HUGE } }, {}, { getTicketModel: r.model }).getTickets();
    const { regexes, limits } = inspect(r.calls);
    expect(new Set(regexes)).toEqual(new Set([ESC]));
    expect(Math.max(...limits)).toBe(200);
  });

  it('NotificationService.get: limit üst sınırı', async () => {
    const r = recorder();
    // NB4 (a84bbb3d): get() artik this.ctx.actor okur; gercek istekte authenticate ctx'i kurar, burada sentetik ctx verilir.
    await svc(NotificationService, { limit: HUGE, ctx: { actor: { sub: 'u1', imp: false } } }, { getNotificationModel: r.model }).get();
    // NB4: sayfa üst sınırı 200; hasMore tespiti için sorgu limit+1 (=201) çeker ve yanıtta 200'e keser (bkz. notification-service get()).
    expect(inspect(r.calls).limits).toEqual([201]);
  });

  it('AdminService.getClients / getTickets / getExportDetails', async () => {
    const c = recorder();
    await svc(AdminService, { search: RAW, page: 1, limit: HUGE }, {}, { getClientModel: c.model }).getClients();
    expect(new Set(inspect(c.calls).regexes)).toEqual(new Set([ESC]));
    expect(inspect(c.calls).limits).toEqual([1000]); // FE müşteri seçimi limit 1000 kullanır

    const c2 = recorder();
    await svc(AdminService, { limit: 1000 }, {}, { getClientModel: c2.model }).getClients();
    expect(inspect(c2.calls).limits).toEqual([1000]); // FE'nin gerçek kullanımı kırılmaz

    const t = recorder();
    await svc(AdminService, { search: RAW, limit: HUGE }, {}, { getTicketModel: t.model }).getTickets();
    expect(new Set(inspect(t.calls).regexes)).toEqual(new Set([ESC]));
    expect(inspect(t.calls).limits).toEqual([200]);

    const e = recorder();
    await svc(AdminService, { limit: HUGE }, {}, { getExportSignalModel: e.model }).getExportDetails().catch(() => undefined);
    expect(inspect(e.calls).limits).toContain(200);
  });

  it('ProductService: arama filtreleri kaçışlı (başlık/stok kodu/barkod) ve getProducts limit ≤ 200', async () => {
    const s: any = svc(ProductService, {});
    const q1 = await s.getProductFilterQuery({ searchText: RAW });
    expect(q1.$or[0].title.$regex).toBe(ESC);
    const q2 = await s.getProductVariantFilterQuery({ searchText: RAW });
    expect(JSON.stringify(q2)).toContain(`"$regex":${JSON.stringify(ESC)}`);
    const m = await s.constructMatchQuery({ title: RAW });
    expect(m[0].title.$regex).toBe(ESC);

    const r = recorder();
    const s2: any = svc(ProductService, { searchProductForm: { pagination: { page: 1, limit: HUGE }, data: {} } }, { getProductModel: r.model, getVariantModel: recorder().model });
    await s2.getProducts().catch(() => undefined);
    expect(Math.max(...inspect(r.calls).limits)).toBe(200);
  });

  it('nesne girdisi (operatör enjeksiyonu) regex olarak kullanılamaz: { $ne: "" } -> boş desen', async () => {
    const r = recorder();
    await svc(FinancialService, { externalIdSearch: { $ne: '' } }, { getFinancialTransactionModel: r.model }).getTransactionData();
    expect(new Set(inspect(r.calls).regexes)).toEqual(new Set(['']));
  });
});

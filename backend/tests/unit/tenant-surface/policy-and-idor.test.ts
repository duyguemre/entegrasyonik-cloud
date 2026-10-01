import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// API_TENANT_SURFACE: yeni uçların kademeleri (GERÇEK OPERATION_POLICY) ve RunOperation üzerinden UÇTAN UCA tenant izolasyonu (IDOR).
// Servisler GERÇEK; yalnızca DatabaseManager (tenant başına sahte DB), IntegrationFactory/EventBus/Redis/Notification mock'lu. DB/Redis/ağ YOK.

const tenantDbs: Record<number, any> = {};
const appDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDb,
    getClientDB: async (id: number) => tenantDbs[id],
  },
}));
jest.mock('@utils/decorator/cache', () => ({ nodeCache: { getStats: () => ({}), keys: () => [], get: () => undefined, set: () => true, del: () => 0, flushAll: () => undefined }, Cache: () => (_t: any, _k: string, d: PropertyDescriptor) => d, InvalidatesTenantCache: () => (_t: any, _k: string, d: PropertyDescriptor) => d }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => ({}) } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/IntegrationEventBus', () => ({ EVENTS: {}, integrationEventBus: { emit: jest.fn(), on: jest.fn() } }));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: {} }));

import run from '../../../src/api/rpc/RunOperation';
import { OPERATION_POLICY, getRequiredTier, resolveTier, isAllowed } from '../../../src/api/rpc/operationPolicy';

const uc = (order: number, extra: any = {}) => ({ order, roleCode: 'ROLE_OPERATOR', owner: false, ...extra });
const pr = (tid: number, extra: any = {}) => ({ sub: 'u-' + tid, tid, ga: false, ...extra });
const ACTORS = {
  member: { uc: uc(4), pr: pr(4) },
  admin: { uc: uc(4, { roleCode: 'ROLE_ADMIN' }), pr: pr(4) },
  owner: { uc: uc(4, { roleCode: 'ROLE_OWNER', owner: true }), pr: pr(4) },
};

describe('kademe atamaları (gerçek politika)', () => {
  const T = (s: string, o: string) => getRequiredTier(s, o);

  it('stok politikası ve entegrasyon sağlığı = admin; denetim günlüğü = admin; stok özeti = member', () => {
    for (const o of ['getStockPolicy', 'saveTenantStockPolicy', 'saveChannelStockPolicy', 'getIntegrationHealth']) expect([o, T('IntegrationService', o)]).toEqual([o, 'admin']);
    expect(T('AuditService', 'getAuditLogs')).toBe('admin');
    expect(T('StockService', 'getStockOverview')).toBe('member');
  });

  it('§6: güvenli bulunan salt-okunur/düşük riskli uçlar member; güvenli OLMAYANLAR (updateOrderStatus/updateClaimStatus) KAYITSIZ (=403)', () => {
    for (const [s, o] of [['FinancialService', 'getFinancialSummary'], ['FinancialService', 'getCargoInvoices'], ['FinancialService', 'getPayoutDetails'],
      ['ShipmentService', 'getShipments'], ['OrderService', 'markAsPrinted'], ['ClaimService', 'getClaimById'], ['NotificationService', 'getUnreadCount']]) {
      expect([s, o, T(s, o)]).toEqual([s, o, 'member']);
    }
    expect(T('OrderService', 'updateOrderStatus')).toBeUndefined();
    expect(T('ClaimService', 'updateClaimStatus')).toBeUndefined();
    // önceki kayıtlı operasyonlar değişmedi
    expect(T('IntegrationService', 'saveClientMarketplaceSettings')).toBe('admin');
    expect(T('FinancialService', 'getTransactionData')).toBe('member');
  });

  it('member, admin-kademeli uçlara giremez; admin ve owner girer; platformAdmin tenant admin kademesinde girer', () => {
    for (const [s, o] of [['IntegrationService', 'saveChannelStockPolicy'], ['AuditService', 'getAuditLogs'], ['IntegrationService', 'getIntegrationHealth']]) {
      const need = getRequiredTier(s, o)!;
      expect(isAllowed(need, resolveTier(ACTORS.member.uc, ACTORS.member.pr))).toBe(false);
      expect(isAllowed(need, resolveTier(ACTORS.admin.uc, ACTORS.admin.pr))).toBe(true);
      expect(isAllowed(need, resolveTier(ACTORS.owner.uc, ACTORS.owner.pr))).toBe(true);
      expect(isAllowed(need, resolveTier({ order: 4 }, { sub: 'ga', tid: 4, ga: true }))).toBe(true);
    }
  });

  it('yeni kayıtlar politika kaydında ölü değil: her biri gerçek servis metoduna karşılık gelir', () => {
    const Apis = require('../../../src/api/rpc/index').default;
    for (const [s, o] of [['IntegrationService', 'getStockPolicy'], ['IntegrationService', 'saveTenantStockPolicy'], ['IntegrationService', 'saveChannelStockPolicy'],
      ['IntegrationService', 'getIntegrationHealth'], ['StockService', 'getStockOverview'], ['AuditService', 'getAuditLogs'], ['FinancialService', 'getFinancialSummary'],
      ['FinancialService', 'getCargoInvoices'], ['FinancialService', 'getPayoutDetails'], ['ShipmentService', 'getShipments'], ['OrderService', 'markAsPrinted'],
      ['ClaimService', 'getClaimById'], ['NotificationService', 'getUnreadCount']]) {
      expect([s, o, typeof Apis[s]?.prototype?.[o], (OPERATION_POLICY as any)[s]?.[o] !== undefined]).toEqual([s, o, 'function', true]);
    }
  });
});

describe('RunOperation: reddedilen kademe servisi HİÇ çalıştırmaz (DB\'ye dokunulmaz)', () => {
  beforeEach(() => { for (const k of Object.keys(tenantDbs)) delete tenantDbs[k as any]; });

  it('member -> AuditService/getAuditLogs 403; updateOrderStatus 403 (kayıtsız); DB bağlantısı denenmez', async () => {
    const getDb = jest.fn(async () => ({}));
    tenantDbs[4] = undefined;
    const spy = jest.spyOn(require('../../../src/database/DatabaseManager').DatabaseManagerInstance, 'getClientDB').mockImplementation(getDb as any);
    await expect(run(ACTORS.member.uc, 'AuditService', 'getAuditLogs', {}, ACTORS.member.pr)).rejects.toMatchObject({ statusCode: 403 });
    await expect(run(ACTORS.owner.uc, 'OrderService', 'updateOrderStatus', { orderId: 'x', internalStatus: 'CANCELLED' }, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    await expect(run(ACTORS.owner.uc, 'ClaimService', 'updateClaimStatus', { claimId: 'x', internalStatus: 'APPROVED' }, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    expect(getDb).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('RunOperation üzerinden IDOR: gövdedeki clientId/order/tid/targetClientId tenant SEÇEMEZ', () => {
  const FORGED = { clientId: 7, order: 7, tid: 7, targetClientId: 7, userContext: { order: 7 }, principal: { tid: 7 } };
  let calls: Record<string, any[]>;

  const mkModel = (label: string, result: any) => new Proxy({}, {
    get: (_t, prop: string) => {
      if (prop === 'then') return undefined;
      return (...args: any[]) => {
        (calls[label] = calls[label] || []).push({ method: prop, args });
        const chain: any = { sort: () => chain, skip: () => chain, limit: () => chain, select: () => chain, populate: () => chain, maxTimeMS: () => chain, lean: async () => result, then: (res: any, rej: any) => Promise.resolve(result).then(res, rej) };
        return chain;
      };
    },
  });

  beforeEach(() => {
    calls = {};
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const t of [4, 7]) {
      tenantDbs[t] = {
        tenant: t,
        getNotificationModel: () => mkModel('notif' + t, t === 4 ? 3 : 999),
        getFinancialTransactionModel: () => mkModel('fin' + t, t === 4 ? [{ tenantMarker: 'A' }] : [{ tenantMarker: 'B-LEAK' }]),
        getCargoInvoiceModel: () => mkModel('cargo' + t, [{ tenantMarker: t === 4 ? 'A' : 'B-LEAK' }]),
        getClaimModel: () => mkModel('claim' + t, { tenantMarker: t === 4 ? 'A' : 'B-LEAK' }),
        getOrderModel: () => ({ aggregate: async (p: any[]) => { (calls['order' + t] = calls['order' + t] || []).push(p); return [{ totalNumberOfRecords: [{ count: 1 }], orders: [{ tenantMarker: t === 4 ? 'A' : 'B-LEAK' }] }]; }, findByIdAndUpdate: async () => ({ tenantMarker: t === 4 ? 'A' : 'B-LEAK' }) }),
        getVariantModel: () => ({ aggregate: async () => [], countDocuments: async () => t === 4 ? 1 : 500 }),
        getClientIntegrationModel: () => ({ findOne: () => ({ lean: async () => ({ marketplace: [{ code: t === 4 ? 'trendyol' : 'b-only', order: 1, settings: {} }], stockPolicy: {} }) }) }),
      };
    }
    Object.assign(appDb, {
      getAuditLogModel: () => ({
        countDocuments: (f: any) => { (calls.auditCount = calls.auditCount || []).push(f); const q: any = { maxTimeMS: () => q, then: (r: any, j: any) => Promise.resolve(0).then(r, j) }; return q; },
        find: (f: any) => { (calls.auditFind = calls.auditFind || []).push(f); const q: any = { sort: () => q, skip: () => q, limit: () => q, maxTimeMS: () => q, lean: async () => [] }; return q; },
      }),
      getIntegrationCallMetricModel: () => ({ aggregate: async (p: any[]) => { (calls.metrics = calls.metrics || []).push(p[0].$match); return []; } }),
      getClientModel: () => ({ findOne: (f: any) => { (calls.clients = calls.clients || []).push(f); return { lean: async () => ({ integrations: [] }) }; } }),
    });
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it('NotificationService/getUnreadCount: tenant 4 kendi sayısını (3) alır; gövdedeki 7 yok sayılır (999 sızmaz)', async () => {
    // [ADR-0029 NB4] uç artık strict şemalı: sahte tenant alanları 400 ile REDDEDİLİR (eskiden sessizce yok sayılırdı); temiz gövde kendi tenant'ını sayar.
    await expect(run(ACTORS.member.uc, 'NotificationService', 'getUnreadCount', FORGED, ACTORS.member.pr)).rejects.toMatchObject({ statusCode: 400 });
    expect(calls.notif7).toBeUndefined();
    const r = await run(ACTORS.member.uc, 'NotificationService', 'getUnreadCount', {}, ACTORS.member.pr);
    expect(r).toEqual({ result: true, unreadCount: 3 });
    expect(calls.notif7).toBeUndefined();
  });

  it('FinancialService (özet/kargo/ödeme): yalnızca tenant 4 DB\'si sorgulanır', async () => {
    await run(ACTORS.member.uc, 'FinancialService', 'getFinancialSummary', FORGED, ACTORS.member.pr);
    const cargo = await run(ACTORS.member.uc, 'FinancialService', 'getCargoInvoices', FORGED, ACTORS.member.pr);
    const payout = await run(ACTORS.member.uc, 'FinancialService', 'getPayoutDetails', { ...FORGED, paymentOrderId: 'P1' }, ACTORS.member.pr);
    expect(JSON.stringify([cargo, payout])).not.toContain('B-LEAK');
    expect(Object.keys(calls).filter((k) => k.endsWith('7'))).toEqual([]);
  });

  it('ShipmentService/getShipments + ClaimService/getClaimById + OrderService/markAsPrinted: tenant 7 DB\'sine HİÇ dokunulmaz', async () => {
    const ship = await run(ACTORS.member.uc, 'ShipmentService', 'getShipments', { ...FORGED, pagination: { page: 1, limit: 10 } }, ACTORS.member.pr);
    const claim = await run(ACTORS.member.uc, 'ClaimService', 'getClaimById', { ...FORGED, claimId: 'c1' }, ACTORS.member.pr);
    const printed = await run(ACTORS.member.uc, 'OrderService', 'markAsPrinted', { ...FORGED, orderId: 'o1' }, ACTORS.member.pr);
    expect(JSON.stringify([ship, claim, printed])).not.toContain('B-LEAK');
    expect(Object.keys(calls).filter((k) => k.endsWith('7'))).toEqual([]);
  });

  it('StockService/getStockOverview: tenant 4 verisi (varyant sayacı 1; B\'nin 500\'ü değil)', async () => {
    const r = await run(ACTORS.member.uc, 'StockService', 'getStockOverview', FORGED, ACTORS.member.pr);
    expect(r.variants.withReservations).toBe(1);
    expect(r.variants.publishPending).toBe(1);
  });

  it('AuditService/getAuditLogs: sorgu tid=4 ile atılır (gövdedeki 7 değil)', async () => {
    await run(ACTORS.admin.uc, 'AuditService', 'getAuditLogs', FORGED, ACTORS.admin.pr);
    expect(calls.auditFind[0].tid).toBe(4);
    expect(calls.auditCount[0].tid).toBe(4);
  });

  it('IntegrationService/getIntegrationHealth: metrik ve Clients sorguları tenant 4 ile süzülür', async () => {
    await run(ACTORS.admin.uc, 'IntegrationService', 'getIntegrationHealth', FORGED, ACTORS.admin.pr);
    for (const m of calls.metrics) expect(m.clientId).toBe('4');
    expect(calls.clients).toEqual([{ clientId: 4 }]);
  });

  it('IntegrationService/getStockPolicy: tenant 4 kanalları (b-only sızmaz)', async () => {
    const r = await run(ACTORS.admin.uc, 'IntegrationService', 'getStockPolicy', FORGED, ACTORS.admin.pr);
    expect(r.channels.map((c: any) => c.integrationCode)).toEqual(['trendyol']);
  });

  it('platformAdmin mağaza seçmeden (tid yok) tenant uçlarında 400 (kimliksiz/tenantsız sorgu ATILMAZ)', async () => {
    const ga = { uc: { roleCode: 'ROLE_ADMIN', isGlobalAdmin: true }, pr: { sub: 'ga', ga: true } };
    await expect(run(ga.uc, 'AuditService', 'getAuditLogs', {}, ga.pr)).rejects.toMatchObject({ statusCode: 400 });
    expect(calls.auditFind).toBeUndefined();
  });
});

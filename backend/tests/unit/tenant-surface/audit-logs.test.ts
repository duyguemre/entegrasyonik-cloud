import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// N10: AuditService.getAuditLogs — tenant denetim günlüğü okuma. DB/Redis/ağ YOK: AuditLogs bellek-içi taklit edilir
// (gerçek filtre semantiğini yorumlayan küçük bir değerlendirici; iki tenant'lı veriyle IDOR doğrulanır).

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));

import AuditService from '../../../src/api/services/audit-service';
import { sanitizeResponse } from '../../../src/platform/core/security/responseSanitizer';

const NOW = new Date('2026-09-28T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function matches(doc: any, filter: any): boolean {
  return Object.entries(filter).every(([k, v]: [string, any]) => {
    if (k === '$and') return (v as any[]).every((f) => matches(doc, f));
    const actual = doc[k];
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.entries(v).every(([op, x]: [string, any]) => {
        if (op === '$gte') return actual >= x;
        if (op === '$lte') return actual <= x;
        if (op === '$regex') return typeof actual === 'string' && new RegExp(x).test(actual);
        if (op === '$not') return !matches({ [k]: actual }, { [k]: x });
        throw new Error('desteklenmeyen operatör ' + op);
      });
    }
    return actual === v;
  });
}

let logs: any[];
let calls: { count: any[]; find: any[] };
let maxTimes: number[];

function fakeApp() {
  calls = { count: [], find: [] }; maxTimes = [];
  return {
    getAuditLogModel: () => ({
      countDocuments: jest.fn((f: any) => { calls.count.push(f); const q: any = { maxTimeMS: (ms: number) => { maxTimes.push(ms); return q; }, then: (res: any, rej: any) => Promise.resolve(logs.filter((d) => matches(d, f)).length).then(res, rej) }; return q; }),
      find: jest.fn((f: any, proj: any) => {
        calls.find.push({ f, proj });
        let rows = logs.filter((d) => matches(d, f)); let sk = 0; let lim = 1e9;
        const q: any = {
          sort: (s: any) => { rows = [...rows].sort((a, b) => (a.at < b.at ? 1 : -1) * (s.at === -1 ? 1 : -1)); return q; },
          skip: (n: number) => { sk = n; return q; }, limit: (n: number) => { lim = n; return q; },
          maxTimeMS: (ms: number) => { maxTimes.push(ms); return q; },
          lean: async () => rows.slice(sk, sk + lim).map((d) => ({ ...d })),
        };
        return q;
      }),
    }),
  };
}

const entry = (o: any) => ({ _id: 'id-' + Math.random().toString(36).slice(2, 8), result: 'ok', ...o });

let app: any;
const svc = (tenant: number | undefined, request: any = {}): any => {
  const s: any = new AuditService(tenant as any, { principal: { sub: 'u1', tid: tenant }, ...request });
  s.applicationDB = app;
  return s;
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  logs = [
    entry({ tid: 4, sub: 'user-a1', at: ago(1 * DAY), event: 'login', ip: '203.0.113.9' }),
    entry({ tid: 4, sub: 'user-a2', at: ago(2 * DAY), event: 'stock.policy.channel', meta: { integrationCode: 'trendyol', bufferUnits: 3, apiKey: 'MUST-DROP', nested: { a: 1 } } }),
    entry({ tid: 4, sub: 'user-a1', at: ago(3 * DAY), event: 'tenant.export.requested', result: 'error' }),
    entry({ tid: 4, sub: 'ga-1', at: ago(1 * DAY), event: 'admin.write', meta: { service: 'AdminService', operation: 'updateClient' } }), // platform-içi
    entry({ tid: 4, sub: 'user-a1', at: ago(45 * DAY), event: 'login' }), // varsayılan 30 gün penceresi dışı
    entry({ tid: 7, sub: 'user-b1', at: ago(1 * DAY), event: 'login', ip: '198.51.100.1' }),
    entry({ tid: 7, sub: 'user-b1', at: ago(2 * DAY), event: 'stock.policy.channel', meta: { integrationCode: 'b-only' } }),
    entry({ sub: 'user-x', at: ago(1 * DAY), event: 'login', result: 'fail' }), // tid'siz (başarısız giriş)
  ];
  app = fakeApp();
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('AuditService.getAuditLogs: içerik', () => {
  it('varsayılan: son 30 gün, en yeni önce, sayfalı; DTO yalnızca id/at/event/result/userId/meta', async () => {
    const r = await svc(4).getAuditLogs();
    expect(r.logs.map((l: any) => l.event)).toEqual(['login', 'stock.policy.channel', 'tenant.export.requested']); // admin.write ve 45 gün öncesi yok
    expect(r).toMatchObject({ page: 1, limit: 25, totalNumberOfRecords: 3, totalNumberOfPages: 1 });
    expect(r.from).toEqual(new Date(NOW.getTime() - 30 * DAY));
    expect(r.to).toEqual(NOW);
    expect(Object.keys(r.logs[0]).sort()).toEqual(['at', 'event', 'id', 'meta', 'result', 'userId']);
    expect(r.logs[0]).toMatchObject({ userId: 'user-a1', result: 'ok', meta: null });
    expect(calls.find[0].proj).toEqual({ at: 1, event: 1, result: 1, sub: 1, meta: 1, imp: 1 }); // DB'den ip/tid alanları hiç çekilmez
    expect(maxTimes.length).toBe(2); // count + find maxTimeMS ile sınırlı
  });

  it('PII/sır yok: ip dönmez; meta yeniden sanitize edilir (hassas anahtar ve iç içe nesne atılır)', async () => {
    const r = await svc(4).getAuditLogs();
    const json = JSON.stringify(r);
    for (const leak of ['203.0.113.9', '"ip"', 'MUST-DROP', 'apiKey', 'nested', '"tid"']) expect([leak, json.includes(leak)]).toEqual([leak, false]);
    expect(r.logs[1].meta).toEqual({ integrationCode: 'trendyol', bufferUnits: 3 });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(sanitizeResponse(r)).toBe(r);
    expect(warn).not.toHaveBeenCalled();
  });

  it('platform-içi (admin.*) olaylar filtreyle bile geri getirilemez', async () => {
    for (const req of [{ event: 'admin.write' }, { event: 'admin.x' }]) await expect(svc(4, req).getAuditLogs()).rejects.toMatchObject({ statusCode: 400 });
    const r = await svc(4, { eventPrefix: 'admin' }).getAuditLogs(); // önek eşleşse bile admin.* dışlanır
    expect(r.logs).toEqual([]);
  });

  it('filtreler: event (tam), eventPrefix, userId, result, tarih aralığı; sayfalama', async () => {
    expect((await svc(4, { event: 'login' }).getAuditLogs()).logs).toHaveLength(1);
    expect((await svc(4, { eventPrefix: 'stock.' }).getAuditLogs()).logs.map((l: any) => l.event)).toEqual(['stock.policy.channel']);
    expect((await svc(4, { userId: 'user-a1' }).getAuditLogs()).logs).toHaveLength(2);
    expect((await svc(4, { result: 'error' }).getAuditLogs()).logs.map((l: any) => l.event)).toEqual(['tenant.export.requested']);
    const wide = await svc(4, { from: ago(60 * DAY).toISOString(), event: 'login' }).getAuditLogs();
    expect(wide.logs).toHaveLength(2); // 45 gün önceki de görünür
    const p2 = await svc(4, { page: 2, limit: 2 }).getAuditLogs();
    expect(p2).toMatchObject({ page: 2, limit: 2, totalNumberOfRecords: 3, totalNumberOfPages: 2 });
    expect(p2.logs).toHaveLength(1);
  });

  it('eventPrefix regex meta-karakterleri kaçırılır ("." yalnızca nokta)', async () => {
    logs.push(entry({ tid: 4, sub: 'u', at: ago(1 * DAY), event: 'stockXpolicy' }));
    const r = await svc(4, { eventPrefix: 'stock.' }).getAuditLogs();
    expect(r.logs.map((l: any) => l.event)).toEqual(['stock.policy.channel']);
  });
});

describe('AuditService.getAuditLogs: girdi doğrulama (400)', () => {
  it.each([
    [{ page: 0 }], [{ page: 1.5 }], [{ page: '1' }], [{ limit: 0 }], [{ limit: 101 }], [{ limit: 'x' }],
    [{ from: 'bugün' }], [{ to: {} }], [{ from: '2026-09-01', to: '2026-08-01' }], [{ from: '2024-01-01', to: '2026-09-28' }],
    [{ event: { $ne: 'x' } }], [{ event: 'a b' }], [{ event: 'x'.repeat(65) }], [{ eventPrefix: '.*' }], [{ eventPrefix: ['a'] }],
    [{ userId: { $ne: null } }], [{ userId: 'a.b' }], [{ userId: 'x'.repeat(65) }], [{ result: 'success' }], [{ result: { $ne: 'ok' } }],
  ])('%j', async (req: any) => {
    await expect(svc(4, req).getAuditLogs()).rejects.toMatchObject({ statusCode: 400 });
    expect(calls.find).toEqual([]);
  });

  it('tenant kimliği yoksa (mağaza seçmemiş süper yönetici) 400 — tid filtresiz sorgu ASLA atılmaz', async () => {
    await expect(svc(undefined).getAuditLogs()).rejects.toMatchObject({ statusCode: 400 });
    expect(calls.find).toEqual([]);
    expect(calls.count).toEqual([]);
  });
});

describe('AuditService.getAuditLogs: tenant izolasyonu (IDOR)', () => {
  it('her sorgu tid = sunucudaki tenant ile süzülür; gövdedeki tid/clientId/order/sub sahtekarlığı yok sayılır', async () => {
    const r = await svc(4, { tid: 7, clientId: 7, order: 7, targetClientId: 7 }).getAuditLogs();
    expect(calls.count[0].tid).toBe(4);
    expect(calls.find[0].f.tid).toBe(4);
    const json = JSON.stringify(r);
    for (const leak of ['user-b1', 'b-only', 'user-x']) expect([leak, json.includes(leak)]).toEqual([leak, false]);
  });

  it('B kendi kayıtlarını görür; A\'nınkileri görmez (simetri)', async () => {
    const r = await svc(7).getAuditLogs();
    expect(r.logs.map((l: any) => l.userId).sort()).toEqual(['user-b1', 'user-b1']);
    expect(JSON.stringify(r)).not.toMatch(/user-a|trendyol|ga-1/);
  });

  it('başka tenant\'ın kullanıcı kimliğiyle userId filtresi sonuç döndürmez (tid AND sub)', async () => {
    const r = await svc(4, { userId: 'user-b1' }).getAuditLogs();
    expect(r.logs).toEqual([]);
    expect(r.totalNumberOfRecords).toBe(0);
  });
});

describe('AuditService.getAuditLogs: destek (impersonation) kayitlari [B3]', () => {
  it('redeem/end/istek kayitlari tenanta gorunur (kim=Entegrasyonik Destek, ne zaman, gerekce); yonetici kimligi (sub) SIZMAZ; platform-ici start gorunmez', async () => {
    logs.push(
      entry({ tid: 4, sub: 'admin-sub-9', at: ago(1000), event: 'impersonation.redeem', imp: true, onBehalfOf: 4, meta: { reason: 'TICKET-9 destek talebi' } }),
      entry({ tid: 4, sub: 'admin-sub-9', at: ago(500), event: 'impersonation.request', imp: true, meta: { service: 'IntegrationService', operation: 'getClientIntegrations', effect: 'read' } }),
      entry({ tid: 4, sub: 'admin-sub-9', at: ago(100), event: 'impersonation.end', imp: true }),
      entry({ sub: 'admin-sub-9', at: ago(1100), event: 'impersonation.start', onBehalfOf: 4, meta: { reason: 'TICKET-9 destek talebi' } }), // tid YOK (platform-ici)
    );
    const r = await svc(4, { eventPrefix: 'impersonation.' }).getAuditLogs();
    expect(r.logs.map((l: any) => l.event).sort()).toEqual(['impersonation.end', 'impersonation.redeem', 'impersonation.request']);
    for (const l of r.logs) expect(l).toMatchObject({ userId: null, actorLabel: 'Entegrasyonik Destek' });
    expect(r.logs.find((l: any) => l.event === 'impersonation.redeem').meta).toEqual({ reason: 'TICKET-9 destek talebi' });
    expect(JSON.stringify(r)).not.toContain('admin-sub-9');
    // normal kayitlarda alan eklenmez
    const n = await svc(4, { event: 'login' }).getAuditLogs();
    expect(Object.keys(n.logs[0])).not.toContain('actorLabel');
  });
});

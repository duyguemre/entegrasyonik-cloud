import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ADR-0018 Karar 2/4 (Aşama B) — IntegrationComplianceService birim testleri.
// Yalnız `@database/DatabaseManager` mocklanır (sahte, bellek-içi model); GERÇEK ağ/Mongo YOK.
// `FindingService.report()`/`transition()` GERÇEKTEN çağrılır (sahte modelin ÜZERİNDEN) -- servis
// katmanı FindingService'i TÜKETİYOR mu (yeniden yazmıyor mu) bu testlerle de kanıtlanır.

// -----------------------------------------------------------------------------------------------
// Sahte (bellek-içi) ApplicationDB: yalnızca IntegrationFindings + JobState alt kümesi.
// -----------------------------------------------------------------------------------------------
type Doc = Record<string, any>;

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter || {}).every(([k, v]) => doc[k] === v);
}

function makeFindingStore() {
  const store = new Map<string, Doc>();

  const model = {
    find(filter: Doc = {}) {
      let rows = Array.from(store.values()).filter((d) => matches(d, filter));
      const api: any = {
        sort(spec: Record<string, number>) {
          const [[key, dir]] = Object.entries(spec);
          rows = [...rows].sort((a, b) => {
            const av = a[key] instanceof Date ? a[key].getTime() : a[key];
            const bv = b[key] instanceof Date ? b[key].getTime() : b[key];
            return av > bv ? dir : av < bv ? -dir : 0;
          });
          return api;
        },
        limit(n: number) { rows = rows.slice(0, n); return api; },
        lean: async () => rows.map((r) => ({ ...r })),
      };
      return api;
    },
    findOne(filter: Doc = {}) {
      return { lean: async () => { const d = Array.from(store.values()).find((x) => matches(x, filter)); return d ? { ...d } : null; } };
    },
    async findOneAndUpdate(filter: Doc, update: Doc, opts: Doc = {}) {
      const existing = Array.from(store.values()).find((x) => matches(x, filter));
      if (!existing && !opts.upsert) return null;
      const set = update.$set ?? {};
      const merged: Doc = { ...(existing ?? {}), ...set };
      const key = merged.dedupKey ?? filter.dedupKey;
      merged.dedupKey = key;
      store.set(key, merged);
      return opts.new ? { ...merged } : (existing ? { ...existing } : null);
    },
  };
  return { store, model };
}

function makeJobStateStore() {
  const store = new Map<string, Doc>();
  const model = {
    findOne(filter: Doc = {}) {
      return Promise.resolve(Array.from(store.values()).find((x) => matches(x, filter)) ?? null);
    },
  };
  return { store, model };
}

const findingStore = makeFindingStore();
const jobStateStore = makeJobStateStore();
const appDb: any = {
  getIntegrationFindingModel: () => findingStore.model,
  getJobStateModel: () => jobStateStore.model,
};

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getApplicationDB: async () => appDb,
    getClientDB: async () => undefined,
  },
}));

import IntegrationComplianceService from '../../../src/api/services/integration-compliance-service';
import { FindingService, computeDedupKey } from '../../../src/integration/compliance/FindingService';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';

async function make(request: any = {}) {
  const svc: any = new (IntegrationComplianceService as any)(undefined, request);
  await svc.init();
  return svc;
}

const PLATFORM_ADMIN_REQUEST = { principal: { sub: 'admin-1', ga: true } };

beforeEach(() => {
  findingStore.store.clear();
  jobStateStore.store.clear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined); // BaseApi: clientId yok (platformAdmin servis, tenant kapsamı yok)
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('IntegrationComplianceService.list', () => {
  it('filtresiz: tüm bulguları lastSeenAt azalan sırayla, evidence İÇERMEYEN özet DTO olarak döner', async () => {
    await FindingService.report({ integrationCode: 'trendyol', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'a', evidence: { paths: ['x'] } });
    await FindingService.report({ integrationCode: 'hepsiburada', category: 'marketplace', kind: 'doc', source: 'manual', subjectKey: 'b' });

    const svc = await make(PLATFORM_ADMIN_REQUEST);
    const rows = await svc.list();
    expect(rows).toHaveLength(2);
    expect(rows[0].evidence).toBeUndefined();
    expect(rows.map((r: any) => r.integrationCode).sort()).toEqual(['hepsiburada', 'trendyol']);
    expect(rows[0]).toMatchObject({ affectedTenantsCount: expect.any(Number), occurrences: 1, status: 'new' });
  });

  it('integrationCode filtresi: yalnız o entegrasyonun bulgularını döner (request constructor\'a geçirilir)', async () => {
    await FindingService.report({ integrationCode: 'trendyol', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'a' });
    await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'c' });

    const svc = await make({ ...PLATFORM_ADMIN_REQUEST, integrationCode: 'trendyol' });
    const rows = await svc.list();
    expect(rows).toHaveLength(1);
    expect(rows[0].integrationCode).toBe('trendyol');
  });

  it('integrationCode/kind/status/category/severity filtreleri birlikte çalışır (category/severity bellek-içi süzülür)', async () => {
    await FindingService.report({ integrationCode: 'trendyol', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'a' }); // severity=high
    await FindingService.report({ integrationCode: 'trendyol', category: 'marketplace', kind: 'doc', source: 'manual', subjectKey: 'b' }); // severity=info
    await FindingService.report({ integrationCode: 'ideasoft', category: 'ecommerce', kind: 'schema', source: 'guard', subjectKey: 'c' });

    const svc = await make({ ...PLATFORM_ADMIN_REQUEST, integrationCode: 'trendyol', kind: 'schema', category: 'marketplace', severity: 'high' });
    const rows = await svc.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ integrationCode: 'trendyol', kind: 'schema', severity: 'high' });
  });

  it('eşleşme yoksa boş dizi döner (hata YOK)', async () => {
    const svc = await make({ ...PLATFORM_ADMIN_REQUEST, integrationCode: 'trendyol' });
    expect(await svc.list()).toEqual([]);
  });

  it('geçersiz kind/status/category/severity: ApplicationError 400 VALIDATION', async () => {
    await expect(make({ ...PLATFORM_ADMIN_REQUEST, kind: 'not-a-kind' }).then((s: any) => s.list())).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    await expect(make({ ...PLATFORM_ADMIN_REQUEST, status: 'bogus' }).then((s: any) => s.list())).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    await expect(make({ ...PLATFORM_ADMIN_REQUEST, category: 'bogus' }).then((s: any) => s.list())).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    await expect(make({ ...PLATFORM_ADMIN_REQUEST, severity: 'bogus' }).then((s: any) => s.list())).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
  });

  it('get() -> list() ile AYNI sonucu döner (GET /:service rotası deseni, integration-config-service.ts ile AYNI)', async () => {
    await FindingService.report({ integrationCode: 'trendyol', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'a' });
    const svc = await make(PLATFORM_ADMIN_REQUEST);
    expect(await svc.get()).toEqual(await svc.list());
  });
});

describe('IntegrationComplianceService.summary', () => {
  it('6 entegrasyonun tümü için bir kart döner; açık bulgu sayıları şiddete göre gruplu; kapalı bulgu SAYILMAZ', async () => {
    await FindingService.report({ integrationCode: 'trendyol', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'a' }); // high, open
    await FindingService.report({ integrationCode: 'trendyol', category: 'marketplace', kind: 'doc', source: 'manual', subjectKey: 'b' }); // info, open
    const dedupC = computeDedupKey('trendyol', 'ratelimit', 'c', 'c');
    await FindingService.report({ integrationCode: 'trendyol', category: 'marketplace', kind: 'ratelimit', source: 'guard', subjectKey: 'c' }); // medium
    await FindingService.transition(dedupC, 'fixed', { decidedBy: 'admin', fixRef: 'commit-1' }); // artık KAPALI -- sayılmamalı

    const svc = await make(PLATFORM_ADMIN_REQUEST);
    const rows = await svc.summary();
    expect(rows).toHaveLength(6); // listIntegrationDescriptors() -- bugün 6 adaptör
    const trendyol = rows.find((r: any) => r.integrationCode === 'trendyol');
    expect(trendyol.openFindings.total).toBe(2);
    expect(trendyol.openFindings.bySeverity).toMatchObject({ high: 1, info: 1, medium: 0 });
    expect(trendyol.adapterVersion).toEqual(expect.any(String));
    const n11 = rows.find((r: any) => r.integrationCode === 'n11');
    expect(n11.openFindings).toEqual({ total: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } });
  });

  it('JobState kaydı VARSA lastProbeRun tüm kartlarda AYNI paylaşılan tur bilgisini taşır (tek platform-düzeyi koşu)', async () => {
    jobStateStore.store.set('compliance.probeRunner', {
      name: 'compliance.probeRunner', lastFinishedAt: new Date('2026-09-28T00:00:00.000Z'), lastStatus: 'ok', lastCounts: { processed: 2, failed: 0 },
    });
    const svc = await make(PLATFORM_ADMIN_REQUEST);
    const rows = await svc.summary();
    expect(rows[0].lastProbeRun).toEqual({ name: 'compliance.probeRunner', lastFinishedAt: new Date('2026-09-28T00:00:00.000Z'), lastStatus: 'ok', lastCounts: { processed: 2, failed: 0 } });
    expect(rows[1].lastProbeRun).toBe(rows[0].lastProbeRun); // aynı referans -- tek sorgu, tüm kartlara paylaşılır
  });

  it('JobState kaydı YOKSA lastProbeRun null olur (hata FIRLATMAZ)', async () => {
    const svc = await make(PLATFORM_ADMIN_REQUEST);
    const rows = await svc.summary();
    expect(rows[0].lastProbeRun).toBeNull();
  });
});

describe('IntegrationComplianceService.getDetail', () => {
  it('id yoksa 400 VALIDATION; bulunamayan id 404 NOT_FOUND', async () => {
    await expect(make(PLATFORM_ADMIN_REQUEST).then((s: any) => s.getDetail())).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    await expect(make({ ...PLATFORM_ADMIN_REQUEST, id: 'yok-boyle-bir-kayit' }).then((s: any) => s.getDetail())).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('gerçek kullanım: request.id ile mevcut bulgunun tam kaydı gelir (evidence + affectedTenants)', async () => {
    await FindingService.report({
      integrationCode: 'trendyol', category: 'marketplace', kind: 'unknown_enum', source: 'guard',
      subjectKey: 'trendyol.orders.list@v2#status', evidence: { enumValue: 'NEWSTATUS' }, tenantId: 7,
    });
    const id = computeDedupKey('trendyol', 'unknown_enum', 'trendyol.orders.list@v2#status', 'trendyol.orders.list@v2#status');
    const svc = await make({ ...PLATFORM_ADMIN_REQUEST, id });
    const detail = await svc.getDetail();
    expect(detail).toMatchObject({
      dedupKey: id, integrationCode: 'trendyol', kind: 'unknown_enum', severity: 'high',
      affectedTenants: [7], evidence: { enumValue: 'NEWSTATUS' },
    });
  });
});

describe('IntegrationComplianceService.transition', () => {
  it('mutlu yol: triage -> status=triaged, AuditLogger\'a ok yazılır', async () => {
    const auditCalls: any[] = [];
    AuditLogger.setSink(async (rec) => { auditCalls.push(rec); });
    try {
      await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'n11#x' });
      const id = computeDedupKey('n11', 'schema', 'n11#x', 'n11#x');
      const svc = await make({ ...PLATFORM_ADMIN_REQUEST, id, action: 'triage' });
      const result = await svc.transition();
      expect(result.status).toBe('triaged');
      expect(result.decidedBy).toBe('admin-1');
      await Promise.resolve(); await Promise.resolve();
      expect(auditCalls).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'integration_compliance.transition', result: 'ok' })]));
    } finally {
      AuditLogger.setSink(undefined);
    }
  });

  it('fixed: fixRef zorunlu -- eksikse ApplicationError 400 (FindingService hatası sarmalanır) + AuditLogger error yazılır', async () => {
    const auditCalls: any[] = [];
    AuditLogger.setSink(async (rec) => { auditCalls.push(rec); });
    try {
      await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'n11#y' });
      const id = computeDedupKey('n11', 'schema', 'n11#y', 'n11#y');
      const svc = await make({ ...PLATFORM_ADMIN_REQUEST, id, action: 'fixed' });
      await expect(svc.transition()).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
      await Promise.resolve(); await Promise.resolve();
      expect(auditCalls).toEqual(expect.arrayContaining([expect.objectContaining({ event: 'integration_compliance.transition', result: 'error' })]));
    } finally {
      AuditLogger.setSink(undefined);
    }
  });

  it('fixed: fixRef verilince başarılı, closedAt/fixedInAdapterVersion set edilir', async () => {
    await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'n11#z' });
    const id = computeDedupKey('n11', 'schema', 'n11#z', 'n11#z');
    const svc = await make({ ...PLATFORM_ADMIN_REQUEST, id, action: 'fixed', fixRef: 'commit-abc', fixedInAdapterVersion: '1.3.0' });
    const result = await svc.transition();
    expect(result).toMatchObject({ status: 'fixed', fixRef: 'commit-abc', fixedInAdapterVersion: '1.3.0' });
    expect(result.closedAt).toBeTruthy();
  });

  it('wontfix: reason (opsiyonel notes) notes alanına yazılır', async () => {
    await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'n11#w' });
    const id = computeDedupKey('n11', 'schema', 'n11#w', 'n11#w');
    const svc = await make({ ...PLATFORM_ADMIN_REQUEST, id, action: 'wontfix', reason: 'Bilinçli sınır, düzeltilmeyecek.' });
    const result = await svc.transition();
    expect(result).toMatchObject({ status: 'wontfix', notes: 'Bilinçli sınır, düzeltilmeyecek.' });
  });

  it('id eksik: 400 VALIDATION; bilinmeyen action: 400 VALIDATION; bulunamayan id: 404 NOT_FOUND', async () => {
    await expect(make({ ...PLATFORM_ADMIN_REQUEST, action: 'triage' }).then((s: any) => s.transition())).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'n11#bad-action' });
    const id = computeDedupKey('n11', 'schema', 'n11#bad-action', 'n11#bad-action');
    await expect(make({ ...PLATFORM_ADMIN_REQUEST, id, action: 'delete-everything' }).then((s: any) => s.transition())).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION' });
    await expect(make({ ...PLATFORM_ADMIN_REQUEST, id: 'yok-boyle-bir-kayit', action: 'triage' }).then((s: any) => s.transition())).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('kimlik doğrulanamadı (principal.sub yok): 401', async () => {
    await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'schema', source: 'guard', subjectKey: 'n11#noauth' });
    const id = computeDedupKey('n11', 'schema', 'n11#noauth', 'n11#noauth');
    const svc = await make({ id, action: 'triage' }); // principal YOK
    await expect(svc.transition()).rejects.toMatchObject({ statusCode: 401 });
  });

  it('R12: transition() bulguyu ASLA \'new\' durumuna taşımaz (triage/accept/wontfix/false_positive/fixed arasında \'new\' yok) -- ikinci bir alarm çağrısı GEREKMEZ', async () => {
    await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'auth', source: 'guard', subjectKey: 'n11#r12', tenantId: 1 });
    await FindingService.report({ integrationCode: 'n11', category: 'marketplace', kind: 'auth', source: 'guard', subjectKey: 'n11#r12', tenantId: 2 }); // confirmed (>=2 tenant), severity critical
    const id = computeDedupKey('n11', 'auth', 'n11#r12', 'n11#r12');
    const svc = await make({ ...PLATFORM_ADMIN_REQUEST, id, action: 'accept' });
    const result = await svc.transition();
    expect(result.status).toBe('accepted'); // 'new' değil -- R12 tetiklenecek bir geçiş YOK
  });
});

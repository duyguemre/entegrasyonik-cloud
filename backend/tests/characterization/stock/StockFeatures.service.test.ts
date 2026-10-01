/**
 * Faz-3 stok özellikleri: StockService.listLowStock / listMovements / getPublishLagSummary (docs/API_STOCK_FEATURES.md).
 * DB/Redis/ağ YOK: bellek-içi sahte tenant DB + sahte MetricRollups. Sahte `aggregate`, servisin kurduğu boru hattını
 * (kanal filtresi, _avail eşiği, imleç, limit) yorumlar -> filtre/sayfalama anlamı gerçekten sınanır.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));

import StockService from '../../../src/api/services/stock-service';
import { percentileFromBuckets, summarizeBuckets } from '../../../src/operations/stock/publishLag';
import { HISTOGRAM_BUCKETS_MS, HISTOGRAM_BUCKET_SETS } from '../../../src/platform/runtime/metrics';

const oid = () => new ObjectId();

/** Servisin boru hattını yorumlayan sahte Variants.aggregate. */
function fakeVariantModel(variants: any[]) {
  const calls: any[] = [];
  const model = {
    calls,
    aggregate: (pipeline: any[]) => {
      calls.push(pipeline);
      const run = async () => {
        let rows = variants.map((v) => ({ ...v }));
        for (const st of pipeline) {
          if (st.$addFields) rows = rows.map((r) => ({ ...r, _avail: (r.stock ?? 0) - (r.reserved ?? 0) }));
          else if (st.$match) {
            const m = st.$match;
            if (m._avail) rows = rows.filter((r) => r._avail <= m._avail.$lte);
            else if (m.$or) rows = rows.filter((r) => m.$or.some((c: any) => (c._avail.$gt !== undefined ? r._avail > c._avail.$gt : r._avail === c._avail && String(r._id) > String(c._id.$gt))));
            else { const [k, val] = Object.entries(m)[0] as [string, any]; rows = rows.filter((r) => k.split('.').reduce((o: any, pth) => o?.[pth], r) === val); }
          } else if (st.$sort) rows.sort((a, b) => a._avail - b._avail || String(a._id).localeCompare(String(b._id)));
          else if (st.$limit) rows = rows.slice(0, st.$limit);
          else if (st.$project) rows = rows.map((r) => ({ ...r, ...(st.$project._published ? { _published: r.platforms?.trendyol?.stockSync?.lastPublishedQty } : {}) }));
        }
        return rows;
      };
      const p: any = run();
      p.option = () => run();
      return p;
    },
    findOne: jest.fn(() => ({ lean: async () => null })),
  };
  return model;
}

function makeSvc(request: any, opts: { variants?: any[]; threshold?: any; movements?: any[]; rollups?: any[] } = {}) {
  const svc: any = new StockService(4, request);
  const variantModel: any = fakeVariantModel(opts.variants ?? []);
  const movementQuery: any = {};
  const movementRows = opts.movements ?? [];
  const movementModel: any = {
    find: jest.fn((filter: any) => {
      movementQuery.filter = filter;
      const q: any = { sort: () => q, limit: (n: number) => { movementQuery.limit = n; return q; }, maxTimeMS: () => q, lean: async () => movementRows.slice(0, movementQuery.limit) };
      return q;
    }),
  };
  svc.clientDB = {
    getVariantModel: () => variantModel,
    getStockMovementModel: () => movementModel,
    getClientIntegrationModel: () => ({ findOne: jest.fn(() => ({ lean: async () => ({ stockPolicy: { lowStockThreshold: opts.threshold } }) })) }),
  };
  svc.applicationDB = { getMetricRollupModel: () => ({ find: jest.fn(() => { const q: any = { maxTimeMS: () => q, lean: async () => opts.rollups ?? [] }; return q; }) }) };
  return { svc, variantModel, movementModel, movementQuery };
}

const V = (stock: number, reserved: number, extra: any = {}) => ({ _id: oid(), stockcode: `S${stock}-${reserved}`, barcode: `B${stock}-${reserved}`, productId: oid(), stock, reserved, ...extra });

beforeEach(() => { jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { jest.restoreAllMocks(); });

describe('StockService.listLowStock', () => {
  it('eşik yok (istek + tenant) => özellik KAPALI: enabled:false, boş liste, varyant sorgusu yok', async () => {
    const { svc, variantModel } = makeSvc({}, { variants: [V(0, 0)] });
    const r = await svc.listLowStock();
    expect(r).toMatchObject({ enabled: false, threshold: null, items: [], nextCursor: null });
    expect(variantModel.calls).toHaveLength(0);
  });

  it('tenant eşiği: kullanılabilir stok (stock-reserved) <= eşik, en düşük önce; kaynak tenant', async () => {
    const { svc } = makeSvc({}, { threshold: 5, variants: [V(10, 0), V(3, 0), V(8, 6), V(2, 5), V(6, 0)] });
    const r = await svc.listLowStock();
    expect(r.enabled).toBe(true);
    expect(r.thresholdSource).toBe('tenant');
    expect(r.items.map((i: any) => i.available)).toEqual([-3, 2, 3]);
    expect(r.items[0]).toMatchObject({ stock: 2, reserved: 5, available: -3 });
    expect(r.items[0]).not.toHaveProperty('channelPublishedQty');
  });

  it('istek eşiği tenant eşiğini ezer (threshold:0 geçerli; yalnız <=0)', async () => {
    const { svc } = makeSvc({ threshold: 0 }, { threshold: 50, variants: [V(0, 0), V(1, 0), V(3, 3)] });
    const r = await svc.listLowStock();
    expect(r.thresholdSource).toBe('request');
    expect(r.items.map((i: any) => i.available)).toEqual([0, 0]);
  });

  it('channel: yalnız kanalda yayında (TRANSFER COMPLETED) varyantlar + son yayınlanan adet', async () => {
    const live = V(1, 0, { platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' } }, stockSync: { lastPublishedQty: 7 } } } });
    const notLive = V(1, 0, { platforms: { trendyol: { upload: { TRANSFER: { status: 'FAILED' } } } } });
    const { svc } = makeSvc({ channel: 'trendyol' }, { threshold: 5, variants: [live, notLive, V(0, 0)] });
    const r = await svc.listLowStock();
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ variantId: String(live._id), channelPublishedQty: 7 });
  });

  it('imleç sayfalama: limit 2 -> nextCursor, sonraki sayfa kalanları (tekrar/atlama yok)', async () => {
    const vs = [V(1, 0), V(1, 0), V(2, 0), V(0, 0), V(2, 0)];
    const first = await makeSvc({ limit: 2 }, { threshold: 5, variants: vs }).svc.listLowStock();
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await makeSvc({ limit: 2, cursor: first.nextCursor }, { threshold: 5, variants: vs }).svc.listLowStock();
    const third = await makeSvc({ limit: 2, cursor: second.nextCursor }, { threshold: 5, variants: vs }).svc.listLowStock();
    const ids = [...first.items, ...second.items, ...third.items].map((i: any) => i.variantId);
    expect(new Set(ids).size).toBe(5);
    expect(third.nextCursor).toBeNull();
    const avail = [...first.items, ...second.items, ...third.items].map((i: any) => i.available);
    expect(avail).toEqual([...avail].sort((a, b) => a - b));
  });

  it.each([
    [{ limit: 0 }], [{ limit: 201 }], [{ limit: 1.5 }], [{ threshold: -1 }], [{ threshold: 'x' }],
    [{ channel: 'a.b' }], [{ channel: { $ne: 1 } }], [{ cursor: '!!!' }], [{ cursor: 123 }],
  ])('geçersiz girdi %j => 400', async (req) => {
    const { svc } = makeSvc(req, { threshold: 5 });
    await expect(svc.listLowStock()).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('StockService.listMovements', () => {
  const M = (over: any = {}) => ({ _id: oid(), variantId: oid(), at: new Date('2026-09-30T10:00:00Z'), reason: 'order_reserve', delta: -1, before: 5, after: 4, stockAfter: 10, channel: 'trendyol', ref: { kind: 'order', id: 'O1', key: 'trendyol:O1:L1' }, actor: { type: 'system' }, sku: 'S', ...over });

  it('variantId XOR barcode zorunlu', async () => {
    await expect(makeSvc({}).svc.listMovements()).rejects.toMatchObject({ statusCode: 400 });
    await expect(makeSvc({ variantId: String(oid()), barcode: 'B' }).svc.listMovements()).rejects.toMatchObject({ statusCode: 400 });
  });

  it('variantId ile: filtre variantId + tarih aralığı; DTO ref.key (dış sipariş anahtarı) SIZDIRMAZ', async () => {
    const id = String(oid());
    const { svc, movementQuery } = makeSvc({ variantId: id, from: '2026-09-01', to: '2026-09-30T23:59:59Z' }, { movements: [M()] });
    const r = await svc.listMovements();
    expect(String(movementQuery.filter.$and[0].variantId)).toBe(id);
    expect(movementQuery.filter.$and[1].at.$gte).toBeInstanceOf(Date);
    expect(r.items[0]).toMatchObject({ reason: 'order_reserve', delta: -1, before: 5, after: 4, stockAfter: 10, ref: { kind: 'order', id: 'O1' } });
    expect(JSON.stringify(r)).not.toContain('trendyol:O1:L1');
    expect(r.nextCursor).toBeNull();
  });

  it('barcode: varyant çözülür; bulunamazsa boş liste', async () => {
    const { svc } = makeSvc({ barcode: 'YOK' });
    expect(await svc.listMovements()).toEqual({ variantId: null, items: [], nextCursor: null });
    const found = makeSvc({ barcode: 'B1' }, { movements: [M()] });
    const vid = oid();
    found.svc.clientDB.getVariantModel = () => ({ findOne: jest.fn(() => ({ lean: async () => ({ _id: vid }) })) });
    const r = await found.svc.listMovements();
    expect(r.variantId).toBe(String(vid));
    expect(r.items).toHaveLength(1);
  });

  it('sayfalama: limit+1 okunur, nextCursor en yeni->eski imleci üretir', async () => {
    const rows = [M({ at: new Date('2026-09-30T10:00:03Z') }), M({ at: new Date('2026-09-30T10:00:02Z') }), M({ at: new Date('2026-09-30T10:00:01Z') })];
    const { svc, movementQuery } = makeSvc({ variantId: String(oid()), limit: 2 }, { movements: rows });
    const r = await svc.listMovements();
    expect(movementQuery.limit).toBe(3);
    expect(r.items).toHaveLength(2);
    expect(r.nextCursor).toEqual(expect.any(String));
    const next = makeSvc({ variantId: String(oid()), limit: 2, cursor: r.nextCursor }, { movements: [] });
    await next.svc.listMovements();
    expect(next.movementQuery.filter.$and[1].$or[0].at.$lt).toBeInstanceOf(Date);
  });

  it.each([
    [{ variantId: 'xyz' }], [{ variantId: { $ne: 1 } }], [{ barcode: '' }], [{ barcode: 'B', from: 'nope' }],
    [{ barcode: 'B', from: '2026-10-01', to: '2026-09-01' }], [{ barcode: 'B', limit: 500 }], [{ barcode: 'B', cursor: 'zzz' }],
  ])('geçersiz girdi %j => 400', async (req) => {
    await expect(makeSvc(req).svc.listMovements()).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('StockService.getPublishLagSummary + yüzdelik', () => {
  const series = (integration: string, h: Record<string, number>, sum: number) => ({ labels: { integration }, c: Object.values(h).reduce((a, b) => a + b, 0), sum, h });

  it('kova sınırları: long set üst kova 1 sa; +Inf kovası overflow (değer UYDURULMAZ)', () => {
    const LONG = HISTOGRAM_BUCKET_SETS.long;
    expect(HISTOGRAM_BUCKETS_MS[HISTOGRAM_BUCKETS_MS.length - 1]).toBe(60000); // varsayılan set değişmedi
    expect(LONG[LONG.length - 1]).toBe(3600000);
    const b = new Array(LONG.length + 1).fill(0);
    b[LONG.length] = 10; // hepsi >1 sa
    expect(percentileFromBuckets(b, 0.95)).toEqual({ valueMs: null, overflow: true });
    expect(summarizeBuckets(b, 10, 9e7)).toMatchObject({ p50Ms: null, p95Ms: null, p95Overflow: true, overflowCount: 10, maxBucketMs: 3600000 });
  });

  it('p50/p95 kova içi doğrusal interpolasyon; boş histogram null', () => {
    const b = new Array(HISTOGRAM_BUCKETS_MS.length + 1).fill(0);
    b[2] = 100; // (100, 250] ms
    expect(percentileFromBuckets(b, 0.5).valueMs).toBe(175);
    expect(percentileFromBuckets(b, 0.95).valueMs).toBe(243);
    expect(percentileFromBuckets(new Array(11).fill(0), 0.5)).toEqual({ valueMs: null, overflow: false });
  });

  it('kovalar arası toplama: kanal başına + toplam; window doğrulanır', async () => {
    const rollups = [
      { series: { 'integration=trendyol': series('trendyol', { 2: 50, 4: 50 }, 40000), 'integration=n11': series('n11', { 1: 10 }, 700) } },
      { series: { 'integration=trendyol': series('trendyol', { 2: 100 }, 20000) } },
    ];
    const { svc } = makeSvc({ window: '24h' }, { rollups });
    const r = await svc.getPublishLagSummary();
    expect(r).toMatchObject({ window: '24h', resolution: '1h', scope: 'platform' });
    expect(r.byIntegration.map((x: any) => x.integration)).toEqual(['n11', 'trendyol']);
    const ty = r.byIntegration.find((x: any) => x.integration === 'trendyol');
    expect(ty.count).toBe(200);
    expect(ty.avgMs).toBe(300);
    expect(r.total.count).toBe(210);
    expect((await makeSvc({}, { rollups: [] }).svc.getPublishLagSummary())).toMatchObject({ window: '1h', resolution: '5m', total: { count: 0, p50Ms: null } });
    await expect(makeSvc({ window: '7d' }).svc.getPublishLagSummary()).rejects.toMatchObject({ statusCode: 400 });
  });
});

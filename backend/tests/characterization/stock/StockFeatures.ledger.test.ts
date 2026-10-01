/**
 * Faz-3: stok hareket defteri yazımı (StockAllocator / kullanıcı düzenlemesi), kanal güvenlik stoğu (saf hesap + doğrulama),
 * düşük stok bildirimi (STOCK_LOW katalog uyumu + günde bir kez dedupe anahtarı). DB/Redis/ağ YOK.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ObjectId } from 'mongodb';

const notifyMock: any = jest.fn(async () => ({ status: 'created' }));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: { notify: (...a: any[]) => notifyMock(...a) } }));
jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { isReady: () => true } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import { StockAllocator } from '../../../src/operations/stock/StockAllocator';
import { StockPublishTrigger } from '../../../src/operations/stock/StockPublishTrigger';
import { findStockChanges, recordManualStockMovements } from '../../../src/operations/stock/markStockDirty';
import { recordStockMovement, toMovementDoc } from '../../../src/operations/stock/stockMovements';
import { notifyLowStockVariants, istanbulDay, LOW_STOCK_NOTIFY_PER_RUN_MAX } from '../../../src/operations/stock/lowStock';
import { validateChannelStockPolicyPatch, validateLowStockThreshold, pickChannelStockPolicy, pickLowStockThreshold, StockPolicyValidationError } from '../../../src/operations/stock/stockPolicyValidation';
import { getDefinition } from '../../../src/operations/notifications/catalog';
import { metricsRegistry } from '../../../src/platform/runtime/metrics';

const flush = () => new Promise((r) => setImmediate(r));

function movementDb() {
  const inserted: any[] = [];
  const model = { insertMany: jest.fn(async (docs: any[]) => { inserted.push(...docs); return docs; }) };
  return { inserted, model, clientDB: { getStockMovementModel: () => model } };
}

describe('StockMovements: StockAllocator geçişleri tek noktadan hareket yazar', () => {
  const vid = new ObjectId();
  const variantAfter = (stock: number, reserved: number) => ({ _id: vid, stock, reserved, stockcode: 'SKU-1', barcode: 'B-1' });

  function allocator(db: any, overrides: any) {
    const variantModel: any = { findOneAndUpdate: jest.fn(async () => null), findOne: jest.fn(() => ({ lean: async () => null })), ...overrides };
    return new StockAllocator({ getVariantModel: () => variantModel, ...db } as any);
  }

  it('reserve: delta -qty, before/after kullanılabilir stok, kanal+sipariş ref, idempotency anahtarı', async () => {
    const m = movementDb();
    const a = allocator(m.clientDB, { findOneAndUpdate: jest.fn(async () => variantAfter(10, 3)) });
    const r = await a.reserve(vid, 'trendyol:ORD-1:L-1', 3);
    expect(r.state).toBe('RESERVED');
    await flush();
    expect(m.inserted).toHaveLength(1);
    expect(m.inserted[0]).toMatchObject({
      variantId: vid, sku: 'SKU-1', delta: -3, before: 10, after: 7, stockAfter: 10, reason: 'order_reserve', channel: 'trendyol',
      ref: { kind: 'order', id: 'ORD-1', key: 'trendyol:ORD-1:L-1' }, actor: { type: 'system' }, schemaVersion: 1,
    });
    expect(m.inserted[0].purgeAt.getTime() - m.inserted[0].at.getTime()).toBe(730 * 24 * 3600 * 1000);
  });

  it('commit (RESERVED->COMMITTED): available değişmez (delta 0) ama stockAfter fiziksel düşüşü taşır; ilk-kez sevkte delta -qty', async () => {
    const m1 = movementDb();
    await allocator(m1.clientDB, { findOneAndUpdate: jest.fn(async () => variantAfter(7, 0)) }).commit(vid, 'hb:O2:L1', 3);
    await flush();
    expect(m1.inserted[0]).toMatchObject({ reason: 'order_commit', delta: 0, before: 7, after: 7, stockAfter: 7 });

    const m2 = movementDb();
    const fo = jest.fn()
      .mockImplementationOnce(async () => null) // RESERVED satırı yok
      .mockImplementationOnce(async () => variantAfter(7, 0)); // ilk-kez sevk: stok -qty
    await allocator(m2.clientDB, { findOneAndUpdate: fo, findOne: jest.fn(() => ({ lean: async () => ({ _id: vid, allocations: [] }) })) }).commit(vid, 'hb:O3:L1', 3);
    await flush();
    expect(m2.inserted[0]).toMatchObject({ reason: 'order_commit', delta: -3, before: 10, after: 7 });
  });

  it('release (RESERVED): +qty (allocations qty) order_release; restock: return_restock + claim ref', async () => {
    const m = movementDb();
    const a = allocator(m.clientDB, {
      findOne: jest.fn(() => ({ lean: async () => ({ _id: vid, allocations: [{ key: 'n11:O4:L1', qty: 2, state: 'RESERVED' }] }) })),
      findOneAndUpdate: jest.fn(async () => variantAfter(10, 1)),
    });
    await a.release(vid, 'n11:O4:L1');
    await a.restock(vid, 'return:n11:CLM-9:L1', 1, { allowed: true });
    await flush();
    expect(m.inserted[0]).toMatchObject({ reason: 'order_release', delta: 2, before: 7, after: 9, channel: 'n11' });
    expect(m.inserted[1]).toMatchObject({ reason: 'return_restock', delta: 1, channel: 'n11', ref: { kind: 'claim', id: 'CLM-9' } });
  });

  it('idempotent no-op (aynı anahtar tekrar) hareket YAZMAZ; oversold/SKIPPED_POLICY da yazmaz', async () => {
    const m = movementDb();
    const a = allocator(m.clientDB, {
      findOne: jest.fn(() => ({ lean: async () => ({ _id: vid, allocations: [{ key: 'trendyol:O5:L1', qty: 1, state: 'RESERVED' }] }) })),
    });
    const r = await a.reserve(vid, 'trendyol:O5:L1', 1);
    expect(r.idempotent).toBe(true);
    await a.restock(vid, 'return:x:y:z', 1); // policy kapalı
    await flush();
    expect(m.inserted).toHaveLength(0);
  });

  it('defter yazımı başarısız olsa da stok geçişi ETKİLENMEZ; hata sayaç olur, fırlamaz', async () => {
    metricsRegistry.resetForTests();
    const failing = { getStockMovementModel: () => ({ insertMany: jest.fn(async () => { throw new Error('mongo down'); }) }) };
    const a = allocator(failing, { findOneAndUpdate: jest.fn(async () => variantAfter(10, 1)) });
    await expect(a.reserve(vid, 'trendyol:O6:L1', 1)).resolves.toMatchObject({ state: 'RESERVED' });
    await flush(); await flush();
    const snap = metricsRegistry.drain().find((s) => s.metric === 'stock_movement_write_failures_total');
    expect(snap?.count).toBe(1);
  });

  it('duplicate key (E11000; tekrar oynatma) sessizce yutulur — sayaç artmaz', async () => {
    metricsRegistry.resetForTests();
    const dup = { getStockMovementModel: () => ({ insertMany: jest.fn(async () => { throw Object.assign(new Error('dup'), { code: 11000 }); }) }) };
    recordStockMovement(dup, { variantId: vid, delta: -1, before: 2, after: 1, reason: 'order_reserve', ref: { key: 'k' } });
    await flush(); await flush();
    expect(metricsRegistry.drain().find((s) => s.metric === 'stock_movement_write_failures_total')).toBeUndefined();
  });

  it('getStockMovementModel olmayan (eski) clientDB: no-op (mevcut akış bozulmaz)', async () => {
    const a = allocator({}, { findOneAndUpdate: jest.fn(async () => variantAfter(10, 1)) });
    await expect(a.reserve(vid, 'trendyol:O7:L1', 1)).resolves.toMatchObject({ state: 'RESERVED' });
  });

  it('toMovementDoc: ref.key 400 karakterle sınırlı, boş alanlar yazılmaz', () => {
    const d: any = toMovementDoc({ variantId: vid, delta: 1, before: 0, after: 1, reason: 'reconcile', ref: { key: 'x'.repeat(500) } });
    expect(d.ref.key).toHaveLength(400);
    expect(d).not.toHaveProperty('channel');
  });
});

describe('StockMovements: kullanıcı düzenlemesi (manual_set)', () => {
  it('findStockChanges yalnız stoğu DEĞİŞEN mevcut varyantı (önce/sonra) verir; recordManualStockMovements available farkını yazar', async () => {
    const id = new ObjectId().toString();
    const same = new ObjectId().toString();
    const model = { find: jest.fn(() => ({ lean: async () => [{ _id: id, stock: 5, reserved: 2, stockcode: 'S1' }, { _id: same, stock: 4, reserved: 0 }] })) };
    const changes = await findStockChanges(model, [{ _id: id, stock: 9 }, { _id: same, stock: 4 }, { stock: 3 }]);
    expect([...changes.keys()]).toEqual([id]);
    const m = movementDb();
    recordManualStockMovements(m.clientDB, changes.values(), { principal: { sub: 'user-1' } });
    await flush();
    expect(m.inserted[0]).toMatchObject({ variantId: id, sku: 'S1', delta: 4, before: 3, after: 7, stockAfter: 9, reason: 'manual_set', actor: { type: 'user', id: 'user-1' } });
  });
});

describe('Kanal güvenlik stoğu (safetyStock): StockPublishTrigger tek yardımcı', () => {
  const pub = StockPublishTrigger.computePublishQuantity;

  it('varsayılan (safetyStock yok/0) = bugünkü davranış (karakterizasyon)', () => {
    for (const available of [0, 1, 5, 100]) {
      for (const isPrimary of [true, false]) {
        const base = pub(available, { isPrimary, bufferUnits: 2, bufferPercent: 10, channelMax: 50 });
        expect(pub(available, { isPrimary, bufferUnits: 2, bufferPercent: 10, channelMax: 50, safetyStock: 0 })).toBe(base);
      }
    }
    expect(pub(10, { isPrimary: true })).toBe(10);
    expect(pub(10, { isPrimary: false })).toBe(9); // varsayılan tampon 1 (ADR)
  });

  it('safetyStock: yayın = max(0, stok - safetyStock) (birincil kanal, tampon 0)', () => {
    expect(pub(20, { isPrimary: true, safetyStock: 5 })).toBe(15);
    expect(pub(3, { isPrimary: true, safetyStock: 5 })).toBe(0);
    expect(pub(-2, { isPrimary: true, safetyStock: 1 })).toBe(0);
  });

  it('tampon ile birleşir (önce güvenlik stoğu, sonra tampon) ve kanal üst sınırı uygulanır', () => {
    expect(pub(20, { isPrimary: false, bufferUnits: 2, safetyStock: 5 })).toBe(13);
    expect(pub(100, { isPrimary: true, safetyStock: 10, channelMax: 50 })).toBe(50);
    expect(StockPublishTrigger.applySafetyStock(10, -3)).toBe(10); // geçersiz => 0
    expect(StockPublishTrigger.applySafetyStock(10, NaN)).toBe(10);
  });

  it('politika doğrulaması: safetyStock tamsayı 0..1e6, null = varsayılana döndür', () => {
    expect(validateChannelStockPolicyPatch({ safetyStock: 7 }).set).toEqual({ safetyStock: 7 });
    expect(validateChannelStockPolicyPatch({ safetyStock: null }).unset).toEqual(['safetyStock']);
    for (const bad of [-1, 1.5, '3', 2_000_000, NaN]) expect(() => validateChannelStockPolicyPatch({ safetyStock: bad })).toThrow(StockPolicyValidationError);
    expect(pickChannelStockPolicy({ safetyStock: 4, junk: 1 })).toEqual({ safetyStock: 4 });
  });
});

describe('Düşük stok: tenant eşiği + STOCK_LOW bildirimi', () => {
  beforeEach(() => { notifyMock.mockClear(); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('eşik doğrulaması: null = kapat; 0..1e6 tamsayı; bozuk kayıt = kapalı', () => {
    expect(validateLowStockThreshold(null)).toBeNull();
    expect(validateLowStockThreshold(0)).toBe(0);
    for (const bad of [-1, 1.5, '5', undefined, 2_000_000]) expect(() => validateLowStockThreshold(bad as any)).toThrow(StockPolicyValidationError);
    expect(pickLowStockThreshold(undefined)).toBeNull();
    expect(pickLowStockThreshold('5')).toBeNull();
    expect(pickLowStockThreshold(5)).toBe(5);
  });

  it('eşik yoksa bildirim YOK (varsayılan kapalı)', async () => {
    expect(await notifyLowStockVariants(4, [{ _id: 'v1', stock: 0 }], undefined)).toBe(0);
    expect(await notifyLowStockVariants(4, [{ _id: 'v1', stock: 0 }], null)).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('yalnız available <= eşik olanlara; params katalog zod şemasından geçer; dedupeKey = varyant:gün', async () => {
    const vs = [{ _id: 'v1', stock: 10, reserved: 8, stockcode: 'S1' }, { _id: 'v2', stock: 50, reserved: 0 }, { _id: 'v3', stock: 0, barcode: 'B3' }];
    const n = await notifyLowStockVariants(4, vs, 5, new Date('2026-09-30T21:30:00Z')); // İstanbul: 1 Ekim 00:30
    expect(n).toBe(2);
    expect(notifyMock).toHaveBeenCalledTimes(2);
    const [code, tid, params] = notifyMock.mock.calls[0] as any[];
    expect([code, tid]).toEqual(['STOCK_LOW', 4]);
    expect(params).toEqual({ variantId: 'v1', sku: 'S1', available: 2, threshold: 5, day: '2026-10-01' });
    const def = getDefinition('STOCK_LOW')!;
    expect(def.params.safeParse(params).success).toBe(true);
    expect(def.dedupeKey!(params)).toBe('v1:2026-10-01');
    expect((notifyMock.mock.calls[1] as any[])[2]).toMatchObject({ variantId: 'v3', sku: 'B3' });
    expect(istanbulDay(new Date('2026-09-30T20:59:00Z'))).toBe('2026-09-30');
  });

  it('tur başına üst sınır (patlama koruması) ve bildirim hatası yayın turunu bozmaz', async () => {
    const many = Array.from({ length: LOW_STOCK_NOTIFY_PER_RUN_MAX + 20 }, (_, i) => ({ _id: `v${i}`, stock: 0 }));
    expect(await notifyLowStockVariants(4, many, 1)).toBe(LOW_STOCK_NOTIFY_PER_RUN_MAX);
    notifyMock.mockImplementationOnce(async () => { throw new Error('x'); });
    await expect(notifyLowStockVariants(4, [{ _id: 'a', stock: 0 }], 1)).resolves.toBe(1);
  });
});

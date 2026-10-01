/**
 * [ADR-0030 X4] Müşteri yüzeyi yazmalarının `app.write` denetimi (RunOperation.executeAppWriteAudited + appWriteAudit.ts).
 * Gerçek yetenek kaydı kullanılır; servisler ve tenant DB mock'lanır (DB'ye dokunulmaz).
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const findOneLean: jest.Mock<any> = jest.fn();

class ProductService {
  constructor(public clientId: any, public request: any) {}
  async init() {}
  async updateOnsale() { return { result: true }; }
  async getProducts() { return []; }
}
class VariantService {
  constructor(public clientId: any, public request: any) {}
  async init() {}
  async updateVariants() { return true; }
  async batchProcessUpdate() { return true; }
}
class IntegrationService {
  constructor(public clientId: any, public request: any) {}
  async init() {}
  async saveClientMarketplaceSettings() { if ((this.request as any).boom) throw Object.assign(new Error('x'), { statusCode: 400 }); return { ok: 1 }; }
}

const model = { findOne: () => ({ lean: () => findOneLean() }) };
const fakeDb = { getProductModel: () => model, getVariantModel: () => model, getClientIntegrationModel: () => model, getUserModel: () => model };

type Rec = Record<string, any>;
let AuditLogger: any;

function load() {
  let run: any;
  jest.isolateModules(() => {
    jest.doMock('../../../src/api/index', () => ({ __esModule: true, default: { ProductService, VariantService, IntegrationService } }));
    jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getClientDB: async () => fakeDb } }));
    AuditLogger = require('../../../src/services/audit/AuditLogger').AuditLogger;
    run = require('../../../src/api/RunOperation').default;
  });
  return run as (uc: any, s: string, o: string, r: any, p?: any) => Promise<any>;
}

const ADMIN_UC = { order: 1, roleCode: 'ROLE_ADMIN' };
const PR = { sub: 'u1', tid: 1, ga: false, tv: 0, imp: false };
let sunk: Rec[];
const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  findOneLean.mockReset();
  sunk = [];
});

function withSink() {
  const run = load();
  AuditLogger.setSink(async (r: Rec) => { sunk.push(r); });
  return run;
}

describe('[X4] app.write denetimi', () => {
  it('yazma denetlenir (kim/ne/hedef/sonuç); okuma denetlenmez', async () => {
    const run = withSink();
    await run(ADMIN_UC, 'ProductService', 'getProducts', {}, PR);
    await tick();
    expect(sunk).toHaveLength(0);

    findOneLean.mockResolvedValue({ onsale: false });
    await run(ADMIN_UC, 'ProductService', 'updateOnsale', { _id: '507f1f77bcf86cd799439011', onsale: true }, PR);
    await tick();
    expect(sunk).toHaveLength(1);
    const r = sunk[0];
    expect(r).toMatchObject({ event: 'app.write', result: 'ok', sub: 'u1', tid: 1, surface: 'app', actorType: 'user' });
    expect(r.imp).toBeUndefined();
    expect(r.meta).toMatchObject({ service: 'ProductService', operation: 'updateOnsale', effect: 'write', target: '507f1f77bcf86cd799439011', a_onsale: true, b_onsale: false });
  });

  it('tek varyant stok/fiyat önce/sonra; toplu işlemde yalnız sayı (değer yok)', async () => {
    const run = withSink();
    findOneLean.mockResolvedValue({ stock: 3, prices: { salePrice: 100 } }); // DB-07: Variants belgesi
    await run(ADMIN_UC, 'VariantService', 'updateVariants', { productId: 'p1', variants: [{ _id: 'v1', stock: 5, prices: { salePrice: 120 } }] }, PR);
    await run(ADMIN_UC, 'VariantService', 'updateVariants', { productId: 'p1', variants: [{ _id: 'v1', stock: 5 }, { _id: 'v2', stock: 9 }] }, PR);
    await run(ADMIN_UC, 'VariantService', 'batchProcessUpdate', { productId: 'p1', scope: 1, selectedVariants: ['a', 'b', 'c'], batchProcessForm: { stock: 77, prices: {} } }, PR);
    await tick();
    expect(sunk[0].meta).toMatchObject({ a_stock: 5, b_stock: 3, a_salePrice: 120, b_salePrice: 100 });
    expect(sunk[1].meta).toMatchObject({ count: 2 });
    expect(sunk[1].meta.a_stock).toBeUndefined();
    expect(sunk[2].meta).toMatchObject({ count: 3, target: 'p1' });
    expect(JSON.stringify(sunk[2])).not.toContain('77');
  });

  it('entegrasyon kimlik bilgisi: sır DEĞERİ asla yazılmaz, yalnız değişen alan adı; sensitive = değişmedi', async () => {
    const run = withSink();
    await run(ADMIN_UC, 'IntegrationService', 'saveClientMarketplaceSettings', {
      clientMarketplace: { code: 'trendyol', settings: { apiKey: 'SUPER-SECRET-VALUE-123', apiSecret: 'sensitive', supplierId: '999' } },
    }, PR);
    await tick();
    const r = sunk[0];
    expect(r.meta).toMatchObject({ target: 'trendyol', credentialsChanged: true });
    expect(r.meta.changed).toBe('apiKey,supplierId');
    const dump = JSON.stringify(r);
    expect(dump).not.toContain('SUPER-SECRET-VALUE-123');
    expect(dump).not.toContain('999');
  });

  it('hata sonucu: 4xx => fail + kod; imp oturumu işaretlenir', async () => {
    const run = withSink();
    await expect(run(ADMIN_UC, 'IntegrationService', 'saveClientMarketplaceSettings', { boom: true, clientMarketplace: { code: 'n11', settings: {} } }, { ...PR, imp: true })).rejects.toThrow();
    await tick();
    expect(sunk[0]).toMatchObject({ result: 'fail', imp: true, actorType: 'impersonator' });
    expect(sunk[0].meta.code).toBe('VALIDATION');
  });

  it('PII: e-posta benzeri değer maskelenir', async () => {
    const run = withSink();
    findOneLean.mockResolvedValue({ onsale: false });
    await run(ADMIN_UC, 'ProductService', 'updateOnsale', { _id: 'a@b.com', onsale: true }, PR);
    await tick();
    expect(JSON.stringify(sunk[0])).not.toContain('a@b.com');
  });

  it('denetim yazımı patlarsa istek düşmez ve sonuç değişmez', async () => {
    const run = load();
    AuditLogger.setSink(async () => { throw new Error('db down'); });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    findOneLean.mockResolvedValue({ onsale: false });
    await expect(run(ADMIN_UC, 'ProductService', 'updateOnsale', { _id: 'x', onsale: true }, PR)).resolves.toEqual({ result: true });
    await tick();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('"önce" okuması patlarsa işlem yine çalışır, yalnız b_ alanı yoktur', async () => {
    const run = withSink();
    findOneLean.mockRejectedValue(new Error('read fail'));
    await expect(run(ADMIN_UC, 'ProductService', 'updateOnsale', { _id: 'x', onsale: true }, PR)).resolves.toEqual({ result: true });
    await tick();
    expect(sunk[0].meta.a_onsale).toBe(true);
    expect(sunk[0].meta.b_onsale).toBeUndefined();
  });
});

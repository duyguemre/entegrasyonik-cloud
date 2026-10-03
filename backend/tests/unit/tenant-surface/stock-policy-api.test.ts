import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// N5 / ADR-0004: stok politikası uçları (IntegrationService.getStockPolicy / saveTenantStockPolicy / saveChannelStockPolicy).
// DB/Redis/ağ YOK: tenant DB modeli, konumsal ($) noktalı-yol $set/$unset'i uygulayan bellek-içi bir belgeyle taklit edilir;
// böylece "settings'in diğer alanlarını EZMEZ" iddiası gerçek güncelleme semantiğiyle doğrulanır.

const appDb: any = {};
const clientDb: any = {};
jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: async () => appDb, getClientDB: async () => clientDb },
}));
jest.mock('@utils/decorator/cache', () => ({ nodeCache: { getStats: () => ({}), keys: () => [] } }));
jest.mock('@services/redis/RedisService', () => ({ RedisService: { getInstance: () => ({}) } }));
jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@integration/engine/IntegrationEventBus', () => ({ EVENTS: {}, integrationEventBus: { emit: jest.fn(), on: jest.fn() } }));
jest.mock('@services/notification/NotificationService', () => ({ NotificationService: {} }));

import IntegrationService from '../../../src/api/services/integration-service';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';
import { AUTO_CANCEL_SUPPORTED_CHANNELS, validateChannelStockPolicyPatch, StockPolicyValidationError } from '../../../src/operations/stock/stockPolicyValidation';

const clone = (v: any) => JSON.parse(JSON.stringify(v));

/** Yalnızca bu testlerin ihtiyaç duyduğu alt küme: filtre `{}` | `{'marketplace.code': x}`; $set/$unset `[a].$.b.c` veya düz `a.b` yolları. */
function makeCiModel(seed: any) {
  const state = { doc: clone(seed) };
  const matchIndex = (filter: any): number | null => {
    if (!filter || Object.keys(filter).length === 0) return -1; // belge eşleşir, konumsal yok
    const code = filter['marketplace.code'];
    const i = (state.doc.marketplace || []).findIndex((m: any) => m.code === code);
    return i >= 0 ? i : null;
  };
  const setPath = (obj: any, parts: string[], value: any, unset: boolean) => {
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] ?? {}; o = o[parts[i]]; }
    if (unset) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = value;
  };
  const apply = (filter: any, update: any) => {
    const idx = matchIndex(filter);
    if (idx === null) return null;
    for (const [op, unset] of [['$set', false], ['$unset', true]] as const) {
      for (const [p, v] of Object.entries(update[op] || {})) {
        const parts = p.split('.');
        if (parts[1] === '$') {
          if (idx < 0) throw new Error('positional without match');
          setPath(state.doc[parts[0]][idx], parts.slice(2), v, unset);
        } else setPath(state.doc, parts, v, unset);
      }
    }
    return clone(state.doc);
  };
  const model: any = {
    findOne: jest.fn(() => ({ lean: async () => clone(state.doc) })),
    findOneAndUpdate: jest.fn(async (filter: any, update: any) => apply(filter, update)),
  };
  return { model, state };
}

const SEED = () => ({
  marketplace: [
    { code: 'trendyol', order: 1, status: true, settings: { SELLERID: '123', APIKEY: 'enc:v1:t1:x', taxPercentage: 20, stockPolicy: { bufferUnits: 2, graceMinutes: 45 } } },
    { code: 'n11', order: 3, status: true, settings: { APIKEY: '' } },
    { code: 'hepsiburada', order: 2, status: false, settings: {} },
  ],
  shipment: [], ecommerce: [], erp: [], einvoice: [],
  stockPolicy: {},
});

let ci: ReturnType<typeof makeCiModel>;
const audit: any[] = [];

async function svc(request: any, clientId = 4): Promise<any> {
  const s: any = new IntegrationService(clientId, { principal: { sub: 'u1', tid: clientId }, ...request });
  await s.init();
  return s;
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  ci = makeCiModel(SEED());
  Object.assign(clientDb, { getClientIntegrationModel: () => ci.model });
  audit.length = 0;
  jest.spyOn(AuditLogger, 'fromRequest').mockImplementation(((_r: any, event: string, result: string, meta: any) => { audit.push({ event, result, meta }); return Promise.resolve(); }) as any);
});
afterEach(() => { jest.restoreAllMocks(); });

describe('validateChannelStockPolicyPatch', () => {
  it('geçerli kısmi patch: yalnızca gelen alanlar; null = varsayılana dön', () => {
    expect(validateChannelStockPolicyPatch({ bufferUnits: 0, bufferPercent: 12.5, graceMinutes: 10080, autoCancelOversold: false, })).toEqual({
      set: { bufferUnits: 0, bufferPercent: 12.5, graceMinutes: 10080, autoCancelOversold: false }, unset: [],
    });
    expect(validateChannelStockPolicyPatch({ graceMinutes: null, bufferUnits: 3 })).toEqual({ set: { bufferUnits: 3 }, unset: ['graceMinutes'] });
  });

  it.each([
    [{}], [null], [[]], ['x'], [7],
    [{ bufferUnits: -1 }], [{ bufferUnits: 1.5 }], [{ bufferUnits: '3' }], [{ bufferUnits: 100001 }], [{ bufferUnits: NaN }],
    [{ bufferPercent: -0.1 }], [{ bufferPercent: 100.1 }], [{ bufferPercent: Infinity }], [{ bufferPercent: '10' }],
    [{ graceMinutes: -1 }], [{ graceMinutes: 10081 }], [{ graceMinutes: 1.2 }], [{ graceMinutes: true }],
    [{ autoCancelOversold: 'true' }], [{ autoCancelOversold: 1 }],
    [{ autoRestock: true }], // tüketicisi olmayan alan KABUL EDİLMEZ
    [{ bufferUnits: 1, extra: 1 }], [{ __proto__x: 1 }], [JSON.parse('{"__proto__": {"polluted": true}}')], [{ constructor: 1 }],
  ])('reddeder: %j', (input: any) => {
    expect(() => validateChannelStockPolicyPatch(input)).toThrow(StockPolicyValidationError);
  });
});

describe('IntegrationService.getStockPolicy', () => {
  it('birincil kanal yapılandırılmamışsa en küçük order etkin birincildir; kanal başına yalnızca bilinen alanlar döner', async () => {
    const r = await (await svc({})).getStockPolicy();
    expect(r.primaryChannel).toBeNull();
    expect(r.effectivePrimaryChannel).toBe('trendyol');
    expect(r.channels.map((c: any) => c.integrationCode)).toEqual(['trendyol', 'hepsiburada', 'n11']); // order'a göre
    const ty = r.channels[0];
    expect(ty).toEqual({ integrationCode: 'trendyol', order: 1, enabled: true, isPrimary: true, autoCancelSupported: true, stockPolicy: { bufferUnits: 2, graceMinutes: 45 } });
    expect(r.channels.find((c: any) => c.integrationCode === 'n11')).toMatchObject({ autoCancelSupported: false, isPrimary: false, stockPolicy: {} });
    expect(r.defaults).toEqual({ bufferUnits: 1, bufferPercent: 0, safetyStock: 0, graceMinutes: 30, autoCancelOversold: true });
    // sır/diğer ayarlar ASLA dönmez
    expect(JSON.stringify(r)).not.toMatch(/SELLERID|APIKEY|enc:v1|taxPercentage/);
  });

  it('yapılandırılmış birincil kanal öncelik alır; bağlı olmayan koda işaret ediyorsa primaryChannelIsConnected=false', async () => {
    ci.state.doc.stockPolicy = { primaryChannel: 'n11' };
    let r = await (await svc({})).getStockPolicy();
    expect([r.primaryChannel, r.effectivePrimaryChannel, r.primaryChannelIsConnected]).toEqual(['n11', 'n11', true]);
    ci.state.doc.stockPolicy = { primaryChannel: 'amazon' };
    r = await (await svc({})).getStockPolicy();
    expect([r.effectivePrimaryChannel, r.primaryChannelIsConnected]).toEqual(['amazon', false]);
  });

  it('belge yoksa boş liste (hata değil)', async () => {
    ci.model.findOne = jest.fn(() => ({ lean: async () => null }));
    const r = await (await svc({})).getStockPolicy();
    expect(r).toMatchObject({ primaryChannel: null, effectivePrimaryChannel: null, channels: [] });
  });
});

describe('IntegrationService.saveTenantStockPolicy (primaryChannel)', () => {
  it('bağlı pazaryerini birincil yapar; filtre varlık korumasıdır; denetim kaydı yazılır', async () => {
    const r = await (await svc({ primaryChannel: 'n11' })).saveTenantStockPolicy();
    expect(r).toEqual({ primaryChannel: 'n11' });
    expect(ci.model.findOneAndUpdate).toHaveBeenCalledWith({ 'marketplace.code': 'n11' }, { $set: { 'stockPolicy.primaryChannel': 'n11' } }, { upsert: false, returnDocument: 'after' });
    expect(ci.state.doc.marketplace[0].settings).toEqual(SEED().marketplace[0].settings); // kanal settings'ine DOKUNULMADI
    expect(audit).toEqual([{ event: 'stock.policy.primary', result: 'ok', meta: { primaryChannel: 'n11' } }]);
  });

  it('bağlı olmayan/bilinmeyen kod => 400 ve DB değişmez', async () => {
    await expect((await svc({ primaryChannel: 'amazon' })).saveTenantStockPolicy()).rejects.toMatchObject({ statusCode: 400 });
    expect(ci.state.doc.stockPolicy).toEqual({});
    expect(audit).toEqual([]);
  });

  it.each([[{}], [{ primaryChannel: 5 }], [{ primaryChannel: { $ne: null } }], [{ primaryChannel: 'a.b' }], [{ primaryChannel: 'x'.repeat(65) }], [{ primaryChannel: '$where' }]])(
    'geçersiz girdi %j => 400 (operatör/nokta enjeksiyonu yok)', async (req: any) => {
      await expect((await svc(req)).saveTenantStockPolicy()).rejects.toMatchObject({ statusCode: 400 });
      expect(ci.model.findOneAndUpdate).not.toHaveBeenCalled();
    });

  it('null/"" = temizle (varsayılan birincil davranışa dön)', async () => {
    ci.state.doc.stockPolicy = { primaryChannel: 'n11' };
    expect(await (await svc({ primaryChannel: null })).saveTenantStockPolicy()).toEqual({ primaryChannel: null });
    expect(ci.model.findOneAndUpdate).toHaveBeenCalledWith({}, { $unset: { 'stockPolicy.primaryChannel': '' } }, { upsert: false, returnDocument: 'after' });
    expect(ci.state.doc.stockPolicy).toEqual({});
  });
});

describe('IntegrationService.saveTenantStockPolicy (lowStockThreshold, Faz-3)', () => {
  it("yalnız eşik: primaryChannel'a dokunmaz, filtre {} ; yanıtta eşik; denetim kaydı", async () => {
    const r = await (await svc({ lowStockThreshold: 5 })).saveTenantStockPolicy();
    expect(r).toEqual({ primaryChannel: null, lowStockThreshold: 5 });
    expect(ci.model.findOneAndUpdate).toHaveBeenCalledWith({}, { $set: { 'stockPolicy.lowStockThreshold': 5 } }, { upsert: false, returnDocument: 'after' });
    expect(audit).toEqual([{ event: 'stock.policy.lowStock', result: 'ok', meta: { lowStockThreshold: 5 } }]);
  });
  it('null = kapat ($unset); 0 geçerli; birincil kanalla birlikte tek atomik güncelleme', async () => {
    ci.state.doc.stockPolicy = { lowStockThreshold: 9 };
    expect(await (await svc({ lowStockThreshold: null })).saveTenantStockPolicy()).toEqual({ primaryChannel: null, lowStockThreshold: null });
    expect(ci.state.doc.stockPolicy).toEqual({});
    const r = await (await svc({ lowStockThreshold: 0, primaryChannel: 'n11' })).saveTenantStockPolicy();
    expect(r).toEqual({ primaryChannel: 'n11', lowStockThreshold: 0 });
  });
  it.each([[{ lowStockThreshold: -1 }], [{ lowStockThreshold: 1.5 }], [{ lowStockThreshold: '5' }], [{ lowStockThreshold: 2_000_000 }]])('geçersiz eşik %j => 400', async (req: any) => {
    await expect((await svc(req)).saveTenantStockPolicy()).rejects.toMatchObject({ statusCode: 400 });
    expect(ci.model.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('getStockPolicy eşiği (yoksa null) ve safetyStock varsayılanını döner', async () => {
    const before = await (await svc({})).getStockPolicy();
    expect(before.lowStockThreshold).toBeNull();
    expect(before.defaults.safetyStock).toBe(0);
    await (await svc({ lowStockThreshold: 3 })).saveTenantStockPolicy();
    expect((await (await svc({})).getStockPolicy()).lowStockThreshold).toBe(3);
  });
  it('kanal politikasına safetyStock yazılır (BİRLEŞTİRMELİ)', async () => {
    const r = await (await svc({ integrationCode: 'trendyol', stockPolicy: { safetyStock: 4 } })).saveChannelStockPolicy();
    expect(r.stockPolicy).toMatchObject({ safetyStock: 4, bufferUnits: 2, graceMinutes: 45 });
  });
});

describe('IntegrationService.saveChannelStockPolicy (kanal başına, BİRLEŞTİRMELİ)', () => {
  it('yalnızca gelen alanlar yazılır; mevcut stockPolicy alanları ve settings\'in TÜM diğer alanları (sır dahil) AYNEN kalır', async () => {
    const r = await (await svc({ integrationCode: 'trendyol', stockPolicy: { bufferPercent: 10, autoCancelOversold: false } })).saveChannelStockPolicy();
    expect(r).toEqual({ integrationCode: 'trendyol', stockPolicy: { bufferUnits: 2, bufferPercent: 10, graceMinutes: 45, autoCancelOversold: false } });
    expect(ci.state.doc.marketplace[0].settings).toEqual({
      SELLERID: '123', APIKEY: 'enc:v1:t1:x', taxPercentage: 20,
      stockPolicy: { bufferUnits: 2, graceMinutes: 45, bufferPercent: 10, autoCancelOversold: false },
    });
    // diğer kanallar dokunulmadı
    expect(ci.state.doc.marketplace[1]).toEqual(SEED().marketplace[1]);
    // güncelleme YALNIZCA stockPolicy noktalı yollarını içerir (settings tamamı yazılmaz)
    const [filter, update] = ci.model.findOneAndUpdate.mock.calls[0] as any[];
    expect(filter).toEqual({ 'marketplace.code': 'trendyol' });
    expect(Object.keys(update.$set).every((k) => k.startsWith('marketplace.$.settings.stockPolicy.'))).toBe(true);
    expect(update.$unset).toBeUndefined();
  });

  it('settings.stockPolicy hiç yoksa oluşturur; null alanı varsayılana döndürür ($unset)', async () => {
    let r = await (await svc({ integrationCode: 'n11', stockPolicy: { bufferUnits: 4 } })).saveChannelStockPolicy();
    expect(r.stockPolicy).toEqual({ bufferUnits: 4 });
    expect(ci.state.doc.marketplace[1].settings).toEqual({ APIKEY: '', stockPolicy: { bufferUnits: 4 } });
    r = await (await svc({ integrationCode: 'trendyol', stockPolicy: { graceMinutes: null } })).saveChannelStockPolicy();
    expect(r.stockPolicy).toEqual({ bufferUnits: 2 });
    expect(audit[1].meta).toMatchObject({ integrationCode: 'trendyol', reset: 'graceMinutes' });
  });

  it('bağlı olmayan kanal => 404, DB değişmez', async () => {
    await expect((await svc({ integrationCode: 'amazon', stockPolicy: { bufferUnits: 1 } })).saveChannelStockPolicy()).rejects.toMatchObject({ statusCode: 404 });
    expect(ci.state.doc).toEqual(SEED());
  });

  it.each([
    [{ integrationCode: 'trendyol', stockPolicy: { bufferUnits: -1 } }],
    [{ integrationCode: 'trendyol', stockPolicy: { bufferPercent: 101 } }],
    [{ integrationCode: 'trendyol', stockPolicy: {} }],
    [{ integrationCode: 'trendyol' }],
    [{ integrationCode: 'trendyol', stockPolicy: { 'settings.APIKEY': 'x' } }],
    [{ integrationCode: 'trendyol', stockPolicy: { bufferUnits: 1, APIKEY: 'x' } }],
    [{ integrationCode: { $ne: 'x' }, stockPolicy: { bufferUnits: 1 } }],
    [{ integrationCode: 'trendyol.settings', stockPolicy: { bufferUnits: 1 } }],
    [{ stockPolicy: { bufferUnits: 1 } }],
  ])('geçersiz girdi %j => 400, DB\'ye hiçbir yazma yok', async (req: any) => {
    await expect((await svc(req)).saveChannelStockPolicy()).rejects.toMatchObject({ statusCode: 400 });
    expect(ci.model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(audit).toEqual([]);
  });
});

describe('FE sözleşmesi: AUTO_CANCEL_SUPPORTED_CHANNELS, OversellCompensationJob ile aynı (statik eşitlik)', () => {
  it('iş dosyasındaki CANCEL_SUPPORTED_CHANNELS kümesiyle birebir eşit', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../src/operations/stock/OversellCompensationJob.ts'), 'utf8');
    const m = src.match(/CANCEL_SUPPORTED_CHANNELS\s*=\s*new Set\(\[([^\]]*)\]\)/);
    expect(m).not.toBeNull();
    const fromJob = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect([...AUTO_CANCEL_SUPPORTED_CHANNELS].sort()).toEqual(fromJob);
  });
});

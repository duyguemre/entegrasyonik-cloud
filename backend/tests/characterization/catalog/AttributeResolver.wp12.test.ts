/**
 * WP12 (faz4-int, ADR-0025): export'ta sunucu tarafı özellik çözümleyici + Validator tek-nokta çağrısı.
 * ÖNCE (characterization): sağlayıcısız Validator (eski davranış) `platforms[code].attributes`'a dokunmaz; boş gider.
 * SONRA: dolu -> aynen; boş -> tamamlar; kısmi -> eksikleri tamamlar; eşleme yok + zorunlu -> Trendyol VALIDATION (barkodlu);
 * farklı kategori eşlemesi karışmaz; tenant izolasyonu (her tenant kendi sağlayıcısı). DB/Redis/ağ YOK.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import Validator from '@integration/engine/catalog/export/Validator';
import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { AttributeResolver } from '@integration/catalog/attributeResolver';
import { ProductMapper } from '@integration/modules/marketplace/trendyol/transformers/ProductTransformer';
import { PLATFORM_PROCESS } from '@interfaces/index';
import { makeVariant, staged } from '../../helpers/trendyolProductFixtures';

const anyFn = (): any => jest.fn();

// yerel: choice C-COLOR / C-SIZE; değerler V-BLUE, V-M
const mapRenk = (cat: string, platCat = 'PC1'): any => ({ integrationCode: 'trendyol', localCategoryId: cat, platformCategoryId: platCat, isCategoryMapping: false, platformAttributeId: '47', platformAttributeName: 'Renk', localChoiceId: 'C-COLOR', values: [{ localValueId: 'V-BLUE', platformValueId: '2', platformValueName: 'Mavi' }] });
const mapBeden = (cat: string, platCat = 'PC1'): any => ({ integrationCode: 'trendyol', localCategoryId: cat, platformCategoryId: platCat, isCategoryMapping: false, platformAttributeId: '338', platformAttributeName: 'Beden', localChoiceId: 'C-SIZE', values: [{ localValueId: 'V-M', platformValueId: '7001', platformValueName: 'M' }] });
const CHOICES = [{ choiceId: 'C-COLOR', choiceValueId: 'V-BLUE' }, { choiceId: 'C-SIZE', choiceValueId: 'V-M' }];

/** Gerçek PlatformMappingProvider davranışını (kategori + platform kategorisi süzmesi) taklit eden bellek-içi sağlayıcı. */
function fakeProvider(all: any[], catMap: Record<string, string>) {
  const calls = { all: 0 };
  return {
    calls,
    getPlatformCategoryId: anyFn().mockImplementation(async (c: any) => catMap[String(c)]),
    getAttributeMappingsForCategory: anyFn().mockImplementation(async (c: any, pc: any) => { calls.all++; return all.filter(m => String(m.localCategoryId) === String(c) && (pc === undefined || String(m.platformCategoryId) === String(pc))); }),
  };
}
const mkVariant = (attributes?: any, choices: any[] = CHOICES): any => ({ barcode: 'B1', choices, platforms: { trendyol: attributes === undefined ? {} : { attributes } } });

describe('AttributeResolver', () => {
  it('boş attributes -> yerel seçeneklerden doldurur (kimlik + metin)', async () => {
    const r = new AttributeResolver(fakeProvider([mapRenk('cat1'), mapBeden('cat1')], { cat1: 'PC1' }), 'trendyol');
    const v = mkVariant();
    const res = await r.resolveInto(v, 'cat1');
    expect(res.added.sort()).toEqual(['338', '47']);
    expect(v.platforms.trendyol.attributes['47']).toEqual({ attributeName: 'Renk', attributeValue: 'Mavi', attributeValueId: '2' });
  });

  it('FE doldurmuş -> aynen kalır, üzerine yazılmaz', async () => {
    const r = new AttributeResolver(fakeProvider([mapRenk('cat1')], { cat1: 'PC1' }), 'trendyol');
    const fe = { '47': { attributeName: 'Renk', attributeValue: 'Kırmızı', attributeValueId: '1' } };
    const v = mkVariant(fe);
    const res = await r.resolveInto(v, 'cat1');
    expect(res.added).toEqual([]);
    expect(v.platforms.trendyol.attributes).toEqual(fe);
  });

  it('kısmi -> yalnız eksik olanı tamamlar; ilkel (eski ham) değer de "dolu" sayılır', async () => {
    const r = new AttributeResolver(fakeProvider([mapRenk('cat1'), mapBeden('cat1')], { cat1: 'PC1' }), 'trendyol');
    const v = mkVariant({ '47': '1', '338': 'undefined' });
    await r.resolveInto(v, 'cat1');
    expect(v.platforms.trendyol.attributes['47']).toBe('1');
    expect(v.platforms.trendyol.attributes['338']).toMatchObject({ attributeValueId: '7001' });
  });

  it('allowCustom (platformValueId yok) -> yalnız metin', async () => {
    const m = mapRenk('cat1'); delete m.values[0].platformValueId;
    const r = new AttributeResolver(fakeProvider([m], { cat1: 'PC1' }), 'trendyol');
    const v = mkVariant();
    await r.resolveInto(v, 'cat1');
    expect(v.platforms.trendyol.attributes['47']).toEqual({ attributeName: 'Renk', attributeValue: 'Mavi' });
  });

  it('farklı kategori eşlemesi karışmaz; kategori eşlemesi (platform kategorisi) yoksa hiçbir şey eklenmez', async () => {
    const all = [mapRenk('cat1'), { ...mapRenk('cat2'), values: [{ localValueId: 'V-BLUE', platformValueId: '99', platformValueName: 'Başka' }] }];
    const r = new AttributeResolver(fakeProvider(all, { cat1: 'PC1', cat2: 'PC1' }), 'trendyol');
    const v = mkVariant(); await r.resolveInto(v, 'cat1');
    expect(v.platforms.trendyol.attributes['47'].attributeValueId).toBe('2');
    const v2 = mkVariant(); const res = await new AttributeResolver(fakeProvider(all, {}), 'trendyol').resolveInto(v2, 'cat1');
    expect(res.added).toEqual([]);
    expect(v2.platforms.trendyol.attributes).toBeUndefined();
  });

  it('çoklu değer -> ilk değer + uyarı', async () => {
    const r = new AttributeResolver(fakeProvider([mapRenk('cat1')], { cat1: 'PC1' }), 'trendyol');
    const v = mkVariant(undefined, [{ choiceId: 'C-COLOR', choiceValueId: 'V-BLUE' }, { choiceId: 'C-COLOR', choiceValueId: 'V-X' }]);
    const res = await r.resolveInto(v, 'cat1');
    expect(res.warnings[0]).toMatch(/Renk \(47\)/);
    expect(v.platforms.trendyol.attributes['47'].attributeValueId).toBe('2');
  });

  it('kategori başına eşleme TEK kez alınır (N+1 yok)', async () => {
    const p = fakeProvider([mapRenk('cat1')], { cat1: 'PC1' });
    const r = new AttributeResolver(p, 'trendyol');
    for (let i = 0; i < 5; i++) await r.resolveInto(mkVariant(), 'cat1');
    expect(p.calls.all).toBe(1);
  });

  it('tenant izolasyonu: her sağlayıcı (tenant) yalnız kendi eşlemesini görür', async () => {
    const a = new AttributeResolver(fakeProvider([mapRenk('cat1')], { cat1: 'PC1' }), 'trendyol');
    const b = new AttributeResolver(fakeProvider([], { cat1: 'PC1' }), 'trendyol');
    const va = mkVariant(), vb = mkVariant();
    await a.resolveInto(va, 'cat1'); await b.resolveInto(vb, 'cat1');
    expect(va.platforms.trendyol.attributes['47']).toBeDefined();
    expect(vb.platforms.trendyol.attributes).toBeUndefined();
  });
});

describe('Validator -> çözümleyici (tek nokta) + Trendyol VALIDATION', () => {
  let stagingOps: any[]; let instance: any; let provider: any; let mappingProvider: any;
  const PRODUCT = { _id: 'P1', title: 'U', category: 'cat1', brand: 'b1' };
  const rows = [{ _id: 'e1', barcode: 'B1', mode: 'TRANSFER' }];

  function setup(withResolver: boolean, variant: any) {
    stagingOps = [];
    instance = { getMatchKey: () => 'barcode', validate: anyFn().mockResolvedValue({ result: true, reason: '' }) };
    (IntegrationFactory as any).mockImplementation(() => ({ getInstance: anyFn().mockResolvedValue(instance) }));
    mappingProvider = fakeProvider([mapRenk('cat1'), mapBeden('cat1')], { cat1: 'PC1' });
    provider = {
      getExportStagedProductModel: () => ({ find: () => ({ select: () => ({ lean: async () => rows }), lean: async () => rows }), bulkWrite: anyFn().mockResolvedValue({}) }),
      getVariantModel: () => ({ find: () => ({ lean: async () => [variant] }), bulkWrite: anyFn().mockResolvedValue({}) }),
      getProductModel: () => ({ findById: () => ({ lean: async () => PRODUCT }) }),
      getExportSignalModel: () => ({ updateOne: anyFn().mockResolvedValue({}) }),
      markStatsAsDirty: anyFn().mockResolvedValue(undefined),
      prepareStagingUpdateOp: anyFn().mockImplementation((id: any, w: any, status: any, extra: any) => { const o = { id, status, ...extra }; stagingOps.push(o); return o; }),
      prepareVariantPlatformUpdateOp: anyFn().mockReturnValue({}),
      ...(withResolver ? { getPlatformMappingProvider: anyFn().mockReturnValue(mappingProvider) } : {}),
    };
  }
  const baseVariant = () => ({ _id: 'v1', barcode: 'B1', productId: 'P1', stock: 1, choices: CHOICES, images: [], platforms: { trendyol: {} }, prices: { salePrice: 1 } });

  beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'warn').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('CHARACTERIZATION: sağlayıcı yoksa (eski davranış) payload attributes boş gider', async () => {
    setup(false, baseVariant());
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, 'b');
    expect(stagingOps[0].status).toBe('PENDING');
    expect(stagingOps[0].payload.platforms.trendyol.attributes).toBeUndefined();
  });

  it('boş attributes -> payload çözümleyiciyle dolu (Validator TEK nokta)', async () => {
    setup(true, baseVariant());
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, 'b');
    expect(stagingOps[0].payload.platforms.trendyol.attributes['338']).toMatchObject({ attributeValueId: '7001' });
    expect(provider.getPlatformMappingProvider).toHaveBeenCalledWith('1', 'trendyol');
  });

  it('çözümleyici hatası yayını durdurmaz (eski davranış korunur)', async () => {
    setup(true, baseVariant());
    mappingProvider.getPlatformCategoryId.mockRejectedValue(new Error('db'));
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, 'b');
    expect(stagingOps[0].status).toBe('PENDING');
  });

  describe('Trendyol dönüştürücü (uçtan uca yük)', () => {
    const RENK: any = { _id: '47', title: 'Renk', allowCustom: false, required: true, values: [{ id: '2', title: 'Mavi' }] };
    const BEDEN: any = { _id: '338', title: 'Beden', allowCustom: false, required: true, values: [{ id: '7001', title: 'M' }] };
    const mp = { catId: 411, brandId: 22, settings: {} as any };
    beforeEach(() => { ProductMapper.clock = () => Date.parse('2026-10-01T00:00:00+03:00'); });
    afterEach(() => { ProductMapper.clock = () => Date.now(); });

    it('çözümlenmiş payload -> özellikler pazaryerine gider; eşleme yok + zorunlu -> VALIDATION (barkodlu)', async () => {
      const ok: any = makeVariant(); ok.choices = CHOICES; ok.platforms.trendyol.attributes = undefined;
      await new AttributeResolver(fakeProvider([mapRenk('cat1'), mapBeden('cat1')], { cat1: 'PC1' }), 'trendyol').resolveInto(ok, 'cat1');
      const item: any = new ProductMapper().toPlatformBatch(staged(ok), PLATFORM_PROCESS.TRANSFER, [RENK, BEDEN], [], mp);
      expect(item.attributes).toEqual(expect.arrayContaining([{ attributeId: 47, attributeValueId: 2 }, { attributeId: 338, attributeValueId: 7001 }]));

      const none: any = makeVariant(); none.choices = CHOICES; none.platforms.trendyol.attributes = undefined;
      await new AttributeResolver(fakeProvider([], { cat1: 'PC1' }), 'trendyol').resolveInto(none, 'cat1');
      let err: any; try { new ProductMapper().toPlatformBatch(staged(none), PLATFORM_PROCESS.TRANSFER, [RENK, BEDEN], [], mp); } catch (e) { err = e; }
      expect(err.code).toBe('VALIDATION');
      expect(err.message).toMatch(/zorunlu özellik eksik: Renk \(47\), Beden \(338\)/);
      expect(err.message).toMatch(/BC-001/);
    });
  });
});

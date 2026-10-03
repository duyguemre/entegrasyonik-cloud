/**
 * CHARACTERIZATION: katalog export Validator.runOnce/processValidationBatch
 * Kaynak: backend/src/integration/engine/catalog/export/Validator.ts
 *
 * ÖNCE (bu dosyanın asıl amacı — Protokol 13): mevcut davranış sabitlenir — Validator, VariantModel'den
 * TAZE okuduğu varyantı `payload` olarak (ve `stock: variant.stock` top-level alanını) hiçbir koşulsuz
 * MUTLAK olarak yazar; sistem tetiklemeli stok yayını (`targetPublishQty`) YOKTU.
 *
 * SONRA (ADR-0004 Karar 6, Aşama C — bu görevde eklendi): `entry.mode === 'UPDATE_STOCK'` VE
 * `entry.targetPublishQty` sayısal bir değerse (StockPublishTrigger'ın önceden hesapladığı yayın adedi),
 * Validator mutlak `variant.stock` yerine bu değeri `payload.stock` VE top-level `stock` alanına yazar.
 * `targetPublishQty` YOKSA (kullanıcı tetiklemeli toplu işlem/diğer modlar) davranış BİREBİR ÖNCEKİYLE
 * AYNI kalır — bu dosyanın "ÖNCE" testleri hâlâ (değişiklik SONRASI da) yeşil olmalı.
 *
 * DatabaseManager/IntegrationFactory/IntegrationEngineProvider tamamen mock. DB/Redis/ağ YOK.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@integration/modules/IntegrationFactory', () => ({ __esModule: true, default: jest.fn() }));

import Validator from '@integration/engine/catalog/export/Validator';
import IntegrationFactory from '@integration/modules/IntegrationFactory';

const anyFn = (): any => jest.fn();

let instance: any;
let stagedModel: any;
let variantModel: any;
let productModel: any;
let signalModel: any;
let provider: any;
let stagingUpdateOpCalls: any[];
let variantUpdateOpCalls: any[];

function chain(rows: any) {
  return { select: () => ({ lean: async () => rows }), lean: async () => rows };
}

const BATCH_ID = 'batch-1';
const PRODUCT = { _id: 'P1', title: 'Ürün 1', category: { id: 'c1' }, brand: { id: 'b1' } };

function makeEntry(over: any = {}) {
  return { _id: 'e1', barcode: 'B1', mode: 'UPDATE_STOCK', targetPublishQty: null, ...over };
}

function makeVariant(over: any = {}) {
  return {
    _id: 'v1', barcode: 'B1', stock: 42, stockcode: 'SC1', productId: 'P1',
    platforms: { trendyol: { prices: { salePrice: 10 } } }, prices: { salePrice: 10 }, choices: [], images: ['img1'],
    ...over,
  };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);

  stagingUpdateOpCalls = [];
  variantUpdateOpCalls = [];

  instance = {
    getMatchKey: () => 'barcode',
    validate: anyFn().mockResolvedValue({ result: true, reason: '' }),
  };
  (IntegrationFactory as any).mockImplementation(() => ({ getInstance: anyFn().mockResolvedValue(instance) }));

  productModel = { findById: anyFn().mockReturnValue({ lean: async () => PRODUCT }) };
  signalModel = { updateOne: anyFn().mockResolvedValue({}) };

  provider = {
    getExportStagedProductModel: () => stagedModel,
    getVariantModel: () => variantModel,
    getProductModel: () => productModel,
    getExportSignalModel: () => signalModel,
    markStatsAsDirty: anyFn().mockResolvedValue(undefined),
    prepareStagingUpdateOp: anyFn().mockImplementation((id: any, worker: any, status: any, extra: any) => {
      const op = { id, status, ...extra };
      stagingUpdateOpCalls.push(op);
      return op;
    }),
    prepareVariantPlatformUpdateOp: anyFn().mockImplementation((matchValue: any, mapping: any, integrationCode: any, mode: any, status: any, extra: any) => {
      const op = { matchValue, integrationCode, mode, status, ...extra };
      variantUpdateOpCalls.push(op);
      return op;
    }),
  };
});

function setupModels(entries: any[], variants: any[]) {
  stagedModel = {
    find: anyFn().mockImplementation(() => chain(entries)),
    bulkWrite: anyFn().mockResolvedValue({}),
  };
  variantModel = {
    find: anyFn().mockReturnValue({ lean: async () => variants }),
    bulkWrite: anyFn().mockResolvedValue({}),
  };
  provider.getExportStagedProductModel = () => stagedModel;
  provider.getVariantModel = () => variantModel;
}

describe('Validator.runOnce — ÖNCEKİ davranış (targetPublishQty YOK, mutlak variant.stock yazılır)', () => {
  it('UPDATE_STOCK modunda payload.stock VE top-level stock, VariantModel\'den taze okunan MUTLAK stock değeridir', async () => {
    setupModels([makeEntry({ targetPublishQty: null })], [makeVariant({ stock: 42 })]);
    const validator = new Validator(provider);

    await validator.runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stagingUpdateOpCalls).toHaveLength(1);
    expect(stagingUpdateOpCalls[0].stock).toBe(42);
    expect(stagingUpdateOpCalls[0].payload.stock).toBe(42);
    expect(signalModel.updateOne).toHaveBeenCalledWith({ batchId: BATCH_ID }, expect.objectContaining({ $set: expect.objectContaining({ status: 'PENDING' }) }));
  });

  it('targetPublishQty alanı hiç YOKSA (eski/kullanıcı tetiklemeli kayıt) da davranış AYNI (mutlak stock)', async () => {
    setupModels([{ _id: 'e1', barcode: 'B1', mode: 'UPDATE_STOCK' }], [makeVariant({ stock: 7 })]);
    const validator = new Validator(provider);

    await validator.runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0].stock).toBe(7);
  });

  it('TRANSFER modunda targetPublishQty hiç okunmaz/etkisi olmaz, mutlak variant.stock yazılır', async () => {
    setupModels([makeEntry({ mode: 'TRANSFER', targetPublishQty: 3 })], [makeVariant({ stock: 15 })]);
    const validator = new Validator(provider);

    await validator.runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0].stock).toBe(15);
  });
});

describe('Validator.runOnce — YENİ davranış (ADR-0004 Karar 6, Aşama C): sistem tetiklemeli UPDATE_STOCK publish override', () => {
  it('targetPublishQty sayısalsa (0 dahil), mutlak variant.stock YERİNE bu değer payload.stock VE top-level stock olarak yazılır', async () => {
    setupModels([makeEntry({ targetPublishQty: 5 })], [makeVariant({ stock: 42 })]);
    const validator = new Validator(provider);

    await validator.runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0].stock).toBe(5);
    expect(stagingUpdateOpCalls[0].payload.stock).toBe(5);
  });

  it('targetPublishQty=0 (stoğu tükenen SKU) MUTLAKA 0 olarak yazılır (falsy ama geçerli değer)', async () => {
    setupModels([makeEntry({ targetPublishQty: 0 })], [makeVariant({ stock: 42 })]);
    const validator = new Validator(provider);

    await validator.runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0].stock).toBe(0);
    expect(stagingUpdateOpCalls[0].payload.stock).toBe(0);
  });

  it('targetPublishQty=null ise override UYGULANMAZ (yukarıdaki "ÖNCEKİ davranış" ile tutarlı)', async () => {
    setupModels([makeEntry({ targetPublishQty: null })], [makeVariant({ stock: 42 })]);
    const validator = new Validator(provider);

    await validator.runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0].stock).toBe(42);
  });
});

describe('Validator.runOnce — hata yolu (eslesme-fiyat WP1 öncesi sabitlendi): errorMessage/errorType/messages metinleri', () => {
  it('ürünün kategorisi yoksa FAILED + "Ürünün kategorisi bulunamadı." + VALIDATION_ERROR; varyant mesajı aynı metin', async () => {
    productModel.findById = anyFn().mockReturnValue({ lean: async () => ({ ...PRODUCT, _id: 'P2', category: null }) });
    setupModels([makeEntry({ mode: 'TRANSFER' })], [makeVariant({ productId: 'P2' })]);
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0]).toMatchObject({ status: 'FAILED', errorMessage: 'Ürünün kategorisi bulunamadı.', errorType: 'VALIDATION_ERROR', priorityScore: 0 });
    expect(variantUpdateOpCalls[0]).toMatchObject({ status: 'FAILED', messages: ['Ürünün kategorisi bulunamadı.'] });
  });

  it('ürünün markası yoksa "Ürünün markası bulunamadı."', async () => {
    productModel.findById = anyFn().mockReturnValue({ lean: async () => ({ ...PRODUCT, _id: 'P3', brand: null }) });
    setupModels([makeEntry({ mode: 'TRANSFER' })], [makeVariant({ productId: 'P3' })]);
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0]).toMatchObject({ status: 'FAILED', errorMessage: 'Ürünün markası bulunamadı.' });
  });

  it('varyant ana tabloda yoksa "<barkod> değerine sahip varyant ana tabloda bulunamadı."', async () => {
    setupModels([makeEntry({ mode: 'TRANSFER' })], []);
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0]).toMatchObject({ status: 'FAILED', errorMessage: 'B1 değerine sahip varyant ana tabloda bulunamadı.' });
  });

  it('adaptör validate {result:false, reason} → reason düz metin; "[..]" önekleri atılır', async () => {
    instance.validate = anyFn().mockResolvedValue({ result: false, reason: '[VALIDATION] Barkod eksik.' });
    setupModels([makeEntry({ mode: 'TRANSFER' })], [makeVariant()]);
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0]).toMatchObject({ status: 'FAILED', errorMessage: 'Barkod eksik.', errorType: 'VALIDATION_ERROR' });
    expect(variantUpdateOpCalls[0].messages).toEqual(['Barkod eksik.']);
  });
});

describe('Validator.runOnce — YENİ (eslesme-fiyat WP1): issues[] taşınır, errorMessage geriye uyumlu', () => {
  it('kategori yoksa issues[0] PRODUCT_CATEGORY_MISSING + ekran bağlantısı; staging ve varyant op\'una aynı liste', async () => {
    productModel.findById = anyFn().mockReturnValue({ lean: async () => ({ ...PRODUCT, _id: 'P2', category: null }) });
    setupModels([makeEntry({ mode: 'TRANSFER' })], [makeVariant({ productId: 'P2' })]);
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);

    const issues = stagingUpdateOpCalls[0].issues;
    expect(issues[0]).toMatchObject({ code: 'PRODUCT_CATEGORY_MISSING', severity: 'error', integrationCode: 'trendyol', barcode: 'B1', variantId: 'v1', productId: 'P2', link: { screen: 'productDefinitions/ProductListView' } });
    expect(variantUpdateOpCalls[0].issues).toBe(issues);
  });

  it('adaptör gerekçesi errorMap ile koda çevrilir (Barkod eksik → BARCODE_MISSING)', async () => {
    instance.validate = anyFn().mockResolvedValue({ result: false, reason: 'Barkod eksik.' });
    setupModels([makeEntry({ mode: 'UPDATE_STOCK' })], [makeVariant()]);
    await new Validator(provider).runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);

    expect(stagingUpdateOpCalls[0].issues.map((i: any) => i.code)).toEqual(['BARCODE_MISSING']);
  });

  it('D-VAL-1: TY barkod >40 karakter TRANSFER\'de gönderilmez (BARCODE_INVALID); UPDATE_STOCK\'ta denetlenmez', async () => {
    const long = 'B'.repeat(41);
    setupModels([makeEntry({ mode: 'TRANSFER', barcode: long })], [makeVariant({ barcode: long })]);
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);
    expect(stagingUpdateOpCalls[0]).toMatchObject({ status: 'FAILED', errorType: 'VALIDATION_ERROR' });
    expect(stagingUpdateOpCalls[0].issues.map((i: any) => i.code)).toEqual(['BARCODE_INVALID']);
    expect(instance.validate).not.toHaveBeenCalled();

    stagingUpdateOpCalls.length = 0;
    setupModels([makeEntry({ mode: 'UPDATE_STOCK', barcode: long })], [makeVariant({ barcode: long })]);
    await new Validator(provider).runOnce('1', 'trendyol', 'UPDATE_STOCK' as any, BATCH_ID);
    expect(stagingUpdateOpCalls[0]).toMatchObject({ status: 'PENDING', issues: [] });
  });

  it('başarıda uyarılar (ör. görsel > 8) issues olarak taşınır, gönderim durmaz', async () => {
    setupModels([makeEntry({ mode: 'TRANSFER' })], [makeVariant({ images: Array(9).fill('https://cdn/x.jpg') })]);
    await new Validator(provider).runOnce('1', 'trendyol', 'TRANSFER' as any, BATCH_ID);
    expect(stagingUpdateOpCalls[0].status).toBe('PENDING');
    expect(stagingUpdateOpCalls[0].issues.map((i: any) => i.code)).toEqual(['IMAGE_TOO_MANY']);
    expect(variantUpdateOpCalls[0].issues).toEqual(stagingUpdateOpCalls[0].issues);
  });
});

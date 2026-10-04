// [eslesme-fiyat WP1] IntegrationIssue kataloğu + errorMap + hazırlık denetimi (saf; DB/ağ yok).
import { describe, it, expect } from '@jest/globals';
import { INTEGRATION_ISSUES, IssueError, issuesToMessage, makeIssue, maskPlatformMessage } from '@platform/core/errors/integrationIssues';
import { issuesFromError, mapPlatformMessage } from '@integration/modules/common/errors/errorMap';
import { errorRulesFor } from '@integration/modules/common/errors/registry';
import { IntegrationError } from '@integration/modules/common/IntegrationError';
import { checkChannelReadiness } from '@integration/catalog/preflight/readiness';

describe('INTEGRATION_ISSUES kataloğu', () => {
  it.each(Object.entries(INTEGRATION_ISSUES))('%s: severity/module/reason/solution dolu; kod BÜYÜK_HARF', (code: string, def: any) => {
    expect(code).toMatch(/^[A-Z0-9_]+$/);
    expect(['error', 'warning', 'info']).toContain(def.severity);
    expect(def.module).toBeTruthy();
    expect(def.reason.length).toBeGreaterThan(5);
    expect(def.solution.length).toBeGreaterThan(3);
  });

  it('error düzeyindeki eşleme/ürün kodlarının ekran bağlantısı var', () => {
    for (const [code, def] of Object.entries(INTEGRATION_ISSUES) as any) {
      if (def.severity === 'error' && ['mapping', 'product', 'price', 'stock', 'auth'].includes(def.module) && code !== 'SYSTEM_ERROR') expect([code, !!def.screen]).toEqual([code, true]);
    }
  });
});

describe('makeIssue', () => {
  it('yer tutucuları doldurur, bağlantıya integrationCode ekler, kimlikleri dizeye çevirir', () => {
    const i = makeIssue('MAP_ATTR_MISSING', { integrationCode: 'trendyol', productId: 5, params: { attribute: 'Renk' } });
    expect(i).toMatchObject({ code: 'MAP_ATTR_MISSING', severity: 'error', module: 'mapping', productId: '5', integrationCode: 'trendyol' });
    expect(i.reason).toContain('"Renk"');
    expect(i.link).toEqual({ screen: 'productDefinitions/CategoryListView', params: { integrationCode: 'trendyol' } });
  });

  it('bilinmeyen kod → PLATFORM_REJECTED; kanal metni maskelenir', () => {
    const i = makeIssue('NOPE', { platformMessage: 'hata token=abc123 a@b.com' });
    expect(i.code).toBe('PLATFORM_REJECTED');
    expect(i.platformMessage).not.toContain('abc123');
    expect(i.platformMessage).not.toContain('a@b.com');
  });

  it('maskPlatformMessage 500 karakterde keser', () => {
    expect(maskPlatformMessage('x'.repeat(900)).length).toBeLessThanOrEqual(501);
  });

  it('issuesToMessage: önce hatalar; kanal metni varsa o', () => {
    const msg = issuesToMessage([makeIssue('IMAGE_TOO_MANY', { params: { max: 8, count: 9 } }), makeIssue('PLATFORM_REJECTED', { platformMessage: 'Kanal: hatalı' })]);
    expect(msg.startsWith('Kanal: hatalı')).toBe(true);
  });
});

describe('errorMap', () => {
  it('ortak kurallar dönüştürücü gerekçelerini tanır', () => {
    expect(mapPlatformMessage('[VALIDATION] Fiyat geçersiz.', {}).code).toBe('PRICE_INVALID');
    expect(mapPlatformMessage('Satış > Liste fiyatı hatası.', {}).code).toBe('PRICE_ABOVE_LIST');
    expect(mapPlatformMessage('Ürün zaten gönderilmiş.', {}).code).toBe('ALREADY_SENT');
  });

  it('ortak kesin kurallar önce (TY "barkod" deseni "Barkod eksik"i yutmaz), sonra kanal kuralı; eşleşmeyen → PLATFORM_REJECTED + ham metin', () => {
    expect(mapPlatformMessage('Marka bulunamadı: XYZ', { integrationCode: 'hepsiburada' }, errorRulesFor('hepsiburada')).code).toBe('HB_BRAND_UNMATCHED');
    expect(mapPlatformMessage('origin alanı zorunludur', {}, errorRulesFor('trendyol')).code).toBe('TY_ORIGIN_REQUIRED');
    expect(mapPlatformMessage('Barkod eksik.', {}, errorRulesFor('trendyol')).code).toBe('BARCODE_MISSING');
    const u = mapPlatformMessage('beklenmeyen', {}, errorRulesFor('trendyol'));
    expect(u).toMatchObject({ code: 'PLATFORM_REJECTED', platformMessage: 'beklenmeyen' });
  });

  it('issuesFromError: IntegrationError kodu, IssueError issue\'ları korunur', () => {
    const e = new IntegrationError('AUTH', '401', { integrationCode: 'n11', operation: 'x', clientId: 1 });
    expect(issuesFromError(e, { integrationCode: 'n11' })[0].code).toBe('AUTH_FAILED');
    const own = [makeIssue('IMAGE_MISSING')];
    expect(issuesFromError(new IssueError('m', own), {})).toBe(own);
    expect(errorRulesFor('bilinmeyen')).toEqual([]);
  });
});

describe('checkChannelReadiness (D-VAL-1/2)', () => {
  const product = { _id: 'P1', title: 'Ürün', category: { id: 1 }, brand: { id: 2 }, taxPercentage: 20 }; // [WP5] KDV ayarlı
  const variant = (over: any = {}) => ({ _id: 'V1', barcode: 'B-1', stockcode: 'S1', images: ['https://x/1.jpg'], prices: { salePrice: 10, marketPrice: 12 }, platforms: {}, ...over });
  const codes = (v: any, mode = 'TRANSFER', code = 'trendyol', p: any = product) => checkChannelReadiness({ variant: v, product: p, integrationCode: code, mode }).map((i) => i.code);

  it('geçerli varyant → sorun yok', () => expect(codes(variant())).toEqual([]));
  it('kategori/marka eksik sırası korunur', () => expect(codes(variant(), 'TRANSFER', 'trendyol', { _id: 'P1' })).toEqual(['PRODUCT_CATEGORY_MISSING', 'PRODUCT_BRAND_MISSING', 'VAT_MISSING']));
  it('TY barkod >40 ve geçersiz karakter', () => {
    expect(codes(variant({ barcode: 'A'.repeat(41) }))).toEqual(['BARCODE_INVALID']);
    expect(codes(variant({ barcode: 'A/B' }))).toEqual(['BARCODE_INVALID']);
    expect(codes(variant({ barcode: 'A B' }))).toEqual([]); // boşluk kanalca silinir
  });
  it('TY başlık >100, görsel >8 (uyarı), http görsel, KDV 18', () => {
    expect(codes(variant(), 'TRANSFER', 'trendyol', { ...product, title: 'x'.repeat(101) })).toEqual(['TITLE_TOO_LONG']);
    expect(codes(variant({ images: Array(9).fill('https://x/a.jpg') }))).toEqual(['IMAGE_TOO_MANY']);
    expect(codes(variant({ images: [{ url: 'http://x/a.jpg' }] }))).toEqual(['IMAGE_NOT_HTTPS']);
    expect(codes(variant(), 'TRANSFER', 'trendyol', { ...product, taxPercentage: 18 })).toEqual(['VAT_INVALID']);
    // [eslesme-fiyat WP5, D-PRICE-2] 0 geçerli oran ama üründe 0 → doğrulama uyarısı; ayarsız → VAT_MISSING (uyarı; adaptör ayarı da yoksa durdurur)
    expect(codes(variant(), 'TRANSFER', 'trendyol', { ...product, taxPercentage: 0 })).toEqual(['VAT_ZERO_CHECK']);
    expect(codes(variant({ platforms: { trendyol: { mapping: { taxPercentage: 0 } } } }), 'TRANSFER', 'trendyol', { ...product, taxPercentage: null })).toEqual([]);
    expect(codes(variant(), 'TRANSFER', 'hepsiburada', { ...product, taxPercentage: null })).toEqual(['VAT_MISSING']);
    expect(codes(variant(), 'UPDATE_PRICE', 'hepsiburada', { ...product, taxPercentage: null })).toEqual([]);
  });
  it('fiyat: TY/HB/PZ\'de denetlenir, UPDATE_STOCK\'ta denetlenmez; N11/Ideasoft\'ta denetlenmez', () => {
    expect(codes(variant({ prices: { salePrice: 0 } }))).toEqual(['PRICE_INVALID']);
    expect(codes(variant({ prices: { salePrice: 15, marketPrice: 12 } }), 'UPDATE_PRICE', 'hepsiburada')).toEqual(['PRICE_ABOVE_LIST']);
    expect(codes(variant({ prices: { salePrice: 0 } }), 'UPDATE_STOCK')).toEqual([]);
    expect(codes(variant({ prices: { salePrice: 0 } }), 'TRANSFER', 'n11')).toEqual([]);
  });
  it('içerik denetimleri yalnız içerik modlarında; TRANSFER\'da görsel zorunlu', () => {
    expect(codes(variant({ images: [], barcode: 'A'.repeat(50) }), 'UPDATE_PRICE')).toEqual([]);
    expect(codes(variant({ images: [] }))).toEqual(['IMAGE_MISSING']);
    expect(codes(variant({ images: [] }), 'UPDATE')).toEqual([]);
    expect(codes(variant({ images: [] }), 'TRANSFER', 'n11')).toEqual([]); // görsel kuralı tanımsız kanal
    expect(codes(variant({ stockcode: 'x'.repeat(256) }), 'UPDATE', 'n11')).toEqual(['STOCKCODE_INVALID']);
  });
});

/**
 * [DÜZELTME 2026-09-28] IntegrationFactory.getInstance() ÇIKTISINDA `getMatchKey()` artık SENKRON string döner.
 * Kaynak: backend/src/integration/modules/IntegrationFactory.ts -> wrapWithTimeout (Proxy) + SYNC_PLATFORM_METHODS
 *
 * Geçmiş bulgu (2026-09-28): `wrapWithTimeout` hedefin TÜM fonksiyon özelliklerini `async` sarıyordu; `getMatchKey()` SENKRON
 * tasarlanmış olduğundan, kod tabanındaki 13 çağıranda (Dispatcher:91, Publisher:45/138/272, Validator:39/93, Sentinel:41/84,
 * Sync:77/130/223, integration-service:1021, ExternalReconciliationJob:67, StockPublishTrigger:134; Stager:31 Promise'i matchKey
 * sayıyordu) `(instance.getMatchKey() || 'barcode').toLowerCase()` TypeError veriyordu. Yalnızca testlerde IntegrationFactory
 * mock'lu olduğu için görünmemişti.
 *
 * Düzeltme (seçenek a): IPlatform'da SENKRON tanımlı metotlar (`SYNC_PLATFORM_METHODS`, tek sabit liste; `keyof IPlatform`
 * ile tip-doğrulamalı) Proxy'de sarılmaz; async (ağ/IO) metotlar AYNEN timeout ile sarılı kalır. Bu dosya: 6 GERÇEK adaptörle
 * (constructor'lar ağ isteği yapmaz; yalnızca getMatchKey() çağrılır) senkron dönüşü, async metotların sarılı kalışını ve
 * adaptör prototip taraması ile "yeni senkron metot listeye eklenmeden sızmaz" korumasını sabitler. DB/Redis/ağ YOK:
 * yalnızca DatabaseManager sahte.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const lean = (v: any) => ({ lean: async () => v });
// Tüm entegrasyonların requiredSettings anahtarlarının birleşimi (validateSettings geçsin diye)
const SETTINGS = { SELLERID: '1', APIKEY: 'a', APISECRET: 'b', storeName: 's', key: 'k', secret: 'c' };
const CATALOG = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'];

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: {
    getClientDB: async () => ({
      getClientIntegrationModel: () => ({
        findOne: () => lean({
          marketplace: ['trendyol', 'hepsiburada', 'n11', 'pazarama'].map((code) => ({ code, settings: SETTINGS })),
          ecommerce: [{ code: 'ideasoft', settings: SETTINGS }],
          erp: [{ code: 'bizimhesap', settings: SETTINGS }],
        }),
      }),
      getSettingModel: () => ({ findOne: () => lean({}) }),
    }),
    getApplicationDB: async () => ({
      getIntegrationModel: () => ({ find: () => lean(['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'].map((code) => ({ code }))) }),
    }),
  },
}));

import IntegrationFactory, { SYNC_PLATFORM_METHODS } from '@integration/modules/IntegrationFactory';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  IntegrationFactory.clearCache();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('IntegrationFactory.getInstance -> Proxy sarmalayıcı: getMatchKey() SENKRON string döner (DÜZELTİLDİ)', () => {
  for (const code of CATALOG) {
    it(`[DÜZELTME 2026-09-28] ${code}: GERÇEK fabrika + GERÇEK adaptörle getMatchKey() Promise DEĞİL, doğrudan 'barcode'|'stockcode' string döndürür`, async () => {
      const instance: any = await new IntegrationFactory(5).getInstance(code);
      const r = instance.getMatchKey();
      expect(r).not.toBeInstanceOf(Promise);
      expect(typeof r).toBe('string');
      expect(['barcode', 'stockcode']).toContain(r.toLowerCase());
    });
  }

  it('[DÜZELTME 2026-09-28] kod tabanındaki kalıp `(instance.getMatchKey() || \'barcode\').toLowerCase()` sarılmış örnekte artık ÇALIŞIR (Dispatcher/Publisher/Validator/Sentinel/Sync ortak satırı) — 6 adaptörün hepsi için', async () => {
    for (const code of CATALOG) {
      const instance: any = await new IntegrationFactory(5).getInstance(code);
      const key = (instance.getMatchKey() || 'barcode').toLowerCase();
      expect(['barcode', 'stockcode']).toContain(key);
    }
  });

  it('[DÜZELTME 2026-09-28] adaptör kuralı yansır: n11 sabit stockcode; MATCHKEY ayarı olmayan hepsiburada varsayılan barcode', async () => {
    const hb: any = await new IntegrationFactory(5).getInstance('hepsiburada');
    expect(hb.getMatchKey()).toBe('barcode');
    const n11: any = await new IntegrationFactory(5).getInstance('n11');
    expect(n11.getMatchKey()).toBe('stockcode');
  });

  it('[DÜZELTME 2026-09-28] senkron metot hedefe bağlı çağrılır (this = adaptör): ayrık referans bile adaptör içi state (params) okuyabilir', async () => {
    const instance: any = await new IntegrationFactory(5).getInstance('ideasoft');
    const unbound = instance.getMatchKey;
    expect(unbound()).toBe('barcode');
  });

  it('[MEVCUT DAVRANIŞ] async (ağ/IO) metotlar AYNEN timeout sarmalayıcısında kalır: çağrı Promise döner ve senkron fırlatma reddedilmiş Promise\'a çevrilir (sarmalayıcı `async`)', async () => {
    const instance: any = await new IntegrationFactory(5).getInstance('trendyol');
    const r = instance.getSummaryFromRaw(undefined); // trendyol'da non-async imza: sarılmamış olsaydı senkron fırlatabilirdi
    expect(r).toBeInstanceOf(Promise);
    await r.catch(() => undefined);
  });

  it('[MEVCUT DAVRANIŞ] timeout mantığı async metotlarda AYNEN çalışır: asılı kalan bir metot 120 sn sonra "[Platform Timeout]" ile reddedilir; senkron getMatchKey bundan etkilenmez', async () => {
    jest.useFakeTimers();
    try {
      const instance: any = await new IntegrationFactory(5).getInstance('trendyol');
      const proto = Object.getPrototypeOf((instance as any)); // Proxy -> hedefin prototipi
      jest.spyOn(proto, 'updateProductStock').mockImplementation(() => new Promise(() => undefined)); // asla çözülmez
      const pending = instance.updateProductStock([]);
      const assertion = expect(pending).rejects.toThrow(/\[Platform Timeout\] updateProductStock call exceeded 120s/);
      await jest.advanceTimersByTimeAsync(120000);
      await assertion;
      expect(instance.getMatchKey()).toBe('barcode');
    } finally {
      jest.useRealTimers();
    }
  });

  it('[MEVCUT DAVRANIŞ] fonksiyon OLMAYAN özellikler (ör. requiredSettings dizisi) sarmalanmadan aynen döner', async () => {
    const instance: any = await new IntegrationFactory(5).getInstance('trendyol');
    expect(Array.isArray(instance.requiredSettings)).toBe(true);
  });
});

describe('Koruma: SYNC_PLATFORM_METHODS ile adaptör prototipleri tutarlı (yeni senkron metot sessizce Promise\'e dönüşemez)', () => {
  const ADAPTERS: Array<[string, string]> = [
    ['trendyol', '../../../src/integration/modules/marketplace/trendyol'],
    ['pazarama', '../../../src/integration/modules/marketplace/pazarama'],
    ['n11', '../../../src/integration/modules/marketplace/n11'],
    ['hepsiburada', '../../../src/integration/modules/marketplace/hepsiburada'],
    ['ideasoft', '../../../src/integration/modules/ecommerce/ideasoft'],
    ['bizimhesap', '../../../src/integration/modules/erp/bizimhesap'],
  ];
  // Bilinçli olarak `async` OLMAYAN ama Promise DÖNDÜREN (dolayısıyla sarılması doğru) genel metotlar:
  const NON_ASYNC_PROMISE_RETURNERS = ['retrieveCategoryAttributeValues', 'getSummaryFromRaw'];

  it('SYNC_PLATFORM_METHODS yalnızca getMatchKey içerir (IPlatform\'daki tek senkron metot)', () => {
    expect([...SYNC_PLATFORM_METHODS]).toEqual(['getMatchKey']);
  });

  for (const [code, path] of ADAPTERS) {
    it(`${code}: prototipteki async olmayan genel metotlar = SYNC_PLATFORM_METHODS + bilinen Promise-döndürenler (aksi halde: listeye ekle ya da async yap)`, () => {
      const Cls = require(path).default;
      const names = Object.getOwnPropertyNames(Cls.prototype).filter((n) => {
        if (n === 'constructor') return false;
        const d = Object.getOwnPropertyDescriptor(Cls.prototype, n)!;
        if (typeof d.value !== 'function') return false;
        // ts-jest hedefe göre `async`'i __awaiter/__generator'a indirger: AsyncFunction adına güvenilemez -> kaynak metinle tespit
        const src = Function.prototype.toString.call(d.value);
        return !(d.value.constructor.name === 'AsyncFunction' || /^async\b/.test(src) || src.includes('__awaiter'));
      });
      const publicNonAsync = names.filter((n) => !n.startsWith('_') && n !== 'initializeModules');
      const allowed = new Set<string>([...SYNC_PLATFORM_METHODS, ...NON_ASYNC_PROMISE_RETURNERS]);
      expect(publicNonAsync.filter((n) => !allowed.has(n))).toEqual([]);
      expect(publicNonAsync).toContain('getMatchKey'); // her adaptör senkron getMatchKey'i tanımlar
    });
  }
});

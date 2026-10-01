/**
 * ADR-0020 Karar 3.6 (Aşama B) — "IntegrationFactory önbellek anahtarına yapılandırma sürümü eklenir
 * (`${clientId}_${code}_v${version}`), böylece eski örnek doğal olarak düşer."
 *
 * Protokol 13 notu: bu davranış (sürüm-farkında önbellek anahtarı) ÖNCESİNDE hiçbir test tarafından
 * karakterize edilmemişti (grep: `IntegrationFactory` geçen ~30 test dosyasının hiçbiri önbellek ANAHTAR
 * BİÇİMİNİ doğrulamıyordu — yalnız üretilen örneğin/ayarların doğruluğunu test ediyorlardı). Bu dosya hem
 * ESKİ davranışı (sürümden bağımsız, yalnız `${clientId}_${code}`) hem YENİ davranışı (sürüm değişince
 * önbellek DOĞAL OLARAK düşer) TEK yerde belgeler; `platformOverrideStore` boşken (sürüm=0, bugünkü durum)
 * üretilen anahtar eskisiyle BİREBİR AYNIDIR (yalnız `_v0` son eki eklenir — davranış gözlemlenebilir açıdan
 * DEĞİŞMEDİ, çünkü sürüm hiç değişmediği sürece önbellek isabet eder).
 *
 * Gerçek ağ/DB YOK: `DatabaseManagerInstance` ve `Trendyol` adaptör kurulumu sahte/minimal nesnelerle yapılır.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { setTargetOverride, resetPlatformOverrideStoreForTests } from '@integration/config/platformOverrideStore';

jest.mock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() } }));

import IntegrationFactory from '@integration/modules/IntegrationFactory';
import { DatabaseManagerInstance } from '@database/DatabaseManager';

const lean = (v: any) => ({ lean: async () => v });

function fakeApplicationDB() {
    return {
        getIntegrationModel: () => ({ find: () => lean([{ code: 'trendyol', urls: {}, settings: {}, title: 'Trendyol', color: '#fff', logo: 'x.png' }]) }),
    };
}
function fakeClientDB() {
    return {
        getClientIntegrationModel: () => ({ findOne: () => lean({ marketplace: [{ code: 'trendyol', settings: { SELLERID: '1', APIKEY: 'k', APISECRET: 's' } }] }) }),
        getSettingModel: () => ({ findOne: () => lean({}) }),
    };
}

describe('ADR-0020 Karar 3.6 — IntegrationFactory önbellek anahtarı sürüm farkındadır', () => {
    beforeEach(() => {
        resetPlatformOverrideStoreForTests();
        (IntegrationFactory as any).instanceCache.clear();
        (IntegrationFactory as any).configCache.clear();
        (DatabaseManagerInstance.getApplicationDB as any).mockResolvedValue(fakeApplicationDB());
        (DatabaseManagerInstance.getClientDB as any).mockResolvedValue(fakeClientDB());
    });
    afterEach(() => resetPlatformOverrideStoreForTests());

    it('sürüm 0 iken (yayın yok, bugünkü durum) anahtar `${clientId}_${code}_v0`dır ve tekrar çağrı AYNI örneği döner', async () => {
        const factory = new IntegrationFactory(42);
        const first = await factory.getInstance('trendyol');
        const keys = [...(IntegrationFactory as any).instanceCache.keys()];
        expect(keys).toEqual(['42_trendyol_v0']);

        const second = await factory.getInstance('trendyol');
        expect(second).toBe(first); // önbellek isabet
    });

    it('yayın sürümü değişirse (platformOverrideStore güncellenir) önbellek anahtarı değişir ve YENİ örnek üretilir', async () => {
        const factory = new IntegrationFactory(42);
        const before = await factory.getInstance('trendyol');

        setTargetOverride('trendyol', 7, {}); // bir yayın oldu: bilinen sürüm artık 7
        const after = await factory.getInstance('trendyol');

        const keys = [...(IntegrationFactory as any).instanceCache.keys()].sort();
        expect(keys).toEqual(['42_trendyol_v0', '42_trendyol_v7']);
        expect(after).not.toBe(before); // eski örnek DOĞAL OLARAK düştü (elle clearCache() gerekmedi)
    });
});

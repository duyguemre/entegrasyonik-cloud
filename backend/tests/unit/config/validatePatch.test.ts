// ADR-0020 Karar 2.2 (Aşama B) — yazma anı doğrulaması. Synthetic `SettingDef` ile test edilir (gerçek katalogda
// bugün `type:'host'` yok, bkz. urlGuard.ts dosya başı notu); gerçek 2 anahtarla (overridable:true/envLock) da kanıtlanır.
import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { validatePatch, assertValidPatch } from '@integration/config/validatePatch';
import type { SettingDef } from '@integration/config/types';
import { getSettingDef } from '@integration/config/catalog';

function def(over: Partial<SettingDef<any>> = {}): SettingDef<any> {
    return {
        key: 'test.count', group: 'export.product', scope: 'engine+integration', type: 'int',
        schema: z.number().int().min(0).max(100), default: 10, danger: 'caution', applies: 'immediate',
        consumers: [], label: { tr: 't', en: 't' }, help: { tr: 'h', en: 'h' }, overridable: true, since: '2026-09-29',
        ...over,
    };
}

describe('ADR-0020 Karar 2.2 — validatePatch', () => {
    it('bilinmeyen anahtar reddedilir', () => {
        const errors = validatePatch({ 'unknown.setting': 1 }, { target: '_engine', getSettingDef: () => undefined });
        expect(errors).toEqual([{ key: 'unknown.setting', message: expect.stringContaining('Bilinmeyen ayar anahtarı') }]);
    });

    it('sır adı deseni (password/secret/token/key TEK BAŞINA segment) katalogdan bağımsız reddedilir; "apiSecret" gibi bileşik ad segmenti YASAK DEĞİL', () => {
        const errors = validatePatch({ 'trendyol.secret': 'x' }, { target: 'trendyol', getSettingDef: () => def() });
        expect(errors[0].message).toContain('sır deseni');
        // "apiSecret" TEK BAŞINA "secret" segmenti değildir (ADR §2.2 tanımı) -- yasaklı DEĞİL, yalnız şema tipiyle reddedilebilir.
        expect(validatePatch({ 'trendyol.apiSecret': 5 }, { target: 'trendyol', getSettingDef: () => def() })).toEqual([]);
    });

    it('overridable:false anahtara yazma reddedilir', () => {
        const errors = validatePatch({ 'test.count': 5 }, { target: '_engine', getSettingDef: () => def({ overridable: false }) });
        expect(errors[0].message).toContain('salt-okunurdur');
    });

    it('envLock tanımlı VE env değişkeni SET iken yazma reddedilir', () => {
        process.env.ZOT_TEST_ENVLOCK = '1';
        try {
            const errors = validatePatch({ 'test.count': 5 }, { target: '_engine', getSettingDef: () => def({ envLock: 'ZOT_TEST_ENVLOCK' }) });
            expect(errors[0].message).toContain('ortam değişkeniyle kilitli');
        } finally { delete process.env.ZOT_TEST_ENVLOCK; }
    });

    it('envLock tanımlı ama env değişkeni SET DEĞİLSE yazma kabul edilir', () => {
        delete process.env.ZOT_TEST_ENVLOCK;
        const errors = validatePatch({ 'test.count': 5 }, { target: '_engine', getSettingDef: () => def({ envLock: 'ZOT_TEST_ENVLOCK' }) });
        expect(errors).toEqual([]);
    });

    it('scope=engine anahtar tenant/entegrasyon hedefinde reddedilir; scope=integration anahtar _engine hedefinde reddedilir', () => {
        expect(validatePatch({ 'test.count': 5 }, { target: 'trendyol', getSettingDef: () => def({ scope: 'engine' }) })[0].message).toContain('geçerli değil');
        expect(validatePatch({ 'test.count': 5 }, { target: '_engine', getSettingDef: () => def({ scope: 'integration' }) })[0].message).toContain('geçerli değil');
        expect(validatePatch({ 'test.count': 5 }, { target: 'trendyol', getSettingDef: () => def({ scope: 'engine+integration' }) })).toEqual([]);
    });

    it('zod şeması dışında (aralık dışı) değer reddedilir', () => {
        const errors = validatePatch({ 'test.count': 9999 }, { target: '_engine', getSettingDef: () => def() });
        expect(errors[0].message).toContain('Geçersiz değer');
    });

    it('geçerli yama boş hata listesi döner; assertValidPatch fırlatmaz', () => {
        expect(validatePatch({ 'test.count': 42 }, { target: '_engine', getSettingDef: () => def() })).toEqual([]);
        expect(() => assertValidPatch({ 'test.count': 42 }, { target: '_engine', getSettingDef: () => def() })).not.toThrow();
    });

    it('assertValidPatch geçersiz yamada fırlatır', () => {
        expect(() => assertValidPatch({ 'test.count': -1 }, { target: '_engine', getSettingDef: () => def() })).toThrow();
    });

    it('type:host anahtar izinli host listesi dışındaysa reddedilir, içindeyse kabul edilir', () => {
        const hostDef = def({ type: 'host', schema: z.string() });
        const bad = validatePatch({ 'test.count': 'evil.example.com' }, { target: 'trendyol', getSettingDef: () => hostDef, descriptor: { allowedHosts: ['apigw.trendyol.com'] } });
        expect(bad[0].message).toBeDefined();
        const good = validatePatch({ 'test.count': 'apigw.trendyol.com' }, { target: 'trendyol', getSettingDef: () => hostDef, descriptor: { allowedHosts: ['apigw.trendyol.com'] } });
        expect(good).toEqual([]);
    });

    it('emekli desene uyan bir DEĞER (host tipi olmasa bile, ör. pathTemplate) reddedilir', () => {
        const pathDef = def({ type: 'pathTemplate', schema: z.string() });
        const errors = validatePatch(
            { 'test.count': 'order/sellers/123/orders' },
            { target: 'trendyol', getSettingDef: () => pathDef, descriptor: { retiredEndpoints: [{ pattern: 'order/sellers/<SELLERID>/orders', retiredAt: '2026-10-15', replacementKey: 'v2' }] } },
        );
        expect(errors[0].message).toContain('kapatıldı');
    });

    it('[gerçek katalog] resilience.ratePerMin (overridable:false + envLock) reddedilir', () => {
        const errors = validatePatch({ 'resilience.ratePerMin': 500 }, { target: 'trendyol', getSettingDef });
        expect(errors[0].message).toContain('salt-okunurdur');
    });

    it('[gerçek katalog] export.publisher.chunkSize (Aşama B\'de overridable:true yapıldı) kabul edilir', () => {
        expect(validatePatch({ 'export.publisher.chunkSize': 40 }, { target: '_engine', getSettingDef })).toEqual([]);
    });
});

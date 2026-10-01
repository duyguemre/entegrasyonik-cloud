/**
 * ADR-0020 Karar 3.6 (Aşama B) — `resolveEffectiveConfigWithPublishedOverrides`/`getSettingWithPublishedOverrides`:
 * Aşama A'nın `resolveEffectiveConfig`/`getSetting` davranışı DEĞİŞMEDEN (ConfigResolver.test.ts karakterizasyonu
 * korunur), YENİ çağrı yerleri için `platformOverrideStore`'u OTOMATİK okuyan giriş noktası. DB/ağ YOK.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { resolveEffectiveConfigWithPublishedOverrides, getSettingWithPublishedOverrides } from '@integration/config/ConfigResolver';
import { setTargetOverride, resetPlatformOverrideStoreForTests } from '@integration/config/platformOverrideStore';
import { ENGINE_TARGET } from '@integration/config/targets';

beforeEach(() => resetPlatformOverrideStoreForTests());

describe('ADR-0020 Karar 3.6 — resolveEffectiveConfigWithPublishedOverrides', () => {
    it('store boşken (hiç yayın yok) davranış `resolveEffectiveConfig` ile AYNIDIR (default kaynağı)', () => {
        const r = resolveEffectiveConfigWithPublishedOverrides<number>('export.publisher.chunkSize');
        expect(r).toEqual({ key: 'export.publisher.chunkSize', value: 30, source: 'default' });
    });

    it('engine-scope anahtar: `_engine` hedefindeki yayınlanmış değeri OTOMATİK okur (integrationCode verilmese bile)', () => {
        setTargetOverride(ENGINE_TARGET, 5, { 'export.publisher.chunkSize': 77 });
        const r = resolveEffectiveConfigWithPublishedOverrides<number>('export.publisher.chunkSize');
        expect(r).toEqual({ key: 'export.publisher.chunkSize', value: 77, source: 'platform', revision: 5 });
    });

    it('integration-scope (engine+integration) anahtar: `integrationCode`nin hedefindeki yayını okur', () => {
        setTargetOverride('trendyol', 2, { 'resilience.maxConcurrent': 42 });
        const r = resolveEffectiveConfigWithPublishedOverrides<number>('resilience.maxConcurrent', { integrationCode: 'trendyol' });
        expect(r).toEqual({ key: 'resilience.maxConcurrent', value: 42, source: 'platform', revision: 2 });
        // Başka bir entegrasyon kodu için (yayın YOK) hâlâ default'tur.
        const other = resolveEffectiveConfigWithPublishedOverrides<number>('resilience.maxConcurrent', { integrationCode: 'n11' });
        expect(other.source).toBe('default');
    });

    it('env kilidi tanımlıysa yine EN YÜKSEK öncelik (store\'daki yayını ezer) — katman sırası korunur', () => {
        process.env.TY_RATE_PER_MIN = '999';
        setTargetOverride(ENGINE_TARGET, 1, { 'resilience.ratePerMin': 111 });
        try {
            const r = resolveEffectiveConfigWithPublishedOverrides<number>('resilience.ratePerMin', { integrationCode: 'trendyol' });
            expect(r).toEqual({ key: 'resilience.ratePerMin', value: 999, source: 'env', envVar: 'TY_RATE_PER_MIN' });
        } finally { delete process.env.TY_RATE_PER_MIN; }
    });

    it('opts.readPlatformOverride AÇIKÇA verilirse store yerine ONU kullanır (test/gelecek kancası korunur)', () => {
        setTargetOverride(ENGINE_TARGET, 9, { 'export.publisher.chunkSize': 1 });
        const r = resolveEffectiveConfigWithPublishedOverrides<number>('export.publisher.chunkSize', {
            readPlatformOverride: () => ({ value: 500, revision: 1 }),
        });
        expect(r).toEqual({ key: 'export.publisher.chunkSize', value: 500, source: 'platform', revision: 1 });
    });

    it('getSettingWithPublishedOverrides kısayolu yalnız değeri döner', () => {
        setTargetOverride(ENGINE_TARGET, 3, { 'export.publisher.chunkSize': 60 });
        expect(getSettingWithPublishedOverrides<number>('export.publisher.chunkSize')).toBe(60);
    });
});

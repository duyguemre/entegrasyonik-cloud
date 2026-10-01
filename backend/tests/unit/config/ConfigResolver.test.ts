/**
 * ADR-0020 Karar 1 — `resolveEffectiveConfig` (Aşama A: env ?? tenant(iskelet) ?? platform(iskelet) ?? default).
 * Gerçek ağ/DB YOK; yalnız saf fonksiyon + `process.env` manipülasyonu (test sonunda geri alınır).
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { resolveEffectiveConfig, getSetting, UnknownSettingError } from '@integration/config/ConfigResolver';

const ENV_KEYS_TO_RESTORE = ['TY_RATE_PER_MIN', 'TY_MOCK_MODE', 'TY_MOCK_BASE_URL'];
const originalEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS_TO_RESTORE) originalEnv[k] = process.env[k];

afterEach(() => {
    for (const k of ENV_KEYS_TO_RESTORE) {
        if (originalEnv[k] === undefined) delete process.env[k];
        else process.env[k] = originalEnv[k];
    }
});

describe('ADR-0020 Karar 1 — resolveEffectiveConfig (Aşama A)', () => {
    it('bilinmeyen anahtar UnknownSettingError fırlatır', () => {
        expect(() => resolveEffectiveConfig('bilinmeyen.anahtar')).toThrow(UnknownSettingError);
    });

    it('env kilidi TANIMSIZSA `default` kaynağıyla, katalogdaki değeri döner (engine ayarı örneği)', () => {
        delete process.env.TY_RATE_PER_MIN;
        const r = resolveEffectiveConfig<number>('export.publisher.chunkSize');
        expect(r).toEqual({ key: 'export.publisher.chunkSize', value: 30, source: 'default' });
    });

    it('per-entegrasyon varsayılan: `integrationCode` verilirse o koda özel değer, verilmezse `_` döner', () => {
        const ty = resolveEffectiveConfig<number>('resilience.ratePerMin', { integrationCode: 'trendyol' });
        expect(ty).toEqual({ key: 'resilience.ratePerMin', value: 200, source: 'default' });

        const hb = resolveEffectiveConfig<number>('resilience.ratePerMin', { integrationCode: 'hepsiburada' });
        expect(hb).toEqual({ key: 'resilience.ratePerMin', value: 0, source: 'default' }); // K12: tanımsız/sınırsız

        const none = resolveEffectiveConfig<number>('resilience.ratePerMin');
        expect(none).toEqual({ key: 'resilience.ratePerMin', value: 0, source: 'default' }); // `_` yedeği
    });

    it('env DEĞİŞKENİ TANIMLIYSA ve GEÇERLİYSE her şeyi ezer, kaynak "env" olur (`envLock`)', () => {
        process.env.TY_RATE_PER_MIN = '77';
        const r = resolveEffectiveConfig<number>('resilience.ratePerMin', { integrationCode: 'trendyol' });
        expect(r).toEqual({ key: 'resilience.ratePerMin', value: 77, source: 'env', envVar: 'TY_RATE_PER_MIN' });
    });

    it('env değişkeni TANIMLI ama GEÇERSİZSE (lenient) `default`a düşer (ADR\'nin "eski davranış" ilkesi)', () => {
        process.env.TY_RATE_PER_MIN = 'not-a-number';
        const r = resolveEffectiveConfig<number>('resilience.ratePerMin', { integrationCode: 'trendyol' });
        expect(r).toEqual({ key: 'resilience.ratePerMin', value: 200, source: 'default' });
    });

    it('mock ayarı: env kilidi bool tipini doğru ayrıştırır', () => {
        process.env.TY_MOCK_MODE = 'true';
        const r = resolveEffectiveConfig<boolean>('mock.trendyol.enabled');
        expect(r).toEqual({ key: 'mock.trendyol.enabled', value: true, source: 'env', envVar: 'TY_MOCK_MODE' });
    });

    it('`getSetting` kısayolu yalnız değeri döner', () => {
        expect(getSetting<number>('export.validator.chunkSize')).toBe(50);
    });

    it('Aşama A iskeleti: `readTenantOverride`/`readPlatformOverride` verilmezse HİÇ çağrılmaz, davranış saf `env ?? default`tur', () => {
        const r = resolveEffectiveConfig<number>('export.sentinel.cooldownMinutes');
        expect(r.source).toBe('default');
        expect(r.value).toBe(1);
    });

    it('Aşama B kancası: `readTenantOverride`/`readPlatformOverride` verilirse sırayla denenir (tenant > platform > default)', () => {
        const viaPlatform = resolveEffectiveConfig<number>('export.sentinel.cooldownMinutes', {
            readPlatformOverride: () => ({ value: 5, revision: 3 }),
        });
        expect(viaPlatform).toEqual({ key: 'export.sentinel.cooldownMinutes', value: 5, source: 'platform', revision: 3 });

        const viaTenant = resolveEffectiveConfig<number>('export.sentinel.cooldownMinutes', {
            readTenantOverride: () => 7,
            readPlatformOverride: () => ({ value: 5, revision: 3 }),
        });
        expect(viaTenant).toEqual({ key: 'export.sentinel.cooldownMinutes', value: 7, source: 'tenant' });
    });
});

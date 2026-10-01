// ADR-0018 Aşama A tutarlılık testleri (kategori belgesi §4 "Tek kaynak kuralı"):
//  - fabrika kodları === descriptor kodları (available|limited)
//  - `auth.requiredSettings` === adaptörün `requiredSettings`
//  - `rateLimits.configured` === `ResilientHttpClient` politikası
// Statik: kaynak dosyalar METİN olarak okunur (DB/ağ/gerçek adaptör örneklemesi YOK — adaptör kurucuları
// tenant/DB bağlamı ister, bu testler platform düzeyinde ve mock'suz çalışmalı).
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { INTEGRATION_DESCRIPTORS, getIntegrationDescriptor, listIntegrationDescriptorsByCategory } from '@integration/catalog/IntegrationDescriptorRegistry';
import { trendyolGlobalRatePerMin } from '@integration/modules/marketplace/trendyol/limits';
import { getSetting } from '@integration/config/ConfigResolver';

const SRC = path.resolve(__dirname, '../../../src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('IntegrationDescriptorRegistry — yapısal bütünlük', () => {
    it('6 manifesto var, kodlar benzersiz ve küçük harf', () => {
        expect(INTEGRATION_DESCRIPTORS).toHaveLength(6);
        const codes = INTEGRATION_DESCRIPTORS.map((d) => d.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const c of codes) expect(c).toBe(c.toLowerCase());
    });

    it('getIntegrationDescriptor büyük/küçük harf duyarsız arar, bilinmeyen kod için undefined döner', () => {
        expect(getIntegrationDescriptor('TRENDYOL')?.code).toBe('trendyol');
        expect(getIntegrationDescriptor('does-not-exist')).toBeUndefined();
    });

    it('listIntegrationDescriptorsByCategory kategoriye göre süzer (ör. erp -> yalnız Bizimhesap)', () => {
        const erp = listIntegrationDescriptorsByCategory('erp');
        expect(erp.map((d) => d.code)).toEqual(['bizimhesap']);
        const marketplace = listIntegrationDescriptorsByCategory('marketplace');
        expect(marketplace.map((d) => d.code).sort()).toEqual(['hepsiburada', 'n11', 'pazarama', 'trendyol']);
        expect(listIntegrationDescriptorsByCategory('shipping')).toEqual([]);
    });

    it('her manifestoda en az 1 yetenek tanımlı ve her `limited` girişte `note` zorunludur (kategori belgesi §4)', () => {
        for (const d of INTEGRATION_DESCRIPTORS) {
            const caps = Object.values(d.capabilities);
            expect(caps.length).toBeGreaterThan(0);
            for (const cap of caps) {
                if (cap!.level === 'limited') {
                    // `${d.code}: 'limited' yetenek notsuz olamaz`
                    expect(cap!.note).toBeTruthy();
                    expect(cap!.note!.length).toBeGreaterThan(0);
                }
            }
        }
    });
});

describe('Fabrika kodları === descriptor kodları (available|limited)', () => {
    it('IntegrationFactory.ts switch case kodları descriptor kod kümesiyle BİREBİR eşit', () => {
        const factorySrc = read('integration/modules/IntegrationFactory.ts');
        const caseMatches = [...factorySrc.matchAll(/case\s+'([a-z0-9_-]+)':/g)].map((m) => m[1]);
        expect(caseMatches.length).toBeGreaterThan(0);

        const descriptorCodes = INTEGRATION_DESCRIPTORS
            .filter((d) => d.status === 'available' || d.status === 'limited')
            .map((d) => d.code)
            .sort();

        expect([...caseMatches].sort()).toEqual(descriptorCodes);
    });
});

describe('auth.requiredSettings === adaptörün requiredSettings (kaynak metinden statik okuma)', () => {
    const ADAPTER_INDEX_FILES: Record<string, string> = {
        trendyol: 'integration/modules/marketplace/trendyol/index.ts',
        hepsiburada: 'integration/modules/marketplace/hepsiburada/index.ts',
        n11: 'integration/modules/marketplace/n11/index.ts',
        pazarama: 'integration/modules/marketplace/pazarama/index.ts',
        ideasoft: 'integration/modules/ecommerce/ideasoft/index.ts',
        bizimhesap: 'integration/modules/erp/bizimhesap/index.ts',
    };

    function extractRequiredSettings(src: string): string[] {
        const m = /requiredSettings\s*=\s*\[([^\]]*)\]/.exec(src);
        if (!m) throw new Error('requiredSettings dizisi bulunamadı');
        return m[1]
            .split(',')
            .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter((s) => s.length > 0);
    }

    it.each(Object.entries(ADAPTER_INDEX_FILES))('%s: descriptor.auth.requiredSettings === index.ts requiredSettings', (code, relFile) => {
        const descriptor = getIntegrationDescriptor(code);
        expect(descriptor).toBeDefined();
        const src = read(relFile);
        const actual = extractRequiredSettings(src);
        expect([...descriptor!.auth.requiredSettings].sort()).toEqual([...actual].sort());
    });
});

describe('rateLimits.configured === ResilientHttpClient politikası (artık kataloğa karşı okunur)', () => {
    // [ADR-0020 Aşama A, 2026-09-29] ÖNCEDEN bu blok `extractNumberOption`/`extractEnvFallback` ile
    // Service.ts kaynak METNİNİ regex'le grep'liyordu (6 adaptörün hepsi literal sabit taşıdığı için).
    // 6 adaptör de artık `getSetting()` ile `catalog/integrationHttp.ts`ten okuduğu için statik grep
    // ARTIK UYGULANAMAZ; tutarlılık denetimi doğrudan kataloğa karşı yapılır (AYNI invaryant: descriptor
    // `rateLimits.configured` ile FİİLEN kullanılan değer birbirinden SAPMASIN). Yalnız Pazarama'nın
    // `ratePerMin`i BİLİNÇLİ OLARAK kataloğa köprülenmedi (bkz. o bloktaki not).

    it('Trendyol: maxConcurrent 10, timeoutMs varsayılanı 30000, ratePerMin = trendyolGlobalRatePerMin() (env yokken 200)', () => {
        // [ADR-0020 Aşama A, 2026-09-29] Service.ts artık bu üç değeri LİTERAL sabit olarak değil,
        // `catalog/integrationHttp.ts` üzerinden `getSetting()` ile okur (bkz. Trendyol.services.Service.ts).
        // Statik kaynak-metin grep'i (extractNumberOption/extractEnvFallback) bu yüzden BURADA ARTIK
        // UYGULANAMAZ; tutarlılık denetimi doğrudan kataloğa karşı yapılır (aynı invaryant: descriptor
        // `rateLimits.configured` ile FİİLEN kullanılan değer birbirinden SAPMASIN).
        const d = getIntegrationDescriptor('trendyol')!;
        expect(getSetting<number>('resilience.maxConcurrent', { integrationCode: 'trendyol' })).toBe(d.rateLimits.configured.maxConcurrent);
        expect(getSetting<number>('resilience.timeoutMs', { integrationCode: 'trendyol' })).toBe(d.rateLimits.configured.timeoutMs);
        delete process.env.TY_RATE_PER_MIN;
        expect(trendyolGlobalRatePerMin()).toBe(d.rateLimits.configured.ratePerMin);
    });

    it('Hepsiburada: maxConcurrent 5, timeoutMs varsayılanı 60000', () => {
        // [ADR-0020 Aşama A] Service.ts artık kataloktan (`getSetting`) okur, bkz. Trendyol bloğundaki not.
        const d = getIntegrationDescriptor('hepsiburada')!;
        expect(getSetting<number>('resilience.maxConcurrent', { integrationCode: 'hepsiburada' })).toBe(d.rateLimits.configured.maxConcurrent);
        expect(getSetting<number>('resilience.timeoutMs', { integrationCode: 'hepsiburada' })).toBe(d.rateLimits.configured.timeoutMs);
    });

    it('N11: maxConcurrent 10, ratePerMin 1000, timeoutMs varsayılanı 30000 (paylaşımlı politika, REST+SOAP)', () => {
        // [ADR-0020 Aşama A] Service.ts artık kataloktan (`getSetting`) okur, bkz. Trendyol bloğundaki not.
        const d = getIntegrationDescriptor('n11')!;
        expect(getSetting<number>('resilience.maxConcurrent', { integrationCode: 'n11' })).toBe(d.rateLimits.configured.maxConcurrent);
        expect(getSetting<number>('resilience.ratePerMin', { integrationCode: 'n11' })).toBe(d.rateLimits.configured.ratePerMin);
        expect(getSetting<number>('resilience.timeoutMs', { integrationCode: 'n11' })).toBe(d.rateLimits.configured.timeoutMs);
    });

    it('Pazarama: maxConcurrent 11, timeoutMs varsayılanı 30000, ratePerMin bilinçli olarak ayarlanmadı', () => {
        // [ADR-0020 Aşama A] Service.ts artık kataloktan (`getSetting`) okur, bkz. Trendyol bloğundaki not.
        // ratePerMin BİLİNÇLİ OLARAK kataloğa köprülenmedi (resmi değer doğrulanamadı, bkz. Service.ts BULGU notu).
        const d = getIntegrationDescriptor('pazarama')!;
        expect(getSetting<number>('resilience.maxConcurrent', { integrationCode: 'pazarama' })).toBe(d.rateLimits.configured.maxConcurrent);
        expect(getSetting<number>('resilience.timeoutMs', { integrationCode: 'pazarama' })).toBe(d.rateLimits.configured.timeoutMs);
        expect(d.rateLimits.configured.ratePerMin).toBeUndefined();
    });

    it('Ideasoft: ratePerMin 300, timeoutMs varsayılanı 30000', () => {
        // [ADR-0020 Aşama A] Service.ts artık kataloktan (`getSetting`) okur, bkz. Trendyol bloğundaki not.
        const d = getIntegrationDescriptor('ideasoft')!;
        expect(getSetting<number>('resilience.ratePerMin', { integrationCode: 'ideasoft' })).toBe(d.rateLimits.configured.ratePerMin);
        expect(getSetting<number>('resilience.timeoutMs', { integrationCode: 'ideasoft' })).toBe(d.rateLimits.configured.timeoutMs);
    });

    it('Bizimhesap: ratePerMin 300, timeoutMs varsayılanı 30000', () => {
        // [ADR-0020 Aşama A] Service.ts artık kataloktan (`getSetting`) okur, bkz. Trendyol bloğundaki not.
        const d = getIntegrationDescriptor('bizimhesap')!;
        expect(getSetting<number>('resilience.ratePerMin', { integrationCode: 'bizimhesap' })).toBe(d.rateLimits.configured.ratePerMin);
        expect(getSetting<number>('resilience.timeoutMs', { integrationCode: 'bizimhesap' })).toBe(d.rateLimits.configured.timeoutMs);
    });
});

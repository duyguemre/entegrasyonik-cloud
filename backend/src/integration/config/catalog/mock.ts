// ADR-0020 Karar 2.3 "Mock / gerçek mod" grubu — env-kilitli, salt-okunur (C19 fail-closed, ADR Karar 1.3).
// Kaynak TEK doğruluk: `common/mock/MockMode.ts` + `config/env.ts` `MOCK_PREFIXES`. Bu dosya değer ÜRETMEZ, yalnız
// bu 3 alanı her adaptör için katalogda GÖRÜNÜR kılar (panel Aşama C'de salt-okunur gösterir).
import { z } from 'zod';
import { MOCK_PREFIXES } from '@config/env';
import type { SettingDef } from '../types';

const MOCK_INTEGRATION_CODE: Record<typeof MOCK_PREFIXES[number], string> = {
    TY: 'trendyol', PAZARAMA: 'pazarama', N11: 'n11', HEPSIBURADA: 'hepsiburada', IDEASOFT: 'ideasoft', BIZIMHESAP: 'bizimhesap',
};

export const MOCK_SETTINGS: SettingDef<any>[] = MOCK_PREFIXES.flatMap((prefix) => {
    const code = MOCK_INTEGRATION_CODE[prefix];
    const base: Omit<SettingDef<any>, 'key' | 'type' | 'schema' | 'default' | 'label' | 'help' | 'envLock'> = {
        group: 'mock', scope: 'integration', unit: undefined,
        danger: 'dangerous', applies: 'restart', overridable: false,
        consumers: ['common/mock/MockMode.ts'], since: '2026-09-29',
        impact: { tr: 'Üretimde mock açmak "sahte başarı" gösterir (E3 ihlali); yalnız env ile değiştirilebilir.', en: 'Enabling mock in production shows fake success (E3 violation); env-only.' },
    };
    return [
        { ...base, key: `mock.${code}.enabled`, type: 'bool', schema: z.boolean(), default: false, envLock: `${prefix}_MOCK_MODE`,
            label: { tr: `${code}: mock modu`, en: `${code}: mock mode` },
            help: { tr: 'Açıksa gerçek API yerine yerel mock sunucusuna istek atılır.', en: 'When on, requests go to the local mock server instead of the real API.' } },
        { ...base, key: `mock.${code}.baseUrl`, type: 'text', schema: z.string(), default: '', envLock: `${prefix}_MOCK_BASE_URL`,
            label: { tr: `${code}: mock taban adresi`, en: `${code}: mock base URL` },
            help: { tr: 'Mock modunda isteklerin yönlendirileceği taban adres.', en: 'Base URL requests are routed to in mock mode.' } },
        { ...base, key: `mock.${code}.mockableEndpoints`, type: 'stringList', schema: z.array(z.string()), default: [], envLock: `${prefix}_MOCKABLE_ENDPOINTS`,
            label: { tr: `${code}: mocklanabilir uçlar`, en: `${code}: mockable endpoints` },
            help: { tr: 'Yalnız bu listedeki uçlar mock moduna yönlendirilir (adaptöre göre uygulanır/uygulanmaz).', en: 'Only listed endpoints are routed to mock (adapter-dependent).' } },
    ] as SettingDef<any>[];
});

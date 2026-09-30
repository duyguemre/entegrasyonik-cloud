// ADR-0020 Karar 2.3 "Oran sınırı ve dayanıklılık" grubu — 6 adaptörün BUGÜN ETKİN HTTP politikası.
// Kaynak: adaptör `descriptor.ts` `rateLimits.configured` (ADR-0018, salt REFERANS — bu dosya descriptor'ı DEĞİŞTİRMEZ),
// `common/http/ResilientHttpClient.ts` (paylaşımlı retry/breaker varsayılanı), her adaptörün `services/Service.ts`.
import { z } from 'zod';
import type { PerIntegrationDefault, SettingDef } from '../types';
import { ADAPTER_CODES } from '../../modules/adapterKeys';
import { durationSetting, countSetting } from './helpers';

const INTEGRATION_CODES = ADAPTER_CODES; // ADR-0033 INT-02: tek kod tablosu

function perIntegration(values: Partial<Record<typeof INTEGRATION_CODES[number], number>>, fallback: number): PerIntegrationDefault<number> {
    return { _: fallback, ...values } as PerIntegrationDefault<number>;
}

export const INTEGRATION_HTTP_SETTINGS: SettingDef<number>[] = [
    {
        key: 'resilience.timeoutMs',
        group: 'resilience', scope: 'engine+integration', type: 'duration',
        schema: z.number().int().min(1000).max(300000),
        unit: 'ms',
        // Kaynak: 6 adaptörün Service.ts `Number(process.env.X_HTTP_TIMEOUT_MS) || def` (HB=60000, diğerleri 30000).
        default: perIntegration({ hepsiburada: 60000, trendyol: 30000, n11: 30000, pazarama: 30000, ideasoft: 30000, bizimhesap: 30000 }, 30000),
        safeRange: { min: 5000, max: 120000 },
        danger: 'caution', applies: 'restart',
        consumers: INTEGRATION_CODES.map((c) => `marketplace|ecommerce|erp/${c}/services/Service.ts`),
        label: { tr: 'HTTP zaman aşımı', en: 'HTTP timeout' },
        help: { tr: 'Bir dış API isteğinin en fazla ne kadar süreceği; aşılırsa istek başarısız sayılır.', en: 'Max duration of an outbound API call before it is treated as failed.' },
        overridable: false, since: '2026-09-29',
    },
    {
        key: 'resilience.maxConcurrent',
        group: 'resilience', scope: 'engine+integration', type: 'int',
        schema: z.number().int().min(1).max(100),
        unit: 'count',
        // ideasoft/bizimhesap Service.ts'de HİÇ verilmiyor -> ResilientHttpClient varsayılanı (10).
        default: perIntegration({ trendyol: 10, hepsiburada: 5, n11: 10, pazarama: 11, ideasoft: 10, bizimhesap: 10 }, 10),
        danger: 'caution', applies: 'restart',
        consumers: INTEGRATION_CODES.map((c) => `marketplace|ecommerce|erp/${c}/services/Service.ts`),
        label: { tr: 'Eşzamanlı istek sınırı', en: 'Max concurrent requests' },
        help: { tr: 'Aynı anda gönderilebilecek en fazla dış API isteği sayısı (bulkhead).', en: 'Maximum in-flight outbound requests (bulkhead).' },
        overridable: false, since: '2026-09-29',
    },
    {
        key: 'resilience.ratePerMin',
        group: 'resilience', scope: 'engine+integration', type: 'int',
        // min 0 KASITLI: 0 = "adaptörde tanımlı değil / sınırsız" (Hepsiburada, Pazarama — K12 bulgusu).
        schema: z.number().int().min(0).max(20000),
        unit: 'perMin',
        // hepsiburada/pazarama'da BİLİNÇLİ OLARAK tanımsız (sınırsız) — `_` = 0 "sınırsız" anlamına gelir, ayrı işaretlenir.
        default: perIntegration({ trendyol: 200, n11: 1000, ideasoft: 300, bizimhesap: 300 }, 0),
        danger: 'dangerous', applies: 'restart',
        impact: { tr: 'Artırmak pazaryeri tarafından geçici/kalıcı banlanma (429 fırtınası) riskini artırır.', en: 'Increasing raises the risk of provider throttling/bans (429 storms).' },
        consumers: ['marketplace/trendyol/limits.ts', 'marketplace/n11/services/Service.ts', 'ecommerce/ideasoft/services/Service.ts', 'erp/bizimhesap/services/Service.ts'],
        label: { tr: 'Dakikada istek sınırı', en: 'Requests per minute' },
        help: { tr: 'Bir dakikada gönderilebilecek en fazla istek sayısı. 0 = adaptörde tanımlı değil (sınırsız, Hepsiburada/Pazarama).', en: 'Max requests per minute. 0 = not configured (unbounded, Hepsiburada/Pazarama).' },
        envLock: 'TY_RATE_PER_MIN', // yalnız Trendyol'da tanımlı env kilidi; diğerlerinde env override YOK (K12).
        overridable: false, since: '2026-09-29',
    },
    durationSetting({
        key: 'resilience.trendyol.orderListRatePerMin', group: 'resilience', scope: 'integration', unit: 's', default: 30,
        danger: 'dangerous', applies: 'immediate', consumers: ['marketplace/trendyol/limits.ts', 'marketplace/trendyol/api/OrderConnector.ts'],
        label: { tr: 'Trendyol sipariş listesi oran sınırı (dk)', en: 'Trendyol order-list rate (per min)' },
        help: { tr: 'Trendyol sipariş listesi uç noktasına dakikada en fazla kaç istek atılacağı (genel oran sınırından bağımsız, ayrı sayaç).', en: 'Max requests/min to the Trendyol order-list endpoint (separate counter from the global rate).' },
        impact: { tr: 'Resmi kaynaklar çelişiyor (30-100/dk tablo vs 1000/dk servis sayfası); muhafazakâr taban 30 seçildi.', en: 'Official sources conflict (30-100/min table vs 1000/min service page); conservative baseline 30 was chosen.' },
        envLock: 'TY_ORDER_LIST_RATE_PER_MIN', since: '2026-09-29',
    }),
    countSetting({
        key: 'resilience.retry.maxAttempts', group: 'resilience', scope: 'engine+integration', default: 4, max: 20,
        danger: 'caution', applies: 'restart', consumers: ['common/http/ResilientHttpClient.ts'],
        label: { tr: 'Yeniden deneme sayısı', en: 'Retry attempts' },
        help: { tr: 'Başarısız bir isteğin en fazla kaç kez yeniden deneneceği (toplam deneme = bu + 1).', en: 'Maximum retries for a failed request (total attempts = this + 1).' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'resilience.retry.baseDelayMs', group: 'resilience', scope: 'engine+integration', unit: 'ms', default: 1000,
        danger: 'caution', applies: 'restart', consumers: ['common/http/ResilientHttpClient.ts'],
        label: { tr: 'Yeniden deneme taban gecikmesi', en: 'Retry base delay' },
        help: { tr: 'Üstel geri çekilmenin (exponential backoff) taban süresi.', en: 'Base duration for exponential backoff.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'resilience.retry.maxDelayMs', group: 'resilience', scope: 'engine+integration', unit: 'ms', default: 30000,
        danger: 'caution', applies: 'restart', consumers: ['common/http/ResilientHttpClient.ts'],
        label: { tr: 'Yeniden deneme üst gecikme sınırı', en: 'Retry max delay' },
        help: { tr: 'Üstel geri çekilmenin ulaşabileceği en yüksek bekleme süresi.', en: 'Upper bound for exponential backoff.' },
        since: '2026-09-29',
    }),
    countSetting({
        key: 'resilience.breaker.consecutiveFailures', group: 'resilience', scope: 'engine+integration', default: 5, max: 50,
        danger: 'caution', applies: 'restart', consumers: ['common/http/ResilientHttpClient.ts'],
        label: { tr: 'Devre kesici eşik değeri', en: 'Circuit breaker threshold' },
        help: { tr: 'Devre kesicinin açılması için gereken ardışık hata sayısı.', en: 'Consecutive failures required to open the circuit breaker.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'resilience.breaker.openMs', group: 'resilience', scope: 'engine+integration', unit: 'ms', default: 30000,
        danger: 'caution', applies: 'restart', consumers: ['common/http/ResilientHttpClient.ts'],
        label: { tr: 'Devre kesici açık kalma süresi', en: 'Circuit breaker open duration' },
        help: { tr: 'Devre açıldıktan sonra ilk yarı-açık denemeye kadar geçen süre.', en: 'Time the circuit stays open before the first half-open probe.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'resilience.breaker.maxOpenMs', group: 'resilience', scope: 'engine+integration', unit: 'ms', default: 300000,
        danger: 'caution', applies: 'restart', consumers: ['common/http/ResilientHttpClient.ts'],
        label: { tr: 'Devre kesici üst açık kalma süresi', en: 'Circuit breaker max open duration' },
        help: { tr: 'Ardışık yarı-açık başarısızlıklarında devrenin en fazla açık kalabileceği süre.', en: 'Max time the circuit can stay open across repeated half-open failures.' },
        since: '2026-09-29',
    }),
    durationSetting({
        key: 'resilience.factoryCallTimeoutMs', group: 'resilience', scope: 'engine', unit: 'ms', default: 120000,
        danger: 'dangerous', applies: 'restart', consumers: ['integration/modules/IntegrationFactory.ts'],
        label: { tr: 'Fabrika çağrı zaman aşımı', en: 'Factory call timeout' },
        help: { tr: 'Bir adaptör metodunun `IntegrationFactory` Proxy\'si tarafından en fazla ne kadar bekletileceği.', en: 'Max time an adapter method call is allowed by the IntegrationFactory proxy.' },
        since: '2026-09-29',
        knownDriftNote: 'K11: JSON\'da YOK, yalnız kod sabiti `IntegrationFactory.EXECUTION_TIMEOUT` (IntegrationFactory.ts:36). Katalog bu değeri İZLER, tüketici migrasyonu bu turda yapılmadı.',
    }),
];

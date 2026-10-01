// Backoffice B5/B6/B6b (entegrasyonlar) + B8a-d (altyapı) + B9 (cache) yetenekleri (yalnız `/admin-api`; `minTier:'platformAdmin'`). Ayrı dosya: paralel backoffice işleriyle çakışmamak için.
// `flushCacheFamily` pod-yerel bellek cache'ini boşaltır (dış etki yok): write + step-up (`REAUTH_RPCS`) + gerekçe; RunOperation `backoffice.write` yazar.
import { z } from 'zod';
import { defineCapability as c, nx, NO_AGENT, noUi } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const UI = noUi('Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.');

const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);

/** `getApiHealth` -> entegrasyon satirlari; `topErrorCode` yalniz sabit hata KODU (metin degil); tenant yalniz SAYI. */
function projectApiHealth(raw: any) {
    const rows: any[] = Array.isArray(raw?.items) ? raw.items : [];
    return { range: String(raw?.range ?? '').slice(0, 8), items: rows.slice(0, 50).map((r) => ({
        integrationCode: String(r?.integrationCode ?? '?').slice(0, 40), total: int(r?.total), errors: int(r?.errors),
        errorRate: typeof r?.errorRate === 'number' ? r.errorRate : 0, p95Ms: typeof r?.p95Ms === 'number' ? r.p95Ms : null,
        affectedTenants: int(r?.affectedTenants),
        topErrorCode: Array.isArray(r?.errorsByCode) && r.errorsByCode[0] ? (String(r.errorsByCode[0].code ?? '').slice(0, 40) || null) : null,
    })) };
}

/** `getResilienceState` -> entegrasyon basina pod toplamlari (en kisitlayici `intake`; pod adi yok). */
function projectResilience(raw: any) {
    const rank = { on: 0, drain: 1, off: 2 } as const;
    const items: any[] = Array.isArray(raw?.items) ? raw.items : [];
    return { items: items.slice(0, 50).map((it) => {
        const pods: any[] = Array.isArray(it?.pods) ? it.pods : [];
        let intake: 'on' | 'drain' | 'off' = 'on';
        for (const p of pods) { const v = p?.intake; if ((v === 'drain' || v === 'off') && rank[v as 'drain' | 'off'] > rank[intake]) intake = v; }
        return {
            integrationCode: String(it?.integrationCode ?? '?').slice(0, 40), podsReporting: pods.length,
            circuitsOpen: pods.reduce((n, p) => n + int(p?.circuits?.open), 0), circuitsHalfOpen: pods.reduce((n, p) => n + int(p?.circuits?.half_open), 0),
            rateLimited: pods.reduce((n, p) => n + int(p?.rate?.limited), 0), intake,
        };
    }) };
}

export const BACKOFFICE_INFRA_CAPABILITIES = [
    c({
        id: 'platform.integrations.api_health', domain: 'platform', summary: { tr: 'Platform geneli entegrasyon API sağlığı (çağrı, hata oranı, p95, etkilenen tenant sayısı)', en: 'Platform-wide integration API health (calls, error rate, p95, affected tenant count)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeIntegrationService/getApiHealth' }], ui: UI, mcp: PA, agent: NO_AGENT,
        // BR-4 (adminChat): entegrasyon basina cagri/hata/p95 + etkilenen tenant SAYISI (kimlik yok).
        input: z.object({ range: z.enum(['1h', '24h', '7d']).default('24h'), integrationCode: z.string().regex(/^[a-z0-9_-]{1,40}$/).optional() }).strict(),
        output: z.object({ range: z.string().max(8), items: z.array(z.object({
            integrationCode: z.string().max(40), total: z.number().int(), errors: z.number().int(), errorRate: z.number(),
            p95Ms: z.number().nullable(), affectedTenants: z.number().int(), topErrorCode: z.string().max(40).nullable(),
        })).max(50) }),
        adminChat: { exposed: {
            present: 'table', project: projectApiHealth,
            llm: {
                description: 'Returns platform-wide marketplace and integration API health for a time range (1h, 24h or 7d): call count, error count and rate, approximate p95 latency, the most frequent error code and how many tenants were affected. '
                    + 'Use it to answer which integration is failing or slow. Only counts are returned, never tenant identities or payloads. Optionally filter by one integration code.',
                examples: ['Hangi entegrasyon hata veriyor?', 'Son 24 saatte Trendyol API sağlığı nasıl?', 'Etkilenen mağaza sayısı en yüksek entegrasyon hangisi?'],
            },
        } },
    }),
    c({
        id: 'platform.integrations.resilience', domain: 'platform', summary: { tr: 'Entegrasyon x pod dayanıklılık durumu (devre kesici, hız sınırı bütçesi, intake)', en: 'Integration x pod resilience state (circuit breaker, rate budget, intake)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeIntegrationService/getResilienceState' }], ui: UI, mcp: PA, agent: NO_AGENT,
        // BR-4 (adminChat): entegrasyon basina devre kesici / hiz siniri toplamlari (pod adi yok).
        input: z.object({}).strict(),
        output: z.object({ items: z.array(z.object({
            integrationCode: z.string().max(40), podsReporting: z.number().int(), circuitsOpen: z.number().int(), circuitsHalfOpen: z.number().int(),
            rateLimited: z.number().int(), intake: z.enum(['on', 'drain', 'off']),
        })).max(50) }),
        adminChat: { exposed: {
            present: 'table', project: projectResilience,
            llm: {
                description: 'Returns the resilience state per integration aggregated over all pods: how many circuit breakers are open or half-open, how many calls are rate limited and the intake mode (on, drain or off). '
                    + 'Use it to explain why an integration is paused or throttled. Pod names and tenant identities are not included. It cannot change any setting.',
                examples: ['Devre kesicisi açık entegrasyon var mı?', 'Hız sınırına takılan entegrasyonlar hangileri?', 'Hangi entegrasyonun alımı durduruldu?'],
            },
        } },
    }),
    c({
        id: 'platform.integration_config.catalog', domain: 'platform', summary: { tr: 'Ayar kataloğu metaverisi (etiket, yardım, birim, varsayılan, tehlike; değer yok)', en: 'Settings catalog metadata (label, help, unit, default, danger; no values)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'IntegrationConfigService/getCatalog' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.infra.redis_status', domain: 'platform', summary: { tr: 'Redis durumu (INFO alt kümesi, anahtar AİLESİ sayıları, slowlog; anahtar/değer yok)', en: 'Redis status (INFO subset, key FAMILY counts, slowlog; no keys/values)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeInfraService/getRedisStatus' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.infra.mongo_status', domain: 'platform', summary: { tr: 'Mongo durumu (serverStatus alt kümesi, havuzlar, izinli DB dbStats)', en: 'Mongo status (serverStatus subset, pools, allow-listed DB dbStats)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeInfraService/getMongoStatus' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.infra.mongo_collections', domain: 'platform', summary: { tr: 'Bir izinli DB\'nin koleksiyon boyutları ve indeks kullanımı (belge içeriği yok)', en: 'Collection sizes and index usage of an allow-listed DB (no document content)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeInfraService/getMongoCollections' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.infra.slow_queries', domain: 'platform', summary: { tr: 'Yavaş sorgu sayısı ve p95 (db/koleksiyon/işlem; sorgu değeri yok)', en: 'Slow query counts and p95 (db/collection/op; no query values)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeInfraService/getSlowQueries' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.infra.cache_metrics', domain: 'platform', summary: { tr: 'Bellek cache metrikleri (aile bazlı; ham anahtar yok; bu pod)', en: 'In-memory cache metrics (per family; no raw keys; this pod)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeInfraService/getCacheMetrics' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.infra.flush_cache_family', domain: 'platform', summary: { tr: 'Bir cache ailesini boşalt (bu pod; step-up + gerekçe)', en: 'Flush a cache family (this pod; step-up + reason)' },
        effect: 'write', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeInfraService/flushCacheFamily' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
];

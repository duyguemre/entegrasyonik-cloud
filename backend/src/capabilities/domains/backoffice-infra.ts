// Backoffice B5/B6/B6b (entegrasyonlar) + B8a-d (altyapı) + B9 (cache) yetenekleri (yalnız `/admin-api`; `minTier:'platformAdmin'`). Ayrı dosya: paralel backoffice işleriyle çakışmamak için.
// `flushCacheFamily` pod-yerel bellek cache'ini boşaltır (dış etki yok): write + step-up (`REAUTH_RPCS`) + gerekçe; RunOperation `backoffice.write` yazar.
import { defineCapability as c, nx, NO_AGENT, noUi } from '../define';
import { PLATFORM_ONLY } from '../permissions';

const PA = nx('platform_admin', 'Süper yönetici (platformAdmin) yeteneği; OAuth token\'ında ga bulunmadığı için MCP\'den çağrılamaz (ADR-0010).');
const UI = noUi('Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.');

export const BACKOFFICE_INFRA_CAPABILITIES = [
    c({
        id: 'platform.integrations.api_health', domain: 'platform', summary: { tr: 'Platform geneli entegrasyon API sağlığı (çağrı, hata oranı, p95, etkilenen tenant sayısı)', en: 'Platform-wide integration API health (calls, error rate, p95, affected tenant count)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeIntegrationService/getApiHealth' }], ui: UI, mcp: PA, agent: NO_AGENT,
    }),
    c({
        id: 'platform.integrations.resilience', domain: 'platform', summary: { tr: 'Entegrasyon x pod dayanıklılık durumu (devre kesici, hız sınırı bütçesi, intake)', en: 'Integration x pod resilience state (circuit breaker, rate budget, intake)' },
        effect: 'read', minTier: 'platformAdmin', permission: PLATFORM_ONLY, bindings: [{ rpc: 'BackofficeIntegrationService/getResilienceState' }], ui: UI, mcp: PA, agent: NO_AGENT,
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

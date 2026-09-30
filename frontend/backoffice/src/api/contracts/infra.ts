/**
 * Entegrasyon sağlığı + altyapı + önbellek — B5/B6/B6b/B6c, B8a-d, B9 (docs/cloud-contracts/API_BACKOFFICE_INTEGRATIONS_INFRA.md). [BE HAZIR]
 * Kaynak: backoffice-integration-service.ts, backoffice-infra-service.ts, integration-config-service.ts (getCatalog/getEffectiveConfig);
 * şema rpc-input/backoffice-infra.ts. Sızıntı kuralı: ham anahtar/değer, belge içeriği, sorgu değeri, izinsiz DB adı yok.
 */

// ---------------------------------------------------------------- B5
export type ApiHealthRange = '1h' | '24h' | '7d'
export interface ApiHealthItem {
  integrationCode: string
  total: number
  errors: number
  errorRate: number | null
  errorsByCode: Array<{ code: string; count: number; rate: number }>
  /** YAKLAŞIK: histogram kova üst sınırı; 30 sn üstü null. */
  p95Ms: number | null
  /** Hata alan tenant SAYISI. */
  affectedTenants: number
}
export interface ApiHealthResponse {
  range: ApiHealthRange
  since: string
  until: string
  items: ApiHealthItem[]
}

// ---------------------------------------------------------------- B6
export type IntakeMode = 'on' | 'drain' | 'off'
export interface ResiliencePodCell {
  pod: string
  observedAt: string
  circuits: { closed: number; open: number; half_open: number }
  /** minRatio: etkin/taban hız (1 = tam hız; taban yoksa null). */
  rate: { limited: number; tenants: number; minRatio: number | null }
  lastOpenedAt: string | null
  intake: IntakeMode
}
export interface ResilienceResponse {
  pods: Array<{ pod: string; observedAt: string; engineIntake: IntakeMode }>
  items: Array<{ integrationCode: string; pods: ResiliencePodCell[] }>
}

// ---------------------------------------------------------------- B6b / B6c (ADR-0020 yapılandırma motoru)
export type SettingType = 'int' | 'duration' | 'bool' | 'enum' | 'host' | 'pathTemplate' | 'stringList' | 'text' | 'decimal'
export type SettingDanger = 'safe' | 'caution' | 'dangerous'
export type SettingApplies = 'immediate' | 'next_cycle' | 'restart'
export type Localized = { tr: string; en: string }
export interface CatalogItem {
  key: string
  group: string
  scope: 'engine' | 'integration' | 'engine+integration' | 'platform'
  type: SettingType
  unit?: string | null
  /** Tip ya da PerIntegrationDefault (`{ "_": 10, "trendyol": 5 }`). */
  default: unknown
  safeRange?: { min: number; max: number } | null
  danger: SettingDanger
  applies: SettingApplies
  label: Localized
  help: Localized
  impact?: Localized | null
  advanced: boolean
  overridable: boolean
  envLock?: string | null
  tenantOverridable?: { bounds: { min: number; max: number } } | null
  since: string
  deprecated?: { since: string; replacement?: string } | null
  exposure?: 'public' | null
}
export interface CatalogResponse {
  catalogVersion: string
  items: CatalogItem[]
}
export type ValueSource = 'default' | 'legacy' | 'platform' | 'tenant' | 'env'
export interface EffectiveValue {
  key: string
  value: unknown
  source: ValueSource
  envVar?: string
  revision?: number
}
export interface EffectiveConfigResponse {
  target: string
  publishedVersion: number
  catalogVersion: string
  values: EffectiveValue[]
}

// ---------------------------------------------------------------- B8a
export interface RedisStatus {
  server: { version: string | null; uptimeSeconds: number | null }
  /** maxBytes 0 = sınırsız. */
  memory: { usedBytes: number | null; peakBytes: number | null; maxBytes: number | null; fragmentationRatio: number | null; evictionPolicy: string | null }
  clients: { connected: number | null; blocked: number | null }
  stats: { opsPerSec: number | null; keyspaceHits: number | null; keyspaceMisses: number | null; expiredKeys: number | null; evictedKeys: number | null }
  keyspace: Array<{ db: string; keys: number; expires: number }>
  /** SCAN örneklemesi; truncated:true ise sayılar örnektir. */
  keyFamilies: { sampled: number; truncated: boolean; items: Array<{ family: string; count: number }> }
  slowlog: Array<{ command: string; durationMicros: number; at: string }>
}

// ---------------------------------------------------------------- B8b / B8c / B8d
export interface MongoDbStats {
  scope: 'app' | 'tenant'
  tenantId?: number
  label: string
  available: boolean
  collections?: number
  objects?: number
  dataSize?: number
  storageSize?: number
  indexes?: number
  indexSize?: number
}
export interface MongoStatus {
  /** null = serverStatus yetkisi yok. */
  server: {
    version: string
    uptimeSeconds: number
    connections: { current: number; available: number; totalCreated: number }
    opcounters: { insert: number; query: number; update: number; delete: number; getmore: number; command: number }
    cache: { usedBytes: number; maxBytes: number; dirtyBytes: number; fillRatio: number | null }
  } | null
  pools: { appPoolSize: number; openTenantHandles: number }
  databases: MongoDbStats[]
  skippedNotAllowlisted: number
}
export interface MongoIndex {
  name: string
  keys: string[]
  unique: boolean
  sparse: boolean
  partial: boolean
  ttlSeconds: number | null
  usage: number | null
  usageSince: string | null
}
export interface MongoCollection {
  name: string
  documents: number
  dataSize: number
  storageSize: number
  indexSize: number
  avgObjSize: number
  indexes: MongoIndex[]
  /** Yalnız istatistik okunamazsa false olarak gelir. */
  statsAvailable?: boolean
}
export interface MongoCollectionsRequest {
  db: 'app' | number
  cursor?: string
  limit?: number
}
export interface MongoCollectionsResponse {
  db: string
  nextCursor: string | null
  items: MongoCollection[]
}
export type SlowQueryRange = '1h' | '24h' | '7d' | '30d'
export interface SlowQueriesResponse {
  range: SlowQueryRange
  thresholdMs: number
  since: string
  until: string
  items: Array<{ db: 'app' | 'tenant'; collection: string; op: string; count: number; p95Ms: number | null }>
}

// ---------------------------------------------------------------- B9
export interface CacheMetrics {
  /** Bellek önbelleği pod-yereldir. */
  scope: 'pod'
  pod: string
  hits: number
  misses: number
  keys: number
  sets: number
  evictions: number
  maxKeys: number
  inflight: number
  totals: { hit: number; miss: number; set: number; error: number; skip: number; join: number; evict: number; invalidated: number }
  breakdown: Array<{ name: string; count: number; hit: number; miss: number; set: number; hitRatio: number | null }>
}
export interface FlushCacheFamilyResponse {
  family: string
  removed: number
  scope: 'pod'
  pod: string
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeIntegrationService/getApiHealth': [{ range: ApiHealthRange; integrationCode?: string }, ApiHealthResponse]
    'BackofficeIntegrationService/getResilienceState': [Record<string, never>, ResilienceResponse]
    'IntegrationConfigService/getCatalog': [{ target?: string }, CatalogResponse]
    'IntegrationConfigService/getEffectiveConfig': [{ target: string }, EffectiveConfigResponse]
    'BackofficeInfraService/getRedisStatus': [Record<string, never>, RedisStatus]
    'BackofficeInfraService/getMongoStatus': [Record<string, never>, MongoStatus]
    'BackofficeInfraService/getMongoCollections': [MongoCollectionsRequest, MongoCollectionsResponse]
    'BackofficeInfraService/getSlowQueries': [{ range: SlowQueryRange }, SlowQueriesResponse]
    'BackofficeInfraService/getCacheMetrics': [Record<string, never>, CacheMetrics]
    'BackofficeInfraService/flushCacheFamily': [{ family: string; reason: string }, FlushCacheFamilyResponse]
  }
}

/**
 * Sahte BackofficeIntegrationService (B5/B6), IntegrationConfigService/getCatalog+getEffectiveConfig (B6b/c; motor/entegrasyon
 * hedefleri), BackofficeInfraService (B8a-d, B9). Sızıntı kuralı: ham anahtar, belge içeriği, sorgu değeri, izinsiz DB adı YOK.
 */
import type { CatalogItem, EffectiveValue, MongoCollection } from '../../contract'
import { rng } from '../data'
import { MockHttpError } from '../errors'
import { HOUR, MIN, UNHANDLED, iso, notFound, readLimit, strict, validation, type MockCtx, type MockDomain } from './context'
import { platformCatalog } from './platform'

const CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap']
const PODS = ['api-1', 'api-2', 'worker-1']
const BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000]
export const TARGETS = ['_engine', ...CODES, '_platform']

const T = (tr: string, en: string) => ({ tr, en })
const base = { advanced: false, overridable: true, envLock: null, tenantOverridable: null, since: '2026-09-29', deprecated: null, exposure: null, impact: null, unit: null, safeRange: null }
/** Motor + entegrasyon kataloğu örneği (gerçek anahtar adları backend kataloğundan; metinler kısaltılmış). */
const ENGINE_CATALOG: CatalogItem[] = [
  { ...base, key: 'export.publisher.chunkSize', group: 'export.product', scope: 'engine', type: 'int', unit: 'count', default: 100, safeRange: { min: 1, max: 500 }, danger: 'safe', applies: 'next_cycle', label: T('Gönderim parça boyutu', 'Publish chunk size'), help: T('Bir yayın turunda pazaryerine gönderilen ürün sayısı.', 'Products sent per publish cycle.') },
  { ...base, key: 'export.publisher.concurrency', group: 'export.product', scope: 'engine+integration', type: 'int', unit: 'count', default: { _: 4, trendyol: 2 }, safeRange: { min: 1, max: 16 }, danger: 'caution', applies: 'next_cycle', label: T('Eşzamanlı gönderim', 'Publish concurrency'), help: T('Aynı anda açık gönderim işi sayısı.', 'Concurrent publish jobs.'), impact: T('Yüksek değer pazaryeri hız sınırına takılabilir.', 'High values may hit marketplace rate limits.') },
  { ...base, key: 'import.product.pageSize', group: 'import.product', scope: 'integration', type: 'int', unit: 'count', default: { _: 50, n11: 20 }, safeRange: { min: 10, max: 200 }, danger: 'safe', applies: 'next_cycle', label: T('İçe aktarma sayfa boyutu', 'Import page size'), help: T('Ürün çekerken sayfa başına kayıt.', 'Records per page when importing.') },
  { ...base, key: 'order.sync.intervalMs', group: 'order.sync', scope: 'engine+integration', type: 'duration', unit: 'ms', default: 600_000, safeRange: { min: 60_000, max: 3_600_000 }, danger: 'caution', applies: 'next_cycle', label: T('Sipariş çekme aralığı', 'Order pull interval'), help: T('Pazaryerinden sipariş yoklama sıklığı.', 'How often orders are polled.') },
  { ...base, key: 'order.sync.lookbackHours', group: 'order.sync', scope: 'integration', type: 'int', unit: 'h', default: 48, safeRange: { min: 1, max: 336 }, danger: 'safe', applies: 'next_cycle', label: T('Geriye bakış süresi', 'Lookback window'), help: T('Her turda kaç saat geriye bakılacağı.', 'Hours to look back per cycle.') },
  { ...base, key: 'stock.publish.debounceMs', group: 'stock', scope: 'engine', type: 'duration', unit: 'ms', default: 2000, safeRange: { min: 0, max: 60_000 }, danger: 'safe', applies: 'immediate', label: T('Stok yayını bekletme', 'Stock publish debounce'), help: T('Ardışık stok değişikliklerini birleştirme süresi.', 'Window to coalesce stock changes.') },
  { ...base, key: 'resilience.circuit.failureThreshold', group: 'resilience', scope: 'engine+integration', type: 'int', unit: 'count', default: 5, safeRange: { min: 2, max: 50 }, danger: 'caution', applies: 'immediate', label: T('Devre kesici eşiği', 'Circuit breaker threshold'), help: T('Devreyi açan ardışık hata sayısı.', 'Consecutive failures that open the circuit.') },
  { ...base, key: 'resilience.circuit.cooldownMs', group: 'resilience', scope: 'engine+integration', type: 'duration', unit: 'ms', default: 30_000, safeRange: { min: 5000, max: 600_000 }, danger: 'safe', applies: 'immediate', label: T('Devre bekleme süresi', 'Circuit cooldown'), help: T('Açık devrenin yarı açığa geçme süresi.', 'Time before half-open.') },
  { ...base, key: 'resilience.rate.perMin', group: 'resilience', scope: 'integration', type: 'int', unit: 'perMin', default: { _: 120, trendyol: 300, hepsiburada: 200 }, safeRange: { min: 10, max: 2000 }, danger: 'dangerous', applies: 'immediate', label: T('Dakikalık istek bütçesi', 'Requests per minute budget'), help: T('Tenant başına taban istek hızı.', 'Base request rate per tenant.'), impact: T('Pazaryeri sözleşme sınırını aşmak hesabın kapatılmasına yol açabilir.', 'Exceeding marketplace limits may get accounts blocked.') },
  { ...base, key: 'endpoints.baseUrl', group: 'endpoints', scope: 'integration', type: 'host', default: { _: '' }, danger: 'dangerous', applies: 'restart', overridable: false, label: T('API taban adresi', 'API base URL'), help: T('Dış servis kök adresi (salt okunur).', 'External service base (read-only).') },
  { ...base, key: 'mock.enabled', group: 'mock', scope: 'integration', type: 'bool', default: false, danger: 'dangerous', applies: 'restart', envLock: 'TRENDYOL_MOCK', label: T('Mock kip', 'Mock mode'), help: T('Gerçek API yerine yerel sahte sunucu.', 'Use local mock server instead of real API.') },
  { ...base, key: 'cache.categoryTree.ttlMs', group: 'cache', scope: 'engine', type: 'duration', unit: 'ms', default: 3_600_000, safeRange: { min: 60_000, max: 86_400_000 }, danger: 'safe', applies: 'immediate', advanced: true, label: T('Kategori ağacı önbelleği', 'Category tree cache TTL'), help: T('Pazaryeri kategori ağacının bellekte tutulma süresi.', 'How long category trees stay cached.') },
]
export const CATALOG_VERSION = '2026-09-30.b3'

function applicable(target: string): CatalogItem[] {
  if (target === '_platform') return platformCatalog()
  if (target === '_engine') return ENGINE_CATALOG.filter((c) => c.scope !== 'integration')
  return ENGINE_CATALOG.filter((c) => c.scope !== 'engine')
}

const COLLECTIONS_APP = ['AuditLogs', 'BillingEvents', 'Clients', 'DeadLetterQueue', 'ErrorEvents', 'ExportSignals', 'ImportJobs', 'IntegrationCallMetrics', 'IntegrationConfigHeads', 'IntegrationConfigRevisions', 'JobRuns', 'JobState', 'LogEvents', 'MetricRollups', 'Plans', 'QueueMetrics', 'Subscriptions', 'Users', 'AdminMfa', 'Menus', 'Notifications', 'NotificationDeliveries', 'Tickets', 'TicketMessages', 'Announcements', 'Sessions', 'IdempotencyKeys', 'WebhookEvents', 'ComplianceFindings', 'IntegrationDescriptors']
const COLLECTIONS_TENANT = ['Orders', 'OrderLines', 'Products', 'Variants', 'Categories', 'CategoryMappings', 'Brands', 'StockMovements', 'Claims', 'Questions', 'Invoices', 'Settings']
/** CLAUDE.md kural 2 izinli listesiyle kesişen tenant DB'leri: entegrasyonikClient_1, entegrasyonik_client_2/_24/_25. */
const ALLOWED_TENANTS = [1, 2, 24, 25]

export function createInfraMock(t0: number): MockDomain {
    const cacheFamilies = [
    { name: 'orders.OrderSvc.list', count: 12, hit: 540, miss: 61, set: 70 },
    { name: 'catalog.CategorySvc.tree', count: 6, hit: 1210, miss: 14, set: 14 },
    { name: 'catalog.BrandSvc.search', count: 31, hit: 220, miss: 180, set: 190 },
    { name: 'integration.DescriptorSvc.get', count: 6, hit: 3400, miss: 6, set: 6 },
    { name: 'users.ProfileSvc.me', count: 44, hit: 880, miss: 120, set: 122 },
    { name: 'billing.PlanSvc.list', count: 1, hit: 96, miss: 1, set: 1 },
  ]

  function collections(db: 'app' | number): MongoCollection[] {
    const names = db === 'app' ? COLLECTIONS_APP : COLLECTIONS_TENANT
    const rr = rng(typeof db === 'number' ? db * 31 : 7)
    return [...names].sort().map((name) => {
      const docs = Math.floor(rr() * (name === 'LogEvents' || name === 'Orders' ? 400_000 : 40_000))
      const avg = 300 + Math.floor(rr() * 1500)
      const idx = [
        { name: '_id_', keys: ['_id:1'], unique: true, sparse: false, partial: false, ttlSeconds: null, usage: Math.floor(rr() * 90_000), usageSince: iso(t0 - 29 * 24 * HOUR) },
        ...(rr() > 0.3 ? [{ name: 'status_1_updatedAt_-1', keys: ['status:1', 'updatedAt:-1'], unique: false, sparse: false, partial: false, ttlSeconds: null, usage: Math.floor(rr() * 12_000), usageSince: iso(t0 - 29 * 24 * HOUR) }] : []),
        ...(name === 'LogEvents' || name === 'AuditLogs' || name === 'IdempotencyKeys' ? [{ name: 'expAt_1', keys: ['expAt:1'], unique: false, sparse: false, partial: false, ttlSeconds: 0, usage: 0, usageSince: iso(t0 - 29 * 24 * HOUR) }] : []),
        ...(rr() > 0.75 ? [{ name: 'tenantId_1_lockedBy_1', keys: ['tenantId:1', 'lockedBy:1'], unique: false, sparse: true, partial: true, ttlSeconds: null, usage: rr() > 0.5 ? 0 : null, usageSince: null }] : []),
      ]
      return {
        name,
        documents: docs,
        dataSize: docs * avg,
        storageSize: Math.floor(docs * avg * 0.45),
        indexSize: Math.floor(docs * 64 * idx.length),
        avgObjSize: avg,
        indexes: idx,
      }
    })
  }

  return {
    handle(op, body, ctx) {
      switch (op) {
        case 'BackofficeIntegrationService/getApiHealth': {
          strict(body, ['range', 'integrationCode'])
          const range = String(body.range)
          if (!['1h', '24h', '7d'].includes(range)) throw validation('range', '1h|24h|7d')
          const span = range === '1h' ? HOUR : range === '24h' ? 24 * HOUR : 7 * 24 * HOUR
          const mult = range === '1h' ? 1 / 24 : range === '7d' ? 7 : 1
          const items = CODES.filter((c) => !body.integrationCode || c === body.integrationCode).map((code) => {
            const total = Math.round([1200, 860, 420, 260, 180, 90][CODES.indexOf(code)] * mult)
            const errs = [
              { code: 'UNAVAILABLE', count: Math.round([20, 4, 38, 2, 0, 1][CODES.indexOf(code)] * mult) },
              { code: 'RATE_LIMITED', count: Math.round([10, 14, 0, 1, 0, 0][CODES.indexOf(code)] * mult) },
              { code: 'AUTH', count: Math.round([0, 6, 0, 0, 1, 0][CODES.indexOf(code)] * mult) },
              { code: 'UNKNOWN', count: Math.round([2, 0, 3, 0, 0, 0][CODES.indexOf(code)] * mult) },
            ].filter((e) => e.count > 0)
            const errors = errs.reduce((s, e) => s + e.count, 0)
            return {
              integrationCode: code,
              total,
              errors,
              errorRate: total ? errors / total : null,
              errorsByCode: errs.sort((a, b) => b.count - a.count).map((e) => ({ ...e, rate: total ? e.count / total : 0 })),
              p95Ms: code === 'n11' ? null : BUCKETS[[4, 3, 8, 3, 2, 5][CODES.indexOf(code)]],
              affectedTenants: errors ? Math.min(12, 1 + Math.floor(errors / 8)) : 0,
            }
          }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total)
          return { range, since: iso(ctx.now - span), until: iso(ctx.now), items }
        }
        case 'BackofficeIntegrationService/getResilienceState': {
          strict(body, [])
          if (ctx.degraded) throw new MockHttpError(503, 'INFRA_UNAVAILABLE', 'Altyapı şu an okunamıyor.')
          const observed = (p: number) => iso(ctx.now - (5 + p * 11) * 1000)
          return {
            pods: PODS.map((pod, p) => ({ pod, observedAt: observed(p), engineIntake: 'on' })),
            items: CODES.map((code, c) => ({
              integrationCode: code,
              pods: PODS.map((pod, p) => ({
                pod,
                observedAt: observed(p),
                circuits: code === 'n11' ? { closed: 9 - p, open: 2 + (p === 2 ? 1 : 0), half_open: p === 1 ? 1 : 0 } : { closed: 12 - c, open: 0, half_open: 0 },
                rate: code === 'trendyol' ? { limited: 2 - (p === 2 ? 2 : 0), tenants: 13, minRatio: p === 2 ? 1 : 0.5 } : code === 'hepsiburada' ? { limited: p === 0 ? 1 : 0, tenants: 9, minRatio: p === 0 ? 0.75 : 1 } : { limited: 0, tenants: 6 - Math.min(c, 5), minRatio: c > 3 ? null : 1 },
                lastOpenedAt: code === 'n11' ? iso(ctx.now - (2 + p) * MIN) : code === 'trendyol' ? iso(ctx.now - 26 * HOUR) : null,
                // Podlar arası sapma örneği: n11'de biri hâlâ 'drain'.
                intake: code === 'n11' ? (p === 2 ? 'on' : 'drain') : 'on',
              })),
            })),
          }
        }
        case 'IntegrationConfigService/getCatalog': {
          strict(body, ['target'])
          if (body.target !== undefined && !TARGETS.includes(String(body.target))) throw notFound()
          const items = body.target ? applicable(String(body.target)) : [...ENGINE_CATALOG, ...platformCatalog()]
          return { catalogVersion: CATALOG_VERSION, items }
        }
        case 'IntegrationConfigService/getEffectiveConfig': {
          strict(body, ['target'])
          const target = String(body.target ?? '')
          if (target === '_platform') return UNHANDLED // platform modülü
          if (!TARGETS.includes(target)) throw notFound()
          const values: EffectiveValue[] = applicable(target).map((c) => {
            const d = c.default as unknown
            const perInt = d && typeof d === 'object' && '_' in (d as Record<string, unknown>) ? (d as Record<string, unknown>) : null
            const code = target.startsWith('_') ? '_' : target
            const value = perInt ? (perInt[code] ?? perInt._) : d
            if (c.envLock && target === 'trendyol') return { key: c.key, value: false, source: 'env', envVar: c.envLock }
            if (c.key === 'order.sync.intervalMs' && target === 'n11') return { key: c.key, value: 900_000, source: 'platform', revision: 4 }
            if (c.key === 'export.publisher.chunkSize') return { key: c.key, value: 80, source: 'platform', revision: 7 }
            if (c.key === 'endpoints.baseUrl') return { key: c.key, value: `https://api.${code === '_' ? 'ornek' : code}.example`, source: 'legacy' }
            return { key: c.key, value, source: 'default' }
          })
          return { target, publishedVersion: target === 'n11' ? 4 : target === '_engine' ? 7 : 0, catalogVersion: CATALOG_VERSION, values }
        }
        case 'BackofficeInfraService/getRedisStatus':
          strict(body, [])
          if (ctx.degraded) throw new MockHttpError(503, 'INFRA_UNAVAILABLE', 'Altyapı şu an okunamıyor.')
          return {
            server: { version: '7.2.4', uptimeSeconds: 1_209_600 },
            memory: { usedBytes: 40_067_072, peakBytes: 61_865_984, maxBytes: 268_435_456, fragmentationRatio: 1.12, evictionPolicy: 'noeviction' },
            clients: { connected: 14, blocked: 2 },
            stats: { opsPerSec: 35, keyspaceHits: 918_220, keyspaceMisses: 40_118, expiredKeys: 12_904, evictedKeys: 0 },
            keyspace: [{ db: 'db0', keys: 1532, expires: 318 }],
            keyFamilies: { sampled: 1532, truncated: false, items: [
              { family: 'bull:order-sync-queue', count: 911 }, { family: 'lock', count: 212 }, { family: 'rl', count: 188 }, { family: 'session', count: 131 },
              { family: 'imp', count: 1 }, { family: 'resilience', count: 3 }, { family: 'other', count: 86 },
            ] },
            slowlog: [
              { command: 'SMEMBERS', durationMicros: 15_200, at: iso(ctx.now - 42 * MIN) },
              { command: 'EVALSHA', durationMicros: 11_040, at: iso(ctx.now - 3 * HOUR) },
              { command: 'ZRANGEBYSCORE', durationMicros: 10_310, at: iso(ctx.now - 7 * HOUR) },
            ],
          }
        case 'BackofficeInfraService/getMongoStatus':
          strict(body, [])
          return {
            server: {
              version: '8.0.4', uptimeSeconds: 2_592_000,
              connections: { current: 34, available: 766, totalCreated: 4120 },
              opcounters: { insert: 1_204_331, query: 9_880_120, update: 3_302_551, delete: 88_120, getmore: 410_020, command: 12_110_902 },
              cache: { usedBytes: 1_288_490_188, maxBytes: 2_147_483_648, dirtyBytes: 12_582_912, fillRatio: 0.6 },
            },
            pools: { appPoolSize: 20, openTenantHandles: 3 },
            databases: [
              { scope: 'app', label: 'app', available: true, collections: COLLECTIONS_APP.length, objects: 2_410_003, dataSize: 1_932_735_283, storageSize: 804_257_792, indexes: 71, indexSize: 187_695_104 },
              ...ALLOWED_TENANTS.map((n, i) => (i === 3
                ? { scope: 'tenant' as const, tenantId: n, label: `tenant #${n}`, available: false }
                : { scope: 'tenant' as const, tenantId: n, label: `tenant #${n}`, available: true, collections: COLLECTIONS_TENANT.length, objects: 120_000 + i * 90_000, dataSize: 210_000_000 + i * 70_000_000, storageSize: 90_000_000 + i * 30_000_000, indexes: 30 + i, indexSize: 22_000_000 + i * 4_000_000 })),
            ],
            skippedNotAllowlisted: ctx.clients.length,
          }
        case 'BackofficeInfraService/getMongoCollections': {
          strict(body, ['db', 'cursor', 'limit'])
          const db = body.db === 'app' ? 'app' : Number(body.db)
          if (db !== 'app' && (!Number.isInteger(db) || db < 1)) throw validation('db', "'app' ya da tenant numarası")
          if (db !== 'app' && !ALLOWED_TENANTS.slice(0, 3).includes(db)) throw notFound()
          const all = collections(db)
          const limit = readLimit(body)
          // İmleç = son koleksiyon adı (sözleşme); burada opak değil, adın kendisi.
          const after = body.cursor === undefined ? null : String(body.cursor)
          if (after !== null && !all.some((c) => c.name === after)) throw validation('cursor', 'geçersiz imleç')
          const start = after === null ? 0 : all.findIndex((c) => c.name === after) + 1
          const items = all.slice(start, start + limit)
          return { db: db === 'app' ? 'app' : `tenant #${db}`, nextCursor: start + limit < all.length ? items[items.length - 1].name : null, items }
        }
        case 'BackofficeInfraService/getSlowQueries': {
          strict(body, ['range'])
          const range = String(body.range)
          if (!['1h', '24h', '7d', '30d'].includes(range)) throw validation('range', '1h|24h|7d|30d')
          const span = { '1h': HOUR, '24h': 24 * HOUR, '7d': 7 * 24 * HOUR, '30d': 30 * 24 * HOUR }[range]!
          if (range === '30d' && ctx.degraded) throw new MockHttpError(504, 'QUERY_TIMEOUT', 'Sorgu süre sınırını aştı.')
          const m = { '1h': 0.05, '24h': 1, '7d': 6, '30d': 22 }[range]!
          const items = [
            { db: 'tenant', collection: 'orders', op: 'find', count: 42, p95Ms: 500 },
            { db: 'tenant', collection: 'products', op: 'aggregate', count: 18, p95Ms: 2500 },
            { db: 'app', collection: 'logevents', op: 'find', count: 11, p95Ms: 1000 },
            { db: 'app', collection: 'auditlogs', op: 'count', count: 6, p95Ms: 250 },
            { db: 'tenant', collection: 'stockmovements', op: 'update', count: 3, p95Ms: null },
          ].map((x) => ({ ...x, count: Math.round(x.count * m) })).filter((x) => x.count > 0)
          return { range, thresholdMs: 200, since: iso(ctx.now - span), until: iso(ctx.now), items }
        }
        case 'BackofficeInfraService/getCacheMetrics': {
          strict(body, [])
          const t = cacheFamilies.reduce((s, f) => ({ hit: s.hit + f.hit, miss: s.miss + f.miss, set: s.set + f.set, keys: s.keys + f.count }), { hit: 0, miss: 0, set: 0, keys: 0 })
          return {
            scope: 'pod', pod: 'api-1', hits: t.hit, misses: t.miss, keys: t.keys, sets: t.set, evictions: 0, maxKeys: 5000, inflight: 1,
            totals: { hit: t.hit, miss: t.miss, set: t.set, error: 0, skip: 4, join: 9, evict: 0, invalidated: 21 },
            breakdown: cacheFamilies.map((f) => ({ ...f, hitRatio: f.hit + f.miss ? f.hit / (f.hit + f.miss) : null })),
          }
        }
        case 'BackofficeInfraService/flushCacheFamily': {
          strict(body, ['family', 'reason'])
          if (typeof body.family !== 'string' || !/^[A-Za-z0-9_.-]{1,120}$/.test(body.family)) throw validation('family', 'geçersiz aile adı')
          const fam = cacheFamilies.find((f) => f.name === body.family)
          if (!fam) throw notFound()
          const removed = fam.count
          fam.count = 0
          return { family: fam.name, removed, scope: 'pod', pod: 'api-1' }
        }
      }
      return UNHANDLED
    },
  }
}




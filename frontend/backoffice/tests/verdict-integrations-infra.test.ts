import { describe, expect, it, vi } from 'vitest'
import type { ApiHealthItem, CacheMetrics, MongoStatus, RedisStatus, ResilienceResponse, SlowQueriesResponse } from '@bo/api/contract'
import { integrationsVerdict, type IntegrationsVerdictInput } from '@bo/views/integrations/integrationsVerdict'
import { infraVerdict, type InfraVerdictInput } from '@bo/views/infra/infraVerdict'
import { cacheVerdict } from '@bo/views/infra/cacheVerdict'

const ids = (v: { attention: Array<{ id: string }> }) => v.attention.map((a) => a.id)
const hi = (o: Partial<ApiHealthItem> = {}): ApiHealthItem => ({ integrationCode: 'trendyol', total: 1000, errors: 2, errorRate: 0.002, errorsByCode: [], p95Ms: 500, affectedTenants: 1, ...o })
const cell = (o: Record<string, unknown> = {}) => ({ pod: 'p1', observedAt: '', circuits: { closed: 5, open: 0, half_open: 0 }, rate: { limited: 0, tenants: 5, minRatio: 1 }, lastOpenedAt: null, intake: 'on', ...o }) as ResilienceResponse['items'][0]['pods'][0]
const res = (cells: Array<ResilienceResponse['items'][0]['pods'][0]> = [cell()], code = 'trendyol', engine: 'on' | 'off' = 'on'): ResilienceResponse => ({ pods: [{ pod: 'p1', observedAt: '', engineIntake: engine }], items: [{ integrationCode: code, pods: cells }] })

function integ(o: Partial<IntegrationsVerdictInput> = {}) {
  const retry = vi.fn()
  const v = integrationsVerdict({ health: { range: '24h', since: '', until: '', items: [hi()] }, resilience: res(), failed: { health: false, resilience: false }, retry, ...o })
  return { v, retry }
}

describe('entegrasyonlar hükmü', () => {
  it('sakin', () => {
    const { v } = integ()
    expect(v.tone).toBe('success')
    expect(v.attention).toEqual([])
    expect(v.summary).toMatch(/devre kesiciler kapalı/)
  })
  it('hata oranı %5 üstü kırmızı, %1-5 sarı; küçük örneklem yok sayılır', () => {
    expect(integ({ health: { range: '24h', since: '', until: '', items: [hi({ errorRate: 0.08 })] } }).v.attention[0]).toMatchObject({ id: 'error-rate-high', tone: 'error' })
    expect(integ({ health: { range: '24h', since: '', until: '', items: [hi({ errorRate: 0.02 })] } }).v.attention[0]).toMatchObject({ id: 'error-rate-warn', tone: 'warning' })
    expect(ids(integ({ health: { range: '24h', since: '', until: '', items: [hi({ total: 5, errorRate: 0.8 })] } }).v)).toEqual([])
  })
  it('yüksek gecikme sarı; null = 30 sn üstü', () => {
    const { v } = integ({ health: { range: '24h', since: '', until: '', items: [hi({ p95Ms: null })] } })
    expect(v.attention[0]).toMatchObject({ id: 'latency', tone: 'warning' })
    expect(v.attention[0].title).toContain('30 sn')
  })
  it('devre kesici açık kırmızı, sekmeye bağlı; eylem loglara', () => {
    const { v } = integ({ resilience: res([cell({ circuits: { closed: 3, open: 2, half_open: 0 } })], 'n11') })
    expect(v.tone).toBe('error')
    expect(v.attention[0]).toMatchObject({ id: 'circuit-open', cta: 'Devre kesicileri aç' })
    expect(v.attention[0].title).toContain('N11')
    expect(v.attention[0].to).toEqual({ query: { sekme: 'dayaniklilik' } })
    expect(v.actions[0]).toMatchObject({ id: 'resilience', cta: 'Devre kesicileri aç' })
    expect(v.actions.find((a) => a.id === 'logs')?.to).toEqual({ path: '/loglar', query: { category: 'integration', level: 'fatal,error' } })
  })
  it('alım kapalı kırmızı; boşaltılıyor + sapma sarı; hız bütçesi sarı', () => {
    expect(ids(integ({ resilience: res([cell({ intake: 'off' })]) }).v)).toContain('intake-off')
    expect(ids(integ({ resilience: res([cell(), cell({ pod: 'p2', intake: 'drain' })]) }).v)).toEqual(['intake-drift'])
    const lim = integ({ resilience: res([cell({ rate: { limited: 3, tenants: 5, minRatio: 0.5 } })]) }).v
    expect(lim.tone).toBe('warning')
    expect(lim.attention[0].id).toBe('rate-limited')
    expect(ids(integ({ resilience: res([cell()], 'trendyol', 'off') }).v)).toContain('intake-off')
  })
  it('okunamadı: sağlıklı demez, tekrar dene', () => {
    const { v, retry } = integ({ health: null, failed: { health: true, resilience: false } })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].id).toBe('unreadable-health')
    v.attention[0].onSelect!()
    expect(retry).toHaveBeenCalled()
    expect(integ({ health: null, resilience: null, failed: { health: true, resilience: true } }).v.summary).toMatch(/okunamadı/)
  })
})

const redis = (o: Partial<RedisStatus['memory']> = {}, blocked = 0): RedisStatus => ({
  server: { version: '7', uptimeSeconds: 1 },
  memory: { usedBytes: 100, peakBytes: 100, maxBytes: 1000, fragmentationRatio: 1, evictionPolicy: 'noeviction', ...o },
  clients: { connected: 5, blocked },
  stats: { opsPerSec: 1, keyspaceHits: 1, keyspaceMisses: 1, expiredKeys: 0, evictedKeys: 0 },
  keyspace: [],
  keyFamilies: { sampled: 0, truncated: false, items: [] },
  slowlog: [],
})
const mongo = (conn = 34, fill: number | null = 0.5, dbs: boolean[] = [true]): MongoStatus => ({
  server: { version: '8', uptimeSeconds: 1, connections: { current: conn, available: 100 - conn, totalCreated: 1 }, opcounters: { insert: 0, query: 0, update: 0, delete: 0, getmore: 0, command: 0 }, cache: { usedBytes: 1, maxBytes: 2, dirtyBytes: 0, fillRatio: fill } },
  pools: { appPoolSize: 1, openTenantHandles: 1 },
  databases: dbs.map((available, i) => ({ scope: 'tenant' as const, label: `tenant #${i + 1}`, available })),
  skippedNotAllowlisted: 3,
})
const slow = (count = 5): SlowQueriesResponse => ({ range: '24h', thresholdMs: 200, since: '', until: '', items: [{ db: 'tenant', collection: 'orders', op: 'find', count, p95Ms: 500 }] })

function infra(o: Partial<InfraVerdictInput> = {}) {
  const v = infraVerdict({ redis: redis(), mongo: mongo(), slow: slow(), failed: { redis: false, mongo: false, slow: false }, down: { redis: false, mongo: false }, retry: vi.fn(), ...o })
  return { v }
}

describe('altyapı hükmü', () => {
  it('sakin', () => {
    const { v } = infra()
    expect(v.tone).toBe('success')
    expect(v.attention).toEqual([])
  })
  it('Redis erişilemez kırmızı ve Motor kuyruklarına bağlı', () => {
    const { v } = infra({ redis: null, failed: { redis: true, mongo: false, slow: false }, down: { redis: true, mongo: false } })
    expect(v.tone).toBe('error')
    expect(v.attention[0]).toMatchObject({ id: 'redis-down', to: { path: '/motor' } })
    expect(v.actions.map((a) => a.id)).toEqual(expect.arrayContaining(['queues', 'redis', 'logs']))
  })
  it('Mongo erişilemez kırmızı; 503 dışı hata okunamadı sarı', () => {
    expect(infra({ mongo: null, failed: { redis: false, mongo: true, slow: false }, down: { redis: false, mongo: true } }).v.attention[0]).toMatchObject({ id: 'mongo-down', tone: 'error' })
    expect(infra({ mongo: null, failed: { redis: false, mongo: true, slow: false } }).v.attention[0]).toMatchObject({ id: 'unreadable-mongo', tone: 'warning' })
  })
  it('Redis bellek baskısı: %75 sarı, %90 kırmızı; engelli istemci olağan', () => {
    expect(infra({ redis: redis({ usedBytes: 800 }) }).v.attention[0]).toMatchObject({ id: 'redis-memory', tone: 'warning' })
    expect(infra({ redis: redis({ usedBytes: 950 }) }).v.tone).toBe('error')
    expect(infra({ redis: redis({}, 2) }).v.tone).toBe('success') // engelli istemci kuyruk işçilerinde olağan
  })
  it('Mongo bağlantı/önbellek/okunamayan DB ve yavaş sorgu sarı, sekmeye bağlı', () => {
    const { v } = infra({ mongo: mongo(90, 0.95, [true, false]), slow: slow(30) })
    expect(ids(v)).toEqual(['mongo-connections', 'mongo-cache', 'mongo-dbs', 'slow-queries'])
    expect(v.tone).toBe('warning')
    expect(v.attention[3].to).toEqual({ query: { sekme: 'yavas' } })
    expect(v.attention.every((a) => a.to && a.impact && a.advice && a.cta)).toBe(true)
    expect(v.actions[0].cta).toBeTruthy()
  })
  it('okunamadı', () => {
    const { v } = infra({ redis: null, mongo: null, slow: null, failed: { redis: true, mongo: true, slow: true } })
    expect(v.summary).toMatch(/okunamadı/)
    expect(v.tone).toBe('warning')
  })
})

const cache = (o: Partial<CacheMetrics> = {}): CacheMetrics => ({
  scope: 'pod', pod: 'api-1', hits: 900, misses: 100, keys: 100, sets: 10, evictions: 0, maxKeys: 5000, inflight: 0,
  totals: { hit: 900, miss: 100, set: 10, error: 0, skip: 0, join: 0, evict: 0, invalidated: 0 },
  breakdown: [{ name: 'catalog', count: 60, hit: 800, miss: 20, set: 5, hitRatio: 0.97 }, { name: 'prices', count: 40, hit: 100, miss: 80, set: 5, hitRatio: 0.55 }],
  ...o,
})

describe('önbellek hükmü', () => {
  const run = (data: CacheMetrics | null, failed = false) => {
    const flush = vi.fn()
    return { v: cacheVerdict({ data, failed, retry: vi.fn(), flush }), flush }
  }
  it('sakin; az örnekte oran yorumlanmaz', () => {
    expect(run(cache()).v.tone).toBe('success')
    expect(run(cache()).v.checks?.length).toBeGreaterThan(0)
    expect(run(cache({ hits: 1, misses: 5 })).v.summary).toMatch(/yeterli sorgu yok/)
  })
  it('düşük isabet sarı; en zayıf aileyi boşaltma eylemi guarded, danger değil', () => {
    const { v, flush } = run(cache({ hits: 400, misses: 400 }))
    expect(v.tone).toBe('warning')
    expect(v.attention[0].id).toBe('hit-ratio')
    expect(v.attention[0].impact).toContain('prices')
    expect(v.attention[0].to).toMatchObject({ hash: '#bo-cache-families' })
    const a = v.actions.find((x) => x.id === 'flush')!
    expect(a.guarded).toBe(true)
    expect(a.danger).toBeFalsy()
    a.onSelect!()
    expect(flush).toHaveBeenCalledWith('prices')
  })
  it('doluluk ve hata sarı; okunamadı', () => {
    expect(ids(run(cache({ keys: 4800 })).v)).toEqual(['keys-full'])
    expect(run(cache({ totals: { ...cache().totals, error: 3 } })).v.attention[0].to).toMatchObject({ path: '/loglar' })
    expect(run(null, true).v.attention[0].id).toBe('unreadable-cache')
  })
})

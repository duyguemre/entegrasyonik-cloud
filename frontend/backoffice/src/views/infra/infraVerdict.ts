/** Redis ve MongoDB — sayfa hükmü (K51). Saf; sayfa salt okunur olduğundan eylemler bağlantı ağırlıklıdır. */
import type { RouteLocationRaw } from 'vue-router'
import type { MongoStatus, RedisStatus, SlowQueriesResponse } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatBytes, formatCount } from '@bo/utils/units'

/** Redis belleği sınıra bu oranda yaklaşırsa sarı (bellek panelindeki eşikle aynı). */
export const REDIS_MEM_WARN = 0.75
/** Bu oranda kırmızı: tahliye/yazma reddi yakındır. */
export const REDIS_MEM_ERROR = 0.9
/** Mongo bağlantı havuzu doluluğu bu oranı aşarsa sarı. */
export const MONGO_CONN_WARN = 0.8
/** WiredTiger önbellek doluluğu bu oranı aşarsa sarı. */
export const MONGO_CACHE_WARN = 0.9
/** 24 saatte bu kadar yavaş sorgu birikirse sarı (tekil birkaç yavaş sorgu olağan sayılır). */
export const SLOW_QUERY_WARN = 20

export type InfraTab = 'redis' | 'mongodb' | 'yavas'
/** Aynı sayfada sekme — göreli konum. */
export const infraTab = (tab: InfraTab): RouteLocationRaw => ({ query: tab === 'redis' ? {} : { sekme: tab } })
const LOGS: RouteLocationRaw = { path: '/loglar', query: { category: 'platform', level: 'fatal,error' } }

export interface InfraVerdictInput {
  redis: RedisStatus | null
  mongo: MongoStatus | null
  slow: SlowQueriesResponse | null
  failed: { redis: boolean; mongo: boolean; slow: boolean }
  /** Okuma 503 ile başarısız → servis erişilemez (kırmızı); diğer hatalar "okunamadı" (sarı). */
  down: { redis: boolean; mongo: boolean }
  retry: () => void
}

export function infraVerdict(i: InfraVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []

  if (i.down.redis)
    attention.push({ id: 'redis-down', tone: 'error', title: "Redis'e ulaşılamıyor", impact: 'Sipariş kuyruğu işlenemiyor; kilitler ve hız sınırları etkileniyor.', advice: 'Redis hizmetini ve ağ bağlantısını kontrol edin; kuyruk durumuna da bakın.', to: { path: '/motor' }, cta: 'Motor kuyruklarını aç' })
  else if (i.failed.redis) attention.push(unreadable('redis', 'Redis durumu', i.retry))
  if (i.down.mongo)
    attention.push({ id: 'mongo-down', tone: 'error', title: "MongoDB'ye ulaşılamıyor", impact: 'Uygulama verisi okunamıyor; müşteri ekranları ve işlemler etkilenir.', advice: 'Veritabanı hizmetini ve bağlantı bilgisini kontrol edin; platform loglarına bakın.', to: LOGS, cta: 'Platform loglarını aç' })
  else if (i.failed.mongo) attention.push(unreadable('mongo', 'MongoDB durumu', i.retry))
  if (i.failed.slow) attention.push(unreadable('slow', 'Yavaş sorgu verisi', i.retry))

  const r = i.redis
  const ratio = r?.memory.maxBytes && r.memory.usedBytes !== null ? r.memory.usedBytes / r.memory.maxBytes : null
  const memHigh = ratio !== null && ratio >= REDIS_MEM_WARN
  if (r && ratio !== null && memHigh)
    attention.push({
      id: 'redis-memory',
      tone: ratio >= REDIS_MEM_ERROR ? 'error' : 'warning',
      title: `Redis belleği %${Math.round(ratio * 100)} dolu (${formatBytes(r.memory.usedBytes)} / ${formatBytes(r.memory.maxBytes)})`,
      impact: ratio >= REDIS_MEM_ERROR ? 'Sınıra çok yakın; yazmalar reddedilebilir ve kuyruk durabilir.' : `Eşik %${Math.round(REDIS_MEM_WARN * 100)}; büyüme sürerse kuyruk ve kilitler etkilenir.`,
      advice: 'Hangi anahtar ailesinin büyüdüğünü kontrol edin.',
      to: infraTab('redis'),
      cta: 'Redis belleğini aç',
    })

  const m = i.mongo?.server ?? null
  const conn = m ? m.connections.current / Math.max(1, m.connections.current + m.connections.available) : 0
  if (m && conn >= MONGO_CONN_WARN)
    attention.push({ id: 'mongo-connections', tone: 'warning', title: `MongoDB bağlantıları %${Math.round(conn * 100)} dolu (${formatCount(m.connections.current)} / ${formatCount(m.connections.current + m.connections.available)})`, impact: 'Havuz tükenirse istekler beklemeye düşer.', advice: 'Açık müşteri bağlantılarını kontrol edin.', to: infraTab('mongodb'), cta: 'MongoDB bağlantılarını aç' })
  if (m && m.cache.fillRatio !== null && m.cache.fillRatio >= MONGO_CACHE_WARN)
    attention.push({ id: 'mongo-cache', tone: 'warning', title: `MongoDB önbelleği %${Math.round(m.cache.fillRatio * 100)} dolu`, impact: 'Çalışma kümesi belleğe sığmıyor olabilir; sorgular yavaşlar.', advice: 'Yavaş sorguları ve indeks kullanımını kontrol edin.', to: infraTab('yavas'), cta: 'Yavaş sorguları aç' })
  const unreadDbs = (i.mongo?.databases ?? []).filter((d) => !d.available)
  if (unreadDbs.length)
    attention.push({ id: 'mongo-dbs', tone: 'warning', title: `${formatCount(unreadDbs.length)} veritabanının istatistiği alınamadı (${unreadDbs.map((d) => d.label).join(', ')})`, impact: 'İlgili müşterinin veri ekranı etkilenmiş olabilir.', advice: 'Bağlantıyı ve yetkiyi kontrol edin.', to: infraTab('mongodb'), cta: 'Veritabanlarını aç' })

  const slowTotal = (i.slow?.items ?? []).reduce((n, x) => n + x.count, 0)
  const slowHigh = !!i.slow && slowTotal >= SLOW_QUERY_WARN
  if (i.slow && slowHigh) {
    const top = [...i.slow.items].sort((a, b) => b.count - a.count)[0]
    attention.push({ id: 'slow-queries', tone: 'warning', title: `Son 24 saatte ${formatCount(slowTotal)} yavaş sorgu (en çok: ${top.collection} ${top.op})`, impact: `${i.slow.thresholdMs} ms eşiğini aşan sorgular; eşik ${formatCount(SLOW_QUERY_WARN)} sorgu.`, advice: 'Koleksiyon ve işleme göre dökümü kontrol edin; eksik indeks varsa ilgili ekibe iletin.', to: infraTab('yavas'), cta: 'Yavaş sorguları aç' })
  }

  // Önem sırası: ilki "Önerilen ilk adım" kartı olur.
  if (i.down.redis) actions.push({ id: 'queues', label: 'Motor kuyruklarının durumunu kontrol edin', detail: 'Redis kesintisi kuyruk işlemesini durdurur.', cta: 'Motor kuyruklarını aç', icon: 'mdi-tray-full', to: { path: '/motor' } })
  if (i.down.mongo) actions.push({ id: 'logs-mongo', label: 'Platform hatalarını loglarda açın', detail: 'Bağlantı hatasının zamanı ve nedeni.', cta: 'Platform loglarını aç', icon: 'mdi-pulse', to: LOGS })
  if (memHigh || i.failed.redis) actions.push({ id: 'redis', label: 'Redis belleğini inceleyin', detail: 'Bellek, anahtar aileleri ve yavaş komutlar — salt okuma.', cta: 'Redis durumunu aç', icon: 'mdi-memory', to: infraTab('redis') })
  if (conn >= MONGO_CONN_WARN || unreadDbs.length || i.failed.mongo) actions.push({ id: 'mongo', label: 'MongoDB bağlantı ve veritabanlarını inceleyin', detail: 'Bağlantı, önbellek ve boyutlar — salt okuma.', cta: 'MongoDB durumunu aç', icon: 'mdi-database-outline', to: infraTab('mongodb') })
  if (slowHigh) actions.push({ id: 'slow', label: 'Yavaş sorguları inceleyin', detail: 'Koleksiyon ve işleme göre döküm.', cta: 'Yavaş sorguları aç', icon: 'mdi-timer-alert-outline', to: infraTab('yavas') })
  if (attention.length && !i.down.mongo) actions.push({ id: 'logs', label: 'Platform hatalarını loglarda açın', icon: 'mdi-pulse', to: LOGS })

  const unknown = i.failed.redis && i.failed.mongo && i.failed.slow
  return buildVerdict({
    attention,
    actions,
    calm: { summary: 'Redis ve MongoDB erişilebilir; bellek, bağlantı ve yavaş sorgu değerleri eşiklerin altında.' },
    checks: ['Redis erişimi ve belleği', 'MongoDB erişimi ve bağlantıları', 'Veritabanı istatistikleri', 'Yavaş sorgular'],
    okTitle: 'Altyapıda müdahale gereken bir şey yok',
    busy: ({ errors, total, top }) =>
      unknown
        ? 'Altyapı durumu okunamadı — hüküm verilemiyor.'
        : errors
          ? `${errors === 1 ? 'Bir konu' : `${errors} konu`} şimdi müdahale istiyor: ${top.title}.`
          : `${total === 1 ? 'Bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${top.title}.`,
  })
}

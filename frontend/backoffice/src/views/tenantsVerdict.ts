/**
 * Müşteri listesi — sayfa hükmü (K51). Saf: girdi `getClients` satırları + BE-01 `listTenants` operasyon özeti
 * (açık sorun ~yaklaşık, 24 sa başarısız iş, abonelik durumu), çıktı `PageVerdict`.
 * Operasyon özeti okunamazsa ya da bölümü eksikse (`opsDegraded`) "okunamadı" maddesi yazılır; sıfır gösterip sağlıklı denmez.
 */
import type { RouteLocationRaw } from 'vue-router'
import type { ClientDto } from '@bo/api/contract'
import type { TenantOps, TenantOpsRow, TenantOpsSection } from '@bo/api/contracts/ops'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount } from '@bo/utils/units'

/** Aktif ve kanallı hesapta bu süreyi aşan eşitleme boşluğu "eski" sayılır (satırdaki uyarıyla aynı eşik). */
export const STALE_SYNC_MS = 24 * 3_600_000
/** Eşitlemesi eski hesapların kanallı aktif hesaplara oranı bunu aşarsa sorun müşteriye değil platforma yakındır → kırmızı. */
export const STALE_SHARE_ERROR = 0.5

/** Bir müşterinin 24 saatlik başarısız işi bu sayıya ulaşırsa "şimdi müdahale" (kırmızı); altında izlenmeli (sarı). */
export const FAILED_JOBS_ERROR = 10
/** Bir müşterideki açık sorun grubu (yaklaşık) bu sayıya ulaşırsa kırmızı. */
export const OPEN_ISSUES_ERROR = 3
/** Hüküm en çok bu kadar müşteriyi adıyla öne çıkarır. */
export const TOP_TENANTS = 2
/** Son hata çağrısı bu süre içindeyse müşteri "sorunlu" sayılır (sunucudaki `hasIssues` kuralıyla aynı). */
export const RECENT_ERROR_MS = 24 * 3_600_000

export type TenantSegment = 'all' | 'sorunlu' | 'ACTIVE' | 'PASSIVE' | 'stale' | 'nochannel'
/** URL (`?durum=`) ↔ segment. */
export const SEGMENT_SLUG: Record<TenantSegment, string | undefined> = { all: undefined, sorunlu: 'sorunlu', ACTIVE: 'aktif', PASSIVE: 'pasif', stale: 'eski', nochannel: 'kanalsiz' }
export const SLUG_SEGMENT: Record<string, TenantSegment> = { sorunlu: 'sorunlu', aktif: 'ACTIVE', pasif: 'PASSIVE', eski: 'stale', kanalsiz: 'nochannel' }

/** Sunucudaki `hasIssues:true` kuralı: açık sorun VEYA başarısız iş VEYA son 24 saatte hata çağrısı. */
export const opsHasIssues = (o: TenantOps, now = Date.now()) => o.openIssues > 0 || o.failedJobs24h > 0 || (!!o.lastErrorAt && now - Date.parse(o.lastErrorAt) < RECENT_ERROR_MS)
const problemScore = (o: TenantOps) => o.openIssues + o.failedJobs24h
const isRed = (o: TenantOps) => o.failedJobs24h >= FAILED_JOBS_ERROR || o.openIssues >= OPEN_ISSUES_ERROR
const SECTION_LABEL: Record<TenantOpsSection, string> = { subscriptions: 'Abonelik durumları', openIssues: 'Açık sorun sayıları', failedJobs: 'Başarısız iş sayıları (kuyruk)', lastErrorAt: 'Son hata zamanları' }

export const hasChannels = (c: ClientDto) => !!c.integrations?.length
/** Aktif + kanallı hesapta son başarılı sipariş eşitlemesi yok ya da 24 saatten eski. */
export const isStaleSync = (c: ClientDto, now = Date.now()) =>
  c.status === 'ACTIVE' && hasChannels(c) && (!c.lastSuccessfulOrderSync || now - Date.parse(c.lastSuccessfulOrderSync) > STALE_SYNC_MS)
export const isNoChannel = (c: ClientDto) => c.status === 'ACTIVE' && !hasChannels(c)

export function inSegment(c: ClientDto, seg: TenantSegment, now = Date.now(), opsOf?: (tid: number) => TenantOps | undefined): boolean {
  if (seg === 'all') return true
  if (seg === 'sorunlu') {
    const o = opsOf?.(c.clientId)
    return !!o && opsHasIssues(o, now)
  }
  if (seg === 'stale') return isStaleSync(c, now)
  if (seg === 'nochannel') return isNoChannel(c)
  return c.status === seg
}

export interface TenantsVerdictInput {
  /** Süzgeçsiz tam liste; okunamadıysa null. */
  clients: ClientDto[] | null
  total: number
  failed: boolean
  stale?: boolean
  retry: () => void
  /** Listeyi bir segmente süzen konum (`?durum=`; arama ve sıra korunur) — maddeler aynı sayfada süzgece bağlanır. */
  segmentTo: (seg: TenantSegment) => RouteLocationRaw
  /** BE-01 satırları (süzgeçsiz tam liste). Verilmezse operasyon maddeleri yazılmaz. */
  ops?: TenantOpsRow[] | null
  /** BE-01 `opsDegraded`. */
  opsDegraded?: TenantOpsSection[]
  /** `listTenants` okunamadı. */
  opsFailed?: boolean
  now?: number
}

export function tenantsVerdict(i: TenantsVerdictInput): PageVerdict {
  const now = i.now ?? Date.now()
  const list = i.clients ?? []
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []

  // Operasyon özeti (BE-01): sorunlu müşteriler, abonelikler, okunamayan bölümler.
  const rows = i.ops ?? []
  const degraded = new Set(i.opsDegraded ?? [])
  const problems = rows.filter((r) => opsHasIssues(r.ops, now)).sort((a, b) => problemScore(b.ops) - problemScore(a.ops) || a.tid - b.tid)
  const top = problems.slice(0, TOP_TENANTS)
  for (const r of top) {
    const o = r.ops
    const red = isRed(o)
    const parts = [o.openIssues ? `~${formatCount(o.openIssues)} açık sorun` : '', o.failedJobs24h ? `${formatCount(o.failedJobs24h)} başarısız iş (24 sa)` : ''].filter(Boolean)
    attention.push({
      id: `tenant-${r.tid}`,
      tone: red ? 'error' : 'warning',
      // PageVerdict `tenant` alanını çizmiyor (subjects bekliyor): müşteri adı başlığa da yazılır.
      title: `${r.name}: ${parts.length ? parts.join(', ') : 'son 24 saatte hata aldı'}`,
      impact: o.failedJobs24h >= FAILED_JOBS_ERROR ? 'Başarısız işler birikiyor; müşterinin sipariş ve ürün güncellemeleri gecikebilir.' : o.openIssues >= OPEN_ISSUES_ERROR ? 'Birden çok sorun grubu açık; müşteri tarafında kesinti olabilir.' : 'Sorun sınırlı görünüyor; yine de izleyin.',
      advice: 'Müşteri detayındaki "Şu an" kartından sorunları ve başarısız işleri kontrol edin.',
      to: `/musteriler/${r.tid}`,
      cta: 'Müşteriyi aç',
      since: o.lastErrorAt ?? undefined,
      tenant: { tid: r.tid, name: r.name },
    })
  }
  if (problems.length > TOP_TENANTS)
    attention.push({
      id: 'problem-tenants',
      tone: 'warning',
      title: `${formatCount(problems.length)} müşteride açık sorun ya da başarısız iş var`,
      impact: `Öne çıkan ${formatCount(top.length)} müşteri dışında ${formatCount(problems.length - top.length)} müşteri daha izlenmeli; sayılar yaklaşıktır.`,
      advice: 'Sorunlu müşterileri en çok sorundan başlayarak gözden geçirin.',
      to: i.segmentTo('sorunlu'),
      cta: 'Sorunlu müşterileri aç',
    })
  const suspended = rows.filter((r) => r.ops.subscriptionStatus === 'suspended')
  const pastDue = rows.filter((r) => r.ops.subscriptionStatus === 'past_due')
  if (suspended.length)
    attention.push({ id: 'sub-suspended', tone: 'warning', title: `${formatCount(suspended.length)} abonelik askıda`, impact: 'Bu müşterilerin erişimi kapalı; denemesi bitmiş ya da ödeme alınamamış.', advice: 'Abonelikleri açıp denemeyi uzatmayı ya da müşteriyi ödemeye yönlendirmeyi değerlendirin.', to: { path: '/abonelikler', query: { durum: 'suspended' } }, cta: 'Askıdaki abonelikleri aç' })
  if (pastDue.length)
    attention.push({ id: 'sub-past-due', tone: 'warning', title: `${formatCount(pastDue.length)} abonelikte ödeme gecikti`, impact: 'Tolerans süresi dolarsa abonelik askıya alınır ve müşteri erişimi kapanır.', advice: 'Müşterilere kartlarını güncellemelerini hatırlatın.', to: { path: '/abonelikler', query: { durum: 'past_due' } }, cta: 'Geciken abonelikleri aç' })
  if (i.opsFailed) attention.push(unreadable('ops', 'Müşteri operasyon özeti (sorun, başarısız iş, abonelik)', i.retry))
  else for (const sec of degraded) attention.push(unreadable(`ops-${sec}`, SECTION_LABEL[sec], i.retry))

  const stale = list.filter((c) => isStaleSync(c, now))
  const syncing = list.filter((c) => c.status === 'ACTIVE' && hasChannels(c))
  const widespread = syncing.length > 0 && stale.length / syncing.length > STALE_SHARE_ERROR
  if (stale.length) {
    const oldest = stale.map((c) => c.lastSuccessfulOrderSync).filter((t): t is string => !!t).sort()[0]
    attention.push({
      id: 'stale-sync',
      tone: widespread ? 'error' : 'warning',
      title: `${formatCount(stale.length)} aktif hesapta sipariş eşitlemesi 24 saatten eski`,
      impact: widespread
        ? `Kanallı aktif hesapların %${Math.round((stale.length / syncing.length) * 100)}'inde eşitleme durmuş; müşterilerin siparişleri uygulamaya düşmüyor.`
        : `Kanallı ${formatCount(syncing.length)} aktif hesabın ${formatCount(stale.length)}'inde yeni sipariş görünmüyor olabilir.`,
      advice: widespread ? 'Bu yaygınlık motora ya da pazaryeri bağlantısına işaret eder; önce motoru kontrol edin.' : 'Hesabı açıp kanal durumunu ve sipariş hatalarını kontrol edin.',
      to: i.segmentTo('stale'),
      cta: 'Eşitlemesi eski hesapları aç',
      since: oldest,
    })
  }

  const noChannel = list.filter(isNoChannel)
  if (noChannel.length)
    attention.push({
      id: 'no-channel',
      tone: 'info',
      title: `${formatCount(noChannel.length)} aktif hesapta bağlı kanal yok`,
      impact: 'Bu hesaplarda eşitleme çalışmaz; kurulum tamamlanmamış olabilir.',
      advice: 'Müşterinin kurulumu bırakıp bırakmadığını kontrol edin.',
      to: i.segmentTo('nochannel'),
      cta: 'Kanalsız hesapları aç',
    })

  const passive = list.filter((c) => c.status === 'PASSIVE')
  if (passive.length)
    attention.push({
      id: 'passive',
      tone: 'info',
      title: `${formatCount(passive.length)} hesap pasif`,
      impact: 'Pasif hesaplarda eşitleme ve müşteri girişi kapalıdır; askıda ya da silme bekliyor olabilir.',
      advice: 'Nedenini müşteri detayındaki yaşam döngüsünden kontrol edin.',
      to: i.segmentTo('PASSIVE'),
      cta: 'Pasif hesapları aç',
    })

  if (i.failed) attention.push(unreadable('clients', 'Müşteri listesi', i.retry))
  else if (i.stale) attention.push(unreadable('clients', 'Müşteri listesi', i.retry, true))

  // İlk eylem en önemlisi: yaygın sorunda motor, sonra en sorunlu müşteri, aksi halde eski eşitlemeli hesaplar.
  if (widespread) actions.push({ id: 'engine', label: 'Motor ve kuyrukları aç', detail: 'Kuyruk, takılı kira ve zamanlanmış görev durumu.', icon: 'mdi-engine-outline', to: '/motor' })
  if (top.length) {
    const t = top[0]
    actions.push({ id: 'top-tenant', label: `En sorunlu müşteriyi aç: ${t.name}`, cta: 'Müşteriyi aç', detail: 'Müşteri detayındaki "Şu an" kartı açık sorun, başarısız iş ve uyarıları tek yerde gösterir.', icon: 'mdi-account-alert-outline', to: `/musteriler/${t.tid}` })
    if (problems.length > 1) actions.push({ id: 'problem-list', label: 'Sorunlu müşterileri listele', detail: 'Açık sorun sayısına göre sıralı.', icon: 'mdi-filter-variant', to: i.segmentTo('sorunlu') })
    if (!widespread) actions.push({ id: 'failed-jobs', label: 'Başarısız işleri motorda aç', detail: 'Kuyruktaki başarısız işleri tüm müşteriler için görün.', icon: 'mdi-engine-outline', to: { path: '/motor', query: { sekme: 'basarisiz' } } })
  }
  if (stale.length) {
    actions.push({ id: 'stale-list', label: 'Eşitlemesi eski hesapları listele', detail: 'Her hesabın kanal durumunu müşteri detayından kontrol edin.', icon: 'mdi-sync-alert', to: i.segmentTo('stale') })
    actions.push({ id: 'order-logs', label: 'Sipariş hatalarını loglarda aç', detail: 'Aynı süzgeçle: sipariş kategorisi, hata ve kritik.', icon: 'mdi-pulse', to: { path: '/loglar', query: { category: 'order', level: 'fatal,error' } } })
  }

  const active = list.filter((c) => c.status === 'ACTIVE').length
  const unknown = i.failed && !i.clients
  const opsOk = i.ops != null && !i.opsFailed && !degraded.size
  const clean = opsOk ? '; açık sorun ya da başarısız iş yok' : ''

  return buildVerdict({
    attention,
    actions,
    calm: unknown
      ? { summary: 'Müşteri listesi okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.', tone: 'neutral' }
      : { summary: `${formatCount(active)} aktif hesabın hepsinde sipariş eşitlemesi güncel${i.total > list.length ? ` (ilk ${formatCount(list.length)} hesap)` : ''}${clean}.` },
    note: `${formatCount(list.length)} hesaba bakıldı (eşik 24 saat); açık sorun sayıları yaklaşıktır, kurulum ve silme durumu müşteri detayında.`,
    checks: ['Son sipariş eşitleme (24 sa)', 'Bağlı kanallar', 'Aktif / pasif durumu', ...(i.ops != null ? ['Açık sorun ve başarısız iş', 'Abonelik durumu'] : [])],
    okTitle: 'Müşteri hesaplarında dikkat isteyen bir şey yok',
    busy: ({ errors, top }) =>
      unknown
        ? 'Müşteri listesi okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.'
        : errors
          ? `Şimdi müdahale gerekiyor: ${top.title}.`
          : `İzlenmesi gereken bir durum var: ${top.title}.`,
  })
}

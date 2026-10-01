/** Motor ve kuyruklar — sayfa hükmü (K51, BO_UI_PATTERNS §11). Saf: girdi okunan özetler, çıktı `PageVerdict`. */
import type { RouteLocationRaw } from 'vue-router'
import type { GetQueuesResponse, GetStateMachineJobsResponse, JobState } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount, formatDuration } from '@bo/utils/units'

/** Bekleyen iş bu sayıyı aşarsa birikim sayılır (sözleşmede eşik yok; işçi kapasitesinin ~10 dk'sı). */
export const BACKLOG_WARN = 500
/** Zamanlanmış görev art arda bu kadar başarısızsa kırmızı. */
export const FAILURE_STREAK_ERROR = 3

export type EngineTab = 'kuyruklar' | 'basarisiz' | 'durum' | 'zamanlanmis'
/** Aynı sayfada sekme (+ kaynak) — göreli konum; paylaşılan bağlantı aynı görünümü açar. */
export const engineTab = (tab: EngineTab, kaynak?: 'dlq'): RouteLocationRaw => ({ query: { ...(tab === 'kuyruklar' ? {} : { sekme: tab }), ...(kaynak ? { kaynak } : {}) } })

export interface EngineVerdictInput {
  queues: GetQueuesResponse | null
  sm: GetStateMachineJobsResponse | null
  jobs: JobState[] | null
  failed: { queues: boolean; sm: boolean; jobs: boolean }
  retry: () => void
}

export function engineVerdict(i: EngineVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const qs = i.queues?.queues ?? []
  const LOGS: RouteLocationRaw = { path: '/loglar', query: { category: 'order', level: 'fatal,error' } }

  const down = qs.filter((q) => !q.available)
  if (down.length)
    attention.push({
      id: 'redis-down',
      tone: 'error',
      title: 'Redis hazır değil — sipariş kuyruğu işlenemiyor',
      impact: 'Siparişler kuyruğa alınamıyor ve işlenmiyor; tüm müşterilerin sipariş eşitlemesi bekliyor.',
      advice: 'Altyapı ekranında Redis bağlantısını ve belleğini kontrol edin.',
      to: { path: '/altyapi', query: { sekme: 'redis' } },
      cta: 'Redis durumunu aç',
    })

  const dlq = qs.reduce((n, q) => n + (q.dlq.pendingReview ?? 0), 0)
  if (dlq > 0)
    attention.push({
      id: 'dlq',
      tone: 'warning',
      title: `${formatCount(dlq)} iş elle inceleme bekliyor (ölü mektup)`,
      impact: 'Otomatik yeniden deneme bitti; neden çözülmeden bu işler ilerlemez.',
      advice: 'Hata koduna bakın: AUTH ise müşterinin anahtarı yenilenmeli, VALIDATION ise veri düzeltilmeli.',
      to: engineTab('basarisiz', 'dlq'),
      cta: 'Ölü mektupları aç',
    })

  const failedJobs = qs.reduce((n, q) => n + (q.counts?.failed ?? 0), 0)
  if (failedJobs > 0)
    attention.push({
      id: 'failed',
      tone: 'warning',
      title: `${formatCount(failedJobs)} başarısız iş yeniden denenebilir`,
      impact: 'İlgili siparişlerin pazaryerine aktarımı yarım kaldı.',
      advice: 'Geçici hata kodlarında (UNAVAILABLE, RATE_LIMITED) yeniden deneyin; AUTH ise önce müşteri anahtarını yeniletin.',
      to: engineTab('basarisiz'),
      cta: 'Başarısız işleri aç',
    })

  const backlog = qs.reduce((n, q) => n + (q.counts?.wait ?? 0), 0)
  if (backlog > BACKLOG_WARN)
    attention.push({
      id: 'backlog',
      tone: 'warning',
      title: `Kuyrukta ${formatCount(backlog)} bekleyen iş birikti`,
      impact: `Eşik ${formatCount(BACKLOG_WARN)} iş; sipariş güncellemeleri gecikiyor.`,
      advice: 'İşleme süresini ve işçi pod sayısını kontrol edin.',
      to: engineTab('kuyruklar'),
      cta: 'Kuyrukları aç',
    })

  const stuck = i.sm?.stuckLeaseCount ?? 0
  if (stuck > 0)
    attention.push({
      id: 'stuck',
      tone: 'warning',
      title: `${formatCount(stuck)} kira takılı kaldı`,
      impact: `Sahip pod ${formatDuration(i.sm!.leaseTimeoutMs.export)} içinde ilerlemedi; ilgili müşterilerin eşitlemesi bekliyor.`,
      advice: 'Sahip podun yaşadığını kontrol edin; yaşamıyorsa kirayı serbest bırakın.',
      to: engineTab('durum'),
      cta: 'Takılı kiraları aç',
    })

  const jobs = i.jobs ?? []
  const streak = jobs.filter((j) => j.consecutiveFailures >= FAILURE_STREAK_ERROR)
  if (streak.length)
    attention.push({
      id: 'job-streak',
      tone: 'error',
      title: streak.length === 1 ? `${streak[0].job} art arda ${streak[0].consecutiveFailures} kez başarısız` : `${streak.length} zamanlanmış görev art arda başarısız`,
      impact: 'Görevin çıktısı (stok, sipariş, deneme süresi) üretilmiyor.',
      advice: 'Son koşunun hata kodunu inceleyin; dış servis kaynaklıysa entegrasyon sağlığına bakın.',
      to: engineTab('zamanlanmis'),
      cta: 'Görevleri aç',
    })
  const overdue = jobs.filter((j) => j.overdue)
  if (overdue.length)
    attention.push({
      id: 'job-overdue',
      tone: 'warning',
      title: overdue.length === 1 ? `${overdue[0].job} görevi gecikti` : `${overdue.length} zamanlanmış görev gecikti`,
      impact: 'Beklenen aralıkta koşmadı.',
      advice: 'Zamanlayıcı podunu ve görev kilidini kontrol edin.',
      to: engineTab('zamanlanmis'),
      cta: 'Görevleri aç',
    })

  if (i.failed.queues) attention.push(unreadable('queues', 'Kuyruk durumu', i.retry))
  if (i.failed.sm) attention.push(unreadable('sm', 'Durum makinesi', i.retry))
  if (i.failed.jobs) attention.push(unreadable('jobs', 'Zamanlanmış görevler', i.retry))

  // Eylemler önem sırasıyla: ilki "Önerilen ilk adım" kartı olur.
  if (down.length) actions.push({ id: 'infra', label: 'Redis bağlantısını kontrol edin', detail: 'Bellek, bağlantı ve gecikme — salt okuma.', cta: 'Redis durumunu aç', icon: 'mdi-memory', to: { path: '/altyapi', query: { sekme: 'redis' } } })
  if (streak.length) actions.push({ id: 'jobs', label: 'Başarısız görevin son koşusunu inceleyin', detail: 'Hata kodu ve süre zamanlanmış görevler sekmesinde.', cta: 'Görevleri aç', icon: 'mdi-calendar-alert', to: engineTab('zamanlanmis') })
  if (dlq > 0) actions.push({ id: 'review-dlq', label: 'Ölü mektupları inceleyin', detail: 'Neden çözülünce iş müşteri tarafında yeniden tetiklenir.', cta: 'Ölü mektupları aç', icon: 'mdi-email-alert-outline', to: engineTab('basarisiz', 'dlq') })
  if (failedJobs > 0) actions.push({ id: 'retry', label: 'Başarısız işleri yeniden deneyin', detail: 'İş başına; her deneme gerekçeyle denetime yazılır.', cta: 'Başarısız işler', icon: 'mdi-replay', guarded: true, to: engineTab('basarisiz') })
  if (stuck > 0) actions.push({ id: 'release', label: 'Takılı kirayı serbest bırakın', detail: 'Sunucu kirayı yeniden denetler; sağlıklıysa değişiklik olmaz.', cta: 'Takılı kiralar', icon: 'mdi-lock-open-variant-outline', guarded: true, to: engineTab('durum') })
  if (failedJobs > 0 || dlq > 0 || streak.length) actions.push({ id: 'logs', label: 'Sipariş hatalarını loglarda açın', icon: 'mdi-pulse', to: LOGS })

  const unknown = i.failed.queues && i.failed.sm && i.failed.jobs
  return buildVerdict({
    attention,
    actions,
    calm: { summary: 'Her şey yolunda: kuyruklar akıyor; başarısız iş, takılı kira ve geciken görev yok.' },
    checks: ['Kuyruk sayaçları', 'Ölü mektuplar', 'Takılı kiralar', 'Zamanlanmış görevler'],
    okTitle: 'Motorda müdahale gereken bir şey yok',
    busy: ({ errors, total, top }) =>
      unknown
        ? 'Motor durumu okunamadı — hüküm verilemiyor.'
        : errors
          ? `${errors === 1 ? 'Bir konu' : `${errors} konu`} şimdi müdahale istiyor: ${top.title}.`
          : `${total === 1 ? 'Bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${top.title}.`,
  })
}

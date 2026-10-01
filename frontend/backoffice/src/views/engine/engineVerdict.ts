/** Motor ve kuyruklar — sayfa hükmü (K51). Saf: girdi okunan özetler, çıktı `PageVerdict`. */
import type { GetQueuesResponse, GetStateMachineJobsResponse, JobState } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount, formatDuration } from '@bo/utils/units'

/** Bekleyen iş bu sayıyı aşarsa birikim sayılır (sözleşmede eşik yok; işçi kapasitesinin ~10 dk'sı). */
export const BACKLOG_WARN = 500
/** Zamanlanmış görev art arda bu kadar başarısızsa kırmızı. */
export const FAILURE_STREAK_ERROR = 3

export interface EngineVerdictInput {
  queues: GetQueuesResponse | null
  sm: GetStateMachineJobsResponse | null
  jobs: JobState[] | null
  failed: { queues: boolean; sm: boolean; jobs: boolean }
  retry: () => void
  /** Sekmeye geç (`?sekme=`); `kaynak` yalnız başarısız işler sekmesinde. */
  tab: (tab: 'kuyruklar' | 'basarisiz' | 'durum' | 'zamanlanmis', kaynak?: 'dlq') => void
}

export function engineVerdict(i: EngineVerdictInput): PageVerdict {
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const qs = i.queues?.queues ?? []

  const down = qs.filter((q) => !q.available)
  if (down.length)
    attention.push({
      id: 'redis-down',
      tone: 'error',
      title: 'Redis hazır değil — sipariş kuyruğu işlenemiyor',
      detail: 'Kuyruk sayaçları ve başarısız işler okunamıyor; önce Redis bağlantısını denetleyin.',
      to: { path: '/altyapi', query: { sekme: 'redis' } },
      cta: 'Altyapı',
    })

  const dlq = qs.reduce((n, q) => n + (q.dlq.pendingReview ?? 0), 0)
  if (dlq > 0)
    attention.push({
      id: 'dlq',
      tone: 'warning',
      title: `${formatCount(dlq)} iş elle inceleme bekliyor (ölü mektup)`,
      detail: 'Otomatik yeniden deneme bitti; neden çözülmeden iş ilerlemez.',
      cta: 'Ölü mektuplar',
      onSelect: () => i.tab('basarisiz', 'dlq'),
    })

  const failedJobs = qs.reduce((n, q) => n + (q.counts?.failed ?? 0), 0)
  if (failedJobs > 0)
    attention.push({
      id: 'failed',
      tone: 'warning',
      title: `${formatCount(failedJobs)} başarısız iş yeniden denenebilir`,
      detail: 'Hata kodu geçici ise (UNAVAILABLE, RATE_LIMITED) yeniden deneyin; AUTH ise müşteri anahtarı yenilenmeli.',
      cta: 'Başarısız işler',
      onSelect: () => i.tab('basarisiz'),
    })

  const backlog = qs.reduce((n, q) => n + (q.counts?.wait ?? 0), 0)
  if (backlog > BACKLOG_WARN)
    attention.push({
      id: 'backlog',
      tone: 'warning',
      title: `Kuyrukta ${formatCount(backlog)} bekleyen iş birikti`,
      detail: 'İşçi podları yetişmiyor olabilir; işleme süresini ve işçi sayısını denetleyin.',
      cta: 'Kuyruklar',
      onSelect: () => i.tab('kuyruklar'),
    })

  const stuck = i.sm?.stuckLeaseCount ?? 0
  if (stuck > 0)
    attention.push({
      id: 'stuck',
      tone: 'warning',
      title: `${formatCount(stuck)} kira takılı kaldı`,
      detail: `Sahip pod ${formatDuration(i.sm!.leaseTimeoutMs.export)} içinde ilerlemedi; ilgili müşterinin eşitlemesi bekliyor.`,
      cta: 'Durum makinesi',
      onSelect: () => i.tab('durum'),
    })

  const jobs = i.jobs ?? []
  const streak = jobs.filter((j) => j.consecutiveFailures >= FAILURE_STREAK_ERROR)
  if (streak.length)
    attention.push({
      id: 'job-streak',
      tone: 'error',
      title: streak.length === 1 ? `${streak[0].job} art arda ${streak[0].consecutiveFailures} kez başarısız` : `${streak.length} zamanlanmış görev art arda başarısız`,
      detail: 'Görev çıktısı üretilmiyor; son koşunun hata kodunu inceleyin.',
      cta: 'Zamanlanmış görevler',
      onSelect: () => i.tab('zamanlanmis'),
    })
  const overdue = jobs.filter((j) => j.overdue)
  if (overdue.length)
    attention.push({
      id: 'job-overdue',
      tone: 'warning',
      title: overdue.length === 1 ? `${overdue[0].job} görevi gecikti` : `${overdue.length} zamanlanmış görev gecikti`,
      detail: 'Beklenen aralıkta koşmadı; zamanlayıcı podunu ve kilitleri denetleyin.',
      cta: 'Zamanlanmış görevler',
      onSelect: () => i.tab('zamanlanmis'),
    })

  if (i.failed.queues) attention.push(unreadable('queues', 'Kuyruk durumu', i.retry))
  if (i.failed.sm) attention.push(unreadable('sm', 'Durum makinesi', i.retry))
  if (i.failed.jobs) attention.push(unreadable('jobs', 'Zamanlanmış görevler', i.retry))

  if (down.length) actions.push({ id: 'infra', label: 'Redis durumunu aç', detail: 'Bellek, bağlantı ve gecikme — salt okuma.', icon: 'mdi-memory', to: { path: '/altyapi', query: { sekme: 'redis' } } })
  if (dlq > 0) actions.push({ id: 'review-dlq', label: 'Ölü mektupları incele', detail: 'Hata koduna göre neden çözün; iş müşteri tarafında yeniden tetiklenir.', icon: 'mdi-email-alert-outline', onSelect: () => i.tab('basarisiz', 'dlq') })
  if (failedJobs > 0)
    actions.push({ id: 'retry', label: 'Başarısız işleri yeniden dene', detail: 'Satırdan iş başına; her deneme denetime yazılır.', icon: 'mdi-replay', guarded: true, onSelect: () => i.tab('basarisiz') })
  if (stuck > 0) actions.push({ id: 'release', label: 'Takılı kirayı serbest bırak', detail: 'Sunucu kirayı yeniden denetler; sağlıklıysa değişiklik olmaz.', icon: 'mdi-lock-open-variant-outline', guarded: true, onSelect: () => i.tab('durum') })
  if (failedJobs > 0 || dlq > 0 || streak.length)
    actions.push({ id: 'logs', label: 'Sipariş hatalarını loglarda aç', detail: 'Aynı süzgeçle: sipariş kategorisi, hata ve kritik.', icon: 'mdi-pulse', to: { path: '/loglar', query: { category: 'order', level: 'fatal,error' } } })

  const unknown = i.failed.queues && i.failed.sm && i.failed.jobs
  return buildVerdict({
    attention,
    actions,
    calm: { summary: 'Kuyruklar akıyor: başarısız iş, takılı kira ve geciken görev yok.' },
    busy: ({ errors, total, top }) =>
      unknown
        ? 'Motor durumu okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.'
        : errors
        ? `Motorda şimdi müdahale gereken ${errors === 1 ? 'bir konu' : `${errors} konu`} var: ${top.title}.`
        : `Motor çalışıyor ama ${total === 1 ? 'bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${top.title}.`,
  })
}

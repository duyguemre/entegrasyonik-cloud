/**
 * Müşteri detayı — sayfa hükmü (K51). Saf: girdi yaşam döngüsü + (varsa) liste satırı.
 * "Şu an" hükmü yaşam döngüsü (durum, kurulum, silme, abonelik, son eşitleme), kanal listesi ve BE-02 sağlık özeti
 * (açık sorun grupları ~yaklaşık, başarısız işler, firing uyarılar) ile kurulur. Sağlık özetinin okunamayan bölümü
 * (`degradedSections`) "okunamadı" der; boş değer "sorun yok" diye okunmaz.
 */
import type { RouteLocationRaw } from 'vue-router'
import type { ClientDto, TenantLifecycle } from '@bo/api/contract'
import type { HealthSummarySection, TenantHealthSummary } from '@bo/api/contracts/ops'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { SUB_STATUS, TENANT_STATUS, planLabel } from '@bo/utils/labels'
import { formatRelative } from '@bo/utils/format'

/** Deneme bitimine bu kadar gün ya da az kaldıysa uyarılır (müşteriyi ödemeye/uzatmaya yönlendirmek için yeterli süre). */
export const TRIAL_ENDING_DAYS = 3
/** Kanallı aktif hesapta son başarılı sipariş eşitlemesi bu süreden eskiyse uyarılır (liste uyarısıyla aynı eşik). */
export const SYNC_STALE_MS = 24 * 3_600_000

/** Müşterinin bullmq başarısız işi bu sayıya ulaşırsa kırmızı (liste hükmündeki FAILED_JOBS_ERROR ile aynı eşik). */
export const FAILED_JOBS_ERROR = 10
/** Açık sorun grubu (yaklaşık) bu sayıya ulaşırsa kırmızı (liste hükmündeki OPEN_ISSUES_ERROR ile aynı eşik). */
export const OPEN_ISSUES_ERROR = 3
const SECTION_LABEL: Record<HealthSummarySection, string> = { openIssues: 'Açık sorun grupları', failedJobs: 'Başarısız iş sayıları (kuyruk)', lastSyncAt: 'Entegrasyon eşitleme zamanları', alerts: 'Etkin uyarılar' }

export interface TenantDetailVerdictInput {
  tid: number
  life: TenantLifecycle | null
  /** Liste satırı (kanallar için); okunamadıysa null ve kanal maddeleri yazılmaz. */
  client: ClientDto | null
  failed: boolean
  stale?: boolean
  retry: () => void
  /** BE-02 sağlık özeti; verilmezse (undefined) sağlık maddeleri yazılmaz, `null` + `healthFailed` okunamadı demektir. */
  health?: TenantHealthSummary | null
  healthFailed?: boolean
  retryHealth?: () => void
  /** Sayfa içi sekmeye götüren konum (`?sekme=`; diğer sorgu korunur). */
  tabTo: (tab: 'ozet' | 'yasam-dongusu') => RouteLocationRaw
  /** Güvenli eylemler: ilgili GuardedDialog'u açar (yalnız uygun olduğunda verilir). */
  impersonate?: () => void
  undoDeletion?: () => void
  now?: number
}

export function tenantDetailVerdict(i: TenantDetailVerdictInput): PageVerdict {
  const now = i.now ?? Date.now()
  const q = { tid: String(i.tid) }
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  const l = i.life

  if (i.failed && !l) attention.push(unreadable('lifecycle', 'Hesap durumu', i.retry))
  else if (i.stale) attention.push(unreadable('lifecycle', 'Hesap durumu', i.retry, true))

  if (l) {
    const life = i.tabTo('yasam-dongusu')
    if (l.status === 'PROVISIONING_FAILED') {
      const step = l.provisioning.failedStep
      attention.push({
        id: 'provisioning-failed',
        tone: 'error',
        title: 'Hesap kurulumu başarısız oldu',
        impact: 'Müşteri uygulamayı kullanamıyor; hesap etkinleştirilmedi.',
        advice: step ? `"${step}" adımında durdu; adımı Yaşam döngüsü sekmesinden kontrol edin, çözülmezse mühendisliğe iletin.` : 'Kurulum adımlarını Yaşam döngüsü sekmesinden kontrol edin.',
        to: life,
        cta: 'Kurulum adımlarını aç',
        since: l.provisioning.failedAt ?? undefined,
      })
    }
    if (l.status === 'PURGE_FAILED')
      attention.push({
        id: 'purge-failed',
        tone: 'error',
        title: 'Kalıcı silme tamamlanamadı',
        impact: 'Müşteri verileri kısmen silinmiş olabilir; kayıt tutarsız durumda.',
        advice: l.deletion?.purgeFailedStep ? `"${l.deletion.purgeFailedStep}" adımı başarısız; mühendisliğe iletin.` : 'Silme adımlarını Yaşam döngüsü sekmesinden kontrol edin ve mühendisliğe iletin.',
        to: life,
        cta: 'Silme sürecini aç',
      })
    if (l.status === 'DELETION_PENDING')
      attention.push({
        id: 'deletion-pending',
        tone: 'warning',
        title: l.deletion?.daysUntilPurge != null ? `Hesap silinmek üzere — kalıcı silmeye ${l.deletion.daysUntilPurge} gün var` : 'Hesap silinmek üzere',
        impact: 'Süre dolunca mağaza verileri kalıcı olarak silinir ve geri alınamaz.',
        advice: 'Müşteri vazgeçtiyse silme talebini geri alın.',
        to: life,
        cta: 'Silme sürecini aç',
        since: l.deletion?.requestedAt ?? undefined,
      })
    if (l.status === 'PURGING') attention.push({ id: 'purging', tone: 'warning', title: 'Hesap siliniyor', impact: 'Silme sürüyor; müşteri verilerine erişim kapalı.', advice: 'Takılırsa Yaşam döngüsü sekmesinden adımı kontrol edin.', to: life, cta: 'Silme sürecini aç' })
    if (l.status === 'PROVISIONING') attention.push({ id: 'provisioning', tone: 'info', title: 'Hesap kuruluyor', impact: 'Kurulum adımları sürüyor; hesap henüz kullanılamaz.', advice: 'Birkaç dakikada bitmezse kurulum adımlarını kontrol edin.', to: life, cta: 'Kurulum adımlarını aç', since: l.provisioning.startedAt ?? undefined })

    const t = l.trial
    if (t && !t.billingExempt) {
      const sub = { to: `/abonelikler/${i.tid}`, cta: 'Aboneliği aç' }
      if (t.subscriptionStatus === 'suspended')
        attention.push({ id: 'sub-suspended', tone: 'error', title: 'Abonelik askıda', impact: 'Müşteri erişimi kapalı; denemesi bitmiş ya da ödeme alınamamış.', advice: 'Denemeyi uzatın ya da müşteriyi ödemeye yönlendirin.', ...sub })
      else if (t.subscriptionStatus === 'past_due')
        attention.push({ id: 'sub-past-due', tone: 'warning', title: 'Ödeme gecikti', impact: 'Tolerans süresi dolarsa abonelik askıya alınır ve müşteri erişimi kapanır.', advice: 'Müşteriye kartını güncellemesini hatırlatın.', ...sub })
      else if (t.subscriptionStatus === 'trialing' && t.daysLeft !== null && t.daysLeft <= TRIAL_ENDING_DAYS)
        attention.push({
          id: 'trial-ending',
          tone: 'warning',
          title: t.daysLeft === 0 ? 'Deneme bugün bitiyor' : `Deneme ${t.daysLeft} gün içinde bitiyor`,
          impact: 'Müşteri ücretli plana geçmezse abonelik askıya alınır.',
          advice: 'Müşteriyle iletişime geçin; gerekirse denemeyi uzatın.',
          ...sub,
        })
      else if (t.subscriptionStatus === 'canceled' || t.subscriptionStatus === 'expired')
        attention.push({ id: 'sub-ended', tone: 'info', title: `Abonelik ${SUB_STATUS[t.subscriptionStatus].label.toLocaleLowerCase('tr')}`, impact: 'Yeni bir abonelik başlayana dek ücretli özellikler kapalıdır.', advice: 'Müşteri geri dönmek istiyorsa yeni abonelik başlatılmalı.', ...sub })
    }
    if (!t && l.status === 'ACTIVE') attention.push({ id: 'sub-missing', tone: 'warning', title: 'Aktif hesabın abonelik kaydı yok', impact: 'Faturalama ve plan sınırları uygulanamaz.', advice: 'Mühendisliğe iletin; kayıt elle oluşturulmamalı.', to: `/abonelikler/${i.tid}`, cta: 'Aboneliği aç' })

    // Kanal ve eşitleme: yalnız aktif hesapta anlamlı.
    if (l.status === 'ACTIVE' && i.client) {
      const channels = i.client.integrations?.length ?? 0
      const last = l.lastSuccessfulOrderSync
      if (channels === 0) attention.push({ id: 'no-channel', tone: 'info', title: 'Bağlı kanal yok', impact: 'Eşitleme çalışmıyor; müşteri kurulumu tamamlamamış olabilir.', advice: 'Müşterinin olay akışından kurulum adımlarını kontrol edin.', to: { path: '/loglar', query: q }, cta: 'Olay akışını aç' })
      else if (!last || now - Date.parse(last) > SYNC_STALE_MS)
        attention.push({
          id: 'sync-stale',
          tone: 'warning',
          title: last ? `Son sipariş eşitleme ${formatRelative(last, now)}` : 'Hiç başarılı sipariş eşitlemesi yok',
          impact: 'Son 24 saatte yeni sipariş alınamadı; müşteri siparişleri uygulamada görmüyor olabilir.',
          advice: 'Kanal anahtarını ve pazaryeri hatalarını kontrol edin.',
          to: { path: '/loglar', query: { ...q, category: 'order', level: 'fatal,error' } },
          cta: 'Sipariş hatalarını aç',
          since: last ?? undefined,
        })
    }
  }

  // BE-02 sağlık özeti. Boş bölüm "sorun yok" değildir: `degradedSections` önce okunur.
  const h = i.health
  const bad = new Set((h?.degradedSections ?? []).map((d) => d.section))
  const retryHealth = i.retryHealth ?? i.retry
  if (i.healthFailed && !h) attention.push(unreadable('health', 'Sağlık özeti (sorun, başarısız iş, uyarı)', retryHealth))
  if (h) {
    for (const sec of bad) attention.push(unreadable(`health-${sec}`, SECTION_LABEL[sec], retryHealth))
    const n = h.openIssues.items.length
    if (!bad.has('openIssues') && n) {
      const top = h.openIssues.items[0]
      attention.push({
        id: 'open-issues',
        tone: n >= OPEN_ISSUES_ERROR ? 'error' : 'warning',
        title: `~${n} açık sorun grubu`,
        impact: `Sayı yaklaşıktır; en yeni: ${top.module} · ${top.code} (${top.count} olay).`,
        advice: 'Sorun gruplarını loglarda açıp en çok tekrarlananı kontrol edin.',
        to: { path: '/loglar', query: { ...q, sekme: 'sorunlar', fp: top.fp } },
        cta: 'Sorun gruplarını aç',
        since: top.lastSeen,
      })
    }
    const fj = h.failedJobs
    const total = (fj.bullmq ?? 0) + (fj.dlq ?? 0)
    if (!bad.has('failedJobs') && total) {
      const onlyDlq = !(fj.bullmq ?? 0)
      attention.push({
        id: 'failed-jobs',
        tone: (fj.bullmq ?? 0) >= FAILED_JOBS_ERROR ? 'error' : 'warning',
        title: `${[fj.bullmq ? `${fj.bullmq} başarısız iş` : '', fj.dlq ? `${fj.dlq} iş elle inceleme bekliyor` : ''].filter(Boolean).join(', ')}`,
        impact: fj.bullmqAvailable ? 'Başarısız işler yeniden denenmezse müşterinin sipariş ve ürün güncellemeleri eksik kalır.' : 'Kuyruk okunamadı; yalnız elle inceleme bekleyen işler biliniyor, sayı eksik olabilir.',
        advice: 'Motorda bu müşteriye süzülmüş başarısız işleri kontrol edin.',
        to: { path: '/motor', query: { sekme: 'basarisiz', ...(onlyDlq ? { kaynak: 'dlq' } : {}), ...q } },
        cta: 'Başarısız işleri aç',
      })
    }
    if (!bad.has('alerts'))
      for (const a of h.alerts) {
        const muted = !!a.mutedUntil && Date.parse(a.mutedUntil) > now
        attention.push({
          id: `alert-${a.ruleId}-${a.scopeKey}`,
          tone: muted ? 'info' : a.level === 'critical' ? 'error' : 'warning',
          title: `${a.level === 'critical' ? 'Kritik' : 'Uyarı'}: ${a.ruleId} kuralı etkin${muted ? ' (susturulmuş)' : ''}`,
          impact: muted ? 'Bildirimler susturuldu; durum sürüyor.' : 'Kural tetiklendi ve çözülmedi.',
          advice: 'Uyarıyı açıp kapsamını ve nedenini kontrol edin.',
          to: { path: '/bildirimler/uyarilar', query: { durum: 'firing' } },
          cta: 'Etkin uyarıları aç',
          since: a.firstFiredAt,
        })
      }
  }

  const attentive = attention.some((a) => a && a.tone !== 'info')
  const trialRelevant = l?.trial && !l.trial.billingExempt && (l.trial.subscriptionStatus === 'trialing' || l.trial.subscriptionStatus === 'suspended')
  // İlk eylem en önemlisi: silme bekleyen hesapta geri alma, deneme/askıda uzatma, aksi halde iz bağlantıları.
  if (l?.status === 'DELETION_PENDING' && l.deletion?.canCancel && i.undoDeletion)
    actions.push({ id: 'undo-deletion', label: 'Silme talebini geri al', detail: 'Hesap yeniden aktif olur; planlanan silme iptal edilir.', icon: 'mdi-undo-variant', guarded: true, onSelect: i.undoDeletion })
  if (trialRelevant) actions.push({ id: 'extend-trial', label: 'Denemeyi uzat ya da planı değiştir', detail: 'Abonelik sayfasında gerekçe ve kimlik doğrulamasıyla yapılır.', icon: 'mdi-timer-plus-outline', to: `/abonelikler/${i.tid}` })
  const fjs = h && !bad.has('failedJobs') ? (h.failedJobs.bullmq ?? 0) + (h.failedJobs.dlq ?? 0) : 0
  if (fjs) actions.push({ id: 'failed-jobs', label: 'Başarısız işleri motorda aç', detail: 'Bu müşteriye süzülmüş; yeniden deneme motor ekranında gerekçeyle yapılır.', icon: 'mdi-engine-outline', to: { path: '/motor', query: { sekme: 'basarisiz', ...q } } })
  if (attentive && i.impersonate && l?.status === 'ACTIVE')
    actions.push({ id: 'impersonate', label: 'Müşterinin gözünden aç', detail: 'Sorunu müşterinin ekranında görün; oturum 30 dakika sürer, yazma işlemleri kapalıdır.', icon: 'mdi-account-eye-outline', guarded: true, onSelect: i.impersonate })
  if (attention.length) {
    actions.push({ id: 'logs', label: 'Bu müşterinin olay akışını aç', detail: 'Log merkezi, yalnız bu müşteriye süzülmüş.', icon: 'mdi-pulse', to: { path: '/loglar', query: q } })
    actions.push({ id: 'audit', label: 'Denetim kayıtlarını aç', detail: 'Hesapta kim ne zaman ne yaptı.', icon: 'mdi-shield-search', to: { path: '/denetim', query: q } })
    actions.push({ id: 'notifications', label: 'Bildirim geçmişini aç', detail: 'Müşteriye giden e-posta ve uygulama içi bildirimler.', icon: 'mdi-bell-outline', to: { path: '/bildirimler/musteri-gecmisi', query: q } })
  }

  const unknown = i.failed && !l
  const healthClean = !!h && !bad.size && !h.openIssues.items.length && !((h.failedJobs.bullmq ?? 0) + (h.failedJobs.dlq ?? 0)) && !h.alerts.length
  const sub = l?.trial ? `${planLabel(l.trial.planCode)} · ${SUB_STATUS[l.trial.subscriptionStatus].label.toLocaleLowerCase('tr')}` : 'abonelik kaydı yok'
  const sync = l?.lastSuccessfulOrderSync ? `son sipariş eşitleme ${formatRelative(l.lastSuccessfulOrderSync, now)}` : 'henüz sipariş eşitlemesi yok'
  return buildVerdict({
    attention,
    actions,
    calm: unknown
      ? { summary: 'Hesap durumu okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.', tone: 'neutral' }
      : { summary: `Hesap ${l ? TENANT_STATUS[l.status].label.toLocaleLowerCase('tr') : ''}; abonelik ${sub}; ${sync}${healthClean ? '; açık sorun, başarısız iş ve etkin uyarı yok' : ''}.`.replace('Hesap ;', 'Hesap;') },
    note: h && !bad.size ? 'Açık sorun sayısı yaklaşıktır (kova eşleşmesi); başarısız iş ve uyarılar anlık okundu.' : 'Sağlık özeti okunamadığı bölümlerde hüküm verilemez; iz bağlantılarından bakın.',
    checks: ['Hesap durumu', 'Kurulum ve silme süreci', 'Abonelik', 'Son sipariş eşitleme', 'Bağlı kanallar', ...(h ? ['Açık sorun grupları', 'Başarısız işler', 'Etkin uyarılar'] : [])],
    okTitle: 'Bu hesapta dikkat isteyen bir şey yok',
    busy: ({ errors, top }) =>
      unknown
        ? 'Hesap durumu okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.'
        : errors
          ? `Bu hesapta şimdi müdahale gereken bir konu var: ${top.title}.`
          : `Bu hesapta izlenmesi gereken bir konu var: ${top.title}.`,
  })
}

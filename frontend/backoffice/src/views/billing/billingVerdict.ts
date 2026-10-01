/** Abonelikler (liste + gelir) ve abonelik detayı — sayfa hükümleri (K51). Saf: girdi okunan özetler, çıktı `PageVerdict`. */
import type { BillingEventRow, ListSubscriptionsResponse, RevenueMetrics, SubscriptionRow } from '@bo/api/contract'
import { buildVerdict, unreadable, type AttentionItem, type PageVerdict, type SuggestedAction } from '@bo/utils/verdict'
import { formatCount, formatMinor, formatPercent } from '@bo/utils/units'
import { formatDate } from '@bo/utils/format'

/** Deneme bitimine bu kadar gün ya da az kaldıysa "yakında biten deneme" (müşteriyi ödemeye yönlendirmek için son fırsat). */
export const TRIAL_ENDING_DAYS = 3
/** Başarısız ödeme olaylarının payı bunu aşarsa sarı (sözleşmede eşik yok; sağlayıcı kesintisini ayırt edecek kadar yüksek). */
export const PAYMENT_FAIL_RATE_WARN = 0.2
const DAY_MS = 86_400_000
/** Aboneliği iptal et düğmesine götüren bağlantı çapası (sayfa kaydırır ve odaklar). */
export const CANCEL_HASH = '#iptal'

const money = (byCurrency: Record<string, number>) => {
  const parts = Object.entries(byCurrency).map(([cur, minor]) => formatMinor(minor, cur))
  return parts.length ? parts.join(' + ') : formatMinor(0)
}

export const trialEndsSoon = (s: SubscriptionRow, now: number) =>
  s.status === 'trialing' && !s.billingExempt && !!s.trialEndsAt && Date.parse(s.trialEndsAt) - now <= TRIAL_ENDING_DAYS * DAY_MS

export interface SubscriptionsVerdictInput {
  revenue: RevenueMetrics | null
  pastDue: ListSubscriptionsResponse | null
  suspended: ListSubscriptionsResponse | null
  trialing: ListSubscriptionsResponse | null
  failed: { revenue: boolean; pastDue: boolean; suspended: boolean; trialing: boolean }
  retry: () => void
  now?: number
}

/** `nextCursor` doluysa liste kesilmiştir: sayı "en az". */
const countText = (r: ListSubscriptionsResponse, n = r.items.length) => (r.nextCursor ? `${formatCount(n)}+` : formatCount(n))

export function subscriptionsVerdict(i: SubscriptionsVerdictInput): PageVerdict {
  const now = i.now ?? Date.now()
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []
  /** Aynı sayfada durum süzgeci (göreli konum; sekme sorgusu düşer → Abonelikler sekmesi). */
  const filter = (durum: string) => ({ query: { durum } })
  const gelir = { query: { sekme: 'gelir' } }

  const sus = i.suspended?.items ?? []
  if (sus.length)
    attention.push({
      id: 'suspended',
      tone: 'error',
      title: `${i.suspended ? countText(i.suspended) : sus.length} abonelik askıda`,
      impact: 'Bu müşterilerin erişimi kapalı; denemesi bitmiş ya da ödeme alınamamış.',
      advice: 'Kartsız denemeyi uzatın ya da müşteriyi ödemeye yönlendirin.',
      to: filter('suspended'),
      cta: 'Askıdaki abonelikleri aç',
      since: sus.map((s) => s.updatedAt).sort()[0],
    })

  const pd = i.pastDue?.items ?? []
  if (pd.length) {
    const graces = pd.map((s) => s.graceUntil).filter((g): g is string => !!g).sort()
    attention.push({
      id: 'past-due',
      tone: 'warning',
      title: `${i.pastDue ? countText(i.pastDue) : pd.length} abonelikte ödeme gecikti`,
      impact: graces.length ? `En erken tolerans bitişi ${formatDate(graces[0])}; sonrasında abonelik askıya alınır.` : 'Tolerans bitince abonelik askıya alınır.',
      advice: 'Müşterilere kartlarını güncellemelerini hatırlatın.',
      to: filter('past_due'),
      cta: 'Geciken ödemeleri aç',
    })
  }

  const ending = (i.trialing?.items ?? []).filter((s) => trialEndsSoon(s, now))
  if (ending.length)
    attention.push({
      id: 'trial-ending',
      tone: 'warning',
      title: `${formatCount(ending.length)} denemenin bitmesine ${TRIAL_ENDING_DAYS} günden az var`,
      impact: 'Ücretli plana geçmeyen müşterilerin aboneliği askıya alınır.',
      advice: 'Müşterilerle iletişime geçin; gerekirse denemeyi uzatın.',
      to: filter('trialing'),
      cta: 'Denemeleri aç',
    })

  const r = i.revenue
  if (r) {
    const { succeeded, failed } = r.paymentEvents
    const total = succeeded + failed
    const days = r.range === '7d' ? '7' : r.range === '90d' ? '90' : '30'
    if (failed > 0)
      attention.push({
        id: 'payment-failures',
        tone: total > 0 && failed / total > PAYMENT_FAIL_RATE_WARN ? 'warning' : 'info',
        title: `Son ${days} günde ${formatCount(failed)} ödeme olayı başarısız`,
        impact: `Ödeme olaylarının ${formatPercent(total ? failed / total : null)}'i başarısız; çoğu reddedilen kart olabilir.`,
        advice: 'Oran yükseliyorsa ödeme sağlayıcısındaki kesintiyi fatura loglarından kontrol edin.',
        to: { path: '/loglar', query: { category: 'billing' } },
        cta: 'Fatura loglarını aç',
      })
    if (r.churn.count > 0)
      attention.push({
        id: 'churn',
        tone: 'info',
        title: `Son ${days} günde ${formatCount(r.churn.count)} abonelik kaybedildi`,
        impact: `Kayıp oranı ${formatPercent(r.churn.rate)}; kaybedilen aylık gelir ${money(r.churn.mrrLostByCurrency)} (yaklaşık).`,
        advice: 'Kayıp nedenlerini gelir metriklerinden ve iptal olaylarından kontrol edin.',
        to: gelir,
        cta: 'Gelir metriklerini aç',
      })
  }

  if (i.failed.revenue) attention.push(unreadable('revenue', 'Gelir metrikleri', i.retry))
  if (i.failed.pastDue) attention.push(unreadable('pastDue', 'Geciken ödemeler', i.retry))
  if (i.failed.suspended) attention.push(unreadable('suspended', 'Askıdaki abonelikler', i.retry))
  if (i.failed.trialing) attention.push(unreadable('trialing', 'Deneme listesi', i.retry))

  // İlk eylem en önemlisi: askıda > gecikmiş > biten deneme; gelir metrikleri her zaman son.
  if (sus.length) actions.push({ id: 'suspended', label: 'Askıdaki abonelikleri incele', detail: 'Müşteri seçip denemeyi uzatın ya da ödeme durumunu görün.', icon: 'mdi-pause-circle-outline', to: filter('suspended') })
  if (pd.length) actions.push({ id: 'past-due', label: 'Geciken ödemeleri incele', detail: 'Ödeme olayları abonelik detayındaki olay geçmişinde.', icon: 'mdi-credit-card-alert-outline', to: filter('past_due') })
  if (ending.length) actions.push({ id: 'trials', label: 'Biten denemeleri incele', detail: 'Deneme uzatma abonelik detayında, gerekçe ve kimlik doğrulamasıyla yapılır.', icon: 'mdi-timer-sand', to: filter('trialing') })
  if (r) actions.push({ id: 'revenue', label: 'Gelir metriklerini aç', detail: 'MRR, dönüşüm ve kayıp — liste fiyatından tahmini.', icon: 'mdi-chart-line', to: gelir })

  const unknown = Object.values(i.failed).every(Boolean)
  const active = r?.statusDistribution.active ?? 0
  return buildVerdict({
    attention,
    actions,
    calm: unknown
      ? { summary: 'Abonelik durumu okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.', tone: 'neutral' }
      : { summary: r ? `Askıda ya da ödemesi geciken abonelik yok; ${formatCount(active)} aktif abonelik, tahmini aylık gelir ${money(r.mrr.byCurrency)}.` : 'Askıda ya da ödemesi geciken abonelik yok.' },
    note: 'Gelir ve ödeme olayları son 30 gün; tutarlar plan liste fiyatından tahminidir (indirim, kupon, vergi hariç).',
    checks: ['Askıdaki abonelikler', 'Geciken ödemeler', 'Biten denemeler (3 gün)', 'Ödeme olayları'],
    okTitle: 'Aboneliklerde dikkat isteyen bir şey yok',
    busy: ({ errors, total, top }) =>
      unknown
        ? 'Abonelik durumu okunamadı — hüküm verilemiyor; bağlantıyı denetleyip tekrar deneyin.'
        : errors
          ? `Şimdi müdahale gereken ${errors === 1 ? 'bir konu' : `${errors} konu`} var: ${top.title}.`
          : `${total === 1 ? 'Bir konu' : `${total} konu`} izlenmeli; en önemlisi: ${top.title}.`,
  })
}

// ------------------------------------------------------------------ abonelik detayı
export interface SubscriptionDetailVerdictInput {
  tid: number
  sub: SubscriptionRow | null
  events: BillingEventRow[]
  failed: boolean
  stale?: boolean
  retry: () => void
  /** Eylem uygunluğu: boş değilse neden metni (düğme zaten devre dışı). */
  why: { extend: string; change: string; cancel: string }
  reopen: boolean
  openExtend: () => void
  openChange: () => void
  openCancel: () => void
  now?: number
}

export function subscriptionDetailVerdict(i: SubscriptionDetailVerdictInput): PageVerdict {
  const now = i.now ?? Date.now()
  const s = i.sub
  const attention: Array<AttentionItem | null> = []
  const actions: SuggestedAction[] = []

  if (i.failed && !s) attention.push(unreadable('subscription', 'Abonelik', i.retry))
  else if (i.stale) attention.push(unreadable('subscription', 'Abonelik', i.retry, true))

  if (s && !s.billingExempt) {
    const customer = { to: `/musteriler/${i.tid}`, cta: 'Müşteriyi aç' }
    if (s.status === 'suspended')
      attention.push({
        id: 'suspended',
        tone: 'error',
        title: 'Abonelik askıda',
        impact: 'Müşteri erişimi kapalı.',
        advice: i.reopen ? 'Denemesi bitmiş ve kartsız; denemeyi yeniden açarak erişimi geri verin.' : 'Kartlı abonelik: ödeme sağlayıcısında çözülmeli; müşteriden kartını güncellemesini isteyin.',
        since: s.updatedAt,
        ...customer,
      })
    if (s.status === 'past_due') {
      const failedEvent = i.events.find((e) => e.type === 'payment.failed')
      attention.push({
        id: 'past-due',
        tone: 'warning',
        title: 'Ödeme gecikti',
        impact: s.graceUntil ? `Tolerans ${formatDate(s.graceUntil)} tarihinde bitiyor; sonra abonelik askıya alınır.` : 'Tolerans bitince abonelik askıya alınır.',
        advice: 'Müşteriden kartını güncellemesini isteyin.',
        since: failedEvent?.at,
        ...customer,
      })
    }
    if (trialEndsSoon(s, now))
      attention.push({
        id: 'trial-ending',
        tone: 'warning',
        title: `Deneme ${formatDate(s.trialEndsAt!)} tarihinde bitiyor`,
        impact: 'Müşteri ücretli plana geçmezse abonelik askıya alınır.',
        advice: 'Müşteriyle iletişime geçin; gerekirse denemeyi uzatın.',
        ...customer,
      })
    if (s.cancelAtPeriodEnd && s.status !== 'canceled' && s.status !== 'expired')
      attention.push({
        id: 'cancel-at-end',
        tone: 'warning',
        title: s.currentPeriodEnd ? `Abonelik ${formatDate(s.currentPeriodEnd)} tarihinde sona erecek` : 'Abonelik dönem sonunda iptal edilecek',
        impact: 'İptal planlandı; dönem bitince müşteri erişimi kapanır.',
        advice: 'Müşteri vazgeçtiyse iptalin ödeme sağlayıcısında geri alınması gerekir.',
        ...customer,
      })
    if (s.status === 'canceled' || s.status === 'expired')
      attention.push({ id: 'ended', tone: 'info', title: s.status === 'canceled' ? 'Abonelik iptal edildi' : 'Abonelik süresi doldu', impact: 'Yeni bir abonelik başlayana dek ücretli özellikler kapalıdır.', advice: 'Müşteri geri dönmek istiyorsa yeni abonelik başlatılmalı.', ...customer })
  }

  // İlk eylem en önemlisi: askıda/deneme → uzatma; sonra plan; iptal (danger) hiçbir zaman öne alınmaz ve yalnız yönetim eylemlerine götürür.
  if (s && !i.why.extend) actions.push({ id: 'extend-trial', label: i.reopen ? 'Denemeyi yeniden aç' : 'Denemeyi uzat', detail: i.reopen ? 'Askıdaki aboneliği yeniden deneme durumuna alır.' : 'Müşteriye ek süre tanır; toplam hak sınırlıdır.', icon: i.reopen ? 'mdi-restore' : 'mdi-timer-plus-outline', guarded: true, onSelect: i.openExtend })
  if (s && !i.why.change) actions.push({ id: 'change-plan', label: 'Planı değiştir', detail: 'Değişim ödeme sağlayıcısında uygulanır.', icon: 'mdi-swap-horizontal', guarded: true, onSelect: i.openChange })
  if (s && !i.why.cancel) actions.push({ id: 'cancel', label: 'Aboneliği iptal et', detail: 'Yönetim eylemlerine gider; orada gerekçe ve kimlik doğrulamasıyla onaylanır.', icon: 'mdi-cancel', danger: true, to: { hash: CANCEL_HASH } })

  const unknown = i.failed && !s
  return buildVerdict({
    attention,
    actions,
    calm: unknown
      ? { summary: 'Abonelik okunamadı — hüküm verilemiyor; tekrar deneyin.', tone: 'neutral' }
      : { summary: s?.billingExempt ? 'Abonelik faturalamadan muaf; ödeme ya da deneme takibi gerekmiyor.' : s?.currentPeriodEnd ? `Abonelik sorunsuz; mevcut dönem ${formatDate(s.currentPeriodEnd)} tarihine kadar.` : 'Abonelik sorunsuz.' },
    note: 'Ödeme sağlayıcısı kaydı ve olay geçmişi aşağıdaki ayrıntılarda.',
    checks: ['Abonelik durumu', 'Ödeme toleransı', 'Deneme süresi', 'Planlı iptal'],
    okTitle: 'Bu abonelikte dikkat isteyen bir şey yok',
    busy: ({ errors, top }) =>
      unknown
        ? 'Abonelik okunamadı — hüküm verilemiyor; tekrar deneyin.'
        : errors
          ? `Bu abonelikte şimdi müdahale gereken bir konu var: ${top.title}.`
          : `Bu abonelikte izlenmesi gereken bir konu var: ${top.title}.`,
  })
}

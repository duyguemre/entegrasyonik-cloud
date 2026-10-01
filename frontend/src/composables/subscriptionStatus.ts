/**
 * frontend/src/composables/subscriptionStatus.ts
 *
 * ADR-0008 §3 abonelik durum makinesi — durum → insan-okunur karşılık eşlemesinin TEK kaynağı.
 * `SubscriptionView.vue` (ekran içi durum bandı) ve kabuktaki abonelik bandı
 * (`components/layout/ShellSubscriptionBanner.vue`) aynı eşlemeyi buradan okur (C2.2 madde 1:
 * davranış SubscriptionView'daki ile aynı, yalnızca yeri değişti).
 *
 * Saf modül: Vue/i18n/ağ bağımlılığı yok (vitest: `tests/subscription-status.test.ts`).
 * Yanıt şekli `backend/src/api/services/billing-service.ts` `getMySubscription` ile birebir.
 */
import { formatDate } from '@entegrasyonik/ui/format'

export type SubscriptionStatusTone = 'success' | 'info' | 'warning' | 'error' | 'grey'

export interface SubscriptionStatusMeta {
  label: string
  tone: SubscriptionStatusTone
  icon: string
}

export interface SubscriptionSummary {
  planCode?: string
  status?: string
  trialEndsAt?: string
  currentPeriodEnd?: string
  graceUntil?: string
  cancelAtPeriodEnd?: boolean
  billingExempt?: boolean
}

export interface SubscriptionAccess {
  read: boolean
  write: boolean
  engine: boolean
}

/** `BillingService/getMySubscription` başarılı yanıtının FE'nin kullandığı alt kümesi. */
export interface MySubscriptionResponse {
  status?: string
  subscription?: SubscriptionSummary | null
  access?: SubscriptionAccess
  reason?: string
}

// ADR-0008 §3 durum makinesi -- Türkçe, insan-okunur karşılıklar (ham durum kodu kullanıcıya gösterilmez).
export const SUBSCRIPTION_STATUS_META: Record<string, SubscriptionStatusMeta> = {
  trialing: { label: 'Deneme Sürümü', tone: 'info', icon: 'mdi-timer-sand' },
  active: { label: 'Aktif', tone: 'success', icon: 'mdi-check-circle-outline' },
  past_due: { label: 'Ödeme Bekliyor', tone: 'warning', icon: 'mdi-alert-circle-outline' },
  suspended: { label: 'Askıya Alındı', tone: 'error', icon: 'mdi-pause-circle-outline' },
  canceled: { label: 'İptal edildi', tone: 'error', icon: 'mdi-close-circle-outline' },
  expired: { label: 'Sona Erdi', tone: 'error', icon: 'mdi-calendar-remove-outline' },
  no_subscription: { label: 'Abonelik Yok', tone: 'grey', icon: 'mdi-help-circle-outline' },
}

export function subscriptionStatusMeta(status: string | undefined): SubscriptionStatusMeta {
  return SUBSCRIPTION_STATUS_META[status ?? ''] || SUBSCRIPTION_STATUS_META.no_subscription
}

const dateOf = (val?: string) => (val ? formatDate(val) : '')

/** Abonelik ekranındaki durum bandının açıklama metni (SubscriptionView'dan taşındı, metinler aynı). */
export function subscriptionStatusMessage(status: string | undefined, sub: SubscriptionSummary | null | undefined, reason?: string): string {
  switch (status) {
    case 'trialing':
      return sub?.trialEndsAt
        ? `Deneme sürümündesiniz; ${dateOf(sub.trialEndsAt)} tarihine kadar tüm özellikler açık. Devam etmek için bir plan seçin.`
        : 'Deneme sürümündesiniz. Deneme bitiminde devam etmek için bir plan seçmeniz gerekir.'
    case 'active':
      return 'Aboneliğiniz aktif; tüm özellikler ve pazaryeri senkronizasyonu çalışıyor.'
    case 'past_due':
      return reason || 'Son ödemeniz alınamadı. Lütfen kart bilgilerinizi güncelleyin, aksi halde erişiminiz kısıtlanacak.'
    case 'suspended':
      return reason || 'Aboneliğiniz askıya alındı: verileriniz görüntülenebilir/dışa aktarılabilir ama düzenleme ve pazaryeri senkronizasyonu durduruldu.'
    case 'canceled':
      return sub?.currentPeriodEnd
        ? `Aboneliğiniz iptal edildi -- ${dateOf(sub.currentPeriodEnd)} tarihine kadar tüm özellikler kullanılabilir, sonrasında salt-okunur erişime geçilecek.`
        : 'Aboneliğiniz iptal edildi.'
    case 'expired':
      return reason || 'Aboneliğiniz sona erdi. Devam etmek için bir plan seçin.'
    default:
      return 'Henüz aktif bir aboneliğiniz yok. Aşağıdan bir plan seçerek başlayabilirsiniz.'
  }
}

// ---- Kabuk bandı (C2.2) ----

/** Deneme bandının görünmeye başladığı eşik (gün). Öncesinde bant YOK — her ekranda gürültü olmasın. */
export const TRIAL_BANNER_DAYS = 3

/** Bandın anlam tonu: DS-v2 durum rolleri (`--ek-color-<tone>-*`). `danger` → `error` rolü. */
export type SubscriptionBannerTone = 'info' | 'warning' | 'danger'

/**
 * Bandın hangi metinle gösterileceği. `messageKey` i18n anahtarıdır (`subscriptionBanner.<key>`),
 * `params` o metnin yer tutucularıdır. Başlık ortak eşlemeden (`SUBSCRIPTION_STATUS_META`) gelir.
 */
export interface SubscriptionBannerModel {
  status: 'trialing' | 'past_due' | 'suspended' | 'canceled' | 'expired'
  tone: SubscriptionBannerTone
  icon: string
  title: string
  messageKey: string
  params: Record<string, string | number>
  /** Yalnız deneme bandı oturum içinde küçültülebilir; diğerleri kritik → kapatılamaz/küçültülemez. */
  minimizable: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

function toTime(val?: string): number | null {
  if (!val) return null
  const time = new Date(val).getTime()
  return Number.isFinite(time) ? time : null
}

/** Kalan tam gün (yukarı yuvarlanır: 26 saat → 2 gün). Geçmiş tarih → negatif/0. */
export function daysUntil(val: string | undefined, now: Date): number | null {
  const time = toTime(val)
  if (time === null) return null
  return Math.ceil((time - now.getTime()) / DAY_MS)
}

/**
 * `getMySubscription` yanıtından kabuk bandını türetir; bant gösterilmeyecekse `null`.
 * Kurallar (C2.2 madde 2 + ADR-0008 §3):
 *  - `billingExempt` (legacy), `active`, `no_subscription`, bilinmeyen durum → bant yok.
 *  - `trialing`: yalnız `trialEndsAt` varsa ve son 3 gündeyse (info; küçültülebilir).
 *  - `past_due`: warning; grace tarihi varsa metinde. Motor kapalıysa (grace dolmuş) danger.
 *  - `suspended`: danger — "stok senkronu durdu" (ADR-0008 §3 risk notu: sessiz askı yok).
 *  - `canceled`: dönem sürerken info (dönem sonu tarihi); dönem bitmiş ve motor kapalıysa danger.
 *  - `expired`: danger.
 */
export function resolveSubscriptionBanner(res: MySubscriptionResponse | null | undefined, now: Date = new Date()): SubscriptionBannerModel | null {
  if (!res) return null
  const sub = res.subscription ?? null
  const status = res.status
  if (sub?.billingExempt) return null
  const engineStopped = res.access?.engine === false

  const base = (s: SubscriptionBannerModel['status'], tone: SubscriptionBannerTone, messageKey: string, params: Record<string, string | number> = {}): SubscriptionBannerModel => {
    const meta = subscriptionStatusMeta(s)
    return { status: s, tone, icon: meta.icon, title: meta.label, messageKey, params, minimizable: s === 'trialing' && tone === 'info' }
  }

  switch (status) {
    case 'trialing': {
      const days = daysUntil(sub?.trialEndsAt, now)
      if (days === null || days > TRIAL_BANNER_DAYS) return null
      const date = dateOf(sub?.trialEndsAt)
      if (days <= 0) {
        // Deneme bitti ama durum henüz `suspended`'a geçmedi (geçiş arka plan işinin sorumluluğu).
        return (toTime(sub?.trialEndsAt) ?? 0) < now.getTime()
          ? base('trialing', 'warning', 'trialEnded', { date })
          : base('trialing', 'info', 'trialEndsToday', { date })
      }
      return base('trialing', 'info', 'trialEndsSoon', { days, date })
    }
    case 'past_due': {
      if (engineStopped) return base('past_due', 'danger', 'pastDueStopped')
      const grace = daysUntil(sub?.graceUntil, now)
      return grace !== null && grace > 0
        ? base('past_due', 'warning', 'pastDueGrace', { date: dateOf(sub?.graceUntil) })
        : base('past_due', 'warning', 'pastDue')
    }
    case 'suspended':
      return base('suspended', 'danger', 'suspended')
    case 'canceled': {
      const periodEnd = toTime(sub?.currentPeriodEnd)
      if (engineStopped || (periodEnd !== null && periodEnd < now.getTime())) {
        return periodEnd !== null
          ? base('canceled', 'danger', 'canceledEnded', { date: dateOf(sub?.currentPeriodEnd) })
          : base('canceled', 'danger', 'canceledStopped')
      }
      return periodEnd !== null
        ? base('canceled', 'info', 'canceledUntil', { date: dateOf(sub?.currentPeriodEnd) })
        : base('canceled', 'info', 'canceled')
    }
    case 'expired':
      return base('expired', 'danger', 'expired')
    default:
      return null
  }
}

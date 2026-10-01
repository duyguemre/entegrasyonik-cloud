/**
 * frontend/src/components/dashboard/nextActions.ts
 *
 * FR3 madde 16 — ana sayfanın "ilk ne yapmalıyım" listesi (SAF; `tests/fe-r3b-next-actions.test.ts`).
 * Yalnız backend yanıtlarından türetilir; sayı uydurulmaz, tahmin yapılmaz. Kaynaklar:
 *   OrderService/getOrderDashboardInsights → pending.{shippingCount, invoiceCount, claimCount, messageCount}
 *   StockService/getStockOverview          → attention.{oversold, unmapped}.lines, variants.publishPending
 *   IntegrationService/getIntegrationHealth → integrations[].health (down / degraded / not_configured)
 * Sıra: önce KRİTİK (müşteriyi/kanalı şimdi etkileyen), sonra BUGÜNÜN İŞİ (sipariş akışı), sonra DÜZEN (katalog/kurulum).
 * Aynı öncelikte büyük sayı önce gelmez — iş akışı sırası korunur (kargo → fatura → iade → soru).
 */
import type { IntegrationHealth, OrderInsights, StockOverview } from './dashboardTypes'
import type { DashboardScreen } from './useDashboardNavigation'

export type NextActionLevel = 'critical' | 'today' | 'hygiene'

export interface NextAction {
  key: string
  level: NextActionLevel
  tone: 'danger' | 'warning' | 'info' | 'action' | 'neutral'
  icon: string
  /** Sayılı kısa başlık: "2 sipariş kargoya verilmeyi bekliyor". */
  title: string
  /** Neden / ne yapmalı — tek cümle. */
  text: string
  count: number
  actionLabel: string
  screen: DashboardScreen
  params?: Record<string, unknown>
}

/** İşlem bekleyen ama şu an sıfır olan alanlar ("bekleyen yok" satırı için). */
export interface ClearedItem {
  key: string
  label: string
}

export interface NextActionsInput {
  insights: OrderInsights | null
  stock: StockOverview | null
  health: IntegrationHealth | null
  /** Kanal kodu → görünen ad. */
  channelName: (code: string) => string
}

const LEVEL_ORDER: Record<NextActionLevel, number> = { critical: 0, today: 1, hygiene: 2 }

export function buildNextActions(input: NextActionsInput): { actions: NextAction[]; cleared: ClearedItem[] } {
  const { insights, stock, health, channelName } = input
  const actions: NextAction[] = []
  const cleared: ClearedItem[] = []
  const nf = (n: number) => n.toLocaleString('tr-TR')

  // KRİTİK — aşırı satış ve çalışmayan bağlantı.
  const oversold = stock?.attention?.oversold?.lines ?? 0
  if (oversold > 0) {
    actions.push({
      key: 'oversold', level: 'critical', tone: 'danger', icon: 'mdi-alert-octagon-outline', count: oversold,
      title: `${nf(oversold)} sipariş kaleminde aşırı satış`,
      text: 'Stokta karşılığı olmayan satış var. Stoğu güncelleyin ya da siparişi iptal etmeden önce tedariki kontrol edin.',
      actionLabel: 'Stok sağlığını aç', screen: 'StockHealthView',
    })
  }
  const integrations = health?.integrations ?? []
  const down = integrations.filter((i) => i.enabled && i.health === 'down')
  for (const i of down) {
    actions.push({
      key: `down-${i.integrationCode}`, level: 'critical', tone: 'danger', icon: 'mdi-lan-disconnect', count: 1,
      title: `${channelName(i.integrationCode)} bağlantısına erişilemiyor`,
      text: 'Son 24 saatte bu kanalla yapılan işlemler başarısız oldu. Bağlantı bilgilerini ve hata ayrıntısını kontrol edin.',
      actionLabel: 'Entegrasyon sağlığını aç', screen: 'integrations/IntegrationHealthView',
    })
  }

  // BUGÜNÜN İŞİ — sipariş akışı sırasıyla.
  const p = insights?.pending
  if (p) {
    const today: Array<[string, number, Omit<NextAction, 'key' | 'level' | 'count'>, string]> = [
      ['shipping', p.shippingCount, { tone: 'warning', icon: 'mdi-truck-fast-outline', title: `${nf(p.shippingCount)} sipariş kargoya verilmeyi bekliyor`, text: 'Onaylanmış siparişlerin kargo barkodunu alıp paketleri teslime hazırlayın.', actionLabel: 'Siparişleri aç', screen: 'orderList', params: { internalStatuses: ['APPROVED'] } }, 'Kargo'],
      ['invoice', p.invoiceCount, { tone: 'info', icon: 'mdi-receipt-text-outline', title: `${nf(p.invoiceCount)} siparişin faturası kesilmedi`, text: 'Onaylanmış ama faturası oluşturulmamış siparişler var.', actionLabel: 'Siparişleri aç', screen: 'orderList', params: { internalStatuses: ['APPROVED'] } }, 'Fatura'],
      ['claim', p.claimCount, { tone: 'warning', icon: 'mdi-undo-variant', title: `${nf(p.claimCount)} iade talebi işlem bekliyor`, text: 'Size ulaşan ürünleri inceleyip iadeyi onaylayın ya da gerekçesiyle reddedin.', actionLabel: 'İadeleri aç', screen: 'claimList', params: { internalStatuses: ['WAITING', 'DELIVERED', 'SHIPPED'] } }, 'İade'],
      ['message', p.messageCount, { tone: 'action', icon: 'mdi-message-question-outline', title: `${nf(p.messageCount)} müşteri sorusu yanıt bekliyor`, text: 'Yanıt süresi mağaza puanınızı etkiler; soruları sırayla yanıtlayın.', actionLabel: 'Soruları aç', screen: 'messageList', params: { status: 'WAITING_SELLER' } }, 'Müşteri sorusu'],
    ]
    for (const [key, count, rest, label] of today) {
      if (count > 0) actions.push({ key, level: 'today', count, ...rest })
      else cleared.push({ key, label })
    }
  }

  // DÜZEN — bağlantı kalitesi, eşleşme, aktarım, kurulum.
  for (const i of integrations.filter((x) => x.enabled && x.health === 'degraded')) {
    actions.push({
      key: `degraded-${i.integrationCode}`, level: 'hygiene', tone: 'warning', icon: 'mdi-lan-pending', count: i.last24h?.error ?? 0,
      title: `${channelName(i.integrationCode)} bağlantısı sorunlu`,
      text: `Son 24 saatte ${nf(i.last24h?.error ?? 0)} işlem başarısız oldu; bağlantı çalışıyor ama aksıyor.`,
      actionLabel: 'Entegrasyon sağlığını aç', screen: 'integrations/IntegrationHealthView',
    })
  }
  const unmapped = stock?.attention?.unmapped?.lines ?? 0
  if (unmapped > 0) {
    actions.push({
      key: 'unmapped', level: 'hygiene', tone: 'warning', icon: 'mdi-link-variant-off', count: unmapped,
      title: `${nf(unmapped)} sipariş kalemi ürünle eşleşmedi`,
      text: 'Bu kalemlerin stoğu düşülemiyor. Stok kodu veya barkodu kataloğunuzla eşleştirin.',
      actionLabel: 'Stok sağlığını aç', screen: 'StockHealthView',
    })
  }
  const publishPending = stock?.variants?.publishPending ?? 0
  if (publishPending > 0) {
    actions.push({
      key: 'publish', level: 'hygiene', tone: 'info', icon: 'mdi-cloud-upload-outline', count: publishPending,
      title: `${nf(publishPending)} varyantın stoğu kanallara iletilmeyi bekliyor`,
      text: 'Stok değişikliği henüz kanallara yansımadı; yayın sırası ilerledikçe sayı düşer.',
      actionLabel: 'Stok sağlığını aç', screen: 'StockHealthView',
    })
  }
  for (const i of integrations.filter((x) => x.enabled && (x.health === 'not_configured' || x.credentialsConfigured === false))) {
    actions.push({
      key: `setup-${i.integrationCode}`, level: 'hygiene', tone: 'neutral', icon: 'mdi-cog-outline', count: 1,
      title: `${channelName(i.integrationCode)} kurulumunu tamamlayın`,
      text: 'Kanal etkin ama bağlantı bilgileri eksik; tamamlanana kadar ürün ve sipariş aktarılmaz.',
      actionLabel: 'Entegrasyonları aç', screen: 'marketplace',
    })
  }

  actions.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  return { actions, cleared }
}

/** Saat dilimine göre selamlama (yalnız istemci saati; sayı değil). */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Günaydın'
  if (hour >= 12 && hour < 18) return 'İyi günler'
  return 'İyi akşamlar'
}

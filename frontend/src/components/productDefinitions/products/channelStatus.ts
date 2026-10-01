/**
 * frontend/src/components/productDefinitions/products/channelStatus.ts
 *
 * FR2 madde 21 — ürün listesinde "platform durumu"nun KANAL BAŞINA tek bakışta özeti (SAF; `tests/fe-r2b-channel-status.test.ts`).
 * Varyant durumları `variantListModel.channelState` ile aynı kuraldan (tek kaynak) toplanır; ürün düzeyinde dört ana durum:
 *   hatalı (en az bir varyant reddedildi) > bekliyor (onay/aktarım sürüyor) > yayında (en az biri yayında) > kapalı (onaylı ama
 *   satışa kapalı) > yok (hiç gönderilmedi).
 * "Gönderime hazır" (`platformUploads.<kod>.isReady`) ayrı bayraktır: kullanıcı ürünü o kanal için hazır işaretlemiş (planlama
 * işareti — backend yalnız saklar, aktarım akışı okumaz; gönderim Toplu işlemler → Kanallara yükle).
 * Varyantta hiç kanal verisi yoksa ürünün eski `platformUploads.<kod>.isUploaded` alanı "yayında" sayılır (geri uyum).
 */
import type { StatusTone } from '@/design/status-map'
import { channelState } from '../variants/variantListModel'

export type ProductChannelKey = 'failed' | 'waiting' | 'live' | 'offsale' | 'none'

export interface ProductChannelStatus {
  code: string
  key: ProductChannelKey
  tone: StatusTone
  icon: string
  /** Kısa durum adı (hücre ipucu, ekran okuyucu). */
  label: string
  /** Varyant dağılımı (varyantsız üründe toplam 1). */
  counts: { live: number; offsale: number; failed: number; waiting: number; none: number; total: number }
  /** Ürün bu kanal için "gönderime hazır" işaretli (planlama işareti). */
  ready: boolean
  /** Hatalı/kapalı ise ilk kısa neden. */
  reason?: string
}

const META: Record<ProductChannelKey, { tone: StatusTone; icon: string; label: string }> = {
  failed: { tone: 'danger', icon: 'mdi-alert-circle-outline', label: 'Hatalı' },
  waiting: { tone: 'info', icon: 'mdi-clock-outline', label: 'Onay bekliyor' },
  live: { tone: 'success', icon: 'mdi-check-circle-outline', label: 'Yayında' },
  offsale: { tone: 'warning', icon: 'mdi-pause-circle-outline', label: 'Satışa kapalı' },
  none: { tone: 'neutral', icon: 'mdi-circle-outline', label: 'Gönderilmedi' },
}

export function productChannelStatus(product: any, code: string): ProductChannelStatus {
  const variants: any[] = Array.isArray(product?.variants) && product.variants.length ? product.variants : [{}]
  const counts = { live: 0, offsale: 0, failed: 0, waiting: 0, none: 0, total: variants.length }
  let reason: string | undefined
  for (const v of variants) {
    const s = channelState(v, code)
    if (s.key === 'live') counts.live++
    else if (s.key === 'offsale') counts.offsale++
    else if (s.key === 'failed') counts.failed++
    else if (s.key === 'waiting' || s.key === 'preparing') counts.waiting++
    else counts.none++
    if (!reason && s.reason && (s.key === 'failed' || s.key === 'offsale')) reason = s.reason
  }
  const upload = product?.platformUploads?.[code]
  // Geri uyum: varyantlarda kanal verisi hiç yoksa ürün düzeyindeki "yüklendi" bayrağı yayında sayılır.
  if (counts.none === counts.total && upload?.isUploaded) {
    counts.live = counts.total
    counts.none = 0
  }
  const key: ProductChannelKey = counts.failed
    ? 'failed'
    : counts.waiting
      ? 'waiting'
      : counts.live
        ? 'live'
        : counts.offsale
          ? 'offsale'
          : 'none'
  return { code, key, ...META[key], counts, ready: !!upload?.isReady, ...(reason ? { reason } : {}) }
}

/** Hücre ipucu / erişilebilir ad: "Trendyol: Yayında (2/3 varyant) · gönderime hazır". */
export function channelStatusText(s: ProductChannelStatus, channelTitle: string): string {
  const { counts } = s
  const multi = counts.total > 1
  const parts: string[] = []
  if (s.key === 'failed') parts.push(multi ? `${counts.failed} varyant hatalı` : 'Hatalı')
  else if (s.key === 'waiting') parts.push(multi ? `${counts.waiting} varyant onay bekliyor` : 'Onay bekliyor')
  else if (s.key === 'live') parts.push(multi ? `Yayında (${counts.live}/${counts.total} varyant)` : 'Yayında')
  else parts.push(s.label)
  if (s.key !== 'live' && s.key !== 'none' && counts.live) parts.push(`${counts.live}/${counts.total} yayında`)
  if (s.ready) parts.push('gönderime hazır')
  return `${channelTitle}: ${parts.join(' · ')}`
}

/** Satır özeti: kanal başına en kritik durumların sayısı (hücre altı mikro metin ve filtre ipuçları için). */
export function channelStatusOverview(list: ProductChannelStatus[]): { live: number; failed: number; waiting: number; none: number } {
  return {
    live: list.filter((s) => s.key === 'live').length,
    failed: list.filter((s) => s.key === 'failed').length,
    waiting: list.filter((s) => s.key === 'waiting').length,
    none: list.filter((s) => s.key === 'none' || s.key === 'offsale').length,
  }
}

/**
 * FR3 madde 11 — hücrenin "bir bakış" cümlesi: en kritik durum önce, sade dille ("2 kanalda hata · 1 kanalda yayında").
 * Ton cümlenin rengidir (EkStatusChip ton dili). Gönderilmemiş kanallar cümleye girmez (hücrede "+n" olarak sayılır).
 */
export interface ChannelStatusSummary {
  tone: StatusTone | 'action'
  icon: string
  text: string
  detail?: string
}

export function channelStatusSummary(list: ProductChannelStatus[]): ChannelStatusSummary {
  const n = (k: ProductChannelKey) => list.filter((s) => s.key === k).length
  const failed = n('failed')
  const waiting = n('waiting')
  const live = n('live')
  const offsale = n('offsale')
  const ready = list.filter((s) => s.key === 'none' && s.ready).length
  if (!list.length) return { tone: 'neutral', icon: 'mdi-link-variant-off', text: 'Kanal bağlı değil' }
  const rest = (parts: Array<[number, string]>) => parts.filter(([c]) => c > 0).map(([c, t]) => `${c} ${t}`).join(' · ') || undefined
  if (failed) return { tone: 'danger', icon: META.failed.icon, text: `${failed} kanalda hata`, detail: rest([[waiting, 'bekliyor'], [live, 'yayında']]) }
  if (waiting) return { tone: 'info', icon: META.waiting.icon, text: `${waiting} kanalda onay bekliyor`, detail: rest([[live, 'yayında']]) }
  if (live) return { tone: 'success', icon: META.live.icon, text: live === list.length ? 'Tüm kanallarda yayında' : `${live} kanalda yayında`, detail: rest([[offsale, 'satışa kapalı']]) }
  if (offsale) return { tone: 'warning', icon: META.offsale.icon, text: `${offsale} kanalda satışa kapalı` }
  if (ready) return { tone: 'action', icon: 'mdi-arrow-up-circle-outline', text: 'Gönderime hazır', detail: `${ready} kanal işaretli` }
  return { tone: 'neutral', icon: META.none.icon, text: 'Henüz gönderilmedi' }
}

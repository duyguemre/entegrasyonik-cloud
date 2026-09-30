// A13 — müşteri kartı saf mantığı (tek kaynak): KVKK maskeleme, kimlik, metrik ve adres ayrımı.
// Müşteri listesi, müşteri detayı, sipariş "Alıcı" ve iade "Müşteri" kartları aynı kuralları buradan okur.
// Uydurma veri yok: backend alanı yoksa değer `null` döner, bileşen "—" ya da boş durum gösterir.
import { formatDate, formatMoney, formatPercent, formatPhone } from '@entegrasyonik/ui/format'

/** Backend `anonymizeCustomer` sabiti (ADR-0003 F.23). */
export const ANONYMIZED = '[anonymized]'
/** Maske karakteri (orta nokta — yıldızdan sakin, tabular hizada okunur). */
export const MASK = '•••'

export const isAnonymized = (v: unknown): boolean => typeof v === 'string' && v.trim() === ANONYMIZED
const hasText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && !isAnonymized(v)

/** `+90 (555) 111 22 33` → `+90 (555) ••• •• 33`. Tanınmayan biçimde son 2 hane dışı maskelenir. */
export function maskPhone(value: string | null | undefined): string | null {
  if (!hasText(value)) return null
  const formatted = formatPhone(value)
  const m = /^(\+90 \(\d{3}\)) \d{3} \d{2} (\d{2})$/.exec(formatted)
  if (m) return `${m[1]} ${MASK} •• ${m[2]}`
  const digits = value.replace(/\D/g, '')
  return digits.length > 2 ? `${MASK} ${digits.slice(-2)}` : MASK
}

/** `ayse.yilmaz@alan.com` → `ay•••@alan.com` (yerel kısmın ilk 2 harfi; kısa adda 1). */
export function maskEmail(value: string | null | undefined): string | null {
  if (!hasText(value)) return null
  const at = value.lastIndexOf('@')
  if (at <= 0) return `${value.slice(0, 1)}${MASK}`
  const local = value.slice(0, at)
  const keep = local.length > 3 ? 2 : 1
  return `${local.slice(0, keep)}${MASK}${value.slice(at)}`
}

/** TCKN/VKN → yalnız son 3 hane: `•••••••890`. */
export function maskTaxNumber(value: string | null | undefined): string | null {
  if (!hasText(value)) return null
  const v = value.replace(/\s/g, '')
  return v.length > 3 ? `${'•'.repeat(Math.min(8, v.length - 3))}${v.slice(-3)}` : MASK
}

export type ContactKind = 'phone' | 'email' | 'tax'

export interface ContactValue {
  kind: ContactKind
  /** Görünen metin (maskeli ya da açık). `null` → değer yok. */
  display: string | null
  /** Panoya yazılacak tam değer; kopyalanamıyorsa `null`. */
  copy: string | null
  /** Kaynakta gizli: pazaryeri maskeledi ya da anonimleştirildi (göster/kopya yok). */
  hidden: 'marketplace' | 'anonymized' | null
  /** Bu değer maskeleme anahtarından etkileniyor mu? */
  maskable: boolean
}

/** Tek iletişim değerini ekran durumuna çevirir (maskeli varsayılan; `revealed` açık gösterir). */
export function contactValue(kind: ContactKind, raw: string | null | undefined, opts: { revealed?: boolean; sourceMasked?: boolean } = {}): ContactValue {
  if (isAnonymized(raw)) return { kind, display: null, copy: null, hidden: 'anonymized', maskable: false }
  if (!hasText(raw)) return { kind, display: null, copy: null, hidden: null, maskable: false }
  if (opts.sourceMasked) return { kind, display: null, copy: null, hidden: 'marketplace', maskable: false }
  const open = kind === 'phone' ? formatPhone(raw) : raw.trim()
  const masked = kind === 'phone' ? maskPhone(raw) : kind === 'email' ? maskEmail(raw) : maskTaxNumber(raw)
  return { kind, display: opts.revealed ? open : masked, copy: kind === 'phone' ? raw.replace(/\s/g, '') : raw.trim(), hidden: null, maskable: true }
}

export function initials(first?: string | null, last?: string | null): string {
  const a = hasText(first) ? first.trim()[0] : ''
  const b = hasText(last) ? last.trim()[0] : ''
  return `${a}${b}`.toLocaleUpperCase('tr-TR')
}

export function displayName(c: { firstName?: string | null; lastName?: string | null } | null | undefined, fallback = 'İsimsiz müşteri'): string {
  if (!c) return fallback
  if (isAnonymized(c.firstName)) return 'Anonim müşteri'
  return [c.firstName, c.lastName].filter(hasText).join(' ') || fallback
}

export interface CustomerKind { value: 'corporate' | 'individual'; label: string; icon: string }
export function customerKind(isCorporate?: boolean | null): CustomerKind {
  return isCorporate
    ? { value: 'corporate', label: 'Kurumsal', icon: 'mdi-domain' }
    : { value: 'individual', label: 'Bireysel', icon: 'mdi-account-outline' }
}

/** "Müşteri olma" metni: `createdAt` yoksa `null` (uydurma tarih yok). */
export function customerSince(createdAt?: string | Date | null): string | null {
  if (!createdAt) return null
  const d = formatDate(createdAt)
  return d && d !== '—' ? d : null
}

// --- Metrikler -----------------------------------------------------------------------------------------------
// YALNIZ CustomerRepository.updateOrderMetrics / updateClaimMetrics alanları + backend'in hesapladığı `returnRate`.

export interface CustomerMetricsSource {
  totalOrderCount?: number | null
  totalSpent?: number | null
  lastOrderDate?: string | Date | null
  totalClaimCount?: number | null
  totalReturnAmount?: number | null
}

export interface MetricItem {
  key: 'orders' | 'spent' | 'lastOrder' | 'returnRate'
  label: string
  value: string | null
  hint: string | null
  icon: string
}

export interface MetricSummary {
  /** Hiç sipariş metriği yok (henüz sipariş eşitlenmedi) → boş durum. */
  empty: boolean
  items: MetricItem[]
  /** İade oranı eşik üstündeyse durum tonu (renk + metin; renk tek başına anlam taşımaz). */
  returnTone: 'success' | 'warning' | 'danger' | null
  returnRate: number | null
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** İade oranı yüzdesi (0–100). Backend'in döndürdüğü değer öncelikli; yoksa iki sayaçtan; sipariş yoksa `null`. */
export function returnRatePercent(m: CustomerMetricsSource | null | undefined, backendRate?: number | null): number | null {
  if (!m || !isNum(m.totalOrderCount) || m.totalOrderCount <= 0) return null
  if (isNum(backendRate)) return backendRate
  if (!isNum(m.totalClaimCount)) return null
  return (m.totalClaimCount / m.totalOrderCount) * 100
}

export function returnRateTone(rate: number | null): MetricSummary['returnTone'] {
  if (rate === null) return null
  if (rate > 30) return 'danger'
  if (rate > 15) return 'warning'
  return 'success'
}

/** `null` metrics → `null` (şerit hiç çizilmez: projeksiyon metrik göndermiyor). */
export function metricSummary(m: CustomerMetricsSource | null | undefined, backendRate?: number | null): MetricSummary | null {
  if (!m) return null
  const orders = isNum(m.totalOrderCount) ? m.totalOrderCount : null
  const empty = !orders && !m.lastOrderDate && !(isNum(m.totalSpent) && m.totalSpent > 0)
  const rate = returnRatePercent(m, backendRate)
  const claims = isNum(m.totalClaimCount) ? m.totalClaimCount : null
  const returned = isNum(m.totalReturnAmount) && m.totalReturnAmount > 0 ? m.totalReturnAmount : null
  const items: MetricItem[] = [
    { key: 'orders', label: 'Toplam sipariş', value: orders === null ? null : orders.toLocaleString('tr-TR'), hint: null, icon: 'mdi-cart-outline' },
    { key: 'spent', label: 'Toplam tutar', value: isNum(m.totalSpent) ? formatMoney(m.totalSpent) : null, hint: returned !== null ? `${formatMoney(returned)} iade` : null, icon: 'mdi-cash-multiple' },
    { key: 'lastOrder', label: 'Son sipariş', value: m.lastOrderDate ? formatDate(m.lastOrderDate) : null, hint: null, icon: 'mdi-calendar-clock-outline' },
    { key: 'returnRate', label: 'İade oranı', value: rate === null ? null : formatPercent(rate / 100), hint: claims ? `${claims.toLocaleString('tr-TR')} iade` : null, icon: 'mdi-undo-variant' },
  ]
  return { empty, items, returnTone: returnRateTone(rate), returnRate: rate }
}

// --- Adresler -------------------------------------------------------------------------------------------------

export interface AddressView {
  title: string | null
  /** Açık adres satırı (maskeleme bileşende: gizliyken gösterilmez). */
  line: string | null
  /** İlçe / il (maskelenmez — bölge bilgisi). */
  region: string | null
  postalCode: string | null
  anonymized: boolean
}

type RawAddress = { title?: string; addressLine?: string; addressLine1?: string; addressLine2?: string; city?: string; state?: string; postalCode?: string; isDefaultBilling?: boolean; isDefaultShipping?: boolean } | null | undefined

export function addressView(a: RawAddress): AddressView | null {
  if (!a) return null
  const anonymized = isAnonymized(a.addressLine ?? a.addressLine1) || isAnonymized(a.city)
  const line = [a.addressLine ?? a.addressLine1, a.addressLine2].filter(hasText).join(' ') || null
  const region = [a.state, a.city].filter(hasText).join(' / ') || null
  if (!line && !region && !anonymized) return null
  return { title: hasText(a.title) ? a.title : null, line, region, postalCode: hasText(a.postalCode) ? a.postalCode : null, anonymized }
}

export function sameAddress(a: AddressView | null, b: AddressView | null): boolean {
  return !!a && !!b && a.line === b.line && a.region === b.region
}

/** Müşteri adres havuzundan fatura/teslimat ayrımı: varsayılan işaretli olan; yoksa tek adres her ikisi. */
export function splitCustomerAddresses(addresses: RawAddress[] | null | undefined): { billing: AddressView | null; shipping: AddressView | null } {
  const list = (addresses ?? []).filter(Boolean)
  if (!list.length) return { billing: null, shipping: null }
  const billing = list.find((a) => a?.isDefaultBilling) ?? (list.length === 1 ? list[0] : null)
  const shipping = list.find((a) => a?.isDefaultShipping) ?? (list.length === 1 ? list[0] : list[0])
  return { billing: addressView(billing), shipping: addressView(shipping) }
}

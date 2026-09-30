/**
 * Rehber (S20) seçicileri — sayfaların TEK girişi.
 *
 * - `guides`: KB §12 öncelik sırasıyla (R14, R2, R3, R28, R29, R27, [R26 sözlük], R22, R20, R15, R10, R30, R9, R11, R21).
 * - `getGuideCta()`: sayfa sonundaki Entegrasyonik bağlamı. Metin BURADA UYDURULMAZ: yetenek cümleleri
 *   `getPublicCapabilities()`, kanal adları ve kimlik bilgisi türleri `getPublicIntegrations()` / `getConnectGuide()`
 *   kayıtlarından gelir (roadmap sızmaz). Fatura bağlamı "fatura düzenlemez" olumsuzlamasıyla başlar.
 */
import type { ClusterId, CtaKind, Guide } from './types'
import { mevzuatGuides } from './guides/mevzuat'
import { pazaryeriGuides } from './guides/pazaryerleri'
import { operasyonGuides } from './guides/operasyon'
import { ikinciDalgaGuides } from './guides/ikinci-dalga'
import { sources, type Source, type SourceId } from './sources'
import { getPublicCapabilities } from '../capabilities'
import { getPublicIntegration, getPublicIntegrations } from '../integrations'
import { getConnectGuide } from '../connect'

export const REHBER_PATH = '/rehber'
export const GLOSSARY_PATH = '/rehber/sozluk'

/** KB §12 ilk 15 öncelikli sayfa sırası (sözlük R26 ayrı sayfadır: `/rehber/sozluk`). */
export const PRIORITY_ORDER = ['R14', 'R2', 'R3', 'R28', 'R29', 'R27', 'R22', 'R20', 'R15', 'R10', 'R30', 'R9', 'R11', 'R21']
/** KB §12 "sonraki dalga"dan yayımlananlar (KB sırasıyla). */
export const SECOND_WAVE_ORDER = ['R1', 'R12', 'R16', 'R17', 'R18', 'R23', 'R24', 'R25']
const ORDER = [...PRIORITY_ORDER, ...SECOND_WAVE_ORDER]

const all: Guide[] = [...mevzuatGuides, ...pazaryeriGuides, ...operasyonGuides, ...ikinciDalgaGuides]
const rank = (g: Guide) => {
  const i = ORDER.indexOf(g.kbId)
  return i === -1 ? ORDER.length : i
}
export const guides: Guide[] = [...all].sort((a, b) => rank(a) - rank(b))

export const guideHref = (slug: string): string => `${REHBER_PATH}/${slug}`
export const getGuide = (slug: string): Guide | undefined => guides.find((g) => g.slug === slug)

export interface Cluster {
  id: ClusterId
  title: string
  lead: string
  icon: 'orders' | 'receipt' | 'stock' | 'search'
}

/** Hub konu kümeleri (kullanıcı isteği: Pazaryerleri, Mevzuat & vergi, Operasyon & stok, Seçim rehberi). */
export const clusters: Cluster[] = [
  {
    id: 'pazaryerleri',
    title: 'Pazaryerleri',
    lead: 'Satıcı olma adımları, API erişimi, hakediş ve Türkiye e-ticaret pazarının resmi verileri.',
    icon: 'orders',
  },
  {
    id: 'mevzuat',
    title: 'Mevzuat ve vergi',
    lead: 'Elektronik belgeler, cayma hakkı, iade kargo ve kişisel veriler: kaynaklı ve tarihli özetler.',
    icon: 'receipt',
  },
  {
    id: 'operasyon',
    title: 'Operasyon ve stok',
    lead: 'Tek stokla çok kanal, aşırı satışı önleme ve kendi sitenizi pazaryerleriyle birleştirme.',
    icon: 'stock',
  },
  {
    id: 'secim',
    title: 'Seçim rehberi',
    lead: 'Entegrasyon yazılımı seçerken sorulacak sorular ve sık kullanılan terimlerin sözlüğü.',
    icon: 'search',
  },
]

export const guidesIn = (cluster: ClusterId): Guide[] => guides.filter((g) => g.cluster === cluster)
export const clusterOf = (g: Guide): Cluster => clusters.find((c) => c.id === g.cluster)!

export const sourcesOf = (g: Pick<Guide, 'sources'>): Source[] => g.sources.map((id: SourceId) => sources[id])

/** İlgili sayfalar: yalnızca var olan rehberler (iç bağlantı haritası kırık bağlantı üretmez). */
export const relatedOf = (g: Guide): Guide[] => g.related.map(getGuide).filter((x): x is Guide => Boolean(x))

// ------------------------------------------------------------------------------------------ Entegrasyonik bağlamı

export interface GuideCta {
  title: string
  text: string
  /** Kapsam notu (kısmi yetenek, sınırlı entegrasyon) — kayıttan. */
  note?: string
  link: { label: string; href: string }
}

const listTr = (items: string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`

const cap = (id: string) => {
  const c = getPublicCapabilities().find((x) => x.id === id)
  if (!c) throw new Error(`rehber: görünür yetenek bulunamadı: ${id}`)
  return c
}

const PARTIAL_NOTE = 'Kapsam kanala göre değişir; kanal bazında ayrıntı entegrasyon sayfalarında yazılıdır.'
const partial = (id: string) => (cap(id).status === 'partial' ? PARTIAL_NOTE : undefined)

export function getGuideCta(kind: CtaKind, channel?: string): GuideCta {
  const marketplaces = getPublicIntegrations('marketplace').map((i) => i.name)
  switch (kind) {
    case 'stock':
      return {
        title: 'Aşırı satışa karşı stok rezervasyonu',
        text: `Entegrasyonik'te ${cap('stock-reservation').action.charAt(0).toLocaleLowerCase('tr-TR')}${cap('stock-reservation').action.slice(1)}`,
        note: partial('stock-reservation'),
        link: { label: 'Stok rezervasyonu nasıl çalışır?', href: '/ozellikler/stok-rezervasyonu' },
      }
    case 'channels':
      return {
        title: 'Kanallarınızı tek panelde toplayın',
        text: `Entegrasyonik ${listTr(marketplaces)} mağazalarınızı tek panelde toplar. ${cap('multi-channel-products').summary}`,
        note: partial('multi-channel-products'),
        link: { label: 'Entegrasyonları inceleyin', href: '/entegrasyonlar' },
      }
    case 'invoice': {
      const withInvoice = getPublicIntegrations()
        .filter((i) => i.capabilities.some((c) => c.key === 'invoiceNotice'))
        .map((i) => i.name)
      return {
        title: 'Fatura bağlantısını siparişle iletin',
        text: `Entegrasyonik fatura düzenlemez. ${cap('shipping-invoice-notice').summary} Bu bildirim ${listTr(withInvoice)} için kullanılabilir.`,
        note: partial('shipping-invoice-notice'),
        link: { label: 'Kanal bazında kapsamı görün', href: '/entegrasyonlar' },
      }
    }
    case 'shipping':
      return {
        title: 'Kargo takip bilgisini siparişle iletin',
        text: `Entegrasyonik kargo firmalarıyla doğrudan bağlantı kurmaz ve etiket üretmez. ${cap('shipping-invoice-notice').summary}`,
        note: partial('shipping-invoice-notice'),
        link: { label: 'Kanal bazında kapsamı görün', href: '/entegrasyonlar' },
      }
    case 'returns':
      return {
        title: 'İade taleplerini tek listede yönetin',
        text: cap('returns').action,
        note: partial('returns'),
        link: { label: 'Özellikleri inceleyin', href: '/ozellikler' },
      }
    case 'finance':
      return {
        title: 'Hakedişi panelden izleyin',
        text: cap('finance').action,
        note: partial('finance'),
        link: { label: 'Özellikleri inceleyin', href: '/ozellikler' },
      }
    case 'security':
      return {
        title: 'Anahtarlarınız ve verileriniz nasıl korunur?',
        text: `${cap('secrets-encryption').summary} ${cap('secrets-masked').summary}`,
        link: { label: 'Güvenlik yaklaşımımız', href: '/guvenlik' },
      }
    case 'connect':
    case 'catalog': {
      const i = channel ? getPublicIntegration(channel) : undefined
      const g = i ? getConnectGuide(i.code, i.kind) : undefined
      if (!i || !g) throw new Error(`rehber: mevcut olmayan entegrasyon kodu: ${channel}`)
      return {
        title: `${i.name} bağlantısı`,
        text: `${i.summary} Bağlantı için gereken bilgiler: ${g.credentials.join(', ').toLocaleLowerCase('tr-TR')}.`,
        note: g.note ?? (i.coverage !== 'broad' ? i.limitations[0] : undefined),
        link: { label: `${i.name} bağlantı rehberi ve kapsamı`, href: `/entegrasyonlar/${i.code}` },
      }
    }
  }
}

/** Test ve llms çıktısı için: tüm rehberlerin bağlam kutuları. */
export const allGuideCtas = (): GuideCta[] => guides.map((g) => getGuideCta(g.cta, g.ctaChannel))

/** Okuma süresi (dakika): görünür metnin sözcük sayısından; dakikada ~200 sözcük. */
export function readingMinutes(g: Guide): number {
  const words = [g.answer, ...g.keyPoints, ...g.sections.flatMap((s) => [s.title, ...blockTexts(s.blocks)]), ...g.faq.flatMap((f) => [f.question, f.answer])]
    .join(' ')
    .split(/\s+/).length
  return Math.max(1, Math.round(words / 200))
}

/** Bir sayfanın tüm görünür metin yaprakları (test ve okuma süresi için). */
export function blockTexts(blocks: Guide['sections'][number]['blocks']): string[] {
  return blocks.flatMap((b) => {
    switch (b.type) {
      case 'p':
        return [b.text]
      case 'ul':
        return b.items
      case 'steps':
        return b.items.flatMap((s) => [s.name, s.text])
      case 'table':
        return [b.caption, ...b.head, ...b.rows.flat()]
      case 'callout':
        return [b.title, b.text]
      case 'flow':
        return [b.caption, ...b.items]
    }
  })
}

export function guideTexts(g: Guide): string[] {
  return [
    g.title,
    g.seoTitle,
    g.description,
    g.summary,
    g.answer,
    ...g.keyPoints,
    ...g.sections.flatMap((s) => [s.title, ...blockTexts(s.blocks)]),
    ...g.faq.flatMap((f) => [f.question, f.answer]),
  ]
}

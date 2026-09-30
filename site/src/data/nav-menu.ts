/**
 * Gruplanmış menü modeli (S23, SR2-NAV) — header açılır panelleri, mobil çekmece ve footer sütunları AYNI modelden
 * türer (tek kaynak). Olgusal içerik üretmez: bağlantılar `navigation.ts`, ihtiyaç başlıkları `capabilities.ts`
 * (yalnızca roadmap OLMAYAN yetenekler), kanallar `getPublicIntegrations()`, rehber kümeleri `kb` kaydından gelir.
 */
import { directNav, navGroups, navItemsOf, type NavGroup, type NavIcon, type NavItem } from './navigation'
import { productCapabilities } from './capabilities'
import { getPublicIntegrations, type PublicIntegration } from './integrations'
import { clusters, guideHref, guidesIn } from './kb'

export interface MenuLink {
  label: string
  href: string
  description?: string
  icon?: NavIcon
  badge?: string
  /** S24: masaüstü panelinde öne çıkan kart (bkz. `MenuGroup.feature`). */
  feature?: boolean
}

export interface MenuGroup extends NavGroup {
  /** Panelin ana sütunu (ikonlu bağlantılar). */
  links: MenuLink[]
  /** İkincil sütun: başlık + bağlantılar (Çözümler: kanallar; Kaynaklar: rehber kümeleri). */
  aside?: { title: string; links: MenuLink[]; channels?: PublicIntegration[]; more?: MenuLink }
  /**
   * S24: masaüstü panelinin öne çıkan kartı (ör. Ürün → Otopilot). Bağlantı `links` içinde DE kalır (mobil çekmece ve
   * footer tek listeyi okur); masaüstü paneli onu ana listeden çıkarıp kart olarak gösterir.
   */
  feature?: MenuLink
}

const fromNav = (i: NavItem): MenuLink => ({ label: i.label, href: i.href, description: i.description, icon: i.icon, badge: i.badge, feature: i.feature })

/** "İhtiyaca göre" çözüm bağlantıları: /ozellikler'deki yetenek kartlarına (çapa) gider. */
const NEED_CAPABILITIES: { id: string; icon: NavIcon }[] = [
  { id: 'unified-orders', icon: 'orders' },
  { id: 'returns', icon: 'returns' },
  { id: 'questions', icon: 'chat' },
]

function needLinks(): MenuLink[] {
  return NEED_CAPABILITIES.flatMap(({ id, icon }) => {
    const c = productCapabilities.find((x) => x.id === id && x.status !== 'roadmap')
    return c ? [{ label: c.home?.title ?? c.title, href: `/ozellikler#${c.id}`, icon }] : []
  })
}

export function menuGroups(): MenuGroup[] {
  return navGroups.map((g) => {
    const items = navItemsOf(g.id).map(fromNav)
    if (g.id === 'solutions') {
      return {
        ...g,
        links: [...items, ...needLinks()],
        aside: {
          title: 'Kanala göre',
          links: [],
          channels: getPublicIntegrations(),
          more: { label: 'Tüm entegrasyonlar', href: '/entegrasyonlar' },
        },
      }
    }
    if (g.id === 'resources') {
      return {
        ...g,
        links: items,
        aside: {
          title: 'Rehber konuları',
          links: clusters.flatMap((c) => {
            const first = guidesIn(c.id)[0]
            return first ? [{ label: c.title, href: guideHref(first.slug) }] : []
          }),
        },
      }
    }
    return { ...g, links: items, feature: items.find((l) => l.feature) }
  })
}

/** Üst barda doğrudan bağlantılar (Fiyatlar). */
export const menuDirect = (): MenuLink[] => directNav().map(fromNav)

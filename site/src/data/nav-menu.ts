/**
 * Gruplanmış menü modeli — header açılır panelleri, mobil çekmece ve footer sütunları AYNI modelden türer (tek kaynak).
 * S23: ilk sürüm. S25 (seçkin menü): her panel = ikonlu kartlar (+ Çözümler'de kanal rozetli satırlar) + öne çıkan kart
 * + alt şerit. Olgusal içerik ÜRETİLMEZ: metin/yol `navigation.ts`, kanallar `getPublicIntegrations()`, deneme süresi ve
 * kart şartı plan kaydından (`getPublicTrial`), ajan vaadi `assistant.ts` üzerinden vaat kaydından (`agent-claims.ts`), rehber başlıkları `kb` kaydından.
 */
import {
  FEATURED_GUIDE_SLUG,
  directNav,
  navFeatureCopy,
  navGroups,
  navItemsOf,
  primaryNav,
  published,
  type NavFeatureKind,
  type NavGroup,
  type NavIcon,
  type NavItem,
} from './navigation'
import { getPublicIntegrations, type PublicIntegration } from './integrations'
import { clusterOf, clusters, getGuide, guideHref, guides, guidesIn, readingMinutes } from './kb'
import { getPublicTrial, getTrialPlanCode } from './plans'
import { assistantTeaser } from './assistant'
import { AGENT_BRAND, AGENT_PATH } from './agent-brand'
import { appUrls } from '../lib/site-config'

export interface MenuLink {
  label: string
  href: string
  description?: string
  icon?: NavIcon
  badge?: string
  /** Çözüm satırı: satırda gösterilen kanal rozetleri (kanal sayfalarına gider). */
  channels?: PublicIntegration[]
}

export interface MenuFeature {
  kind: NavFeatureKind
  eyebrow: string
  title: string
  text: string
  cta: { label: string; href: string }
  /** Kart başlığının yanındaki küçük rozet (ör. "Yeni"). */
  badge?: string
  /** Başlık altındaki kısa meta hapları (ör. deneme süresi, okuma süresi). */
  meta?: string[]
  /** Kısa madde listesi (ör. deneme adımları). */
  points?: string[]
}

export interface MenuGroup extends NavGroup {
  /** Panelin ana sütunu (ikonlu kartlar / kanal rozetli çözüm satırları). */
  links: MenuLink[]
  /** İkincil liste (Kaynaklar: rehber konuları). */
  aside?: { title: string; links: MenuLink[] }
  /** Sağdaki öne çıkan kart. */
  feature?: MenuFeature
  /** Panel tabanındaki şerit: cümle + bağlantılar. */
  footer: { text: string; links: MenuLink[] }
}

const fromNav = (i: NavItem): MenuLink => ({
  label: i.label,
  href: i.href,
  description: i.description,
  icon: i.icon,
  badge: i.badge,
  channels: i.channels ? getPublicIntegrations(i.channels) : undefined,
})

function feature(kind: NavFeatureKind): MenuFeature | undefined {
  const copy = navFeatureCopy[kind]
  if (kind === 'agent') {
    const item = published(primaryNav).find((i) => i.href === AGENT_PATH)
    if (!item) return undefined
    return { kind, eyebrow: copy.eyebrow, badge: item.badge, title: AGENT_BRAND, text: assistantTeaser.lead, cta: { label: copy.cta, href: AGENT_PATH } }
  }
  if (kind === 'trial') {
    const code = getTrialPlanCode()
    if (!code) return undefined
    const t = getPublicTrial()
    const days = new Intl.NumberFormat('tr-TR').format(t.days)
    return {
      kind,
      eyebrow: copy.eyebrow,
      title: copy.title!,
      meta: [`${days} gün ücretsiz`, ...(t.cardRequired ? [] : ['Kart gerekmez'])],
      text: copy.text!,
      points: copy.points,
      cta: { label: copy.cta, href: appUrls.register({ plan: code }) },
    }
  }
  const g = getGuide(FEATURED_GUIDE_SLUG) ?? guides[0]
  if (!g) return undefined
  return {
    kind,
    eyebrow: copy.eyebrow,
    title: g.title,
    meta: [clusterOf(g).title, `${readingMinutes(g)} dk okuma`],
    text: g.description,
    cta: { label: copy.cta, href: guideHref(g.slug) },
  }
}

export function menuGroups(): MenuGroup[] {
  return navGroups.map((g) => {
    const items = navItemsOf(g.id)
    const links = items.filter((i) => (i.slot ?? 'card') === 'card').map(fromNav)
    const strip = items.filter((i) => i.slot === 'strip').map((i) => ({ ...fromNav(i), label: i.cta ?? i.label }))
    const base = { ...g, links, feature: feature(g.feature), footer: { text: g.strip, links: strip } }
    if (g.id === 'resources') {
      return {
        ...base,
        aside: {
          title: 'Rehber konuları',
          links: clusters.flatMap((c) => {
            const first = guidesIn(c.id)[0]
            return first ? [{ label: c.title, href: guideHref(first.slug), icon: c.icon }] : []
          }),
        },
      }
    }
    return base
  })
}

/**
 * Footer ve mobil çekmece için grubun DÜZ bağlantı listesi (kartlar + öne çıkan hedef + şerit hedefleri; sayfa
 * adlarıyla). Aynı adrese iki bağlantı üretilmez.
 */
export function flatLinks(g: MenuGroup): MenuLink[] {
  const seen = new Set<string>()
  const byPage = navItemsOf(g.id).map(fromNav)
  return byPage.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)))
}

/** Üst barda doğrudan bağlantılar (Fiyatlar). */
export const menuDirect = (): MenuLink[] => directNav().map(fromNav)

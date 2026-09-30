/**
 * Rehber JSON-LD yardımcıları (S20): Article, HowTo, CollectionPage, DefinedTermSet.
 * `src/lib/seo.ts` (S19 alanı) DEĞİŞTİRİLMEZ; BreadcrumbList/FAQPage oradaki yardımcılarla üretilir.
 * İçerik yalnızca rehber kayıtlarından gelir; Review/AggregateRating gibi değerlendirme düğümleri YOK.
 * Taslak modunda (`siteUrl` yok) URL'ler göreli yol kalır; yayın modunda mutlak olur (seo.ts ile aynı kural).
 */
import { siteConfig } from './site-config'
import { plainKb } from './kb-render'
import type { Guide, GlossaryTerm } from '../data/kb/types'
import type { Source } from '../data/kb/sources'

const abs = (path: string): string => (siteConfig.siteUrl ? new URL(path, siteConfig.siteUrl).href : path)

const ORG = { '@type': 'Organization', name: 'Entegrasyonik', url: abs('/') }

export function articleJsonLd(g: Guide, path: string, sources: Source[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.title,
    description: g.description,
    abstract: plainKb(g.answer),
    inLanguage: 'tr-TR',
    datePublished: g.datePublished,
    dateModified: g.dateModified,
    author: ORG,
    publisher: ORG,
    mainEntityOfPage: abs(path),
    isPartOf: { '@type': 'CollectionPage', name: 'Rehber', url: abs('/rehber') },
    citation: sources.map((s) => ({ '@type': 'CreativeWork', name: s.title, url: s.url, publisher: { '@type': 'Organization', name: s.publisher } })),
  }
}

/** Görünür `steps` bloklarından HowTo (yalnızca `howTo: true` sayfalarda; adımlar sayfada görünür). */
export function howToJsonLd(g: Guide): Record<string, unknown> | undefined {
  if (!g.howTo) return undefined
  const block = g.sections.flatMap((s) => s.blocks).find((b) => b.type === 'steps')
  if (!block || block.type !== 'steps') return undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: g.title,
    description: g.description,
    inLanguage: 'tr-TR',
    step: block.items.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: plainKb(s.text) })),
  }
}

export function collectionJsonLd(name: string, description: string, path: string, parts: Array<{ name: string; path: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    inLanguage: 'tr-TR',
    url: abs(path),
    publisher: ORG,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: parts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: abs(p.path) })),
    },
  }
}

export function definedTermSetJsonLd(name: string, description: string, path: string, terms: GlossaryTerm[], guideHref: (slug: string) => string): Record<string, unknown> {
  const setId = `${abs(path)}#sozluk`
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': setId,
    name,
    description,
    inLanguage: 'tr-TR',
    url: abs(path),
    publisher: ORG,
    hasDefinedTerm: terms.map((t) => ({
      '@type': 'DefinedTerm',
      '@id': `${abs(path)}#${t.id}`,
      name: t.term,
      ...(t.alternate ? { alternateName: t.alternate } : {}),
      description: t.definition,
      termCode: t.id,
      inDefinedTermSet: setId,
      url: `${abs(path)}#${t.id}`,
      ...(t.guide ? { subjectOf: abs(guideHref(t.guide)) } : {}),
    })),
  }
}

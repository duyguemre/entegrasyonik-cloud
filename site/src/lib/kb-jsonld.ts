/**
 * Rehber JSON-LD yardımcıları (S20 içerik, S20b: S19 tek kaynağına bağlandı). `src/lib/seo.ts` `jsonLdFor()` rehber
 * kayıtlarında (`SeoEntry.kb`) `kbJsonLd()`'yi çağırır; sayfa bileşenleri JSON-LD ÜRETMEZ (BaseLayout basar).
 * Türler: hub → sayfa düğümüne ItemList (`mainEntity`) + FAQPage; sözlük → DefinedTermSet; rehber → Article + FAQPage
 * (+ HowTo, yalnızca `howTo: true` ve görünür adımlar). BreadcrumbList S19'dan (SEO kaydındaki kırıntı zinciri).
 * İçerik yalnızca rehber kayıtlarından gelir; Review/AggregateRating gibi değerlendirme düğümleri YOK.
 * Taslak modunda (`siteUrl` yok) URL'ler göreli yol kalır; yayın modunda mutlak olur (seo.ts ile aynı kural).
 */
import { siteConfig } from './site-config'
import { plainKb } from './kb-render'
import { getGuide, guideHref, guides, glossarySorted, sourcesOf, GLOSSARY_PATH, REHBER_PATH } from '../data/kb'
import { HUB, HUB_FAQ } from '../data/kb/hub'
import { GLOSSARY_META } from '../data/kb/glossary'
import { canonicalPath, type SeoEntry } from '../data/seo'
import type { Guide, GlossaryTerm } from '../data/kb/types'
import type { Source } from '../data/kb/sources'

type Node = Record<string, unknown>

const CONTEXT = 'https://schema.org'
const abs = (path: string): string => (siteConfig.siteUrl ? new URL(path, siteConfig.siteUrl).href : path)
/** Sayfa URL'i: canonical biçimi (sondaki eğik çizgi) — BaseLayout canonical'ı ile aynı. */
const pageAbs = (path: string): string => abs(canonicalPath(path))

const ORG = { '@type': 'Organization', name: 'Entegrasyonik', url: abs('/') }

export function articleJsonLd(g: Guide, path: string, sources: Source[]): Node {
  return {
    '@context': CONTEXT,
    '@type': 'Article',
    headline: g.title,
    description: g.description,
    abstract: plainKb(g.answer),
    inLanguage: 'tr-TR',
    datePublished: g.datePublished,
    dateModified: g.dateModified,
    author: ORG,
    publisher: ORG,
    mainEntityOfPage: pageAbs(path),
    isPartOf: { '@type': 'CollectionPage', name: 'Rehber', url: pageAbs(REHBER_PATH) },
    citation: sources.map((s) => ({ '@type': 'CreativeWork', name: s.title, url: s.url, publisher: { '@type': 'Organization', name: s.publisher } })),
  }
}

/** Görünür `steps` bloklarından HowTo (yalnızca `howTo: true` sayfalarda; adımlar sayfada görünür). */
export function howToJsonLd(g: Guide): Node | undefined {
  if (!g.howTo) return undefined
  const block = g.sections.flatMap((s) => s.blocks).find((b) => b.type === 'steps')
  if (!block || block.type !== 'steps') return undefined
  return {
    '@context': CONTEXT,
    '@type': 'HowTo',
    name: g.title,
    description: g.description,
    inLanguage: 'tr-TR',
    step: block.items.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.name, text: plainKb(s.text) })),
  }
}

/** Görünür SSS ile birebir FAQPage (cevaplar düz metin). */
export function kbFaqJsonLd(items: Array<{ question: string; answer: string }>): Node {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({ '@type': 'Question', name: i.question, acceptedAnswer: { '@type': 'Answer', text: plainKb(i.answer) } })),
  }
}

/** Hub sayfa düğümünün (`CollectionPage`) `mainEntity`'si: tüm rehberler + sözlük. */
export function itemListJsonLd(parts: Array<{ name: string; path: string }>): Node {
  return {
    '@type': 'ItemList',
    itemListElement: parts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.name, url: pageAbs(p.path) })),
  }
}

export function definedTermSetJsonLd(name: string, description: string, path: string, terms: GlossaryTerm[], guideHrefOf: (slug: string) => string): Node {
  const url = pageAbs(path)
  const setId = `${url}#sozluk`
  return {
    '@context': CONTEXT,
    '@type': 'DefinedTermSet',
    '@id': setId,
    name,
    description,
    inLanguage: 'tr-TR',
    url,
    publisher: ORG,
    hasDefinedTerm: terms.map((t) => ({
      '@type': 'DefinedTerm',
      '@id': `${url}#${t.id}`,
      name: t.term,
      ...(t.alternate ? { alternateName: t.alternate } : {}),
      description: t.definition,
      termCode: t.id,
      inDefinedTermSet: setId,
      url: `${url}#${t.id}`,
      ...(t.guide ? { subjectOf: pageAbs(guideHrefOf(t.guide)) } : {}),
    })),
  }
}

/** SEO kaydındaki rehber girdisi için ek JSON-LD (sayfa düğümü + BreadcrumbList `seo.ts`'te üretilir). */
export function kbJsonLd(entry: SeoEntry): { nodes: Node[]; mainEntity?: Node } {
  const kb = entry.kb
  if (!kb) return { nodes: [] }
  if (kb.kind === 'hub') {
    return {
      mainEntity: itemListJsonLd([
        ...guides.map((g) => ({ name: g.title, path: guideHref(g.slug) })),
        { name: GLOSSARY_META.title, path: GLOSSARY_PATH },
      ]),
      nodes: [kbFaqJsonLd(HUB_FAQ)],
    }
  }
  if (kb.kind === 'glossary') {
    return { nodes: [definedTermSetJsonLd(GLOSSARY_META.title, GLOSSARY_META.description, GLOSSARY_PATH, glossarySorted(), guideHref)] }
  }
  const g = getGuide(kb.slug)
  if (!g) throw new Error(`rehber: SEO kaydındaki sayfa bulunamadı: ${kb.slug}`)
  const howTo = howToJsonLd(g)
  return {
    nodes: [articleJsonLd(g, entry.path, sourcesOf(g)), kbFaqJsonLd(g.faq), ...(howTo ? [howTo] : [])],
  }
}


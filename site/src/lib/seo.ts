/**
 * JSON-LD yardımcıları (ADR-0014 Karar 2: `/sss` FAQPage şeması; iç sayfalarda BreadcrumbList).
 * İçerik yalnızca çağıranın verdiği (kayıtlı) metinlerdir — burada olgusal iddia üretilmez.
 * Taslak modunda (`siteUrl` yok) bağlantılar göreli yol olarak kalır; yayın modunda mutlak URL olur.
 */
import { siteConfig } from './site-config'
import type { Crumb } from '../components/pages/types'

const abs = (path: string): string => (siteConfig.siteUrl ? new URL(path, siteConfig.siteUrl).href : path)

export function breadcrumbJsonLd(crumbs: Array<Crumb & { path: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: abs(c.path),
    })),
  }
}

export function faqJsonLd(items: Array<{ question: string; answer: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  }
}

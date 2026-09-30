/**
 * Yapılandırılmış veri (JSON-LD, schema.org) + mutlak URL yardımcıları (ADR-0014 Karar 2; S19 tek kaynak).
 *
 * Hangi sayfada hangi düğümün çıkacağı `src/data/seo.ts` kaydındaki `schema` alanından okunur (`jsonLdFor`).
 * İçerik YALNIZCA kayıtlardan gelir (faq/plans/connect/company/integrations) — burada olgusal iddia üretilmez.
 *
 * Bilinçli sınırlar (tests/seo.test.ts korur):
 * - Product / Review / AggregateRating YOK (sahte değerlendirme/puan riski; Google kurallarına da aykırı).
 * - `company.ts` ÖRNEK değerleri (`COMPANY_SAMPLE_VALUES=true`) — adres, telefon, unvan, MERSİS — JSON-LD'ye YAZILMAZ.
 * - SoftwareApplication `offers` yalnızca fiyat kaynağı NİHAİ iken (plan seed "ÖNERİ" değilse) ve yalnızca sabit fiyatlı
 *   planlardan üretilir; öneri fiyatı arama motoruna kesin fiyat gibi sunulmaz.
 * - WebSite `SearchAction` YOK: sitede genel arama yok (SSS süzgeci yalnızca SSS içinde çalışır).
 *
 * Taslak modunda (`siteUrl` yok) bağlantılar göreli yol olarak kalır; yayın modunda mutlak URL olur.
 */
import { siteConfig } from './site-config'
import { contactEmail } from './contact'
import { company, COMPANY_SAMPLE_VALUES, hasValue } from '../data/company'
import { getPublicFaq } from '../data/faq'
import { getConnectGuide } from '../data/connect'
import { getPublicIntegration, type PublicIntegration } from '../data/integrations'
import { getPublicCapabilities } from '../data/capabilities'
import { defaultPlanSource, getPublicPlans, trialOffer, type PlanSource } from '../data/plans'
import {
  SITE_NAME,
  canonicalPath,
  crumbTrail,
  entityDefinition,
  fullTitle,
  ogImageFor,
  type SeoEntry,
} from '../data/seo'

type Node = Record<string, unknown>

const CONTEXT = 'https://schema.org'
const LANGUAGE = 'tr-TR'

/** Mutlak URL (yayın modu) ya da göreli yol (taslak). */
export const abs = (path: string): string => (siteConfig.siteUrl ? new URL(path, siteConfig.siteUrl).href : path)

/** Sayfanın canonical URL'i (sondaki eğik çizgi kuralı `canonicalPath`). */
export const pageUrl = (path: string): string => abs(canonicalPath(path))

const id = (fragment: string) => abs(`/#${fragment}`)
export const ORG_ID = () => id('organization')
export const WEBSITE_ID = () => id('website')
export const SOFTWARE_ID = () => id('software')

export function organizationJsonLd(): Node {
  const node: Node = {
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': ORG_ID(),
    name: SITE_NAME,
    url: abs('/'),
    logo: { '@type': 'ImageObject', url: abs('/icon-512.png'), width: 512, height: 512 },
    description: entityDefinition(),
    email: contactEmail,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: contactEmail,
      availableLanguage: ['Turkish'],
    },
  }
  // ÖRNEK değerler yapılandırılmış veriye girmez (yayın öncesi gerçek değer + bayrak false).
  if (!COMPANY_SAMPLE_VALUES) {
    if (hasValue(company.legalName)) node.legalName = company.legalName
    if (hasValue(company.address)) node.address = company.address
    if (hasValue(company.phone)) node.telephone = company.phone
  }
  return node
}

export function websiteJsonLd(): Node {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': WEBSITE_ID(),
    name: SITE_NAME,
    url: abs('/'),
    inLanguage: LANGUAGE,
    description: entityDefinition(),
    publisher: { '@id': ORG_ID() },
  }
}

/** Nihai fiyat varsa sabit fiyatlı planlardan Offer listesi; yoksa `undefined` (alan hiç yazılmaz). */
export function softwareOffers(source: PlanSource = defaultPlanSource): Node[] | undefined {
  if (source.proposal) return undefined
  const fixed = getPublicPlans(source).filter((p) => p.priceKind === 'fixed' && p.priceMinor > 0)
  if (fixed.length === 0) return undefined
  const plans = source.readPlans()
  return fixed.map((p) => ({
    '@type': 'Offer',
    name: p.name,
    price: (p.priceMinor / 100).toFixed(2),
    priceCurrency: 'TRY',
    url: pageUrl('/fiyatlandirma'),
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: (p.priceMinor / 100).toFixed(2),
      priceCurrency: 'TRY',
      billingDuration: p.interval === 'year' ? 'P1Y' : 'P1M',
      valueAddedTaxIncluded: plans.find((r) => r.code === p.code)?.vatIncluded === true,
    },
  }))
}

export function softwareApplicationJsonLd(source: PlanSource = defaultPlanSource): Node {
  const offers = softwareOffers(source)
  const node: Node = {
    '@context': CONTEXT,
    '@type': 'SoftwareApplication',
    '@id': SOFTWARE_ID(),
    name: SITE_NAME,
    url: abs('/'),
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Pazaryeri entegrasyonu ve stok yönetimi',
    operatingSystem: 'Web',
    inLanguage: LANGUAGE,
    description: entityDefinition(),
    featureList: getPublicCapabilities('core').map((c) => c.title),
    publisher: { '@id': ORG_ID() },
  }
  if (offers) node.offers = offers
  return node
}

const PAGE_TYPES = ['WebPage', 'CollectionPage', 'ContactPage', 'FAQPage'] as const

/** Sayfa düğümü (WebPage/CollectionPage/ContactPage; SSS'de FAQPage + mainEntity). */
export function webPageJsonLd(entry: SeoEntry): Node {
  const type = PAGE_TYPES.find((t) => entry.schema.includes(t)) ?? 'WebPage'
  const node: Node = {
    '@context': CONTEXT,
    '@type': type,
    '@id': `${pageUrl(entry.path)}#webpage`,
    url: pageUrl(entry.path),
    name: fullTitle(entry),
    description: entry.description,
    inLanguage: LANGUAGE,
    isPartOf: { '@id': WEBSITE_ID() },
    primaryImageOfPage: { '@type': 'ImageObject', url: abs(ogImageFor(entry)) },
  }
  if (entry.path !== '/' && entry.crumb) node.breadcrumb = { '@id': `${pageUrl(entry.path)}#breadcrumb` }
  if (entry.section === 'product' || entry.section === 'integrations') node.about = { '@id': SOFTWARE_ID() }
  if (type === 'FAQPage') {
    node.mainEntity = getPublicFaq().map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    }))
  }
  return node
}

export function breadcrumbJsonLd(crumbs: Array<{ label: string; path: string }>, pagePath?: string): Node {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    ...(pagePath ? { '@id': `${pageUrl(pagePath)}#breadcrumb` } : {}),
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: pageUrl(c.path),
    })),
  }
}

/** FAQPage (tek başına) — geriye dönük yardımcı; sayfalar `jsonLdFor` kullanır. */
export function faqJsonLd(items: Array<{ question: string; answer: string }>): Node {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  }
}

/**
 * Bağlantı rehberi adımları — sayfadaki numaralı rehber ve HowTo JSON-LD'si AYNI diziyi kullanır.
 * Hesap açma adımı + kayıttaki adımlar (+ pazaryerlerinde bağlantı durumu kontrolü; SSS `teknik-bilgi` kanıtı).
 */
export function guideSteps(i: PublicIntegration): string[] {
  const guide = getConnectGuide(i.code, i.kind)
  if (!guide) return []
  const accountStep = trialOffer.cardRequired
    ? 'Entegrasyonik hesabınızı oluşturun.'
    : 'Entegrasyonik hesabınızı oluşturun; ücretsiz deneme için kart bilgisi istenmez.'
  const statusStep =
    i.kind === 'marketplace'
      ? 'Bağlantı durumunu kontrol edin: bilgiler hatalıysa bağlantı pasif görünür; bilgileri düzeltip yeniden kaydedin.'
      : undefined
  return [accountStep, ...guide.steps, ...(statusStep ? [statusStep] : [])]
}

export function howToJsonLd(i: PublicIntegration, description: string): Node | undefined {
  const guide = getConnectGuide(i.code, i.kind)
  if (!guide) return undefined
  return {
    '@context': CONTEXT,
    '@type': 'HowTo',
    name: `${i.name} entegrasyonu nasıl bağlanır`,
    description,
    inLanguage: LANGUAGE,
    supply: guide.credentials.map((c) => ({ '@type': 'HowToSupply', name: c })),
    tool: [{ '@type': 'HowToTool', name: SITE_NAME }],
    step: guideSteps(i).map((text, idx) => ({
      '@type': 'HowToStep',
      position: idx + 1,
      name: `Adım ${idx + 1}`,
      text,
      url: `${pageUrl(`/entegrasyonlar/${i.code}`)}#rehber-adim-${idx + 1}`,
    })),
  }
}

/** Kayıttaki `schema` alanına göre sayfanın tüm JSON-LD düğümleri (sıra: sayfa, breadcrumb, ek düğümler). */
export function jsonLdFor(entry: SeoEntry): Node[] {
  const nodes: Node[] = [webPageJsonLd(entry)]
  const trail = crumbTrail(entry.path)
  if (trail.length > 0) nodes.push(breadcrumbJsonLd(trail, entry.path))
  if (entry.schema.includes('Organization')) nodes.push(organizationJsonLd())
  if (entry.schema.includes('WebSite')) nodes.push(websiteJsonLd())
  if (entry.schema.includes('SoftwareApplication')) nodes.push(softwareApplicationJsonLd())
  if (entry.schema.includes('HowTo') && entry.integrationCode) {
    const integration = getPublicIntegration(entry.integrationCode)
    const howTo = integration ? howToJsonLd(integration, entry.description) : undefined
    if (howTo) nodes.push(howTo)
  }
  return nodes
}

/** `</script>` erken kapanmasını engelleyen serileştirme (veri bloğu; CSP `script-src 'self'` ile uyumlu). */
export const serializeJsonLd = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c')

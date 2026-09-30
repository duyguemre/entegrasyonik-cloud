/**
 * SEO KAYDI (S19) — sayfa başına arama/paylaşım/LLM meta verisinin TEK KAYNAĞI.
 *
 * Her derlenen HTML sayfası burada kayıtlıdır; `BaseLayout` başlık, açıklama, canonical, robots, OG/Twitter, JSON-LD
 * türleri ve markdown alternatifi kararını YALNIZCA bu kayıttan okur. Kayıtsız bir sayfa derlemede hata verir ve
 * `tests/seo.test.ts` derlenen her HTML'in kayıtlı olduğunu doğrular (yeni sayfa = kayıt girdisi zorunlu).
 *
 * Aynı kayıt şunları da besler: sitemap (yalnızca `index: true` + gerçek lastmod), robots.txt (önizleme yolları),
 * llms.txt / llms-full.txt (sayfa listesi + kısa açıklama), sayfa başına `/yol.md` markdown alternatifi, OG görseli.
 *
 * Kurallar:
 * - Başlık şablonu: `<sayfa başlığı> · Entegrasyonik` (marka sonda); tam başlık ≤ 60 karakter (test).
 * - Açıklama: sayfaya özgü, 70–155 karakter, site içinde benzersiz (test).
 * - Olgusal iddia burada üretilmez: kanal adları `getPublicIntegrations()`'tan gelir (roadmap sızmaz).
 * - Bu modül derleme yapılandırmasından (astro.config.mjs) da okunur → `?raw`/token gibi Vite'a özgü içe aktarma YOK.
 */
import { getPublicIntegrations, type IntegrationKind, type PublicIntegration } from './integrations'
import { getConnectGuide } from './connect'
import { legalDocs, legalHref, LEGAL_REVIEWED } from './legal'
import { ASSISTANT_PATH, assistantLlms } from './assistant'
import { AGENT_BRAND, AGENT_DESCRIPTOR, AGENT_NAME } from './agent-brand'
import { clusterOf, guideHref, guides, GLOSSARY_PATH, REHBER_PATH } from './kb'
import { HUB } from './kb/hub'
import { GLOSSARY_META } from './kb/glossary'

export const SITE_NAME = 'Entegrasyonik'
export const TITLE_SEPARATOR = ' · '
export const TITLE_MAX = 60
export const DESCRIPTION_MIN = 70
export const DESCRIPTION_MAX = 155

/** schema.org düğüm türleri (Product/Review/AggregateRating BİLİNÇLİ OLARAK YOK — sahte değerlendirme riski). */
export type SchemaNode =
  | 'Organization'
  | 'WebSite'
  | 'SoftwareApplication'
  | 'WebPage'
  | 'CollectionPage'
  | 'ContactPage'
  | 'FAQPage'
  | 'HowTo'
  | 'BreadcrumbList'
  | 'Article'
  | 'DefinedTermSet'

export type SeoSection = 'product' | 'integrations' | 'help' | 'company' | 'legal' | 'system' | 'rehber'

/** Rehber (S20) sayfasının bilgi merkezi kaydı: JSON-LD (Article/FAQPage/HowTo/DefinedTermSet/ItemList) buradan üretilir. */
export type KbRef = { kind: 'hub' } | { kind: 'glossary' } | { kind: 'guide'; slug: string }

export interface SeoEntry {
  /** Köke göreli yol, sondaki eğik çizgi YOK ('/' hariç). Canonical biçimi `canonicalPath()` ile üretilir. */
  path: string
  /** Sayfa başlığı (marka eki olmadan). */
  title: string
  description: string
  /** false → `noindex,nofollow`, sitemap/llms/markdown dışı. */
  index: boolean
  /** Görünür ekmek kırıntısı etiketi (ana sayfada yok). */
  crumb?: string
  /** Üst sayfa yolu (ekmek kırıntısı zinciri). Verilmezse '/'. */
  parent?: string
  /** Sayfanın ana schema.org türü + ek düğümler (BreadcrumbList iç sayfalarda otomatik eklenir). */
  schema: SchemaNode[]
  /** OG görselindeki üst etiket (kısa bölüm adı). */
  ogEyebrow: string
  section: SeoSection
  /** llms.txt satır açıklaması (kısa; olgu yalnızca kayıtlardan). */
  llmsSummary: string
  /** Yalnızca derleme önizlemesi (SITE_PREVIEW_ROUTES) — robots.txt'te Disallow. */
  previewOnly?: boolean
  /** lastmod için kaynak dosyalar (site/ köküne göreli). */
  sources: string[]
  /**
   * Geliştirme aşamasındaki (henüz kullanıma açık olmayan) bir özelliği tanıtan sayfa: llms.txt / llms-full.txt /
   * markdown çıktısında "geliştirme aşamasında" notuyla geçer (yol haritası dili YOK; tests/seo.test.ts korur).
   */
  upcoming?: boolean
  /** İlgili entegrasyon kodu (HowTo/OG için). */
  integrationCode?: string
  /** Rehber sayfası (S20b): içerik ve JSON-LD `src/data/kb/**` kaydından. */
  kb?: KbRef
}

const KIND_PHRASE: Record<IntegrationKind, string> = {
  marketplace: 'pazaryerlerini',
  ecommerce: 'e-ticaret altyapısını',
  erp: 'ERP / muhasebe yazılımını',
  shipping: 'kargo firmalarını',
  einvoice: 'fatura sağlayıcılarını',
}

const listTr = (items: string[]): string =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`

/**
 * "Entegrasyonik nedir?" — her yüzeyde (footer, llms*, markdown alternatifleri, Organization/SoftwareApplication
 * açıklaması) AYNI varlık tanımı. Kanal adları yalnızca `available` kayıtlardan; tür sırası kayıttaki sıradır.
 */
export function entityDefinition(integrations: PublicIntegration[] = getPublicIntegrations()): string {
  const kinds: IntegrationKind[] = []
  for (const i of integrations) if (!kinds.includes(i.kind)) kinds.push(i.kind)
  const groups = kinds.map((k) => `${listTr(integrations.filter((i) => i.kind === k).map((i) => i.name))} ${KIND_PHRASE[k]}`)
  return (
    `${SITE_NAME}, çok kanallı satış yapan işletmeler için web tabanlı pazaryeri entegrasyonu ve stok yönetimi platformudur. ` +
    `${listTr(groups)} tek panelde buluşturur; ürün, stok, sipariş ve iade süreçlerini tek yerden yönetmenizi sağlar ve ` +
    `stok rezervasyonuyla aşırı satış riskini azaltır.`
  )
}

/** Kısa slogan (llms.txt alıntı satırı, OG alt satırı). */
export const TAGLINE =
  'Entegrasyonik, pazaryerlerindeki ürün, stok, sipariş ve iade süreçlerinizi tek panelde toplar; stok rezervasyonuyla aşırı satış riskini azaltır.'

const STATIC_ENTRIES: SeoEntry[] = [
  {
    path: '/',
    title: 'Pazaryeri entegrasyonu ve stok yönetimi',
    description: TAGLINE,
    index: true,
    schema: ['WebPage', 'Organization', 'WebSite', 'SoftwareApplication'],
    ogEyebrow: 'Pazaryeri entegrasyonu',
    section: 'product',
    llmsSummary: 'Ürün özeti: yetenekler, bağlanabilen kanallar, fiyatlandırma özeti ve SSS önizlemesi.',
    sources: ['src/pages/index.astro', 'src/components/home', 'src/data/capabilities.ts', 'src/data/integrations.ts'],
  },
  {
    path: '/ozellikler',
    title: 'Özellikler: stok, sipariş, iade ve mesajlar',
    description:
      'Eşzamanlı siparişte stok rezervasyonu, tek listede siparişler, iade onayı, müşteri soruları ve hakediş takibi: özellikler ve kanal kapsamları.',
    index: true,
    crumb: 'Özellikler',
    schema: ['WebPage'],
    ogEyebrow: 'Özellikler',
    section: 'product',
    llmsSummary: 'Ürün yetenekleri ve her yeteneğin hangi kanallarda desteklendiği.',
    sources: ['src/pages/ozellikler.astro', 'src/data/capabilities.ts', 'src/data/feature-details.ts'],
  },
  {
    path: '/ozellikler/stok-rezervasyonu',
    title: 'Aşırı satış (overselling) nasıl önlenir?',
    description:
      'Eşzamanlı siparişlerde stok yalnızca mevcut adet kadar rezerve edilir, eksiye düşmez; aşırı satış işaretlenip telafi akışına alınır.',
    index: true,
    crumb: 'Stok rezervasyonu',
    parent: '/ozellikler',
    schema: ['WebPage'],
    ogEyebrow: 'Özellik',
    section: 'product',
    llmsSummary: 'Aşırı satış (overselling) nasıl önlenir: eşzamanlı siparişte stok rezervasyonunun çalışma biçimi.',
    sources: ['src/pages/ozellikler/stok-rezervasyonu.astro', 'src/data/capabilities.ts'],
  },
  {
    path: '/entegrasyonlar',
    title: 'Pazaryeri, e-ticaret ve ERP entegrasyonları',
    description:
      'Pazaryerlerinizi, e-ticaret altyapınızı ve ERP sisteminizi tek panelde buluşturun; her entegrasyonun kapsamı kanal bazında açıkça yazılıdır.',
    index: true,
    crumb: 'Entegrasyonlar',
    schema: ['CollectionPage'],
    ogEyebrow: 'Entegrasyonlar',
    section: 'integrations',
    llmsSummary: 'Bugün bağlanabilen tüm entegrasyonlar, türleri ve kapsam düzeyleri.',
    sources: ['src/pages/entegrasyonlar/index.astro', 'src/data/integrations.ts'],
  },
  {
    path: '/fiyatlandirma',
    title: 'Fiyatlandırma',
    description:
      'Entegrasyonik planlarını karşılaştırın: kanal, ürün varyantı ve kullanıcı limitleri, ücretsiz deneme ve fiyatlandırma hakkında sık sorulan sorular.',
    index: true,
    crumb: 'Fiyatlandırma',
    schema: ['WebPage'],
    ogEyebrow: 'Fiyatlandırma',
    section: 'product',
    llmsSummary: 'Planlar, limitler ve ücretsiz deneme koşulları (fiyatlar öneri aşamasındaysa sayfada belirtilir).',
    sources: ['src/pages/fiyatlandirma.astro', 'src/data/plans.ts', 'src/data/pricing.ts'],
  },
  {
    path: '/guvenlik',
    title: 'Güvenlik ve KVKK ilkeleri',
    description:
      'Veri izolasyonu, şifreli saklanan entegrasyon sırları, rol tabanlı erişim, denetim izi, KVKK kapsamında veri işleme ve yedekleme ilkeleri.',
    index: true,
    crumb: 'Güvenlik',
    schema: ['WebPage'],
    ogEyebrow: 'Güvenlik',
    section: 'company',
    llmsSummary: 'Veri izolasyonu, sırların şifrelenmesi, erişim denetimi ve KVKK ilkeleri.',
    sources: ['src/pages/guvenlik.astro', 'src/data/security-principles.ts', 'src/data/capabilities.ts'],
  },
  {
    path: '/sss',
    title: 'Sık sorulan sorular',
    description:
      'Entegrasyonik hakkında sık sorulan sorular: kurulum, pazaryeri uyumu, merkezi stok ve overselling koruması, güvenlik, fiyatlandırma ve destek.',
    index: true,
    crumb: 'Sık sorulan sorular',
    schema: ['FAQPage'],
    ogEyebrow: 'SSS',
    section: 'help',
    llmsSummary: 'Soru-cevap biçiminde kurulum, kanal uyumu, stok, güvenlik, fiyat ve destek soruları.',
    sources: ['src/pages/sss.astro', 'src/data/faq.ts'],
  },
  {
    path: '/destek',
    title: 'Destek merkezi',
    description:
      'Başlangıç ve kurulum, kanal bağlama rehberleri, stok ve sipariş, hesap ve güvenlik, fiyat ve fatura soruları: Entegrasyonik destek merkezi.',
    index: true,
    crumb: 'Destek merkezi',
    schema: ['WebPage'],
    ogEyebrow: 'Destek',
    section: 'help',
    llmsSummary: 'Kategorili yardım: kurulum, kanal bağlama, stok ve sipariş, hesap güvenliği, fiyat ve fatura.',
    sources: ['src/pages/destek.astro', 'src/data/faq.ts'],
  },
  {
    path: '/iletisim',
    title: 'İletişim ve kurumsal teklif',
    description:
      'Entegrasyonik ile iletişime geçin: kurumsal teklif, genel sorular, yeni kanal talepleri ve mevcut müşteri destek talepleri için e-posta.',
    index: true,
    crumb: 'İletişim',
    schema: ['ContactPage'],
    ogEyebrow: 'İletişim',
    section: 'company',
    llmsSummary: 'E-posta ile iletişim: kurumsal teklif, genel sorular ve kanal talepleri.',
    sources: ['src/pages/iletisim.astro', 'src/data/company.ts'],
  },
  {
    // S18 (içerik kararları S18'e ait) → S22: ad/rota/başlık/ekmek kırıntısı TEK ad sabitinden (src/data/agent-brand.ts).
    // Vizyon sayfası — platformun bugünkü sürümünde YOK; LLM metinlerinde `assistantLlms.short` ("geliştirme aşamasında").
    path: ASSISTANT_PATH,
    title: `${AGENT_BRAND}: ${AGENT_DESCRIPTOR}`,
    description: `${AGENT_NAME}: stok, sipariş ve katalog işlerinizi izleyecek, öneri getirecek ve onayınızla uygulayacak ajanlar. Geliştirme aşamasında.`,
    index: true,
    upcoming: true,
    crumb: AGENT_BRAND,
    schema: ['WebPage'],
    ogEyebrow: 'Geliştirme aşamasında',
    section: 'product',
    llmsSummary: assistantLlms.short,
    sources: ['src/pages/[ajan].astro', 'src/data/assistant.ts', 'src/data/agent-brand.ts', 'src/components/assistant'],
  },
  {
    path: '/404',
    title: 'Sayfa bulunamadı',
    description:
      'Aradığınız sayfa bulunamadı. Ana sayfaya dönebilir, sık sorulan sorularda arama yapabilir veya site haritasındaki sayfalara geçebilirsiniz.',
    index: false,
    schema: ['WebPage'],
    ogEyebrow: 'Entegrasyonik',
    section: 'system',
    llmsSummary: '',
    sources: ['src/pages/404.astro'],
  },
  {
    path: '/bilesen-onizleme',
    title: 'Bileşen önizleme',
    description:
      'Yalnızca yerel geliştirme derlemesinde bulunan bileşen önizleme sayfası; arama motorlarına ve yapay zeka tarayıcılarına kapalıdır.',
    index: false,
    previewOnly: true,
    schema: ['WebPage'],
    ogEyebrow: 'Önizleme',
    section: 'system',
    llmsSummary: '',
    sources: ['src/dev/bilesen-onizleme.astro'],
  },
]

/** Entegrasyon detay sayfaları: yalnızca `available` kayıtlardan (roadmap için sayfa ve kayıt YOK). */
function integrationEntries(): SeoEntry[] {
  return getPublicIntegrations().map((i) => {
    const guide = getConnectGuide(i.code, i.kind)
    const credentials = guide ? guide.credentials.map((c) => c.toLocaleLowerCase('tr-TR')).join(', ') : ''
    const long = guide
      ? `${i.name} entegrasyonunu kod yazmadan adım adım bağlayın: gereken bilgiler (${credentials}), desteklenen işlemler ve bilinen sınırlar.`
      : ''
    const description =
      guide && long.length <= DESCRIPTION_MAX
        ? long
        : `${i.name} entegrasyonunu kod yazmadan adım adım bağlayın: gereken bilgiler, desteklenen işlemler ve bilinen sınırlar.`
    return {
      path: `/entegrasyonlar/${i.code}`,
      title: `${i.name} entegrasyonu: kurulum ve kapsam`,
      description,
      index: true,
      crumb: i.name,
      parent: '/entegrasyonlar',
      schema: guide ? ['WebPage', 'HowTo'] : ['WebPage'],
      ogEyebrow: `${i.kindLabel} entegrasyonu`,
      section: 'integrations',
      llmsSummary: `${i.kindLabel}, ${i.coverageLabel.toLocaleLowerCase('tr-TR')}. Bağlantı rehberi, desteklenen işlemler ve sınırlar.`,
      sources: ['src/pages/entegrasyonlar/[code].astro', 'src/data/integrations.ts', 'src/data/connect.ts'],
      integrationCode: i.code,
    } satisfies SeoEntry
  })
}

/**
 * Yasal sayfalar: hukuki onay (`LEGAL_REVIEWED`) gelene kadar `noindex` (taslak metin arama sonuçlarında görünmesin);
 * onaydan sonra kendiliğinden indekslenir, sitemap/llms'e girer. Açıklama belge kaydından; uzunsa kısaltılmış özel metin.
 */
const LEGAL_DESCRIPTION_OVERRIDES: Record<string, string> = {
  'abonelik-sozlesmesi':
    'Entegrasyonik abonelik şartları: ücretsiz deneme, ücretli plana geçiş, yenileme, ödeme sorunu, askı, iptal, fiyat değişikliği ve veri işleme (taslak).',
}

function legalEntries(): SeoEntry[] {
  return legalDocs.map((d) => ({
    path: legalHref(d.slug),
    title: d.title,
    description: LEGAL_DESCRIPTION_OVERRIDES[d.slug] ?? d.description,
    index: LEGAL_REVIEWED,
    crumb: d.title,
    schema: ['WebPage'],
    ogEyebrow: 'Yasal',
    section: 'legal',
    llmsSummary: LEGAL_REVIEWED ? d.description : 'Taslak, hukuki incelemeyi bekliyor.',
    sources: ['src/layouts/LegalLayout.astro', `src/data/legal/${d.slug}.ts`],
  }))
}

/**
 * Rehber / bilgi merkezi (S20 içeriği, S20b kaydı): hub, sözlük ve her rehber sayfası. Başlık/açıklama/tarih
 * `src/data/kb/**` kayıtlarından (S20 içerik kuralları orada; tests/rehber.test.ts). JSON-LD türleri:
 * hub → CollectionPage (+ ItemList) + FAQPage; sözlük → DefinedTermSet; rehber → Article + FAQPage (+ HowTo).
 * Bu sayfalar ÜRÜN iddiası değil kaynaklı bilgi içeriğidir: `about: SoftwareApplication` bağlanmaz (section 'rehber').
 */
function rehberEntries(): SeoEntry[] {
  const kbSources = ['src/data/kb', 'src/components/rehber']
  return [
    {
      path: REHBER_PATH,
      title: HUB.seoTitle,
      description: HUB.description,
      index: true,
      crumb: 'Rehber',
      schema: ['CollectionPage', 'FAQPage'],
      ogEyebrow: 'Rehber',
      section: 'rehber',
      llmsSummary: 'Pazaryerinde satış, mevzuat ve stok operasyonu üzerine kaynaklı ve tarihli rehberlerin dizini.',
      sources: ['src/pages/rehber/index.astro', ...kbSources],
      kb: { kind: 'hub' },
    },
    {
      path: GLOSSARY_PATH,
      title: GLOSSARY_META.seoTitle,
      description: GLOSSARY_META.description,
      index: true,
      crumb: 'Sözlük',
      parent: REHBER_PATH,
      schema: ['WebPage', 'DefinedTermSet'],
      ogEyebrow: 'Rehber · Sözlük',
      section: 'rehber',
      llmsSummary: 'Pazaryeri, stok, API ve mevzuat terimlerinin kısa tanımları; her terimin kalıcı çapası vardır.',
      sources: ['src/pages/rehber/sozluk.astro', ...kbSources],
      kb: { kind: 'glossary' },
    },
    ...guides.map(
      (g) =>
        ({
          path: guideHref(g.slug),
          title: g.seoTitle,
          description: g.description,
          index: true,
          crumb: g.title,
          parent: REHBER_PATH,
          schema: g.howTo ? ['WebPage', 'Article', 'FAQPage', 'HowTo'] : ['WebPage', 'Article', 'FAQPage'],
          ogEyebrow: `Rehber · ${clusterOf(g).title}`,
          section: 'rehber',
          llmsSummary: g.summary,
          sources: ['src/pages/rehber/[...slug].astro', ...kbSources],
          kb: { kind: 'guide', slug: g.slug },
        }) satisfies SeoEntry,
    ),
  ]
}

export const seoEntries: SeoEntry[] = [...STATIC_ENTRIES, ...integrationEntries(), ...rehberEntries(), ...legalEntries()]

/** '/sss/' | '/sss/index.html' | '/404.html' → '/sss' | '/404'. */
export function normalizePath(pathname: string): string {
  let p = pathname.replace(/index\.html$/, '').replace(/\.html$/, '')
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p || '/'
}

export function findSeoEntry(pathname: string): SeoEntry | undefined {
  const p = normalizePath(pathname)
  return seoEntries.find((e) => e.path === p)
}

export function getSeoEntry(pathname: string): SeoEntry {
  const entry = findSeoEntry(pathname)
  if (!entry) {
    throw new Error(`SEO kaydı yok: "${normalizePath(pathname)}" — src/data/seo.ts'e girdi ekleyin (kayıtsız sayfa yayımlanmaz).`)
  }
  return entry
}

/** Tam <title>: marka sonda; ana sayfa dahil her sayfa aynı şablon. */
export const fullTitle = (entry: Pick<SeoEntry, 'title'>): string =>
  entry.title === SITE_NAME ? SITE_NAME : `${entry.title}${TITLE_SEPARATOR}${SITE_NAME}`

/**
 * Canonical yol biçimi: dizin çıktısıyla (`/sss/index.html`) birebir → sondaki eğik çizgi VAR ('/sss/').
 * Sitemap (@astrojs/sitemap) aynı biçimi üretir; her statik host `/sss/`'yi yönlendirmesiz sunar.
 */
export const canonicalPath = (path: string): string => (path === '/' ? '/' : `${path}/`)

/** Markdown alternatifi yolu: '/' → '/index.md', '/sss' → '/sss.md'. */
export const markdownPath = (path: string): string => (path === '/' ? '/index.md' : `${path}.md`)

/** OG görseli yolu (derleme zamanı PNG). */
export const ogSlug = (path: string): string => (path === '/' ? 'ana-sayfa' : path.slice(1).replace(/\//g, '--'))
export const ogImagePath = (path: string): string => `/og/${ogSlug(path)}.png`
/** Sayfanın OG görseli: önizleme-yalnız sayfalar üretim çıktısına görsel sızdırmaz → ana sayfa görseli. */
export const ogImageFor = (entry: Pick<SeoEntry, 'path' | 'previewOnly'>): string => ogImagePath(entry.previewOnly ? '/' : entry.path)
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

/** Görünür ekmek kırıntısı + BreadcrumbList için ortak zincir (ana sayfada boş). */
export function crumbTrail(pathname: string): Array<{ label: string; path: string }> {
  const entry = getSeoEntry(pathname)
  if (entry.path === '/' || !entry.crumb) return []
  const chain: SeoEntry[] = [entry]
  let parent = entry.parent
  while (parent && parent !== '/') {
    const p = getSeoEntry(parent)
    chain.unshift(p)
    parent = p.parent
  }
  return [{ label: 'Ana sayfa', path: '/' }, ...chain.map((e) => ({ label: e.crumb ?? e.title, path: e.path }))]
}

/** `Breadcrumb` bileşeninin beklediği biçim (son öğe bağlantısız). */
export function crumbsFor(pathname: string): Array<{ label: string; href?: string }> {
  const trail = crumbTrail(pathname)
  return trail.map((c, i) => (i < trail.length - 1 ? { label: c.label, href: c.path } : { label: c.label }))
}

/** LLM metinlerinde geliştirme aşamasındaki sayfalara eklenen not. */
export const UPCOMING_NOTE = 'geliştirme aşamasında'

export const indexableEntries = (): SeoEntry[] => seoEntries.filter((e) => e.index)
export const previewOnlyPaths = (): string[] => seoEntries.filter((e) => e.previewOnly).map((e) => e.path)

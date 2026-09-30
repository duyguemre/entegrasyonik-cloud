/**
 * `llms.txt` (llmstxt.org formatı) — kısa, yapay zeka asistanları için özet dizin. İçerik TAMAMEN kayıtlardan
 * üretilir: sayfa listesi ve kısa açıklamalar `src/data/seo.ts` (indekslenen HER sayfa; test korur), entegrasyonlar
 * `getPublicIntegrations()`. Sayfa yazarı yeni bir iddia UYDURAMAZ (tests/llms.test.ts + tests/seo.test.ts, claims.test.ts
 * ile aynı yasaklı-ifade/sayısal-iddia denetimi). Kapsamlı sürüm: `/llms-full.txt`; her sayfanın markdown'ı: `/<yol>.md`.
 * URL'ler `PUBLIC_SITE_URL` tanımlıysa mutlaktır; tanımsızsa (taslak) köke göreli yol kullanılır (uydurma alan adı YOK).
 */
import type { APIRoute } from 'astro'
import { siteConfig } from '../lib/site-config'
import { getPublicIntegrations } from '../data/integrations'
import { TAGLINE, UPCOMING_NOTE, canonicalPath, entityDefinition, markdownPath, seoEntries, type SeoEntry } from '../data/seo'

const base = siteConfig.siteUrl ?? ''
const url = (path: string) => `${base}${path}`

const line = (e: SeoEntry): string => {
  // Geliştirme aşamasındaki sayfa: özet notu zaten taşımıyorsa eklenir (S18 `assistantLlms.short` taşır).
  const note = e.upcoming && !e.llmsSummary.includes(UPCOMING_NOTE) ? ` (${UPCOMING_NOTE})` : ''
  const md = e.index ? ` Markdown: ${url(markdownPath(e.path))}` : ''
  return `- [${e.title}](${url(canonicalPath(e.path))}): ${e.llmsSummary}${note}${md}`
}

export const GET: APIRoute = () => {
  const integrations = getPublicIntegrations()
  const indexed = seoEntries.filter((e) => e.index)
  const pages = indexed.filter((e) => !e.integrationCode && e.section !== 'legal' && e.section !== 'rehber')
  const rehber = indexed.filter((e) => e.section === 'rehber')
  const integrationPages = indexed.filter((e) => e.integrationCode)
  const legal = seoEntries.filter((e) => e.section === 'legal')

  const lines: string[] = []
  lines.push('# Entegrasyonik')
  lines.push('')
  lines.push(`> ${TAGLINE}`)
  lines.push('')
  lines.push(entityDefinition(integrations))
  lines.push('')
  lines.push(
    `Bugün bağlanabilen entegrasyonlar: ${integrations.map((i) => i.name).join(', ')}. Kapsam entegrasyona göre değişir; her entegrasyonun desteklediği işlemler ve bilinen sınırlar ${url(canonicalPath('/entegrasyonlar'))} adresinde açıkça yazılıdır.`,
  )
  lines.push('')
  lines.push('Her sayfanın temiz markdown sürümü, adresin sonuna `.md` eklenerek alınabilir (ana sayfa: /index.md).')
  lines.push('')

  lines.push('## Sayfalar')
  lines.push('')
  for (const e of pages) lines.push(line(e))
  lines.push('')

  lines.push('## Entegrasyonlar')
  lines.push('')
  for (const i of integrations) {
    const limits = i.limitations.length > 0 ? ` Sınırlar: ${i.limitations.join(' ')}` : ''
    const e = integrationPages.find((x) => x.integrationCode === i.code)
    const guide = e ? ` Bağlantı rehberi: ${url(canonicalPath(e.path))} (Markdown: ${url(markdownPath(e.path))})` : ''
    lines.push(`- **${i.name}** (${i.kindLabel}, ${i.coverageLabel}): ${i.summary}${limits}${guide}`)
  }
  lines.push('')

  // S20b: rehber / bilgi merkezi — pazarı ve mevzuatı anlatan kaynaklı içerik (ürün iddiası değil; kurallar tests/rehber.test.ts).
  lines.push('## Rehber')
  lines.push('')
  lines.push('Pazaryerinde satış, mevzuat ve stok operasyonu üzerine kaynaklı ve tarihli bilgi sayfaları. Bu sayfalar Entegrasyonik ürün kapsamını değil pazarın genel işleyişini anlatır; her sayfa kaynak listesi ve son güncelleme tarihi taşır.')
  lines.push('')
  for (const e of rehber) lines.push(line(e))
  lines.push('')

  lines.push('## Optional')
  lines.push('')
  lines.push(`- [Kapsamlı özet](${url('/llms-full.txt')}): tüm yetenekler, fiyatlandırma, SSS ve bağlantı rehberleri tek dosyada.`)
  for (const e of legal) lines.push(line(e))
  lines.push('')

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

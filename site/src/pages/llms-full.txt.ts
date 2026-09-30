/**
 * `llms-full.txt` (llmstxt.org formatı) — kapsamlı sürüm. Kısa dizin: `/llms.txt`. İçerik TAMAMEN
 * `src/data/*` seçicilerinden üretilir; yeni bir iddia UYDURULMAZ (tests/llms.test.ts korur).
 * Roadmap (implemente olmayan) öğeler `getPublic*` seçicileri zaten filtrelediği için burada da yoktur.
 */
import type { APIRoute } from 'astro'
import { siteConfig } from '../lib/site-config'
import { getPublicIntegrations } from '../data/integrations'
import { getPublicCapabilities, getStockReservationStory } from '../data/capabilities'
import { getPublicFaq, getSupportCategories } from '../data/faq'
import { getConnectGuide } from '../data/connect'
import { getPublicPlans, getPlanSourceNotice, getVatNotice, getPublicTrial } from '../data/plans'
import { TAGLINE, UPCOMING_NOTE, canonicalPath, entityDefinition, markdownPath, seoEntries } from '../data/seo'
import { ASSISTANT_PATH, ASSISTANT_NAME, assistantLlms } from '../data/assistant'
import { AGENT_DESCRIPTOR } from '../data/agent-brand'
import { guideHref, guides, sourcesOf } from '../data/kb'
import { plainKb } from '../lib/kb-render'

const base = siteConfig.siteUrl ?? ''
const url = (path: string) => `${base}${path}`

export const GET: APIRoute = () => {
  const integrations = getPublicIntegrations()
  const core = getPublicCapabilities('core')
  const security = getPublicCapabilities('security')
  const faq = getPublicFaq()
  const plans = getPublicPlans()
  const planNotice = getPlanSourceNotice()
  const vatNotice = getVatNotice()
  const trial = getPublicTrial()

  const lines: string[] = []
  lines.push('# Entegrasyonik — kapsamlı özet')
  lines.push('')
  lines.push(`> ${TAGLINE}`)
  lines.push('')
  lines.push('## Entegrasyonik nedir?')
  lines.push('')
  lines.push(entityDefinition(integrations))
  lines.push('')
  lines.push(`Kısa dizin: ${url('/llms.txt')}. Ücretsiz deneme: ${trial.days} gün${trial.cardRequired ? '' : ', kart bilgisi gerekmez'}.`)
  lines.push('')

  // S19: sayfa listesi SEO kaydından (indekslenen her sayfa + kısa açıklama + markdown sürümü).
  lines.push('## Sayfalar')
  lines.push('')
  for (const e of seoEntries.filter((x) => x.index && x.section !== 'rehber')) {
    const note = e.upcoming && !e.llmsSummary.includes(UPCOMING_NOTE) ? ` (${UPCOMING_NOTE})` : ''
    lines.push(`- [${e.title}](${url(canonicalPath(e.path))}): ${e.llmsSummary}${note} Markdown: ${url(markdownPath(e.path))}`)
  }
  lines.push('')

  lines.push('## Entegrasyonlar')
  lines.push('')
  for (const i of integrations) {
    lines.push(`### ${i.name} — ${i.kindLabel}, ${i.coverageLabel}`)
    lines.push('')
    lines.push(i.summary)
    lines.push('')
    for (const c of i.capabilities) lines.push(`- ${c.label} (${c.levelLabel}): ${c.note}`)
    if (i.notProvided.length > 0) lines.push(`- Sunulmayan: ${i.notProvided.join('; ')}`)
    for (const l of i.limitations) lines.push(`- Sınır: ${l}`)
    const guide = getConnectGuide(i.code, i.kind)
    if (guide) {
      lines.push(`- Gerekli bilgiler: ${guide.credentials.join(', ')}`)
      lines.push(`- Nasıl bağlanır: ${guide.steps.join(' ')}${guide.note ? ` ${guide.note}` : ''} Rehber: ${url(canonicalPath(`/entegrasyonlar/${i.code}`))}`)
    }
    lines.push('')
  }

  lines.push('## Ürün yetenekleri')
  lines.push('')
  for (const c of core) {
    const channels = c.channels.length > 0 ? ` Kanallar: ${c.channels.map((ch) => ch.name).join(', ')}.` : ''
    const caveat = c.caveat ? ` ${c.caveat}` : ''
    lines.push(`- **${c.title}** (${c.statusLabel}): ${c.summary}${caveat}${channels}`)
  }
  lines.push('')

  const story = getStockReservationStory()
  lines.push('## Stok rezervasyonu: aşırı satış nasıl önlenir')
  lines.push('')
  lines.push(`Ayrıntı: ${url(canonicalPath('/ozellikler/stok-rezervasyonu'))}`)
  lines.push('')
  lines.push('Sorun:')
  for (const x of story.problems) lines.push(`- **${x.title}**: ${x.text}`)
  lines.push('')
  lines.push('Nasıl çalışır:')
  for (const x of story.steps) lines.push(`- **${x.title}**: ${x.text}`)
  lines.push('')
  lines.push('Fayda:')
  for (const x of story.benefits) lines.push(`- **${x.title}**: ${x.text}`)
  lines.push('')

  lines.push('## Güvenlik ve KVKK')
  lines.push('')
  for (const c of security) {
    const caveat = c.caveat ? ` ${c.caveat}` : ''
    lines.push(`- **${c.title}** (${c.statusLabel}): ${c.summary}${caveat}`)
  }
  lines.push('')

  lines.push('## Fiyatlandırma')
  lines.push('')
  if (planNotice) lines.push(`Not: ${planNotice}`)
  if (vatNotice) lines.push(`Not: ${vatNotice}`)
  lines.push('')
  for (const p of plans) {
    const limits = p.limits.map((l) => `${l.label}: ${l.value === null ? 'Özel limit' : l.value}`).join(', ')
    lines.push(`- **${p.name}** — ${p.priceLabel}${p.periodLabel} (${p.vatLabel || 'Size özel hazırlanır'}). ${p.tagline} ${limits ? `Limitler: ${limits}.` : ''}`)
  }
  lines.push('')

  lines.push('## Sık sorulan sorular')
  lines.push('')
  for (const f of faq) {
    lines.push(`### ${f.question}`)
    lines.push('')
    lines.push(f.answer)
    lines.push('')
  }

  lines.push('## Destek merkezi')
  lines.push('')
  lines.push(`Kategorili destek sayfası: ${url(canonicalPath('/destek'))}`)
  lines.push('')
  for (const c of getSupportCategories()) {
    const guides = c.channelGuides ? ' Kanal bağlantı rehberleri her entegrasyonun sayfasındadır.' : ''
    lines.push(`- **${c.label}**: ${c.lead}${guides} Sorular: ${c.items.map((q) => q.question).join(' / ')}`)
  }
  lines.push('')

  // S18: vizyon sayfası — "upcoming"; bugünkü yeteneklerden AYRI bölüm, kesin kip yok (tests/upcoming.test.ts).
  lines.push(`## ${ASSISTANT_NAME} — ${AGENT_DESCRIPTOR} (upcoming)`)
  lines.push('')
  lines.push(`Sayfa: ${url(canonicalPath(ASSISTANT_PATH))}`)
  lines.push('')
  for (const l of assistantLlms.full) lines.push(`- ${l}`)
  lines.push('')

  // S20b: rehber / bilgi merkezi — her sayfanın kısa yanıtı, son güncelleme tarihi ve kaynak yayıncıları (kayıttan).
  // Bu içerik pazarı/mevzuatı anlatır; Entegrasyonik ürün kapsamı değildir (ürün kapsamı yukarıdaki bölümlerde).
  lines.push('## Rehber')
  lines.push('')
  for (const e of seoEntries.filter((x) => x.index && x.section === 'rehber')) {
    lines.push(`- [${e.title}](${url(canonicalPath(e.path))}): ${e.llmsSummary} Markdown: ${url(markdownPath(e.path))}`)
  }
  lines.push('')
  for (const g of guides) {
    lines.push(`### ${g.title}`)
    lines.push('')
    lines.push(`Sayfa: ${url(canonicalPath(guideHref(g.slug)))} · Son güncelleme: ${g.dateModified}`)
    lines.push('')
    lines.push(plainKb(g.answer))
    lines.push('')
    for (const k of g.keyPoints) lines.push(`- ${plainKb(k)}`)
    if (g.keyPoints.length > 0) lines.push('')
    lines.push(`Kaynaklar: ${[...new Set(sourcesOf(g).map((s) => s.publisher))].join('; ')}`)
    lines.push('')
  }

  lines.push('## Optional')
  lines.push('')
  for (const e of seoEntries.filter((x) => x.section === 'legal')) lines.push(`- [${e.title}](${url(canonicalPath(e.path))}): ${e.llmsSummary}`)
  lines.push('')

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

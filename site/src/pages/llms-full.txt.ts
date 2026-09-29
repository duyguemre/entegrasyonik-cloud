/**
 * `llms-full.txt` (llmstxt.org formatı) — kapsamlı sürüm. Kısa dizin: `/llms.txt`. İçerik TAMAMEN
 * `src/data/*` seçicilerinden üretilir; yeni bir iddia UYDURULMAZ (tests/llms.test.ts korur).
 * Roadmap (implemente olmayan) öğeler `getPublic*` seçicileri zaten filtrelediği için burada da yoktur.
 */
import type { APIRoute } from 'astro'
import { siteConfig } from '../lib/site-config'
import { getPublicIntegrations } from '../data/integrations'
import { getPublicCapabilities } from '../data/capabilities'
import { getPublicFaq } from '../data/faq'
import { getPublicPlans, getPlanSourceNotice, getVatNotice, getPublicTrial } from '../data/plans'
import { primaryNav, legalNav, published } from '../data/navigation'

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
  lines.push(
    '> Entegrasyonik, pazaryerlerindeki ürün, stok, sipariş ve iade süreçlerinizi tek panelde toplar; stok rezervasyonuyla aşırı satış riskini azaltır.',
  )
  lines.push('')
  lines.push(`Kısa dizin: ${url('/llms.txt')}. Ücretsiz deneme: ${trial.days} gün${trial.cardRequired ? '' : ', kart bilgisi gerekmez'}.`)
  lines.push('')

  lines.push('## Sayfalar')
  lines.push('')
  lines.push(`- [Ana sayfa](${url('/')})`)
  for (const p of published(primaryNav)) lines.push(`- [${p.label}](${url(p.href)})`)
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

  lines.push('## Optional')
  lines.push('')
  for (const p of published(legalNav)) lines.push(`- [${p.label}](${url(p.href)}): taslak, hukuki incelemeyi bekliyor.`)
  lines.push('')

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

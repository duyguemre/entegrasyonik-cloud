/**
 * `llms.txt` (llmstxt.org formatı) — kısa, yapay zeka asistanları için özet dizin. İçerik TAMAMEN
 * `src/data/*` seçicilerinden üretilir (getPublicIntegrations/getPublicFaq/navigation); sayfa yazarı
 * yeni bir iddia UYDURAMAZ (tests/llms.test.ts, claims.test.ts ile aynı yasaklı-ifade/sayısal-iddia
 * denetimini bu çıktıya da uygular). Kapsamlı sürüm: `/llms-full.txt`.
 * URL'ler `PUBLIC_SITE_URL` tanımlıysa mutlaktır (astro.config `site`); tanımsızsa (taslak/alan adı
 * belirsiz — ADR-0014 Açık Soru 2) köke göreli yol kullanılır (uydurma alan adı YOK).
 */
import type { APIRoute } from 'astro'
import { siteConfig } from '../lib/site-config'
import { primaryNav, featureNav, legalNav, published } from '../data/navigation'
import { getPublicIntegrations } from '../data/integrations'

const base = siteConfig.siteUrl ?? ''
const url = (path: string) => `${base}${path}`

export const GET: APIRoute = () => {
  const integrations = getPublicIntegrations()
  const pages = published(primaryNav)
  const legal = published(legalNav)

  const lines: string[] = []
  lines.push('# Entegrasyonik')
  lines.push('')
  lines.push(
    '> Entegrasyonik, pazaryerlerindeki ürün, stok, sipariş ve iade süreçlerinizi tek panelde toplar; stok rezervasyonuyla aşırı satış riskini azaltır.',
  )
  lines.push('')
  lines.push(
    `Bugün bağlanabilen entegrasyonlar: ${integrations.map((i) => i.name).join(', ')}. Kapsam entegrasyona göre değişir; her entegrasyonun desteklediği işlemler ve bilinen sınırlar ${url('/entegrasyonlar')} adresinde açıkça yazılıdır.`,
  )
  lines.push('')

  lines.push('## Sayfalar')
  lines.push('')
  lines.push(`- [Ana sayfa](${url('/')}): Ürün özeti, yetenekler, entegrasyonlar ve fiyatlandırma.`)
  for (const p of pages) lines.push(`- [${p.label}](${url(p.href)})`)
  for (const p of published(featureNav)) lines.push(`- [${p.label}](${url(p.href)}): Aşırı satış (overselling) nasıl önlenir; eşzamanlı siparişte stok rezervasyonu.`)
  lines.push('')

  lines.push('## Entegrasyonlar')
  lines.push('')
  for (const i of integrations) {
    const limits = i.limitations.length > 0 ? ` Sınırlar: ${i.limitations.join(' ')}` : ''
    lines.push(`- **${i.name}** (${i.kindLabel}, ${i.coverageLabel}): ${i.summary}${limits} Bağlantı rehberi: ${url(`/entegrasyonlar/${i.code}`)}`)
  }
  lines.push('')

  lines.push('## Optional')
  lines.push('')
  lines.push(`- [Kapsamlı özet](${url('/llms-full.txt')}): tüm yetenekler, fiyatlandırma ve SSS dahil.`)
  for (const p of legal) lines.push(`- [${p.label}](${url(p.href)}): taslak, hukuki incelemeyi bekliyor.`)
  lines.push('')

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

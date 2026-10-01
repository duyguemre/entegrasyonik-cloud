/**
 * S23 (SR2-ENTITY 8) — terminoloji koruması: Entegrasyonik bir YAZILIM değil, PLATFORMDUR.
 *
 * Entegrasyonik kendini tanımladığı her yerde (varlık tanımı, Organization/SoftwareApplication açıklaması, llms.txt /
 * llms-full.txt, markdown alternatifleri, başlık/alt başlıklar, SSS, meta description) "platform" kullanır. Genel
 * kategori/arama terimi olarak "yazılım" kalabilir ("pazaryeri entegrasyon yazılımı nasıl seçilir", "ERP / muhasebe
 * yazılımı") — ama Entegrasyonik'in KENDİSİ için değil.
 *
 * Yöntem: GERÇEK yayın derlemesinin (HTML görünür metin + meta + JSON-LD + llms* + .md) ve kaynak verinin CÜMLELERİ
 * taranır. Bir cümle hem "Entegrasyonik" (şirket unvanı hariç) hem "yazılım" kökü içeriyorsa — aşağıdaki GENEL
 * TERİM listesindeki ifadeler çıkarıldıktan sonra — ihlaldir. Ayrıca ada gerek olmadan öz-gönderim kalıpları
 * ("ürünün yazılımı", "yazılımımız") her yerde yasaktır. İstisnalar dar ve gerekçelidir; yeni istisna bilinçli eklenir.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSite } from '../scripts/lib/build.mjs'
import { entityDefinition, TAGLINE } from '../src/data/seo'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(siteRoot, 'src')

const lower = (s: string) => s.toLocaleLowerCase('tr-TR')

/** Genel kategori / üçüncü taraf ifadeleri: cümleden ÇIKARILIR (Entegrasyonik'i tanımlamaz). */
const GENERIC_TERMS: RegExp[] = [
  /entegrasyon yazılım\p{L}*/gu, // kategori/arama terimi ("pazaryeri entegrasyon yazılımı nasıl seçilir")
  /entegrasyon-yazilimi/gu, // rehber slug'ı
  /(erp|muhasebe|ön muhasebe|depo|satış|kaynak planlama) (\/ )?(muhasebe )?yazılım\p{L}*/gu, // üçüncü taraf sistemler
  /yazılım ekibi/gu, // "teknik bilgi ya da yazılım ekibi gerekir mi"
  /yazılım (ve hizmet )?sağlayıcı\p{L}*/gu, // KVKK: veri işleyen rolü (genel)
  /yazılımlar(ın|ınız|la|ıyla|a)?\b/gu, // çoğul: genel ("yazılımlar arasında aktarım")
  /entegrasyonik yazılım teknolojileri/gu, // şirketin TESCİLLİ unvanı (src/data/company.ts) — ürün tanımı değil
]

/** Adı geçmese de öz-gönderim: her yerde yasak. */
const SELF_REFERENCE: RegExp[] = [/ürünün (bugünkü )?yazılım\p{L}*/u, /yazılımımız\p{L}*/u, /platformumuzun yazılım/u]

/**
 * Dar, gerekçeli istisnalar (cümle parçası, küçük harf). Yasal metinlerde fikri mülkiyet / sorumluluk hükümleri
 * hizmeti TANIMLAMAZ, yazılım bileşeni üzerindeki hakları düzenler — hukuki inceleme kapsamındadır.
 */
const ALLOWED_SENTENCES: { part: string; why: string }[] = [
  { part: 'yazılımı tersine mühendislikle çözmek', why: 'Kullanım koşulları: yasaklı kullanım (fikri mülkiyet)' },
  { part: 'hizmetin yazılımı, tasarımı, arayüzü', why: 'Kullanım koşulları: fikri mülkiyet hakları' },
  { part: 'hiçbir yazılım hizmeti', why: 'Kullanım koşulları: genel sorumluluk sınırı (Entegrasyonik tanımı değil)' },
]

const allowed = (sentence: string) => ALLOWED_SENTENCES.some((a) => sentence.includes(a.part))

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+|\n+|\s[·|]\s/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Bir metin kümesindeki terminoloji ihlalleri (`yer: cümle`). */
export function violations(where: string, text: string): string[] {
  const out: string[] = []
  for (const raw of sentences(text)) {
    const s = lower(raw)
    if (allowed(s)) continue
    if (SELF_REFERENCE.some((re) => re.test(s))) {
      out.push(`${where}: ${raw}`)
      continue
    }
    const named = (t: string) => /(?<![\p{L}\d])entegrasyonik(?! yazılım teknolojileri)/u.test(t)
    // Kategori terimi bile Entegrasyonik'in YÜKLEMİ olamaz ("Entegrasyonik ... entegrasyon yazılımıdır").
    if (named(s) && /yazılım\p{L}*d[ıi]r(?![\p{L}\d])/u.test(s)) {
      out.push(`${where}: ${raw}`)
      continue
    }
    let rest = s
    for (const re of GENERIC_TERMS) rest = rest.replace(re, ' ')
    if (named(rest) && /yazılım/u.test(rest)) out.push(`${where}: ${raw}`)
  }
  return out
}

function walk(dir: string, keep: (p: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p, keep) : keep(p) ? [p] : []
  })
}

const decode = (s: string) =>
  s
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

/** HTML'den taranacak metinler: görünür metin + title/meta içerikleri + JSON-LD dizeleri. */
function htmlTexts(html: string): string[] {
  const metas = [...html.matchAll(/<meta [^>]*content="([^"]*)"/g)].map((m) => decode(m[1]))
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const strings: string[] = []
    const visit = (v: unknown) => {
      if (typeof v === 'string') strings.push(v)
      else if (Array.isArray(v)) v.forEach(visit)
      else if (v && typeof v === 'object') Object.values(v).forEach(visit)
    }
    visit(JSON.parse(m[1]))
    return strings
  })
  const visible = decode(
    html
      .replace(/<head[\s\S]*?<\/head>/g, '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
      .replace(/<\/(p|li|h[1-6]|dt|dd|td|th|summary|figcaption|blockquote|div|section|article)>/g, '.\n')
      .replace(/<[^>]+>/g, ' '),
  )
  return [decode(title), ...metas, ...ld, visible]
}

describe('terminoloji: öz-tanım "platform", "yazılım" değil', () => {
  let outDir = ''
  beforeAll(() => {
    outDir = buildSite({
      outDir: 'dist-terminology',
      env: { SITE_DRAFT: 'false', PUBLIC_APP_URL: 'https://app.example.test', PUBLIC_SITE_URL: 'https://www.example.test' },
      silent: true,
    })
  }, 240_000)

  it('varlık tanımı ve slogan platform der; "yazılım" öz-tanımı yok', () => {
    expect(entityDefinition()).toMatch(/^Entegrasyonik, [^.]*platformudur\./)
    expect(violations('entityDefinition', entityDefinition())).toEqual([])
    expect(violations('TAGLINE', TAGLINE)).toEqual([])
  })

  it('tarayıcı kendi kendini sınar: ihlali yakalar, genel terimi ve istisnayı geçirir', () => {
    expect(violations('t', 'Entegrasyonik bir pazaryeri entegrasyon yazılımıdır.')).toHaveLength(1) // kategori terimi yüklem olamaz
    expect(violations('t', 'Entegrasyonik ile pazaryeri entegrasyon yazılımı nasıl seçilir?')).toHaveLength(0) // kategori terimi
    expect(violations('t', 'Entegrasyonik, stok yönetimi yazılımıdır.')).toHaveLength(1)
    expect(violations('t', 'Entegrasyonik yazılımı ile satış yapın.')).toHaveLength(1)
    expect(violations('t', 'Her koruma ürünün yazılımında uygulanmıştır.')).toHaveLength(1)
    expect(violations('t', 'Entegrasyonik Yazılım Teknolojileri · MERSİS')).toHaveLength(0)
    expect(violations('t', 'Entegrasyonik, Bizimhesap ERP / muhasebe yazılımını panele bağlar.')).toHaveLength(0)
  })

  it('derlenmiş HTML (görünür metin, başlık, meta, JSON-LD): ihlal yok', () => {
    const found = walk(outDir, (p) => p.endsWith('.html')).flatMap((f) =>
      htmlTexts(readFileSync(f, 'utf8')).flatMap((t) => violations(path.relative(outDir, f), t)),
    )
    expect(found).toEqual([])
  })

  it('llms.txt, llms-full.txt ve markdown alternatifleri: ihlal yok, varlık tanımı birebir', () => {
    const files = walk(outDir, (p) => p.endsWith('.txt') || p.endsWith('.md'))
    expect(files.some((f) => f.endsWith('llms.txt'))).toBe(true)
    expect(files.some((f) => f.endsWith('llms-full.txt'))).toBe(true)
    const found = files.flatMap((f) => violations(path.relative(outDir, f), readFileSync(f, 'utf8')))
    expect(found).toEqual([])
    expect(readFileSync(path.join(outDir, 'llms.txt'), 'utf8')).toContain(entityDefinition())
  })

  it('kaynak veri (src/data, sayfa ve bileşen dizeleri): ihlal yok', () => {
    const files = walk(srcDir, (p) => /\.(ts|astro|mjs)$/.test(p))
    const found = files.flatMap((f) => {
      const text = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
        .replace(/<!--[\s\S]*?-->/g, '')
      // Yalnızca dize/metin içerikleri: tırnak içleri ve JSX metin düğümleri.
      const strings = [...text.matchAll(/'([^'\n]{12,})'|`([^`]{12,})`|"([^"\n]{12,})"|>([^<>{}\n]{12,})</g)].map(
        (m) => m[1] ?? m[2] ?? m[3] ?? m[4],
      )
      return strings.flatMap((s) => violations(path.relative(siteRoot, f), s))
    })
    expect(found).toEqual([])
  })

  it('istisnalar gerçekten kullanılıyor (ölü istisna kalmaz)', () => {
    const corpus = lower(
      walk(srcDir, (p) => /\.(ts|astro)$/.test(p))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n'),
    )
    for (const a of ALLOWED_SENTENCES) expect(corpus.includes(a.part), `${a.part} (${a.why})`).toBe(true)
  })
})

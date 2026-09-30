// C1 — kanal rengi TEK KAYNAK bekçisi (statik tarama). Kanal marka rengi yalnız `src/design/tokens/palette.ts`
// `channelPalette`'te yazılır; bileşenler `channelClass(code)` + `var(--ek-ch-brand|on-brand|secondary)` kullanır.
// Yasak: kaynakta ham kanal hex'i (bugünkü ve C1 öncesi değerler), kanal-anahtarlı renk eşlemesi, entegrasyon
// kaydının `color` alanıyla boyama, C1 öncesi `--ek-channel-<kod>-{solid,subtle,border,text}` değişkenleri.
// Geri uyum takma adları (`--ek-ch-subtle|text|border`) yalnız bilinen dosyalarda ve AZALAN sayıda (ratchet).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { channelPalette } from '../../src/design/tokens/palette'

const ROOT = join(__dirname, '../..')
const SRC = join(ROOT, 'src')
const TOKEN_DIR = join(SRC, 'design', 'tokens') + sep

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|ts|js|css|scss)$/.test(name)) out.push(p)
  }
  return out
}

const FILES = walk(SRC).filter((f) => !f.startsWith(TOKEN_DIR))
const rel = (f: string) => relative(ROOT, f).split(sep).join('/')
const read = (f: string) => readFileSync(f, 'utf8')

/** Bugünkü marka/ikincil renkler + C1 öncesi uydurma kanal tonları (geri dönmesin). */
const CHANNEL_HEX = new Set(
  [
    ...Object.values(channelPalette).flatMap((t) => [t.brand, (t as { secondary?: string }).secondary]),
    // C1 öncesi `channelPalette` (solid/subtle/border/text) — tint ve uydurma renk açıları
    '#F27A1A', '#FEF2E8', '#FACCA8', '#9B4E11', '#E0284F', '#FCEAED', '#F3ADBC', '#B01F3E',
    '#7C3AED', '#F2EBFD', '#CDB4F8', '#6A2FD0', '#C0268F', '#F9E9F4', '#E7ADD4', '#A2207A',
    '#0E4C92', '#E7EDF4', '#A3BBD6', '#0F9488', '#E7F4F3', '#A4D6D2', '#0B7067',
  ]
    .filter((h): h is string => !!h)
    .map((h) => h.toUpperCase()),
)
const CODES = Object.keys(channelPalette).join('|')

describe('kanal rengi tek kaynak (statik)', () => {
  it('kaynakta ham kanal hex’i yok (token dizini hariç)', () => {
    const hits: string[] = []
    for (const f of FILES) {
      for (const m of read(f).matchAll(/#[0-9a-fA-F]{6}\b/g)) if (CHANNEL_HEX.has(m[0].toUpperCase())) hits.push(`${rel(f)}: ${m[0]}`)
    }
    expect(hits).toEqual([])
  })

  it('kanal-anahtarlı renk eşlemesi yok (ör. `trendyol: \'#…\'`)', () => {
    const re = new RegExp(`\\b(${CODES})['"]?\\s*:\\s*['"](#|rgb|hsl)`, 'i')
    expect(FILES.filter((f) => re.test(read(f))).map(rel)).toEqual([])
  })

  it('entegrasyon/platform kaydının `color` alanıyla boyama yok (renk `channelClass`’tan gelir)', () => {
    const re = /\b(integration|platform)\??\.color\b/
    expect(FILES.filter((f) => re.test(read(f))).map(rel)).toEqual([])
  })

  it('`integrationAccent` yalnız mağaza kayıtlarında (geri uyum `color` alanı)', () => {
    const users = FILES.filter((f) => /\bintegrationAccent\b/.test(read(f))).map(rel).sort()
    expect(users).toEqual(['src/stores/ecommerce.ts', 'src/stores/marketplace.ts'])
  })

  it('C1 öncesi kanal değişkenleri (`--ek-channel-<kod>-solid|subtle|border|text`) kullanılmıyor', () => {
    const re = /--ek-channel-[a-z0-9]+-(solid|subtle|border|text)\b/
    expect(FILES.filter((f) => re.test(read(f))).map(rel)).toEqual([])
  })

  it('geri uyum takma adları (`--ek-ch-subtle|text|border`) yalnız bilinen dosyalarda ve azalan sayıda', () => {
    // Ratchet: sayı yalnız AZALABİLİR; yeni kodda `--ek-ch-brand|on-brand|secondary` kullan.
    const ALLOWED: Record<string, number> = {
      'src/components/productDefinitions/variants/ProductVariantListComponent.vue': 2,
      'src/components/productDefinitions/variants/ProductVariantListTooltipComponent.vue': 1,
      'src/components/ds/EkRecordSummary.vue': 1,
    }
    const found: Record<string, number> = {}
    for (const f of FILES) {
      const n = read(f).match(/var\(--ek-ch-(subtle|text|border)\b/g)?.length ?? 0
      if (n) found[rel(f)] = n
    }
    for (const [file, n] of Object.entries(found)) {
      expect(ALLOWED[file], `${file} yeni takma ad kullanımı`).toBeDefined()
      expect(n, file).toBeLessThanOrEqual(ALLOWED[file])
    }
  })
})

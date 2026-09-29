// R7 / G-01, G-02 — ham HTML basan sink'lerin statik mandalı.
//
// Kural: `v-html`, `innerHTML =` ve `document.write(` kullanımı SADECE aşağıdaki envanterdedir; her
// kaydın veri kaynağı ve kararı gerekçelendirilmiştir. Yeni bir kullanım (veya sayının artması) bu
// testi kırar -> ekleyen kişi kaynağın kullanıcı/pazaryeri kontrollü OLMADIĞINI belgelemek zorundadır.
// Azalma serbesttir (envanteri güncellemek için sayıyı düşürün).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(vue|ts)$/.test(name)) out.push(full)
  }
  return out
}

const rel = (f: string) => path.relative(srcRoot, f).split(path.sep).join('/')

/** `v-html` envanteri: yalnızca `formatDate(<Date alanı>)` çıktısı (yerel tarih/saat + sabit <span>/<b>). Kullanıcı kontrollü değil. */
const V_HTML_ALLOWLIST: Record<string, number> = {
  'components/logListView/DetailedExportLogReport.vue': 4,
  'components/logListView/ExportLogList.vue': 4,
  'components/logListView/ImportLogList.vue': 4,
  'views/secure/ClaimListView.vue': 1,
  'views/secure/OrderListView.vue': 2,
}

/** `innerHTML`/`document.write` envanteri. */
const RAW_HTML_ALLOWLIST: Record<string, { count: number; why: string }> = {
  'components/order/BarcodePrintComponent.vue': {
    count: 1,
    why: "Vue'nun kendi (kaçışlı) DOM'undan `innerHTML` serileştirilip yazdırma penceresine yazılır; ham kullanıcı dizesi eklenmez.",
  },
  'views/secure/PrintoutListView.vue': {
    count: 1,
    why: 'Şablon tasarımcısı prototipi: yalnızca kod içi sabit sürüklenebilir öğeler kopyalanır; sunucu verisi yok.',
  },
}

const files = walk(srcRoot)

describe('v-html envanteri (G-01/G-02)', () => {
  const found: Record<string, string[]> = {}
  for (const f of files.filter((x) => x.endsWith('.vue'))) {
    const src = readFileSync(f, 'utf8')
    const matches = [...src.matchAll(/v-html\s*=\s*"([^"]*)"/g)].map((m) => m[1])
    if (matches.length) found[rel(f)] = matches
  }

  it('ConfirmationDialogComponent v-html KULLANMAZ (depolanmış XSS düzeltmesi)', () => {
    expect(found['components/layout/ConfirmationDialogComponent.vue']).toBeUndefined()
  })

  it('v-html yalnızca envanterdeki dosyalarda ve sayıyı aşmadan bulunur', () => {
    for (const [file, exprs] of Object.entries(found)) {
      const allowed = V_HTML_ALLOWLIST[file]
      expect(allowed, `${file}: envanterde olmayan v-html (${exprs.length} adet)`).toBeDefined()
      expect(exprs.length, `${file}: v-html sayısı arttı`).toBeLessThanOrEqual(allowed)
    }
  })

  it('her v-html ifadesi yalnızca formatDate(...) çıktısı ve sabit dize içerir (şablon dizesi/birleştirme yok)', () => {
    for (const [file, exprs] of Object.entries(found)) {
      for (const expr of exprs) {
        expect(expr, `${file}: v-html ifadesi formatDate içermiyor -> ${expr}`).toContain('formatDate(')
        expect(expr, `${file}: v-html ifadesinde birleştirme/şablon dizesi -> ${expr}`).not.toMatch(/`|\$\{|\s\+\s/)
      }
    }
  })
})

describe('innerHTML / document.write envanteri', () => {
  it('yalnızca envanterdeki dosyalar ve sayı sınırı', () => {
    const found: Record<string, number> = {}
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      const n = (src.match(/\.innerHTML\s*=(?!=)|document\.write\(|outerHTML\s*=(?!=)|insertAdjacentHTML\(/g) || []).length
      if (n) found[rel(f)] = n
    }
    for (const [file, n] of Object.entries(found)) {
      const allowed = RAW_HTML_ALLOWLIST[file]
      expect(allowed, `${file}: envanterde olmayan ham HTML sink (${n} adet)`).toBeDefined()
      expect(n, `${file}: sayı arttı`).toBeLessThanOrEqual(allowed.count)
    }
  })
})

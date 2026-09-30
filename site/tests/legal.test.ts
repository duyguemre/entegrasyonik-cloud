// ADR-0014 S5 — yasal sayfalar (8 taslak): derleme, TASLAK bandı, yer tutucu listesi, yasaklı ifade taraması, bağlantı bütünlüğü.
// İki GERÇEK `astro build` çalıştırır (taslak + SITE_DRAFT=false); çıktı klasörleri git-ignored (`dist-*`) ve test sonunda silinir.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSite } from '../scripts/lib/build.mjs'
import { legalNav } from '../src/data/navigation'
import { legalDocs, LEGAL_DRAFT_BANNER, LEGAL_REVIEWED } from '../src/data/legal'
import { placeholders, placeholderKeys } from '../src/data/legal/placeholders'
import { renderInline, usedPlaceholderKeys, pendingPlaceholderKeys, internalLinks, collectTexts } from '../src/lib/legal-render'
import { placeholderValues } from '../src/data/legal/placeholders'
import { company } from '../src/data/company'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(siteRoot, '..')
const DRAFT_DIR = 'dist-legal-draft'
const LIVE_DIR = 'dist-legal-live'

const read = (p: string) => readFileSync(p, 'utf8')
const slugs = legalDocs.map((d) => d.slug)
const pageHtml = (dir: string, slug: string) => read(path.join(siteRoot, dir, 'yasal', slug, 'index.html'))
const textOf = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

/** Doğrulanamayan/uydurma iddialar (görev + ADR-0014 Karar 5 "izinsiz" listesi). */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['A.Ş. unvanı', /A\.Ş\./],
  ['AWS', /\bAWS\b/],
  ['Azure', /Azure/],
  ['Tier 3+', /Tier\s*\d/i],
  ['Google Analytics / GA', /Google|\bGA\b/],
  ['Intercom', /Intercom/i],
  ['Meta (reklam)', /\bMeta\b/],
  ['Amazon', /Amazon/i],
  ['6 ay imha süresi', /\b6\s*ay\b|altı\s+ay/i],
  ['%100', /%\s*100/],
  ['sınırsız', /sınırsız/i],
  ['7/24 destek', /7\s*\/\s*24/],
  ['sertifika iddiası', /ISO\s*27001|SOC\s*2/i],
  ['veri konumu iddiası', /Türkiye['’]?de\s+(saklan|tutul|barın)/i],
  ['doğrulanmamış e-posta adresi', /@entegrasyonik\.com/i],
]
/** S16: kullanıcının verdiği genel adres doğrulanmıştır; yasaklı-ifade taramasından önce yalnızca O adres çıkarılır. */
const withoutVerified = (text: string) => text.split(company.email).join('')

describe('kayıt ve gezinme tutarlılığı (derleme gerektirmez)', () => {
  it('8 yasal belge var; slug/başlık/sıra navigation.ts legalNav ile birebir', () => {
    expect(legalDocs).toHaveLength(8)
    expect(legalDocs.map((d) => `/yasal/${d.slug}`)).toEqual(legalNav.map((n) => n.href))
    expect(legalDocs.map((d) => d.title)).toEqual(legalNav.map((n) => n.label))
    expect(new Set(slugs).size).toBe(8)
  })

  it('her belgenin sayfa dosyası vardır ve yayımlanmış (published) bayrağı açıktır', () => {
    for (const slug of slugs) expect(existsSync(path.join(siteRoot, 'src/pages/yasal', `${slug}.astro`)), slug).toBe(true)
    expect(legalNav.every((n) => n.published)).toBe(true)
  })

  it('ADR-0014 kapsamı: KVKK, Gizlilik, Çerez, Kullanım, Abonelik(+VİS), Ön Bilgilendirme, İptal/İade, Künye', () => {
    expect(slugs).toEqual([
      'kvkk-aydinlatma',
      'gizlilik',
      'cerez',
      'kullanim-kosullari',
      'abonelik-sozlesmesi',
      'on-bilgilendirme',
      'iptal-iade',
      'kunye',
    ])
    const abonelik = legalDocs.find((d) => d.slug === 'abonelik-sozlesmesi')!
    expect(abonelik.sections.some((s) => /Veri İşleme/.test(s.title))).toBe(true)
  })

  it('LEGAL_REVIEWED=false (hukuki onay yalnızca insan kararıyla açılır)', () => {
    expect(LEGAL_REVIEWED).toBe(false)
    expect(LEGAL_DRAFT_BANNER).toBe('TASLAK — hukuki inceleme bekliyor (Protokol 12)')
  })

  it('metadata: sürüm, ISO tarih, benzersiz bölüm kimlikleri, başlık/özet/açıklama dolu', () => {
    for (const d of legalDocs) {
      expect(d.version, d.slug).toMatch(/^\d+\.\d+\.\d+-taslak$/)
      expect(d.updatedAt, d.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(d.title.length, d.slug).toBeGreaterThan(3)
      expect(d.summary.length, d.slug).toBeGreaterThan(20)
      expect(d.description.length, d.slug).toBeGreaterThan(20)
      const ids = d.sections.map((s) => s.id)
      expect(new Set(ids).size, `${d.slug} bölüm kimlikleri`).toBe(ids.length)
      for (const id of ids) expect(id, d.slug).toMatch(/^[a-z0-9-]+$/)
      expect(d.sections.length, d.slug).toBeGreaterThanOrEqual(2)
    }
  })

  it('her yer tutucu anahtarı kayıtta tanımlı; kayıttaki her anahtar en az bir belgede kullanılır', () => {
    const used = new Set(legalDocs.flatMap((d) => usedPlaceholderKeys(d)))
    expect([...used].filter((k) => !(k in placeholders))).toEqual([])
    expect(placeholderKeys.filter((k) => !used.has(k))).toEqual([])
    for (const spec of Object.values(placeholders)) {
      expect(spec.description.length).toBeGreaterThan(15)
      expect(spec.owner).toBeTruthy()
    }
  })

  it('künye yer tutucuları altbilgi ile aynı anahtarları kullanır', () => {
    const footer = read(path.join(siteRoot, 'src/components/Footer.astro'))
    const used = new Set(legalDocs.flatMap((d) => usedPlaceholderKeys(d)))
    for (const key of ['ŞİRKET_UNVANI', 'MERSİS_NO', 'ADRES']) {
      expect(footer).toContain(`{{${key}}}`)
      expect(used.has(key), key).toBe(true)
    }
  })

  it('her belge en az bir yer tutucu içerir (bilinmeyen alan uydurulmaz)', () => {
    for (const d of legalDocs) expect(usedPlaceholderKeys(d).length, d.slug).toBeGreaterThanOrEqual(1)
  })

  it('iç bağlantılar yalnızca mevcut yasal sayfalara gider; dış bağlantı ve mailto yok', () => {
    for (const d of legalDocs) {
      for (const href of internalLinks(d)) {
        const [pathname] = href.split('#')
        expect(slugs.map((s) => `/yasal/${s}`), `${d.slug} → ${href}`).toContain(pathname)
      }
      for (const text of collectTexts(d)) {
        expect(text, d.slug).not.toMatch(/https?:\/\//)
        expect(text, d.slug).not.toMatch(/mailto:/)
      }
    }
  })

  it('kaynak dosyalarda yasaklı ifade yok', () => {
    for (const d of legalDocs) {
      const all = collectTexts(d).join('\n')
      for (const [label, re] of FORBIDDEN) expect(all, `${d.slug}: ${label}`).not.toMatch(re)
    }
    for (const [key, spec] of Object.entries(placeholders)) {
      for (const [label, re] of FORBIDDEN) expect(`${key} ${spec.description}`, `yer tutucu ${key}: ${label}`).not.toMatch(re)
    }
  })
})

describe('ADR-0008 tutarlılığı (abonelik/iptal metni)', () => {
  const adr = read(path.join(repoRoot, 'docs/adr/0008-odeme-saglayicisi-ve-abonelik-modeli.md'))
  const full = (slug: string) => collectTexts(legalDocs.find((d) => d.slug === slug)!).join('\n')

  it('ADR-0008 hâlâ aynı sayıları söylüyor (kayma alarmı)', () => {
    expect(adr).toMatch(/14 gün, kartsız/)
    expect(adr).toMatch(/grace 7 gün/)
    expect(adr).toMatch(/30 gün salt-okunur/)
    expect(adr).toMatch(/3 gün önce/)
  })

  it('abonelik sözleşmesi: 14 gün kartsız deneme, 7 gün ek süre, en az 3 gün önce bildirim, 30 gün salt-okunur', () => {
    const t = full('abonelik-sozlesmesi')
    expect(t).toMatch(/14 günlük ücretsiz deneme/)
    expect(t).toMatch(/kart bilgisi istenmez/)
    expect(t).toMatch(/7 günlük ek süre/)
    expect(t).toMatch(/en az 3 gün önce/)
    expect(t).toMatch(/30 gün boyunca hesap salt-okunur/)
    expect(t).toMatch(/otomatik değildir/) // kartsız deneme → otomatik ücretli dönüşüm yok
    expect(t).toMatch(/veri sorumlusu, Hizmet Sağlayıcı veri işleyen/)
  })

  it('iptal/iade: iade politikası ve fiyat değişikliği KARARI yer tutucu (uydurma yok)', () => {
    expect(full('iptal-iade')).toContain('{{İADE_POLİTİKASI}}')
    expect(full('abonelik-sozlesmesi')).toContain('{{FİYAT_DEĞİŞİKLİĞİ_BİLDİRİM_SÜRESİ}}')
    expect(full('abonelik-sozlesmesi')).toContain('{{KDV_GÖSTERİM_ŞEKLİ}}')
  })

  it('sistem gerçekleriyle uyum: kart verisi bize gelmez, sırlar AES-256-GCM, kiracı başına ayrı veritabanı', () => {
    expect(full('gizlilik')).toMatch(/AES-256-GCM/)
    expect(full('gizlilik')).toMatch(/ayrı bir veritabanında/)
    expect(full('gizlilik')).toMatch(/Kart numaranız ve güvenlik kodunuz bize hiç ulaşmaz/)
    expect(full('kvkk-aydinlatma')).toMatch(/Kart bilgileriniz.*saklanmaz/)
  })
})

describe('satır içi işleyici (renderInline)', () => {
  it('HTML kaçırır; yalnızca kalın, iç bağlantı ve yer tutucuyu dönüştürür', () => {
    expect(renderInline('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(renderInline('**a**')).toBe('<strong>a</strong>')
    expect(renderInline('[K](/yasal/kunye)')).toBe('<a href="/yasal/kunye">K</a>')
    expect(renderInline('{{KEP_ADRESİ}}')).toBe('<mark class="ph" data-ph="KEP_ADRESİ">{{KEP_ADRESİ}}</mark>')
    expect(renderInline('{{KVKK_BAŞVURU_EPOSTA}}')).toContain('data-ph="KVKK_BAŞVURU_EPOSTA"')
  })

  it('S16: değeri verilen yer tutucu değerle (kaçırılmış) değiştirilir; yalnızca company.ts alanları çözülür', () => {
    expect(placeholderValues.İLETİŞİM_EPOSTA).toBe('bilgi@entegrasyonik.com.tr')
    expect(Object.keys(placeholderValues).every((k) => ['İLETİŞİM_EPOSTA', 'ADRES', 'ŞİRKET_UNVANI', 'MERSİS_NO'].includes(k))).toBe(true)
    expect('ADRES' in placeholderValues).toBe(company.address.trim().length > 0)
    expect('ŞİRKET_UNVANI' in placeholderValues).toBe(company.legalName.trim().length > 0)
    expect('MERSİS_NO' in placeholderValues).toBe(company.mersisNo.trim().length > 0)
    expect(renderInline('{{İLETİŞİM_EPOSTA}}')).toBe('<span class="ph-value" data-ph-value="İLETİŞİM_EPOSTA">bilgi@entegrasyonik.com.tr</span>')
    expect(renderInline('{{KVKK_BAŞVURU_EPOSTA}}')).toContain('<mark class="ph" data-ph="KVKK_BAŞVURU_EPOSTA">')
    expect(renderInline('{{ADRES}}', { ADRES: '<b>X</b>' })).toContain('&lt;b&gt;X&lt;/b&gt;')
  })

  it('dış bağlantı ve javascript: bağlantısı DÖNÜŞMEZ (düz metin kalır)', () => {
    expect(renderInline('[x](https://evil.example)')).not.toContain('<a ')
    expect(renderInline('[x](javascript:alert(1))')).not.toContain('<a ')
    expect(renderInline('[x](//evil.example)')).not.toContain('<a ')
  })
})

describe('derlenmiş çıktı (taslak build)', () => {
  beforeAll(() => {
    buildSite({
      outDir: DRAFT_DIR,
      silent: true,
      env: { SITE_DRAFT: 'true', PUBLIC_APP_URL: 'https://app.example.test' },
    })
  })
  afterAll(() => rmSync(path.join(siteRoot, DRAFT_DIR), { recursive: true, force: true }))

  it('8 sayfa derlenir; tam bir h1, lang=tr, noindex, doğru başlık', () => {
    for (const d of legalDocs) {
      const html = pageHtml(DRAFT_DIR, d.slug)
      expect(html, d.slug).toMatch(/<html lang="tr"[ >]/)
      expect(html, d.slug).toMatch(/<meta name="robots" content="noindex,nofollow"/)
      expect(html.match(/<h1[ >]/g) ?? [], d.slug).toHaveLength(1)
      expect(html, d.slug).toContain(`<title>${d.title} · Entegrasyonik</title>`)
      expect(html, d.slug).toContain(d.version)
    }
  })

  it('her sayfada belirgin TASLAK bandı (metin + testid)', () => {
    for (const d of legalDocs) {
      const html = pageHtml(DRAFT_DIR, d.slug)
      expect(html, d.slug).toContain('data-testid="legal-draft-banner"')
      expect(textOf(html), d.slug).toContain('TASLAK — hukuki inceleme bekliyor (Protokol 12)')
    }
  })

  it('her sayfada "Doldurulması gereken alanlar" listesi var ve metindeki her yer tutucuyu içerir (birebir)', () => {
    for (const d of legalDocs) {
      const html = pageHtml(DRAFT_DIR, d.slug)
      const [body, fields] = html.split('id="doldurulacak-alanlar"')
      expect(fields, `${d.slug}: alan listesi yok`).toBeTruthy()
      expect(textOf(fields)).toContain('Doldurulması gereken alanlar')
      const inBody = new Set([...body.matchAll(/data-ph="([^"]+)"/g)].map((m) => m[1]))
      const inList = new Set([...fields.matchAll(/data-ph="([^"]+)"/g)].map((m) => m[1]))
      expect(inBody.size, d.slug).toBeGreaterThanOrEqual(1)
      expect([...inBody].sort(), d.slug).toEqual([...inList].sort())
      // S16: değeri verilmiş (çözülmüş) anahtarlar listeden düşer
      expect([...inList].sort(), d.slug).toEqual([...pendingPlaceholderKeys(d)].sort())
    }
  })

  it('içindekiler: her bağlantı hedefi sayfada var; tüm bölüm kimlikleri render edilir', () => {
    for (const d of legalDocs) {
      const html = pageHtml(DRAFT_DIR, d.slug)
      const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
      const tocHrefs = [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1])
      expect(tocHrefs.length, d.slug).toBeGreaterThanOrEqual(d.sections.length)
      for (const h of tocHrefs) expect(ids.has(h), `${d.slug} #${h}`).toBe(true)
      for (const s of d.sections) expect(ids.has(s.id), `${d.slug} bölüm ${s.id}`).toBe(true)
    }
  })

  it('yasaklı/doğrulanamayan ifadeler derlenmiş sayfalarda yok (notlar ve alan listesi dahil)', () => {
    for (const d of legalDocs) {
      const text = withoutVerified(textOf(pageHtml(DRAFT_DIR, d.slug)))
      for (const [label, re] of FORBIDDEN) expect(text, `${d.slug}: ${label}`).not.toMatch(re)
    }
  })

  it('bağlantı bütünlüğü: sayfa içi ve site içi bağlantıların hepsi derlenmiş dosyaya çözülür; dış bağlantı yalnızca uygulama girişi', () => {
    const dist = path.join(siteRoot, DRAFT_DIR)
    const resolves = (href: string) => {
      const clean = href.split('#')[0].split('?')[0]
      if (clean === '' || clean === '/') return true
      const abs = path.join(dist, clean)
      return (
        (existsSync(abs) && statSync(abs).isFile()) || existsSync(path.join(abs, 'index.html')) || existsSync(`${abs}.html`)
      )
    }
    for (const d of legalDocs) {
      const html = pageHtml(DRAFT_DIR, d.slug)
      const hrefs = [...html.matchAll(/<a[^>]*\shref="([^"]+)"/g)].map((m) => m[1])
      expect(hrefs.length, d.slug).toBeGreaterThan(10)
      for (const href of hrefs) {
        if (href.startsWith('https://app.example.test/')) continue // uygulamaya giriş/kayıt (başlık)
        if (href.startsWith('#')) continue // sayfa içi: önceki testte doğrulandı
        if (href === `mailto:${company.email}`) continue // S16: altbilgideki doğrulanmış genel iletişim adresi
        expect(href.startsWith('/'), `${d.slug}: beklenmeyen dış bağlantı ${href}`).toBe(true)
        expect(resolves(href), `${d.slug}: kırık bağlantı ${href}`).toBe(true)
      }
      // ilgili belgeler: kendisi hariç 7 bağlantı
      const related = html.split('data-testid="legal-related"')[1].split('</nav>')[0]
      expect((related.match(/href="\/yasal\//g) ?? []).length, d.slug).toBe(7)
    }
  })

  it('altbilgi 8 yasal bağlantıyı gösterir (published=true) ve ana sayfaya gider', () => {
    const home = read(path.join(siteRoot, DRAFT_DIR, 'index.html'))
    for (const n of legalNav) expect(home, n.href).toContain(`href="${n.href}"`)
  })

  it('inceleme notları taslakta görünür (insan/hukuk kararı işaretleri)', () => {
    let notes = 0
    for (const d of legalDocs) notes += (pageHtml(DRAFT_DIR, d.slug).match(/data-testid="review-note"/g) ?? []).length
    expect(notes).toBeGreaterThanOrEqual(8)
  })

  it('çerez politikası: çerezsiz site beyanı DOĞRU — derlenmiş betikler çerez/depolama API\'si kullanmaz', () => {
    const text = textOf(pageHtml(DRAFT_DIR, 'cerez'))
    expect(text).toContain('Tanıtım sitesi çerez kullanmaz')
    const assets = path.join(siteRoot, DRAFT_DIR, '_astro')
    const js = readdirSync(assets).filter((f) => f.endsWith('.js'))
    for (const f of js) {
      const code = read(path.join(assets, f))
      expect(code, f).not.toMatch(/document\.cookie|sessionStorage|indexedDB/)
      // ADR-0014 S3: TEK istisna — "Animasyonları durdur" tercihi (anahtar ek-site-motion), yalnızca kullanıcı
      // düğmeye basınca yazılır; çerez politikası bunu açıkça beyan eder (aşağıdaki metin kontrolü).
      if (/localStorage/.test(code)) {
        expect(code, f).toContain('ek-site-motion')
        expect([...code.matchAll(/localStorage\.(\w+)/g)].map((m) => m[1]).every((m) => ['getItem', 'setItem', 'removeItem'].includes(m)), f).toBe(true)
        expect(text).toContain('Animasyonları durdur')
        expect(text).toContain('localStorage')
      }
    }
    // ve sayfa kaynağında üçüncü taraf origin yok
    for (const d of legalDocs) expect(pageHtml(DRAFT_DIR, d.slug), d.slug).not.toMatch(/(?:src|href)="https?:\/\/(?!app\.example\.test)/)
  })

  it('yazdırma stili: üst/alt bilgi ve içindekiler gizlenir', () => {
    const cssDir = path.join(siteRoot, DRAFT_DIR, '_astro')
    const css = readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => read(path.join(cssDir, f)))
      .join('\n')
    expect(css).toMatch(/@media print/)
    expect(css).toMatch(/\.site-header[^}]*\{[^}]*display:\s*none/)
  })
})

describe('derlenmiş çıktı (SITE_DRAFT=false — notlar gizli, TASLAK bandı ve noindex sürer)', () => {
  beforeAll(() => {
    buildSite({
      outDir: LIVE_DIR,
      silent: true,
      env: { SITE_DRAFT: 'false', PUBLIC_APP_URL: 'https://app.example.test', PUBLIC_SITE_URL: 'https://site.example.test' },
    })
  })
  afterAll(() => rmSync(path.join(siteRoot, LIVE_DIR), { recursive: true, force: true }))

  it('hukuki onay yokken yasal sayfalar noindex kalır, TASLAK bandı sürer, inceleme notları çıkar', () => {
    for (const d of legalDocs) {
      const html = pageHtml(LIVE_DIR, d.slug)
      expect(html, d.slug).toMatch(/<meta name="robots" content="noindex,nofollow"/)
      expect(html, d.slug).toContain('data-testid="legal-draft-banner"')
      expect(html, d.slug).not.toContain('data-testid="review-note"')
      expect(html, d.slug).not.toContain('İnsan/hukuk kararı notu')
      // alan listesi yine de vardır (yayında doldurulmadan kalan alan görünür kalmalı)
      expect(html, d.slug).toContain('id="doldurulacak-alanlar"')
    }
  })
})

/**
 * Otopilot vaat kaydı testi (S24 — kullanıcı kararları K43–K46; S18/S22 `upcoming.test.ts`'in yerine).
 *
 * K43: Otopilot sitede "erken erişim / geliştirme aşamasında / yakında" diye SUNULMAZ; hazır bir özellik gibi,
 * şimdiki zamanla anlatılır. Bu nedenle S18'deki "yolda" istisnası (aşama rozeti zorunluluğu, gelecek kipi, sayfaya
 * özel MCP izni) KALDIRILDI. Yerine şu kilitler gelir:
 *   (1) Tek kayıt: her vaat cümlesi `src/data/agent-claims.ts`'te yazılır; sayfa verisindeki her vaat alanı bu kayıttaki
 *       bir metne BİREBİR eşittir; kullanılmayan (ölü) vaat yok; kayıt yalnızca `assistant.ts` tarafından okunur.
 *   (2) `readiness` iç notu (yayın öncesi ürün kontrolü) sayfa verisine, derleme çıktısına ve llms metinlerine SIZMAZ;
 *       `live` durumundaki vaatlerin dayanağı repo içi kanıttır (dosya + atıf metni), diğerlerinin dayanağı (varsa) mevcut.
 *   (3) Katı dil: Otopilot yüzeyleri claims.test.ts'in yasaklarından HİÇBİR istisna almaz (MCP adı dahil); ayrıca
 *       aşama/örnek etiketi, yol haritası dili, tarih, müşteri/referans iddiası, abartı ve fiyat/paket vaadi yok;
 *       rakam yalnızca dekoratif sohbet sahnesinin kurgusal verisinde.
 *   (4) Demo: form yok; mailto konusu "<ad> demo talebi"; satır içi style yok.
 * claims.test.ts'teki Otopilot DIŞI kanıt/iddia korumaları GEVŞETİLMEDİ (listeler oradan okunur).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_CLAIMS, claim, type AgentClaimId } from '../src/data/agent-claims'
import {
  AGENT_SURFACES,
  ASSISTANT_PATH,
  assistantHero,
  assistantScenario,
  agentConsole,
  loopSection,
  agentsSection,
  controlSection,
  chatSection,
  assistantFaq,
  assistantCta,
  assistantTeaser,
  heroAgentEntry,
  homeAgentGain,
  featuresBridge,
  assistantLlms,
} from '../src/data/assistant'
import { primaryNav } from '../src/data/navigation'
import { seoEntries } from '../src/data/seo'
import { AGENT_BRAND, AGENT_NAME, AGENT_PATH, AGENT_SLUG, AGENT_LEGACY_PATHS, slugify } from '../src/data/agent-brand'
import { buildRedirectRules, buildRedirectsFile, parseRedirectsFile } from '../src/lib/redirects.mjs'
import { buildSite } from '../scripts/lib/build.mjs'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(siteRoot, '..')
const srcDir = path.join(siteRoot, 'src')

// ------------------------------------------------------------------------------------------ yardımcılar (claims.test ile aynı)

const FOLD: Record<string, string> = { ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ı: 'i', â: 'a', î: 'i', û: 'u' }
const norm = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/[çşğüöıâîû]/g, (c) => FOLD[c] ?? c)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const phraseRe = (p: string) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(norm(p))}(?![\\p{L}\\d])`, 'u')
const prefixRe = (p: string) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(norm(p))}`, 'u')

interface Leaf {
  path: string
  key: string
  text: string
}
function leaves(value: unknown, p = '$', key = ''): Leaf[] {
  if (typeof value === 'string') return [{ path: p, key, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${p}[${i}]`, key))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, `${p}.${k}`, k))
  return []
}
/** Görünür metin yaprakları: kimlik/ikon/durum alanları hariç. */
const visibleLeaves = (value: unknown, p: string) => leaves(value, p).filter((l) => !['id', 'icon', 'state', 'actor', 'subject'].includes(l.key))

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) return walk(p, exts)
    return exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*(\/\/|\*).*$/gm, '')

/** claims.test.ts'teki listeleri KAYNAKTAN okur (tek doğruluk kaynağı; iki test birbirinden kopmasın). */
const claimsSrc = readFileSync(path.join(siteRoot, 'tests', 'claims.test.ts'), 'utf8')
function stringArray(name: string): string[] {
  const m = claimsSrc.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\]`))
  if (!m) throw new Error(`${name} claims.test.ts'te bulunamadı`)
  return [...m[1].matchAll(/^\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)].map((x) => x[1].replace(/\\'/g, "'"))
}
const STATIC_FORBIDDEN_NAMES = stringArray('STATIC_FORBIDDEN_NAMES')
const ABSOLUTE_PREFIXES = stringArray('ABSOLUTE_PREFIXES')
const UNPROVEN_INFRA = stringArray('UNPROVEN_INFRA')

const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ['kargo API/entegrasyon iddiası', /kargo\s+(api|entegrasyon)/],
  ['e-fatura/e-arşiv varyantı', /(?<![\p{L}\d])e-?(fatura|arsiv|irsaliye)/u],
  ['masaüstü uygulaması', /masaustu\s+uygulama/],
  ['yol haritası dili', /(?<![\p{L}\d])(yakinda|cok yakinda|planlaniyor|yol haritasi|roadmap|beta|upcoming)(?![\p{L}\d])/u],
]
/** K43/K44: aşama ve "örnek" etiketleri — Otopilot yüzeylerinde ve derlenmiş sitede hiçbir yerde. */
const STAGE_AND_SAMPLE_LABELS = [
  'erken erisim',
  'gelistirme asamasinda',
  'gelistiriyoruz',
  'planlanan',
  'planliyoruz',
  'ornek gorunum',
  'ornek senaryo',
  'temsili tasarim',
  'canli urun ekrani degildir',
  'bugunku surumunde yok',
]
/** K45: teknik anlatım (protokol/mimari/veritabanı yapısı) Otopilot yüzeylerinde yok. */
const TECHNICAL_TERMS = ['model context protocol', 'mcp', 'protokol', 'acik standart', 'veritabani', 'kiraci', 'api', 'yetenek kaydi', 'sozlesme bekcisi', 'yerel uygulama']
const DATE_WORDS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik', 'ceyrek', 'bu yil', 'gelecek yil', 'yil sonu', 'q1', 'q2', 'q3', 'q4']
const CUSTOMER_CLAIMS = ['musterilerimiz', 'musterimiz', 'kullanicilarimiz', 'referans', 'bekleme listesi', 'firma kullan', 'isletme kullan', 'basari hikaye']
const HYPE = ['her seyi', 'her sey', 'sihir', 'kendi kendine', 'insan mudahalesi olmadan', 'otomatik pilot', 'devrim', 'zahmetsiz', 'dusunmenize gerek']
/** K46 madde 7: Otopilot yüzeylerinde fiyat/paket dili yok. S25 (K46 fiyat kararı): plan dahiliyeti YALNIZCA /fiyatlandirma'da anlatılır (src/data/pricing.ts, tests/nav-menu.test.ts). */
const PRICING_WORDS = ['ucret', 'fiyatlandirma', 'paket', 'plan dahil', 'ek ucret', 'bedava', 'ucretsiz']

// ------------------------------------------------------------------------------------------ içerik kümeleri

/** Otopilot sayfasının tüm verisi (sohbet sahnesi hariç — kurgusal veri, rakama izinli ayrı küme). */
const pageContent = {
  hero: assistantHero,
  console: agentConsole,
  loop: loopSection,
  agents: agentsSection,
  control: controlSection,
  chat: chatSection,
  faq: assistantFaq,
  cta: assistantCta,
}
const surfaceContent = { page: pageContent, teaser: assistantTeaser, heroEntry: heroAgentEntry, agentGain: homeAgentGain, bridge: featuresBridge, llms: assistantLlms }
const pageLeaves = visibleLeaves(pageContent, '$page')
const scenarioLeaves = visibleLeaves(assistantScenario, '$scenario')
const surfaceLeaves = [...visibleLeaves(surfaceContent, '$surface'), ...scenarioLeaves]

/**
 * VAAT alanları: açıklama/değer/kart metni/SSS yanıtı/llms satırı. Başlık, etiket, düğme gibi kısa yönlendirme metinleri
 * vaat değildir; onlar yalnızca katı dil taramasından geçer. Burada adı geçen her alan kayıttan gelmek ZORUNDA.
 */
const PROMISE_KEYS = new Set(['lead', 'text', 'value', 'answer', 'principle', 'watches', 'brings', 'short', 'full'])
const promiseLeaves = visibleLeaves(surfaceContent, '$surface').filter((l) => PROMISE_KEYS.has(l.key) || (l.key === 'title' && /\.(hero|heroEntry)\./.test(l.path)))
const claimTexts = new Map(Object.entries(AGENT_CLAIMS).map(([id, c]) => [c.text, id as AgentClaimId]))

/** Derlenmiş taslak site (gerçek `astro build`; `site/dist-agent`, git-ignored). */
let distDir = ''
beforeAll(() => {
  distDir = buildSite({ outDir: 'dist-agent', env: { SITE_DRAFT: 'true' }, silent: true })
})
const distFile = (route: string) => path.join(distDir, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`)
const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
const visibleHtmlText = (html: string) =>
  decode(
    html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()

// ------------------------------------------------------------------------------------------ ad sabiti (S22; değişmedi)

describe('S22 ad sabiti: ad tek yerden, rota türetilir, eski adres 301', () => {
  it('ad boş değil; slug addan türer; rota = /<slug>; tam ad "Entegrasyonik <ad>"', () => {
    expect(AGENT_BRAND.trim().length).toBeGreaterThan(2)
    expect(AGENT_SLUG).toBe(slugify(AGENT_BRAND))
    expect(AGENT_SLUG).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(AGENT_PATH).toBe(`/${AGENT_SLUG}`)
    expect(AGENT_NAME).toBe(`Entegrasyonik ${AGENT_BRAND}`)
    expect(slugify('Kontrol Kulesi')).toBe('kontrol-kulesi')
    expect(slugify('Operasyon Ajanları')).toBe('operasyon-ajanlari')
  })

  it('"Asistan" adı kullanılmaz; üçüncü taraf/rakip ürün adı (Copilot vb.) ad olarak seçilemez', () => {
    const n = norm(AGENT_BRAND)
    for (const bad of ['asistan', 'copilot', 'co-pilot', 'gemini', 'chatgpt', 'siri', 'alexa', 'cortana']) expect(n, bad).not.toContain(bad)
    expect(AGENT_PATH).not.toBe('/asistan')
  })

  it('eski /asistan adresi (ve markdown sürümü) yeni rotaya 301 ile yönlenir', () => {
    expect(AGENT_LEGACY_PATHS).toContain('/asistan')
    expect(AGENT_LEGACY_PATHS).not.toContain(AGENT_PATH)
    const rules = parseRedirectsFile(buildRedirectsFile(buildRedirectRules(AGENT_LEGACY_PATHS, AGENT_PATH)))
    expect(rules).toContainEqual({ from: '/asistan', to: AGENT_PATH, status: 301 })
    expect(rules).toContainEqual({ from: '/asistan/', to: AGENT_PATH, status: 301 })
    expect(rules).toContainEqual({ from: '/asistan.md', to: `${AGENT_PATH}.md`, status: 301 })
    expect(() => buildRedirectRules(['/x y'], AGENT_PATH)).toThrow()
  })

  it('ad metin olarak yalnızca ad sabitinde yazılır (kaynakta sabit kopya yok → değiştirmek tek satır)', () => {
    const hits = walk(srcDir, ['.astro', '.ts', '.mjs'])
      .filter((f) => !f.endsWith(`${path.sep}agent-brand.ts`))
      .filter((f) => phraseRe(AGENT_BRAND).test(norm(stripComments(readFileSync(f, 'utf8')))))
      .map((f) => path.relative(srcDir, f))
    expect(hits).toEqual([])
    const legacy = walk(srcDir, ['.astro', '.ts'])
      .filter((f) => /(pages|components|data)/.test(f) && !f.includes(`${path.sep}kb${path.sep}`))
      .filter((f) => /['">]\s*[^'"<]*\bAsistan\b/.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => path.relative(srcDir, f))
    expect(legacy).toEqual([])
  })

  it('gezinmede ajan bağlantısı (etiket = ad sabiti) "Yeni" rozetli; yalnızca bu öğe rozet taşır', () => {
    const item = primaryNav.find((i) => i.href === ASSISTANT_PATH)!
    expect(item.label).toBe(AGENT_BRAND)
    expect(item.published).toBe(true)
    expect(item.badge).toBe('Yeni')
    expect(primaryNav.filter((i) => i.badge).map((i) => i.href)).toEqual([ASSISTANT_PATH])
  })
})

// ------------------------------------------------------------------------------------------ (1) tek kayıt

describe('(1) vaatler yalnızca agent-claims kaydından gelir', () => {
  const ids = Object.keys(AGENT_CLAIMS) as AgentClaimId[]

  it('kayıt dolu; metinler boş değil ve benzersiz; claim() metni döndürür', () => {
    expect(ids.length).toBeGreaterThanOrEqual(30)
    for (const id of ids) expect(AGENT_CLAIMS[id].text.trim().length, id).toBeGreaterThan(8)
    expect(new Set(ids.map((id) => AGENT_CLAIMS[id].text)).size).toBe(ids.length)
    expect(claim('core-title')).toBe(AGENT_CLAIMS['core-title'].text)
  })

  it('tarama kümesi dolu (test sessizce boşalmasın)', () => {
    expect(promiseLeaves.length).toBeGreaterThanOrEqual(30)
    expect(pageLeaves.length).toBeGreaterThan(50)
    expect(scenarioLeaves.length).toBeGreaterThan(20)
  })

  it('sayfa verisindeki HER vaat alanı kayıttaki bir metne birebir eşit (markup/veride serbest vaat yazılmaz)', () => {
    const orphan = promiseLeaves.filter((l) => !claimTexts.has(l.text)).map((l) => `${l.path}: ${l.text.slice(0, 70)}`)
    expect(orphan).toEqual([])
  })

  it('kullanılmayan (ölü) vaat yok: kayıttaki her metin en az bir yüzeyde kullanılıyor', () => {
    const used = new Set(visibleLeaves(surfaceContent, '$surface').map((l) => l.text))
    expect(ids.filter((id) => !used.has(AGENT_CLAIMS[id].text))).toEqual([])
  })

  it('kaydı yalnızca data/assistant.ts okur; sayfa/bileşenler kaydı doğrudan içe aktarmaz', () => {
    const importers = walk(srcDir, ['.astro', '.ts', '.mjs'])
      .filter((f) => /from\s+'[^']*agent-claims'/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(srcDir, f).split(path.sep).join('/'))
    expect(importers).toEqual(['data/assistant.ts'])
  })

  it('assistant verisini yalnızca izinli dosyalar içe aktarır; hero/Özellikler/llms yalnızca güvenli alanları kullanır', () => {
    const importers = walk(srcDir, ['.astro', '.ts', '.mjs'])
      .filter((f) => !f.includes(`${path.sep}data${path.sep}`))
      .filter((f) => /from\s+'[./]*(?:\.\.\/)*data\/assistant'/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(srcDir, f).split(path.sep).join('/'))
      .sort()
    expect(importers).toEqual(
      [
        'components/assistant/AgentConsole.astro',
        'components/assistant/AgentLoop.astro',
        'components/assistant/ChatScene.astro',
        'components/home/AssistantTeaser.astro',
        'components/home/Hero.astro',
        'components/home/ProblemSolution.astro',
        'pages/[ajan].astro',
        'pages/llms-full.txt.ts',
        'pages/ozellikler.astro',
      ].sort(),
    )
    const SAFE = new Set(['ASSISTANT_PATH', 'ASSISTANT_NAME', 'featuresBridge', 'assistantLlms', 'heroAgentEntry', 'homeAgentGain'])
    for (const f of ['pages/ozellikler.astro', 'pages/llms-full.txt.ts', 'components/home/Hero.astro', 'components/home/ProblemSolution.astro']) {
      const m = readFileSync(path.join(srcDir, f), 'utf8').match(/import\s*\{([^}]*)\}\s*from\s*'[^']*data\/assistant'/)!
      const names = m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
      for (const n of names) expect(SAFE.has(n), `${f}: ${n}`).toBe(true)
    }
    for (const c of AGENT_SURFACES.components) expect(existsSync(path.join(srcDir, c)), c).toBe(true)
    expect(AGENT_SURFACES.pages).toEqual([AGENT_PATH])
  })

  it('SEO açıklaması ve llms özeti de kayıttan/katı taramadan: llms satırları kayıt metni', () => {
    const entry = seoEntries.find((e) => e.path === AGENT_PATH)!
    expect(entry.llmsSummary).toBe(claim('llms-short'))
    for (const l of [assistantLlms.short, ...assistantLlms.full]) expect(claimTexts.has(l), l).toBe(true)
  })

  it('derlenmiş sayfalarda kayıt metinleri birebir görünür (ajan sayfası, ana sayfa, Özellikler)', () => {
    const page = visibleHtmlText(readFileSync(distFile(AGENT_PATH), 'utf8'))
    const home = visibleHtmlText(readFileSync(distFile('/'), 'utf8'))
    const features = visibleHtmlText(readFileSync(distFile('/ozellikler'), 'utf8'))
    const onPage = new Set(visibleLeaves(pageContent, '$').map((l) => l.text))
    for (const [text, id] of claimTexts) {
      if (onPage.has(text)) expect(page, id).toContain(text)
    }
    for (const p of assistantTeaser.points) expect(home).toContain(p.text)
    expect(home).toContain(assistantTeaser.lead)
    expect(home).toContain(heroAgentEntry.value)
    expect(home).toContain(heroAgentEntry.moment.text)
    expect(home).toContain(homeAgentGain.text)
    expect(features).toContain(featuresBridge.text)
  })
})

// ------------------------------------------------------------------------------------------ (2) readiness gizli

describe('(2) readiness iç notu: sızmaz; dayanağı doğrulanabilir', () => {
  const ids = Object.keys(AGENT_CLAIMS) as AgentClaimId[]

  it('her vaatin readiness durumu geçerli ve notu dolu', () => {
    for (const id of ids) {
      const r = AGENT_CLAIMS[id].readiness
      expect(['live', 'building', 'planned'], id).toContain(r.status)
      expect(r.note.trim().length, id).toBeGreaterThan(5)
    }
  })

  it('"live" vaatlerin dayanağı en az bir kod dosyası; tüm dayanaklar mevcut ve atıf metni dosyada geçiyor', () => {
    const bad: string[] = []
    for (const id of ids) {
      const r = AGENT_CLAIMS[id].readiness
      if (r.status === 'live' && !r.basis.some((b) => b.path.startsWith('backend/src/') || b.path.startsWith('docs/adr/0003'))) bad.push(`${id}: live ama kod dayanağı yok`)
      for (const b of r.basis) {
        const p = path.join(repoRoot, b.path)
        if (path.isAbsolute(b.path) || b.path.includes('..')) bad.push(`${id}: göreli değil ${b.path}`)
        else if (!existsSync(p)) bad.push(`${id}: dosya yok ${b.path}`)
        else if (b.contains && !readFileSync(p, 'utf8').includes(b.contains)) bad.push(`${id}: "${b.contains}" yok (${b.path})`)
      }
    }
    expect(bad).toEqual([])
  })

  it('CANLI: "control-readonly" (live) — bugün hiçbir yetenek ajanlara açık değil (yetenek kaydı)', () => {
    expect(AGENT_CLAIMS['control-readonly'].readiness.status).toBe('live')
    const domainDir = path.join(repoRoot, 'backend', 'src', 'capabilities', 'domains')
    const files = readdirSync(domainDir).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThanOrEqual(10)
    for (const f of files) expect(readFileSync(path.join(domainDir, f), 'utf8'), f).not.toMatch(/allowed:\s*true/)
  })

  it('sayfa verisi JSON\'unda readiness/basis/evidence alanı yok', () => {
    const json = JSON.stringify({ ...surfaceContent, scenario: assistantScenario })
    for (const k of ['"readiness"', '"basis"', '"evidence"', '"status":"planned"', '"status":"building"']) expect(json).not.toContain(k)
  })

  it('readiness notları hiçbir derlenmiş HTML\'de, llms.txt ve llms-full.txt\'te görünmez', () => {
    const notes = ids.map((id) => AGENT_CLAIMS[id].readiness.note).filter((n) => n.length > 20)
    const files = [...walk(distDir, ['.html']), path.join(distDir, 'llms.txt'), path.join(distDir, 'llms-full.txt')].filter((f) => existsSync(f))
    expect(files.length).toBeGreaterThan(20)
    const hits: string[] = []
    for (const f of files) {
      const t = decode(readFileSync(f, 'utf8'))
      for (const n of notes) if (t.includes(n)) hits.push(`${path.relative(distDir, f)}: ${n.slice(0, 40)}`)
    }
    expect(hits).toEqual([])
  })
})

// ------------------------------------------------------------------------------------------ (3) katı dil

describe('(3) Otopilot yüzeyleri katı dil taramasından istisnasız geçer', () => {
  it('aşama ve "örnek" etiketleri yok (K43/K44)', () => {
    const hits: string[] = []
    for (const l of surfaceLeaves) for (const w of STAGE_AND_SAMPLE_LABELS) if (prefixRe(w).test(norm(l.text))) hits.push(`${l.path}: "${w}"`)
    expect(hits).toEqual([])
  })

  it('teknik anlatım yok: protokol/MCP, veritabanı, API, yetenek kaydı, yerel uygulama (K45)', () => {
    const hits: string[] = []
    for (const l of surfaceLeaves) for (const w of TECHNICAL_TERMS) if (phraseRe(w).test(norm(l.text))) hits.push(`${l.path}: "${w}"`)
    expect(hits).toEqual([])
  })

  it('yasaklı ürün/kanal adları (MCP dahil, istisnasız) ve kalıplar geçmez', () => {
    const hits: string[] = []
    for (const l of surfaceLeaves) {
      const t = norm(l.text)
      for (const n of STATIC_FORBIDDEN_NAMES) if (phraseRe(n).test(t)) hits.push(`${l.path}: "${n}"`)
      for (const [label, re] of FORBIDDEN_PATTERNS) if (re.test(t)) hits.push(`${l.path}: ${label}`)
    }
    expect(hits).toEqual([])
    expect(STATIC_FORBIDDEN_NAMES).toContain('MCP')
  })

  it('mutlak/garanti, sertifika/SLA, tarih, müşteri/referans, abartı ve fiyat/paket vaadi yok', () => {
    const hits: string[] = []
    for (const l of surfaceLeaves) {
      const t = norm(l.text)
      for (const p of [...ABSOLUTE_PREFIXES, ...UNPROVEN_INFRA]) if (prefixRe(p).test(t)) hits.push(`${l.path}: "${p}"`)
      for (const w of DATE_WORDS) if (phraseRe(w).test(t)) hits.push(`${l.path}: tarih "${w}"`)
      for (const w of [...CUSTOMER_CLAIMS, ...HYPE, ...PRICING_WORDS]) if (prefixRe(w).test(t)) hits.push(`${l.path}: "${w}"`)
    }
    expect(hits).toEqual([])
  })

  it('ziyaretçiye "müşteri" denmez (yalnızca "son müşterileriniz" gibi onların alıcıları anlamında)', () => {
    const hits = surfaceLeaves.filter((l) => /(?<![\p{L}])musteri(?!lerinizin|leriniz|nizin)/u.test(norm(l.text).replace(/son musteri\p{L}*/gu, ''))).map((l) => l.path)
    expect(hits).toEqual([])
  })

  it('rakam YALNIZCA dekoratif sohbet sahnesinin kurgusal verisinde', () => {
    const hits = visibleLeaves(surfaceContent, '$surface')
      .filter((l) => /\d/.test(l.text))
      .map((l) => `${l.path}: ${l.text.slice(0, 80)}`)
    expect(hits).toEqual([])
    expect(scenarioLeaves.some((l) => /\d/.test(l.text))).toBe(true)
  })

  it('hero sade: tek başlık + tek cümle + tek CTA (K46 madde 7)', () => {
    expect(Object.keys(assistantHero).sort()).toEqual(['accent', 'descriptor', 'eyebrow', 'lead', 'primary', 'title'].sort())
    expect(assistantHero.lead.split(/(?<=[.!?])\s+/).filter(Boolean)).toHaveLength(1)
    expect(assistantHero.title).toContain(assistantHero.accent)
    const src = readFileSync(path.join(srcDir, 'pages', '[ajan].astro'), 'utf8')
    const hero = src.match(/<Section tone="stage" labelledby="page-title"[\s\S]*?<\/Section>/)![0]
    expect([...hero.matchAll(/<Button\b/g)]).toHaveLength(1)
    expect(hero).toMatch(/<Button href="#demo"/)
  })

  it('ajan döngüsü: beş adım, tek insan adımı; onay kapısı akışında tek insan adımı', () => {
    expect(loopSection.steps.map((st) => st.id)).toEqual(['gozle', 'oner', 'onayla', 'uygula', 'raporla'])
    expect(loopSection.steps.filter((st) => st.actor === 'you').map((st) => st.id)).toEqual(['onayla'])
    expect(controlSection.flow.filter((f) => f.actor === 'you')).toHaveLength(1)
  })

  it('derlenmiş sitenin HİÇBİR sayfasında aşama/örnek etiketi ve MCP adı yok (yasal ve rehber hariç)', () => {
    const files = walk(distDir, ['.html']).filter((f) => !f.includes(`${path.sep}yasal${path.sep}`) && !f.includes(`${path.sep}rehber${path.sep}`))
    const hits: string[] = []
    for (const f of files) {
      const t = norm(visibleHtmlText(readFileSync(f, 'utf8')))
      for (const w of STAGE_AND_SAMPLE_LABELS) if (prefixRe(w).test(t)) hits.push(`${path.relative(distDir, f)}: "${w}"`)
      if (phraseRe('MCP').test(t)) hits.push(`${path.relative(distDir, f)}: MCP`)
    }
    expect(hits).toEqual([])
  })
})

// ------------------------------------------------------------------------------------------ (4) demo

describe('(4) demo talebi: form yok, mailto deseni, CSP', () => {
  it('konu "<ad> demo talebi"; sayfa, bölüm ve görsel kaynaklarında <form> yok; kayıt bağlantısı var', () => {
    expect(assistantCta.subject).toBe(`${AGENT_BRAND} demo talebi`)
    const files = ['pages/[ajan].astro', ...AGENT_SURFACES.components, 'components/assistant/ChatScene.astro', 'components/assistant/AgentConsole.astro', 'components/assistant/AgentLoop.astro']
    for (const f of files) expect(readFileSync(path.join(srcDir, f), 'utf8'), f).not.toMatch(/<form\b/)
    const page = readFileSync(path.join(srcDir, 'pages', '[ajan].astro'), 'utf8')
    expect(page).toMatch(/<EmailActions[^>]*subject=\{assistantCta\.subject\}/)
    expect(page).toMatch(/href=\{appUrls\.register\(\)\}/)
    expect(page).toContain('id="demo"')
  })

  it('satır içi style özniteliği yok (CSP style-src \'self\')', () => {
    for (const f of ['pages/[ajan].astro', ...AGENT_SURFACES.components, 'components/assistant/ChatScene.astro', 'components/assistant/AgentConsole.astro', 'components/assistant/AgentLoop.astro']) {
      expect(readFileSync(path.join(srcDir, f), 'utf8'), f).not.toMatch(/\sstyle=/)
    }
  })
})

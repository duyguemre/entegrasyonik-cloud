/**
 * "Yolda" (upcoming) yüzeylerinin koruma testi (S18 — Entegrasyonik Asistan; S22 — ad sabiti `AGENT_BRAND`, varsayılan
 * "Otopilot", rota `AGENT_PATH`, eski `/asistan` → 301).
 *
 * Sohbetle yönetim, yerel uygulama ve ajanlar ürünün bugünkü sürümünde YOK. claims.test.ts'in "yakında/yol haritası"
 * ve kanıtsız-iddia korumaları GEVŞETİLMEZ; bunun yerine DAR ve gerekçeli bir istisna tanımlanır:
 *   - İstisna yüzeyleri yalnızca `UPCOMING_SURFACES`: ajan sayfası (`AGENT_PATH`) + ana sayfa bandı (AssistantTeaser.astro).
 *   - İstisna yalnızca iki şeydir: "yol haritası dili" (yakında, planlanan...) ve /asistan'da "MCP" adı
 *     (Model Context Protocol'ü sade dille anlatmak için). Diğer TÜM yasaklar (roadmap kanal adları, e-fatura/kargo
 *     API'si, "masaüstü uygulaması", mutlak/garanti iddiaları, sertifika/SLA, kanıtsız rakam) bu yüzeylerde de geçerli.
 * Buna ek olarak bu yüzeylere ÖZEL, daha sıkı kurallar:
 *   (1) her planlanan kart ve güven maddesi bir aşama etiketi taşır (Geliştirme aşamasında / Erken erişim / Planlanan);
 *   (2) planlanan metinler kesin kipte ("yapar/yapıyor/yapmaktadır") yazılmaz, gelecek/niyet kipinde yazılır
 *       ("-acak/-ecek", "geliştiriyoruz/planlıyoruz");
 *   (3) rakam yalnızca "Örnek senaryo" etiketli sahne verisinde; tarih, müşteri ve abartı ("her şeyi yapar") iddiası yok;
 *   (4) "bugün kodda" denen her güven maddesi repo içi evidence'a bağlı (claims.test.ts ile aynı PATHS/evidence deseni)
 *       ve "hiçbir yetenek ajanlara açık değil" cümlesi yetenek kaydına karşı CANLI doğrulanır;
 *   (5) assistant verisini yalnızca izinli dosyalar içe aktarır; Özellikler köprüsü ve llms* istisna DEĞİLDİR.
 * Derlenmiş HTML kontrolleri (her kartta rozet, form yok, mailto konusu): tests/pages.test.ts "S18" bölümü.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  UPCOMING_SURFACES,
  STAGE_LABELS,
  ASSISTANT_PATH,
  assistantHero,
  assistantScenario,
  agentConsole,
  loopSection,
  guardrailsSection,
  heroAgentEntry,
  chatSection,
  localSection,
  agentsSection,
  trustSection,
  assistantFaq,
  assistantCta,
  assistantTeaser,
  featuresBridge,
  assistantLlms,
  type AssistantStage,
} from '../src/data/assistant'
import { primaryNav } from '../src/data/navigation'
import { AGENT_BRAND, AGENT_NAME, AGENT_PATH, AGENT_SLUG, AGENT_LEGACY_PATHS, slugify } from '../src/data/agent-brand'
import { buildRedirectRules, buildRedirectsFile, parseRedirectsFile } from '../src/lib/redirects.mjs'

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
/** Görünür metin yaprakları: evidence/basis (iç kanıt) ve kimlik alanları hariç. */
const visibleLeaves = (value: unknown, p: string) =>
  leaves(value, p).filter((l) => !/\.(evidence|basis)\[/.test(l.path) && !['id', 'icon', 'stage', 'subject'].includes(l.key))

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) return walk(p, exts)
    return exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}

/**
 * claims.test.ts'teki listeleri KAYNAKTAN okur (tek doğruluk kaynağı; iki test birbirinden kopmasın).
 * Liste yeniden adlandırılır/boşalırsa ayrıştırma testi kırılır.
 */
const claimsSrc = readFileSync(path.join(siteRoot, 'tests', 'claims.test.ts'), 'utf8')
function stringArray(name: string): string[] {
  const m = claimsSrc.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\]`))
  if (!m) throw new Error(`${name} claims.test.ts'te bulunamadı`)
  return [...m[1].matchAll(/^\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)].map((x) => x[1].replace(/\\'/g, "'"))
}
const STATIC_FORBIDDEN_NAMES = stringArray('STATIC_FORBIDDEN_NAMES')
const ABSOLUTE_PREFIXES = stringArray('ABSOLUTE_PREFIXES')
const UNPROVEN_INFRA = stringArray('UNPROVEN_INFRA')

/** Upcoming yüzeylerde de geçerli kalan kalıp yasakları (claims.test FORBIDDEN_PATTERNS'ın "yol haritası dili" DIŞINDAKİLER). */
const STILL_FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ['kargo API/entegrasyon iddiası', /kargo\s+(api|entegrasyon)/],
  ['e-fatura/e-arşiv varyantı', /(?<![\p{L}\d])e-?(fatura|arsiv|irsaliye)/u],
  ['masaüstü uygulaması', /masaustu\s+uygulama/],
]
const ROADMAP_LANGUAGE = /(?<![\p{L}\d])(yakinda|cok yakinda|planlaniyor|yol haritasi|roadmap|beta)(?![\p{L}\d])/u

/** İstisna: yalnızca ajan sayfasında (`AGENT_PATH`) ve yalnızca bu ad. */
const PAGE_ONLY_ALLOWED_NAMES = ['MCP']

/** Kesin kip (bugün yapıyormuş gibi): 3. tekil/çoğul şimdiki zaman, -mektedir, sık geniş zaman fiilleri. */
const DEFINITE_PRESENT = /(?<![\p{L}])\p{L}+(?:iyor|uyor|yor)(?:lar)?(?![\p{L}])/u
const DEFINITE_FORMAL = /(?<![\p{L}])\p{L}+(?:mekte|makta)(?:dir|dirler)?(?![\p{L}])/u
const DEFINITE_AORIST = [
  'yapar',
  'saglar',
  'calisir',
  'yonetir',
  'bulur',
  'yakalar',
  'halleder',
  'duzeltir',
  'otomatiklestirir',
  'uygular',
  'gunceller',
  'olusturur',
  'onerir',
  'hazirlar',
  'gosterir',
  'cozer',
  'anlar',
]
/** Gelecek / niyet kipi işaretçisi (en az biri ZORUNLU). */
const FUTURE_MARKER = /(acak|ecek|acag|eceg|yoruz|hedefl|planl|tasarl)/

const DATE_WORDS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik', 'ceyrek', 'bu yil', 'gelecek yil', 'yil sonu', 'q1', 'q2', 'q3', 'q4']
const CUSTOMER_CLAIMS = ['musterilerimiz', 'musterimiz', 'kullanicilarimiz', 'referans', 'bekleme listesinde', 'firma kullan', 'isletme kullan', 'basari hikaye']
const HYPE = ['her seyi', 'her sey', 'sihir', 'kendi kendine', 'insan mudahalesi olmadan', 'otomatik pilot', 'devrim', 'zahmetsiz', 'dusunmenize gerek']

// ------------------------------------------------------------------------------------------ içerik kümeleri

/** Ajan sayfasının tüm görünür metni (sohbet sahnesi hariç — sahne ayrı, rakama izinli küme). S22: konsol (örnek
 * görünüm, rakamsız), ajan döngüsü ve sınırlar da aynı taramadan geçer. */
const pageContent = {
  hero: assistantHero,
  console: agentConsole,
  loop: loopSection,
  guardrails: guardrailsSection,
  chat: chatSection,
  local: localSection,
  agents: agentsSection,
  trust: trustSection,
  faq: assistantFaq,
  cta: assistantCta,
}
const pageLeaves = visibleLeaves(pageContent, '$page')
const scenarioLeaves = visibleLeaves(assistantScenario, '$scenario')
const teaserLeaves = visibleLeaves(assistantTeaser, '$teaser')
const upcomingLeaves = [...pageLeaves, ...scenarioLeaves, ...teaserLeaves]

/** Planlanan (gelecek kipinde olması ZORUNLU) metinler. */
const plannedCards = [...chatSection.cards, ...localSection.cards, ...agentsSection.cards]
const futureTexts: Array<[string, string]> = [
  ['hero.lead', assistantHero.lead],
  ['chat.lead', chatSection.lead],
  ['local.lead', localSection.lead],
  ['agents.lead', agentsSection.lead],
  ['loop.lead', loopSection.lead],
  ['loop.principle', loopSection.principle],
  ['guardrails.lead', guardrailsSection.lead],
  ...loopSection.steps.map((st): [string, string] => [`loop-step:${st.id}`, st.text]),
  ...guardrailsSection.items.map((g): [string, string] => [`guardrail:${g.id}`, g.text]),
  ['teaser.lead', assistantTeaser.lead],
  ['cta.text', assistantCta.text],
  ...plannedCards.map((c): [string, string] => [`card:${c.id}`, c.text]),
  ...trustSection.planned.map((t): [string, string] => [`trust-planned:${t.id}`, t.text]),
  ...localSection.protocol.points.map((p, i): [string, string] => [`protocol.points[${i}]`, p]),
]

/** Ajan sayfasının görsel bileşenleri (S22: konsol + döngü eklendi). */
const ASSISTANT_COMPONENTS = [
  'components/assistant/ChatScene.astro',
  'components/assistant/StageBadge.astro',
  'components/assistant/AgentConsole.astro',
  'components/assistant/AgentLoop.astro',
]

// ------------------------------------------------------------------------------------------ testler

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
      .filter((f) => phraseRe(AGENT_BRAND).test(norm(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, ''))))
      .map((f) => path.relative(srcDir, f))
    expect(hits).toEqual([])
    // eski ad (S18 "Asistan") görünür kopyada kalmadı (yorum satırları hariç)
    const legacy = walk(srcDir, ['.astro', '.ts'])
      .filter((f) => /(pages|components|data)/.test(f) && !f.includes(`${path.sep}kb${path.sep}`))
      .filter((f) => /['">]\s*[^'"<]*\bAsistan\b/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|\*).*$/gm, '')))
      .map((f) => path.relative(srcDir, f))
    expect(legacy).toEqual([])
  })

  it('ana sayfa hero girişi istisna DEĞİL: yol haritası dili/MCP/rakam yok; aşama etiketi ve ad var', () => {
    const t = norm(Object.values(heroAgentEntry).join(' '))
    expect(ROADMAP_LANGUAGE.test(t)).toBe(false)
    expect(phraseRe('MCP').test(t)).toBe(false)
    expect(/\d/.test(t)).toBe(false)
    expect(heroAgentEntry.badge).toBe(STAGE_LABELS['early-access'])
    expect(heroAgentEntry.name).toBe(AGENT_NAME)
    expect(FUTURE_MARKER.test(norm(heroAgentEntry.value))).toBe(true)
    expect(DEFINITE_PRESENT.exec(norm(heroAgentEntry.value))?.[0] ?? null).toBeNull()
    expect(claimsSrc).toMatch(/heroAgent:\s*heroAgentEntry/)
  })

  it('ajan konsolu örnek görünüm olarak etiketli, canlı ürün olmadığını söyler; ajan döngüsünde tek insan adımı', () => {
    expect(agentConsole.label).toBe('Örnek görünüm')
    expect(norm(agentConsole.caption)).toMatch(/canli urun ekrani degildir/)
    expect(loopSection.steps.map((st) => st.id)).toEqual(['gozle', 'oner', 'onayla', 'uygula', 'raporla'])
    expect(loopSection.steps.filter((st) => st.actor === 'you').map((st) => st.id)).toEqual(['onayla'])
    expect(guardrailsSection.flow.filter((f) => f.actor === 'you')).toHaveLength(1)
  })

  it('sınır maddelerinin "temeli bugün kodda" atfı gerçek bir kanıtlı güven maddesine işaret eder', () => {
    const proven = new Set(trustSection.proven.map((t) => t.id))
    expect(guardrailsSection.items.map((g) => g.id)).toEqual(['onay-kapisi', 'salt-okuma', 'denetim-kaydi'])
    for (const g of guardrailsSection.items) expect(proven.has(g.foundation), g.id).toBe(true)
  })
})

describe('istisna kapsamı DAR ve sabit', () => {
  it('UPCOMING_SURFACES yalnızca ajan sayfası (AGENT_PATH) ve ana sayfa bandı', () => {
    expect(UPCOMING_SURFACES.pages).toEqual([AGENT_PATH])
    expect(UPCOMING_SURFACES.components).toEqual(['components/home/AssistantTeaser.astro'])
    expect(ASSISTANT_PATH).toBe(AGENT_PATH)
    for (const c of UPCOMING_SURFACES.components) expect(existsSync(path.join(srcDir, c)), c).toBe(true)
    expect(existsSync(path.join(srcDir, 'pages', '[ajan].astro'))).toBe(true)
  })

  it('claims.test.ts listeleri kaynaktan okunur (ayrıştırma boşalmaz) ve "MCP" orada YASAK kalır', () => {
    expect(STATIC_FORBIDDEN_NAMES.length).toBeGreaterThan(30)
    expect(STATIC_FORBIDDEN_NAMES).toContain('MCP')
    expect(STATIC_FORBIDDEN_NAMES).toContain('Electron')
    expect(ABSOLUTE_PREFIXES.length).toBeGreaterThan(20)
    expect(ABSOLUTE_PREFIXES).toContain('garanti')
    expect(UNPROVEN_INFRA.length).toBeGreaterThan(10)
    // claims.test.ts dist istisnası bu dosyadaki izinle aynı ve yalnızca asistan sayfası için
    expect(claimsSrc).toMatch(/UPCOMING_DIST_NAME_EXCEPTIONS[^=]*=\s*\{\s*\[`\$\{AGENT_PATH\.slice\(1\)\}\/index\.html`\]:\s*\['MCP'\]\s*,?\s*\}/)
  })

  it('assistant verisini yalnızca izinli kaynaklar içe aktarır; Özellikler ve llms* yalnızca istisna-dışı alanları kullanır', () => {
    const importers = walk(srcDir, ['.astro', '.ts', '.mjs'])
      .filter((f) => !f.includes(`${path.sep}data${path.sep}`))
      .filter((f) => /from\s+'[./]*(?:\.\.\/)*data\/assistant'/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(srcDir, f).split(path.sep).join('/'))
      .sort()
    expect(importers).toEqual(
      [
        'components/assistant/AgentConsole.astro', // S22
        'components/assistant/AgentLoop.astro', // S22
        'components/assistant/ChatScene.astro',
        'components/assistant/StageBadge.astro',
        'components/home/AssistantTeaser.astro',
        // S22: ana sayfa hero girişi — istisna DEĞİL; yalnızca güvenli alanlar (aşağıdaki SAFE denetimi)
        'components/home/Hero.astro',
        'pages/[ajan].astro',
        'pages/llms-full.txt.ts',
        // S19: llms.txt artık asistan verisini içe aktarmaz; satırı SEO kaydından (src/data/seo.ts → assistantLlms.short) gelir
        'pages/ozellikler.astro',
      ].sort(),
    )
    const SAFE = new Set(['ASSISTANT_PATH', 'ASSISTANT_NAME', 'featuresBridge', 'assistantLlms', 'heroAgentEntry'])
    for (const f of ['pages/ozellikler.astro', 'pages/llms-full.txt.ts', 'components/home/Hero.astro']) {
      const m = readFileSync(path.join(srcDir, f), 'utf8').match(/import\s*\{([^}]*)\}\s*from\s*'[^']*data\/assistant'/)!
      const names = m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
      for (const n of names) expect(SAFE.has(n), `${f}: ${n}`).toBe(true)
    }
  })

  it('gezinmede ajan bağlantısı (etiket = ad sabiti) "Yeni" rozetli; yalnızca bu öğe rozet taşır', () => {
    const item = primaryNav.find((i) => i.href === ASSISTANT_PATH)!
    expect(item.label).toBe(AGENT_BRAND)
    expect(item.published).toBe(true)
    expect(item.badge).toBe('Yeni')
    expect(primaryNav.filter((i) => i.badge).map((i) => i.href)).toEqual([ASSISTANT_PATH])
  })
})

describe('(1) aşama etiketi: her planlanan kart ve güven maddesi', () => {
  const stages = Object.keys(STAGE_LABELS) as AssistantStage[]

  it('etiket sözlüğü sabit: Geliştirme aşamasında / Erken erişim / Planlanan', () => {
    expect(STAGE_LABELS).toEqual({ development: 'Geliştirme aşamasında', 'early-access': 'Erken erişim', planned: 'Planlanan' })
  })

  it('her bölümde en az üç kart; her kartın geçerli bir aşaması var', () => {
    for (const s of [chatSection, localSection, agentsSection]) {
      expect(s.cards.length, s.eyebrow).toBeGreaterThanOrEqual(3)
      for (const c of s.cards) expect(stages, c.id).toContain(c.stage)
    }
    for (const t of trustSection.planned) expect(stages, t.id).toContain(t.stage)
    for (const g of guardrailsSection.items) expect(stages, g.id).toContain(g.stage)
    expect(new Set(plannedCards.map((c) => c.id)).size).toBe(plannedCards.length)
  })

  it('hero ve bant "Erken erişim" rozetini ve "geliştirme aşamasında / bugünkü sürümde yok" notunu taşır', () => {
    expect(assistantHero.badge).toBe(STAGE_LABELS['early-access'])
    expect(assistantTeaser.badge).toBe(STAGE_LABELS['early-access'])
    expect(norm(assistantHero.note)).toContain('gelistirme asamasinda')
    expect(norm(assistantHero.note)).toMatch(/bugunku surumunde yoktur/)
    expect(norm(assistantLlms.short)).toMatch(/^upcoming/)
    expect(norm(assistantLlms.full[0])).toMatch(/upcoming/)
  })
})

describe('(2) kip kuralı: planlanan metin gelecek/niyet kipinde, kesin kip yok', () => {
  it('kural kendini sınar', () => {
    expect(DEFINITE_PRESENT.test(norm('Asistan stokları yönetiyor.'))).toBe(true)
    expect(DEFINITE_PRESENT.test(norm('Ajanlar öneri hazırlıyorlar'))).toBe(true)
    expect(DEFINITE_PRESENT.test(norm('Bunu geliştiriyoruz'))).toBe(false)
    expect(DEFINITE_FORMAL.test(norm('Otomatik olarak düzeltmektedir'))).toBe(true)
    expect(phraseRe('yapar').test(norm('Asistan her işi yapar'))).toBe(true)
    expect(FUTURE_MARKER.test(norm('Sohbetle yönetebileceksiniz'))).toBe(true)
    expect(FUTURE_MARKER.test(norm('Sohbetle yönetirsiniz'))).toBe(false)
  })

  it.each(futureTexts)('%s', (_id, text) => {
    const t = norm(text)
    expect(DEFINITE_PRESENT.exec(t)?.[0] ?? null, text).toBeNull()
    expect(DEFINITE_FORMAL.exec(t)?.[0] ?? null, text).toBeNull()
    for (const v of DEFINITE_AORIST) expect(phraseRe(v).test(t), `${v}: ${text}`).toBe(false)
    expect(FUTURE_MARKER.test(t), text).toBe(true)
  })

  it('SSS yanıtları kesin kipte yetenek iddiası içermez', () => {
    for (const f of assistantFaq.items) {
      const t = norm(f.answer)
      expect(DEFINITE_PRESENT.exec(t)?.[0] ?? null, f.id).toBeNull()
      for (const v of DEFINITE_AORIST) expect(phraseRe(v).test(t), `${f.id}: ${v}`).toBe(false)
    }
  })
})

describe('(3) yasaklar: istisna yalnızca yol haritası dili (+ sayfada MCP); rakam/tarih/müşteri/abartı yok', () => {
  it('tarama kümesi dolu', () => {
    expect(pageLeaves.length).toBeGreaterThan(60)
    expect(scenarioLeaves.length).toBeGreaterThan(20)
    expect(teaserLeaves.length).toBeGreaterThan(5)
  })

  it('yasaklı ürün/kanal adları geçmez (MCP yalnızca /asistan sayfa içeriğinde)', () => {
    const hits: string[] = []
    for (const l of upcomingLeaves) {
      const t = norm(l.text)
      const onPage = l.path.startsWith('$page')
      for (const n of STATIC_FORBIDDEN_NAMES) {
        if (onPage && PAGE_ONLY_ALLOWED_NAMES.includes(n)) continue
        if (phraseRe(n).test(t)) hits.push(`${l.path}: "${n}"`)
      }
    }
    expect(hits).toEqual([])
    // MCP gerçekten yalnızca açık standart açıklamasında (localSection.protocol) geçer
    const mcp = pageLeaves.filter((l) => phraseRe('MCP').test(norm(l.text))).map((l) => l.path)
    expect(mcp.length).toBeGreaterThan(0)
    for (const p of mcp) expect(p, p).toMatch(/^\$page\.local\.protocol\./)
  })

  it('e-fatura/kargo API/"masaüstü uygulaması" kalıpları bu yüzeylerde de yasak', () => {
    const hits: string[] = []
    for (const l of upcomingLeaves) for (const [label, re] of STILL_FORBIDDEN_PATTERNS) if (re.test(norm(l.text))) hits.push(`${l.path}: ${label}`)
    expect(hits).toEqual([])
  })

  it('mutlak/garanti ve sertifika/SLA iddiaları bu yüzeylerde de yasak', () => {
    const hits: string[] = []
    for (const l of upcomingLeaves) {
      const t = norm(l.text)
      for (const p of [...ABSOLUTE_PREFIXES, ...UNPROVEN_INFRA]) if (prefixRe(p).test(t)) hits.push(`${l.path}: "${p}"`)
    }
    expect(hits).toEqual([])
  })

  it('rakam YALNIZCA örnek senaryo verisinde', () => {
    const hits = [...pageLeaves, ...teaserLeaves].filter((l) => /\d/.test(l.text)).map((l) => `${l.path}: ${l.text.slice(0, 80)}`)
    expect(hits).toEqual([])
    expect(scenarioLeaves.some((l) => /\d/.test(l.text))).toBe(true)
  })

  it('tarih/takvim, müşteri/referans ve abartı ifadeleri yok', () => {
    const hits: string[] = []
    for (const l of upcomingLeaves) {
      const t = norm(l.text)
      for (const w of DATE_WORDS) if (phraseRe(w).test(t)) hits.push(`${l.path}: tarih "${w}"`)
      for (const w of [...CUSTOMER_CLAIMS, ...HYPE]) if (prefixRe(w).test(t)) hits.push(`${l.path}: "${w}"`)
    }
    expect(hits).toEqual([])
  })

  it('örnek senaryo açıkça etiketli, canlı ürün olmadığını söyler ve onay kartıyla biter', () => {
    expect(assistantScenario.label).toBe('Örnek senaryo')
    expect(norm(assistantScenario.caption)).toMatch(/canli urun ekrani degildir/)
    expect(norm(assistantScenario.caption)).toMatch(/ornek/)
    expect(assistantScenario.rows.length).toBeGreaterThanOrEqual(2)
    expect(assistantScenario.changes.length).toBe(assistantScenario.rows.length)
    expect(norm(assistantScenario.approvalTitle)).toContain('onay')
    expect(assistantScenario.approve).toBeTruthy()
    expect(assistantScenario.cancel).toBeTruthy()
    expect(norm(assistantScenario.approvalNote)).toMatch(/onaylamadan/)
  })

  it('Özellikler köprüsü istisna DEĞİL: "yakında"/MCP/yol haritası dili içermez (claims.test publicContent\'inde de taranır)', () => {
    const t = norm(Object.values(featuresBridge).join(' '))
    expect(ROADMAP_LANGUAGE.test(t)).toBe(false)
    expect(phraseRe('MCP').test(t)).toBe(false)
    expect(claimsSrc).toMatch(/assistantBridge:\s*featuresBridge/)
  })

  it('llms* satırları da istisna DEĞİL: MCP adı ve yol haritası dili yok; kesin kip yok', () => {
    const t = norm([assistantLlms.short, ...assistantLlms.full].join(' '))
    expect(ROADMAP_LANGUAGE.test(t)).toBe(false)
    expect(phraseRe('MCP').test(t)).toBe(false)
    for (const line of [assistantLlms.short, ...assistantLlms.full.slice(1, 4)]) expect(DEFINITE_PRESENT.exec(norm(line))?.[0] ?? null, line).toBeNull()
  })
})

describe('(4) kanıtlı güven maddeleri: evidence yoluna bağlı; planlananlarla karışmaz', () => {
  it('en az beş kanıtlı madde; her birinin kanıtı var, dosya mevcut ve atıf metni dosyada geçiyor', () => {
    expect(trustSection.proven.length).toBeGreaterThanOrEqual(5)
    const bad: string[] = []
    for (const t of trustSection.proven) {
      if (t.evidence.length === 0) bad.push(`${t.id}: evidence yok`)
      for (const e of t.evidence) {
        const p = path.join(repoRoot, e.path)
        if (path.isAbsolute(e.path) || e.path.includes('..')) bad.push(`${t.id}: göreli değil ${e.path}`)
        else if (!existsSync(p)) bad.push(`${t.id}: dosya yok ${e.path}`)
        else if (!e.contains) bad.push(`${t.id}: contains zorunlu (${e.path})`)
        else if (!readFileSync(p, 'utf8').includes(e.contains)) bad.push(`${t.id}: "${e.contains}" yok (${e.path})`)
      }
    }
    expect(bad).toEqual([])
  })

  it('kanıtlı maddeler en az bir KOD dosyasına (backend/src) dayanır; yalnız ADR ile "kodda" denemez', () => {
    for (const t of trustSection.proven) {
      const code = t.evidence.filter((e) => e.path.startsWith('backend/src/') || e.path === 'CLAUDE.md')
      expect(code.length, t.id).toBeGreaterThan(0)
    }
  })

  it('planlanan güven maddelerinin gerekçesi (ADR) mevcut ve atıf metni geçiyor; kanıt değil gerekçe olarak tutulur', () => {
    for (const t of trustSection.planned) {
      expect(t.basis.length, t.id).toBeGreaterThan(0)
      for (const b of t.basis) {
        expect(b.path.startsWith('docs/adr/'), t.id).toBe(true)
        expect(readFileSync(path.join(repoRoot, b.path), 'utf8').includes(b.contains!), `${t.id}: ${b.contains}`).toBe(true)
      }
    }
    // kanıtlı ve planlanan kimlikler ayrık
    const proven = new Set(trustSection.proven.map((t) => t.id))
    for (const t of trustSection.planned) expect(proven.has(t.id), t.id).toBe(false)
  })

  it('CANLI: "bugün hiçbir yetenek ajanlara açık değil" yetenek kaydıyla doğrulanır', () => {
    const item = trustSection.proven.find((t) => t.id === 'ajan-kapali')!
    expect(norm(item.text)).toContain('bugun hicbir yetenek ajanlara acik degildir')
    const domainDir = path.join(repoRoot, 'backend', 'src', 'capabilities', 'domains')
    const files = readdirSync(domainDir).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThanOrEqual(10)
    for (const f of files) {
      const src = readFileSync(path.join(domainDir, f), 'utf8')
      expect(src, f).not.toMatch(/allowed:\s*true/)
    }
  })

  it('CANLI: sözleşme bekçisi ve yetenek kaydından türetilen yetki tablosu kodda', () => {
    expect(readFileSync(path.join(repoRoot, 'backend/src/api/operationPolicy.ts'), 'utf8')).toMatch(/derivePolicy\(CAPABILITIES\)/)
    expect(existsSync(path.join(repoRoot, 'backend/src/integration/compliance/ContractGuard.ts'))).toBe(true)
  })
})

describe('(5) erken erişim: form yok, mailto deseni', () => {
  it('CTA konusu "<ad> erken erişim"; sayfa, bant ve görsel kaynaklarında <form> yok', () => {
    expect(assistantCta.subject).toBe(`${AGENT_BRAND} erken erişim`)
    for (const f of ['pages/[ajan].astro', ...UPCOMING_SURFACES.components, ...ASSISTANT_COMPONENTS]) {
      expect(readFileSync(path.join(srcDir, f), 'utf8'), f).not.toMatch(/<form\b/)
    }
    expect(readFileSync(path.join(srcDir, 'pages', '[ajan].astro'), 'utf8')).toMatch(/<EmailActions[^>]*subject=\{assistantCta\.subject\}/)
  })

  it('satır içi style özniteliği yok (CSP style-src \'self\'; stagger sırası CSS nth-child ile)', () => {
    for (const f of ['pages/[ajan].astro', ...UPCOMING_SURFACES.components, ...ASSISTANT_COMPONENTS, 'components/home/Hero.astro']) {
      expect(readFileSync(path.join(srcDir, f), 'utf8'), f).not.toMatch(/\sstyle=/)
    }
  })
})

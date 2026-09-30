/**
 * "Yolda" (upcoming) yüzeylerinin koruma testi (S18 — Entegrasyonik Asistan).
 *
 * Sohbetle yönetim, yerel uygulama ve ajanlar ürünün bugünkü sürümünde YOK. claims.test.ts'in "yakında/yol haritası"
 * ve kanıtsız-iddia korumaları GEVŞETİLMEZ; bunun yerine DAR ve gerekçeli bir istisna tanımlanır:
 *   - İstisna yüzeyleri yalnızca `UPCOMING_SURFACES`: /asistan sayfası + ana sayfa bandı (AssistantTeaser.astro).
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

/** İstisna: yalnızca /asistan sayfasında ve yalnızca bu ad. */
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

/** /asistan sayfasının tüm görünür metni (sahne hariç — sahne ayrı, rakama izinli küme). */
const pageContent = {
  hero: assistantHero,
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
  ['agents.principle', agentsSection.principle],
  ['teaser.lead', assistantTeaser.lead],
  ['cta.text', assistantCta.text],
  ...plannedCards.map((c): [string, string] => [`card:${c.id}`, c.text]),
  ...trustSection.planned.map((t): [string, string] => [`trust-planned:${t.id}`, t.text]),
  ...localSection.protocol.points.map((p, i): [string, string] => [`protocol.points[${i}]`, p]),
]

// ------------------------------------------------------------------------------------------ testler

describe('istisna kapsamı DAR ve sabit', () => {
  it('UPCOMING_SURFACES yalnızca /asistan ve ana sayfa bandı', () => {
    expect(UPCOMING_SURFACES.pages).toEqual(['/asistan'])
    expect(UPCOMING_SURFACES.components).toEqual(['components/home/AssistantTeaser.astro'])
    expect(ASSISTANT_PATH).toBe('/asistan')
    for (const c of UPCOMING_SURFACES.components) expect(existsSync(path.join(srcDir, c)), c).toBe(true)
    expect(existsSync(path.join(srcDir, 'pages', 'asistan.astro'))).toBe(true)
  })

  it('claims.test.ts listeleri kaynaktan okunur (ayrıştırma boşalmaz) ve "MCP" orada YASAK kalır', () => {
    expect(STATIC_FORBIDDEN_NAMES.length).toBeGreaterThan(30)
    expect(STATIC_FORBIDDEN_NAMES).toContain('MCP')
    expect(STATIC_FORBIDDEN_NAMES).toContain('Electron')
    expect(ABSOLUTE_PREFIXES.length).toBeGreaterThan(20)
    expect(ABSOLUTE_PREFIXES).toContain('garanti')
    expect(UNPROVEN_INFRA.length).toBeGreaterThan(10)
    // claims.test.ts dist istisnası bu dosyadaki izinle aynı ve yalnızca asistan sayfası için
    expect(claimsSrc).toMatch(/UPCOMING_DIST_NAME_EXCEPTIONS[^=]*=\s*\{\s*'asistan\/index\.html':\s*\['MCP'\]\s*,?\s*\}/)
  })

  it('assistant verisini yalnızca izinli kaynaklar içe aktarır; Özellikler ve llms* yalnızca istisna-dışı alanları kullanır', () => {
    const importers = walk(srcDir, ['.astro', '.ts', '.mjs'])
      .filter((f) => !f.includes(`${path.sep}data${path.sep}`))
      .filter((f) => /from\s+'[./]*(?:\.\.\/)*data\/assistant'/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(srcDir, f).split(path.sep).join('/'))
      .sort()
    expect(importers).toEqual(
      [
        'components/assistant/ChatScene.astro',
        'components/assistant/StageBadge.astro',
        'components/home/AssistantTeaser.astro',
        'pages/asistan.astro',
        'pages/llms-full.txt.ts',
        'pages/llms.txt.ts',
        'pages/ozellikler.astro',
      ].sort(),
    )
    const SAFE = new Set(['ASSISTANT_PATH', 'ASSISTANT_NAME', 'featuresBridge', 'assistantLlms'])
    for (const f of ['pages/ozellikler.astro', 'pages/llms.txt.ts', 'pages/llms-full.txt.ts']) {
      const m = readFileSync(path.join(srcDir, f), 'utf8').match(/import\s*\{([^}]*)\}\s*from\s*'[^']*data\/assistant'/)!
      const names = m[1].split(',').map((x) => x.trim()).filter(Boolean)
      for (const n of names) expect(SAFE.has(n), `${f}: ${n}`).toBe(true)
    }
  })

  it('gezinmede Asistan bağlantısı "Yeni" rozetli; yalnızca bu öğe rozet taşır', () => {
    const item = primaryNav.find((i) => i.href === ASSISTANT_PATH)!
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
  it('CTA konusu "Asistan erken erişim"; sayfa ve bant kaynağında <form> yok', () => {
    expect(assistantCta.subject).toBe('Asistan erken erişim')
    for (const f of ['pages/asistan.astro', ...UPCOMING_SURFACES.components, 'components/assistant/ChatScene.astro']) {
      expect(readFileSync(path.join(srcDir, f), 'utf8'), f).not.toMatch(/<form\b/)
    }
    expect(readFileSync(path.join(srcDir, 'pages', 'asistan.astro'), 'utf8')).toMatch(/<EmailActions[^>]*subject=\{assistantCta\.subject\}/)
  })

  it('satır içi style özniteliği yok (CSP style-src \'self\'; stagger sırası CSS nth-child ile)', () => {
    for (const f of ['pages/asistan.astro', ...UPCOMING_SURFACES.components, 'components/assistant/ChatScene.astro', 'components/assistant/StageBadge.astro']) {
      expect(readFileSync(path.join(srcDir, f), 'utf8'), f).not.toMatch(/\sstyle=/)
    }
  })
})

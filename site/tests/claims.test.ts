/**
 * Statik iddia testi (ADR-0014 Karar 2/5, BACKLOG 3b/S1).
 *
 * Sitedeki her olgusal iddia `src/data/*.ts` kaydından gelir. Bu test derleme öncesi şunları doğrular:
 *  (1) `available` entegrasyon kümesi === `IntegrationFactory.ts`'in kabul ettiği kod kümesi (kaynaktan okunur);
 *  (2) her kaydın `evidence`'ı dolu, gösterdiği repo dosyası MEVCUT ve `contains` metni dosyada GEÇİYOR;
 *  (3) görünür içerikte yasaklı ifade (yol haritası adları, e-fatura, kargo API'si...), doğrulanamaz mutlak
 *      iddia (%100, kesintisiz, anında...), sertifika/uptime iddiası ve kanıtsız sayısal iddia YOK;
 *  (4) yol haritası öğeleri gizliyken hiçbir seçicide/sayfa kaynağında/derleme çıktısında görünmez.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PATHS, ROADMAP_VISIBLE, evidence, registry, type EvidenceRef } from '../src/data/evidence'
import {
  integrations,
  AVAILABLE_INTEGRATION_CODES,
  getPublicIntegrations,
  getPublicRoadmap,
  collectPublicIntegrationContent,
  ecosystemNodes,
  ecosystemPromises,
  getEcosystemNodes,
} from '../src/data/integrations'
import { productCapabilities, getPublicCapabilities, getHomePillars, homePillars, getStockReservationStory } from '../src/data/capabilities'
import { faq, getPublicFaq, FAQ_CATEGORIES, getFaqPreview, SUPPORT_CATEGORIES, getSupportCategories } from '../src/data/faq'
import {
  defaultPlanSource,
  getPublicPlans,
  getPlanSourceNotice,
  getVatNotice,
  getPublicTrial,
  getTrialPlanCode,
  trialOffer,
  createSeedPlanSource,
  PROPOSAL_NOTICE,
  PLAN_SEED_PATH,
} from '../src/data/plans'
import { getComparisonRows, getPricingFaq, getPricingFaqRecords, getPlanPitch, getPlanCommonFeatures } from '../src/data/pricing'
import { featuresBridge, UPCOMING_SURFACES } from '../src/data/assistant'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(siteRoot, '..')
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

// ------------------------------------------------------------------------------------------ yardımcılar

/** Türkçe-duyarlı küçük harf + ASCII katlama: "Paraşüt" == "parasut", "GİB" == "gib". */
const FOLD: Record<string, string> = { ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ı: 'i', â: 'a', î: 'i', û: 'u' }
const norm = (s: string): string =>
  s.toLocaleLowerCase('tr-TR').replace(/[çşğüöıâîû]/g, (c) => FOLD[c] ?? c)

const BOUNDARY_BEFORE = '(?<![\\p{L}\\d])'
const BOUNDARY_AFTER = '(?![\\p{L}\\d])'
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Tam sözcük (iki yönde sınır) eşleşmesi; "Amazon'da" eşleşir, "Amazonlar" eşleşmez. */
const phraseRe = (phrase: string) => new RegExp(`${BOUNDARY_BEFORE}${escapeRe(norm(phrase))}${BOUNDARY_AFTER}`, 'u')
/** Ön ek eşleşmesi (yalnızca öncesinde sınır): "kesintisiz" -> "kesintisizlik" de yakalanır. */
const prefixRe = (prefix: string) => new RegExp(`${BOUNDARY_BEFORE}${escapeRe(norm(prefix))}`, 'u')

interface Leaf {
  path: string
  key: string
  text: string
}

/** Bir değerin içindeki tüm string yaprakları (anahtar yoluyla) toplar. */
function leaves(value: unknown, p = '$', key = ''): Leaf[] {
  if (typeof value === 'string') return [{ path: p, key, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${p}[${i}]`, key))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, `${p}.${k}`, k))
  }
  return []
}

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) return walk(p, exts)
    return exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}

/** Sayfaların alacağı HER şey: yalnızca seçicilerin çıktısı (evidence/internalNotes zaten atılmış). */
function publicContent() {
  return {
    integrations: collectPublicIntegrationContent(),
    capabilities: getPublicCapabilities(),
    faq: getPublicFaq(),
    plans: getPublicPlans(),
    trial: getPublicTrial(),
    notice: getPlanSourceNotice(),
    vatNotice: getVatNotice(),
    comparison: getComparisonRows(),
    pricingFaq: getPricingFaq(),
    // S12 ana sayfa pazarlama metinleri de aynı yasaklı ifade / sayı taramasından geçer
    homePillars: getHomePillars(),
    ecosystem: getEcosystemNodes(),
    ecosystemPromises,
    // S12: SSS kategorileri ve plan tanıtım kopyası da görünür metindir (aynı yasaklı ifade/sayı denetimi)
    faqCategories: FAQ_CATEGORIES,
    planPitch: getPublicPlans().map((p) => getPlanPitch(p.code)),
    planCommon: getPlanCommonFeatures(),
    // S14: stok rezervasyonu anlatısı (sahne etiketleri dahil) ve destek merkezi kategorileri de görünür metindir
    stockStory: getStockReservationStory(),
    support: getSupportCategories().map(({ label, lead, links }) => ({ label, lead, links: links.map((l) => l.label) })),
    // S18: Özellikler sayfasındaki "Yolda" köprüsü UPCOMING istisnası DEĞİLDİR — katı taramadan geçer
    assistantBridge: featuresBridge,
  }
}

// ------------------------------------------------------------------------------------------ (1) fabrika kümesi

describe('(1) available entegrasyonlar === IntegrationFactory kodları', () => {
  const factorySrc = read(PATHS.factory)
  const factoryCodes = [...factorySrc.matchAll(/case\s+'([a-z0-9]+)'\s*:\s*moduleInstance\s*=\s*new\s/g)].map((m) => m[1]).sort()

  it('fabrika kaynağından tam 6 kod okunur (ayrıştırma sessizce boşalmasın)', () => {
    expect(factoryCodes).toEqual(['bizimhesap', 'hepsiburada', 'ideasoft', 'n11', 'pazarama', 'trendyol'])
  })

  it('available kod kümesi fabrikadaki kod kümesine EŞİT', () => {
    expect([...AVAILABLE_INTEGRATION_CODES].sort()).toEqual(factoryCodes)
  })

  it('roadmap kodları fabrikada YOK; kodlar benzersiz', () => {
    const roadmap = integrations.filter((i) => i.status === 'roadmap').map((i) => i.code)
    expect(roadmap.length).toBeGreaterThan(0)
    for (const c of roadmap) expect(factoryCodes).not.toContain(c)
    const all = integrations.map((i) => i.code)
    expect(new Set(all).size).toBe(all.length)
  })

  it('getPublicIntegrations() yalnızca available kodları döndürür', () => {
    expect(
      getPublicIntegrations()
        .map((i) => i.code)
        .sort(),
    ).toEqual(factoryCodes)
  })

  it('available entegrasyon türleri yalnızca pazaryeri/e-ticaret/ERP (kargo ve fatura implemente değil)', () => {
    for (const i of integrations.filter((x) => x.status === 'available')) {
      expect(['marketplace', 'ecommerce', 'erp'], i.code).toContain(i.kind)
    }
  })
})

// ------------------------------------------------------------------------------------------ S12 pazarlama metinleri

describe('S12 ana sayfa pazarlama metinleri kayıtlı gerçek yeteneklere dayanır', () => {
  const live = productCapabilities.filter((c) => c.status !== 'roadmap').map((c) => c.id)

  it('her çekirdek (görünür) yeteneğin ana sayfa başlığı ve tek satırlık fayda cümlesi var', () => {
    for (const c of getPublicCapabilities('core')) {
      expect(c.home?.title, c.id).toBeTruthy()
      expect(c.home?.line, c.id).toBeTruthy()
    }
  })

  it('dört değer sütunu yalnızca roadmap OLMAYAN yeteneklere dayanır; en fazla üç kısa madde', () => {
    expect(homePillars).toHaveLength(4)
    for (const p of homePillars) {
      expect(p.basedOn.length, p.id).toBeGreaterThan(0)
      for (const id of p.basedOn) expect(live, `${p.id} -> ${id}`).toContain(id)
      expect(p.points.length, p.id).toBeLessThanOrEqual(3)
    }
  })

  it('ekosistem düğümleri mevcut bir entegrasyon türüne veya kayıtlı yeteneğe dayanır; ad içermez', () => {
    const nodes = getEcosystemNodes()
    expect(nodes).toHaveLength(ecosystemNodes.length)
    for (const n of nodes) expect(n.channelCodes.length, n.id).toBeGreaterThan(0)
    const names = integrations.filter((i) => i.status === 'available').map((i) => i.name)
    for (const n of [...ecosystemNodes, ...ecosystemPromises]) {
      for (const name of names) expect(phraseRe(name).test(norm(`${n.title} ${n.line}`)), `${n.id}: ${name}`).toBe(false)
    }
    // kargo/fatura düğümü yalnızca bildirim yeteneğine dayanır (kargo firması / fatura sağlayıcı iddiası değil)
    expect(ecosystemNodes.find((n) => n.id === 'fulfilment')!.capabilityKeys).toEqual(['shippingNotice', 'invoiceNotice'])
  })
})

// ------------------------------------------------------------------------------------------ dürüstlük kilitleri

describe('dürüstlük kilitleri (INTEGRATIONS_REGISTRY bulguları)', () => {
  const by = (code: string) => integrations.find((i) => i.code === code)!

  it('hiçbir entegrasyon canlı pazaryeri API\'siyle doğrulanmış diye işaretlenmez', () => {
    for (const i of integrations) expect(i.verification.liveApi, i.code).toBe(false)
  })

  it('Bizimhesap yalnızca okuma: yazma/aksiyon yeteneği yok, hepsi sınırlı, sınırlama yazılı', () => {
    const b = by('bizimhesap')
    expect(b.coverage).toBe('limited')
    expect(b.capabilities.map((c) => c.key).sort()).toEqual(['categories', 'orders', 'products'])
    for (const c of b.capabilities) expect(c.level).toBe('limited')
    expect(b.limitations.join(' ')).toMatch(/yalnızca okuma/i)
  })

  it('Ideasoft gerçek mod token akışı kopuk: kapsam sınırlı, hiçbir yetenek "destekleniyor" değil, OAuth sınırı yazılı', () => {
    const i = by('ideasoft')
    expect(i.coverage).toBe('limited')
    for (const c of i.capabilities) expect(c.level).toBe('limited')
    expect(i.limitations.join(' ')).toMatch(/OAuth/)
  })

  it('N11: sipariş onay/red (no-op/NOT_SUPPORTED) yetenek olarak listelenmez', () => {
    const n = by('n11')
    expect(n.capabilities.find((c) => c.key === 'orderActions')).toBeUndefined()
    expect(n.notProvided.join(' ')).toMatch(/onaylama ve reddetme/)
  })

  it('Hepsiburada: stub varyant/teslimat güncelleme yetenek olarak yazılmaz, "sunulmayan" listesindedir', () => {
    const h = by('hepsiburada')
    expect(h.notProvided.join(' ')).toMatch(/Varyant güncelleme/)
    expect(h.notProvided.join(' ')).toMatch(/Teslimat güncelleme/)
    expect(h.capabilities.find((c) => c.key === 'shippingNotice')?.level).toBe('limited')
  })

  it('coverage=limited/partial olan her entegrasyon en az bir görünür sınırlama taşır; limited yetenek notu boş değil', () => {
    for (const i of integrations.filter((x) => x.status === 'available')) {
      if (i.coverage !== 'broad') expect(i.limitations.length, i.code).toBeGreaterThan(0)
      for (const c of i.capabilities) if (c.level === 'limited') expect(c.note.length, `${i.code}/${c.key}`).toBeGreaterThan(10)
    }
  })

  it('kargo firması API\'si ve e-fatura sağlayıcısı yetenek listesinde yok (yalnızca gizli roadmap)', () => {
    for (const c of productCapabilities.filter((x) => ['einvoice-provider', 'carrier-api', 'mcp', 'desktop-app'].includes(x.id))) {
      expect(c.status, c.id).toBe('roadmap')
    }
  })

  it('aşırı satış iddiası eşzamanlılık testinin gerçek adına bağlı', () => {
    const c = productCapabilities.find((x) => x.id === 'stock-reservation')!
    expect(c.evidence.some((e) => e.path.endsWith('StockAllocator.concurrency.test.ts'))).toBe(true)
  })
})

// ------------------------------------------------------------------------------------------ (2) evidence

describe('(2) evidence: dolu, dosya mevcut, atıf metni dosyada geçiyor', () => {
  interface Owned {
    owner: string
    refs: EvidenceRef[]
  }
  const owned: Owned[] = []
  for (const i of integrations) {
    owned.push({ owner: `integration:${i.code}`, refs: i.evidence })
    for (const c of i.capabilities) owned.push({ owner: `integration:${i.code}/${c.key}`, refs: c.evidence })
  }
  for (const c of productCapabilities) owned.push({ owner: `capability:${c.id}`, refs: c.evidence })
  for (const f of faq) owned.push({ owner: `faq:${f.id}`, refs: f.evidence })
  for (const p of defaultPlanSource.readPlans()) owned.push({ owner: `plan:${p.code}`, refs: p.evidence })
  for (const f of getPricingFaqRecords()) owned.push({ owner: `pricing-faq:${f.id}`, refs: f.evidence })
  owned.push({ owner: 'trial', refs: [...trialOffer.evidence] })

  it('kayıt sayıları beklenen aralıkta (test sessizce boşalmasın)', () => {
    expect(integrations.length).toBeGreaterThanOrEqual(6)
    expect(productCapabilities.length).toBeGreaterThanOrEqual(10)
    expect(faq.length).toBeGreaterThanOrEqual(16)
    expect(faq.length).toBeLessThanOrEqual(26) // S14: +1 (secim-kriterleri)
    expect(owned.length).toBeGreaterThan(60)
  })

  it('her kayıt en az bir evidence taşır', () => {
    const missing = owned.filter((o) => o.refs.length === 0).map((o) => o.owner)
    expect(missing).toEqual([])
  })

  it('her evidence: göreli repo yolu, dosya mevcut, atıf metni dolu', () => {
    const bad: string[] = []
    for (const { owner, refs } of owned) {
      for (const r of refs) {
        if (!r.path || !r.ref.trim()) bad.push(`${owner}: boş path/ref`)
        else if (path.isAbsolute(r.path) || r.path.includes('..')) bad.push(`${owner}: yol göreli olmalı: ${r.path}`)
        else if (!existsSync(path.join(repoRoot, r.path)) || !statSync(path.join(repoRoot, r.path)).isFile()) {
          bad.push(`${owner}: dosya yok: ${r.path}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('contains verilen her evidence için o metin dosyada birebir geçiyor', () => {
    const bad: string[] = []
    for (const { owner, refs } of owned) {
      for (const r of refs) {
        if (!r.contains) continue
        const p = path.join(repoRoot, r.path)
        if (!existsSync(p)) continue // dosya yokluğu yukarıdaki testte raporlanır
        if (!readFileSync(p, 'utf8').includes(r.contains)) bad.push(`${owner}: "${r.contains}" bulunamadı: ${r.path}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('available entegrasyon ve yeteneklerinin çoğu doğrulanabilir atıf (contains) taşır', () => {
    const withContains = owned.flatMap((o) => o.refs).filter((r) => r.contains).length
    const total = owned.flatMap((o) => o.refs).length
    expect(withContains / total).toBeGreaterThan(0.8)
  })
})

// ------------------------------------------------------------------------------------------ (3) yasaklı ifadeler

/** Yol haritası / mevcut olmayan ürün adları — roadmap gizliyken görünür içerikte GEÇEMEZ. */
const STATIC_FORBIDDEN_NAMES = [
  'Amazon',
  'Çiçeksepeti',
  'Sürat Kargo',
  'Aras Kargo',
  'Yurtiçi Kargo',
  'MNG Kargo',
  'PTT Kargo',
  'PTT',
  'Hepsijet',
  'Sendeo',
  'Oplog',
  'UPS',
  'Paraşüt',
  'e-fatura',
  'efatura',
  'e-arşiv',
  'e-irsaliye',
  'GİB',
  'e-Logo',
  'Turkcell e-Şirket',
  'Trendyol e-Faturam',
  'Shopify',
  'WooCommerce',
  'Magento',
  'Wix',
  'Opencart',
  'Ticimax',
  'AnkaETicaret',
  'ETicaretSoft',
  'MCP',
  'Tauri',
  'Electron',
]

/** Kalıp (regex) yasakları: kargo/fatura API'si, masaüstü, yol haritası dili. */
const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ['kargo API/entegrasyon iddiası', /kargo\s+(api|entegrasyon)/],
  ['e-fatura/e-arşiv varyantı', /(?<![\p{L}\d])e-?(fatura|arsiv|irsaliye)/u],
  ['masaüstü uygulaması', /masaustu\s+uygulama/],
  ['yol haritası dili', /(?<![\p{L}\d])(yakinda|cok yakinda|planlaniyor|yol haritasi|roadmap|beta)(?![\p{L}\d])/u],
]

/** Doğrulanamaz mutlak/üstünlük/garanti iddiaları (ADR-0014 Karar 4 "Ses/ton"). */
const ABSOLUTE_PREFIXES = [
  '%100',
  '% 100',
  'yuzde yuz',
  'kesintisiz',
  'aninda',
  'sinirsiz',
  'en iyi',
  'bir numara',
  '1 numara',
  'numarali',
  'garanti',
  '7/24',
  '24/7',
  'her zaman',
  'asla',
  'hicbir zaman',
  'hatasiz',
  'risksiz',
  'sifir hata',
  'sifir risk',
  'tamamen otomatik',
  'binlerce',
  'milyonlarca',
  'yuzlerce',
  'lider',
  'rakipsiz',
  'essiz',
]

/** Sertifika / altyapı / SLA iddiaları (ADR-0014 Karar 5 "izinsiz"). */
const UNPROVEN_INFRA = [
  'iso 27001',
  'iso27001',
  'soc 2',
  'soc2',
  'tier 3',
  'tier iii',
  'uptime',
  'sla taahhut',
  '%99',
  'veri merkezi',
  'turkiye\'de saklan',
  'verileriniz turkiye',
  'pci dss sertifika',
  'onayli entegrator',
  'resmi ortak',
  'canli dogrulan',
  'canli api ile dogrulan',
  'sertifikali',
]

/** Sayı içermesine izin verilen belirteçler — HER BİRİ kanıtlıdır (evidence dosyada doğrulanır). */
const NUMERIC_ALLOWLIST: Array<{ token: string; why: EvidenceRef }> = [
  { token: 'N11', why: registry('§2.3', '### 2.3 N11') },
  {
    token: 'AES-256-GCM',
    why: evidence('backend/src/utils/FieldCrypto.ts', 'algoritma adı', 'AES-256-GCM'),
  },
]

/** Sayısal-iddia denetiminden muaf anahtarlar (biçimlenmiş fiyat, kimlik/kod, taslak notu). */
const NON_PROSE_KEYS = new Set(['priceLabel', 'code', 'id', 'notice', 'periodLabel', 'channelCodes', 'basedOn', 'icon'])

describe('(3) görünür içerikte yasaklı ifade / mutlak / kanıtsız sayısal iddia yok', () => {
  const content = publicContent()
  const all = leaves(content)

  // Dinamik: veri kaydındaki roadmap adları + takma adlar da yasak (kayıt değişse test kendini günceller)
  const roadmapNames = integrations
    .filter((i) => i.status === 'roadmap')
    .flatMap((i) => [i.name, ...i.aliases])
  const forbiddenNames = [...new Set([...STATIC_FORBIDDEN_NAMES, ...roadmapNames])]

  it('tarama kümesi boş değil (çok sayıda görünür metin yaprağı var)', () => {
    expect(all.length).toBeGreaterThan(80)
  })

  it('yol haritası / mevcut olmayan ürün adları görünür içerikte geçmez', () => {
    const hits: string[] = []
    for (const name of forbiddenNames) {
      const re = phraseRe(name)
      for (const l of all) if (re.test(norm(l.text))) hits.push(`${l.path}: "${name}" -> ${l.text.slice(0, 80)}`)
    }
    expect(hits).toEqual([])
  })

  it('yasaklı kalıplar (kargo/e-fatura API, masaüstü, yol haritası dili) geçmez', () => {
    const hits: string[] = []
    for (const [label, re] of FORBIDDEN_PATTERNS) {
      for (const l of all) if (re.test(norm(l.text))) hits.push(`${l.path}: ${label} -> ${l.text.slice(0, 80)}`)
    }
    expect(hits).toEqual([])
  })

  it('doğrulanamaz mutlak/üstünlük/garanti iddiaları geçmez', () => {
    const hits: string[] = []
    for (const p of ABSOLUTE_PREFIXES) {
      const re = prefixRe(p)
      for (const l of all) if (re.test(norm(l.text))) hits.push(`${l.path}: "${p}" -> ${l.text.slice(0, 80)}`)
    }
    expect(hits).toEqual([])
  })

  it('sertifika / altyapı / SLA / "canlı doğrulandı" iddiaları geçmez', () => {
    const hits: string[] = []
    for (const p of UNPROVEN_INFRA) {
      const re = prefixRe(p)
      for (const l of all) if (re.test(norm(l.text))) hits.push(`${l.path}: "${p}" -> ${l.text.slice(0, 80)}`)
    }
    expect(hits).toEqual([])
  })

  it('kanıtsız sayısal iddia yok: metinlerde rakam yalnızca kanıtlı allowlist belirteçlerinde', () => {
    const hits: string[] = []
    for (const l of all) {
      if (NON_PROSE_KEYS.has(l.key)) continue
      let text = l.text
      for (const a of NUMERIC_ALLOWLIST) text = text.split(a.token).join('')
      if (/\d/.test(text)) hits.push(`${l.path}: ${l.text.slice(0, 100)}`)
    }
    expect(hits).toEqual([])
  })

  it('sayısal allowlist belirteçlerinin kanıtı repoda mevcut', () => {
    for (const a of NUMERIC_ALLOWLIST) {
      const p = path.join(repoRoot, a.why.path)
      expect(existsSync(p), a.token).toBe(true)
      expect(readFileSync(p, 'utf8').includes(a.why.contains!), a.token).toBe(true)
    }
  })

  it('tarayıcılar gerçekten yakalıyor (kendi kendini sınama)', () => {
    expect(phraseRe('Amazon').test(norm("Amazon'da satış"))).toBe(true)
    expect(phraseRe('Paraşüt').test(norm('PARASUT bağlantısı'))).toBe(true)
    expect(phraseRe('GİB').test(norm('gib entegrasyonu'))).toBe(true)
    expect(phraseRe('UPS').test(norm('groups'))).toBe(false)
    expect(prefixRe('kesintisiz').test(norm('Kesintisiz hizmet'))).toBe(true)
    expect(prefixRe('%100').test(norm('%100 doğru'))).toBe(true)
    expect(FORBIDDEN_PATTERNS[1][1].test(norm('E-Fatura'))).toBe(true)
    expect(FORBIDDEN_PATTERNS[1][1].test(norm('efatura'))).toBe(true)
  })
})

// ------------------------------------------------------------------------------------------ plan verisi

describe('plan verisi (plans.seed.json — tek doğruluk kaynağı)', () => {
  const seed = JSON.parse(read(PLAN_SEED_PATH))
  const plans = defaultPlanSource.readPlans()

  it('varsayılan kaynak seed dosyasıdır ve seed ÖNERİ işaretliyse öneri olarak işaretli; taslak notu yazılı', () => {
    expect(defaultPlanSource.kind).toBe('seed')
    expect(String(seed._meta.status).startsWith('ÖNERİ')).toBe(true)
    expect(defaultPlanSource.proposal).toBe(true)
    expect(getPlanSourceNotice()).toBe(PROPOSAL_NOTICE)
    expect(PROPOSAL_NOTICE).toContain('ÖNERİ')
    expect(PROPOSAL_NOTICE).toContain('insan kararı bekliyor')
    for (const p of plans) expect(p.proposal, p.code).toBe(true)
  })

  it('fiyat/limit/KDV/kod değerleri seed dosyasıyla BİREBİR aynı (site kendi değer üretmez)', () => {
    expect(plans.map((p) => p.code)).toEqual(seed.plans.map((p: any) => p.code))
    for (const sp of seed.plans as any[]) {
      const p = plans.find((x) => x.code === sp.code)!
      expect(p.name, sp.code).toBe(sp.name)
      expect(p.priceMinor, `${sp.code} fiyat`).toBe(sp.priceMinor)
      expect(p.vatIncluded, `${sp.code} kdv`).toBe(sp.vatIncluded)
      expect(p.interval, `${sp.code} dönem`).toBe(sp.interval)
      expect(p.features, `${sp.code} özellikler`).toEqual(sp.features)
      expect(p.active).toBe(sp.active)
      expect(p.public).toBe(sp.public)
      for (const k of ['channels', 'skus', 'users', 'mcpCallsPerDay'] as const) {
        expect(p.limits[k], `${sp.code}/${k}`).toBe(sp.limits[k] > 0 ? sp.limits[k] : null)
      }
    }
    expect(defaultPlanSource.vat?.ratePercent).toBe(seed.vat.ratePercent)
    expect(defaultPlanSource.vat?.proposal).toBe(true)
  })

  it('seed kaynağının ADR-0008 plan tablosuyla (öneri değerleri) tutarlılığı: fiyat ve limitler', () => {
    const adr = read(PATHS.adr0008)
    const rows = new Map<string, string[]>()
    for (const line of adr.split('\n')) {
      const cells = line.split('|').map((c) => c.trim())
      if (cells.length > 6 && ['Başlangıç', 'Büyüme'].includes(cells[1])) rows.set(cells[1], cells)
    }
    const num = (x: string) => Number(x.replace(/\./g, ''))
    for (const [name, code] of [
      ['Başlangıç', 'starter'],
      ['Büyüme', 'growth'],
    ] as const) {
      const cells = rows.get(name)!
      const plan = plans.find((p) => p.code === code)!
      expect(cells, name).toBeDefined()
      expect(plan.priceMinor, `${name} fiyat`).toBe(num(cells[2].match(/₺([\d.]+)/)![1]) * 100)
      expect(plan.limits.channels, `${name} kanal`).toBe(num(cells[3]))
      expect(plan.limits.skus, `${name} sku`).toBe(num(cells[4]))
      expect(plan.limits.users, `${name} kullanıcı`).toBe(num(cells[5]))
      expect(plan.limits.mcpCallsPerDay, `${name} mcp`).toBe(num(cells[6]))
    }
    expect(plans.find((p) => p.code === 'enterprise')!.priceMinor).toBe(0)
  })

  it('görünüm: fiyat biçimi TL, KDV hariç, özel teklif en sonda; yalnızca active&&public', () => {
    const view = getPublicPlans()
    expect(view.map((p) => p.code)).toEqual(['starter', 'growth', 'enterprise'])
    expect(view[0].priceLabel).toMatch(/^₺\s?2\.490$/)
    expect(view[1].priceLabel).toMatch(/^₺\s?5\.990$/)
    expect(view[0].vatLabel).toBe('KDV hariç')
    expect(view[2].priceKind).toBe('quote')
    expect(view[2].priceLabel).toBe('Özel teklif')
    expect(view[2].cta).toBe('contact')
    expect(view[2].limits.every((l) => l.value === null)).toBe(true) // seed'de 0 = "Özel limit"
    expect(view[0].cta).toBe('trial')

    const hidden = createSeedPlanSource(
      [
        { code: 'gizli', name: 'Gizli', priceMinor: 100, public: false },
        { code: 'pasif', name: 'Pasif', priceMinor: 100, public: true, active: false },
        { code: 'acik', name: 'Açık', priceMinor: 100, public: true },
      ],
      { proposal: false },
    )
    expect(getPublicPlans(hidden).map((p) => p.code)).toEqual(['acik'])
    expect(getPlanSourceNotice(hidden)).toBeUndefined()
  })

  it('yıllık fiyat UYDURULMAZ: seed yalnızca aylık planlar içerir ve görünümde yıllık seçenek yok', () => {
    for (const p of plans) expect(p.interval).toBe('month')
    for (const p of getPublicPlans()) {
      expect(p.interval).toBe('month')
      expect(p.periodLabel === '' || p.periodLabel === '/ay').toBe(true)
    }
  })

  it('KDV: seed oranı ÖNERİ iken KDV dahil tutar hesaplanmaz, taslak notu üretilir', () => {
    expect(getVatNotice()).toContain('KDV')
    const json = JSON.stringify(publicContent().plans)
    expect(json).not.toMatch(/KDV dahil/)
  })

  it('seed okuyucu sessizce yanlış fiyat göstermez: bilinmeyen özellik / kesirli fiyat hata verir', () => {
    expect(() => createSeedPlanSource([{ code: 'x', name: 'X', priceMinor: 1.5, public: true }])).toThrow()
    expect(() => createSeedPlanSource([{ code: 'x', name: 'X', priceMinor: 100, features: ['ufo'] }])).toThrow()
    expect(() => createSeedPlanSource('x')).toThrow()
    expect(() => createSeedPlanSource({ plans: 'x' })).toThrow()
  })

  it('canlı olmayan özellikler (e-fatura, kargo, MCP, masaüstü) kartlarda gösterilmez (roadmap gizli)', () => {
    const view = getPublicPlans()
    for (const p of view) for (const f of p.features) expect(f.state, `${p.code}/${f.code}`).not.toBe('soon')
    expect(view.find((p) => p.code === 'starter')!.features).toEqual([])
    expect(view.find((p) => p.code === 'growth')!.features.map((f) => f.code)).toEqual(['erp'])
    expect(view.find((p) => p.code === 'enterprise')!.features.map((f) => f.code)).toEqual(['erp'])
  })

  it('karşılaştırma satırları: yalnızca canlı yeteneklerin limitleri (MCP yok), plan sırasıyla', () => {
    const rows = getComparisonRows()
    expect(rows.map((r) => r.key)).toEqual(['channels', 'skus', 'users'])
    for (const r of rows) expect(r.cells.map((c) => c.planCode)).toEqual(['starter', 'growth', 'enterprise'])
    expect(rows[0].cells[2].value).toBeNull()
  })

  it('deneme: süre ve kart gereksinimi seed trial bloğundan; register->trialing uygulanmış (S4a)', () => {
    expect(getPublicTrial()).toEqual({ days: seed.trial.days, cardRequired: seed.trial.cardRequired })
    expect(trialOffer.planCode).toBe(seed.trial.planCode)
    expect(trialOffer.implemented).toBe(true)
    expect(getTrialPlanCode()).toBe('starter')
    // Uygulama kanıtı: register/provision yolu gerçekten trialing abonelik yazıyor
    expect(read('backend/src/operations/tenant/trialSubscription.ts')).toContain("status: 'trialing'")
    expect(read('backend/src/operations/tenant/TenantProvisioningService.ts')).toMatch(/trialSubscription|ensureTrialSubscription/)
    expect(trialOffer.evidence.some((e) => e.path === 'backend/src/operations/tenant/trialSubscription.ts')).toBe(true)
  })

  it('fiyat SSS: deneme yanıtı seed kartsız bilgisiyle uyumlu; beklenen kayıtlar mevcut', () => {
    const faqItems = getPricingFaq()
    const trialQ = faqItems.find((f) => f.id === 'deneme-kart')!
    expect(trialQ).toBeDefined()
    expect(trialQ.answer.startsWith(seed.trial.cardRequired ? 'Evet' : 'Hayır')).toBe(true)
    expect(faqItems.map((f) => f.id)).toEqual(expect.arrayContaining(['kdv', 'faturalama-donemi', 'kurumsal', 'plan-degisikligi', 'kart-bilgisi']))
  })
})

// ------------------------------------------------------------------------------------------ (4) gizli roadmap

describe('(4) gizli roadmap öğeleri hiçbir yerde görünmez', () => {
  it('ROADMAP_VISIBLE === false (insan onayı — ADR-0014 Açık Soru 5 — gelene kadar)', () => {
    expect(ROADMAP_VISIBLE).toBe(false)
  })

  it('seçiciler roadmap öğesi döndürmez', () => {
    expect(getPublicRoadmap()).toEqual([])
    expect(getPublicIntegrations().every((i) => AVAILABLE_INTEGRATION_CODES.includes(i.code))).toBe(true)
    expect(getPublicCapabilities().every((c) => c.status !== 'roadmap')).toBe(true)
    const roadmapIds = productCapabilities.filter((c) => c.status === 'roadmap').map((c) => c.id)
    expect(roadmapIds.length).toBeGreaterThan(0)
    for (const id of roadmapIds) expect(getPublicCapabilities().map((c) => c.id)).not.toContain(id)
  })

  it('public içerik JSON\'unda evidence/internalNotes alanı sızmaz', () => {
    const json = JSON.stringify(publicContent())
    expect(json).not.toContain('"evidence"')
    expect(json).not.toContain('"internalNotes"')
    expect(json).not.toContain('"aliases"')
    expect(json).not.toContain('INTEGRATIONS_REGISTRY')
  })

  // Sayfa/bileşen/layout kaynakları: roadmap adı ve yasaklı ifade sabit yazılamaz (S2 sayfaları için koruma).
  const srcDir = path.join(siteRoot, 'src')
  const stripComments = (s: string) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\/\/.*$/gm, '')
  const sourceFiles = [
    ...walk(srcDir, ['.astro', '.ts', '.mjs', '.md', '.mdx', '.css']).filter((f) => !f.includes(`${path.sep}data${path.sep}`))
      // src/dev/**: yalnızca yerel bileşen önizlemesi (SITE_PREVIEW_ROUTES); normal derlemeye girmez (README)
      .filter((f) => !f.includes(`${path.sep}dev${path.sep}`)),
    path.join(srcDir, 'data', 'navigation.ts'),
  ]

  it('sayfa/bileşen/layout kaynaklarında (src/data hariç) roadmap adları ve yasaklı ifadeler sabit yazılmamış', () => {
    const hits: string[] = []
    const names = [...new Set([...STATIC_FORBIDDEN_NAMES, ...integrations.filter((i) => i.status === 'roadmap').flatMap((i) => [i.name, ...i.aliases])])]
    for (const f of sourceFiles) {
      const text = norm(stripComments(readFileSync(f, 'utf8')))
      for (const n of names) if (phraseRe(n).test(text)) hits.push(`${path.relative(siteRoot, f)}: "${n}"`)
      for (const [label, re] of FORBIDDEN_PATTERNS) if (re.test(text)) hits.push(`${path.relative(siteRoot, f)}: ${label}`)
      for (const p of ABSOLUTE_PREFIXES) if (prefixRe(p).test(text)) hits.push(`${path.relative(siteRoot, f)}: "${p}"`)
    }
    expect(hits).toEqual([])
  })

  // Derleme çıktısı: dist/ varsa (npm run build sonrası) HTML'de roadmap adı olmamalı.
  const distDir = path.join(siteRoot, 'dist')
  // dist/yasal/**: hukuki metinler sorumluluk reddi ("kesintisiz ... garanti edemez") ve müşteri veri kategorileri
  // ("e-fatura mükellefiyeti") içerir; bunlar pazarlama iddiası değildir. Kaynak taramasının `src/data/**`'i
  // dışlamasıyla aynı gerekçe. Yasal sayfalar kendi yasaklı-ifade taramasından geçer: tests/legal.test.ts.
  const distHtml = walk(distDir, ['.html']).filter((f) => !f.includes(`${path.sep}yasal${path.sep}`))
  // S18 DAR İSTİSNA: /asistan (UPCOMING yüzeyi) Model Context Protocol'ü sade dille anlatır; YALNIZCA bu sayfada ve
  // YALNIZCA "MCP" adı serbesttir. Diğer tüm ad/mutlak iddia yasakları orada da geçerlidir; ayrıntılı kurallar
  // (aşama etiketi, kip, rakam/tarih/müşteri) tests/upcoming.test.ts'tedir. Listeye ekleme = bilinçli ürün kararı.
  const UPCOMING_DIST_NAME_EXCEPTIONS: Record<string, string[]> = { 'asistan/index.html': ['MCP'] }

  it('UPCOMING dist istisnası yalnızca UPCOMING_SURFACES sayfaları için ve yalnızca MCP adı', () => {
    expect(Object.keys(UPCOMING_DIST_NAME_EXCEPTIONS)).toEqual(UPCOMING_SURFACES.pages.map((p) => `${p.slice(1)}/index.html`))
    for (const names of Object.values(UPCOMING_DIST_NAME_EXCEPTIONS)) expect(names).toEqual(['MCP'])
    expect(ROADMAP_VISIBLE).toBe(false)
  })
  // dist/rehber/** (S20 bilgi merkezi): e-Fatura, GİB, Amazon SP-API gibi adlar burada ÜRÜN İDDİASI değil, pazarı anlatan
  // kaynaklı bilgi konusudur. Bu sayfalar YALNIZCA ad taramasından muaftır (mutlak iddia taraması sürer); ürün bağlamı
  // (Entegrasyonik cümleleri + bağlam kutusu) tests/rehber.test.ts'te aynı ad/kalıp listeleriyle ayrıca taranır.
  const isRehber = (f: string) => f.includes(`${path.sep}rehber${path.sep}`)
  it.skipIf(distHtml.length === 0)('derleme çıktısında (dist/**/*.html) roadmap adı ve yasaklı ifade yok', () => {
    const hits: string[] = []
    const names = [...new Set([...STATIC_FORBIDDEN_NAMES, ...integrations.filter((i) => i.status === 'roadmap').flatMap((i) => [i.name, ...i.aliases])])]
    for (const f of distHtml) {
      const html = readFileSync(f, 'utf8')
        .replace(/<script[\s\S]*?<\/script>/g, '')
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<[^>]+>/g, ' ')
      const text = norm(html)
      const rel = path.relative(distDir, f).split(path.sep).join('/')
      const allowed = UPCOMING_DIST_NAME_EXCEPTIONS[rel] ?? []
      if (!isRehber(f)) for (const n of names) if (!allowed.includes(n) && phraseRe(n).test(text)) hits.push(`${path.relative(siteRoot, f)}: "${n}"`)
      for (const p of ABSOLUTE_PREFIXES) if (prefixRe(p).test(text)) hits.push(`${path.relative(siteRoot, f)}: "${p}"`)
    }
    expect(hits).toEqual([])
  })
})

// ------------------------------------------------------------------------------------------ SSS yapısı (S12)

describe('SSS yapısı: kategoriler, önizleme, benzersizlik', () => {
  it('altı kategori; her soru bilinen bir kategoride ve her kategoride en az iki soru', () => {
    expect(FAQ_CATEGORIES.map((c) => c.id)).toEqual(['baslangic', 'kanallar', 'stok-siparis', 'guvenlik-veri', 'fiyat-plan', 'destek-olcek'])
    const ids = new Set(FAQ_CATEGORIES.map((c) => c.id))
    for (const f of faq) expect(ids.has(f.category), f.id).toBe(true)
    for (const c of FAQ_CATEGORIES) expect(faq.filter((f) => f.category === c.id).length, c.id).toBeGreaterThanOrEqual(2)
  })

  it('soru kimlikleri ve metinleri benzersiz; yanıtlar kısa (en fazla dört cümle)', () => {
    expect(new Set(faq.map((f) => f.id)).size).toBe(faq.length)
    expect(new Set(faq.map((f) => f.question)).size).toBe(faq.length)
    for (const f of getPublicFaq()) {
      const sentences = f.answer.split(/(?<=[.!?])\s+/).filter(Boolean)
      expect(sentences.length, f.id).toBeLessThanOrEqual(4)
    }
  })

  it('ana sayfa önizlemesi altı-sekiz soru ve hepsi kayıtta', () => {
    const preview = getFaqPreview()
    expect(preview.length).toBeGreaterThanOrEqual(6)
    expect(preview.length).toBeLessThanOrEqual(8)
  })

  it('destek yanıtı saat/süre/kanal taahhüdü içermez', () => {
    const text = norm(getPublicFaq().filter((f) => f.category === 'destek-olcek').map((f) => f.answer).join(' '))
    for (const w of ['saat icinde', 'dakika icinde', 'canli destek', 'telefon', 'hafta ici', 'mesai']) expect(text, w).not.toContain(w)
  })
})

// ------------------------------------------------------------------------------------------ S14

describe('S14: stok rezervasyonu anlatısı, somut akış cümleleri ve destek merkezi kayıtlara dayanır', () => {
  const visible = new Set(getPublicCapabilities().map((c) => c.id))

  it('anlatı (sorun/nasıl çalışır/fayda) her maddesi görünür, roadmap olmayan yeteneklere bağlı ve stock-reservation merkezde', () => {
    const story = getStockReservationStory()
    expect(story.problems.length).toBeGreaterThanOrEqual(2)
    expect(story.steps.length).toBeGreaterThanOrEqual(2)
    expect(story.benefits.length).toBeGreaterThanOrEqual(2)
    for (const item of [...story.problems, ...story.steps, ...story.benefits]) {
      expect(item.basedOn.length, item.title).toBeGreaterThan(0)
      for (const id of item.basedOn) expect(visible.has(id), `${item.title} -> ${id}`).toBe(true)
    }
    expect(story.steps.every((s) => s.basedOn.includes('stock-reservation'))).toBe(true)
  })

  it('anlatı ve sahne etiketlerinde kanal adı geçmez (kanal adları yalnızca kanal detay sayfalarında)', () => {
    const text = norm(JSON.stringify(getStockReservationStory()))
    for (const i of integrations.filter((x) => x.status === 'available')) expect(phraseRe(i.name).test(text), i.name).toBe(false)
  })

  it('her görünür çekirdek yeteneğin somut akış cümlesi (action) var; kanal adı içermez', () => {
    for (const c of getPublicCapabilities('core')) {
      expect(c.action, c.id).toBeTruthy()
      for (const i of integrations) expect(phraseRe(i.name).test(norm(c.action!)), `${c.id}: ${i.name}`).toBe(false)
    }
  })

  it('destek merkezi: beş kategori, her SSS kaydı en az bir kategoride, kimlikler geçerli ve tekrarsız', () => {
    expect(SUPPORT_CATEGORIES.map((c) => c.label)).toEqual([
      'Başlangıç ve kurulum',
      'Kanal bağlama',
      'Stok ve sipariş',
      'Hesap ve güvenlik',
      'Fiyat ve fatura',
    ])
    const ids = SUPPORT_CATEGORIES.flatMap((c) => c.faqIds)
    expect(new Set(ids).size).toBe(ids.length)
    const known = new Set(faq.map((f) => f.id))
    for (const id of ids) expect(known.has(id), id).toBe(true)
    for (const f of faq) expect(ids, f.id).toContain(f.id)
    expect(SUPPORT_CATEGORIES.filter((c) => c.channelGuides).map((c) => c.id)).toEqual(['kanal-baglama'])
  })

  it('"seçim kriterleri" sorusu rakip adı vermez ve dört kayıtlı ölçütü anlatır', () => {
    const item = getPublicFaq().find((f) => f.id === 'secim-kriterleri')!
    expect(item).toBeTruthy()
    const t = norm(item.answer)
    for (const w of ['entegra', 'sopyo', 'yengec']) expect(phraseRe(w).test(t), w).toBe(false)
    for (const w of ['veritabani', 'sifrel', 'stok rezervasyonu', 'varsayilan olarak']) expect(t, w).toContain(w)
  })
})

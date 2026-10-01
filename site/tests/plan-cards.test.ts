/**
 * S27b — tek plan kartı kaydı (`src/data/plan-cards.ts`): anasayfa planlar bölümü ve `/fiyatlandirma` aynı seçiciyi
 * kullanır; değerler seed'den (uydurma fiyat/indirim yok), Otopilot (K46) her kartta, güven unsurları kayıttan.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPlanCards, getPlanTrustPoints, getBillingIntervals, RECOMMENDED_PLAN_CODE } from '../src/data/plan-cards'
import { getPublicPlans, getPublicTrial, getTrialPlanCode } from '../src/data/plans'
import { getPublicIntegrations } from '../src/data/integrations'
import { AGENT_BRAND } from '../src/data/agent-brand'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(path.join(siteRoot, p), 'utf8')

describe('plan kartı kaydı', () => {
  const plans = getPublicPlans()
  const cards = getPlanCards()

  it('her yayımlanmış plan için bir kart; fiyat/limit/KDV seed seçicisiyle birebir', () => {
    expect(cards.map((c) => c.code)).toEqual(plans.map((p) => p.code))
    cards.forEach((c, i) => {
      const p = plans[i]
      expect(c.price.label).toBe(p.priceLabel)
      expect(c.price.period).toBe(p.periodLabel)
      if (p.priceKind === 'fixed') expect(c.price.amount).toBe(Math.round(p.priceMinor / 100))
      expect(c.limits.map((l) => l.value)).toEqual(p.limits.map((l) => l.value))
    })
  })

  it('uydurma fiyat/indirim yok: kartlarda yüzde, "indirim", üstü çizili/eski fiyat alanı bulunmaz', () => {
    const text = JSON.stringify(cards).toLocaleLowerCase('tr-TR')
    for (const w of ['%', 'indirim', 'kampanya', 'yerine', 'tasarruf']) expect(text, w).not.toContain(w)
  })

  it('önerilen plan tek ve tasarım kararıdır (istatistik iddiası yok)', () => {
    expect(cards.filter((c) => c.recommended).map((c) => c.code)).toEqual([RECOMMENDED_PLAN_CODE])
    expect(JSON.stringify(cards).toLocaleLowerCase('tr-TR')).not.toMatch(/en popüler|en çok tercih/)
  })

  it('deneme yalnız seed deneme planında; aralık geçişi yalnız seed birden fazla aralık içerirse', () => {
    const trialCode = getTrialPlanCode()
    expect(cards.filter((c) => c.trial).map((c) => c.code)).toEqual(trialCode ? [trialCode] : [])
    expect(getBillingIntervals()).toEqual([...new Set(plans.filter((p) => p.priceKind === 'fixed').map((p) => p.interval))])
  })

  it('K46: Otopilot her kartta; alt plan "sınırlı", üst planlar öncekine ek olarak; kredi/token/sınırsız dili yok', () => {
    for (const c of cards) expect(c.agent?.title).toContain(AGENT_BRAND)
    expect(cards[0].agent?.items.join(' ')).toMatch(/Sınırlı/)
    expect(cards.slice(1).every((c) => c.agent?.previous)).toBe(true)
    const text = JSON.stringify(cards).toLocaleLowerCase('tr-TR')
    for (const w of ['kredi', 'token', 'sınırsız', 'ücretsiz yapay zek']) expect(text, w).not.toContain(w)
  })

  it('CTA: deneme planları uygulamaya kayıt sorgusuyla, teklif planı /iletisim (kayıt bağlantısı üretmez)', () => {
    for (const c of cards) {
      if (c.cta.kind === 'trial') expect(c.cta.href).toMatch(new RegExp(`/login\\?mode=register&plan=${c.code}&interval=${c.interval}$`))
      else expect(c.cta.href === undefined || c.cta.href === '/iletisim').toBe(true)
    }
  })

  it('fiyat sayfası kartları bu kayıttan çizer (anasayfa planlar bölümü S27a ile aynı kayda bağlanır)', () => {
    expect(read('src/pages/fiyatlandirma.astro')).toMatch(/getPlanCards\(/)
  })
})

describe('taslak fiyat notu (N4): ziyaretçi dili + iç kayıt ayrı', () => {
  it('görünür metin iç süreç adı içermez; iç kayıt PROPOSAL_NOTICE ile birebir', async () => {
    const { getPlanNotice, PROPOSAL_VISITOR_NOTICE } = await import('../src/data/plan-cards')
    const { PROPOSAL_NOTICE, defaultPlanSource } = await import('../src/data/plans')
    const n = getPlanNotice()
    if (!defaultPlanSource.proposal) return expect(n).toBeUndefined()
    expect(n!.internal).toBe(PROPOSAL_NOTICE)
    expect(n!.visitor.startsWith(PROPOSAL_VISITOR_NOTICE)).toBe(true)
    expect(n!.visitor).not.toMatch(/ADR|insan kararı|ÖNERİ|Açık Soru/)
  })
})

describe('güven unsurları kayıttan', () => {
  const points = getPlanTrustPoints()
  const by = (id: string) => points.find((p) => p.id === id)

  it('deneme süresi ve kart şartı seed deneme bloğundan', () => {
    const t = getPublicTrial()
    expect(by('trial')?.meta).toBe(`${t.days} gün`)
    expect(Boolean(by('card'))).toBe(!t.cardRequired)
  })

  it('kanal sayısı canlı entegrasyon kaydından', () => {
    expect(by('channels')?.meta).toBe(`${getPublicIntegrations().length} kanal`)
  })

  it('her öğenin kaynağı var; sahte müşteri/rakam dili yok', () => {
    for (const p of points) expect(p.source).toBeTruthy()
    const text = JSON.stringify(points).toLocaleLowerCase('tr-TR')
    for (const w of ['müşteri', 'binlerce', 'memnun', '%']) expect(text, w).not.toContain(w)
  })
})

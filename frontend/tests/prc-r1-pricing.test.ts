import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyCostEdits, buyboxFilterFromParams, buyboxPageRequest, changedCosts, costBaseline, coverageView, defaultVariantId,
  groupBuyboxByProduct, marginView, normalizeCost, refreshInfo, saveCostEdits, sparkModel, summarizeBuybox, toResult,
  type BuyboxRow, type HistoryPoint, type MarginItem,
} from '../src/composables/usePricingApi'
import { applyBulk, BASE_COLUMNS, coerce, validateCell } from '../src/components/productDefinitions/variants/grid/variantSheet'
import { SCREENS, parseUrlParams, pickUrlParams } from '../src/navigation/screens'

const root = resolve(__dirname, '..')
const row = (status: BuyboxRow['status'], over: Partial<BuyboxRow> = {}): BuyboxRow => ({
  variantId: 'v' + Math.random(), productId: 'p1', barcode: 'b', sku: 's', status, buyboxOrder: null, buyboxPrice: null, hasMultipleSeller: null,
  ownPrice: null, gapAmount: null, gapPercent: null, checkedAt: null, nextRefreshAt: null, overdue: false, fresh: false, lostAt: null, ...over,
})

describe('PRC-R1 rozet özeti', () => {
  it('herhangi bir varyant losing ise uyarı', () => {
    const s = summarizeBuybox([row('winning'), row('losing'), row('not_found')], true)
    expect(s).toMatchObject({ kind: 'losing', losing: 1, total: 3 })
  })
  it('hepsi winning ise "sizde"; karışık/okunmamış/bulunamadı gösterilmez', () => {
    expect(summarizeBuybox([row('winning'), row('winning')], true).kind).toBe('winning')
    expect(summarizeBuybox([row('winning'), row('unchecked')], true).kind).toBe('none')
    expect(summarizeBuybox([row('not_found')], true).kind).toBe('none')
    expect(summarizeBuybox([row('unchecked')], true).kind).toBe('none')
  })
  it('özellik kapalıysa ya da satır yoksa rozet yok', () => {
    expect(summarizeBuybox([row('losing')], false).kind).toBe('none')
    expect(summarizeBuybox([], true).kind).toBe('none')
    expect(summarizeBuybox(undefined, true).kind).toBe('none')
  })
  it('ürüne göre gruplar; sayfa isteği ≤100 kimlik ve limit 200', () => {
    const g = groupBuyboxByProduct([row('losing', { productId: 'a' }), row('winning', { productId: 'a' }), row('winning', { productId: 'b' }), row('winning', { productId: null })])
    expect(Object.keys(g).sort()).toEqual(['a', 'b'])
    expect(g.a).toHaveLength(2)
    const req = buyboxPageRequest(Array.from({ length: 150 }, (_, i) => String(i)))
    expect(req.productIds).toHaveLength(100)
    expect(req.limit).toBe(200)
  })
})

describe('PRC-R1 filtre ↔ URL eşlemesi', () => {
  it('buybox + barcode parametreleri filtreye dönüşür', () => {
    expect(buyboxFilterFromParams({ buybox: 'losing', barcode: '868123' })).toEqual({ buyboxStatus: 'losing', barcode: '868123' })
    expect(buyboxFilterFromParams({ buybox: ['not_found'] })).toEqual({ buyboxStatus: 'not_found' })
  })
  it('bilinmeyen değer ve tek başına barkod yok sayılır', () => {
    expect(buyboxFilterFromParams({ buybox: 'hack' })).toEqual({})
    expect(buyboxFilterFromParams({ barcode: '123' })).toEqual({})
    expect(buyboxFilterFromParams({ buybox: 'losing', barcode: 'a b' })).toEqual({ buyboxStatus: 'losing' })
    expect(buyboxFilterFromParams(undefined)).toEqual({})
  })
  it('ürün listesi ekranı bu parametreleri URL kaydında taşır (screens.ts)', () => {
    const screen = SCREENS.find((s) => s.key === 'productDefinitions/ProductListView')!
    expect(screen.urlParams?.map((p) => p.name)).toEqual(['buybox', 'barcode'])
    expect(pickUrlParams(screen, { buybox: 'losing', barcode: '868', junk: 'x' })).toEqual({ buybox: 'losing', barcode: '868' })
    expect(pickUrlParams(screen, { buybox: 'nope' })).toEqual({})
    expect(parseUrlParams(screen, { buybox: 'losing', barcode: '868' })).toEqual({ buybox: 'losing', barcode: '868' })
    expect(parseUrlParams(screen, { buybox: 'losing,unknown' })).toEqual({ buybox: 'losing' })
  })
})

describe('PRC-R0 değişen maliyet hesabı', () => {
  const variants = () => [
    { _id: 'a', costPrice: 10 },
    { _id: 'b' },
    { _id: 'c', costPrice: 5.5 },
    { _id: 'd', costPrice: 7 },
  ]
  it('normalize: boş/geçersiz → null, 0 geçerli, 2 hane', () => {
    expect(normalizeCost(undefined)).toBeNull()
    expect(normalizeCost('')).toBeNull()
    expect(normalizeCost(-1)).toBeNull()
    expect(normalizeCost(0)).toBe(0)
    expect(normalizeCost('12,345')).toBe(12.35)
  })
  it('yalnız DEĞİŞENLER gönderilir; silme null', () => {
    const base = costBaseline(variants())
    const now = variants()
    now[0].costPrice = 10 // değişmedi
    ;(now[1] as any).costPrice = 3 // yeni maliyet
    now[2].costPrice = undefined as any // silindi
    now[3].costPrice = 7.001 // 2 haneye yuvarlanınca aynı
    const d = changedCosts(base, now)
    expect(d.items).toEqual([{ variantId: 'b', costPrice: 3 }, { variantId: 'c', costPrice: null }])
    expect(d.skippedNoBarcode).toBe(0)
  })
  it('boştan 0 girmek değişikliktir (0 ≠ yok)', () => {
    const d = changedCosts({ b: null }, [{ _id: 'b', costPrice: 0 }])
    expect(d.items).toEqual([{ variantId: 'b', costPrice: 0 }])
  })
  it('değişiklik yoksa hiçbir şey gönderilmez', () => {
    const v = variants()
    expect(changedCosts(costBaseline(v), v).items).toEqual([])
  })
  it('yeni (kimliksiz) varyant: maliyet girilmişse barkodla; barkodsuz sayılır', () => {
    const d = changedCosts({}, [{ barcode: '111', costPrice: 4 }, { barcode: '', costPrice: 9 }, { barcode: '222' }])
    expect(d.items).toEqual([{ barcode: '111', costPrice: 4 }])
    expect(d.skippedNoBarcode).toBe(1)
  })
  it('kayıt yanıtı formu ezse de yazılan maliyet geri uygulanır', () => {
    const serverVariants: any[] = [{ _id: 'a', costPrice: 1 }, { _id: 'z', barcode: '999' }]
    applyCostEdits(serverVariants, [{ variantId: 'a', costPrice: 8 }, { barcode: '999', costPrice: 2 }])
    expect(serverVariants.map((v) => v.costPrice)).toEqual([8, 2])
  })
})

describe('PRC-R0 maliyet kaydı sonucu (varyant kaydından AYRI, açık bildirim)', () => {
  const ok = (updated: number, notFound: any[] = []) => ({ ok: true as const, data: { updated, unchanged: 0, notFound, changes: [], coverage: { total: 4, withCost: 2, percent: 50, stale: 0 } } })
  it('kalem yoksa çağrı yapılmaz', async () => {
    const fn = vi.fn()
    expect(await saveCostEdits(fn, { items: [], skippedNoBarcode: 0 })).toEqual({ status: 'none' })
    expect(fn).not.toHaveBeenCalled()
  })
  it('başarı: sayım + kapsam', async () => {
    const o = await saveCostEdits(async () => ok(2), { items: [{ variantId: 'a', costPrice: 1 }, { variantId: 'b', costPrice: 2 }], skippedNoBarcode: 0 })
    expect(o).toMatchObject({ status: 'ok', updated: 2 })
  })
  it('bulunamayanlar kısmi başarı sayılır', async () => {
    const o = await saveCostEdits(async () => ok(1, [{ variantId: 'x' }]), { items: [{ variantId: 'a', costPrice: 1 }], skippedNoBarcode: 0 })
    expect(o).toEqual({ status: 'partial', updated: 1, notFound: 1 })
  })
  it('hata: failed + neden; 500lük parçalar, ilk hatada durur', async () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ variantId: 'v' + i, costPrice: 1 }))
    const fn = vi.fn().mockResolvedValueOnce(ok(500)).mockResolvedValueOnce({ ok: false, reason: 'unauthorized' })
    expect(await saveCostEdits(fn, { items, skippedNoBarcode: 0 })).toEqual({ status: 'failed', reason: 'unauthorized', updated: 500 })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[0][0]).toHaveLength(500)
  })
  it('API zarfı: 403 yetkisiz, diğer hata genel, geçersiz gövde hata', () => {
    expect(toResult({ isAxiosError: true, response: { status: 403 } }, () => true)).toEqual({ ok: false, reason: 'unauthorized' })
    expect(toResult({ isAxiosError: true, response: { status: 500 } }, () => true)).toEqual({ ok: false, reason: 'error' })
    expect(toResult({ x: 1 }, () => false)).toEqual({ ok: false, reason: 'error' })
    expect(toResult({ x: 1 }, () => true)).toMatchObject({ ok: true })
  })
  it('kapsam göstergesi', () => {
    expect(coverageView({ total: 10, withCost: 7, percent: 70, stale: 0 })).toEqual({ percent: 70, complete: false, empty: false })
    expect(coverageView({ total: 10, withCost: 10, percent: 100, stale: 0 })?.complete).toBe(true)
    expect(coverageView({ total: 0, withCost: 0, percent: 0, stale: 0 })?.empty).toBe(true)
    expect(coverageView(null)).toBeNull()
  })
})

describe('PRC-R0 ızgara maliyet kolonu (moneyOpt)', () => {
  it('kolon tanımlı, sonda ve isteğe bağlı para', () => {
    const c = BASE_COLUMNS[BASE_COLUMNS.length - 1]
    expect(c).toMatchObject({ key: 'costPrice', kind: 'moneyOpt' })
  })
  it('boş = null (0 değil); geçersiz/negatif/aşırı hata', () => {
    expect(coerce('moneyOpt', '')).toEqual({ value: null })
    expect(coerce('moneyOpt', '12,5')).toEqual({ value: 12.5 })
    expect(coerce('money', '')).toEqual({ value: 0 })
    expect('error' in coerce('moneyOpt', 'abc')).toBe(true)
    expect('error' in coerce('moneyOpt', '-1')).toBe(true)
    expect('error' in coerce('moneyOpt', '10000001')).toBe(true)
  })
  it('toplu: temizle null yapar; boş maliyette yüzde/tutar uydurulmaz', () => {
    expect(applyBulk('moneyOpt', 10, { mode: 'clear', value: '' })).toEqual({ value: null })
    expect('error' in applyBulk('moneyOpt', null, { mode: 'percent', value: '10' })).toBe(true)
    expect(applyBulk('moneyOpt', 100, { mode: 'percent', value: '10' })).toEqual({ value: 110 })
    expect(applyBulk('moneyOpt', null, { mode: 'set', value: '5' })).toEqual({ value: 5 })
  })
  it('doğrulama: boş maliyet sorun değil, geçersiz hata', () => {
    const col = BASE_COLUMNS.find((c) => c.key === 'costPrice')!
    const dup = { barcode: new Set<string>(), stockcode: new Set<string>() }
    expect(validateCell({ costPrice: undefined }, col, dup)).toBeNull()
    expect(validateCell({ costPrice: 5 }, col, dup)).toBeNull()
    expect(validateCell({ costPrice: -3 }, col, dup)?.level).toBe('error')
  })
})

describe('PRC-R1 kâr paneli durumları', () => {
  const full = (): MarginItem => ({
    variantId: 'v1', barcode: 'b1', found: true, ownPrice: 120,
    buybox: { status: 'losing', order: 3, price: 100, hasMultipleSeller: true, observedAt: '2026-10-01T10:00:00Z', ageMinutes: 20, fresh: true },
    gap: { amount: 20, percent: 20 },
    current: { price: 120, net: 100, salesVat: 20, profit: 30, marginPercent: 25, confidence: 'estimated', missing: [] },
    atBuybox: { price: 100, net: 80, salesVat: 16, profit: 4, marginPercent: 4, confidence: 'estimated', missing: [] },
    breakEvenPrice: 95, buyboxBelowFloor: false, commission: { rate: 12, source: 'actual' }, cost: { price: 50, updatedAt: null }, vatRate: 20,
    rulesEligible: true, ineligibleReasons: [],
  })
  it('tam veri: değerler olduğu gibi', () => {
    const v = marginView(full())
    expect(v).toMatchObject({ status: 'losing', order: 3, buyboxPrice: 100, ownPrice: 120, gapAmount: 20, gapPercent: 20, profitNow: 30, profitAtBuybox: 4, breakEven: 95, commissionSource: 'actual', belowFloor: false, costMissing: false, stale: false })
  })
  it('maliyet yok: kâr null (0 DEĞİL), uygunluk kapalı, maliyet eksik bayrağı', () => {
    const i = full()
    i.cost = { price: null, updatedAt: null }
    i.current = { ...i.current!, profit: null, confidence: 'unknown', missing: ['cost'] }
    i.atBuybox = { ...i.atBuybox!, profit: null, confidence: 'unknown', missing: ['cost'] }
    i.breakEvenPrice = null
    i.rulesEligible = false
    i.ineligibleReasons = ['cost_missing']
    const v = marginView(i)
    expect(v.profitNow).toBeNull()
    expect(v.profitAtBuybox).toBeNull()
    expect(v.breakEven).toBeNull()
    expect(v.costMissing).toBe(true)
    expect(v.missing).toEqual(['cost'])
    expect(v.rulesEligible).toBe(false)
  })
  it('maliyeti 0 olan varyant "eksik" sayılmaz', () => {
    const i = full()
    i.cost = { price: 0, updatedAt: null }
    expect(marginView(i).costMissing).toBe(false)
  })
  it('buybox tabanın altında bayrağı ve bayat veri etiketi', () => {
    const i = full()
    i.buyboxBelowFloor = true
    i.buybox!.fresh = false
    const v = marginView(i)
    expect(v.belowFloor).toBe(true)
    expect(v.stale).toBe(true)
  })
  it('okunmamış buybox bayat sayılmaz; kayıt yoksa güvenli varsayılanlar', () => {
    const i = full()
    i.buybox = { status: 'unchecked', order: null, price: null, hasMultipleSeller: null, observedAt: null, ageMinutes: null, fresh: false }
    expect(marginView(i).stale).toBe(false)
    const none = marginView(undefined)
    expect(none).toMatchObject({ found: false, status: 'unchecked', profitNow: null, buyboxPrice: null, commissionSource: 'unknown', rulesEligible: false })
  })
  it('kısmi güven + eksik bileşenler tekilleştirilir', () => {
    const i = full()
    i.current = { ...i.current!, confidence: 'partial', missing: ['shipping', 'withholding'] }
    i.atBuybox = { ...i.atBuybox!, confidence: 'partial', missing: ['shipping'] }
    const v = marginView(i)
    expect(v.partial).toBe(true)
    expect(v.missing.sort()).toEqual(['shipping', 'withholding'])
  })
  it('varsayılan varyant: önce kaybedilen', () => {
    const a = full(); a.variantId = 'a'; a.buybox!.status = 'winning'
    const b = full(); b.variantId = 'b'
    expect(defaultVariantId([a, b])).toBe('b')
    expect(defaultVariantId([a])).toBe('a')
    expect(defaultVariantId([{ variantId: 'x', barcode: null, found: false }])).toBeNull()
  })
})

describe('PRC-R1 tazeleme zamanı dürüst gösterimi', () => {
  it('özellik kapalı / tazeleme kapalı → off; okunmamış → pending; gecikmiş → overdue; planlı → scheduled', () => {
    const base = { checkedAt: '2026-10-01T10:00:00Z', nextRefreshAt: '2026-10-01T16:00:00Z', overdue: false }
    expect(refreshInfo(base, false).kind).toBe('off')
    expect(refreshInfo(undefined, true).kind).toBe('off')
    expect(refreshInfo({ ...base, checkedAt: null, nextRefreshAt: null }, true).kind).toBe('pending')
    expect(refreshInfo({ ...base, nextRefreshAt: null }, true).kind).toBe('off')
    expect(refreshInfo({ ...base, overdue: true }, true)).toEqual({ kind: 'overdue', at: base.nextRefreshAt })
    expect(refreshInfo(base, true)).toEqual({ kind: 'scheduled', at: base.nextRefreshAt })
  })
})

describe('PRC-R1 30 günlük sparkline', () => {
  const pt = (day: number, bb: number | null, own: number | null): HistoryPoint => ({ at: new Date(Date.UTC(2026, 8, day)).toISOString(), status: 'losing', buyboxOrder: 2, buyboxPrice: bb, ownPrice: own })
  it('boş/tek nokta → boş durum', () => {
    expect(sparkModel([], 300, 60).hasData).toBe(false)
    expect(sparkModel([pt(1, 100, null)], 300, 60).hasData).toBe(false)
  })
  it('iki çizgi ortak ölçekte; null noktada çizgi bölünür (0 çizilmez)', () => {
    const m = sparkModel([pt(1, 100, 120), pt(2, 90, 120), pt(3, null, 110), pt(4, 95, 110)], 300, 60)
    expect(m.hasData).toBe(true)
    expect(m.min).toBe(90)
    expect(m.max).toBe(120)
    expect(m.own.d.startsWith('M')).toBe(true)
    expect((m.own.d.match(/M/g) ?? []).length).toBe(1)
    expect((m.buybox.d.match(/M/g) ?? []).length).toBe(2) // 3. gün boş → ikinci parça
    expect(m.buybox.d).not.toContain('NaN')
  })
  it('tüm değerler eşitse düz çizgi ortada', () => {
    const m = sparkModel([pt(1, 100, 100), pt(2, 100, 100)], 300, 60)
    expect(m.hasData).toBe(true)
    expect(m.own.last?.y).toBe(30)
  })
})

describe('PRC-R1 kaynak sözleşmeleri', () => {
  const src = (f: string) => readFileSync(resolve(root, f), 'utf8')
  it('yalnız sözleşmedeki PricingService yöntemleri, doğrudan literal çağrı (operation-policy taraması)', () => {
    const t = src('src/composables/usePricingApi.ts')
    const calls = [...t.matchAll(/restApi\.post\('(PricingService\/[A-Za-z]+)'/g)].map((m) => m[1]).sort()
    expect(calls).toEqual(['PricingService/getBuyboxHistory', 'PricingService/listBuybox', 'PricingService/listCosts', 'PricingService/previewMargin', 'PricingService/setVariantCosts'])
  })
  it('TR ve EN çeviri anahtarları aynı', () => {
    const keys = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]))
    const tr = JSON.parse(src('src/plugins/locales/tr.json')).pricing
    const en = JSON.parse(src('src/plugins/locales/en.json')).pricing
    expect(keys(en).sort()).toEqual(keys(tr).sort())
  })
  it('diğer kanallar "desteklenmiyor" yazar, "yakında" yazmaz (K57-S1)', () => {
    const tr = src('src/plugins/locales/tr.json')
    const block = JSON.parse(tr).pricing
    expect(block.level.not_supported).toBe('Desteklenmiyor')
    expect(JSON.stringify(block).toLowerCase()).not.toContain('yakında')
  })
  it('maliyet genel kayıttan ayrı çağrıyla yazılır (iki ekran da useCostSave kullanır)', () => {
    expect(src('src/views/secure/definitions/ProductUpdateView.vue')).toContain('costSave.persist')
    expect(src('src/views/secure/definitions/ProductDefinitionView.vue')).toContain("costSave.persist(undefined, costDiff, 'create')")
  })
})

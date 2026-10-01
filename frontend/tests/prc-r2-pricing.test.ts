/**
 * PRC-R2 — fiyat kuralları ekranı (saf yardımcılar + kaynak sözleşmeleri). Hukuk: K1 (fark > 0 ipucu), K4 (boş form), K6 (rakip alanı yok),
 * K11 ("indirim" dili yok), otomatik uygulama yok (uygulama yalnız onay penceresinden). Backend aynı kuralları ayrıca zorlar.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  emptyRuleForm, formFromRule, parseBarcodes, previewRows, reasonKey, ruleRequest, selectableIds, stateBanner, validateRuleForm, warningKey,
  type PlatformLimits, type PriceRule, type Suggestion,
} from '../src/composables/usePricingRulesApi'
import { SCREENS, parseUrlParams } from '../src/navigation/screens'

const root = resolve(__dirname, '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const LIMITS: PlatformLimits = { maxIncreasePercentPerDay: 10, maxIncreasePercent30d: 25, maxChangesPerDay: 24, minCooldownMin: 15, maxDropPercent: 50 }

const filled = () => ({
  ...emptyRuleForm(), name: 'Buybox altı', mode: 'below' as const, deltaAmount: 1, floorMarginPercent: 10, ceiling: 500, step: 0.01,
  maxChangesPerDay: 6, cooldownMin: 30, maxIncreasePercentPerDay: 5,
})

const sug = (over: Partial<Suggestion> = {}): Suggestion => ({
  id: 's1', ruleId: 'r1', ruleVersion: 1, integrationCode: 'trendyol', variantId: 'v1', productId: 'p1', barcode: '8690000000101', sku: 'SK-1',
  status: 'open', beforePrice: 249.9, afterPrice: 218.9, listPrice: 299.9, floor: 150, ceiling: 400, profitBefore: 60, profitAfter: 40,
  buyboxPrice: 219.9, buyboxOrder: 3, buyboxObservedAt: '2026-10-01T09:40:00.000Z', reasons: ['mode_below'], warnings: [], blockedReason: null,
  closedReason: null, createdAt: null, updatedAt: null, appliedAt: null, lowestPrice10d: 239.9, ...over,
})

describe('legal-K4-seller-values: form alanları BOŞ gelir (önerilen değer yok)', () => {
  it('yeni kural formunda yön ve tüm sayısal alanlar boş; kural kapalı', () => {
    const f = emptyRuleForm()
    expect(f.mode).toBeNull()
    for (const k of ['deltaAmount', 'deltaPercent', 'floorMarginPercent', 'ceiling', 'step', 'maxChangesPerDay', 'cooldownMin', 'maxIncreasePercentPerDay'] as const) expect(f[k]).toBeNull()
    expect(f.enabled).toBe(false)
    expect(validateRuleForm(f, LIMITS)).toEqual(expect.arrayContaining(['name', 'mode', 'delta_required', 'floorMarginPercent', 'ceiling', 'step', 'maxChangesPerDay', 'cooldownMin', 'maxIncreasePercentPerDay']))
  })
})

describe('legal-K1-no-equalize: fark > 0 (istemci ipucu; sunucu ayrıca reddeder)', () => {
  it('0 ve 0\'a yuvarlanan fark reddedilir; 0,01 TL ya da %0,1 geçer', () => {
    expect(validateRuleForm({ ...filled(), deltaAmount: 0 }, LIMITS)).toContain('k1_equalize')
    expect(validateRuleForm({ ...filled(), deltaAmount: 0.004 }, LIMITS)).toContain('k1_equalize')
    expect(validateRuleForm({ ...filled(), deltaAmount: null, deltaPercent: 0.04 }, LIMITS)).toContain('k1_equalize')
    expect(validateRuleForm({ ...filled(), deltaAmount: null }, LIMITS)).toContain('delta_required')
    expect(validateRuleForm(filled(), LIMITS)).toEqual([])
    expect(validateRuleForm({ ...filled(), deltaAmount: null, deltaPercent: 0.1 }, LIMITS)).toEqual([])
  })
  it('platform sınırları formda da uygulanır', () => {
    expect(validateRuleForm({ ...filled(), maxIncreasePercentPerDay: 11 }, LIMITS)).toContain('maxIncreasePercentPerDay')
    expect(validateRuleForm({ ...filled(), maxChangesPerDay: 25 }, LIMITS)).toContain('maxChangesPerDay')
    expect(validateRuleForm({ ...filled(), cooldownMin: 10 }, LIMITS)).toContain('cooldownMin')
  })
})

describe('legal-K6-no-competitor-field: istek gövdesi yalnız şema alanları', () => {
  it('saveRule gövdesi rakip/satıcı/mağaza alanı taşımaz; kanal Trendyol; barkod kapsamı isteğe bağlı', () => {
    const body = ruleRequest({ ...filled(), barcodes: '8690001, 8690002 8690001' })
    expect(Object.keys(body).sort()).toEqual(['competition', 'enabled', 'integrationCode', 'name', 'scope'])
    expect(body.scope).toEqual({ barcodes: ['8690001', '8690002'] })
    expect(Object.keys(body.competition).sort()).toEqual(['ceiling', 'cooldownMin', 'deltaAmount', 'deltaPercent', 'excludeIfOutOfStock', 'floorMarginPercent', 'maxChangesPerDay', 'maxIncreasePercentPerDay', 'mode', 'step'])
    expect(JSON.stringify(body)).not.toMatch(/seller|store|merchant|competitor|rakip|mağaza/i)
    expect(ruleRequest(filled())).not.toHaveProperty('scope')
  })
  it('düzenleme: kural → form → istek gidiş-dönüşü kimliği korur', () => {
    const r: PriceRule = {
      id: 'r1', type: 'competition', name: 'X', enabled: true, version: 2, integrationCode: 'trendyol', scope: { productIds: [], barcodes: ['a'] },
      competition: { mode: 'above', deltaAmount: null, deltaPercent: 1, floorMarginPercent: 5, ceiling: 300, step: 0.1, maxChangesPerDay: 4, cooldownMin: 60, maxIncreasePercentPerDay: 3, excludeIfOutOfStock: true },
      pausedReason: null, pausedAt: null, updatedAt: null, suggestions: { open: 0, blocked: 0 },
    }
    const back = ruleRequest(formFromRule(r))
    expect(back).toMatchObject({ id: 'r1', scope: { barcodes: ['a'] }, competition: r.competition })
    expect(parseBarcodes(' a ;b,,c ')).toEqual(['a', 'b', 'c'])
  })
})

describe('onay penceresi: seçim ve önizleme', () => {
  it('yalnız açık öneriler seçilir, en çok applyMax', () => {
    const items = [sug({ id: 'a' }), sug({ id: 'b', status: 'blocked', afterPrice: null }), sug({ id: 'c' })]
    expect(selectableIds(items, ['a', 'b', 'c', 'x'], 50)).toEqual(['a', 'c'])
    expect(selectableIds(items, ['a', 'c'], 1)).toEqual(['a'])
  })
  it('önizleme önce → sonra ve değişimi gösterir (sunucu fiyatı aynen)', () => {
    expect(previewRows([sug()], ['s1'])).toEqual([{ id: 's1', barcode: '8690000000101', sku: 'SK-1', before: 249.9, after: 218.9, change: -31, changePercent: -12.4, warnings: [] }])
    expect(previewRows([sug({ afterPrice: null })], ['s1'])).toEqual([])
  })
  it('neden/uyarı kodları i18n anahtarına çevrilir; bilinmeyen kod ham gösterilmez', () => {
    expect(reasonKey('below_floor')).toBe('pricingRules.reason.below_floor')
    expect(reasonKey('fuse_equals_buybox')).toBe('pricingRules.reason.fuse')
    expect(reasonKey('not_open_applied')).toBe('pricingRules.reason.not_open')
    expect(reasonKey('weird')).toBe('pricingRules.reason.unknown')
    expect(warningKey('increase_capped')).toBe('pricingRules.warning.increase_capped')
  })
  it('durum bandı: platform kapalı > metin bekliyor > tenant kapalı > buybox kapalı > açık', () => {
    expect(stateBanner({ platformEnabled: false, competitionEnabled: true, active: false, inactiveReason: 'platform_disabled' })).toBe('platform_off')
    expect(stateBanner({ platformEnabled: true, competitionEnabled: true, active: false, inactiveReason: 'consent_required' })).toBe('needs_consent')
    expect(stateBanner({ platformEnabled: true, competitionEnabled: true, active: false, inactiveReason: 'tenant_disabled' })).toBe('needs_enable')
    expect(stateBanner({ platformEnabled: true, competitionEnabled: false, active: true, inactiveReason: null })).toBe('competition_off')
    expect(stateBanner({ platformEnabled: true, competitionEnabled: true, active: true, inactiveReason: null })).toBe('active')
  })
})

describe('legal-K11-no-discount-language: metinler "fiyat güncellendi" der, "indirim" demez', () => {
  const tr = JSON.parse(read('src/plugins/locales/tr.json'))
  const en = JSON.parse(read('src/plugins/locales/en.json'))
  const flat = (o: Record<string, unknown>, p = ''): Record<string, string> => Object.entries(o).reduce((acc, [k, v]) => (typeof v === 'object' && v
    ? { ...acc, ...flat(v as Record<string, unknown>, `${p}${k}.`) } : { ...acc, [`${p}${k}`]: String(v) }), {} as Record<string, string>)
  it('pricingRules metinlerinde "indirim"/"discount" yok; uygulama sonucu "fiyat güncellendi"', () => {
    for (const [k, v] of Object.entries(flat(tr.pricingRules))) expect([k, /indirim/i.test(v)]).toEqual([k, false])
    for (const [k, v] of Object.entries(flat(en.pricingRules))) expect([k, /discount/i.test(v)]).toEqual([k, false])
    expect(tr.pricingRules.apply.done).toMatch(/fiyatı güncellendi/)
  })
  it('TR ve EN anahtarları birebir; menü başlığı var', () => {
    expect(Object.keys(flat(en.pricingRules)).sort()).toEqual(Object.keys(flat(tr.pricingRules)).sort())
    expect(tr.menu.pricingRules).toBe('Fiyat kuralları')
    expect(en.menu.pricingRules).toBe('Pricing rules')
  })
  it('legal-K1-no-equalize: fark alanı ipucu eşitleme yapılmadığını söyler', () => {
    expect(tr.pricingRules.form.deltaHint).toMatch(/eşitleme yapılmaz/)
    expect(tr.pricingRules.form.noSeller).toMatch(/belirli bir satıcıyı hedefleyemez/)
  })
})

describe('kaynak sözleşmeleri', () => {
  const view = read('src/views/secure/pricing/PricingRulesView.vue')
  const api = read('src/composables/usePricingRulesApi.ts')
  it('ekran anahtarı kayıtlı (backend yetenek ui ekranı `pricing/PricingRulesView`); URL parametreleri yalnız kimlik/sekme', () => {
    const s = SCREENS.find((x) => x.key === 'pricing/PricingRulesView')
    expect(s).toMatchObject({ slug: 'catalog/pricing-rules', section: 'catalog', titleKey: 'menu.pricingRules' })
    expect(parseUrlParams(s!, { rule: '650000000000000000000001', tab: 'rules', x: '1' })).toEqual({ rule: '650000000000000000000001', tab: 'rules' })
    expect(parseUrlParams(s!, { tab: 'hack' })).toEqual({})
    expect(read('src/stores/site/menu.ts')).toContain("['pricing/PricingRulesView', shallowRef(")
  })
  it('RPC adları düz metin (operasyon envanteri); otomatik uygulama yok — apply yalnız onay penceresinin confirm olayından', () => {
    for (const op of ['getRules', 'saveRule', 'deleteRule', 'setPricingSettings', 'listSuggestions', 'getPriceHistory', 'applySuggestions', 'dismissSuggestions']) {
      expect(api).toContain(`'PricingService/${op}'`)
    }
    expect(view.match(/api\.apply\(/g)).toHaveLength(1)
    expect(view).toMatch(/async function doApply\(\)/)
    expect(view).toMatch(/data-testid="apply-dialog" @confirm="doApply"/)
    expect(view).not.toMatch(/onMounted\([^)]*doApply|watch\([^)]*doApply|setInterval/)
  })
  it('legal-K3: açma yalnız metin + çift motor onayıyla; taslak etiketi gösterilir', () => {
    expect(view).toMatch(/:submit-disabled="!consentAccepted \|\| !dualAck"/)
    expect(view).toContain('data-testid="consent-draft"')
  })
})

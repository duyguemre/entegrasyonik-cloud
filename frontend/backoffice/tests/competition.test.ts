// PRC-CFG rekabet ayarları: saf mantık (istisna formu, plan tablosu taslağı, dikkat uyarıları), sahte API sözleşmesi (uç şekilleri,
// sınırlar, gerekçe, önce/sonra, step-up YOK) ve ekran durumu (useCompetition: yükleniyor → hazır → hata, istisna akışı).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import { REAUTH_OPS, type CompetitionLimits, type ConfigRevision } from '../src/api/contract'
import {
  BUDGET_LOW,
  SHADOW_LONG_DAYS,
  beforeAfterRows,
  checkOverrideDraft,
  competitionAttention,
  describeOverride,
  emptyOverrideDraft,
  flagOnSince,
  parsePlanKey,
  parseTidParam,
  planTableChanges,
  refreshHint,
  validateInt,
  validatePricingForm,
  type CompetitionStatus,
} from '../src/views/settings/competitionLogic'

// `@bo/api` tek api örneğini dışa verir; testte sahte sunucuya bağlı örnekle değiştirilir (ekran durumu testleri için).
const holder = vi.hoisted(() => ({ api: null as unknown, server: null as unknown }))
vi.mock('@bo/api', () => ({ get api() { return holder.api } }))

const LIMITS: CompetitionLimits = { skuCap: { min: 0, max: 50_000 }, refreshMin: { min: 15, max: 1440 }, freshnessMin: { min: 5, max: 1440 }, budgetPerMin: { min: 1, max: 1000 } }
const PRIOS = ['changed_first', 'stocked_only', 'oldest_first']
const REASON = 'Pilot müşteri için kapsam genişletildi'
const DAY = 86_400_000

async function signedIn(opts: { reauth?: boolean } = {}) {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  if (opts.reauth === false) server.expireReauth()
  return { api, server }
}

describe('saf mantık: sayı denetimi ve gösterim', () => {
  it('refreshHint: 360 dk = günde 4; tam bölünmeyen ondalıklı; geçersiz → boş', () => {
    expect(refreshHint(360)).toBe('günde 4')
    expect(refreshHint(30)).toBe('günde 48')
    expect(refreshHint(1440)).toBe('günde 1')
    expect(refreshHint(1000)).toBe('günde ~1,4')
    expect(refreshHint(0)).toBe('')
    expect(refreshHint(null)).toBe('')
  })
  it('validateInt: tam sayı ve sunucu sınırı', () => {
    expect(validateInt('SKU', 100, LIMITS.skuCap)).toBeNull()
    expect(validateInt('SKU', 0, LIMITS.skuCap)).toBeNull()
    expect(validateInt('SKU', 50_001, LIMITS.skuCap)).toMatch(/0–50\.000 arasında/)
    expect(validateInt('Tazeleme', 14, LIMITS.refreshMin)).toMatch(/15–1\.440 arasında/)
    expect(validateInt('SKU', 1.5, LIMITS.skuCap)).toMatch(/tam sayı/)
    expect(validateInt('SKU', null, LIMITS.skuCap)).toMatch(/tam sayı/)
  })
  it('parseTidParam yalnız pozitif tam sayı', () => {
    expect(parseTidParam('101')).toBe(101)
    expect(parseTidParam(['7', '8'])).toBe(7)
    for (const bad of ['0', '-1', 'abc', '1e3', '', undefined, null, '12345678901234']) expect(parseTidParam(bad)).toBeNull()
  })
})

describe('plan tablosu → taslak', () => {
  const published = {
    'pricing.buybox.plan.starter.skuCap': 100,
    'pricing.buybox.plan.starter.priority': 'changed_first',
    'pricing.buybox.plan.growth.refreshMin': 30,
    'pricing.buybox.plan.enterprise.skuCap': 5000,
    'pricing.buybox.budget.trendyol.perMin': 60,
    'support.email': 'a@b.test',
  }
  it('parsePlanKey yalnız plan anahtarlarını tanır', () => {
    expect(parsePlanKey('pricing.buybox.plan.growth.freshnessMin')).toEqual({ plan: 'growth', field: 'freshnessMin' })
    expect(parsePlanKey('pricing.buybox.budget.trendyol.perMin')).toBeNull()
    expect(parsePlanKey('pricing.buybox.plan.gold.skuCap')).toBeNull()
  })
  it('yalnız değişen plan hücreleri; plan sırası + alan sırası; plan dışı anahtar yok sayılır', () => {
    const form = { ...published, 'pricing.buybox.plan.enterprise.skuCap': 8000, 'pricing.buybox.plan.starter.priority': 'stocked_only', 'pricing.buybox.plan.starter.skuCap': 150, 'pricing.buybox.budget.trendyol.perMin': 90, 'support.email': 'x@y.test' }
    expect(planTableChanges(published, form).map((c) => [c.plan, c.field, c.from, c.to])).toEqual([
      ['starter', 'skuCap', 100, 150],
      ['starter', 'priority', 'changed_first', 'stocked_only'],
      ['enterprise', 'skuCap', 5000, 8000],
    ])
    expect(planTableChanges(published, { ...published })).toEqual([])
  })
  it('validatePricingForm: sınır dışı, tam sayı değil, geçersiz politika, bütçe 0', () => {
    const ok = validatePricingForm({ ...published }, LIMITS, PRIOS)
    expect(ok).toEqual({})
    const bad = validatePricingForm(
      { ...published, 'pricing.buybox.plan.starter.skuCap': 60_000, 'pricing.buybox.plan.growth.refreshMin': 10, 'pricing.buybox.plan.starter.priority': 'x', 'pricing.buybox.budget.trendyol.perMin': 0 },
      LIMITS,
      PRIOS,
    )
    expect(Object.keys(bad).sort()).toEqual(['pricing.buybox.budget.trendyol.perMin', 'pricing.buybox.plan.growth.refreshMin', 'pricing.buybox.plan.starter.priority', 'pricing.buybox.plan.starter.skuCap'])
    expect(bad['pricing.buybox.plan.growth.refreshMin']).toMatch(/Büyüme · Tazeleme aralığı: 15–1\.440/)
  })
})

describe('istisna formu doğrulaması', () => {
  it('boş form: istisna yok (kaydetmek kaldırmakla aynı), geçerli', () => {
    const c = checkOverrideDraft(emptyOverrideDraft(), LIMITS, PRIOS)
    expect(c).toMatchObject({ isEmpty: true, valid: true, override: {} })
  })
  it('yalnız dolu alanlar istisna olur; boşluklar kırpılır; boş alan plan değeri', () => {
    const c = checkOverrideDraft({ ...emptyOverrideDraft(), skuCap: ' 2500 ', priority: 'stocked_only' }, LIMITS, PRIOS)
    expect(c.override).toEqual({ skuCap: 2500, priority: 'stocked_only' })
    expect(c.valid).toBe(true)
    expect(c.isEmpty).toBe(false)
  })
  it('sınırlar limits değerinden gelir (sabit değil); 0 SKU geçerli (izleme kapalı)', () => {
    expect(checkOverrideDraft({ ...emptyOverrideDraft(), skuCap: '0' }, LIMITS, PRIOS).override).toEqual({ skuCap: 0 })
    const tight: CompetitionLimits = { ...LIMITS, skuCap: { min: 10, max: 20 } }
    expect(checkOverrideDraft({ ...emptyOverrideDraft(), skuCap: '5' }, tight, PRIOS).errors.skuCap).toMatch(/10–20/)
  })
  it('hatalar alan bazında: ondalık/harf, aralık dışı, bilinmeyen politika, uzun not', () => {
    const c = checkOverrideDraft({ skuCap: '1.5', refreshMin: '10', freshnessMin: 'abc', priority: 'x' as never, note: 'n'.repeat(281) }, LIMITS, PRIOS)
    expect(c.valid).toBe(false)
    expect(Object.keys(c.errors).sort()).toEqual(['freshnessMin', 'note', 'priority', 'refreshMin', 'skuCap'])
    expect(c.errors.refreshMin).toMatch(/15–1\.440/)
  })
  it('describeOverride ve beforeAfterRows: değişen alan işaretlenir, boş alan "plan değeri"', () => {
    expect(describeOverride({ skuCap: 2500, priority: 'stocked_only' }).map((d) => `${d.label}: ${d.value}`)).toEqual(['SKU tavanı: 2.500 SKU', 'Öncelik politikası: Yalnız stoklu'])
    const eff = { plan: 'growth', planCode: 'growth', skuCap: 1000, refreshMin: 30, freshnessMin: 30, priority: 'changed_first', sources: { skuCap: 'plan', refreshMin: 'plan', freshnessMin: 'plan', priority: 'plan' } } as const
    const rows = beforeAfterRows({ skuCap: 2500 }, {}, eff)
    expect(rows.find((r) => r.field === 'skuCap')).toMatchObject({ before: '2.500 SKU', after: 'plan değeri (1.000 SKU)', changed: true })
    expect(rows.find((r) => r.field === 'refreshMin')).toMatchObject({ before: 'plan değeri', changed: false })
  })
})

describe('durum ve dikkat uyarıları', () => {
  const NOW = Date.parse('2026-10-20T10:00:00Z')
  const base: CompetitionStatus = { enabled: true, pilotTenants: ['101'], budget: 60, shadow: true, overrideCount: 0 }
  const ids = (s: CompetitionStatus, since: number | null = null) => competitionAttention(s, since, NOW).map((a) => a.id)

  it('varsayılan güvenli durum (açık, bütçe 60, gölge açık, yeni) uyarı üretmez', () => {
    expect(ids(base, NOW - 2 * DAY)).toEqual([])
  })
  it('bayrak açık + bütçe çok düşük / çok yüksek', () => {
    expect(ids({ ...base, budget: BUDGET_LOW - 1 })).toEqual(['budget-low'])
    expect(ids({ ...base, budget: BUDGET_LOW })).toEqual([])
    expect(ids({ ...base, budget: 600 })).toEqual(['budget-high'])
  })
  it('bayrak kapalıyken bütçe uyarısı yok; istisna varsa bilgi notu', () => {
    expect(ids({ ...base, enabled: false, budget: 1 })).toEqual([])
    expect(ids({ ...base, enabled: false, overrideCount: 2 })).toEqual(['overrides-idle'])
  })
  it(`gölge mod ${SHADOW_LONG_DAYS}+ gündür açık → uyarı; yeni açıldıysa ya da açılış zamanı bilinmiyorsa yok; kapalıysa yok`, () => {
    expect(ids(base, NOW - SHADOW_LONG_DAYS * DAY)).toEqual(['shadow-long'])
    expect(ids(base, NOW - (SHADOW_LONG_DAYS - 1) * DAY)).toEqual([])
    expect(ids(base, null)).toEqual([])
    expect(ids({ ...base, shadow: false }, NOW - 40 * DAY)).toEqual([])
    expect(competitionAttention(base, NOW - 20 * DAY, NOW)[0].title).toBe('Bildirim gölge modu 20 gündür açık')
  })
  it('flagOnSince: bayrağı açan en yeni yayın sürümünün zamanı', () => {
    const rev = (version: number, at: string | null, to: unknown): ConfigRevision =>
      ({ version, status: 'superseded', createdBy: null, createdAt: at ?? '', publishedBy: null, publishedAt: at, reason: null, diff: [{ key: 'features.competition', from: !to, to, danger: 'safe' }], origin: 'manual', approvedBy: null })
    expect(flagOnSince([])).toBeNull()
    expect(flagOnSince([rev(3, '2026-10-05T00:00:00Z', false), rev(2, '2026-10-01T00:00:00Z', true)])).toBe(Date.parse('2026-10-01T00:00:00Z'))
    expect(flagOnSince([rev(5, '2026-10-09T00:00:00Z', true), rev(2, '2026-10-01T00:00:00Z', true)])).toBe(Date.parse('2026-10-09T00:00:00Z'))
  })
})

describe('sahte API sözleşmesi: rekabet uçları', () => {
  it('getCompetitionSettings: şekil, plan varsayılanları, bütçe, gölge, sınırlar, örnek istisnalar', async () => {
    const { api } = await signedIn()
    const s = await api.call('BackofficeBillingService/getCompetitionSettings', {})
    expect(Object.keys(s).sort()).toEqual(['budgets', 'limits', 'notify', 'overrides', 'plans', 'priorities'])
    expect(s.plans.map((p) => [p.plan, p.skuCap, p.refreshMin, p.freshnessMin, p.priority])).toEqual([
      ['starter', 100, 360, 30, 'changed_first'],
      ['growth', 1000, 30, 30, 'changed_first'],
      ['enterprise', 5000, 30, 30, 'changed_first'],
    ])
    expect(s.plans[0].keys.skuCap).toBe('pricing.buybox.plan.starter.skuCap')
    expect(s.budgets).toEqual([{ channel: 'trendyol', perMin: 60, key: 'pricing.buybox.budget.trendyol.perMin' }])
    expect(s.notify).toEqual({ shadow: true, cooldownHours: 24 })
    expect(s.limits).toEqual(LIMITS)
    expect(s.priorities).toEqual(PRIOS)
    expect(s.overrides.map((o) => o.tid)).toEqual([101, 104])
    const o = s.overrides[0]
    expect(Object.keys(o).sort()).toEqual(['effective', 'note', 'override', 'planCode', 'tenantName', 'tid', 'updatedAt'])
    expect(o.effective).toMatchObject({ plan: 'growth', skuCap: 2500, priority: 'stocked_only', refreshMin: 30, sources: { skuCap: 'tenant', priority: 'tenant', refreshMin: 'plan', freshnessMin: 'plan' } })
  })

  it('plan tablosu taslağı: saveDraft → önizleme farkı yalnız değişen anahtarlar → yayın → uçlarda yeni değer', async () => {
    const { api } = await signedIn()
    await api.call('IntegrationConfigService/saveDraft', { target: '_platform', patch: { 'pricing.buybox.plan.enterprise.skuCap': 8000, 'pricing.buybox.budget.trendyol.perMin': 120 } })
    const prev = await api.call('IntegrationConfigService/previewPublish', { target: '_platform' })
    expect(prev.diff.map((d) => [d.key, d.to])).toEqual([['pricing.buybox.budget.trendyol.perMin', 120], ['pricing.buybox.plan.enterprise.skuCap', 8000]])
    expect(prev.danger).toBe('caution') // bütçe: pazaryeri kotası
    await api.call('IntegrationConfigService/publish', { target: '_platform', reason: REASON })
    const s = await api.call('BackofficeBillingService/getCompetitionSettings', {})
    expect(s.plans.find((p) => p.plan === 'enterprise')?.skuCap).toBe(8000)
    expect(s.budgets[0].perMin).toBe(120)
    // 102 kurumsal planda ve istisnası yok → etkin değer yeni plan değerini izler (yeniden başlatmasız).
    const t = await api.call('BackofficeBillingService/getTenantCompetition', { tid: 102 })
    expect(t.effective).toMatchObject({ plan: 'enterprise', skuCap: 8000 })
    expect(t.effective.sources.skuCap).toBe('plan')
  })

  it('plan anahtarı sınır dışıysa saveDraft 400 VALIDATION ve hata alanın yolunu taşır', async () => {
    const { api } = await signedIn()
    const err = await api.call('IntegrationConfigService/saveDraft', { target: '_platform', patch: { 'pricing.buybox.plan.starter.refreshMin': 5, 'pricing.buybox.plan.growth.priority': 'rastgele' } }).catch((e) => e)
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION' })
    expect(err.fields.map((f: { path: string }) => f.path).sort()).toEqual(['pricing.buybox.plan.growth.priority', 'pricing.buybox.plan.starter.refreshMin'])
  })

  it('getTenantCompetition: mevcut etkin ayar + istisna; bilinmeyen tid 404 SUBSCRIPTION_NOT_FOUND; muaf tenant Büyüme değeri', async () => {
    const { api } = await signedIn()
    const t = await api.call('BackofficeBillingService/getTenantCompetition', { tid: 104 })
    expect(t).toMatchObject({ tid: 104, billingExempt: true, override: { refreshMin: 60 }, effective: { plan: 'growth', refreshMin: 60 } })
    await expect(api.call('BackofficeBillingService/getTenantCompetition', { tid: 99999 })).rejects.toMatchObject({ status: 404, code: 'SUBSCRIPTION_NOT_FOUND' })
    await expect(api.call('BackofficeBillingService/getTenantCompetition', { tid: 0 })).rejects.toMatchObject({ status: 400 })
  })

  it('setCompetitionOverride: gerekçe ≥10, sınırlar, bilinmeyen alan; önce/sonra; kaldırma; step-up İSTENMEZ', async () => {
    const { api } = await signedIn({ reauth: false })
    const S = 'BackofficeBillingService/setCompetitionOverride' as const
    await expect(api.call(S, { tid: 103, override: { skuCap: 300 }, reason: 'kısa' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    const bad = await api.call(S, { tid: 103, override: { skuCap: 99_999, refreshMin: 5 }, reason: REASON }).catch((e) => e)
    expect(bad).toMatchObject({ status: 400, code: 'VALIDATION' })
    expect(bad.fields.map((f: { path: string }) => f.path).sort()).toEqual(['override.refreshMin', 'override.skuCap'])
    await expect(api.call(S, { tid: 103, override: { renk: 1 } as never, reason: REASON })).rejects.toMatchObject({ status: 400 })
    await expect(api.call(S, { tid: 99999, override: { skuCap: 1 }, reason: REASON })).rejects.toMatchObject({ status: 404 })

    const r = await api.call(S, { tid: 103, override: { skuCap: 300, priority: 'oldest_first' }, note: 'Deneme müşterisi', reason: REASON })
    expect(r).toMatchObject({ tid: 103, cleared: false, before: {}, after: { skuCap: 300, priority: 'oldest_first' } })
    expect(r.effective).toMatchObject({ plan: 'starter', skuCap: 300, refreshMin: 360, sources: { skuCap: 'tenant', refreshMin: 'plan' } })
    const list = await api.call('BackofficeBillingService/getCompetitionSettings', {})
    expect(list.overrides.map((o) => o.tid)).toEqual([101, 103, 104])
    expect(list.overrides.find((o) => o.tid === 103)?.note).toBe('Deneme müşterisi')

    const cleared = await api.call(S, { tid: 103, override: null, reason: REASON })
    expect(cleared).toMatchObject({ cleared: true, before: { skuCap: 300, priority: 'oldest_first' }, after: {} })
    expect(cleared.effective.sources).toEqual({ skuCap: 'plan', refreshMin: 'plan', freshnessMin: 'plan', priority: 'plan' })
    expect((await api.call('BackofficeBillingService/getCompetitionSettings', {})).overrides.map((o) => o.tid)).toEqual([101, 104])
  })

  it('backend REAUTH_RPCS ile uyum: istisna ucu step-up listesinde DEĞİL (yetenek: write, destructive değil)', () => {
    expect(REAUTH_OPS as readonly string[]).not.toContain('BackofficeBillingService/setCompetitionOverride')
    const backend = readFileSync(join(__dirname, '../../../backend/src/api/admin/stepUp.ts'), 'utf8')
    expect(backend).not.toContain('setCompetitionOverride')
  })
})

describe('ekran durumu: useCompetition (sahte sunucu + gerçek composable)', () => {
  beforeEach(async () => {
    const s = await signedIn()
    holder.api = s.api
    holder.server = s.server
  })
  async function mount() {
    const { usePlatformConfig } = await import('../src/views/settings/usePlatformConfig')
    const { useCompetition } = await import('../src/views/settings/useCompetition')
    const { reactive } = await import('vue')
    const platform = usePlatformConfig()
    const cfg = reactive(platform)
    const state = useCompetition(cfg)
    return { platform, cfg, state, cs: reactive(state) }
  }

  it('yükleniyor → hazır: durum kutuları yayındaki değerlerden; özellik kapalıyken istisna notu', async () => {
    const { cfg, state, cs } = await mount()
    expect(cfg.phase).toBe('loading')
    expect(cs.comp.phase).toBe('loading')
    await state.load()
    expect(cfg.phase).toBe('ready')
    expect(cs.comp.phase).toBe('ready')
    expect(cs.status).toEqual({ enabled: false, pilotTenants: [], budget: 60, shadow: true, overrideCount: 2 })
    expect(cs.flagDefined).toBe(true)
    expect(cs.hasCatalog).toBe(true)
    expect(cs.attention.map((a) => a.id)).toEqual(['overrides-idle'])
    expect(cs.pendingKeys).toEqual([])
  })

  it('pilot açık + eski bayrak + bütçe düşük → dikkat listesi; bütçe/plan hücresi düzenlenince bekleyen değişiklik sayılır', async () => {
    ;(holder.server as MockAdminServer).seedCompetitionPilot({ tenants: ['101'], budget: 10, daysAgo: 30 })
    const { cfg, state, cs } = await mount()
    await state.load()
    expect(cs.status).toMatchObject({ enabled: true, pilotTenants: ['101'], budget: 10 })
    expect(cs.attention.map((a) => a.id).sort()).toEqual(['budget-low', 'shadow-long'])
    cfg.form['pricing.buybox.plan.growth.skuCap'] = 2000
    cfg.form['pricing.buybox.notify.shadow'] = false
    cfg.form['support.email'] = 'baska@ornek.test'
    expect(cs.pendingKeys.sort()).toEqual(['pricing.buybox.notify.shadow', 'pricing.buybox.plan.growth.skuCap'])
  })

  it('hata: istisna ucu düşerse plan/durum bölümü çalışır, istisna bölümü error + yeniden deneme', async () => {
    ;(holder.server as MockAdminServer).failOps('BackofficeBillingService/getCompetitionSettings')
    const { state, cs } = await mount()
    await state.load()
    expect(cs.cfg.phase).toBe('ready')
    expect(cs.comp.phase).toBe('error')
    expect(cs.comp.error?.message).toMatch(/—/) // "<ne oldu> — <ne yapılmalı>"
    expect(cs.comp.error?.message).not.toMatch(/INTERNAL|Error:/)
    ;(holder.server as MockAdminServer).failOps(null)
    await cs.comp.load()
    expect(cs.comp.phase).toBe('ready')
  })

  it('istisna düzenleyici: numara → ayarını getir (mevcut + plan değeri) → alanlar → kaydet → önce/sonra', async () => {
    const { state, cs } = await mount()
    await state.load()
    cs.openEditor(101, 'Pilot müşteri')
    expect(cs.save.isOpen).toBe(true)
    await vi.waitFor(() => expect(cs.lookupPhase).toBe('ready'))
    expect(cs.draft).toMatchObject({ skuCap: '2500', priority: 'stocked_only', refreshMin: '' })
    expect(cs.draft.note).toMatch(/katalog büyük/)
    expect(cs.planRow).toMatchObject({ plan: 'growth', skuCap: 1000 })
    expect(cs.hadOverride).toBe(true)
    expect(cs.tenantLabel?.tid).toBe(101)

    cs.draft.skuCap = '3000'
    cs.draft.refreshMin = '45'
    expect(cs.check.valid).toBe(true)
    expect(cs.willClear).toBe(false)
    await state.save.confirm('kısa')
    expect(state.save.error.value?.message).toMatch(/en az 10 karakter/)
    expect(cs.lastChange).toBeNull()

    await state.save.confirm(REASON)
    expect(cs.save.isOpen).toBe(false)
    expect(cs.lastChange).toMatchObject({ tid: 101, cleared: false, before: { skuCap: 2500, priority: 'stocked_only' }, after: { skuCap: 3000, refreshMin: 45, priority: 'stocked_only' } })
    await vi.waitFor(() => expect(cs.comp.data?.overrides.find((o) => o.tid === 101)?.override.skuCap).toBe(3000))
  })

  it('yeni müşteri: bilinmeyen numara anlaşılır hata; alanlar boşken kaydetmek anlamsız, kaldırma yalnız mevcut istisnada', async () => {
    const { state, cs } = await mount()
    await state.load()
    cs.openEditor()
    expect(cs.lookupPhase).toBe('idle')
    cs.onTidInput('99999')
    await cs.lookup()
    expect(cs.lookupPhase).toBe('error')
    expect(cs.lookupError?.message).toBe('Bu numarada abonelik bulunamadı — numarayı müşteri listesinden kontrol edin.')
    cs.onTidInput('abc')
    await cs.lookup()
    expect(cs.lookupError?.message).toMatch(/geçersiz/)

    cs.onTidInput('103')
    await cs.lookup()
    expect(cs.lookupPhase).toBe('ready')
    expect(cs.hadOverride).toBe(false)
    expect(cs.check.isEmpty).toBe(true)
    expect(cs.willClear).toBe(false)

    // mevcut istisnayı boşaltmak = kaldırma
    cs.onTidInput('104')
    await cs.lookup()
    expect(cs.draft.refreshMin).toBe('60')
    cs.clearFields()
    expect(cs.willClear).toBe(true)
    await state.save.confirm(REASON)
    expect(cs.lastChange).toMatchObject({ tid: 104, cleared: true, before: { refreshMin: 60 }, after: {} })
  })
})

describe('statik: Platform ayarları panelinde rekabet grubu çift görünmez; ekran kaydı', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', 'src', p), 'utf8')
  it('PlatformSettingsPanel grup listesi platform.pricing içermez; rekabet ekranı ayrı kayıtlı', () => {
    expect(src('views/settings/PlatformSettingsPanel.vue')).not.toContain('platform.pricing')
    expect(src('views/settings/MaintenanceCard.vue')).not.toContain('platform.pricing')
    const screens = src('navigation/screens.ts')
    expect(screens).toContain("path: '/sistem/rekabet'")
    expect(screens).toContain("view: () => import('../views/settings/CompetitionSettingsView.vue')")
  })
  it('müşteri/abonelik detayından rekabet ekranına bağlantı var (?tid=)', () => {
    expect(src('views/billing/SubscriptionDetailView.vue')).toContain('/sistem/rekabet?tid=')
  })
})

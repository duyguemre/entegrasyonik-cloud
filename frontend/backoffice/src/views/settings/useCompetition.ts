/**
 * Rekabet ayarları ekranının durumu. İki kaynak birlikte çalışır:
 *  - `cfg` (usePlatformConfig): plan varsayılanları, bütçe, gölge mod, bayrak — MEVCUT `_platform` taslak → yayın akışı (ADR-0031).
 *  - `comp` (getCompetitionSettings): tenant istisnaları + sınırlar. Bir kaynağın hatası ötekini düşürmez.
 * İstisna düzenleme: `getTenantCompetition` ile mevcut etkin ayar → alanlar → `setCompetitionOverride` (gerekçe ≥10; step-up YOK:
 * backend REAUTH_RPCS'te değil; yeniden doğrulama gerekirse istemci zaten diyalog açar).
 */
import { computed, reactive, ref, shallowRef, type UnwrapNestedRefs } from 'vue'
import { api } from '@bo/api'
import type { CatalogItem, GetCompetitionSettingsResponse, GetTenantCompetitionResponse, SetCompetitionOverrideResponse } from '@bo/api/contract'
import type { CompetitionLimits } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import { describeError, type DescribedError } from '@bo/utils/errors'
import { notify } from '@bo/utils/toast'
import type { PlatformConfig } from './usePlatformConfig'
import {
  BUDGET_KEY,
  FLAG_KEY,
  FLAG_TENANTS_KEY,
  PRICING_GROUP,
  SHADOW_KEY,
  checkOverrideDraft,
  competitionAttention,
  draftFromOverride,
  emptyOverrideDraft,
  flagOnSince,
  parsePlanKey,
  type CompetitionStatus,
} from './competitionLogic'

export const DEFAULT_PRIORITIES = ['changed_first', 'stocked_only', 'oldest_first'] as const

/** Katalogdaki `safeRange`'lerden sınırlar (istisna uçları yüklenmeden plan tablosu için erken denetim). */
export function limitsFromCatalog(catalog: CatalogItem[]): CompetitionLimits | null {
  const range = (key: string) => catalog.find((c) => c.key === key)?.safeRange ?? null
  const skuCap = range('pricing.buybox.plan.starter.skuCap')
  const refreshMin = range('pricing.buybox.plan.starter.refreshMin')
  const freshnessMin = range('pricing.buybox.plan.starter.freshnessMin')
  const budgetPerMin = range(BUDGET_KEY)
  return skuCap && refreshMin && freshnessMin && budgetPerMin ? { skuCap, refreshMin, freshnessMin, budgetPerMin } : null
}

export function useCompetition(cfg: PlatformConfig) {
  const comp = useResource<GetCompetitionSettingsResponse>(() => api.call('BackofficeBillingService/getCompetitionSettings', {}))

  const pricingItems = computed(() => cfg.catalogOf(PRICING_GROUP))
  const hasCatalog = computed(() => pricingItems.value.length > 0)
  const limits = computed<CompetitionLimits | null>(() => comp.data.value?.limits ?? limitsFromCatalog(cfg.data?.catalog ?? []))
  const priorities = computed<readonly string[]>(() => comp.data.value?.priorities ?? DEFAULT_PRIORITIES)

  const published = (key: string) => cfg.data?.values[key]?.value
  const status = computed<CompetitionStatus>(() => {
    const budget = published(BUDGET_KEY)
    const shadow = published(SHADOW_KEY)
    const tenants = published(FLAG_TENANTS_KEY)
    return {
      enabled: published(FLAG_KEY) === true,
      pilotTenants: Array.isArray(tenants) ? (tenants as string[]) : [],
      budget: typeof budget === 'number' ? budget : null,
      shadow: typeof shadow === 'boolean' ? shadow : null,
      overrideCount: comp.data.value?.overrides.length ?? 0,
    }
  })
  const flagDefined = computed(() => (cfg.data?.catalog ?? []).some((c) => c.key === FLAG_KEY))
  const attention = computed(() => competitionAttention(status.value, flagOnSince(cfg.data?.history ?? []), Date.now()))

  /** Bekleyen (kaydedilmemiş) rekabet değişiklikleri: plan hücreleri + bütçe + gölge mod. */
  const pendingKeys = computed(() => cfg.changedKeys.filter((k) => parsePlanKey(k) || k === BUDGET_KEY || k === SHADOW_KEY))

  async function load() {
    await Promise.all([cfg.load(), comp.load()])
  }

  // -------------------------------------------------------------- istisna düzenleyici
  const draft = reactive(emptyOverrideDraft())
  const tidText = ref('')
  const lookupPhase = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const lookupError = shallowRef<DescribedError | null>(null)
  const tenant = shallowRef<GetTenantCompetitionResponse | null>(null)
  const lastChange = shallowRef<SetCompetitionOverrideResponse | null>(null)
  const lastChangeName = ref<string | null>(null)
  let lookupSeq = 0

  const tid = computed(() => (/^\d{1,12}$/.test(tidText.value.trim()) ? Number(tidText.value.trim()) : null))
  const planRow = computed(() => comp.data.value?.plans.find((p) => p.plan === tenant.value?.effective.plan) ?? null)
  const check = computed(() => checkOverrideDraft(draft, limits.value ?? { skuCap: { min: 0, max: 0 }, refreshMin: { min: 0, max: 0 }, freshnessMin: { min: 0, max: 0 }, budgetPerMin: { min: 0, max: 0 } }, priorities.value))
  const hadOverride = computed(() => !!tenant.value && Object.keys(tenant.value.override).length > 0)
  const willClear = computed(() => check.value.isEmpty && hadOverride.value)
  const noteInDraft = computed(() => draft.note.trim())

  async function lookup() {
    const id = tid.value
    if (id === null) {
      lookupPhase.value = 'error'
      lookupError.value = { ...describeError(null), kind: 'validation', title: 'Müşteri numarası geçersiz', action: 'Pozitif bir tam sayı girin.', message: 'Müşteri numarası geçersiz — pozitif bir tam sayı girin.', retryable: false }
      tenant.value = null
      return
    }
    const my = ++lookupSeq
    lookupPhase.value = 'loading'
    lookupError.value = null
    try {
      const t = await api.call('BackofficeBillingService/getTenantCompetition', { tid: id })
      if (my !== lookupSeq) return
      tenant.value = t
      lookupPhase.value = 'ready'
      const row = comp.data.value?.overrides.find((o) => o.tid === id)
      Object.assign(draft, draftFromOverride(t.override, row?.note ?? draft.note))
    } catch (e) {
      if (my !== lookupSeq) return
      tenant.value = null
      lookupPhase.value = 'error'
      const d = describeError(e, { SUBSCRIPTION_NOT_FOUND: 'Bu numarada abonelik bulunamadı' })
      lookupError.value = d.code === 'SUBSCRIPTION_NOT_FOUND' ? { ...d, action: 'Numarayı müşteri listesinden kontrol edin.', message: 'Bu numarada abonelik bulunamadı — numarayı müşteri listesinden kontrol edin.' } : d
    }
  }

  function onTidInput(v: string) {
    tidText.value = v
    lookupSeq++
    tenant.value = null
    lookupPhase.value = 'idle'
    lookupError.value = null
  }

  const save = useGuardedAction(
    async (_ctx: { tid: number | null }, reason) => {
      const id = tid.value
      if (id === null || lookupPhase.value !== 'ready') throw new Error('lookup')
      return api.call('BackofficeBillingService/setCompetitionOverride', {
        tid: id,
        override: willClear.value || check.value.isEmpty ? null : check.value.override,
        ...(noteInDraft.value && !check.value.isEmpty ? { note: noteInDraft.value } : {}),
        reason,
      })
    },
    (r) => {
      lastChange.value = r
      lastChangeName.value = tenant.value ? (comp.data.value?.overrides.find((o) => o.tid === r.tid)?.tenantName ?? null) : null
      notify('success', r.cleared ? `#${r.tid} için istisna kaldırıldı; plan değerleri geçerli.` : `#${r.tid} için istisna kaydedildi; yeniden başlatma gerekmez.`)
      void comp.load()
    },
  )

  /** `id` verilirse numara dolu gelir ve mevcut ayar hemen okunur; verilmezse boş form (numara girilecek). */
  function openEditor(id?: number, note?: string | null) {
    Object.assign(draft, emptyOverrideDraft())
    if (note) draft.note = note
    tenant.value = null
    lookupError.value = null
    lookupPhase.value = 'idle'
    tidText.value = id ? String(id) : ''
    save.open({ tid: id ?? null })
    if (id) void lookup()
  }

  function clearFields() {
    Object.assign(draft, { ...emptyOverrideDraft(), note: '' })
  }

  const tenantLabel = computed(() => {
    const id = tid.value
    if (id === null || lookupPhase.value !== 'ready') return undefined
    const name = comp.data.value?.overrides.find((o) => o.tid === id)?.tenantName
    return { tid: id, name: name ?? `Müşteri #${id}` }
  })

  return {
    cfg, comp, pricingItems, hasCatalog, limits, priorities, status, flagDefined, attention, pendingKeys, load,
    draft, tidText, tid, lookupPhase, lookupError, tenant, planRow, check, hadOverride, willClear, lastChange, lastChangeName,
    lookup, onTidInput, save, openEditor, clearFields, tenantLabel,
  }
}

export type CompetitionState = UnwrapNestedRefs<ReturnType<typeof useCompetition>>

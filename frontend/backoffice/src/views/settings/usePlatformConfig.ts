/**
 * `_platform` ayarları için TEK yayın akışı (ADR-0031 BO-CFG-1): bakım kartı, platform ayarları ve bayraklar aynı
 * yerel form + aynı taslağı paylaşır.
 *   değiştir → `saveDraft` (VALIDATION alanın altında) → `previewPublish` (fark) → GuardedDialog ile `publish` (step-up + gerekçe)
 *   Taslağı at → onay diyaloğu (DraftBar) → `discardDraft`. Geçmişten `rollback` de aynı diyalog kalıbıyla.
 * Ortam (E) değerleri burada YOK: salt okunur, kaydetme isteğine girmez.
 * BO-WDG: yenileme kaydedilmemiş düzenlemeleri SİLMEZ (değişen alanlar yeni veriye taşınır); sunucu alan hatasında odak ilk
 * hatalı alana gider; sayfadan ayrılırken ekran `useLeaveGuard(changedKeys > 0)` ile sorar.
 */
import { computed, nextTick, reactive, ref, shallowRef, watch, type UnwrapNestedRefs } from 'vue'
import { api } from '@bo/api'
import { PLATFORM_TARGET, type CatalogItem, type ConfigRevision, type EffectiveValue, type PreviewPublishResponse } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import { describeError, type DescribedError } from '@bo/utils/errors'
import { notify } from '@bo/utils/toast'
import { remapError } from './remapError'

const PUBLISH_TITLES: Record<string, string> = {
  APPROVAL_REQUIRED: 'Bu değişiklik ikinci bir yöneticinin onayını gerektiriyor',
  PUBLISH_CONFLICT: 'Siz düzenlerken başka bir sürüm yayınlandı',
  DRAFT_CONFLICT: 'Taslak başka bir işlemle değişti',
}

export interface PlatformData {
  catalog: CatalogItem[]
  published: number
  values: Record<string, EffectiveValue>
  history: ConfigRevision[]
}

export function isSame(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function usePlatformConfig() {
  const res = useResource<PlatformData>(async () => {
    const [cat, eff, history] = await Promise.all([
      api.call('IntegrationConfigService/getCatalog', { target: PLATFORM_TARGET }),
      api.call('IntegrationConfigService/getEffectiveConfig', { target: PLATFORM_TARGET }),
      api.call('IntegrationConfigService/history', { target: PLATFORM_TARGET, limit: 20 }),
    ])
    return { catalog: cat.items, published: eff.publishedVersion, values: Object.fromEntries(eff.values.map((v) => [v.key, v])), history }
  })

  const form = reactive<Record<string, unknown>>({})
  const fieldErrors = reactive<Record<string, string>>({})
  const saving = ref(false)
  const saveError = shallowRef<DescribedError | null>(null)
  const draftRev = ref<number | null>(null)
  const preview = shallowRef<PreviewPublishResponse | null>(null)
  const patched = new Set<string>()

  function resetForm() {
    for (const k of Object.keys(form)) delete form[k]
    for (const c of res.data.value?.catalog ?? []) form[c.key] = res.data.value?.values[c.key]?.value ?? c.default
  }
  /**
   * Veri yenilenince form yeni yayın değerlerine kurulur, ama önceki veriye göre DEĞİŞTİRİLMİŞ alanlar korunur (Yenile / Alt+R
   * kaydedilmemiş işi sessizce silmesin). Bilinçli atma yalnız "Taslağı at" (onaylı) ile → `resetForm`.
   */
  const baseOf = (d: PlatformData, key: string) => d.values[key]?.value ?? d.catalog.find((c) => c.key === key)?.default
  /** Taslak atma çakışmasında yeniden yükleme düzenlemeleri de atmalı (kullanıcı atmayı onayladı). */
  let dropEditsOnLoad = false
  watch(res.data, (next, prev) => {
    const kept: Record<string, unknown> = {}
    if (prev && next && !dropEditsOnLoad) {
      for (const k of Object.keys(form)) {
        if (!isSame(form[k], baseOf(prev, k)) && next.catalog.some((c) => c.key === k)) kept[k] = form[k]
      }
    }
    dropEditsOnLoad = false
    resetForm()
    Object.assign(form, kept)
    const keptCount = next ? Object.keys(kept).filter((k) => !isSame(kept[k], baseOf(next, k))).length : 0
    if (keptCount) notify('info', `Değerler yenilendi; kaydedilmemiş ${keptCount} değişikliğiniz korundu.`)
  })

  const changedKeys = computed(() => Object.keys(form).filter((k) => !isSame(form[k], res.data.value?.values[k]?.value)))
  const isChanged = (key: string) => changedKeys.value.includes(key)
  const hasDraft = computed(() => draftRev.value !== null)

  /** Sunucu alan hatası → ilk hatalı alana odak (alanlar `[data-setting="<anahtar>"]` sarmalayıcısında). */
  async function focusFirstInvalid(keys: string[]) {
    await nextTick()
    if (typeof document === 'undefined') return
    for (const k of keys) {
      const sel = `[data-setting="${k.replace(/["\\]/g, '\\$&')}"]`
      const el = document.querySelector<HTMLElement>(`${sel} input:not([type="hidden"]), ${sel} textarea`)
      if (el) {
        el.scrollIntoView({ block: 'center' })
        el.focus({ preventScroll: true })
        return
      }
    }
  }

  function clearDraft() {
    draftRev.value = null
    preview.value = null
    patched.clear()
    saveError.value = null
    for (const k of Object.keys(fieldErrors)) delete fieldErrors[k]
  }

  async function saveAndPreview() {
    if (saving.value) return
    saving.value = true
    saveError.value = null
    for (const k of Object.keys(fieldErrors)) delete fieldErrors[k]
    try {
      const patch: Record<string, unknown> = {}
      const unset: string[] = []
      for (const k of changedKeys.value) patch[k] = form[k]
      // Taslakta daha önce yazılıp şimdi yayındaki değere döndürülen anahtarlar: taslaktan temizle.
      for (const k of patched) {
        if (k in patch) continue
        if (res.data.value?.values[k]?.source === 'default' || !res.data.value?.values[k]) unset.push(k)
        else patch[k] = res.data.value.values[k].value
      }
      const saved = await api.call('IntegrationConfigService/saveDraft', {
        target: PLATFORM_TARGET,
        patch,
        ...(unset.length ? { unset } : {}),
        ...(draftRev.value !== null ? { expectedDraftRev: draftRev.value } : {}),
      })
      draftRev.value = saved.draftRev
      for (const k of changedKeys.value) patched.add(k)
      preview.value = await api.call('IntegrationConfigService/previewPublish', { target: PLATFORM_TARGET })
      publish.open({})
    } catch (e) {
      const d = describeError(e)
      if (d.kind === 'validation' && d.fields?.length) {
        for (const f of d.fields) fieldErrors[f.path] = f.message
        saveError.value = { ...d, message: 'Bazı değerler geçersiz — işaretli alanları düzeltip yeniden deneyin.' }
        void focusFirstInvalid(d.fields.map((f) => f.path))
      } else {
        saveError.value = d
        if (d.kind === 'conflict') draftRev.value = null
      }
    } finally {
      saving.value = false
    }
  }

  const discarding = ref(false)
  async function discard() {
    if (discarding.value) return
    discarding.value = true
    try {
      if (draftRev.value !== null) await api.call('IntegrationConfigService/discardDraft', { target: PLATFORM_TARGET, expectedDraftRev: draftRev.value })
      clearDraft()
      resetForm()
      notify('info', 'Taslak atıldı; yayındaki değerler geçerli.')
    } catch (e) {
      const d = describeError(e)
      saveError.value = d
      if (d.kind === 'conflict' || d.kind === 'notFound') {
        clearDraft()
        dropEditsOnLoad = true
        await res.load()
      }
    } finally {
      discarding.value = false
    }
  }

  const publish = useGuardedAction(
    async (_ctx: Record<string, never>, reason) => {
      try {
        return await api.call('IntegrationConfigService/publish', { target: PLATFORM_TARGET, reason })
      } catch (e) {
        return remapError(e, PUBLISH_TITLES)
      }
    },
    (r) => {
      notify('success', `Sürüm ${r.publishedVersion} yayınlandı; değerler en geç ~45 sn içinde tüm uygulamalara ulaşır.`)
      clearDraft()
      void res.load()
    },
  )

  const rollback = useGuardedAction(
    async (rev: ConfigRevision, reason) => {
      try {
        return await api.call('IntegrationConfigService/rollback', { target: PLATFORM_TARGET, toVersion: rev.version, reason })
      } catch (e) {
        return remapError(e, PUBLISH_TITLES)
      }
    },
    (r, rev) => {
      notify('success', `Sürüm ${rev.version} içeriği yeni sürüm ${r.publishedVersion} olarak yayınlandı.`)
      clearDraft()
      void res.load()
    },
  )

  const catalogOf = (group: string) => (res.data.value?.catalog ?? []).filter((c) => c.group === group)

  return { ...res, form, fieldErrors, saving, saveError, draftRev, preview, hasDraft, changedKeys, isChanged, saveAndPreview, discard, discarding, publish, rollback, catalogOf }
}

export type PlatformConfig = UnwrapNestedRefs<ReturnType<typeof usePlatformConfig>>

export function formatValue(v: unknown): string {
  if (v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Açık' : 'Kapalı'
  if (v === '') return '(boş)'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(boş)'
  return String(v)
}
